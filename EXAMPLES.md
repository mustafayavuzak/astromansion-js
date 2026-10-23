# AstroMansion JavaScript Examples

This cookbook uses the public methods shipped by the SDK. Copy an example,
set an API key, and run it without building request envelopes by hand.

```bash
export ASTROMANSION_API_KEY="your key"
npm install astromansion
```

On Windows PowerShell, set the key with:

```powershell
$env:ASTROMANSION_API_KEY = "your key"
```

No key yet? `new AstroMansion({ requireKey: false })` runs the natal example
as a visitor, as the README's "Try it without an account" shows.

The examples use this birth data:

```js
const BIRTH = {
  date: "2000-01-01",
  time: "12:00",
  lat: 51.4779,
  lon: 0,
  timezone: "Europe/London",
};
```

An IANA timezone is preferable when the calculation may cross a daylight-saving
boundary. A numeric UTC offset is also accepted.

Short fragments below assume `BIRTH` is defined and `client` is an
`AstroMansion` instance. The complete sections show client construction when
it materially affects the example. Each runs as an ES module, where `await`
works at the top level.

## Natal chart

```js
import { AstroMansion } from "astromansion";

const BIRTH = {
  date: "2000-01-01",
  time: "12:00",
  lat: 51.4779,
  lon: 0,
  timezone: "Europe/London",
};

const client = new AstroMansion();
const chart = await client.natal(BIRTH);

console.log("Sun:", chart.summary.Sun.sign);
for (const planet of chart.planets) {
  const state = planet.retrograde ? "retrograde" : "direct";
  console.log(planet.name, planet.sign, planet.dms, planet.house, state);
}
```

Choose a different house system by adding `houses` to the birth object:

```js
const wholeSign = { ...BIRTH, houses: "whole_sign" };
const chart = await client.natal(wholeSign);
```

Build one client and reuse it. JavaScript has no `with` block, and `fetch`
keeps no pool for a client to release, so a client needs no closing.

## Concurrent requests

Every method returns a promise, so independent calls run together:

```js
import { AstroMansion } from "astromansion";

const client = new AstroMansion();
const [natal, aspects] = await Promise.all([
  client.natal(BIRTH),
  client.aspects(BIRTH, { options: { orb: 1, limit: 25 } }),
]);

console.log(natal.summary.Sun.sign);
console.log(aspects.data);
```

This is the Python SDK's async client: JavaScript's one client is
asynchronous, with the same methods and arguments. Do not create one client
per request. One client per key serves the whole program.

## Find a place before calculating

```js
import { AstroMansion } from "astromansion";

const client = new AstroMansion();
const matches = await client.searchPlaces({
  q: "Greenwich",
  limit: 5,
  lang: "en",
});

for (const place of matches.results) {
  console.log(place.label, place.lat, place.lon);
}
```

Use the returned coordinates and timezone rather than guessing a city centre
or a historical UTC offset.

## Extended bodies

Request named categories on `chart`:

```js
import { AstroMansion } from "astromansion";

const client = new AstroMansion();
const chart = await client.chart(BIRTH, {
  options: { categories: ["dwarfs", "centaurs", "arabic_lots"] },
});

for (const [category, bodies] of Object.entries(chart.data.bodies)) {
  for (const body of bodies) {
    console.log(category, body.name, body.sign, body.dms);
  }
}
```

Calculate only a short list of named objects:

```js
const chart = await client.chart(BIRTH, {
  options: {
    include: ["Ceres", "Chiron", "Eris", "Sedna"],
    exclusive: true,
  },
});
```

Large categories are paginated. `bodies` follows every page and returns an
object keyed by category:

```js
const catalog = await client.bodies("fixed_stars", "arabic_lots", BIRTH);

console.log(catalog.fixed_stars.length);
console.log(catalog.arabic_lots.length);
```

The asteroid catalog is intentionally protected from accidental full walks.
Pass `confirmLarge: true` and an `onPage` callback only when the application
really needs every row.

## Synastry and compatibility

```js
import { AstroMansion } from "astromansion";

const PARTNER = {
  date: "1992-11-03",
  time: "08:15",
  lat: 48.8566,
  lon: 2.3522,
  timezone: "Europe/Paris",
};

const client = new AstroMansion();
const synastry = await client.synastry(BIRTH, PARTNER);
const compatibility = await client.compatibility(BIRTH, PARTNER, {
  options: { language: "en", names: ["Alex", "Morgan"] },
});

console.log(synastry.data);
console.log(compatibility.data);
```

`synastry` returns the technical two-chart analysis. `compatibility` returns
the product-level score and interpretation. They answer related but different
questions.

## Predictive techniques

### Transits and stations

```js
const year = await client.transits(BIRTH, {
  options: { year: 2027, orb: 1.0 },
});
const mercury = await client.stations(BIRTH, {
  options: { body: "Mercury", year: 2027 },
});

console.log(year.data);
console.log(mercury.data);
```

Use an explicit range when the application does not need a whole year:

```js
const hits = await client.transitHits(BIRTH, {
  options: {
    body: "Mars",
    natal_point: "Sun",
    from: "2027-01-01",
    to: "2027-03-31",
  },
});
```

### Progressions and returns

```js
const progressed = await client.progression(BIRTH, {
  options: { age: 36, orb: 1.0 },
});
const solarReturn = await client.solarReturn(BIRTH, {
  options: { year: 2027 },
});
```

### Electional scan

```js
const candidates = await client.electional(BIRTH, {
  options: {
    from: "2027-06-01",
    to: "2027-06-07",
    step_minutes: 30,
    top: 10,
  },
});

for (const candidate of candidates.data) {
  console.log(candidate);
}
```

Date ranges are interpreted at the birth location. Keep the timezone in the
birth object so local day boundaries remain local.

## Vedic calculations

```js
const vedic = await client.vedicChart(BIRTH, {
  options: { ayanamsa: "true_citra", node_mode: "mean" },
});
const navamsa = await client.navamsa(BIRTH, {
  options: { division: "D9", ayanamsa: "true_citra" },
});
const dasha = await client.vimshottari(BIRTH, {
  options: { ayanamsa: "true_citra", levels: 2 },
});

console.log(vedic.data);
console.log(navamsa.data);
console.log(dasha.data);
```

The selected ayanamsa and node mode are explicit so another system can
reproduce the same chart.

## MansionSQL

Select tight natal aspects:

```js
const aspects = await client.query({
  birth: BIRTH,
  sql: "SELECT a, b, aspect, orb FROM aspects WHERE orb < 1 ORDER BY orb LIMIT 20",
});

for (const row of aspects.data) {
  console.log(row.a, row.aspect, row.b, row.orb);
}
```

Aggregate planets by element:

```js
const balance = await client.query({
  birth: BIRTH,
  sql: "SELECT ELEMENT(sign) AS element, COUNT(*) AS n FROM planets GROUP BY ELEMENT(sign) ORDER BY n DESC",
});
```

Render a terminal table instead of JSON:

```js
const table = await client.query({
  birth: BIRTH,
  sql: "SELECT name, sign, dms FROM planets ORDER BY longitude",
  format: "box",
  border: "round",
});
console.log(table);
```

MansionSQL accepts `SELECT` only. The complete table, function, aggregation,
join, subquery, and result-limit contract is documented in the
[README](README.md#mansionsql).

## SVG, PNG, PDF, CSV, and share cards

```js
import { AstroMansion } from "astromansion";

const client = new AstroMansion();
await client.renderSvg(BIRTH, {
  options: { theme: "dark", scale: 1.5 },
  output: "chart.svg",
});
await client.renderPng(BIRTH, {
  options: { theme: "dark", width: 1600 },
  output: "chart.png",
});
await client.exportPdf(BIRTH, { output: "chart.pdf" });
await client.exportCsv(BIRTH, { output: "chart.csv" });
await client.renderSharecard(BIRTH, null, {
  type: "natal",
  name: "Alex",
  lang: "en",
  output: "sharecard.svg",
});
```

Without `output`, document methods return the bytes and never touch the file
system:

```js
const svg = await client.renderSvg(BIRTH);
console.log(svg.length, "bytes");
```

`output` needs a file system, which Node.js, Bun and Deno have. On an edge
runtime or in React Native, leave it out and handle the bytes.

## Enterprise batch and background jobs

Batch several independent calculations into one request:

```js
const result = await client.batch({
  items: [
    { technique: "natal", body: { birth: BIRTH, options: {} } },
    {
      technique: "solar-return",
      body: { birth: BIRTH, options: { year: 2027 } },
    },
  ],
});
```

Queue a long-running operation and poll its state:

```js
const accepted = await client.submitJob({
  technique: "transits",
  body: { birth: BIRTH, options: { year: 2027 } },
});
const status = await client.job(accepted.id);
console.log(status.state);
```

Batch and job methods require the corresponding plan scope. A queued response
does not imply completion. Poll until the state is terminal or configure the
documented signed callback URL.

## Errors and request IDs

```js
import {
  AstroMansion,
  AstroMansionError,
  PermissionDeniedError,
  QuotaExceededError,
  RateLimitError,
  ValidationError,
} from "astromansion";

try {
  const client = new AstroMansion();
  const result = await client.natal(BIRTH);
} catch (error) {
  if (error instanceof ValidationError) {
    console.log("invalid request", error.details);
  } else if (error instanceof PermissionDeniedError) {
    console.log("the current plan does not include this operation");
  } else if (error instanceof RateLimitError) {
    console.log("retry after", error.retryAfter);
  } else if (error instanceof QuotaExceededError) {
    console.log("the billing-period allowance is exhausted");
  } else if (error instanceof AstroMansionError) {
    console.log(error.requestId, error.errorCode, String(error));
  }
}
```

The client retries connection failures, HTTP 429, and HTTP 5xx responses twice
by default. It does not retry validation, authentication, or permission errors.

## Call a newly published endpoint

The generated methods cover every endpoint in the release. If the server adds
one before the next SDK release, use the transport directly without giving up
authentication, retries, or response decoding:

```js
const result = await client.request("POST", "/v1/new-technique", {
  json: { birth: BIRTH, options: {} },
});
```

Replace the raw request with the generated named method after upgrading the
SDK.
