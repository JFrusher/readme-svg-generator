/**
 * GET /api/stats - GitHub metrics overview.
 *
 * Query parameters:
 *   username (required), theme, show_icons, border, hide, exclude_langs, width,
 *   animate, include_private, bg_color, text_color, accent_color, border_color
 *
 * Needs a `GITHUB_TOKEN` with public read scope: the GraphQL API rejects
 * anonymous requests outright. A deployed instance is otherwise an open proxy
 * to the GitHub API spending your rate limit, so set `ALLOWED_USERS` in
 * production to pin it to the handles you actually render. Failures render an error card instead of a
 * broken image, with `no-store` so they are not cached for four hours.
 *
 * Commit totals are lifetime, not trailing-year. `contributionsCollection`
 * covers at most one year per call, so this makes two requests: one for the
 * years the account has contributions in, then one that aliases a collection
 * per year and sums them.
 */

import { renderStatsCard } from '../src/renderers/renderStatsCard.js';
import { renderStatusCard } from '../src/renderers/renderStatusCard.js';
import { resolveTheme } from '../src/themes/index.js';
import { parseBoolean, parseList, parseNumber, sanitizeUsername } from '../src/utils/sanitize.js';
import { sendSvg } from '../src/utils/svgHelpers.js';

const GITHUB_GRAPHQL = 'https://api.github.com/graphql';

/** Everything except the commit totals, which need one call per year. */
const PROFILE_QUERY = `query userStats($login: String!) {
  user(login: $login) {
    name
    contributionsCollection { contributionYears }
    pullRequests(first: 1) { totalCount }
    issues(first: 1) { totalCount }
    repositoriesContributedTo(first: 1, contributionTypes: [COMMIT, ISSUE, PULL_REQUEST, REPOSITORY]) {
      totalCount
    }
    repositories(first: 100, ownerAffiliations: OWNER, isFork: false, orderBy: { field: STARGAZERS, direction: DESC }) {
      nodes {
        stargazerCount
        languages(first: 8, orderBy: { field: SIZE, direction: DESC }) {
          edges { size node { name color } }
        }
      }
    }
  }
}`;

/**
 * Build a query with one aliased `contributionsCollection` per year. Years are
 * interpolated into the document, so anything that is not a plain integer in a
 * sane range is dropped rather than trusted - the values come from the API, but
 * a query string is still a query string.
 *
 * @param {number[]} years
 * @returns {string|null} null when there is nothing to ask for
 */
export function buildCommitsQuery(years) {
  const safe = years
    .filter((year) => Number.isInteger(year) && year >= 2005 && year <= 2200)
    .sort((a, b) => a - b);
  if (safe.length === 0) return null;

  const fields = safe
    .map(
      (year) =>
        `    y${year}: contributionsCollection(from: "${year}-01-01T00:00:00Z", to: "${year}-12-31T23:59:59Z") {
      totalCommitContributions
      restrictedContributionsCount
    }`
    )
    .join('\n');

  return `query commitTotals($login: String!) {
  user(login: $login) {
${fields}
  }
}`;
}

/**
 * Sum the per-year collections returned by {@link buildCommitsQuery}.
 *
 * @param {Record<string, { totalCommitContributions?: number, restrictedContributionsCount?: number }>} user
 * @returns {{ commits: number, publicCommits: number }} `commits` includes private contributions
 */
export function sumCommits(user) {
  let commits = 0;
  let publicCommits = 0;

  for (const value of Object.values(user ?? {})) {
    if (!value || typeof value !== 'object') continue;
    const open = value.totalCommitContributions ?? 0;
    const restricted = value.restrictedContributionsCount ?? 0;
    publicCommits += open;
    commits += open + restricted;
  }

  return { commits, publicCommits };
}

/**
 * Reduce repositories to a language breakdown.
 *
 * Every repo is weighted equally rather than by size. Byte totals are wildly
 * misleading: a Jupyter notebook stores its output images base64-encoded in the
 * file, so a handful of notebooks can outweigh every line of source you have
 * written. Sharing out each repo's own percentages means one bloated repo can
 * contribute at most `1 / repoCount` of the card.
 *
 * @param {Array<{ languages?: { edges?: Array<{ size?: number, node: { name: string, color?: string } }> } }>} repositories
 * @param {{ exclude?: string[], limit?: number }} [options] `exclude` is matched case-insensitively
 * @returns {Array<{ name: string, percent: number, color: string|undefined }>}
 */
export function aggregateLanguages(repositories, { exclude = [], limit = 5 } = {}) {
  const excluded = new Set(exclude.map((entry) => entry.trim().toLowerCase()));
  const shares = new Map();
  let counted = 0;

  for (const repo of repositories ?? []) {
    const edges = (repo.languages?.edges ?? []).filter(
      (edge) => edge?.node && !excluded.has(edge.node.name.toLowerCase())
    );
    const repoTotal = edges.reduce((sum, edge) => sum + (edge.size ?? 0), 0);
    if (repoTotal === 0) continue;

    counted += 1;
    for (const edge of edges) {
      const entry = shares.get(edge.node.name) ?? { share: 0, color: edge.node.color };
      entry.share += (edge.size ?? 0) / repoTotal;
      shares.set(edge.node.name, entry);
    }
  }

  if (counted === 0) return [];

  return [...shares.entries()]
    .sort((a, b) => b[1].share - a[1].share)
    .slice(0, limit)
    .map(([name, entry]) => ({
      name,
      percent: (entry.share / counted) * 100,
      color: entry.color || undefined
    }));
}

/**
 * Optional allowlist. `ALLOWED_USERS` is a comma-separated list of handles;
 * unset means "anyone", which is what you want locally and not what you want on
 * a public deployment - without it, a stranger can spend your token's rate limit
 * rendering cards for any account they like.
 *
 * @param {string} username
 * @returns {boolean}
 */
export function isAllowedUser(username) {
  const allowed = (process.env.ALLOWED_USERS ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return allowed.length === 0 || allowed.includes(username.toLowerCase());
}

/**
 * Warm-lambda memo. Vercel reuses an instance for a while, so this saves the
 * GitHub round trips on bursts without any external cache.
 *
 * @type {Map<string, { expires: number, data: object }>}
 */
const cache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000;

/**
 * One GraphQL request, with the error handling every caller needs.
 *
 * @param {string} query
 * @param {Record<string, unknown>} variables
 * @param {string} token
 * @returns {Promise<Record<string, any>>} the `data` payload
 * @throws {Error} on a transport error or a GraphQL error
 */
async function graphql(query, variables, token) {
  const response = await fetch(GITHUB_GRAPHQL, {
    method: 'POST',
    headers: {
      Authorization: `bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'readme-svg-generator'
    },
    body: JSON.stringify({ query, variables })
  });

  if (!response.ok) {
    throw new Error(`GitHub API returned ${response.status}`);
  }

  const payload = await response.json();
  if (payload.errors?.length) {
    throw new Error(payload.errors[0].message ?? 'GitHub API error');
  }
  return payload.data ?? {};
}

/**
 * Fetch and reduce a user's stats.
 *
 * @param {string} login
 * @param {string} token
 * @param {string[]} [excludeLangs] language names to leave out of the breakdown
 * @returns {Promise<{ name: string, stats: Record<string, number>, languages: Array<{ name: string, percent: number, color: string }> }>}
 * @throws {Error} when the token is rejected or the user does not exist
 */
async function fetchStats(login, token, excludeLangs = []) {
  const key = `${login.toLowerCase()}|${excludeLangs.join(',').toLowerCase()}`;
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.data;

  const profile = await graphql(PROFILE_QUERY, { login }, token);
  const user = profile.user;
  if (!user) {
    throw new Error(`User "${login}" not found`);
  }

  // Second pass: every year the account has contributions in, summed.
  const commitsQuery = buildCommitsQuery(user.contributionsCollection?.contributionYears ?? []);
  const totals = commitsQuery
    ? sumCommits((await graphql(commitsQuery, { login }, token)).user)
    : { commits: 0, publicCommits: 0 };

  const repositories = user.repositories.nodes ?? [];
  const stars = repositories.reduce((sum, repo) => sum + (repo.stargazerCount ?? 0), 0);
  const languages = aggregateLanguages(repositories, { exclude: excludeLangs });

  const data = {
    name: user.name || login,
    stats: {
      stars,
      commits: totals.commits,
      publicCommits: totals.publicCommits,
      prs: user.pullRequests.totalCount,
      issues: user.issues.totalCount,
      contributed: user.repositoriesContributedTo.totalCount
    },
    languages
  };

  cache.set(key, { expires: Date.now() + CACHE_TTL_MS, data });
  return data;
}

/**
 * Draw a failure as a card so the README shows a readable message rather than
 * a broken-image icon.
 *
 * @param {import('http').ServerResponse} res
 * @param {Record<string, unknown>} query
 * @param {string} message
 */
function sendError(res, query, message) {
  const svg = renderStatusCard({
    label: 'ERROR',
    title: 'Stats unavailable',
    subtitle: message,
    theme: { ...resolveTheme(query), accent: '#f85149' },
    border: parseBoolean(query.border, true),
    pulse: false,
    width: parseNumber(query.width, 495, 200, 1000)
  });
  sendSvg(res, svg, { cache: false });
}

/**
 * @param {import('http').IncomingMessage & { query: Record<string, string> }} req
 * @param {import('http').ServerResponse} res
 */
export default async function handler(req, res) {
  const query = req.query ?? {};
  const username = sanitizeUsername(query.username);

  if (!username) {
    sendError(res, query, 'Add ?username=your-github-handle');
    return;
  }

  if (!isAllowedUser(username)) {
    sendError(res, query, `"${username}" is not on this instance's allowlist`);
    return;
  }

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    sendError(res, query, 'Server is missing GITHUB_TOKEN');
    return;
  }

  try {
    const excludeLangs = parseList(query.exclude_langs, 12);
    const { name, stats, languages } = await fetchStats(username, token, excludeLangs);
    const includePrivate = parseBoolean(query.include_private, true);

    const svg = renderStatsCard({
      username,
      name,
      stats: { ...stats, commits: includePrivate ? stats.commits : stats.publicCommits },
      languages,
      theme: resolveTheme(query),
      border: parseBoolean(query.border, true),
      showIcons: parseBoolean(query.show_icons, true),
      hide: parseList(query.hide, 8),
      width: parseNumber(query.width, 495, 300, 1000),
      animate: parseBoolean(query.animate, true)
    });

    sendSvg(res, svg);
  } catch (error) {
    sendError(res, query, error instanceof Error ? error.message : 'Unknown error');
  }
}
