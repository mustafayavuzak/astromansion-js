# Changelog

## 0.1.0-alpha.1

- The package is the JavaScript twin of the Python SDK 0.3.2. It has the
  same methods under the same names, written in camelCase, and the same
  arguments, answers, and errors. Python's `render_png` is `renderPng` here,
  and `search_places` is `searchPlaces`.
- Every one of the API's 67 operations has a method, generated from the API's
  schema. A chart method takes the birth fields flat, as
  `client.natal({ date, lat, lon })`, nests them under `birth`, and checks
  them before anything is sent. A two-person method takes the two charts as
  `client.synastry(birth, partner)`. `options` and `output` stand beside the
  fields or come in a second object.
- A JSON answer is a `Result`. Its fields read directly, as
  `chart.summary.Sun.sign`, and `data`, `raw`, `technique`, `result`, and
  `toDict()` read as in Python. A `{technique, result}` wrapper is opened by
  its exact shape. Each answer is checked against the shape the API publishes,
  and one outside it rejects with the code `unexpected_answer`.
- Every document method takes `output` and writes the file on Node.js, Bun,
  and Deno. Where the runtime has no file system, `output` is refused before
  the request is sent.
- `bodies()` walks the catalog's pages, stops a walk too large to start by
  accident, and reports its progress through `onPage`.
- `renderSharecard()` is written by hand, as in Python, so the two charts stay
  two arguments while `partner` is optional.
- Module-level shortcuts: every endpoint is a function of the package,
  together with `setApiKey()`, `reset()`, `defaultClient()`, `request()`, and
  `bodies()`. The key is read from the `apiKey` option, then `setApiKey()`,
  then `ASTROMANSION_API_KEY`.
- `ErrorPolicy` and `VERSION` are exported, as Python exports `ErrorPolicy`
  and `__version__`. `timeout` counts seconds, as in Python.
- The README, `EXAMPLES.md`, and `examples/natal_chart.ts` follow the Python
  SDK's, section by section.

## 0.1.0-alpha.0

- The first release, which claimed the name on npm: the client, its
  transport, its retries, its errors, and `request()` for any published path.
