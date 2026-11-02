# Changelog

## 0.1.0-alpha.4

- Centre watermark switches follow the API across natal, paired wheels and
  PDF reports. Styled SVG and PNG examples also show transparent surroundings.

- `renderChart` draws ten chart kinds as SVG or PNG, with the API's
  optional style. The client and the module shortcut return bytes or write
  the document to `output`. Its body is the generated `ChartRenderRequest`
  type. Examples cover styled SVG and PNG requests.

- Saturn-return wheels accept cycles 1 through 3. Custom Keplerian bodies
  follow the actual chart moment, including composite midpoints.

- The README has a section on `planetarySystem`. It shows the three answers
  every satellite carries, the frame with its pole, and the options that
  narrow the answer.

- The satellite answer's new fields are typed and checked. `FramePole` types
  the `pole` the planet-centred frame's equator is built on.
  `SatelliteGeocentric` adds the optional `longitude`, `latitude` and
  `position_icrf_km`, and `SystemTime` adds `offset_seconds`, `utc` and
  `local`.

- The planet-centred frame is the planet's equator on its IAU 2015 pole at
  J2000.0. Its `frame_id` reads `jupiter_equator_iau2015_j2000_fixed` where it
  read `jupiter_equatorial_inertial`, and likewise for the other five
  systems. Neptune's pole moved by 0.51 degrees, Mars's and Jupiter's by one
  or two arcseconds, and the other three did not move.

- `renderChart` and `renderPng` describe the API's headings as they now are.
  Every heading names the drawn frame's Ascendant sign and degree, and
  `options.lang` picks `en` or `tr` for it.

## 0.1.0-alpha.3

- `planetarySystem` calculates a planet's satellites for a birth, in three
  frames at once. It is the API's new operation, so the client has 68
  methods. Its body is sent as given, as in
  `client.planetarySystem({ birth, parent: "jupiter" })`, and it needs a plan
  with extended bodies.
- Its answer is typed and checked like every other typed answer. A satellite
  kernel's coverage reads as pairs of Julian days, typed as
  `readonly [number, number]`.

## 0.1.0-alpha.2

- The four custom body methods answer with typed results, as the API's
  schema now describes them. `saveCustomBody` answers with the placement and
  whether it was saved, and `chartWithCustomBody` with the placement.
  `customBodies` answers with the count and the saved bodies, and
  `deleteCustomBody` with whether the body was deleted. Each answer is
  checked against its shape before it is returned, like every other typed
  answer. The answers themselves did not change.

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
