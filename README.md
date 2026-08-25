<div align="center">

# readme-svg-generator

**Dynamic SVG stats, status and tech-stack cards for your GitHub profile README.**

Square corners, hairline rules, monospace type. No headless browser, no canvas, no dependencies -
just XML strings and HTTP caching.

[![Node](https://img.shields.io/badge/node-%3E%3D18-3fb950?style=flat-square)](https://nodejs.org)
[![Dependencies](https://img.shields.io/badge/dependencies-0-58a6ff?style=flat-square)](package.json)
[![Deploy](https://img.shields.io/badge/deploy-vercel-000?style=flat-square)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fyour-name%2Freadme-svg-generator&env=GITHUB_TOKEN&envDescription=GitHub%20token%20used%20by%20the%20stats%20card)
[![License](https://img.shields.io/badge/license-MIT-c9d1d9?style=flat-square)](#license)

<img src="public/preview/status.svg" alt="Status card" width="495" />
<img src="public/preview/stack.svg" alt="Tech stack card" width="495" />
<img src="public/preview/stats.svg" alt="GitHub stats card" width="495" />

</div>

---

## Why

Most README card services shell out to Puppeteer to screenshot HTML. That is slow, heavy and
expensive to host. Every card here is an SVG document assembled from template strings, so a cold
serverless invocation is a few milliseconds and the whole project installs zero packages.

- **Three endpoints:** status card, tech-stack matrix, GitHub stats.
- **Six themes** plus per-colour overrides from the query string.
- **One visual system:** square corners, hairline rules, monospace type. No gradients, no shadows,
  no rounded pills.
- **Cached hard:** `max-age=14400`, `stale-while-revalidate=86400`.
- **Safe:** every parameter is escaped or validated before it reaches the XML.
- **Accessible:** `role="img"`, a `<title>`, and animations disabled under `prefers-reduced-motion`.
- **A playground** at `/` to build a card and copy the snippet.

---

## Quick start

### Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fyour-name%2Freadme-svg-generator&env=GITHUB_TOKEN&envDescription=GitHub%20token%20used%20by%20the%20stats%20card)

Set `GITHUB_TOKEN` in the Vercel project settings if you want the stats card - the other two need
nothing. A classic token with no scopes is enough for public data; add `repo` only if you want
private contribution counts included.

### Run locally

```bash
git clone https://github.com/your-name/readme-svg-generator.git
cd readme-svg-generator
npm install            # installs nothing - there are no dependencies
cp .env.example .env   # optional, only the stats card reads it
npm run dev            # http://localhost:3000
npm test               # smoke tests for escaping, layout and query parsing
```

`npm run dev` uses a small `node:http` server so you do not need a Vercel account, and loads `.env`
if one is present (Node 20.6+). If you want the real platform behaviour (rewrites, edge headers),
use `npm run dev:vercel`.

Open <http://localhost:3000> for the playground: pick a card, tweak the controls, copy the snippet.

---

## API reference

Base URL is your deployment. Every endpoint also answers on a clean path (`/card`, `/stack`,
`/stats`) thanks to the rewrites in `vercel.json`.

### Shared parameters

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| `theme` | `system` \| `dark` \| `light` \| `dracula` \| `catppuccin` \| `tokyo-night` | `system` | Named palette. `system` is the monochrome default. Unknown names fall back to it. |
| `border` | boolean | `true` | Draw the 2px card outline. |
| `width` | integer | `495` | Card width in pixels. Clamped per endpoint. |
| `animate` | boolean | `true` | Stepped reveal, meter fill and the blinking indicator. `false` emits a static card. |
| `bg_color` | hex | theme | Background override, with or without `#`. |
| `text_color` | hex | theme | Body text override. |
| `accent_color` | hex | theme | Titles, values and progress bars. |
| `border_color` | hex | theme | Border override. |

Booleans accept `true`/`false`, `1`/`0`, `yes`/`no`, `on`/`off`, and a bare flag (`?border`) means
true. Invalid colours are ignored rather than injected, so a bad value degrades to the theme.

### `GET /api/card` - status card

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| `title` | string | `Available for work` | Headline, max 80 chars. |
| `subtitle` | string | *(empty)* | Second line, max 140 chars. Omitting it shortens the card. |
| `label` | string | `STATUS` | Text in the title bar across the top of the card. |
| `pulse` | boolean | `true` | Blinking square status indicator before the title. |
| `pulse_color` | hex | theme accent | Indicator colour. |
| `width` | integer | `495` | 200-1000. |

```markdown
![Status](https://your-app.vercel.app/api/card?title=Available%20for%20work&subtitle=Backend%20and%20platform&theme=tokyo-night)
```

### `GET /api/stack` - tech stack matrix

`categories` names the sections in order; each section's tags come from a parameter named after
it. A category with no matching parameter is skipped.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| `title` | string | `TECH STACK` | Title-bar text, upper-cased. |
| `categories` | comma list | *(all non-reserved params)* | Section names, max 8. |
| `<category>` | comma list | - | Tags for that section, max 24 each. |
| `width` | integer | `495` | 250-1000. Tags wrap to fit; the card grows taller. |

```markdown
![Stack](https://your-app.vercel.app/api/stack?categories=Languages,Tools&Languages=TypeScript,Go,Rust&Tools=Docker,Terraform&theme=catppuccin)
```

Omitting `categories` works too - any parameter that is not a card option is treated as a category:

```markdown
![Stack](https://your-app.vercel.app/api/stack?Languages=Go,Zig&theme=dracula)
```

### `GET /api/stats` - GitHub metrics

Requires `GITHUB_TOKEN` on the server. Results are memoised for 10 minutes per warm instance on top
of the 4 hour edge cache.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| `username` | string | **required** | GitHub handle. Invalid handles render an error card. |
| `show_icons` | boolean | `true` | Single-character marker (`*`, `#`, `>`, `?`, `~`) beside each metric. |
| `hide` | comma list | *(none)* | Any of `stars`, `commits`, `prs`, `issues`, `contributed`, `languages`. |
| `include_private` | boolean | `true` | Count restricted contributions in the commit total. |
| `width` | integer | `495` | 300-1000. |

Metrics: total stars earned, total commits, total PRs, total issues, repositories contributed to,
plus the top five languages by bytes across non-fork repositories, drawn as segmented cell meters.

```markdown
![Stats](https://your-app.vercel.app/api/stats?username=octocat&theme=dracula&hide=issues)
```

Failures (missing token, unknown user, GitHub outage) render a readable error card with
`Cache-Control: no-store`, so a transient problem is not cached for four hours.

---

## Snippet examples

**Markdown**

```markdown
![Available for work](https://your-app.vercel.app/api/card?title=Open%20to%20work&pulse=true&theme=dracula)
```

**HTML, side by side**

```html
<img src="https://your-app.vercel.app/api/stats?username=octocat&theme=tokyo-night&width=420" width="420" />
<img src="https://your-app.vercel.app/api/stack?Languages=Go,TypeScript&theme=tokyo-night&width=420" width="420" />
```

**Light and dark, following the reader's GitHub theme**

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://your-app.vercel.app/api/stats?username=octocat&theme=dark" />
  <img src="https://your-app.vercel.app/api/stats?username=octocat&theme=light" alt="GitHub stats" />
</picture>
```

**Custom colours, no theme**

```markdown
![Terminal](https://your-app.vercel.app/api/card?title=root@localhost&subtitle=uptime%2099.9%25&bg_color=0a0a0a&text_color=00ff9c&accent_color=00ff9c&border_color=1f3d2f)
```

**One card per theme**

```markdown
![system](https://your-app.vercel.app/api/card?title=system&theme=system)
![dark](https://your-app.vercel.app/api/card?title=dark&theme=dark)
![light](https://your-app.vercel.app/api/card?title=light&theme=light)
![dracula](https://your-app.vercel.app/api/card?title=dracula&theme=dracula)
![catppuccin](https://your-app.vercel.app/api/card?title=catppuccin&theme=catppuccin)
![tokyo-night](https://your-app.vercel.app/api/card?title=tokyo-night&theme=tokyo-night)
```

> GitHub proxies images through camo and caches them, so give an updated card a few minutes to
> appear. Appending `&v=2` busts the proxy cache while you iterate.

---

## Project layout

```text
api/                      Vercel serverless routes: parse query, call renderer, set headers
  card.js  stack.js  stats.js
src/renderers/            Pure functions: options in, SVG string out
  renderStatusCard.js  renderStackCard.js  renderStatsCard.js
src/themes/index.js       Palettes and query-string colour overrides
src/utils/sanitize.js     XML escaping and parameter validation
src/utils/svgHelpers.js   Text measurement, tag boxes, meters, rules, animation CSS, response helper
public/index.html         Playground
dev-server.js             node:http dev server (no Vercel account needed)
test.js                   Smoke tests: npm test
```

The split matters: routes never build markup and renderers never touch `req`/`res`, which is why the
cards are testable without a network or a token.

---

## Contributing

### Add a theme

Add four colours to `themes` in [`src/themes/index.js`](src/themes/index.js):

```js
'gruvbox': {
  bg: '#282828',
  text: '#ebdbb2',
  accent: '#fabd2f',
  border: '#3c3836'
}
```

That is the whole change. Renderers derive dim text, rules and meter tracks from those four values
via `mixColor`, so nothing else needs updating. Add the name to the `<select>` in
[`public/index.html`](public/index.html) and to the table above.

### Add a card

1. Write `src/renderers/renderYourCard.js`. Take an options object, return a string, use
   `svgDocument`, `cardBackground` and `styleBlock` from `svgHelpers.js` so it matches the others.
2. Escape every caller-supplied string with `escapeText` and validate every colour with
   `sanitizeColor`. Never interpolate a raw query value.
3. Write `api/your-card.js`: parse the query with the `sanitize.js` helpers, call the renderer, hand
   the result to `sendSvg`.
4. Add the route to `ROUTES` in `dev-server.js` and a rewrite in `vercel.json`.
5. Add assertions to `test.js` - at minimum, that the card is well-formed and that markup in a
   parameter comes out escaped.

### House rules

- No runtime dependencies. If it needs a package, it probably does not belong here.
- Card height is computed, never hardcoded: content must be allowed to grow.
- Hold the visual line: square corners (`rx` is never set), 1px or 2px strokes, `shape-rendering="crispEdges"`
  on anything axis-aligned, monospace type at weight 400 or 700. No gradients, filters, shadows or
  rounded pills - `npm test` fails the status card if a corner radius shows up.
- Keep animations behind `prefers-reduced-motion` and never rely on them for legibility - a card
  with animations disabled must still show everything.

---

## License

MIT.
