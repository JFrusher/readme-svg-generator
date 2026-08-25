/**
 * Theme provider.
 *
 * A theme is four colours: `bg`, `text`, `accent`, `border`. Renderers derive
 * everything else (muted text, track colours) from those with opacity so a new
 * palette never needs more than the four values below.
 */

import { sanitizeColor } from '../utils/sanitize.js';

/** @typedef {{ bg: string, text: string, accent: string, border: string }} Theme */

/** @type {Record<string, Theme>} */
export const themes = {
  system: {
    bg: '#ffffff',
    text: '#000000',
    accent: '#000000',
    border: '#000000'
  },
  dark: {
    bg: '#0d1117',
    text: '#c9d1d9',
    accent: '#58a6ff',
    border: '#30363d'
  },
  light: {
    bg: '#ffffff',
    text: '#1f2328',
    accent: '#0969da',
    border: '#d0d7de'
  },
  dracula: {
    bg: '#282a36',
    text: '#f8f8f2',
    accent: '#bd93f9',
    border: '#44475a'
  },
  catppuccin: {
    bg: '#1e1e2e',
    text: '#cdd6f4',
    accent: '#cba6f7',
    border: '#313244'
  },
  'tokyo-night': {
    bg: '#1a1b26',
    text: '#c0caf5',
    accent: '#7aa2f7',
    border: '#24283b'
  }
};

export const DEFAULT_THEME = 'system';

/** Theme names, for the playground and the docs. */
export const themeNames = Object.keys(themes);

/**
 * Resolve the palette for a request: named theme first, then per-colour
 * overrides from the query string (`?bg_color=1a1a1a&text_color=00ff00`).
 * Unknown names fall back to the default theme, invalid colours are ignored.
 *
 * @param {Record<string, unknown>} [query={}]
 * @returns {Theme & { name: string }}
 */
export function resolveTheme(query = {}) {
  const requested = typeof query.theme === 'string' ? query.theme.trim().toLowerCase() : '';
  const name = Object.hasOwn(themes, requested) ? requested : DEFAULT_THEME;
  const base = themes[name];

  return {
    name,
    bg: sanitizeColor(query.bg_color) ?? base.bg,
    text: sanitizeColor(query.text_color) ?? base.text,
    accent: sanitizeColor(query.accent_color) ?? base.accent,
    border: sanitizeColor(query.border_color) ?? base.border
  };
}
