/**
 * Shared SVG building blocks for the card renderers.
 *
 * House style: square corners, hairline rules, monospace type, no shadows and
 * no gradients. Everything is a plain XML string, so a card costs a few
 * milliseconds and no headless browser is ever involved.
 */

import { escapeXml } from './sanitize.js';

/** Monospace stack. Every glyph is one cell wide, which is what makes the grid work. */
export const FONT_FAMILY = "'SF Mono', 'Cascadia Code', 'Courier New', Consolas, monospace";

/** Advance width of one character as a fraction of the font size. */
const CHAR_RATIO = 0.6;

/**
 * Width of a string in user units. Monospace means this is exact rather than an
 * estimate: every glyph advances the same distance.
 *
 * @param {string} text
 * @param {number} [fontSize=12]
 * @returns {number}
 */
export function measureText(text, fontSize = 12) {
  return Math.ceil(String(text).length * fontSize * CHAR_RATIO);
}

/**
 * Mix a hex colour towards another by `amount` (0-1). Used for the dim text and
 * the empty half of a meter, so a theme only ever declares four colours.
 *
 * @param {string} hex `#rgb` or `#rrggbb`
 * @param {string} towards `#rgb` or `#rrggbb`
 * @param {number} amount 0 = `hex`, 1 = `towards`
 * @returns {string}
 */
export function mixColor(hex, towards, amount) {
  const parse = (value) => {
    const body = value.replace('#', '');
    const full = body.length === 3 ? [...body].map((c) => c + c).join('') : body.slice(0, 6);
    const int = Number.parseInt(full, 16);
    return Number.isFinite(int) ? [(int >> 16) & 255, (int >> 8) & 255, int & 255] : null;
  };
  const from = parse(hex);
  const to = parse(towards);
  if (!from || !to) return hex;
  const ratio = Math.min(1, Math.max(0, amount));
  const channel = (index) => Math.round(from[index] + (to[index] - from[index]) * ratio);
  return `#${[0, 1, 2].map((i) => channel(i).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * The inlined stylesheet. Two weights only - 400 for body text, 700 for
 * headings - and no external font is ever fetched.
 *
 * @param {import('../themes/index.js').Theme} theme
 * @param {{ animate?: boolean }} [options]
 * @returns {string}
 */
export function styleBlock(theme, { animate = true } = {}) {
  const dim = mixColor(theme.text, theme.bg, 0.4);
  return `<style>
    text { font-family: ${FONT_FAMILY}; }
    .title { font-size: 13px; font-weight: 700; fill: ${theme.text}; letter-spacing: 0.5px; }
    .title-inverse { font-size: 13px; font-weight: 700; fill: ${theme.bg}; letter-spacing: 0.5px; }
    .body { font-size: 12px; font-weight: 400; fill: ${theme.text}; }
    .dim { font-size: 11px; font-weight: 400; fill: ${dim}; }
    .heading { font-size: 11px; font-weight: 700; fill: ${dim}; letter-spacing: 1px; }
    .value { font-size: 12px; font-weight: 700; fill: ${theme.accent}; }
    .glyph { font-size: 12px; font-weight: 700; fill: ${theme.accent}; }
    ${animate ? animationCss() : ''}
  </style>`;
}

/**
 * Motion, such as it is: a hard cut rather than a fade, and a status square
 * that blinks like a cursor. Stepped timing keeps it mechanical instead of
 * smooth. All of it is dropped under `prefers-reduced-motion`.
 *
 * @returns {string}
 */
export function animationCss() {
  return `
    @keyframes reveal { from { opacity: 0; } to { opacity: 1; } }
    @keyframes fill { from { transform: scaleX(0); } to { transform: scaleX(1); } }
    @keyframes blink { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0; } }
    .reveal { animation: reveal 0.01s steps(1, end) backwards; }
    .meter { animation: fill 0.8s steps(12, end) backwards; transform-origin: left center; }
    .blink { animation: blink 1.2s steps(1, end) infinite; }
    @media (prefers-reduced-motion: reduce) {
      .reveal, .meter, .blink { animation: none; }
    }`;
}

/**
 * Per-element animation delay, so rows print in sequence like a terminal.
 *
 * @param {number} index
 * @param {number} [step=0.06]
 * @returns {string} a `style` attribute fragment
 */
export function delay(index, step = 0.06) {
  return ` style="animation-delay: ${(index * step).toFixed(2)}s"`;
}

/**
 * The outer `<svg>` document.
 *
 * @param {{ width: number, height: number, title: string, body: string }} options
 * @returns {string}
 */
export function svgDocument({ width, height, title, body }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="cardTitle">
  <title id="cardTitle">${escapeXml(title)}</title>
${body}
</svg>`;
}

/**
 * Card fill plus its outline. Square corners, and the stroke is inset by half a
 * pixel so a 1px rule lands on a pixel instead of straddling two.
 *
 * @param {{ width: number, height: number, theme: import('../themes/index.js').Theme, border?: boolean, strokeWidth?: number }} options
 * @returns {string}
 */
export function cardBackground({ width, height, theme, border = true, strokeWidth = 2 }) {
  const inset = border ? strokeWidth / 2 : 0;
  const stroke = border ? `stroke="${theme.border}" stroke-width="${strokeWidth}"` : 'stroke="none"';
  return `  <rect x="${inset}" y="${inset}" width="${width - inset * 2}" height="${height - inset * 2}" fill="${theme.bg}" ${stroke} shape-rendering="crispEdges" />`;
}

/**
 * Window-style title bar: a filled strip across the top of the card with
 * reversed-out text, closed off by a rule.
 *
 * @param {{ width: number, height?: number, label: string, theme: import('../themes/index.js').Theme, inset?: number }} options
 * @returns {string}
 */
export function titleBar({ width, height = 22, label, theme, inset = 2 }) {
  return `  <g class="reveal">
    <rect x="${inset}" y="${inset}" width="${width - inset * 2}" height="${height}" fill="${theme.text}" shape-rendering="crispEdges" />
    <text class="title-inverse" x="${inset + 8}" y="${inset + height / 2}" dominant-baseline="central">${escapeXml(label)}</text>
  </g>`;
}

/**
 * A horizontal rule. `dashed` draws the 2,2 dotted variant used to separate
 * sections inside a card.
 *
 * @param {{ x: number, y: number, width: number, color: string, dashed?: boolean, index?: number }} options
 * @returns {string}
 */
export function rule({ x, y, width, color, dashed = false, index = 0 }) {
  const dash = dashed ? ' stroke-dasharray="2,2"' : '';
  return `    <line class="reveal"${delay(index)} x1="${x}" y1="${y + 0.5}" x2="${x + width}" y2="${y + 0.5}" stroke="${color}" stroke-width="1"${dash} shape-rendering="crispEdges" />`;
}

/**
 * A rectangular tag: 1px outline, square corners, monospace label. Returns its
 * width so a caller can lay out a row without measuring twice.
 *
 * @param {{ text: string, x: number, y: number, theme: import('../themes/index.js').Theme, index?: number }} options
 * @returns {{ svg: string, width: number, height: number }}
 */
export function tagBox({ text, x, y, theme, index = 0 }) {
  const fontSize = 11;
  const paddingX = 7;
  const height = 20;
  const width = measureText(text, fontSize) + paddingX * 2;
  const svg = `    <g class="reveal"${delay(index, 0.03)}>
      <rect x="${x}" y="${y}" width="${width}" height="${height}" fill="none" stroke="${theme.border}" stroke-width="1" shape-rendering="crispEdges" />
      <text class="body" font-size="${fontSize}" x="${x + width / 2}" y="${y + height / 2 + 0.5}" dominant-baseline="central" text-anchor="middle">${escapeXml(text)}</text>
    </g>`;
  return { svg, width, height };
}

/**
 * Lay tags out left to right, wrapping when the row runs out of space.
 *
 * @param {{ items: string[], x: number, y: number, maxWidth: number, theme: import('../themes/index.js').Theme, gap?: number, rowGap?: number, startIndex?: number }} options
 * @returns {{ svg: string, height: number, count: number }}
 */
export function tagRow({ items, x, y, maxWidth, theme, gap = 6, rowGap = 6, startIndex = 0 }) {
  const parts = [];
  let cursorX = x;
  let cursorY = y;
  let rowHeight = 0;

  items.forEach((item, i) => {
    const width = measureText(item, 11) + 14;
    if (cursorX !== x && cursorX + width > x + maxWidth) {
      cursorX = x;
      cursorY += 20 + rowGap;
    }
    const tag = tagBox({ text: item, x: cursorX, y: cursorY, theme, index: startIndex + i });
    parts.push(tag.svg);
    cursorX += tag.width + gap;
    rowHeight = cursorY - y + tag.height;
  });

  return { svg: parts.join('\n'), height: rowHeight, count: items.length };
}

/**
 * A segmented meter: fixed-width cells, filled left to right. Reads as a
 * character-cell gauge rather than a smooth bar. `percent` is clamped, so a bad
 * ratio can never draw past the card edge.
 *
 * @param {{ x: number, y: number, width: number, percent: number, color: string, track: string, height?: number, index?: number, animate?: boolean }} options
 * @returns {string}
 */
export function meter({
  x,
  y,
  width,
  percent,
  color,
  track,
  height = 9,
  index = 0,
  animate = true
}) {
  const ratio = Math.min(100, Math.max(0, Number(percent) || 0)) / 100;
  const cell = 6;
  const gap = 2;
  const cells = Math.max(1, Math.floor((width + gap) / (cell + gap)));
  const filled = Math.round(cells * ratio);

  const boxes = Array.from({ length: cells }, (_, i) => {
    const fill = i < filled ? color : track;
    return `      <rect x="${x + i * (cell + gap)}" y="${y}" width="${cell}" height="${height}" fill="${fill}" shape-rendering="crispEdges" />`;
  });

  const group = animate ? `    <g class="meter"${delay(index, 0.05)}>` : '    <g>';
  return `${group}\n${boxes.join('\n')}\n    </g>`;
}

/**
 * A filled square status indicator, optionally blinking. Replaces the usual
 * glowing dot: same information, no gradient.
 *
 * @param {{ x: number, y: number, size?: number, color: string, blink?: boolean }} options
 * @returns {string}
 */
export function statusSquare({ x, y, size = 9, color, blink = true }) {
  const cls = blink ? ' class="blink"' : '';
  return `    <rect${cls} x="${x}" y="${y}" width="${size}" height="${size}" fill="${color}" shape-rendering="crispEdges" />`;
}

/**
 * Single-character markers standing in for icons. Monospace glyphs keep the
 * card on its grid, and there is no path data to maintain.
 *
 * @type {Record<string, string>}
 */
export const GLYPHS = {
  stars: '*',
  commits: '#',
  prs: '>',
  issues: '?',
  contributed: '~'
};

/**
 * Break text into lines that fit a character budget, on word boundaries where
 * possible. Monospace makes the budget exact, so this is a character count
 * rather than a measurement. A word longer than the budget is hard-split
 * instead of overflowing.
 *
 * @param {string} text
 * @param {number} maxChars per line
 * @param {number} [maxLines] later lines are dropped and the last gets an ellipsis
 * @returns {string[]}
 */
export function wrapText(text, maxChars, maxLines = 3) {
  const budget = Math.max(4, Math.floor(maxChars));
  const lines = [];
  let current = '';

  for (const word of String(text).trim().split(/\s+/).filter(Boolean)) {
    let candidate = current ? `${current} ${word}` : word;
    while (candidate.length > budget) {
      if (current) {
        lines.push(current);
        current = '';
        candidate = word;
        continue;
      }
      // A single word too long for the line: split it.
      lines.push(candidate.slice(0, budget));
      candidate = candidate.slice(budget);
    }
    current = candidate;
    if (lines.length >= maxLines) break;
  }
  if (current && lines.length < maxLines) lines.push(current);

  const kept = lines.slice(0, maxLines);
  const truncated = lines.length > maxLines || (lines.length === maxLines && current && !kept.includes(current));
  if (truncated && kept.length > 0) {
    const last = kept[kept.length - 1];
    kept[kept.length - 1] = `${last.slice(0, Math.max(0, budget - 1)).trimEnd()}…`;
  }
  return kept;
}

/**
 * Format a number the way GitHub does: `1234` becomes `1.2k`.
 *
 * @param {number} value
 * @returns {string}
 */
export function formatCount(value) {
  const number = Number(value) || 0;
  if (Math.abs(number) < 1000) return String(number);
  if (Math.abs(number) < 1_000_000) return `${(number / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return `${(number / 1_000_000).toFixed(1).replace(/\.0$/, '')}m`;
}

/** Default freshness for a successful card: 4 hours. */
export const DEFAULT_MAX_AGE = 14400;

/** Clamp bounds for `?cache_seconds=`: 1 minute to 1 day. */
export const MIN_MAX_AGE = 60;
export const MAX_MAX_AGE = 86400;

/**
 * Build the cache policy. GitHub's camo proxy honours this, so a low value is
 * how you get a README card to update promptly while you are iterating - and a
 * high one is how you stay off GitHub's rate limit once you are done.
 *
 * @param {number} [seconds=DEFAULT_MAX_AGE] clamped into [60, 86400]
 * @returns {string}
 */
export function cacheControl(seconds = DEFAULT_MAX_AGE) {
  const parsed = Number.isFinite(Number(seconds)) ? Math.trunc(Number(seconds)) : DEFAULT_MAX_AGE;
  const maxAge = Math.min(MAX_MAX_AGE, Math.max(MIN_MAX_AGE, parsed));
  return `public, max-age=${maxAge}, s-maxage=${maxAge}, stale-while-revalidate=86400`;
}

/**
 * Write an SVG response with the headers a README image needs. Errors are sent
 * with `no-store` so a transient failure is not cached for four hours.
 *
 * @param {import('http').ServerResponse} res
 * @param {string} svg
 * @param {{ cache?: boolean, status?: number, maxAge?: number }} [options]
 */
export function sendSvg(res, svg, { cache = true, status = 200, maxAge } = {}) {
  res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
  res.setHeader('Cache-Control', cache ? cacheControl(maxAge) : 'no-store, max-age=0');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.statusCode = status;
  res.end(svg);
}
