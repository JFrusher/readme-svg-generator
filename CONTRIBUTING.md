# Contributing

Thanks for looking. This is a small project with strong opinions; the fastest
route to a merged PR is knowing what they are.

## Ground rules

**No runtime dependencies.** Not "few" - none. It is the project's main
advantage over the alternatives and CI fails the build if `package.json` grows
one. If something genuinely needs a package, open an issue and make the case
before writing code.

**Card height is computed, never hardcoded.** Content must be free to grow.

**Hold the visual line.** Square corners (`rx` is never set), 1px or 2px
strokes, `shape-rendering="crispEdges"` on anything axis-aligned, monospace type
at weight 400 or 700. No gradients, filters, shadows or rounded pills. The tests
fail on a stray corner radius, and that is deliberate.

**Escape everything.** Every caller-supplied string goes through `escapeText`,
every colour through `sanitizeColor`. Never interpolate a raw query value into
markup. An unescaped `"` is an attribute break, and an SVG is XML.

## Getting set up

```bash
git clone https://github.com/JFrusher/readme-svg-generator.git
cd readme-svg-generator
npm run dev     # http://localhost:3000, no install needed
npm test
```

Only the GitHub-backed cards need a token. Copy `.env.example` to `.env` and
fill in `GITHUB_TOKEN` if you are working on those; the rest run offline.

## Layout

```text
api/                  Routes: parse the query, call a renderer, set headers
src/renderers/        Pure functions: options in, SVG string out
src/themes/           Palettes and query-string colour overrides
src/utils/            Sanitising, SVG primitives, the GitHub client
public/index.html     Playground
test.js               Everything, run with node:assert
```

Routes never build markup and renderers never touch `req`/`res`. That boundary
is why the cards are testable without a network or a token - please keep it.

## Adding a theme

Add four colours to `themes` in `src/themes/index.js`:

```js
gruvbox: {
  bg: '#282828',
  text: '#ebdbb2',
  accent: '#fabd2f',
  border: '#3c3836'
}
```

Everything else - dim text, rules, meter tracks - is derived from those four via
`mixColor`. Add the name to the `<select>` in `public/index.html` and to the
README table.

## Adding a card

1. `src/renderers/renderYourCard.js` - options object in, string out. Build it
   from `svgDocument`, `cardBackground`, `titleBar` and friends in
   `src/utils/svgHelpers.js` so it matches the others.
2. `api/your-card.js` - parse with the `sanitize.js` helpers, call the renderer,
   hand the result to `sendSvg`. If it talks to GitHub, use `graphql` and
   `memoized` from `src/utils/github.js` and guard it with `requireGitHubUser`
   so the allowlist and error card come for free.
3. Register the route in `dev-server.js` and add a rewrite in `vercel.json`.
4. Add a tab to the playground.
5. Add tests. At minimum: the card is well-formed, it stays inside its own
   width, and markup in a parameter comes out escaped. `assertWellFormed` and
   `assertInsideCard` in `test.js` do the first two for you.

## Tests

`npm test` runs `node test.js` - plain `node:assert`, no framework, no config.
New behaviour needs a new assertion. If a bug reaches `main`, the fix should
come with the check that would have caught it.

## Pull requests

Small and focused beats large and thorough. Describe what changed and why; if it
changes how a card looks, include a before and after. CI runs the tests on Node
18, 20 and 22 - green before review, please.
