/**
 * Repo pin card: one repository, the way a pinned repo reads on a profile.
 *
 *   +--------------------------------------+
 *   | JFRUSHER/PLAQUE                      |
 *   |                                      |
 *   | Free, privacy-first web app that     |
 *   | turns CSV guest lists into place     |
 *   | cards.                               |
 *   | ------------------------------------ |
 *   | # TypeScript          * 12    Y 3    |
 *   +--------------------------------------+
 */

import { escapeText } from '../utils/sanitize.js';
import {
  cardBackground,
  delay,
  formatCount,
  measureText,
  mixColor,
  rule,
  statusSquare,
  styleBlock,
  svgDocument,
  titleBar,
  wrapText
} from '../utils/svgHelpers.js';

/**
 * @typedef {object} RepoCardOptions
 * @property {string} nameWithOwner
 * @property {string} [description]
 * @property {{ name: string, color?: string }} [language]
 * @property {number} [stars]
 * @property {number} [forks]
 * @property {boolean} [archived]
 * @property {import('../themes/index.js').Theme} theme
 * @property {boolean} [border]
 * @property {number} [width]
 * @property {boolean} [animate]
 */

/**
 * @param {RepoCardOptions} options
 * @returns {string} complete SVG document
 */
export function renderRepoCard({
  nameWithOwner,
  description = '',
  language,
  stars = 0,
  forks = 0,
  archived = false,
  theme,
  border = true,
  width = 420,
  animate = true
}) {
  const paddingX = 16;
  const barHeight = 22;
  const fontSize = 12;
  const contentWidth = width - paddingX * 2;
  const dividerColor = mixColor(theme.border, theme.bg, 0.35);

  const lines = wrapText(description, contentWidth / (fontSize * 0.6), 3);

  let cursorY = barHeight + 28;
  const parts = [];

  if (lines.length > 0) {
    lines.forEach((line, index) => {
      parts.push(
        `    <text class="body reveal"${delay(index)} x="${paddingX}" y="${cursorY}">${escapeText(line, 200)}</text>`
      );
      cursorY += 17;
    });
  } else {
    parts.push(`    <text class="dim" x="${paddingX}" y="${cursorY}">No description</text>`);
    cursorY += 17;
  }

  cursorY += 6;
  parts.push(
    rule({ x: paddingX, y: cursorY, width: contentWidth, color: dividerColor, index: lines.length })
  );
  cursorY += 20;

  // Footer: language on the left, counts pushed to the right edge.
  if (language?.name) {
    parts.push(
      statusSquare({
        x: paddingX,
        y: cursorY - 9,
        size: 9,
        color: language.color || theme.accent,
        blink: false
      }),
      `    <text class="body reveal"${delay(lines.length + 1)} x="${paddingX + 15}" y="${cursorY}">${escapeText(language.name, 24)}</text>`
    );
  }

  const counts = [
    { glyph: '*', value: formatCount(stars) },
    { glyph: 'Y', value: formatCount(forks) }
  ];
  let countX = width - paddingX;
  for (const { glyph, value } of [...counts].reverse()) {
    countX -= measureText(value, fontSize);
    parts.push(
      `    <text class="value reveal"${delay(lines.length + 2)} x="${countX}" y="${cursorY}">${value}</text>`
    );
    countX -= measureText(`${glyph} `, fontSize);
    parts.push(
      `    <text class="glyph reveal"${delay(lines.length + 2)} x="${countX}" y="${cursorY}">${glyph}</text>`
    );
    countX -= 14;
  }

  if (archived) {
    parts.push(
      `    <text class="dim" x="${paddingX}" y="${cursorY + 18}" letter-spacing="1">ARCHIVED</text>`
    );
    cursorY += 18;
  }

  const height = Math.max(100, cursorY + 14);

  const body = [
    cardBackground({ width, height, theme, border }),
    styleBlock(theme, { animate }),
    titleBar({
      width,
      height: barHeight,
      label: String(nameWithOwner).slice(0, 48).toUpperCase(),
      theme
    }),
    `  <g>`,
    parts.join('\n'),
    `  </g>`
  ].join('\n');

  return svgDocument({ width, height, title: `${nameWithOwner} on GitHub`, body });
}

export default renderRepoCard;
