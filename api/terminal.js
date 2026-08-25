/**
 * GET /api/terminal - fake shell transcript.
 *
 * Query parameters:
 *   title, lines (pipe-separated), prompt, cursor, theme, border, width,
 *   animate, cache_seconds, bg_color, text_color, accent_color, border_color
 *
 * Lines are pipe-separated because a shell transcript is full of commas:
 *
 *   /api/terminal?lines=$ whoami|jfrusher|$ ls&prompt=$
 *
 * Needs no token and calls nothing - it is pure rendering.
 */

import { renderTerminalCard } from '../src/renderers/renderTerminalCard.js';
import { resolveTheme } from '../src/themes/index.js';
import { parseBoolean, parseNumber } from '../src/utils/sanitize.js';
import { sendSvg } from '../src/utils/svgHelpers.js';

/**
 * Split the transcript. Accepts a pipe-separated string or a repeated `line`
 * parameter, whichever the caller finds easier to write.
 *
 * @param {Record<string, unknown>} query
 * @returns {string[]}
 */
function parseLines(query) {
  if (query.line !== undefined) {
    const repeated = Array.isArray(query.line) ? query.line : [query.line];
    return repeated.map(String).slice(0, 20);
  }
  if (typeof query.lines !== 'string') return [];
  return query.lines.split('|').slice(0, 20);
}

/**
 * @param {import('http').IncomingMessage & { query: Record<string, string> }} req
 * @param {import('http').ServerResponse} res
 */
export default function handler(req, res) {
  const query = req.query ?? {};

  const svg = renderTerminalCard({
    title: query.title ?? '~/PROJECTS - BASH',
    lines: parseLines(query),
    prompt: typeof query.prompt === 'string' && query.prompt ? query.prompt.slice(0, 8) : '$',
    theme: resolveTheme(query),
    border: parseBoolean(query.border, true),
    cursor: parseBoolean(query.cursor, true),
    width: parseNumber(query.width, 495, 200, 1000),
    animate: parseBoolean(query.animate, true)
  });

  sendSvg(res, svg, { maxAge: parseNumber(query.cache_seconds, undefined, 60, 86400) });
}
