/**
 * Terminal card: a fake shell transcript.
 *
 *   +--------------------------------------+
 *   | ~/PROJECTS - BASH                    |
 *   |                                      |
 *   | $ whoami                             |
 *   | jfrusher - biomedical engineer       |
 *   | $ ls projects/                       |
 *   | trousseau  cathsim  emg              |
 *   | $ _                                  |
 *   +--------------------------------------+
 *
 * No API, no data source - everything comes from the query string. Lines
 * beginning with the prompt are drawn as commands in the accent colour, the
 * rest as output, and the whole thing types itself in on a stepped delay.
 */

import { escapeText } from '../utils/sanitize.js';
import {
  cardBackground,
  delay,
  measureText,
  statusSquare,
  styleBlock,
  svgDocument,
  titleBar
} from '../utils/svgHelpers.js';

/**
 * @typedef {object} TerminalCardOptions
 * @property {string} [title] title-bar text
 * @property {string[]} lines transcript, one entry per row
 * @property {string} [prompt] marks a line as a command
 * @property {import('../themes/index.js').Theme} theme
 * @property {boolean} [border]
 * @property {boolean} [cursor] trailing block cursor
 * @property {number} [width]
 * @property {boolean} [animate]
 */

/**
 * @param {TerminalCardOptions} options
 * @returns {string} complete SVG document
 */
export function renderTerminalCard({
  title = '~/PROJECTS - BASH',
  lines = [],
  prompt = '$',
  theme,
  border = true,
  cursor = true,
  width = 495,
  animate = true
}) {
  const paddingX = 16;
  const barHeight = 22;
  const lineHeight = 18;
  const fontSize = 12;

  // Truncate to what actually fits: monospace means this is exact.
  const maxChars = Math.max(8, Math.floor((width - paddingX * 2) / (fontSize * 0.6)));
  const rows = lines.slice(0, 20).map((line) => String(line).slice(0, maxChars));

  let cursorY = barHeight + 30;
  const parts = [];

  rows.forEach((line, index) => {
    const isCommand = line.trimStart().startsWith(prompt);
    parts.push(
      `    <text class="${isCommand ? 'value' : 'body'} reveal"${delay(index, 0.18)} x="${paddingX}" y="${cursorY}" xml:space="preserve">${escapeText(line, 200)}</text>`
    );
    cursorY += lineHeight;
  });

  if (rows.length === 0) {
    parts.push(
      `    <text class="dim" x="${paddingX}" y="${cursorY}">no lines - try ?lines=whoami|ls -la</text>`
    );
    cursorY += lineHeight;
  }

  if (cursor) {
    // The cursor sits on its own prompt line, blinking like a waiting shell.
    parts.push(
      `    <text class="value reveal"${delay(rows.length, 0.18)} x="${paddingX}" y="${cursorY}">${escapeText(prompt, 8)}</text>`,
      statusSquare({
        x: paddingX + measureText(`${prompt} `, fontSize),
        y: cursorY - 9,
        size: 8,
        color: theme.accent,
        blink: animate
      })
    );
    cursorY += lineHeight;
  }

  const height = Math.max(90, cursorY + 4);

  const body = [
    cardBackground({ width, height, theme, border }),
    styleBlock(theme, { animate }),
    titleBar({ width, height: barHeight, label: String(title).slice(0, 60), theme }),
    `  <g>`,
    parts.join('\n'),
    `  </g>`
  ].join('\n');

  return svgDocument({ width, height, title: `Terminal - ${title}`, body });
}

export default renderTerminalCard;
