/**
 * Status card: a window strip, a square status indicator and a message.
 *
 *   +--------------------------------------+
 *   | STATUS                               |
 *   |                                      |
 *   | # Available for work                 |
 *   | ------------------------------------ |
 *   | Backend, platform and dev tooling    |
 *   +--------------------------------------+
 */

import { escapeText } from '../utils/sanitize.js';
import {
  cardBackground,
  delay,
  mixColor,
  rule,
  statusSquare,
  styleBlock,
  svgDocument,
  titleBar
} from '../utils/svgHelpers.js';

/**
 * @typedef {object} StatusCardOptions
 * @property {string} [title]
 * @property {string} [subtitle]
 * @property {string} [label] title-bar text
 * @property {import('../themes/index.js').Theme} theme
 * @property {boolean} [border]
 * @property {boolean} [pulse] blinking status square
 * @property {string} [pulseColor]
 * @property {number} [width]
 * @property {boolean} [animate]
 */

/**
 * @param {StatusCardOptions} options
 * @returns {string} complete SVG document
 */
export function renderStatusCard({
  title = 'Available for work',
  subtitle = '',
  label = 'STATUS',
  theme,
  border = true,
  pulse = true,
  pulseColor,
  width = 495,
  animate = true
}) {
  const safeTitle = escapeText(title, 80);
  const safeSubtitle = escapeText(subtitle, 140);

  const paddingX = 16;
  const barHeight = 22;
  const indicator = pulseColor || theme.accent;

  const titleY = barHeight + 32;
  const height = safeSubtitle ? titleY + 46 : titleY + 20;

  const body = [
    cardBackground({ width, height, theme, border }),
    styleBlock(theme, { animate }),
    titleBar({ width, height: barHeight, label, theme }),
    `  <g>`,
    statusSquare({ x: paddingX, y: titleY - 9, color: indicator, blink: pulse && animate }),
    `    <text class="title reveal"${delay(1)} x="${paddingX + 17}" y="${titleY}" dominant-baseline="alphabetic">${safeTitle}</text>`,
    safeSubtitle
      ? rule({
          x: paddingX,
          y: titleY + 12,
          width: width - paddingX * 2,
          color: mixColor(theme.border, theme.bg, 0.35),
          dashed: true,
          index: 2
        })
      : '',
    safeSubtitle
      ? `    <text class="body reveal"${delay(3)} x="${paddingX}" y="${titleY + 32}">${safeSubtitle}</text>`
      : '',
    `  </g>`
  ]
    .filter(Boolean)
    .join('\n');

  return svgDocument({ width, height, title: `${title}${subtitle ? ` - ${subtitle}` : ''}`, body });
}

export default renderStatusCard;
