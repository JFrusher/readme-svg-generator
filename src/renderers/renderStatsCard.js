/**
 * GitHub stats card: headline metrics with dotted leaders, plus a language
 * breakdown drawn as segmented meters.
 *
 * The renderer is deliberately dumb about where the numbers came from - the API
 * route fetches them, this file only draws. That keeps the card testable
 * without a network or a token.
 */

import { escapeText } from '../utils/sanitize.js';
import {
  GLYPHS,
  cardBackground,
  delay,
  formatCount,
  measureText,
  meter,
  mixColor,
  rule,
  styleBlock,
  svgDocument,
  titleBar
} from '../utils/svgHelpers.js';

/** Metric rows in display order. */
const METRICS = [
  { key: 'stars', label: 'TOTAL STARS' },
  { key: 'commits', label: 'TOTAL COMMITS' },
  { key: 'prs', label: 'TOTAL PRS' },
  { key: 'issues', label: 'TOTAL ISSUES' },
  { key: 'contributed', label: 'CONTRIBUTED TO' }
];

/**
 * @typedef {object} StatsCardOptions
 * @property {string} username
 * @property {string} [name] display name, defaults to the username
 * @property {Record<string, number>} stats
 * @property {Array<{ name: string, percent: number, color?: string }>} [languages]
 * @property {import('../themes/index.js').Theme} theme
 * @property {boolean} [border]
 * @property {boolean} [showIcons] single-character markers beside each metric
 * @property {string[]} [hide] metric keys and/or `languages` to omit
 * @property {string} [period] e.g. a year; shown in the title bar
 * @property {number} [width]
 * @property {boolean} [animate]
 */

/**
 * @param {StatsCardOptions} options
 * @returns {string} complete SVG document
 */
export function renderStatsCard({
  username,
  name,
  stats = {},
  languages = [],
  theme,
  border = true,
  showIcons = true,
  hide = [],
  period = '',
  width = 495,
  animate = true
}) {
  const hidden = new Set(hide.map((entry) => entry.toLowerCase()));
  const paddingX = 16;
  const contentWidth = width - paddingX * 2;
  const barHeight = 22;
  const dividerColor = mixColor(theme.border, theme.bg, 0.35);
  const track = mixColor(theme.border, theme.bg, 0.55);

  const rows = METRICS.filter((metric) => !hidden.has(metric.key)).map((metric) =>
    // Stars cannot be filtered by date, so say so rather than let a year label
    // imply the count belongs to that year.
    period && metric.key === 'stars' ? { ...metric, label: 'STARS (ALL TIME)' } : metric
  );
  const visibleLanguages = hidden.has('languages') ? [] : languages.slice(0, 5);

  const parts = [];
  let cursorY = barHeight + 28;

  rows.forEach((metric, index) => {
    const value = formatCount(stats[metric.key] ?? 0);
    const labelX = showIcons ? paddingX + 16 : paddingX;
    const valueWidth = measureText(value, 12);
    const labelWidth = measureText(metric.label, 12);
    // Dotted leader between label and value, the way a printed index does it.
    const leaderX = labelX + labelWidth + 8;
    const leaderWidth = width - paddingX - valueWidth - 8 - leaderX;

    parts.push(`    <g class="reveal"${delay(index)}>`);
    if (showIcons) {
      parts.push(
        `      <text class="glyph" x="${paddingX}" y="${cursorY}">${GLYPHS[metric.key] ?? '.'}</text>`
      );
    }
    parts.push(
      `      <text class="body" x="${labelX}" y="${cursorY}">${escapeText(metric.label, 40)}</text>`
    );
    if (leaderWidth > 8) {
      parts.push(
        `      <line x1="${leaderX}" y1="${cursorY - 4.5}" x2="${leaderX + leaderWidth}" y2="${cursorY - 4.5}" stroke="${dividerColor}" stroke-width="1" stroke-dasharray="2,2" shape-rendering="crispEdges" />`
      );
    }
    parts.push(
      `      <text class="value" x="${width - paddingX}" y="${cursorY}" text-anchor="end">${value}</text>`,
      `    </g>`
    );
    cursorY += 22;
  });

  if (visibleLanguages.length > 0) {
    if (rows.length > 0) {
      parts.push(
        rule({
          x: paddingX,
          y: cursorY - 6,
          width: contentWidth,
          color: dividerColor,
          index: rows.length
        })
      );
      cursorY += 16;
    }

    parts.push(
      `    <text class="heading reveal"${delay(rows.length)} x="${paddingX}" y="${cursorY}">LANGUAGES</text>`
    );
    cursorY += 16;

    // One column of labels, so the meters all start on the same x.
    const labelChars = Math.max(...visibleLanguages.map((language) => language.name.length));
    const labelWidth = Math.min(120, measureText('X'.repeat(labelChars), 12));
    const meterX = paddingX + labelWidth + 10;
    const meterWidth = Math.max(40, width - paddingX - 52 - meterX);

    visibleLanguages.forEach((language, index) => {
      const percent = Math.min(100, Math.max(0, Number(language.percent) || 0));
      parts.push(
        `    <g class="reveal"${delay(rows.length + index + 1)}>`,
        `      <text class="body" x="${paddingX}" y="${cursorY + 4}" font-size="11">${escapeText(language.name, 20)}</text>`,
        meter({
          x: meterX,
          y: cursorY - 5,
          width: meterWidth,
          percent,
          color: language.color || theme.accent,
          track,
          index,
          animate
        }),
        `      <text class="value" x="${width - paddingX}" y="${cursorY + 4}" text-anchor="end" font-size="11">${percent.toFixed(1)}%</text>`,
        `    </g>`
      );
      cursorY += 20;
    });
  }

  const height = Math.max(110, cursorY + 8);
  const label = `${String(name || username).slice(0, 32)} / GITHUB STATS${period ? ` / ${period}` : ''}`.toUpperCase();

  const body = [
    cardBackground({ width, height, theme, border }),
    styleBlock(theme, { animate }),
    titleBar({ width, height: barHeight, label, theme }),
    `  <g>`,
    parts.join('\n'),
    `  </g>`
  ].join('\n');

  return svgDocument({ width, height, title: `${username} GitHub statistics`, body });
}

export default renderStatsCard;
