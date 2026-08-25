/**
 * GET /api/stack - tech stack / tooling matrix card.
 *
 * `categories` lists the section names in order; each section's badges come
 * from a parameter named after it:
 *
 *   /api/stack?categories=Languages,Tools&Languages=Go,TypeScript&Tools=Docker,k9s
 *
 * A category with no matching parameter is skipped, so a stray name in the list
 * never leaves an empty heading behind.
 */

import { renderStackCard } from '../src/renderers/renderStackCard.js';
import { resolveTheme } from '../src/themes/index.js';
import { parseBoolean, parseList, parseNumber } from '../src/utils/sanitize.js';
import { sendSvg } from '../src/utils/svgHelpers.js';

/** Parameters that are card options rather than category names. */
const RESERVED = new Set([
  'title',
  'categories',
  'theme',
  'border',
  'width',
  'animate',
  'bg_color',
  'text_color',
  'accent_color',
  'border_color'
]);

/**
 * Build the ordered category list. Falls back to "every non-reserved
 * parameter" so `?Languages=Go` works without naming the categories twice.
 *
 * @param {Record<string, unknown>} query
 * @returns {Array<{ name: string, items: string[] }>}
 */
function collectCategories(query) {
  const names = parseList(query.categories, 8);
  const keys = names.length > 0 ? names : Object.keys(query).filter((key) => !RESERVED.has(key));

  return keys
    .map((name) => ({ name, items: parseList(query[name], 24) }))
    .filter((category) => category.items.length > 0);
}

/**
 * @param {import('http').IncomingMessage & { query: Record<string, string> }} req
 * @param {import('http').ServerResponse} res
 */
export default function handler(req, res) {
  const query = req.query ?? {};

  const svg = renderStackCard({
    title: query.title ?? 'Tech Stack',
    categories: collectCategories(query),
    theme: resolveTheme(query),
    border: parseBoolean(query.border, true),
    width: parseNumber(query.width, 495, 250, 1000),
    animate: parseBoolean(query.animate, true)
  });

  sendSvg(res, svg, { maxAge: parseNumber(query.cache_seconds, undefined, 60, 86400) });
}
