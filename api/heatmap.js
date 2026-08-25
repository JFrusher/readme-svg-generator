/**
 * GET /api/heatmap - contribution calendar.
 *
 * Query parameters:
 *   username (required), year, theme, border, legend, month_labels, width,
 *   animate, cache_seconds, bg_color, text_color, accent_color, border_color
 *
 * Needs `GITHUB_TOKEN`. Omitting `year` gives the trailing twelve months, which
 * is what GitHub's own calendar shows.
 */

import { renderHeatmapCard } from '../src/renderers/renderHeatmapCard.js';
import { requireGitHubUser, sendErrorCard } from '../src/utils/errorCard.js';
import { graphql, memoized } from '../src/utils/github.js';
import { resolveTheme } from '../src/themes/index.js';
import { parseBoolean, parseNumber } from '../src/utils/sanitize.js';
import { sendSvg } from '../src/utils/svgHelpers.js';

const CALENDAR_QUERY = `query calendar($login: String!, $from: DateTime, $to: DateTime) {
  user(login: $login) {
    name
    contributionsCollection(from: $from, to: $to) {
      contributionCalendar {
        totalContributions
        weeks {
          contributionDays { contributionCount date }
        }
      }
    }
  }
}`;

/**
 * Turn a `?year=` into the GraphQL window. Anything outside a sane range is
 * ignored, which leaves GitHub's default of the trailing twelve months.
 *
 * @param {unknown} value
 * @returns {{ from: string|null, to: string|null, label: string }}
 */
export function yearWindow(value) {
  const year = Number.parseInt(String(value ?? ''), 10);
  const thisYear = new Date().getUTCFullYear();
  if (!Number.isInteger(year) || year < 2005 || year > thisYear) {
    return { from: null, to: null, label: '' };
  }
  return {
    from: `${year}-01-01T00:00:00Z`,
    to: `${year}-12-31T23:59:59Z`,
    label: String(year)
  };
}

/**
 * @param {string} login
 * @param {string} token
 * @param {{ from: string|null, to: string|null, label: string }} window
 * @returns {Promise<{ name: string, total: number, weeks: Array<Array<{ count: number, date: string }>> }>}
 */
async function fetchCalendar(login, token, window) {
  return memoized(`heatmap|${login.toLowerCase()}|${window.label}`, async () => {
    const data = await graphql(
      CALENDAR_QUERY,
      { login, from: window.from, to: window.to },
      token
    );
    const user = data.user;
    if (!user) throw new Error(`User "${login}" not found`);

    const calendar = user.contributionsCollection.contributionCalendar;
    return {
      name: user.name || login,
      total: calendar.totalContributions ?? 0,
      weeks: (calendar.weeks ?? []).map((week) =>
        (week.contributionDays ?? []).map((day) => ({
          count: day.contributionCount ?? 0,
          date: day.date
        }))
      )
    };
  });
}

/**
 * @param {import('http').IncomingMessage & { query: Record<string, string> }} req
 * @param {import('http').ServerResponse} res
 */
export default async function handler(req, res) {
  const query = req.query ?? {};
  const guard = requireGitHubUser(query);
  if (!guard.ok) {
    sendErrorCard(res, query, guard.message, 'Heatmap unavailable');
    return;
  }
  const { username, token } = guard;

  try {
    const window = yearWindow(query.year);
    const { name, total, weeks } = await fetchCalendar(username, token, window);

    const svg = renderHeatmapCard({
      username,
      name,
      weeks,
      total,
      period: window.label,
      theme: resolveTheme(query),
      border: parseBoolean(query.border, true),
      legend: parseBoolean(query.legend, true),
      monthLabels: parseBoolean(query.month_labels, true),
      width: parseNumber(query.width, 720, 300, 1200),
      animate: parseBoolean(query.animate, true)
    });

    sendSvg(res, svg, { maxAge: parseNumber(query.cache_seconds, undefined, 60, 86400) });
  } catch (error) {
    sendErrorCard(
      res,
      query,
      error instanceof Error ? error.message : 'Unknown error',
      'Heatmap unavailable'
    );
  }
}
