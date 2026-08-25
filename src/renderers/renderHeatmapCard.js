/**
 * Contribution heatmap: 53 columns of 7 squares, one per day.
 *
 * The card the visual system was asking for - it is already a grid of squares,
 * so the contribution graph needs no translation into the house style.
 */

import { escapeText } from '../utils/sanitize.js';
import {
  cardBackground,
  delay,
  formatCount,
  measureText,
  mixColor,
  styleBlock,
  svgDocument,
  titleBar
} from '../utils/svgHelpers.js';

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** Contribution levels, brightest last. Level 0 is the empty-day colour. */
const LEVELS = 4;

/**
 * Work out the count thresholds for each level. GitHub scales to the busiest
 * day rather than using fixed numbers, so a quiet year still shows contrast.
 *
 * @param {number[]} counts every day's contribution count
 * @returns {number[]} ascending lower bounds for levels 1..LEVELS
 */
export function levelThresholds(counts) {
  const active = counts.filter((count) => count > 0).sort((a, b) => a - b);
  if (active.length === 0) return [1, 2, 3, 4];

  // Quartiles of the active days, clamped so thresholds always increase.
  const at = (fraction) => active[Math.min(active.length - 1, Math.floor(active.length * fraction))];
  const raw = [1, at(0.5), at(0.8), at(0.95)];
  return raw.map((value, index) => Math.max(value, index + 1, index === 0 ? 1 : raw[index - 1] + 1));
}

/**
 * @param {number} count
 * @param {number[]} thresholds
 * @returns {number} 0 for an empty day, up to LEVELS for the busiest
 */
function levelFor(count, thresholds) {
  if (count <= 0) return 0;
  let level = 1;
  for (let i = 1; i < thresholds.length; i += 1) {
    if (count >= thresholds[i]) level = i + 1;
  }
  return level;
}

/**
 * @typedef {object} HeatmapCardOptions
 * @property {string} username
 * @property {string} [name]
 * @property {Array<Array<{ count: number, date: string }>>} weeks columns, Sunday first
 * @property {number} total
 * @property {string} [period] shown in the title bar, e.g. a year
 * @property {import('../themes/index.js').Theme} theme
 * @property {boolean} [border]
 * @property {boolean} [legend]
 * @property {boolean} [monthLabels]
 * @property {number} [width]
 * @property {boolean} [animate]
 */

/**
 * @param {HeatmapCardOptions} options
 * @returns {string} complete SVG document
 */
export function renderHeatmapCard({
  username,
  name,
  weeks = [],
  total = 0,
  period = '',
  theme,
  border = true,
  legend = true,
  monthLabels = true,
  width = 720,
  animate = true
}) {
  const paddingX = 16;
  const barHeight = 22;

  // Size the cells to the width rather than the other way round, so the grid
  // always fills the card exactly. A narrow card gives up its gaps before it
  // gives up legible cells - below about 400px a 2px gap costs a fifth of the
  // available room.
  const columns = Math.max(1, weeks.length);
  const usable = width - paddingX * 2;
  const fit = (spacing) => Math.floor((usable - (columns - 1) * spacing) / columns);
  let gap = 2;
  if (fit(gap) < 4) gap = 1;
  if (fit(gap) < 3) gap = 0;
  const cell = Math.max(2, fit(gap));
  const gridWidth = columns * cell + (columns - 1) * gap;

  const counts = weeks.flat().map((day) => day.count);
  const thresholds = levelThresholds(counts);
  // The empty day is a faint tint of the background; the active levels ramp
  // from a little over half accent to full. Starting the ramp lower than this
  // puts level 1 within a few hex values of empty, which reads as one colour.
  const palette = [
    mixColor(theme.bg, theme.text, 0.12),
    ...Array.from({ length: LEVELS }, (_, i) =>
      mixColor(theme.bg, theme.accent, 0.4 + (0.6 * (i + 1)) / LEVELS)
    )
  ];

  let cursorY = barHeight + 20;
  const parts = [];

  if (monthLabels) {
    // A label sits above the first column of each new month.
    let lastMonth = -1;
    weeks.forEach((week, index) => {
      const first = week[0];
      if (!first) return;
      const month = Number(first.date.slice(5, 7)) - 1;
      if (month === lastMonth) return;
      lastMonth = month;
      const x = paddingX + index * (cell + gap);
      if (x + measureText(MONTHS[month], 9) > paddingX + gridWidth) return;
      parts.push(
        `    <text class="dim reveal" font-size="9" x="${x}" y="${cursorY}">${MONTHS[month]}</text>`
      );
    });
    cursorY += 8;
  }

  const gridTop = cursorY;
  weeks.forEach((week, column) => {
    const x = paddingX + column * (cell + gap);
    week.forEach((day, row) => {
      const y = gridTop + row * (cell + gap);
      const level = levelFor(day.count, thresholds);
      parts.push(
        `      <rect class="reveal"${delay(column, 0.008)} x="${x}" y="${y}" width="${cell}" height="${cell}" fill="${palette[level]}" shape-rendering="crispEdges"><title>${day.date}: ${day.count}</title></rect>`
      );
    });
  });
  cursorY = gridTop + 7 * cell + 6 * gap + 14;

  if (legend) {
    const swatch = Math.min(cell, 10);
    const legendWidth = measureText('LESS', 9) + 8 + LEVELS * (swatch + 3) + swatch + 8 + measureText('MORE', 9);
    let x = paddingX + gridWidth - legendWidth;
    parts.push(`    <text class="dim" font-size="9" x="${x}" y="${cursorY}">LESS</text>`);
    x += measureText('LESS', 9) + 6;
    for (let level = 0; level <= LEVELS; level += 1) {
      parts.push(
        `    <rect x="${x}" y="${cursorY - swatch + 2}" width="${swatch}" height="${swatch}" fill="${palette[level]}" shape-rendering="crispEdges" />`
      );
      x += swatch + 3;
    }
    parts.push(`    <text class="dim" font-size="9" x="${x + 3}" y="${cursorY}">MORE</text>`);
    cursorY += 6;
  }

  const height = Math.max(90, cursorY + 8);
  const heading = `${String(name || username).slice(0, 24)} / ${formatCount(total)} CONTRIBUTIONS${period ? ` / ${period}` : ''}`;

  const body = [
    cardBackground({ width, height, theme, border }),
    styleBlock(theme, { animate }),
    titleBar({ width, height: barHeight, label: heading.toUpperCase(), theme }),
    `  <g>`,
    parts.join('\n'),
    `  </g>`
  ].join('\n');

  return svgDocument({
    width,
    height,
    title: `${escapeText(username, 40)} contribution heatmap`,
    body
  });
}

export default renderHeatmapCard;
