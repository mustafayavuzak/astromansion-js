// PATH: .meta/tools/generate/openApi.ts

/**
 * OPENAPI READER: the API schema snapshot, parsed and checked
 *
 * Purpose:
 *   The generator's one input is the snapshot of the schema the API
 *   publishes. A file is outside data, so its text is parsed as unknown and
 *   checked here, member by member, before any other module reads it:
 *
 *     snapshot text ──► JSON.parse ──► unknown ──► readOpenApi ──► OpenApiDocument
 *
 *   A schema keyword that decides a type and that the generator does not
 *   know stops the run with its place in the document. A construct the
 *   generator cannot write therefore never becomes a wrong type. A keyword
 *   that only documents a value is kept for the documentation.
 */

/** The vocabulary of the document the reader reads. */
const READER_CONFIG = Object.freeze({
  /** The prefix of every reference to a component schema. */
  COMPONENT_PREFIX: "#/components/schemas/",
  /** The prefix of an extension member, which the reader passes over. */
  EXTENSION_PREFIX: "x-",
  /** The schema keywords that decide a value's type. */
  TYPING_KEYWORDS: Object.freeze([
    "type",
    "$ref",
    "properties",
    "required",
    "additionalProperties",
    "items",
    "anyOf",
    "enum",
    "const",
  ] as const),
  /** The schema keywords that only name or show a value. */
  NOTE_KEYWORDS: Object.freeze([
    "title",
    "description",
    "examples",
    "example",
  ] as const),
  /** The members of a path item other than its operations. A path item holds none of them today. */
  PATH_ITEM_MEMBERS: Object.freeze([] as const),
  /** The members of an operation, read or passed over as documentation. */
  OPERATION_MEMBERS: Object.freeze([
    "operationId",
    "summary",
    "description",
    "parameters",
    "requestBody",
    "responses",
    "tags",
    "security",
  ] as const),
  /** The members of a parameter. */
  PARAMETER_MEMBERS: Object.freeze([
    "name",
    "in",
    "required",
    "schema",
    "description",
    "example",
    "examples",
  ] as const),
  /** The members of a request body. */
  REQUEST_BODY_MEMBERS: Object.freeze([
    "content",
    "required",
    "description",
  ] as const),
  /** The members of a response. */
  RESPONSE_MEMBERS: Object.freeze([
    "description",
    "content",
    "headers",
  ] as const),
  /** The members of a media type's entry in a content map. */
  MEDIA_MEMBERS: Object.freeze(["schema", "example", "examples"] as const),
} as const);

/** The JSON Schema types a schema may name. */
export const SCHEMA_TYPES = Object.freeze([
  "string",
  "number",
  "integer",
  "boolean",
  "null",
  "array",
  "object",
] as const);

/** One JSON Schema type. */
export type SchemaType = (typeof SCHEMA_TYPES)[number];

/** The keywords that limit or describe a value without changing its type, in the order a description names them. */
export const LIMIT_KEYWORDS = Object.freeze([
  "minimum",
  "exclusiveMinimum",
  "maximum",
  "exclusiveMaximum",
  "minLength",
  "maxLength",
  "minItems",
  "maxItems",
  "pattern",
  "format",
  "default",
] as const);

/** One keyword of LIMIT_KEYWORDS. */
export type LimitKeyword = (typeof LIMIT_KEYWORDS)[number];

/** The HTTP methods an operation may use, as the document writes them. */
export const OPERATION_VERBS = Object.freeze([
  "get",
  "post",
  "delete",
] as const);

/** One method of OPERATION_VERBS. */
export type OperationVerb = (typeof OPERATION_VERBS)[number];

/** Where a parameter travels. */
export const PARAMETER_LOCATIONS = Object.freeze(["query", "path"] as const);

/** One place of PARAMETER_LOCATIONS. */
export type ParameterLocation = (typeof PARAMETER_LOCATIONS)[number];

/** A literal an enum or a const holds. */
export type SchemaLiteral = string | number | boolean | null;

/** A limit of a value, kept for its documentation. */
export interface SchemaLimit {
  /** The keyword that sets it. */
  readonly keyword: LimitKeyword;
  /** Its value as JSON text, such as `90` or `"^(tr|en)$"`. */
  readonly json: string;
}

/** A member of an object schema. */
export interface SchemaProperty {
  /** The member's name on the wire. */
  readonly name: string;
  /** Whether every value of the object carries the member. */
  readonly required: boolean;
  /** The member's own schema. */
  readonly schema: SchemaNode;
}

/** The one value a const allows, kept apart so that a const of null differs from no const. */
export interface SchemaConst {
  /** The value. */
  readonly value: SchemaLiteral;
}

/** One JSON Schema node, as far as the generator reads it. */
export interface SchemaNode {
  /** Where the node stands in the document, as a JSON pointer. */
  readonly at: string;
  /** The type the node names, or undefined when it names none. */
  readonly type: SchemaType | undefined;
  /** The name of the component a $ref points to, or undefined without one. */
  readonly ref: string | undefined;
  /** The object's members in the document's order, or undefined when the node lists none. */
  readonly properties: readonly SchemaProperty[] | undefined;
  /** What other members an object allows: a schema, a yes or a no, or undefined when unsaid. */
  readonly additionalProperties: boolean | SchemaNode | undefined;
  /** The schema of an array's items, or undefined when unsaid. */
  readonly items: SchemaNode | undefined;
  /** The schemas a value matches one of, or undefined when the node is not a union. */
  readonly anyOf: readonly SchemaNode[] | undefined;
  /** The values a closed set allows, or undefined when the node is not one. */
  readonly enumValues: readonly SchemaLiteral[] | undefined;
  /** The one value a const allows, or undefined when the node is not one. */
  readonly constValue: SchemaConst | undefined;
  /** The node's prose, or undefined without any. */
  readonly description: string | undefined;
  /** The node's limits, in the order of LIMIT_KEYWORDS. */
  readonly limits: readonly SchemaLimit[];
}

/** A parameter of an operation. */
export interface ParameterObject {
  /** The parameter's name on the wire. */
  readonly name: string;
  /** Where it travels. */
  readonly location: ParameterLocation;
  /** Whether every call must send it. */
  readonly required: boolean;
  /** Its prose, or undefined without any. */
  readonly description: string | undefined;
  /** Its schema. */
  readonly schema: SchemaNode;
}

/** A media type an operation sends or answers with. */
export interface MediaContent {
  /** The media type, such as application/json or image/png. */
  readonly mediaType: string;
  /** The body's schema, or undefined when the document gives none. */
  readonly schema: SchemaNode | undefined;
}

/** The body an operation takes. */
export interface RequestBodyObject {
  /** Whether every call must send it. */
  readonly required: boolean;
  /** The media types it may be sent as. */
  readonly contents: readonly MediaContent[];
}

/** One answer an operation publishes. */
export interface ResponseObject {
  /** The status as the document writes it, such as `200`, `422`, or `default`. */
  readonly status: string;
  /** The media types it may arrive as, empty for an answer without a body. */
  readonly contents: readonly MediaContent[];
}

/** One operation of the document. */
export interface OperationObject {
  /** The HTTP method. */
  readonly verb: OperationVerb;
  /** The path template, such as `/v1/jobs/{job_id}`. */
  readonly path: string;
  /** The operation's id, the name every SDK gives its method. */
  readonly operationId: string;
  /** Its one-line summary, or undefined without one. */
  readonly summary: string | undefined;
  /** Its prose, or undefined without any. */
  readonly description: string | undefined;
  /** Its parameters, in the document's order. */
  readonly parameters: readonly ParameterObject[];
  /** Its body, or undefined when it takes none. */
  readonly requestBody: RequestBodyObject | undefined;
  /** Its answers, in the document's order. */
  readonly responses: readonly ResponseObject[];
}

/** The checked document. */
export interface OpenApiDocument {
  /** Every operation, in the document's order. */
  readonly operations: readonly OperationObject[];
  /** Every component schema, by its name. */
  readonly components: ReadonlyMap<string, SchemaNode>;
}

/** A JSON object as JSON.parse yields it, read member by member. */
type JsonRecord = Readonly<Record<string, unknown>>;

/** A failure to read the snapshot, or a construct the generator cannot write. */
export class GeneratorError extends Error {
  /**
   * Describe the failure.
   *
   * @param message - What is wrong, with the place in the document where it was found.
   * @param options - The failure underneath, when there is one.
   */
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "GeneratorError";
  }
}

/**
 * Parse and check the snapshot.
 *
 * @param text - The snapshot file's text.
 * @returns The operations and the component schemas, checked.
 * @throws {@link GeneratorError} when the text is not JSON, or when the document holds a member the generator cannot read.
 *
 * @example
 * ```ts
 * const document = readOpenApi(await readFile(".meta/openapi/openapi.v1.json", "utf8"));
 * document.operations.length;              // 67
 * document.components.get("BirthPayload"); // its SchemaNode
 * readOpenApi("not json");                 // throws GeneratorError
 * ```
 */
export function readOpenApi(text: string): OpenApiDocument {
  const document = recordAt(parseJson(text), "#");
  const paths = recordAt(document["paths"], "#/paths");
  const components = recordAt(document["components"], "#/components");
  const schemas = recordAt(components["schemas"], "#/components/schemas");
  return {
    operations: Object.entries(paths).flatMap(([path, item]) =>
      readPathItem(path, item, `#/paths/${pointerToken(path)}`),
    ),
    components: new Map(
      Object.entries(schemas).map(([name, schema]) => [
        name,
        readSchema(
          schema,
          `${READER_CONFIG.COMPONENT_PREFIX}${pointerToken(name)}`,
        ),
      ]),
    ),
  };
}

/**
 * Parse the snapshot's text.
 *
 * @param text - The file's text.
 * @returns The parsed value, unchecked.
 * @throws {@link GeneratorError} when the text is not JSON.
 */
function parseJson(text: string): unknown {
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed;
  } catch (error) {
    throw new GeneratorError("the snapshot is not JSON", { cause: error });
  }
}

/**
 * Read the operations of one path.
 *
 * @param path - The path template.
 * @param value - The path item.
 * @param at - Where the path item stands.
 * @returns Its operations, in the document's order.
 * @throws {@link GeneratorError} when the item holds a member other than an operation.
 */
function readPathItem(
  path: string,
  value: unknown,
  at: string,
): readonly OperationObject[] {
  const item = recordAt(value, at);
  checkMembers(item, at, [
    ...OPERATION_VERBS,
    ...READER_CONFIG.PATH_ITEM_MEMBERS,
  ]);
  return OPERATION_VERBS.flatMap((verb) =>
    item[verb] === undefined
      ? []
      : [readOperation(verb, path, item[verb], `${at}/${verb}`)],
  );
}

/**
 * Read one operation.
 *
 * @param verb - Its HTTP method.
 * @param path - Its path template.
 * @param value - The operation object.
 * @param at - Where it stands.
 * @returns The operation, checked.
 * @throws {@link GeneratorError} when a member is missing, malformed, or unknown.
 */
function readOperation(
  verb: OperationVerb,
  path: string,
  value: unknown,
  at: string,
): OperationObject {
  const operation = recordAt(value, at);
  checkMembers(operation, at, READER_CONFIG.OPERATION_MEMBERS);
  const requestBody = operation["requestBody"];
  return {
    verb,
    path,
    operationId: textAt(operation["operationId"], `${at}/operationId`),
    summary: optionalTextAt(operation["summary"], `${at}/summary`),
    description: optionalTextAt(operation["description"], `${at}/description`),
    parameters: optionalListAt(operation["parameters"], `${at}/parameters`).map(
      (parameter, index) =>
        readParameter(parameter, `${at}/parameters/${String(index)}`),
    ),
    requestBody:
      requestBody === undefined
        ? undefined
        : readRequestBody(requestBody, `${at}/requestBody`),
    responses: Object.entries(
      recordAt(operation["responses"], `${at}/responses`),
    ).map(([status, response]) =>
      readResponse(status, response, `${at}/responses/${pointerToken(status)}`),
    ),
  };
}

/**
 * Read one parameter.
 *
 * @param value - The parameter object.
 * @param at - Where it stands.
 * @returns The parameter, checked.
 * @throws {@link GeneratorError} when it travels anywhere but the query or the path, or a member is malformed.
 */
function readParameter(value: unknown, at: string): ParameterObject {
  const parameter = recordAt(value, at);
  checkMembers(parameter, at, READER_CONFIG.PARAMETER_MEMBERS);
  const location = textAt(parameter["in"], `${at}/in`);
  if (!isOneOf(location, PARAMETER_LOCATIONS)) {
    throw new GeneratorError(
      `${at}/in is ${location}, and only ${PARAMETER_LOCATIONS.join(" and ")} parameters can be written`,
    );
  }
  return {
    name: textAt(parameter["name"], `${at}/name`),
    location,
    required:
      optionalBooleanAt(parameter["required"], `${at}/required`) ?? false,
    description: optionalTextAt(parameter["description"], `${at}/description`),
    schema: readSchema(parameter["schema"], `${at}/schema`),
  };
}

/**
 * Read an operation's body.
 *
 * @param value - The request body object.
 * @param at - Where it stands.
 * @returns The body, checked.
 * @throws {@link GeneratorError} when a member is missing, malformed, or unknown.
 */
function readRequestBody(value: unknown, at: string): RequestBodyObject {
  const body = recordAt(value, at);
  checkMembers(body, at, READER_CONFIG.REQUEST_BODY_MEMBERS);
  return {
    required: optionalBooleanAt(body["required"], `${at}/required`) ?? false,
    contents: readContents(body["content"], `${at}/content`),
  };
}

/**
 * Read one answer of an operation.
 *
 * @param status - The status as the document writes it.
 * @param value - The response object.
 * @param at - Where it stands.
 * @returns The answer, checked. An answer without content has none.
 * @throws {@link GeneratorError} when a member is malformed or unknown.
 */
function readResponse(
  status: string,
  value: unknown,
  at: string,
): ResponseObject {
  const response = recordAt(value, at);
  checkMembers(response, at, READER_CONFIG.RESPONSE_MEMBERS);
  const content = response["content"];
  return {
    status,
    contents:
      content === undefined ? [] : readContents(content, `${at}/content`),
  };
}

/**
 * Read a content map.
 *
 * @param value - The map from media type to its entry.
 * @param at - Where it stands.
 * @returns One entry per media type, in the document's order.
 * @throws {@link GeneratorError} when an entry is malformed or holds an unknown member.
 */
function readContents(value: unknown, at: string): readonly MediaContent[] {
  return Object.entries(recordAt(value, at)).map(([mediaType, entry]) => {
    const entryAt = `${at}/${pointerToken(mediaType)}`;
    const media = recordAt(entry, entryAt);
    checkMembers(media, entryAt, READER_CONFIG.MEDIA_MEMBERS);
    const schema = media["schema"];
    return {
      mediaType,
      schema:
        schema === undefined
          ? undefined
          : readSchema(schema, `${entryAt}/schema`),
    };
  });
}

/**
 * Read one schema node and every node inside it.
 *
 * @param value - The schema object.
 * @param at - Where it stands.
 * @returns The node, checked.
 * @throws {@link GeneratorError} when the node uses a keyword the generator does not know, or one of its keywords is malformed.
 */
function readSchema(value: unknown, at: string): SchemaNode {
  const schema = recordAt(value, at);
  for (const keyword of Object.keys(schema)) {
    if (!isKnownKeyword(keyword)) {
      throw new GeneratorError(
        `${at} uses the keyword ${keyword}, which the generator cannot write`,
      );
    }
  }
  const ref = optionalTextAt(schema["$ref"], `${at}/$ref`);
  const items = schema["items"];
  const anyOf = schema["anyOf"];
  const enumValues = schema["enum"];
  return {
    at,
    type: schemaTypeAt(schema["type"], `${at}/type`),
    ref: ref === undefined ? undefined : componentName(ref, `${at}/$ref`),
    properties: readProperties(schema, at),
    additionalProperties: readAdditionalProperties(
      schema["additionalProperties"],
      `${at}/additionalProperties`,
    ),
    items: items === undefined ? undefined : readSchema(items, `${at}/items`),
    anyOf:
      anyOf === undefined
        ? undefined
        : listAt(anyOf, `${at}/anyOf`).map((member, index) =>
            readSchema(member, `${at}/anyOf/${String(index)}`),
          ),
    enumValues:
      enumValues === undefined
        ? undefined
        : listAt(enumValues, `${at}/enum`).map((literal, index) =>
            literalAt(literal, `${at}/enum/${String(index)}`),
          ),
    constValue: Object.hasOwn(schema, "const")
      ? { value: literalAt(schema["const"], `${at}/const`) }
      : undefined,
    description: optionalTextAt(schema["description"], `${at}/description`),
    limits: LIMIT_KEYWORDS.flatMap((keyword) =>
      schema[keyword] === undefined
        ? []
        : [{ keyword, json: JSON.stringify(schema[keyword]) }],
    ),
  };
}

/**
 * Read an object schema's members.
 *
 * @param schema - The schema object.
 * @param at - Where it stands.
 * @returns The members in the document's order, or undefined when the schema lists none.
 * @throws {@link GeneratorError} when required names a member the schema does not list.
 */
function readProperties(
  schema: JsonRecord,
  at: string,
): readonly SchemaProperty[] | undefined {
  const properties = schema["properties"];
  const required = new Set(
    optionalListAt(schema["required"], `${at}/required`).map((name, index) =>
      textAt(name, `${at}/required/${String(index)}`),
    ),
  );
  if (properties === undefined) {
    if (required.size > 0) {
      throw new GeneratorError(`${at} requires members it does not list`);
    }
    return undefined;
  }
  const members = Object.entries(recordAt(properties, `${at}/properties`));
  for (const name of required) {
    if (!members.some(([member]) => member === name)) {
      throw new GeneratorError(
        `${at} requires ${name}, which it does not list`,
      );
    }
  }
  return members.map(([name, member]) => ({
    name,
    required: required.has(name),
    schema: readSchema(member, `${at}/properties/${pointerToken(name)}`),
  }));
}

/**
 * Read additionalProperties.
 *
 * @param value - The keyword's value.
 * @param at - Where it stands.
 * @returns A yes or a no, a schema, or undefined when unsaid.
 * @throws {@link GeneratorError} when the value is neither a boolean nor a schema.
 */
function readAdditionalProperties(
  value: unknown,
  at: string,
): boolean | SchemaNode | undefined {
  if (value === undefined || typeof value === "boolean") {
    return value;
  }
  return readSchema(value, at);
}

/**
 * Turn a reference into the component's name.
 *
 * @param ref - The reference, such as `#/components/schemas/BirthPayload`.
 * @param at - Where it stands.
 * @returns The component's name.
 * @throws {@link GeneratorError} when the reference points anywhere but a component schema.
 */
function componentName(ref: string, at: string): string {
  if (!ref.startsWith(READER_CONFIG.COMPONENT_PREFIX)) {
    throw new GeneratorError(
      `${at} points to ${ref}, and only ${READER_CONFIG.COMPONENT_PREFIX} references can be written`,
    );
  }
  return ref.slice(READER_CONFIG.COMPONENT_PREFIX.length);
}

/**
 * Read a schema's type.
 *
 * @param value - The keyword's value.
 * @param at - Where it stands.
 * @returns The type, or undefined when unsaid.
 * @throws {@link GeneratorError} when the type is a list or a name JSON Schema does not have.
 */
function schemaTypeAt(value: unknown, at: string): SchemaType | undefined {
  if (value === undefined) {
    return undefined;
  }
  const type = textAt(value, at);
  if (!isOneOf(type, SCHEMA_TYPES)) {
    throw new GeneratorError(
      `${at} names the type ${type}, which JSON Schema does not have`,
    );
  }
  return type;
}

/**
 * Read an enum's or a const's value.
 *
 * @param value - The value.
 * @param at - Where it stands.
 * @returns The value.
 * @throws {@link GeneratorError} when the value is an object or a list.
 */
function literalAt(value: unknown, at: string): SchemaLiteral {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  throw new GeneratorError(
    `${at} must be a string, a number, a boolean, or null`,
  );
}

/**
 * Refuse a member the reader does not know.
 *
 * @param record - The object.
 * @param at - Where it stands.
 * @param known - The members the reader reads or passes over.
 * @throws {@link GeneratorError} when the object holds any other member, an extension member aside.
 */
function checkMembers(
  record: JsonRecord,
  at: string,
  known: readonly string[],
): void {
  for (const member of Object.keys(record)) {
    if (
      !member.startsWith(READER_CONFIG.EXTENSION_PREFIX) &&
      !known.includes(member)
    ) {
      throw new GeneratorError(
        `${at} holds the member ${member}, which the generator cannot read`,
      );
    }
  }
}

/**
 * Tell whether a schema keyword is one the reader knows.
 *
 * @param keyword - The keyword.
 * @returns True for a typing, note, limit, or extension keyword.
 */
function isKnownKeyword(keyword: string): boolean {
  return (
    keyword.startsWith(READER_CONFIG.EXTENSION_PREFIX) ||
    isOneOf(keyword, READER_CONFIG.TYPING_KEYWORDS) ||
    isOneOf(keyword, READER_CONFIG.NOTE_KEYWORDS) ||
    isOneOf(keyword, LIMIT_KEYWORDS)
  );
}

/**
 * Tell whether a text is one of a closed set.
 *
 * @typeParam Member - The set's members.
 * @param value - The text.
 * @param members - The set.
 * @returns True when the text is a member.
 */
function isOneOf<Member extends string>(
  value: string,
  members: readonly Member[],
): value is Member {
  return members.some((member) => member === value);
}

/**
 * Read an object.
 *
 * @param value - The value.
 * @param at - Where it stands.
 * @returns The value as an object.
 * @throws {@link GeneratorError} when the value is not an object.
 */
function recordAt(value: unknown, at: string): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new GeneratorError(`${at} must be an object`);
  }
  return value as JsonRecord; // the checks above leave only a non-null, non-array object
}

/**
 * Read a list.
 *
 * @param value - The value.
 * @param at - Where it stands.
 * @returns The list.
 * @throws {@link GeneratorError} when the value is not a list.
 */
function listAt(value: unknown, at: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new GeneratorError(`${at} must be a list`);
  }
  return value as readonly unknown[]; // Array.isArray checked it above
}

/**
 * Read a list that may be absent.
 *
 * @param value - The value, or undefined.
 * @param at - Where it stands.
 * @returns The list, empty when absent.
 * @throws {@link GeneratorError} when the value is present and not a list.
 */
function optionalListAt(value: unknown, at: string): readonly unknown[] {
  return value === undefined ? [] : listAt(value, at);
}

/**
 * Read a text.
 *
 * @param value - The value.
 * @param at - Where it stands.
 * @returns The text.
 * @throws {@link GeneratorError} when the value is not a text.
 */
function textAt(value: unknown, at: string): string {
  if (typeof value !== "string") {
    throw new GeneratorError(`${at} must be a text`);
  }
  return value;
}

/**
 * Read a text that may be absent.
 *
 * @param value - The value, or undefined.
 * @param at - Where it stands.
 * @returns The text, or undefined when absent.
 * @throws {@link GeneratorError} when the value is present and not a text.
 */
function optionalTextAt(value: unknown, at: string): string | undefined {
  return value === undefined ? undefined : textAt(value, at);
}

/**
 * Read a boolean that may be absent.
 *
 * @param value - The value, or undefined.
 * @param at - Where it stands.
 * @returns The boolean, or undefined when absent.
 * @throws {@link GeneratorError} when the value is present and not a boolean.
 */
function optionalBooleanAt(value: unknown, at: string): boolean | undefined {
  if (value === undefined || typeof value === "boolean") {
    return value;
  }
  throw new GeneratorError(`${at} must be true or false`);
}

/**
 * Escape a member name for a JSON pointer.
 *
 * @param name - The member's name.
 * @returns The name with `~` written `~0` and `/` written `~1`.
 *
 * @example
 * ```ts
 * pointerToken("/v1/natal");   // "~1v1~1natal"
 * pointerToken("BirthPayload"); // "BirthPayload"
 * ```
 */
function pointerToken(name: string): string {
  return name.replaceAll("~", "~0").replaceAll("/", "~1");
}
