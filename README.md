![Astro Mansion, Official JavaScript SDK](https://raw.githubusercontent.com/mustafayavuzak/astromansion-js/main/banner.webp)

# AstroMansion

[![npm](https://img.shields.io/npm/v/astromansion)](https://www.npmjs.com/package/astromansion)
[![Node.js](https://img.shields.io/node/v/astromansion)](https://www.npmjs.com/package/astromansion)
[![License](https://img.shields.io/npm/l/astromansion)](LICENSE)

Official JavaScript and TypeScript client for the [AstroMansion](https://astromansion.com) astrology API.

Nothing is computed locally. Every call reaches `https://api.astromansion.com`,
which owns the ephemeris, your plan, your quota and your rate limit. The
package never opens a feature the server did not grant.

It is the JavaScript twin of the
[Python SDK](https://github.com/mustafayavuzak/astromansion-python): the same
methods under the same names, written in camelCase, the same arguments, the
same answers, and the same errors.

## Install

```bash
npm install astromansion
```

Node.js 22 or newer, Bun, Deno, and edge runtimes such as Cloudflare Workers.
The package has no dependency. It sends through the platform's own `fetch`,
with types included.

Behind a corporate proxy, a SOCKS proxy or Tor, pass a `fetch` that goes
through it. The package adds no dependency for that. With undici's
`ProxyAgent`:

```js
import { fetch as undiciFetch, ProxyAgent } from "undici";
import { AstroMansion } from "astromansion";

const proxy = new ProxyAgent("http://proxy.example:8080");
const client = new AstroMansion({
  fetch: (input, init) => undiciFetch(input, { ...init, dispatcher: proxy }),
});
```

A SOCKS dispatcher, such as the one `fetch-socks` builds for Tor, goes in the
same place.

## Try it without an account

The natal chart endpoint also answers visitors, under the API's
[visitor limits](https://astromansion.com/en/docs#limits), which are counted
per IP address. Ask for that explicitly:

```js
import { AstroMansion } from "astromansion";

const client = new AstroMansion({ requireKey: false });

const chart = await client.natal({
  date: "2000-01-01",
  time: "12:00",
  lat: 51.4779,
  lon: 0,
  timezone: "Europe/London",
});

console.log(chart.summary.Sun.sign);
```

Without `requireKey: false` a missing key is still an error, so an application
that lost its key fails at once instead of quietly running on visitor limits.

## Get an API key

[Create a free account](https://astromansion.com/en/developers?ref=js-sdk#register),
confirm your email address, then open your account page and generate a key.
The Free plan costs nothing. Requests made with the key count against that
account, under the plan it already has.

## First chart

Put the key in the environment rather than in your source.

macOS and Linux:

```bash
export ASTROMANSION_API_KEY="your key"
```

Windows PowerShell:

```powershell
$env:ASTROMANSION_API_KEY = "your key"
```

Windows Command Prompt:

```bat
set ASTROMANSION_API_KEY=your key
```

Each of these lasts for the current terminal. On Windows,
`setx ASTROMANSION_API_KEY "your key"` keeps it for every terminal opened
afterwards.

```js
import { AstroMansion } from "astromansion";

const client = new AstroMansion();

const chart = await client.natal({
  date: "2000-01-01",
  time: "12:00",
  lat: 51.4779,
  lon: 0,
  timezone: "Europe/London",
});

console.log(chart.summary.Sun.sign);
console.log(chart.planets[0].house);
```

Birth data is passed flat. The API nests it under `birth`, and the client does
that for you.

Fields: `date` as `YYYY-MM-DD`, `time` as `HH:MM` (leave it out if unknown),
`lat` and `lon` in decimal degrees, `timezone` as an hour offset or an IANA
zone name, `houses` for a house system. The client checks them before
anything is sent, so a malformed date is reported by the field you wrote.

JavaScript has no keyword arguments, so a method takes one object where the
Python SDK takes keywords. The method's other arguments, such as `options`,
may stand beside the birth fields or come in a second object:

```js
const chart = await client.natal({
  date: "2000-01-01",
  lat: 51.4779,
  lon: 0,
  options: { wheel: true },
});
const same = await client.natal(
  { date: "2000-01-01", lat: 51.4779, lon: 0 },
  { options: { wheel: true } },
);
```

An argument given in both objects, or a field the method does not take, is
refused before a request is sent.

## Where the key comes from

In order: the `apiKey` option, then `setApiKey(...)`, then
`ASTROMANSION_API_KEY`. With none of them the constructor throws
`AuthenticationError` before any request is sent, so a forgotten key is
reported as a forgotten key.

```js
const client = new AstroMansion({ apiKey: "your key" });
```

`new AstroMansion({ requireKey: false })` lifts that check. A key found in any
of the three places is still sent, and without one the request goes out as a
visitor's.

`reset()` drops the module key and the shared client, which is what a test
wants between cases.

## Quick use

For a notebook or a one-file script:

```js
import * as am from "astromansion";

am.setApiKey("your key"); // or rely on the environment
const chart = await am.natal({ date: "2000-01-01", lat: 51.4779, lon: 0 });
```

Applications should build a client instead. Two of them can carry two
different keys, and neither depends on the module's shared state.

## Practical examples

The repository includes a complete, runnable natal-chart program and a
cookbook for the main API workflows:

- [`examples/natal_chart.ts`](https://github.com/mustafayavuzak/astromansion-js/blob/main/examples/natal_chart.ts)
  prints a chart, its aspects, and Arabic lots.
- [`EXAMPLES.md`](https://github.com/mustafayavuzak/astromansion-js/blob/main/EXAMPLES.md)
  covers concurrent requests, extended bodies, synastry, predictive
  techniques, MansionSQL, rendered files, batch jobs, and error handling.

Three common calls use the same birth object:

```js
import { AstroMansion } from "astromansion";

const birth = {
  date: "2000-01-01",
  time: "12:00",
  lat: 51.4779,
  lon: 0,
  timezone: "Europe/London",
};

const client = new AstroMansion();
const natal = await client.natal(birth);
const transits = await client.transits(birth, { options: { year: 2027 } });
await client.renderSvg(birth, { output: "birth-chart.svg" });

console.log(natal.summary.Sun.sign);
console.log(transits.data);
```

JavaScript has no `with` block. `fetch` keeps no connection pool for a client
to release, so a client needs no closing. `client.close()` ends one when you
want any later call refused.

## Async

Every method returns a promise:

```js
import { AstroMansion } from "astromansion";

const client = new AstroMansion();
const [natal, aspects] = await Promise.all([
  client.natal(birth),
  client.aspects(birth, { options: { orb: 1, limit: 25 } }),
]);
```

The Python SDK has two clients, `AstroMansion` and `AsyncAstroMansion`,
because Python cannot make one class serve both. Networking in JavaScript is
asynchronous, so the one `AstroMansion` is the counterpart of Python's
`AsyncAstroMansion`, with the same method names, the same arguments, and the
same errors.

## Reading a response

The response is the server's own JSON, readable either way:

```js
chart.summary.Sun.sign;
chart["summary"]["Sun"]["sign"];
chart.toDict();
```

Nothing is remodelled, so a field the API adds reaches you instead of being
dropped, and no field it did not send is invented.

Some endpoints answer with the data itself and some wrap it as
`{"technique": ..., "result": ...}`. The client opens that wrapper, so every
response reads the same way and you never have to remember which kind you
called:

```js
const chart = await client.vedicChart({
  date: "2000-01-01",
  lat: 51.4779,
  lon: 0,
});

chart.data; // the payload, wrapper removed
chart.technique; // what the server called it, when it said
chart.raw; // the untouched body, wrapper included
```

A body that carries a real `result` field of its own is left alone. The
wrapper is recognised by its exact shape rather than by the presence of a
name that data is allowed to use.

Where JavaScript reads differently from Python:

- A field the answer does not carry reads as `undefined`. Python's `Result`
  raises `AttributeError` there and lists the fields it has. In JavaScript,
  `await`, `JSON.stringify`, `console.log`, and React look up names an object
  may lack, and a `Result` that threw would break them. TypeScript names a
  mistyped field before the code runs.
- `data`, `raw`, `technique`, `toDict`, and `toString` belong to the
  `Result`. Python can read `chart.technique` and `chart["technique"]` apart.
  In JavaScript the two are one, so a data field of one of these names is read
  through `data`, as in `chart.data.technique`.
- Each answer is checked against the shape the API publishes before it is
  returned, which is what lets TypeScript type it field by field. An answer
  outside that shape rejects with an `AstroMansionError` whose `errorCode` is
  `unexpected_answer`, and the answer itself is the error's `details`. The
  Python SDK returns such an answer as it arrived.
- An answer whose shape the API's schema leaves open, as most techniques'
  results are, comes back as JSON values. In TypeScript, narrow them before
  reading a field.

## Arabic lots, fixed stars and the rest of the catalog

`natal` answers with the chart proper. Anything beyond it is named on `chart`,
through `options.categories`:

```js
const lots = await client.chart(
  {
    date: "2000-01-01",
    time: "12:00",
    lat: 51.4779,
    lon: 0,
    timezone: "Europe/London",
  },
  { options: { categories: ["arabic_lots"] } },
);

for (const lot of lots.data.bodies.arabic_lots) {
  console.log(lot.name, lot.sign, lot.dms, lot.house);
}
```

Bodies come back grouped under the category that produced them, so read the
group you asked for. The catalog publishes 38 Arabic lots and 908 named
fixed-star entries, along with `planets`, `dwarfs`, `asteroids`, `centaurs`,
`comets`, `hypotheticals`, `points`, `advanced_points`, `lilith`,
`planetary_nodes`, `exoplanets`, `antiscia` and `eclipses`. The API still
accepts the retired `moons` selector as an input alias, but responses use
`antiscia`.

White Moon is filed under `hypotheticals` and comes back named
`Selena/White Moon`. The retired `white_moon` selector is still accepted, but
it now answers the whole `hypotheticals` group. For White Moon alone, pass
`options: { include: ["White Moon"], exclusive: true }`.

The `fixed_stars` calculation category resolves 906 unambiguous targets.
`Isis` and `Ketu` remain discoverable catalog names, but a bare-name lookup for
either resolves the higher-priority non-stellar point with the same name.

`chart` answers one page at a time, and a large category is more than one
page. Use `bodies` to read the whole of it and let the client follow the
paging:

```js
const found = await client.bodies("fixed_stars", "arabic_lots", {
  date: "2000-01-01",
  time: "12:00",
  lat: 51.4779,
  lon: 0,
  timezone: "Europe/London",
});

found.fixed_stars.length; // 906, in six requests
found.arabic_lots.length; // 38
```

Naming several categories reads them in one walk. The return is always an
object keyed by the categories you asked for, one or several, so the shape
never depends on how many.

Each page costs a network round trip and the calculation inside it is a
rounding error beside that, so `bodies` asks for the largest page the API
serves. `pageSize` lowers it, and lowering it buys nothing. The 906
calculation targets take six requests at the default page size.

Some categories are enormous. `asteroids` holds twenty-eight thousand bodies,
which is a hundred and seventy-seven round trips with nothing printed until
the last one lands, and a program that prints nothing for a minute cannot be
told apart from one that has hung. A walk that large stops after the first
page and tells you the size:

```js
await am.bodies("asteroids", { date: "2000-01-01", lat: 51.4779, lon: 0 });
// ValidationError: asteroids holds 28214 bodies, which is 177 requests and
// will print nothing until the last one lands. Pass confirmLarge: true ...
```

Read it anyway, or watch it arrive:

```js
const found = await client.bodies("asteroids", {
  date: "2000-01-01",
  lat: 51.4779,
  lon: 0,
  confirmLarge: true,
  onPage: (done, left, rows) => console.log(`${done} done, ${left} to go`),
});
```

For a handful of named bodies there is no walk at all:

```js
const page = await client.chart(
  { date: "2000-01-01", lat: 51.4779, lon: 0 },
  {
    options: { include: ["Ceres", "Pallas", "Juno", "Vesta"], exclusive: true },
  },
);

for (const rows of Object.values(page.data.bodies)) {
  for (const body of rows) {
    console.log(body.name, body.sign, body.dms);
  }
}
```

Read every group rather than the one you expected. Bodies are filed under the
category the catalog puts them in, not the category you were thinking of when
you named them. Ceres was an asteroid in 1801 and has been a dwarf planet
since 2006, so it arrives under `dwarfs` while Pallas, Juno and Vesta arrive
under `asteroids`. A loop over `bodies.asteroids` alone finds three of the
four and reports the fourth as missing.

`exclusive` narrows the catalog, not the chart. The angles and the derived
points are calculated either way, so `points` and `advanced_points` are still
in the answer. Filter by name if you want only what you asked for:

```js
const wanted = new Set(["Ceres", "Pallas", "Juno", "Vesta"]);

for (const rows of Object.values(page.data.bodies)) {
  for (const body of rows) {
    if (wanted.has(body.name)) {
      console.log(body.name, body.sign, body.dms);
    }
  }
}
```

Reach for `chart` directly when you want one page rather than the category,
and read the group with `?? []`. The chart's own bodies are calculated
alongside the categories you name and the page is a window over that whole
selection, so a small `catalog_limit` can fill the first page with planets
and angles before a single star appears, leaving no `fixed_stars` key at all.
`catalog_page.total` counts the whole selection rather than any one category.

There is no ceiling on how many you may read this way. `options.all_bodies`
walks every category at once and needs the full-catalog scope that comes with
Pro and Enterprise. Naming the categories yourself does not.

## MansionSQL

A chart is a table of bodies, a table of houses and a table of aspects, and
the questions people ask of one are the questions SQL was written for: which
planets are retrograde, which aspects are inside a degree, how the signs are
distributed. `query` sends a `SELECT` and the server calculates the chart and
answers it.

```js
const rows = await client.query({
  birth: {
    date: "2000-01-01",
    time: "12:00",
    lat: 51.4779,
    lon: 0,
    timezone: 0,
  },
  sql: "SELECT name, sign, dms FROM planets WHERE retrograde = 1",
});

for (const row of rows.data) {
  console.log(row.name, row.sign, row.dms);
}
// Saturn Taurus 10°23′44″
```

`query` takes the request body rather than flat birth fields, because a
statement may name two charts and a moment, and each of them needs its own
birth block. It needs the `advanced` scope.

### Tables

Every table but three carries the body columns: `code`, `name`, `longitude`,
`latitude`, `distance`, `speed`, `sign`, `sign_index`, `house`, `retrograde`,
`dms`, `category`.

| Table                                                                                                                             | One row per                        |
| --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `chart`, `bodies`                                                                                                                 | every body the chart calculated    |
| `planets`                                                                                                                         | the planets                        |
| `points`                                                                                                                          | angles and derived points          |
| `advanced_points`                                                                                                                 | the further derived points         |
| `dwarfs`, `centaurs`, `comets`, `antiscia`, `eclipses`, `lilith`, `exoplanets`, `hypotheticals`, `planetary_nodes`, `arabic_lots` | that catalog category              |
| `natal_a`                                                                                                                         | the `birth` chart, named for joins |
| `natal_b`                                                                                                                         | the `partner` chart                |
| `transits`                                                                                                                        | the `moment` chart                 |

Three have columns of their own:

| Table     | One row per                                               | Columns                                                              |
| --------- | --------------------------------------------------------- | -------------------------------------------------------------------- |
| `houses`  | each of the twelve                                        | `number`, `cusp`, `sign`, `dms`, `size`, `bodies`                    |
| `aspects` | each aspect found                                         | `a`, `b`, `aspect`, `angle`, `orb`, `separation`, `a_sign`, `b_sign` |
| `stars`   | each point placed against a stellar position, 953 of them | `name`, `longitude`, `latitude`, `sign`, `dms`, `magnitude`, `orb`   |
| `lots`    | each Arabic lot the engine computes, 38 of them           | `name`, `longitude`, `sign`, `dms`, `house`                          |

`natal_b` needs `partner`, and a statement naming it without one is refused.
`transits` uses `moment`, and without one it is the current instant at the
birth location.

There is no `asteroids` table. One chart holds at most 192 bodies and the
category is twenty-eight thousand, so the query is refused rather than
silently reduced to the first 192:

```js
await client.query({ birth, sql: "SELECT name FROM asteroids" });
// ValidationError: The query asks for more bodies than one chart can hold.
// Narrow it with WHERE name = 'Pallas', a minor planet number such as
// WHERE name = '1198', or WHERE name IN (...). Use /v1/catalog to look a
// body up by name.
```

`stars` answers 953 rows, the `fixed_stars` catalog lists 908 names, and the
category walk returns 906 unambiguous calculation targets. These are different
selections, so a count taken from one does not describe the others. The table
contains every catalog row the engine places against a stellar position: 908
fixed-star rows, 40 exoplanets and 5 galactic and deep-sky points filed under
`advanced_points`. One row per published name means counting rows and names
gives the same answer.

`lots` and the `arabic_lots` category do not divide that way. Both answer 38.
The table gives the lots computed for one chart, the category gives the names
those lots are looked up by, and they are the same 38 lots.

`SELECT` only. Anything else is refused before it reaches the engine, so a
statement cannot write, drop or reach outside the chart it was given.

```js
await client.query({ birth, sql: "DELETE FROM planets" });
// ValidationError: expected SELECT at offset 0
```

### A hundred rows

An answer is capped at a hundred rows, and a statement that would exceed it is
refused rather than truncated, so a partial answer never arrives looking whole:

```js
await client.query({ birth, sql: "SELECT name FROM stars" });
// ValidationError: MansionSQL returned 100 rows of 953; add LIMIT or narrow
// the query
```

Add `LIMIT`, or narrow with `WHERE`. `COUNT(*)` is one row, so counting a
large table is always available.

### What the dialect supports

`WHERE`, `GROUP BY`, `HAVING`, `ORDER BY`, `LIMIT`, `OFFSET`, `DISTINCT`,
`JOIN`, `AS`, `IN`, `NOT IN`, `LIKE`, `BETWEEN`, `IS NULL`, `EXISTS`,
`CASE WHEN`, and comparison and arithmetic on any column.

Clauses apply in the SQL order, which is worth stating because it decides what
`HAVING` sees and what the hundred-row cap counts:

```
FROM -> WHERE -> GROUP BY -> HAVING -> SELECT -> ORDER BY -> LIMIT
```

```js
// The tightest aspects first.
"SELECT a, b, aspect, orb FROM aspects WHERE orb < 1 ORDER BY orb LIMIT 20";

// How the chart is distributed.
"SELECT sign, COUNT(*) AS n FROM planets GROUP BY sign ORDER BY n DESC";

// Angles only.
"SELECT number, sign, dms FROM houses WHERE number IN (1, 10)";

// Each planet with the sign on the cusp of the house it occupies.
"SELECT p.name, h.sign FROM planets p JOIN houses h ON p.house = h.number";

// The brightest fixed stars.
"SELECT name, sign, dms, magnitude FROM stars ORDER BY magnitude LIMIT 10";
```

#### Aggregates

| Function     | Argument       | On an empty set | Notes                                          |
| ------------ | -------------- | --------------- | ---------------------------------------------- |
| `COUNT(*)`   | none           | `0`             | counts rows                                    |
| `COUNT(col)` | any            | `0`             | counts non-`NULL` values, so it can be smaller |
| `MIN(col)`   | number or text | `NULL`          | text compares lexically                        |
| `MAX(col)`   | number or text | `NULL`          | text compares lexically                        |
| `AVG(col)`   | number         | `NULL`          | refuses a text column                          |
| `SUM(col)`   | number         | `NULL`          | refuses a text column                          |

`AVG` and `SUM` refuse a column that is not numeric rather than skipping the
rows they cannot read. Skipping is the dangerous answer. Over a column that is
numeric for some rows and text for others it returns the average of part of
the column with nothing to say the rest was dropped.

```js
await client.query({ birth, sql: "SELECT AVG(sign) AS v FROM planets" });
// ValidationError: AVG requires a numeric column; sign is text
```

`HAVING` filters groups after grouping, and its operands may be aggregates. It
requires a `GROUP BY`. Some engines allow it without one and read the whole
result as a single group, but in practice a bare `HAVING` is a `WHERE` written
in the wrong place, and saying so is more use than answering it.

```js
// Stellium: three or more bodies in one sign.
"SELECT sign, COUNT(*) AS n FROM planets GROUP BY sign HAVING COUNT(*) >= 3";

// Signs the chart moves slowly through.
"SELECT sign, AVG(speed) AS v FROM planets GROUP BY sign HAVING AVG(speed) < 0";
```

An aggregate collapses rows, so `SELECT COUNT(*) FROM stars` is one row and
never meets the hundred-row cap. The cap counts the final result, after
`HAVING`.

#### Astrological functions

Scalar functions, usable anywhere a column is: in `SELECT`, `WHERE`,
`GROUP BY`, `ORDER BY`, and inside an aggregate. All are lookups or integer
arithmetic, and none of them calculates anything further.

| Function                                | Argument                   | Returns                                                    |
| --------------------------------------- | -------------------------- | ---------------------------------------------------------- |
| `ELEMENT(sign)`                         | sign name                  | `fire`, `earth`, `air`, `water`                            |
| `MODALITY(sign)`                        | sign name                  | `cardinal`, `fixed`, `mutable`                             |
| `RULER(sign)`                           | sign name                  | the traditional ruler's name                               |
| `DIGNITY(body, sign)`                   | body and sign names        | `domicile`, `exaltation`, `detriment`, `fall`, `peregrine` |
| `DECAN(longitude)`                      | degrees                    | `1`, `2` or `3`                                            |
| `ANGULAR(house)`                        | 1 to 12                    | `angular`, `succedent`, `cadent`                           |
| `ORB(a, b)`                             | two longitudes             | their separation, never over 180                           |
| `SEPARATION(a, b)`                      | two longitudes             | the same                                                   |
| `ABS`, `ROUND`, `FLOOR`, `CEIL`, `SIGN` | a number                   | the usual arithmetic                                       |
| `COALESCE(a, b, …)`                     | up to 16 values            | the first that is not `NULL`                               |
| `LENGTH(text)`                          | text                       | its length in characters                                   |
| `SUBSTR(text, from[, count])`           | text and 1-based positions | the slice                                                  |

`RULER` is the traditional rulership and only that: Mars for Scorpio, Saturn
for Aquarius, Jupiter for Pisces. A modern variant would be a second answer to
the same question decided by a setting the statement cannot show, so one query
would mean two things. If it is wanted it will be a second function under its
own name.

`DIGNITY` is the classical seven-planet table. Anything outside the seven is
`peregrine`, including Uranus, Neptune, Pluto and the asteroids. Inventing a
domicile for them would be inventing astrology rather than reading it.
Triplicity, term and face are real dignities and are deliberately not reported,
because they need a degree and a day-night distinction and this function is
given a sign. Mercury in Virgo holds both domicile and exaltation and is
reported as `domicile`.

`LENGTH` and `SUBSTR` count characters, not bytes. A degree reads
`11°1′36″`, which is eight characters written in thirteen bytes, so `LENGTH`
answers 8 and `SUBSTR(dms, 3, 1)` answers `°` rather than the first half of it.

`COALESCE` earns its place on aggregates. No column of a chart is ever `NULL`,
but an aggregate over a group that matched nothing is, so
`COALESCE(AVG(orb), 0)` is the way to ask for a floor instead of an unknown.

`NULL` in, `NULL` out. A body with no house returns `NULL` from `ANGULAR`
rather than a default. A name no sign or body carries is refused, and the
message quotes the value it was given:

```js
await client.query({ birth, sql: "SELECT ELEMENT('Lion') AS e FROM planets" });
// ValidationError: ELEMENT does not know the sign 'Lion'
```

```js
// Elemental balance.
"SELECT ELEMENT(sign) AS element, COUNT(*) AS n FROM planets GROUP BY ELEMENT(sign) ORDER BY n DESC";

// Planets in their own sign.
"SELECT name, sign FROM planets WHERE DIGNITY(name, sign) = 'domicile'";

// The single tightest aspect in the chart.
"SELECT MIN(orb) AS tightest FROM aspects";

// Angular houses only, with the decan.
"SELECT name, sign, DECAN(longitude) AS decan FROM planets WHERE ANGULAR(house) = 'angular'";
```

#### Subqueries

A subquery may stand after `IN` or `NOT IN`, after `EXISTS`, or as a single
value in the `SELECT` list. The inner statement may name a different table
than the outer one. Both charts are already calculated, so this filters data
in hand rather than calculating a second time.

```js
// Everything aspecting a retrograde planet.
"SELECT a, b, aspect, orb FROM aspects WHERE a IN (SELECT name FROM planets WHERE retrograde = 1)";
```

The inner statement must select exactly one column, and is told so by count:

```js
await client.query({
  birth,
  sql: "SELECT a FROM aspects WHERE a IN (SELECT name, sign FROM planets)",
});
// ValidationError: subquery must select one column, got 2
```

The hundred-row cap applies to the final answer only. An inner query may
legitimately produce all 953 stars while the outer answer is three rows.

`NOT IN` follows standard SQL where the inner set contains a `NULL`, which
surprises people and is worth stating plainly. **If any inner value is `NULL`,
`NOT IN` returns no rows at all.** The comparison is unknown rather than false,
and unknown is not true, so nothing passes. `IN` is unaffected, and it still
matches the values that are there. Add `WHERE col IS NOT NULL` to the inner
statement when the column has gaps. An empty inner set behaves the way the
logic implies. `IN` matches nothing, and `NOT IN` matches everything.

Two charts in one statement, which is synastry written as a join:

```js
const rows = await client.query({
  birth: {
    date: "2000-01-01",
    time: "12:00",
    lat: 51.4779,
    lon: 0,
    timezone: 0,
  },
  partner: {
    date: "1995-03-14",
    time: "08:20",
    lat: 48.8566,
    lon: 2.3522,
    timezone: "Europe/Paris",
  },
  sql: "SELECT a.name, a.sign, b.name AS partner FROM natal_a a JOIN natal_b b ON a.sign = b.sign LIMIT 50",
});
```

And transits against the natal chart:

```js
const rows = await client.query({
  birth: {
    date: "2000-01-01",
    time: "12:00",
    lat: 51.4779,
    lon: 0,
    timezone: 0,
  },
  moment: {
    date: "2026-08-17",
    time: "12:00",
    lat: 51.4779,
    lon: 0,
    timezone: 0,
  },
  sql: "SELECT t.name, t.sign, n.name AS natal FROM transits t JOIN chart n ON t.sign = n.sign LIMIT 50",
});
```

A join multiplies rows, so it reaches the hundred sooner than a plain select.
Both of these overrun it without the `LIMIT`.

### Rendered output

Without `format` the answer is rows. `box` and `csv` render it as text, meant
for a terminal rather than for parsing, and arrive as a string:

```js
console.log(
  await client.query({
    birth,
    sql: "SELECT name, sign FROM planets LIMIT 3",
    format: "box",
  }),
);
// ┌─────────┬───────────┐
// │ name    │ sign      │
// ├─────────┼───────────┤
// │ Sun     │ Capricorn │
// └─────────┴───────────┘
```

`border` picks the box style from `sharp`, `round`, `ascii`, `rules` and
`markdown`.

`json` renders too, and the client parses it back, so it reads like any other
response rather than like a string you have to decode yourself.

`scalar` returns the single value a one-row, one-column answer holds, and
`object` returns a one-row answer as an object, which saves indexing into a
list of one:

```js
(
  await client.query({
    birth,
    sql: "SELECT COUNT(*) AS n FROM stars",
    format: "scalar",
  })
).data;
// 953

(
  await client.query({
    birth,
    sql: "SELECT name, sign FROM planets LIMIT 1",
    format: "object",
  })
).data.sign;
// "Capricorn"
```

## Every endpoint

Every published operation, 68 of them, has a method on the client and a
module-level shortcut, all generated from the schema. They are the Python
SDK's methods under the same names, written in camelCase: `natal`,
`transits`, `synastry`, `composite`, `solarReturn`, `progression`,
`harmonics`, `astrocartography`, `vedicChart`, `zodiacalReleasing`,
`firdaria`, `horary`, `electional` and the rest. Python's `render_png` is
`renderPng` here, and `search_places` is `searchPlaces`.

Anything new is reachable before this client names it:

```js
const result = await client.request("POST", "/v1/harmonics", {
  json: { birth },
});
```

Authentication, timeouts, retries and error handling behave identically there.

## Errors

```js
import { QuotaExceededError, RateLimitError } from "astromansion";

try {
  const chart = await client.natal({
    date: "2000-01-01",
    lat: 51.4779,
    lon: 0,
  });
} catch (error) {
  if (error instanceof RateLimitError) {
    console.log("wait", error.retryAfter, "seconds");
  } else if (error instanceof QuotaExceededError) {
    console.log("this period's allowance is spent");
  }
}
```

| Error                            | Meaning                                                    |
| -------------------------------- | ---------------------------------------------------------- |
| `AuthenticationError`            | Key missing, malformed or unknown                          |
| `PermissionDeniedError`          | Valid key, feature not in the plan                         |
| `QuotaExceededError`             | Allowance for the period is spent                          |
| `RateLimitError`                 | Too many requests just now, and `retryAfter` says how long |
| `ValidationError`                | Request rejected, and `details` names the field            |
| `NotFoundError`, `ConflictError` | Missing resource, conflicting state                        |
| `ServerError`                    | The API failed to answer                                   |
| `AstroMansionConnectionError`    | The request never completed                                |

All descend from `AstroMansionError`. Each carries `statusCode`, `errorCode`,
`details`, `requestId` and `retryAfter` when the API supplies them.

## Rate limits and quota

A rate limit clears on its own after `retryAfter`. A spent quota does not, and
it needs a new period or a larger plan. They are separate errors for that
reason.

The client retries only failures that carry no result. These are connection
errors, 429 and 5xx. It retries them twice by default and honours
`Retry-After`. A refusal you must fix is never retried.

```js
const client = new AstroMansion({ timeout: 60, maxRetries: 0 });
```

`timeout` is in seconds, as in the Python SDK. `fetch` cannot time the
connection apart from the answer, so the timeout covers each whole attempt.

## Documents

```js
import { writeFile } from "node:fs/promises";

const pdf = await client.exportPdf({
  date: "2000-01-01",
  lat: 51.4779,
  lon: 0,
});

await writeFile("chart.pdf", pdf);
```

Or name a path and let the client write it:

```js
await client.exportPdf({
  date: "2000-01-01",
  lat: 51.4779,
  lon: 0,
  output: "chart.pdf",
});
```

Every endpoint that answers with a document takes `output` the same way:
`exportPdf`, `exportCsv`, `exportReport`, `renderSvg`, `renderPng`,
`renderBiwheel`, `renderAstrocartography` and `renderSharecard`, and their
module-level shortcuts.

```js
await client.renderSvg({
  date: "2000-01-01",
  lat: 51.4779,
  lon: 0,
  output: "wheel.svg",
});
```

Nothing is written to disk unless you name a path, so a call cannot overwrite
a file you did not choose. Without one you get the bytes and decide yourself.

Writing needs a file system, which Node.js, Bun and Deno have. An edge
runtime and React Native have none. There a call with `output` is refused
before the request is sent, so no quota is spent. The refusal is a
`ValidationError` that says "output needs a file system, and this runtime has
none. Leave output out to get the bytes."

## Security

The key travels in the `X-API-Key` header, never in a URL. It is masked in
`String(client)` and appears in no error or log line the package writes.
Keep it in the environment or a secret store, not in source control. Rotate it
from your account page if it leaks.

A browser page and a React Native app ship their code to every user, so a key
inside one is everyone's key. A client built there with a key is refused.
Call the API from your own server, build a visitor client with
`requireKey: false` and no key, or pass `dangerouslyAllowBrowser: true` to
accept that risk. The Python SDK never runs in either place, so it has no
such guard.

## Staging

```js
const client = new AstroMansion({ baseUrl: "http://localhost:8000" });
```

Also readable from `ASTROMANSION_BASE_URL`.

## Links

- [Examples cookbook](https://github.com/mustafayavuzak/astromansion-js/blob/main/EXAMPLES.md)
- [API reference](https://api.astromansion.com/docs)
- [Documentation](https://astromansion.com/en/docs)
- [Python SDK](https://github.com/mustafayavuzak/astromansion-python)
