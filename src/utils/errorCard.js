/**
 * The failure path shared by every GitHub-backed route.
 *
 * A README shows a broken-image icon for any non-image response, so failures
 * are drawn as cards too - a reader gets a sentence explaining what went wrong
 * instead of a grey placeholder. They are sent `no-store` so a transient
 * problem is not cached for four hours.
 */

import { renderStatusCard } from '../renderers/renderStatusCard.js';
import { resolveTheme } from '../themes/index.js';
import { parseBoolean, parseNumber, sanitizeUsername } from './sanitize.js';
import { sendSvg } from './svgHelpers.js';
import { isAllowedUser } from './github.js';

/** Red used for the error card accent, regardless of theme. */
const ERROR_ACCENT = '#f85149';

/**
 * @param {import('http').ServerResponse} res
 * @param {Record<string, unknown>} query
 * @param {string} message
 * @param {string} [title]
 */
export function sendErrorCard(res, query, message, title = 'Card unavailable') {
  const svg = renderStatusCard({
    label: 'ERROR',
    title,
    subtitle: message,
    theme: { ...resolveTheme(query), accent: ERROR_ACCENT },
    border: parseBoolean(query.border, true),
    pulse: false,
    width: parseNumber(query.width, 495, 200, 1000)
  });
  sendSvg(res, svg, { cache: false });
}

/**
 * Validate the things every GitHub-backed card needs before it can start: a
 * usable handle, permission to render it, and a token to render it with.
 *
 * @param {Record<string, unknown>} query
 * @param {string} [field] query parameter holding the handle
 * @returns {{ ok: true, username: string, token: string } | { ok: false, message: string }}
 */
export function requireGitHubUser(query, field = 'username') {
  const username = sanitizeUsername(query[field]);
  if (!username) {
    return { ok: false, message: `Add ?${field}=your-github-handle` };
  }
  if (!isAllowedUser(username)) {
    return { ok: false, message: `"${username}" is not on this instance's allowlist` };
  }
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return { ok: false, message: 'Server is missing GITHUB_TOKEN' };
  }
  return { ok: true, username, token };
}
