# AstroMansion

Official JavaScript and TypeScript client for the [AstroMansion](https://astromansion.com) astrology API.

> Early alpha. `0.1.0-alpha.1` has a typed method for each of the API's
> endpoints, and `request()` for any published path. The stable `0.1.0`
> follows.

Nothing is computed locally. Every call reaches `https://api.astromansion.com`,
which owns the ephemeris, your plan, your quota and your rate limit. The
package never opens a feature the server did not grant.

## Install

```bash
npm install astromansion@next
```

The package targets Node.js 22 or newer, Bun, Deno, edge runtimes such as
Cloudflare Workers, and React Native. It has no runtime dependencies.

## Use

```ts
import { AstroMansion } from "astromansion";

const client = new AstroMansion(); // reads ASTROMANSION_API_KEY
const birth = {
  date: "2000-01-01",
  time: "12:00",
  lat: 51.4779,
  lon: 0,
  timezone: "Europe/London",
};

const chart = await client.natal({ birth }); // NatalResponse
const wheel = await client.renderPng({ birth }); // the PNG's bytes
const eclipses = await client.eclipses({ year: 2027 }); // EclipsesResponse
```

Each method is named after its endpoint's operation in the API's schema, and
its body, query, and answer are typed by that schema. A method checks its
answer against the shape the API publishes before returning it. An answer
outside that shape rejects with an `AstroMansionError` whose `errorCode` is
`unexpected_answer`, and the answer itself is the error's `details`.

`request()` reaches any published path, the ones a later API release adds
included:

```ts
const answer = await client.request("POST", "/v1/natal", { json: { birth } });
```

A client built with `requireKey: false` and no key reaches the endpoints the
API serves to visitors without an account.

## License

MIT
