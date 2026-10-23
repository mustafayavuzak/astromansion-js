// PATH: tools/generate/operations.ts

/**
 * OPERATIONS: the methods the SDK writes, one per operation the API publishes
 *
 * Purpose:
 *   Turns the checked document into what the writers need for each method:
 *   its names, its HTTP method and path, its request shape, its arguments,
 *   and how it reads its answer.
 *
 *     operation id       search_places          ──► the method searchPlaces
 *     path placeholder   {job_id}               ──► the argument jobId
 *     query parameters   q, limit, lang         ──► one SearchPlacesQuery argument
 *     request body       $ref NatalApiRequest   ──► the request shape, chart here
 *     success answer     JSON or a document     ──► a checked Result, or the document
 *
 *   The names are the API's own. Its operation ids are the snake_case names
 *   the Python SDK uses, and this SDK writes them in camelCase.
 *
 * Request shapes:
 *   The shape is decided as the Python SDK's generator decides it, and the
 *   first rule that matches wins:
 *
 *     1. a GET or a DELETE              ──► get, delete    the query's and the path's parameters
 *     2. no request body                ──► empty
 *     3. the body requires partner      ──► pair           two charts as two arguments
 *     4. the body is birth and options  ──► chart          the birth fields taken flat
 *     5. the body holds birth           ──► birth_extra    the body sent as given
 *     6. any other body                 ──► body           the body sent as given
 *
 * Wrapper:
 *   A 200 answer whose fields are exactly technique and result is the
 *   wrapper. A 200 answer with other fields is the data itself. An answer
 *   without fields, or without a 200, leaves the decision to the body.
 */

import {
  GeneratorError,
  type OpenApiDocument,
  type OperationObject,
  type OperationVerb,
  type ParameterObject,
  type ResponseObject,
  type SchemaNode,
} from "./openApi.ts";
import { isAnyJson, type ShapeCatalog } from "./shapes.ts";

/** How operations become methods. */
const OPERATIONS_CONFIG = Object.freeze({
  /**
   * An operation id the SDKs share: snake_case words of lowercase letters
   * and digits, the first beginning with a letter. Accepts `natal`,
   * `search_places`, and `moon_phases_for`. Refuses `Natal`, `searchPlaces`,
   * `_natal`, and `natal__chart`.
   */
  SNAKE_NAME: /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/,
  /** The separator between the words of an operation id. */
  WORD_SEPARATOR: "_",
  /** The fields of the wrapper a JSON answer may arrive in, exactly. */
  ENVELOPE_FIELDS: Object.freeze(["technique", "result"] as const),
  /** The status whose answer decides the wrapper, as the Python SDK reads it. */
  ENVELOPE_STATUS: "200",
  /** The media type of JSON. */
  JSON_MEDIA_TYPE: "application/json",
  /** The suffix of a media type built on JSON. */
  JSON_SUFFIX: "+json",
  /** The lowest status of a success. */
  SUCCESS_LOWEST: 200,
  /** The lowest status above every success. */
  SUCCESS_BEYOND: 300,
  /** The opening and the closing of a placeholder in a path template. */
  PLACEHOLDER_OPEN: "{",
  PLACEHOLDER_CLOSE: "}",
  /** The separator of a path's segments. */
  PATH_SEPARATOR: "/",
  /** The body fields that decide a request shape. */
  BIRTH_FIELD: "birth",
  PARTNER_FIELD: "partner",
  OPTIONS_FIELD: "options",
  /** The paths whose method the client writes by hand. They keep their row and their shortcut. */
  HAND_WRITTEN: Object.freeze(["/v1/render/sharecard"] as const),
  /** The longest summary the endpoint table keeps, as the Python SDK trims it. */
  SUMMARY_MAX_CHARS: 58,
  /** The summary of an operation that says nothing about itself. */
  SUMMARY_FALLBACK: "Call the endpoint",
  /** The mark a trimmed summary ends with. */
  SUMMARY_ELLIPSIS: "…",
  /**
   * A run of whitespace, collapsed to one space in a summary. Accepts a
   * space, a tab, and a line break, one or many. Refuses empty text.
   */
  WHITESPACE: /\s+/,
  /** The names of the client's own members, which no generated method may take. */
  RESERVED_METHOD_NAMES: Object.freeze([
    "request",
    "bodies",
    "close",
    "toString",
    "valueOf",
    "constructor",
    "baseUrl",
    "maxRetries",
  ] as const),
  /** The suffix of the type of a method's query. */
  QUERY_SUFFIX: "Query",
  /** The suffix of the type of an answer written for one method alone. */
  ANSWER_SUFFIX: "Answer",
  /** The prefix of a generated check's name, before the type's name. */
  CHECK_PREFIX: "is",
  /** The type and the check of an answer of any JSON value. */
  ANY_JSON: Object.freeze({ type: "JsonValue", check: "isJsonValue" }),
  /** The type and the check of an answer that is any JSON object. */
  ANY_OBJECT: Object.freeze({ type: "JsonObject", check: "isJsonObject" }),
} as const);

/** The request shapes, as the Python SDK names them. */
export type RequestKind =
  "chart" | "pair" | "birth_extra" | "body" | "get" | "delete" | "empty";

/** A method's argument taken from the path. */
export interface PathArgument {
  /** The placeholder in the path template, such as job_id. */
  readonly placeholder: string;
  /** The argument's name, such as jobId. */
  readonly argument: string;
  /** The parameter's prose, or undefined without any. */
  readonly description: string | undefined;
}

/** A method's query, taken as one argument. */
export interface QueryArgument {
  /** The type of the argument, such as SearchPlacesQuery. */
  readonly typeName: string;
  /** Whether some parameter is required, which makes the argument required. */
  readonly required: boolean;
  /** The query's parameters, in the document's order. */
  readonly parameters: readonly ParameterObject[];
}

/** A method's JSON body. */
export interface BodyArgument {
  /** The body's schema, a reference to its component. */
  readonly schema: SchemaNode;
  /** The component that types the body. */
  readonly typeName: string;
  /** Whether every call must send it. */
  readonly required: boolean;
  /** The body's top-level fields, in the document's order. */
  readonly fields: readonly string[];
}

/** Where the check of a JSON answer comes from. */
export interface AnswerCheck {
  /** The check's name, such as isNatalResponse or isJsonObject. */
  readonly name: string;
  /** True when the generator writes the check, false when the client's JSON module holds it. */
  readonly generated: boolean;
}

/** How a method reads a JSON answer. */
export interface JsonAnswer {
  /** The answer is JSON. */
  readonly kind: "json";
  /** The answer's schema, a reference or a schema written for this answer alone. */
  readonly schema: SchemaNode;
  /** The type the answer has as it arrives, before any wrapper is opened. */
  readonly typeName: string;
  /** The schema of a type written for this answer alone, or undefined when a component or a JSON type names it. */
  readonly ownSchema: SchemaNode | undefined;
  /** The check the answer must pass. */
  readonly check: AnswerCheck;
  /** Whether the answer's schema allows any JSON value, which lets a text/plain answer through as text. */
  readonly anyJson: boolean;
  /** Whether the answer has a result field that allows any JSON value, as the wrapper's does. */
  readonly resultAnyJson: boolean;
}

/** How a method reads a document. */
export interface DocumentAnswer {
  /** The answer is a document. */
  readonly kind: "document";
  /** The media types the document may arrive as. */
  readonly mediaTypes: readonly string[];
}

/** How a method reads its answer. */
export type Answer = JsonAnswer | DocumentAnswer;

/** One method the SDK writes. */
export interface SdkOperation {
  /** The method's name, the operation id in camelCase. */
  readonly methodName: string;
  /** The operation id, which is the Python SDK's method name and the technique a Result reports. */
  readonly operationId: string;
  /** The operation id in PascalCase, which the method's own types begin with. */
  readonly typePrefix: string;
  /** The HTTP method. */
  readonly verb: Uppercase<OperationVerb>;
  /** The path template. */
  readonly path: string;
  /** The operation's one-line summary, for the method's comment. */
  readonly summary: string;
  /** The summary the endpoint table keeps, trimmed as the Python SDK trims it. */
  readonly tableSummary: string;
  /** The operation's prose, or undefined without any. */
  readonly description: string | undefined;
  /** The request shape. */
  readonly kind: RequestKind;
  /** The body's top-level fields, or the query's and the path's parameters. */
  readonly fields: readonly string[];
  /** Whether a 200 answer is the wrapper, or undefined when its schema leaves that to the body. */
  readonly enveloped: boolean | undefined;
  /** Whether the client writes this method by hand. */
  readonly handWritten: boolean;
  /** The arguments taken from the path, in the path's order. */
  readonly pathArguments: readonly PathArgument[];
  /** The query argument, or undefined when the operation takes no query. */
  readonly query: QueryArgument | undefined;
  /** The body argument, or undefined when the operation takes no body. */
  readonly body: BodyArgument | undefined;
  /** How the method reads its answer. */
  readonly answer: Answer;
}

/**
 * Turn every operation of the document into the method the SDK writes.
 *
 * @param document - The checked document.
 * @param catalog - The document's components.
 * @returns One method per operation, sorted by the method's name.
 * @throws {@link GeneratorError} when an operation cannot become a method, such as for a name two operations share, a body other than JSON, or a success without a body.
 *
 * @example
 * ```ts
 * const methods = sdkOperations(document, new ShapeCatalog(document.components));
 * methods.find((method) => method.methodName === "searchPlaces")?.query?.typeName;   // "SearchPlacesQuery"
 * methods.find((method) => method.methodName === "natal")?.kind;                    // "chart"
 * ```
 */
export function sdkOperations(
  document: OpenApiDocument,
  catalog: ShapeCatalog,
): readonly SdkOperation[] {
  const methods = document.operations.map((operation) =>
    sdkOperation(operation, catalog),
  );
  const taken = new Set<string>();
  for (const method of methods) {
    if (taken.has(method.methodName)) {
      throw new GeneratorError(
        `two operations would both be the method ${method.methodName}`,
      );
    }
    taken.add(method.methodName);
  }
  return methods.sort((left, right) =>
    left.methodName.localeCompare(right.methodName),
  );
}

/**
 * Name every component a method sends or receives, the ones the SDK writes types for.
 *
 * @remarks
 * A component only an error answer uses, such as the schema of a 422
 * refusal, stays out, since a method neither sends it nor returns it.
 *
 * @param methods - The methods.
 * @param catalog - The document's components.
 * @returns The components reached from any body, query parameter, or JSON answer, through references at any depth.
 */
export function methodReach(
  methods: readonly SdkOperation[],
  catalog: ShapeCatalog,
): ReadonlySet<string> {
  return catalog.reach(
    methods.flatMap((method) => [
      ...(method.body === undefined ? [] : [method.body.schema]),
      ...(method.query?.parameters.map((parameter) => parameter.schema) ?? []),
      ...(method.answer.kind === "json" ? [method.answer.schema] : []),
    ]),
  );
}

/**
 * Name every component the JSON answers reach, which get a check.
 *
 * @param methods - The methods.
 * @param catalog - The document's components.
 * @returns The components reached from any JSON answer, through references at any depth.
 */
export function answerReach(
  methods: readonly SdkOperation[],
  catalog: ShapeCatalog,
): ReadonlySet<string> {
  return catalog.reach(
    methods.flatMap((method) =>
      method.answer.kind === "json" ? [method.answer.schema] : [],
    ),
  );
}

/**
 * Write a snake_case name in camelCase.
 *
 * @param name - The name, such as an operation id or a path placeholder.
 * @returns The name with each word after the first capitalized and the separators gone.
 * @throws {@link GeneratorError} when the name is not snake_case.
 *
 * @example
 * ```ts
 * camelName("search_places");   // "searchPlaces"
 * camelName("natal");           // "natal"
 * camelName("searchPlaces");    // throws GeneratorError
 * ```
 */
export function camelName(name: string): string {
  const [first, ...rest] = snakeWords(name);
  return [first, ...rest.map(capitalized)].join("");
}

/**
 * Write a snake_case name in PascalCase.
 *
 * @param name - The name, such as an operation id.
 * @returns The name with every word capitalized and the separators gone.
 * @throws {@link GeneratorError} when the name is not snake_case.
 *
 * @example
 * ```ts
 * pascalName("search_places");   // "SearchPlaces"
 * pascalName("natal");           // "Natal"
 * ```
 */
export function pascalName(name: string): string {
  return snakeWords(name).map(capitalized).join("");
}

/**
 * Trim an operation's prose to the one line the endpoint table keeps, as the Python SDK trims it.
 *
 * @param operation - The operation.
 * @returns The summary, else the description's first line, its whitespace collapsed and its closing period gone, within 58 characters.
 *
 * @example
 * ```ts
 * tableSummaryOf({ summary: "Compute a natal chart." });   // "Compute a natal chart"
 * tableSummaryOf({});                                       // "Call the endpoint"
 * ```
 */
export function tableSummaryOf(
  operation: Readonly<{
    summary?: string | undefined;
    description?: string | undefined;
  }>,
): string {
  const text = (operation.summary ?? operation.description ?? "").trim();
  const [firstLine = ""] = text.split("\n");
  let line = firstLine.split(OPERATIONS_CONFIG.WHITESPACE).join(" ").trim();
  while (line.endsWith(".")) {
    line = line.slice(0, -1);
  }
  if (line === "") {
    return OPERATIONS_CONFIG.SUMMARY_FALLBACK;
  }
  if (line.length <= OPERATIONS_CONFIG.SUMMARY_MAX_CHARS) {
    return line;
  }
  const cut = line.slice(0, OPERATIONS_CONFIG.SUMMARY_MAX_CHARS);
  const lastSpace = cut.lastIndexOf(" ");
  const kept = lastSpace === -1 ? cut : cut.slice(0, lastSpace);
  return `${kept}${OPERATIONS_CONFIG.SUMMARY_ELLIPSIS}`;
}

/**
 * Turn one operation into its method.
 *
 * @param operation - The operation.
 * @param catalog - The document's components.
 * @returns The method.
 * @throws {@link GeneratorError} when the operation cannot become a method.
 */
function sdkOperation(
  operation: OperationObject,
  catalog: ShapeCatalog,
): SdkOperation {
  const methodName = camelName(operation.operationId);
  if (
    OPERATIONS_CONFIG.RESERVED_METHOD_NAMES.some((name) => name === methodName)
  ) {
    throw new GeneratorError(
      `${describe(operation)} would be the method ${methodName}, a name the client keeps for itself`,
    );
  }
  const typePrefix = pascalName(operation.operationId);
  const body = bodyOf(operation, catalog);
  if (operation.verb === "get" && body !== undefined) {
    throw new GeneratorError(
      `${describe(operation)} takes a body, which a GET request never carries`,
    );
  }
  const shape = requestShape(operation, body, catalog);
  return {
    methodName,
    operationId: operation.operationId,
    typePrefix,
    verb: verbOf(operation.verb),
    path: operation.path,
    summary:
      operation.summary ??
      `Call ${operation.verb.toUpperCase()} ${operation.path}`,
    tableSummary: tableSummaryOf(operation),
    description: operation.description,
    kind: shape.kind,
    fields: shape.fields,
    enveloped: envelopedOf(operation, catalog),
    handWritten: OPERATIONS_CONFIG.HAND_WRITTEN.some(
      (path) => path === operation.path,
    ),
    pathArguments: pathArgumentsOf(operation),
    query: queryOf(operation, typePrefix),
    body,
    answer: answerOf(operation, catalog, typePrefix),
  };
}

/**
 * Decide an operation's request shape, by the rules drawn above.
 *
 * @remarks
 * Only a body that requires a partner gets the two-person signature.
 * /v1/query merely allows one, and forcing it there would make the second
 * chart mandatory for a call that does not need it.
 *
 * @param operation - The operation.
 * @param body - Its body argument, or undefined.
 * @param catalog - The document's components.
 * @returns The shape, and the fields its table row lists.
 */
function requestShape(
  operation: OperationObject,
  body: BodyArgument | undefined,
  catalog: ShapeCatalog,
): { readonly kind: RequestKind; readonly fields: readonly string[] } {
  if (operation.verb === "get" || operation.verb === "delete") {
    return {
      kind: operation.verb,
      fields: operation.parameters.map((parameter) => parameter.name),
    };
  }
  if (body === undefined) {
    return { kind: "empty", fields: [] };
  }
  const declared = catalog.resolve(body.schema).properties ?? [];
  const config = OPERATIONS_CONFIG;
  if (
    declared.some(
      (property) => property.name === config.PARTNER_FIELD && property.required,
    )
  ) {
    return { kind: "pair", fields: body.fields };
  }
  if (
    body.fields[0] === config.BIRTH_FIELD &&
    body.fields.every(
      (field) => field === config.BIRTH_FIELD || field === config.OPTIONS_FIELD,
    )
  ) {
    return { kind: "chart", fields: body.fields };
  }
  if (body.fields.includes(config.BIRTH_FIELD)) {
    return { kind: "birth_extra", fields: body.fields };
  }
  return { kind: "body", fields: body.fields };
}

/**
 * Read whether an operation's 200 answer is the wrapper.
 *
 * @remarks
 * Read from the published schema, never guessed from a body. A schema that
 * owns more fields, such as a job's status beside its result, is the data
 * itself, and opening it would throw the rest of the answer away.
 *
 * @param operation - The operation.
 * @param catalog - The document's components.
 * @returns True or false from the schema, or undefined when the 200 answer is not JSON, or its schema names no fields.
 */
function envelopedOf(
  operation: OperationObject,
  catalog: ShapeCatalog,
): boolean | undefined {
  const answer = operation.responses.find(
    (response) => response.status === OPERATIONS_CONFIG.ENVELOPE_STATUS,
  );
  const schema = answer?.contents.find(
    (content) => content.mediaType === OPERATIONS_CONFIG.JSON_MEDIA_TYPE,
  )?.schema;
  if (schema === undefined) {
    return undefined;
  }
  const fields =
    catalog.resolve(schema).properties?.map((property) => property.name) ?? [];
  if (fields.length === 0) {
    return undefined;
  }
  return (
    fields.length === OPERATIONS_CONFIG.ENVELOPE_FIELDS.length &&
    OPERATIONS_CONFIG.ENVELOPE_FIELDS.every((field) => fields.includes(field))
  );
}

/**
 * Write a document's method the way the client names it.
 *
 * @param verb - The method as the document writes it.
 * @returns The method in capitals.
 */
function verbOf(verb: OperationVerb): Uppercase<OperationVerb> {
  switch (verb) {
    case "get":
      return "GET";
    case "post":
      return "POST";
    case "delete":
      return "DELETE";
  }
}

/**
 * Read the arguments an operation takes from its path.
 *
 * @param operation - The operation.
 * @returns One argument per placeholder, in the path's order.
 * @throws {@link GeneratorError} when a placeholder has no path parameter, or a path parameter has no placeholder.
 */
function pathArgumentsOf(operation: OperationObject): readonly PathArgument[] {
  const placeholders = operation.path
    .split(OPERATIONS_CONFIG.PATH_SEPARATOR)
    .filter(
      (segment) =>
        segment.startsWith(OPERATIONS_CONFIG.PLACEHOLDER_OPEN) &&
        segment.endsWith(OPERATIONS_CONFIG.PLACEHOLDER_CLOSE),
    )
    .map((segment) => segment.slice(1, -1));
  const parameters = operation.parameters.filter(
    (parameter) => parameter.location === "path",
  );
  for (const parameter of parameters) {
    if (!placeholders.includes(parameter.name)) {
      throw new GeneratorError(
        `${describe(operation)} has the path parameter ${parameter.name}, which its path does not hold`,
      );
    }
  }
  return placeholders.map((placeholder) => {
    const parameter = parameters.find(
      (candidate) => candidate.name === placeholder,
    );
    if (parameter === undefined) {
      throw new GeneratorError(
        `${describe(operation)} holds {${placeholder}} in its path without a parameter for it`,
      );
    }
    return {
      placeholder,
      argument: camelName(placeholder),
      description: parameter.description,
    };
  });
}

/**
 * Read an operation's query.
 *
 * @param operation - The operation.
 * @param typePrefix - The operation id in PascalCase.
 * @returns The query argument, or undefined when the operation takes no query.
 */
function queryOf(
  operation: OperationObject,
  typePrefix: string,
): QueryArgument | undefined {
  const parameters = operation.parameters.filter(
    (parameter) => parameter.location === "query",
  );
  if (parameters.length === 0) {
    return undefined;
  }
  return {
    typeName: `${typePrefix}${OPERATIONS_CONFIG.QUERY_SUFFIX}`,
    required: parameters.some((parameter) => parameter.required),
    parameters,
  };
}

/**
 * Read an operation's body.
 *
 * @param operation - The operation.
 * @param catalog - The document's components.
 * @returns The body argument, or undefined when the operation takes no body.
 * @throws {@link GeneratorError} when the body is not one JSON body typed by a component shape.
 */
function bodyOf(
  operation: OperationObject,
  catalog: ShapeCatalog,
): BodyArgument | undefined {
  const body = operation.requestBody;
  if (body === undefined) {
    return undefined;
  }
  const [content, ...others] = body.contents;
  const schema = content?.schema;
  const ref = schema?.ref;
  if (
    content === undefined ||
    others.length > 0 ||
    !isJsonMediaType(content.mediaType) ||
    schema === undefined ||
    ref === undefined ||
    catalog.kindOf(ref) !== "shape"
  ) {
    throw new GeneratorError(
      `${describe(operation)} takes a body other than one JSON body that a component shape types`,
    );
  }
  const fields =
    catalog.resolve(schema).properties?.map((property) => property.name) ?? [];
  return { schema, typeName: ref, required: body.required, fields };
}

/**
 * Read how an operation answers its success.
 *
 * @param operation - The operation.
 * @param catalog - The document's components.
 * @param typePrefix - The operation id in PascalCase.
 * @returns A JSON answer with its type and check, or a document with its media types.
 * @throws {@link GeneratorError} when the operation publishes no success, a success without a body, or a bare closed set.
 */
function answerOf(
  operation: OperationObject,
  catalog: ShapeCatalog,
  typePrefix: string,
): Answer {
  const success = successOf(operation);
  const json = success.contents.find((content) =>
    isJsonMediaType(content.mediaType),
  );
  if (json === undefined) {
    if (success.contents.length === 0) {
      throw new GeneratorError(
        `${describe(operation)} answers its success without a body, which no method can return`,
      );
    }
    return {
      kind: "document",
      mediaTypes: success.contents.map((content) => content.mediaType),
    };
  }
  const schema = json.schema ?? untypedSchema(`${describe(operation)} answer`);
  const resolved = catalog.resolve(schema);
  const resultField = resolved.properties?.find(
    (property) => property.name === OPERATIONS_CONFIG.ENVELOPE_FIELDS[1],
  );
  const resultAnyJson =
    resultField !== undefined && isAnyJson(catalog.resolve(resultField.schema));
  if (isAnyJson(resolved)) {
    return {
      kind: "json",
      schema,
      typeName: OPERATIONS_CONFIG.ANY_JSON.type,
      ownSchema: undefined,
      check: { name: OPERATIONS_CONFIG.ANY_JSON.check, generated: false },
      anyJson: true,
      resultAnyJson,
    };
  }
  if (resolved.enumValues !== undefined) {
    throw new GeneratorError(
      `${describe(operation)} answers with a bare closed set, which no method returns`,
    );
  }
  if (schema.ref !== undefined) {
    return {
      kind: "json",
      schema,
      typeName: schema.ref,
      ownSchema: undefined,
      check: {
        name: `${OPERATIONS_CONFIG.CHECK_PREFIX}${schema.ref}`,
        generated: true,
      },
      anyJson: false,
      resultAnyJson,
    };
  }
  if (isAnyObject(schema)) {
    return {
      kind: "json",
      schema,
      typeName: OPERATIONS_CONFIG.ANY_OBJECT.type,
      ownSchema: undefined,
      check: { name: OPERATIONS_CONFIG.ANY_OBJECT.check, generated: false },
      anyJson: false,
      resultAnyJson,
    };
  }
  const typeName = `${typePrefix}${OPERATIONS_CONFIG.ANSWER_SUFFIX}`;
  return {
    kind: "json",
    schema,
    typeName,
    ownSchema: schema,
    check: {
      name: `${OPERATIONS_CONFIG.CHECK_PREFIX}${typeName}`,
      generated: true,
    },
    anyJson: false,
    resultAnyJson,
  };
}

/**
 * Find the answer an operation gives on success.
 *
 * @param operation - The operation.
 * @returns The answer with the lowest success status.
 * @throws {@link GeneratorError} when the operation publishes no success.
 */
function successOf(operation: OperationObject): ResponseObject {
  const successes = operation.responses
    .filter((response) => isSuccess(response.status))
    .sort((left, right) => Number(left.status) - Number(right.status));
  const [success] = successes;
  if (success === undefined) {
    throw new GeneratorError(`${describe(operation)} publishes no success`);
  }
  return success;
}

/**
 * Tell whether a status, as the document writes it, is a success.
 *
 * @param status - The status, such as `200`, `422`, or `default`.
 * @returns True for a number from 200 through 299.
 */
function isSuccess(status: string): boolean {
  const code = Number(status);
  return (
    Number.isInteger(code) &&
    code >= OPERATIONS_CONFIG.SUCCESS_LOWEST &&
    code < OPERATIONS_CONFIG.SUCCESS_BEYOND
  );
}

/**
 * Tell whether a media type is JSON.
 *
 * @param mediaType - The media type.
 * @returns True for application/json and for a type built on JSON, such as application/problem+json.
 */
function isJsonMediaType(mediaType: string): boolean {
  return (
    mediaType === OPERATIONS_CONFIG.JSON_MEDIA_TYPE ||
    mediaType.endsWith(OPERATIONS_CONFIG.JSON_SUFFIX)
  );
}

/**
 * Tell whether a schema is any JSON object, its members unnamed and unlimited.
 *
 * @param schema - The schema.
 * @returns True for an object type without members and without a schema for its other members.
 */
function isAnyObject(schema: SchemaNode): boolean {
  return (
    schema.type === "object" &&
    schema.properties === undefined &&
    (schema.additionalProperties === undefined ||
      schema.additionalProperties === true)
  );
}

/**
 * Stand in for the schema of a JSON answer the document leaves untyped.
 *
 * @param at - Where the answer stands, for messages.
 * @returns A schema of any JSON value.
 */
function untypedSchema(at: string): SchemaNode {
  return {
    at,
    type: undefined,
    ref: undefined,
    properties: undefined,
    additionalProperties: undefined,
    items: undefined,
    anyOf: undefined,
    enumValues: undefined,
    constValue: undefined,
    description: undefined,
    limits: [],
  };
}

/**
 * Split a snake_case name into its words.
 *
 * @param name - The name.
 * @returns Its words, at least one.
 * @throws {@link GeneratorError} when the name is not snake_case.
 */
function snakeWords(name: string): readonly [string, ...string[]] {
  if (!OPERATIONS_CONFIG.SNAKE_NAME.test(name)) {
    throw new GeneratorError(`${name} is not a snake_case name`);
  }
  const [first, ...rest] = name.split(OPERATIONS_CONFIG.WORD_SEPARATOR);
  if (first === undefined) {
    throw new GeneratorError(`${name} has no word`);
  }
  return [first, ...rest];
}

/**
 * Capitalize a word.
 *
 * @param word - A word of lowercase letters and digits.
 * @returns The word with its first letter in capitals.
 */
function capitalized(word: string): string {
  return `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`;
}

/**
 * Name an operation in a message.
 *
 * @param operation - The operation.
 * @returns Its method and path, such as `POST /v1/natal`.
 */
function describe(operation: OperationObject): string {
  return `${operation.verb.toUpperCase()} ${operation.path}`;
}
