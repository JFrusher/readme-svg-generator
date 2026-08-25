/**
 * Smoke tests: `npm test`. No framework - plain asserts, run with node.
 *
 * These cover the parts that would silently produce a broken or unsafe card:
 * XML escaping, colour validation, layout arithmetic and the hide/override
 * query handling.
 */

import assert from 'node:assert/strict';

import { renderStackCard } from './src/renderers/renderStackCard.js';
import { renderStatsCard } from './src/renderers/renderStatsCard.js';
import { renderStatusCard } from './src/renderers/renderStatusCard.js';
import { resolveTheme, themes } from './src/themes/index.js';
import { escapeXml, parseBoolean, parseList, parseNumber, sanitizeColor, sanitizeUsername } from './src/utils/sanitize.js';
import { formatCount, mixColor } from './src/utils/svgHelpers.js';

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

console.log('All checks passed.');
