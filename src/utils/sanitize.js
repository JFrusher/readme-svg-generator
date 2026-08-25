/**
 * String sanitisation helpers.
 *
 * Everything that reaches the SVG output goes through here first. SVG is XML,
 * so an unescaped `<` or `"` in a query parameter is enough to break out of a
 * text node or an attribute and inject arbitrary markup or script.
 */

const XML_ENTITIES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;'
};

/** Control characters are illegal in XML 1.0 even when escaped. */
const ILLEGAL_XML_CHARS = /\p{Cc}/gu;

/**
 * Escape a value for safe interpolation into XML text nodes and attributes.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function escapeXml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(ILLEGAL_XML_CHARS, '')
    .replace(/[&<>"']/g, (char) => XML_ENTITIES[char]);
}

/**
 * Escape and hard-truncate free text so a caller cannot blow up the card size.
 *
 * @param {unknown} value
 * @param {number} [maxLength=120]
 * @returns {string}
 */
export function escapeText(value, maxLength = 120) {
  const raw = value === null || value === undefined ? '' : String(value);
  const trimmed = raw.length > maxLength ? `${raw.slice(0, maxLength - 1)}…` : raw;
  return escapeXml(trimmed);
}

/**
 * Validate a user supplied colour. Accepts `#rgb`, `#rgba`, `#rrggbb` and
 * `#rrggbbaa` with or without the leading hash (query strings eat `#`), plus a
 * few plain CSS keywords. Anything else returns `null` so the caller falls back
 * to the theme value: never interpolate an unvalidated colour.
 *
 * @param {unknown} value
 * @returns {string|null}
 */
export function sanitizeColor(value) {
  if (typeof value !== 'string') return null;
  const candidate = value.trim().replace(/^#/, '');
  if (/^(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(candidate)) {
    return `#${candidate.toLowerCase()}`;
  }
  if (/^(?:transparent|none|white|black)$/i.test(candidate)) {
    return candidate.toLowerCase();
  }
  return null;
}

/**
 * Parse a truthy/falsy query parameter. A bare `?border` counts as true.
 *
 * @param {unknown} value
 * @param {boolean} [fallback=false]
 * @returns {boolean}
 */
export function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null) return fallback;
  if (value === '') return true;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

/**
 * Parse an integer query parameter and clamp it into a sane range.
 *
 * @param {unknown} value
 * @param {number} fallback
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function parseNumber(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

/**
 * Split a comma separated query parameter into trimmed, non-empty entries.
 *
 * @param {unknown} value
 * @param {number} [maxItems=32]
 * @returns {string[]}
 */
export function parseList(value, maxItems = 32) {
  const joined = Array.isArray(value) ? value.join(',') : value;
  if (typeof joined !== 'string') return [];
  return joined
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, maxItems);
}

/**
 * GitHub usernames: 1-39 chars, alphanumerics with single internal hyphens.
 *
 * @param {unknown} value
 * @returns {string|null}
 */
export function sanitizeUsername(value) {
  if (typeof value !== 'string') return null;
  const candidate = value.trim();
  return /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i.test(candidate) ? candidate : null;
}

/**
 * Repository names: letters, digits, dot, dash, underscore, up to 100 chars.
 *
 * @param {unknown} value
 * @returns {string|null}
 */
export function sanitizeRepoName(value) {
  if (typeof value !== 'string') return null;
  const candidate = value.trim();
  return /^[A-Za-z0-9._-]{1,100}$/.test(candidate) ? candidate : null;
}
