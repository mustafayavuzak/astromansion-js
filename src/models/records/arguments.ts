// PATH: src/models/records/arguments.ts

/**
 * ARGUMENT RECORDS: what the named methods take, Python's keyword arguments written in JavaScript
 *
 * Purpose:
 *   JavaScript has no keyword arguments, so a method takes one object where
 *   the Python SDK takes keywords, and a second object where Python takes
 *   keywords after a mapping:
 *
 *     Python                                          JavaScript
 *     client.natal(date=..., lat=..., lon=...)        client.natal({ date, lat, lon })
 *     client.natal(birth, options={...})              client.natal(birth, { options })
 *     client.render_svg(birth, output="wheel.svg")    client.renderSvg(birth, { output: "wheel.svg" })
 *     client.synastry(birth, partner)                 client.synastry(birth, partner)
 *     client.eclipses(year=2027)                      client.eclipses({ year: 2027 })
 *
 *   signal, which cancels a call, travels the same way, beside the fields
 *   or in the second object.
 */

import type { JsonValue } from "./json.ts";
import type {
  BirthPayload,
  ChartRequest,
  LanguageCode,
  ShareCardKind,
} from "../schemas/api.ts";

/** The birth fields, flat, as the API's birth object holds them. */
export type BirthFields = BirthPayload;

/** What every call takes beside its fields. */
export type CallKeywords = Readonly<{
  /** Cancels the call wherever it is, in an attempt or in a wait between attempts. */
  signal?: AbortSignal | undefined;
}>;

/** What a call that answers with a document takes besides. */
export type DocumentKeywords = Readonly<{
  /** The path to write the document to. Without one the document comes back as it arrived, and nothing is written. */
  output?: string | undefined;
}>;

/**
 * A one-person method's arguments besides the birth fields.
 *
 * @typeParam Options - The endpoint's options, as its request body declares them.
 */
export type ChartKeywords<Options> = CallKeywords &
  Readonly<{
    /** The endpoint's options. Empty options are left out of the body. */
    options?: Options | undefined;
  }>;

/**
 * A one-person method's first argument: the birth fields, with its other arguments allowed beside them.
 *
 * @typeParam Options - The endpoint's options, as its request body declares them.
 */
export type ChartFields<Options> = BirthFields & ChartKeywords<Options>;

/**
 * A two-person method's arguments besides the two charts: the options, and the body's further fields.
 *
 * @typeParam Options - The endpoint's options, as its request body declares them.
 * @typeParam Extra - The body's fields besides birth, partner, and options, when it has any.
 */
export type PairKeywords<Options, Extra = unknown> = ChartKeywords<Options> &
  Extra;

/**
 * The arguments of a method that sends its body as given: the body, with signal allowed beside it.
 *
 * @typeParam Body - The request body the endpoint declares.
 */
export type BodyFields<Body> = Body & CallKeywords;

/**
 * The arguments of a method without a body: its query, with signal allowed beside it.
 *
 * @typeParam Query - The query parameters the endpoint declares.
 */
export type ParamsFields<Query> = Query & CallKeywords;

/**
 * Report a catalog walk's progress, after each page.
 *
 * @param done - The requests made so far.
 * @param left - The requests still expected.
 * @param rows - The rows gathered so far, by category.
 */
export type CatalogProgress = (
  done: number,
  left: number,
  rows: Readonly<Record<string, readonly JsonValue[]>>,
) => void;

/** The catalog walk's arguments besides the categories. */
export type BodiesFields = BirthFields &
  CallKeywords &
  Readonly<{
    /**
     * Bodies per request. Lowering it buys only round trips.
     *
     * @defaultValue 160, the largest page the API serves
     */
    pageSize?: number | undefined;
    /** Further chart options, carried on every page. */
    options?: ChartRequest["options"];
    /**
     * Read a category too large to read by accident.
     *
     * @defaultValue false
     */
    confirmLarge?: boolean | undefined;
    /** Called after each page with the requests made, the requests still expected, and the rows gathered so far. */
    onPage?: CatalogProgress | undefined;
  }>;

/** The share card's arguments besides the two charts. */
export type SharecardKeywords = CallKeywords &
  DocumentKeywords &
  Partial<BirthFields> &
  Readonly<{
    /**
     * synastry reads both charts and leads on the compatibility score. natal reads one and leads on the Sun, Moon, and Ascendant.
     *
     * @defaultValue "synastry"
     */
    type?: ShareCardKind | undefined;
    /** The one display name a natal card prints. Give name or names, not both. */
    name?: string | undefined;
    /** Display names, one for a natal card and two for a synastry card. */
    names?: readonly string[] | undefined;
    /** The card's language. */
    lang?: LanguageCode | undefined;
  }>;
