/**
 * GET /api/card - status / message card.
 *
 * Query parameters:
 *   title, subtitle, label, theme, border, pulse, pulse_color, width, animate,
 *   bg_color, text_color, accent_color, border_color
 */

import { renderStatusCard } from '../src/renderers/renderStatusCard.js';
import { resolveTheme } from '../src/themes/index.js';
import { parseBoolean, parseNumber, sanitizeColor } from '../src/utils/sanitize.js';
import { sendSvg } from '../src/utils/svgHelpers.js';

/**
 * @param {import('http').IncomingMessage & { query: Record<string, string> }} req
 * @param {import('http').ServerResponse} res
 */
export default function handler(req, res) {
  const query = req.query ?? {};

  const svg = renderStatusCard({
    title: query.title ?? 'Available for work',
    subtitle: query.subtitle ?? '',
    label: query.label ?? 'STATUS',
    theme: resolveTheme(query),
    border: parseBoolean(query.border, true),
    pulse: parseBoolean(query.pulse, true),
    // Falls back to the theme accent inside the renderer.
    pulseColor: sanitizeColor(query.pulse_color) ?? undefined,
    width: parseNumber(query.width, 495, 200, 1000),
    animate: parseBoolean(query.animate, true)
  });

  sendSvg(res, svg);
}
