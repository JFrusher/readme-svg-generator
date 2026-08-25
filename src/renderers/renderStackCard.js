/**
 * Tech stack card: categorised tag boxes on a fixed grid.
 *
 * The caller names the categories in order (`?categories=Languages,Tools`) and
 * supplies each category's items in a parameter of the same name
 * (`&Languages=TypeScript,Go&Tools=Docker`). Rows wrap inside the card width,
 * and the card height grows to fit whatever it was given.
 */

import { escapeText } from '../utils/sanitize.js';
import {
  cardBackground,
  delay,
  mixColor,
  rule,
  styleBlock,
  svgDocument,
  tagRow,
  titleBar
} from '../utils/svgHelpers.js';

/**
 * @typedef {object} StackCardOptions
 * @property {string} [title] title-bar text
 * @property {Array<{ name: string, items: string[] }>} categories
 * @property {import('../themes/index.js').Theme} theme
 * @property {boolean} [border]
 * @property {number} [width]
 * @property {boolean} [animate]
 */

/**
 * @param {StackCardOptions} options
 * @returns {string} complete SVG document
 */
export function renderStackCard({
  title = 'TECH STACK',
  categories = [],
  theme,
  border = true,
  width = 495,
  animate = true
}) {
  const paddingX = 16;
  const contentWidth = width - paddingX * 2;
  const barHeight = 22;
  const dividerColor = mixColor(theme.border, theme.bg, 0.35);

  const sections = [];
  let cursorY = barHeight + 26;
  let tagIndex = 0;

  categories.forEach((category, position) => {
    const items = category.items.filter(Boolean);
    if (items.length === 0) return;

    // A rule above every category except the first keeps the blocks separated.
    if (position > 0 && sections.length > 0) {
      sections.push(
        rule({
          x: paddingX,
          y: cursorY - 16,
          width: contentWidth,
          color: dividerColor,
          dashed: true,
          index: tagIndex
        })
      );
    }

    if (category.name) {
      sections.push(
        `    <text class="heading reveal"${delay(tagIndex, 0.03)} x="${paddingX}" y="${cursorY}">${escapeText(category.name, 40).toUpperCase()}</text>`
      );
      cursorY += 12;
    }

    const row = tagRow({
      items,
      x: paddingX,
      y: cursorY,
      maxWidth: contentWidth,
      theme,
      startIndex: tagIndex
    });
    sections.push(row.svg);
    tagIndex += row.count;
    cursorY += row.height + 24;
  });

  if (sections.length === 0) {
    sections.push(
      `    <text class="dim" x="${paddingX}" y="${cursorY}">no categories - try ?categories=Languages&amp;Languages=TypeScript,Go</text>`
    );
    cursorY += 20;
  }

  const height = Math.max(90, cursorY - 8);

  const body = [
    cardBackground({ width, height, theme, border }),
    styleBlock(theme, { animate }),
    // `titleBar` escapes for us, so the raw string goes in - escaping twice
    // would render the entities themselves.
    titleBar({ width, height: barHeight, label: String(title).slice(0, 60).toUpperCase(), theme }),
    `  <g>`,
    sections.join('\n'),
    `  </g>`
  ].join('\n');

  return svgDocument({ width, height, title, body });
}

export default renderStackCard;
