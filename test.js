/**
 * Smoke tests: `npm test`. No framework - plain asserts, run with node.
 *
 * These cover the parts that would silently produce a broken or unsafe card:
 * XML escaping, colour validation, layout arithmetic and the hide/override
 * query handling.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

import { aggregateLanguages, buildCommitsQuery, sumCommits } from './api/stats.js';
import { yearWindow } from './api/heatmap.js';
import { parseRepoTarget } from './api/repo.js';
import { isAllowedUser } from './src/utils/github.js';
import { renderStackCard } from './src/renderers/renderStackCard.js';
import { renderStatsCard } from './src/renderers/renderStatsCard.js';
import { levelThresholds, renderHeatmapCard } from './src/renderers/renderHeatmapCard.js';
import { renderRepoCard } from './src/renderers/renderRepoCard.js';
import { renderStatusCard } from './src/renderers/renderStatusCard.js';
import { renderTerminalCard } from './src/renderers/renderTerminalCard.js';
import { resolveTheme, themes } from './src/themes/index.js';
import { escapeXml, parseBoolean, parseList, parseNumber, sanitizeColor, sanitizeRepoName, sanitizeUsername } from './src/utils/sanitize.js';
import { cacheControl, formatCount, mixColor, wrapText } from './src/utils/svgHelpers.js';

/** Every `<tag>` opened must be closed, and no stray `<` may survive. */
function assertWellFormed(svg, label) {
  assert.ok(svg.startsWith('<svg '), `${label}: missing svg root`);
  assert.ok(svg.trimEnd().endsWith('</svg>'), `${label}: unclosed svg root`);

  const stack = [];
  const tagPattern = /<(\/?)([a-zA-Z][\w:-]*)([^>]*?)(\/?)>/g;
  let match;
  while ((match = tagPattern.exec(svg)) !== null) {
    const [, closing, name, attrs, selfClosing] = match;
    if (closing) {
      assert.equal(stack.pop(), name, `${label}: mismatched </${name}>`);
    } else if (!selfClosing && !attrs.trimEnd().endsWith('/')) {
      stack.push(name);
    }
  }
  assert.equal(stack.length, 0, `${label}: unclosed <${stack[stack.length - 1]}>`);
}

/** No drawn box may extend past the card edge, whatever the input. */
function assertInsideCard(svg, label) {
  const cardWidth = Number(svg.match(/^<svg[^>]*width="(\d+)"/)[1]);
  for (const match of svg.matchAll(/<rect[^>]*x="([\d.]+)"[^>]*width="([\d.]+)"/g)) {
    const right = Number(match[1]) + Number(match[2]);
    assert.ok(right <= cardWidth, `${label}: rect ends at ${right}, card is ${cardWidth} wide`);
  }
}

// --- sanitisation ---------------------------------------------------------

assert.equal(escapeXml('<script>alert("x")</script>'), '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
assert.equal(escapeXml("it's & more"), 'it&apos;s &amp; more');
assert.equal(sanitizeColor('1a1a1a'), '#1a1a1a');
assert.equal(sanitizeColor('#FFF'), '#fff');
assert.equal(sanitizeColor('red; fill: url(#evil)'), null);
assert.equal(sanitizeColor('javascript:alert(1)'), null);
assert.equal(parseBoolean('', false), true);
assert.equal(parseBoolean('false', true), false);
assert.equal(parseBoolean(undefined, true), true);
assert.equal(parseNumber('9999', 495, 200, 1000), 1000);
assert.equal(parseNumber('nope', 495, 200, 1000), 495);
assert.deepEqual(parseList(' a , b ,, c '), ['a', 'b', 'c']);
assert.equal(sanitizeUsername('octocat'), 'octocat');
assert.equal(sanitizeUsername('bad name'), null);
assert.equal(sanitizeUsername('-leading'), null);

// --- themes ---------------------------------------------------------------

assert.equal(resolveTheme({ theme: 'dracula' }).bg, themes.dracula.bg);
assert.equal(resolveTheme({ theme: 'nope' }).bg, themes.system.bg);
assert.equal(resolveTheme({ theme: 'constructor' }).bg, themes.system.bg, 'prototype keys must not resolve');
assert.equal(resolveTheme({ bg_color: '00ff00' }).bg, '#00ff00');
assert.equal(resolveTheme({ text_color: 'not-a-colour' }).text, themes.system.text);
assert.equal(mixColor('#000000', '#ffffff', 0.5), '#808080');
assert.equal(formatCount(1250), '1.3k');
assert.equal(formatCount(999), '999');

// --- status card ----------------------------------------------------------

const status = renderStatusCard({
  title: 'Open to work <b>',
  subtitle: 'Ping me',
  theme: resolveTheme({ theme: 'tokyo-night' })
});
assertWellFormed(status, 'status card');
assertInsideCard(status, 'status card');
assert.ok(!status.includes('<b>'), 'title markup must be escaped');
assert.ok(status.includes('class="blink"'), 'status square blinks by default');
assert.ok(!renderStatusCard({ theme: themes.system, pulse: false }).includes('class="blink"'));
assert.ok(renderStatusCard({ theme: themes.system, border: false }).includes('stroke="none"'));
assert.ok(!status.includes('rx="'), 'no rounded corners anywhere');
assert.ok(!status.includes('filter='), 'no filters or glows');
assert.ok(status.includes('STATUS'), 'title bar rendered');

// --- stack card -----------------------------------------------------------

const stack = renderStackCard({
  title: 'Stack',
  theme: themes.catppuccin,
  categories: [
    { name: 'Languages', items: ['TypeScript', 'Go', 'Rust'] },
    { name: 'Tools', items: Array.from({ length: 12 }, (_, i) => `tool-${i}`) }
  ]
});
assertWellFormed(stack, 'stack card');
assertInsideCard(stack, 'stack card');
assert.ok(stack.includes('LANGUAGES'), 'category heading rendered');
const stackHeight = Number(stack.match(/height="(\d+)"/)[1]);
assert.ok(stackHeight > 150, `card must grow to fit wrapped rows, got ${stackHeight}`);
assertWellFormed(renderStackCard({ theme: themes.dark, categories: [] }), 'empty stack card');

// --- stats card -----------------------------------------------------------

const stats = renderStatsCard({
  username: 'octocat',
  name: 'The Octocat',
  theme: themes.dark,
  stats: { stars: 12500, commits: 3400, prs: 210, issues: 88, contributed: 14 },
  languages: [
    { name: 'TypeScript', percent: 62.5, color: '#3178c6' },
    { name: 'Go', percent: 37.5, color: '#00add8' }
  ]
});
assertWellFormed(stats, 'stats card');
assertInsideCard(stats, 'stats card');
assert.ok(stats.includes('12.5k'), 'star count formatted');
assert.ok(stats.includes('62.5%'), 'language percentage rendered');

const hidden = renderStatsCard({
  username: 'octocat',
  theme: themes.dark,
  stats: { stars: 1 },
  languages: [{ name: 'Go', percent: 100 }],
  hide: ['issues', 'prs', 'languages'],
  showIcons: false
});
assert.ok(!hidden.includes('TOTAL ISSUES'), 'hide=issues respected');
assert.ok(!hidden.includes('LANGUAGES'), 'hide=languages respected');
assert.ok(!hidden.includes('class="glyph"'), 'show_icons=false drops the markers');

// A percentage outside 0-100 must clamp instead of drawing past the card edge.
const clamped = renderStatsCard({
  username: 'octocat',
  theme: themes.dark,
  stats: {},
  languages: [{ name: 'Weird', percent: 480 }]
});
assertInsideCard(clamped, 'clamped meter');

// --- lifetime commit totals -----------------------------------------------

const commitsQuery = buildCommitsQuery([2021, 2019, 2020]);
assert.ok(commitsQuery.includes('y2019: contributionsCollection(from: "2019-01-01T00:00:00Z"'));
assert.ok(commitsQuery.includes('y2021:'), 'every year gets an alias');
assert.equal(commitsQuery.indexOf('y2019') < commitsQuery.indexOf('y2020'), true, 'years in order');
assert.equal(buildCommitsQuery([]), null, 'no years means no second request');
assert.equal(
  buildCommitsQuery(['2019" } evil { x', 1.5, 1900, 9999]),
  null,
  'only plain in-range integers may reach the query document'
);

assert.deepEqual(
  sumCommits({
    y2019: { totalCommitContributions: 10, restrictedContributionsCount: 5 },
    y2020: { totalCommitContributions: 2, restrictedContributionsCount: 0 }
  }),
  { commits: 17, publicCommits: 12 },
  'lifetime total sums every year, private included'
);
assert.deepEqual(sumCommits({}), { commits: 0, publicCommits: 0 });
assert.deepEqual(sumCommits(null), { commits: 0, publicCommits: 0 });
assert.deepEqual(
  sumCommits({ y2019: { totalCommitContributions: 4 }, junk: null }),
  { commits: 4, publicCommits: 4 },
  'missing restricted counts and stray keys are tolerated'
);

// --- language breakdown ---------------------------------------------------

/** One notebook repo whose bytes dwarf everything, plus 17 ordinary repos. */
const notebookRepo = {
  languages: { edges: [{ size: 40_000_000, node: { name: 'Jupyter Notebook', color: '#da5b0b' } }] }
};
const webRepo = {
  languages: {
    edges: [
      { size: 60_000, node: { name: 'TypeScript', color: '#3178c6' } },
      { size: 20_000, node: { name: 'CSS', color: '#663399' } }
    ]
  }
};
const mixed = [notebookRepo, ...Array.from({ length: 17 }, () => webRepo)];

const byRepo = aggregateLanguages(mixed);
const notebooks = byRepo.find((language) => language.name === 'Jupyter Notebook');
const typescript = byRepo.find((language) => language.name === 'TypeScript');
assert.ok(
  notebooks.percent < 6,
  `one bloated repo out of 18 must not dominate, got ${notebooks.percent.toFixed(1)}%`
);
assert.ok(typescript.percent > 60, `TypeScript should lead, got ${typescript.percent.toFixed(1)}%`);
assert.ok(typescript.percent > notebooks.percent);

// Byte-weighted aggregation - what this replaced - would have said 99%.
const totalBytes = 40_000_000 + 17 * 80_000;
assert.ok(40_000_000 / totalBytes > 0.96, 'sanity: the old weighting really was that skewed');

const excluded = aggregateLanguages(mixed, { exclude: ['jupyter notebook'] });
assert.ok(!excluded.some((language) => language.name === 'Jupyter Notebook'), 'exclude_langs drops it');
assert.ok(
  Math.abs(excluded.find((language) => language.name === 'TypeScript').percent - 75) < 0.01,
  'excluding a language must not skew the repos that remain'
);

assert.deepEqual(aggregateLanguages([]), []);
assert.deepEqual(aggregateLanguages([{ languages: { edges: [] } }]), [], 'empty repos are skipped');
assert.equal(aggregateLanguages(mixed, { limit: 2 }).length, 2);

// --- allowlist ------------------------------------------------------------

delete process.env.ALLOWED_USERS;
assert.equal(isAllowedUser('anyone'), true, 'unset means open, for local dev');
process.env.ALLOWED_USERS = '';
assert.equal(isAllowedUser('anyone'), true, 'empty means open too');
process.env.ALLOWED_USERS = 'JFrusher, octocat';
assert.equal(isAllowedUser('jfrusher'), true, 'case-insensitive');
assert.equal(isAllowedUser('octocat'), true, 'whitespace around entries is trimmed');
assert.equal(isAllowedUser('someone-else'), false, 'everyone else is refused');
delete process.env.ALLOWED_USERS;

// --- cache policy ---------------------------------------------------------

assert.match(cacheControl(), /max-age=14400/, 'four hours by default');
assert.match(cacheControl(), /stale-while-revalidate=86400/);
assert.match(cacheControl(300), /max-age=300, s-maxage=300/, 's-maxage tracks max-age');
assert.match(cacheControl(5), /max-age=60/, 'clamped up to a minute');
assert.match(cacheControl(999999), /max-age=86400/, 'clamped down to a day');
assert.match(cacheControl('nonsense'), /max-age=14400/, 'garbage falls back to the default');

// --- terminal card --------------------------------------------------------

const terminal = renderTerminalCard({
  title: '~/PROJECTS - BASH',
  lines: ['$ whoami', 'jfrusher', '$ echo "<script>"'],
  theme: themes.system
});
assertWellFormed(terminal, 'terminal card');
assertInsideCard(terminal, 'terminal card');
assert.ok(!terminal.includes('<script>'), 'transcript markup is escaped');
assert.ok(terminal.includes('class="value reveal"'), 'commands use the accent colour');
assert.ok(terminal.includes('class="body reveal"'), 'output does not');
assert.ok(terminal.includes('class="blink"'), 'cursor blinks by default');
assert.ok(
  !renderTerminalCard({ lines: ['x'], theme: themes.system, cursor: false }).includes('class="blink"')
);

// A line longer than the card must be cut to the character grid, not overflow.
const longLine = renderTerminalCard({ lines: ['x'.repeat(400)], theme: themes.system, width: 300 });
const drawn = longLine.match(/<text[^>]*>(x+)<\/text>/)[1].length;
assert.ok(drawn <= Math.floor((300 - 32) / 7.2), `line should be clipped to fit, got ${drawn} chars`);
assertInsideCard(longLine, 'clipped terminal card');

assertWellFormed(renderTerminalCard({ lines: [], theme: themes.system }), 'empty terminal card');

// --- heatmap card ---------------------------------------------------------

/** 53 weeks of 7 days, with a plausible spread of activity. */
function fakeCalendar(counts) {
  const weeks = [];
  let index = 0;
  for (let w = 0; w < 53; w += 1) {
    const week = [];
    for (let d = 0; d < 7; d += 1) {
      const day = new Date(Date.UTC(2025, 0, 1 + index));
      week.push({ count: counts[index % counts.length], date: day.toISOString().slice(0, 10) });
      index += 1;
    }
    weeks.push(week);
  }
  return weeks;
}

const heatmap = renderHeatmapCard({
  username: 'octocat',
  weeks: fakeCalendar([0, 0, 1, 3, 0, 12, 7]),
  total: 1234,
  theme: themes.system
});
assertWellFormed(heatmap, 'heatmap card');
assertInsideCard(heatmap, 'heatmap card');
assert.equal((heatmap.match(/<rect/g) ?? []).length >= 53 * 7, true, 'one square per day');
assert.ok(heatmap.includes('1.2k CONTRIBUTIONS'.toUpperCase()), 'total in the title bar');
assert.ok(heatmap.includes('LESS') && heatmap.includes('MORE'), 'legend drawn');
assert.ok(!renderHeatmapCard({ username: 'x', weeks: fakeCalendar([1]), total: 1, theme: themes.system, legend: false }).includes('LESS'));

// The grid must fit the card at any width, including awkward ones.
for (const width of [300, 495, 721, 1200]) {
  assertInsideCard(
    renderHeatmapCard({ username: 'x', weeks: fakeCalendar([0, 5]), total: 5, theme: themes.system, width }),
    `heatmap at ${width}px`
  );
}

// Empty calendars must not divide by zero or crash.
assertWellFormed(renderHeatmapCard({ username: 'x', weeks: [], total: 0, theme: themes.system }), 'empty heatmap');
assertWellFormed(
  renderHeatmapCard({ username: 'x', weeks: fakeCalendar([0]), total: 0, theme: themes.system }),
  'all-zero heatmap'
);

// Thresholds must strictly increase, or two levels render identically.
for (const counts of [[], [1], [1, 1, 1], [1, 2, 3, 4, 5, 100], [7, 7, 7, 9]]) {
  const thresholds = levelThresholds(counts);
  assert.equal(thresholds.length, 4);
  for (let i = 1; i < thresholds.length; i += 1) {
    assert.ok(thresholds[i] > thresholds[i - 1], `thresholds must increase, got ${thresholds}`);
  }
}

// Every level must be visibly distinct from its neighbours, in every theme.
for (const [themeName, theme] of Object.entries(themes)) {
  const card = renderHeatmapCard({
    username: 'x',
    weeks: fakeCalendar([0, 1, 4, 9, 30]),
    total: 44,
    theme
  });
  const swatches = [...card.matchAll(/<rect x="[\d.]+" y="[\d.]+" width="\d+" height="\d+" fill="(#[0-9a-f]{6})"/g)]
    .map((match) => match[1]);
  const channels = (hex) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
  for (let i = 1; i < swatches.length; i += 1) {
    const [a, b] = [channels(swatches[i - 1]), channels(swatches[i])];
    const distance = Math.max(...a.map((value, c) => Math.abs(value - b[c])));
    assert.ok(distance >= 20, `${themeName}: levels ${swatches[i - 1]} and ${swatches[i]} are too close`);
  }
}

const thisYear = new Date().getUTCFullYear();
assert.equal(yearWindow('2024').from, '2024-01-01T00:00:00Z');
assert.equal(yearWindow('2024').label, '2024');
assert.equal(yearWindow(undefined).from, null, 'no year means the trailing twelve months');
assert.equal(yearWindow('1999').from, null, 'out of range is ignored');
assert.equal(yearWindow(String(thisYear + 5)).from, null, 'the future is ignored');
assert.equal(yearWindow('2024; DROP').from, '2024-01-01T00:00:00Z', 'parsed as an integer, not interpolated');

// --- word wrap ------------------------------------------------------------

assert.deepEqual(wrapText('one two three four', 9, 3), ['one two', 'three', 'four']);
assert.deepEqual(wrapText('', 20, 3), [], 'empty text yields no lines');
assert.equal(wrapText('x'.repeat(80), 10, 2).length, 2, 'an unbreakable word is hard-split');
assert.ok(wrapText('a b c d e f g h i j k l m n o p', 5, 2).at(-1).endsWith('…'), 'overflow is marked');
for (const line of wrapText('the quick brown fox jumps over the lazy dog', 12, 5)) {
  assert.ok(line.length <= 12, `line "${line}" exceeds the budget`);
}

// --- repo card ------------------------------------------------------------

assert.deepEqual(parseRepoTarget({ repo: 'JFrusher/Plaque' }), { owner: 'JFrusher', name: 'Plaque' });
assert.deepEqual(parseRepoTarget({ owner: 'JFrusher', name: 'Plaque' }), { owner: 'JFrusher', name: 'Plaque' });
assert.equal(parseRepoTarget({ repo: 'no-slash' }), null);
assert.equal(parseRepoTarget({ repo: 'bad owner/name' }), null, 'owner is validated');
assert.equal(parseRepoTarget({ repo: 'owner/na me' }), null, 'repo name is validated');
assert.equal(parseRepoTarget({}), null);
assert.equal(sanitizeRepoName('dot.dash-under_1'), 'dot.dash-under_1');
assert.equal(sanitizeRepoName('../../etc/passwd'), null);

const repoCard = renderRepoCard({
  nameWithOwner: 'JFrusher/Plaque',
  description: 'Free, privacy-first web app that turns CSV guest lists into place cards. <b>',
  language: { name: 'TypeScript', color: '#3178c6' },
  stars: 1200,
  forks: 34,
  theme: themes.system
});
assertWellFormed(repoCard, 'repo card');
assertInsideCard(repoCard, 'repo card');
assert.ok(!repoCard.includes('<b>'), 'description markup is escaped');
assert.ok(repoCard.includes('1.2k'), 'star count formatted');
assert.ok(repoCard.includes('JFRUSHER/PLAQUE'), 'title bar shows the repo');
assert.ok(
  renderRepoCard({ nameWithOwner: 'a/b', theme: themes.system }).includes('No description'),
  'a repo without a description still renders'
);
assert.ok(
  renderRepoCard({ nameWithOwner: 'a/b', archived: true, theme: themes.system }).includes('ARCHIVED')
);
assertInsideCard(
  renderRepoCard({
    nameWithOwner: 'a/b',
    description: 'x'.repeat(500),
    stars: 999999,
    forks: 999999,
    theme: themes.system,
    width: 250
  }),
  'narrow repo card'
);

// --- playground -----------------------------------------------------------

// The page is one inline script: a single syntax error takes out every
// listener at once, and nothing else in this suite would notice.
const page = readFileSync(new URL('./public/index.html', import.meta.url), 'utf8');
const inline = page.match(/<script>([\s\S]*?)<\/script>/);
assert.ok(inline, 'playground must have an inline script');
new vm.Script(inline[1], { filename: 'public/index.html' });

// Every $('id') the script reaches for must exist in the markup.
const declaredIds = new Set([...page.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
for (const [, id] of inline[1].matchAll(/\$\('([^']+)'\)/g)) {
  assert.ok(declaredIds.has(id), `script references #${id}, which the page does not define`);
}

// Duplicate ids silently break getElementById.
const allIds = [...page.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
assert.equal(allIds.length, declaredIds.size, `duplicate id in the playground: ${allIds}`);

// Every tab must have a matching fieldset, and every endpoint a live route.
const endpoints = [...page.matchAll(/data-endpoint="([^"]+)"/g)].map((match) => match[1]);
const fieldsets = new Set([...page.matchAll(/data-fields="([^"]+)"/g)].map((match) => match[1]));
assert.equal(endpoints.length, 6, 'six card types');
for (const endpoint of endpoints) {
  assert.ok(fieldsets.has(endpoint), `tab "${endpoint}" has no fieldset`);
  assert.ok(
    readFileSync(new URL('./dev-server.js', import.meta.url), 'utf8').includes(`'/api/${endpoint}'`),
    `tab "${endpoint}" has no route in dev-server.js`
  );
  assert.ok(
    readFileSync(new URL('./vercel.json', import.meta.url), 'utf8').includes(`/api/${endpoint}`),
    `tab "${endpoint}" has no rewrite in vercel.json`
  );
}

console.log('All checks passed.');
