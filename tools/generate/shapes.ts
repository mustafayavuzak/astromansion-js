// PATH: tools/generate/shapes.ts

/**
 * SHAPES: what stands behind each component schema, for the writers
 *
 * Purpose:
 *   A writer that meets a reference must know what the component is. The
 *   catalog answers from the document's components:
 *
 *     closed set   an enum             a union of its literals, an OpenSet in an answer
 *     any JSON     no typing keyword   JsonValue, never written as a type of its own
 *     shape        anything else       a type of its own, and a check when an answer reaches it
 *
 *   It also says which components an answer reaches. An answer is read
 *   tolerantly and its shapes get a check, while a request's shapes are
 *   only types.
 */

import { GeneratorError, type SchemaNode } from "./openApi.ts";

/** What a component schema can be. */
export const COMPONENT_KINDS = Object.freeze([
  "closedSet",
  "anyJson",
  "shape",
] as const);

/** One kind of COMPONENT_KINDS. */
export type ComponentKind = (typeof COMPONENT_KINDS)[number];

/**
 * The document's component schemas, and what each one is.
 *
 * @remarks
 * Built once per run from the checked document. It holds no state beyond
 * the components it was given. The class is closed to extension.
 *
 * @example
 * ```ts
 * const catalog = new ShapeCatalog(document.components);
 * catalog.kindOf("MoonPhase");     // "closedSet"
 * catalog.kindOf("JsonValue");     // "anyJson"
 * catalog.kindOf("BirthPayload");  // "shape"
 * ```
 */
export class ShapeCatalog {
  readonly #components: ReadonlyMap<string, SchemaNode>;

  /**
   * Keep the document's components.
   *
   * @param components - Every component schema, by its name.
   */
  constructor(components: ReadonlyMap<string, SchemaNode>) {
    this.#components = components;
  }

  /**
   * Find a component's schema.
   *
   * @param name - The component's name.
   * @returns Its schema.
   * @throws {@link GeneratorError} when no component has the name.
   */
  component(name: string): SchemaNode {
    const schema = this.#components.get(name);
    if (schema === undefined) {
      throw new GeneratorError(
        `a reference names ${name}, and no component has that name`,
      );
    }
    return schema;
  }

  /**
   * Tell what a component is.
   *
   * @param name - The component's name.
   * @returns A closed set for an enum, any JSON for a schema without a typing keyword, and a shape otherwise.
   * @throws {@link GeneratorError} when no component has the name.
   */
  kindOf(name: string): ComponentKind {
    const schema = this.component(name);
    if (schema.enumValues !== undefined) {
      return "closedSet";
    }
    return isAnyJson(schema) ? "anyJson" : "shape";
  }

  /**
   * Follow a reference to the schema it names, through any chain of references.
   *
   * @param schema - A schema, which may be a reference.
   * @returns The first schema of the chain that is not a reference.
   * @throws {@link GeneratorError} when the chain names a missing component or comes back to itself.
   */
  resolve(schema: SchemaNode): SchemaNode {
    const followed = new Set<string>();
    let current = schema;
    while (current.ref !== undefined) {
      if (followed.has(current.ref)) {
        throw new GeneratorError(
          `${schema.at} refers to itself through ${current.ref}`,
        );
      }
      followed.add(current.ref);
      current = this.component(current.ref);
    }
    return current;
  }

  /**
   * Name every component some schemas reach, through references at any depth.
   *
   * @param schemas - The schemas to start from.
   * @returns The components reached, each once.
   * @throws {@link GeneratorError} when a reference names a missing component.
   */
  reach(schemas: readonly SchemaNode[]): ReadonlySet<string> {
    const reached = new Set<string>();
    const pending = [...schemas];
    for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
      pending.push(...childrenOf(next));
      if (next.ref !== undefined && !reached.has(next.ref)) {
        reached.add(next.ref);
        pending.push(this.component(next.ref));
      }
    }
    return reached;
  }
}

/**
 * List the schemas directly inside a schema.
 *
 * @param schema - The schema.
 * @returns Its members' schemas, its other members' schema, its items' schemas, and its union's members.
 */
export function childrenOf(schema: SchemaNode): readonly SchemaNode[] {
  const others = schema.additionalProperties;
  return [
    ...(schema.properties ?? []).map((property) => property.schema),
    ...(typeof others === "object" ? [others] : []),
    ...(schema.items === undefined ? [] : [schema.items]),
    ...(schema.prefixItems ?? []),
    ...(schema.anyOf ?? []),
  ];
}

/**
 * Tell whether a schema says nothing about its value.
 *
 * @param schema - The schema.
 * @returns True when the schema has no typing keyword, so any JSON value matches it.
 */
export function isAnyJson(schema: SchemaNode): boolean {
  return (
    schema.type === undefined &&
    schema.ref === undefined &&
    schema.properties === undefined &&
    schema.additionalProperties === undefined &&
    schema.items === undefined &&
    schema.prefixItems === undefined &&
    schema.anyOf === undefined &&
    schema.enumValues === undefined &&
    schema.constValue === undefined
  );
}

/**
 * Tell whether a schema names null among its values.
 *
 * @remarks
 * A schema of any JSON allows null too, but it does not name it, so it
 * answers false here. The writers use the answer to read a member the API
 * leaves out of some answers when it is null.
 *
 * @param schema - The schema.
 * @param catalog - The components a reference may name.
 * @returns True for the null type, a const or an enum holding null, or a union with such a member.
 */
export function namesNull(schema: SchemaNode, catalog: ShapeCatalog): boolean {
  const resolved = catalog.resolve(schema);
  return (
    resolved.type === "null" ||
    resolved.constValue?.value === null ||
    (resolved.enumValues?.includes(null) ?? false) ||
    (resolved.anyOf?.some((member) => namesNull(member, catalog)) ?? false)
  );
}
