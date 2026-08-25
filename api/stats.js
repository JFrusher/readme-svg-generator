/**
 * GET /api/stats - GitHub metrics overview.
 *
 * Query parameters:
 *   username (required), theme, show_icons, border, hide, width, animate,
 *   include_private, bg_color, text_color, accent_color, border_color
 *
 * Needs a `GITHUB_TOKEN` with public read scope: the GraphQL API rejects
 * anonymous requests outright. Failures render an error card instead of a
 * broken image, with `no-store` so they are not cached for four hours.
 */

import { renderStatsCard } from '../src/renderers/renderStatsCard.js';
import { renderStatusCard } from '../src/renderers/renderStatusCard.js';
import { resolveTheme } from '../src/themes/index.js';
import { parseBoolean, parseList, parseNumber, sanitizeUsername } from '../src/utils/sanitize.js';
import { sendSvg } from '../src/utils/svgHelpers.js';

const GITHUB_GRAPHQL = 'https://api.github.com/graphql';

/** One GraphQL round trip covers every metric on the card. */
const QUERY = `query userStats($login: String!) {
  user(login: $login) {
    name
    contributionsCollection {
      totalCommitContributions
      restrictedContributionsCount
    }
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
 * Warm-lambda memo. Vercel reuses an instance for a while, so this saves a
 * GitHub round trip on bursts without any external cache.
 *
 * @type {Map<string, { expires: number, data: object }>}
 */
const cache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000;

/**
 * Fetch and reduce a user's stats.
 *
 * @param {string} login
 * @param {string} token
 * @returns {Promise<{ name: string, stats: Record<string, number>, languages: Array<{ name: string, percent: number, color: string }> }>}
 * @throws {Error} when the token is rejected or the user does not exist
 */
async function fetchStats(login, token) {
  const key = login.toLowerCase();
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.data;

  const response = await fetch(GITHUB_GRAPHQL, {
    method: 'POST',
    headers: {
      Authorization: `bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'readme-svg-generator'
    },
    body: JSON.stringify({ query: QUERY, variables: { login } })
  });

  if (!response.ok) {
    throw new Error(`GitHub API returned ${response.status}`);
  }

  const payload = await response.json();
  if (payload.errors?.length) {
    throw new Error(payload.errors[0].message ?? 'GitHub API error');
  }
  const user = payload.data?.user;
  if (!user) {
    throw new Error(`User "${login}" not found`);
  }

  const repositories = user.repositories.nodes ?? [];
  const sizes = new Map();
  let stars = 0;

  for (const repo of repositories) {
    stars += repo.stargazerCount ?? 0;
    for (const edge of repo.languages?.edges ?? []) {
      const entry = sizes.get(edge.node.name) ?? { size: 0, color: edge.node.color };
      entry.size += edge.size ?? 0;
      sizes.set(edge.node.name, entry);
    }
  }

  const totalSize = [...sizes.values()].reduce((sum, entry) => sum + entry.size, 0) || 1;
  const languages = [...sizes.entries()]
    .sort((a, b) => b[1].size - a[1].size)
    .slice(0, 5)
    .map(([name, entry]) => ({
      name,
      percent: (entry.size / totalSize) * 100,
      color: entry.color || undefined
    }));

  const data = {
    name: user.name || login,
    stats: {
      stars,
      commits:
        user.contributionsCollection.totalCommitContributions +
        user.contributionsCollection.restrictedContributionsCount,
      publicCommits: user.contributionsCollection.totalCommitContributions,
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

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    sendError(res, query, 'Server is missing GITHUB_TOKEN');
    return;
  }

  try {
    const { name, stats, languages } = await fetchStats(username, token);
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
