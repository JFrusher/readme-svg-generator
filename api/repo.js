/**
 * GET /api/repo - one repository, pinned.
 *
 * Query parameters:
 *   repo (owner/name) or owner + name, topics, theme, border, width, animate,
 *   cache_seconds, bg_color, text_color, accent_color, border_color
 *
 * Needs `GITHUB_TOKEN`. The allowlist applies to the repository owner, so an
 * instance pinned to your handle will not render other people's repos.
 */

import { renderRepoCard } from '../src/renderers/renderRepoCard.js';
import { sendErrorCard } from '../src/utils/errorCard.js';
import { graphql, isAllowedUser, memoized } from '../src/utils/github.js';
import { resolveTheme } from '../src/themes/index.js';
import {
  parseBoolean,
  parseNumber,
  sanitizeRepoName,
  sanitizeUsername
} from '../src/utils/sanitize.js';
import { sendSvg } from '../src/utils/svgHelpers.js';

const REPO_QUERY = `query repo($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    nameWithOwner
    description
    stargazerCount
    forkCount
    isArchived
    primaryLanguage { name color }
    repositoryTopics(first: 8) { nodes { topic { name } } }
  }
}`;

/**
 * Accept either `?repo=owner/name` or `?owner=&name=`.
 *
 * @param {Record<string, unknown>} query
 * @returns {{ owner: string, name: string }|null}
 */
export function parseRepoTarget(query) {
  let ownerRaw = query.owner;
  let nameRaw = query.name;

  if (typeof query.repo === 'string' && query.repo.includes('/')) {
    const [first, second] = query.repo.split('/');
    ownerRaw = first;
    nameRaw = second;
  }

  const owner = sanitizeUsername(ownerRaw);
  const name = sanitizeRepoName(nameRaw);
  return owner && name ? { owner, name } : null;
}

/**
 * @param {string} owner
 * @param {string} name
 * @param {string} token
 */
async function fetchRepo(owner, name, token) {
  return memoized(`repo|${owner.toLowerCase()}/${name.toLowerCase()}`, async () => {
    const data = await graphql(REPO_QUERY, { owner, name }, token);
    if (!data.repository) {
      throw new Error(`Repository "${owner}/${name}" not found`);
    }
    return data.repository;
  });
}

/**
 * @param {import('http').IncomingMessage & { query: Record<string, string> }} req
 * @param {import('http').ServerResponse} res
 */
export default async function handler(req, res) {
  const query = req.query ?? {};
  const target = parseRepoTarget(query);

  if (!target) {
    sendErrorCard(res, query, 'Add ?repo=owner/name', 'Repo unavailable');
    return;
  }
  if (!isAllowedUser(target.owner)) {
    sendErrorCard(
      res,
      query,
      `"${target.owner}" is not on this instance's allowlist`,
      'Repo unavailable'
    );
    return;
  }

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    sendErrorCard(res, query, 'Server is missing GITHUB_TOKEN', 'Repo unavailable');
    return;
  }

  try {
    const repo = await fetchRepo(target.owner, target.name, token);

    const svg = renderRepoCard({
      nameWithOwner: repo.nameWithOwner,
      description: repo.description ?? '',
      language: repo.primaryLanguage ?? undefined,
      stars: repo.stargazerCount ?? 0,
      forks: repo.forkCount ?? 0,
      topics: parseBoolean(query.topics, true)
        ? (repo.repositoryTopics?.nodes ?? []).map((node) => node.topic.name)
        : [],
      archived: Boolean(repo.isArchived),
      theme: resolveTheme(query),
      border: parseBoolean(query.border, true),
      width: parseNumber(query.width, 420, 250, 1000),
      animate: parseBoolean(query.animate, true)
    });

    sendSvg(res, svg, { maxAge: parseNumber(query.cache_seconds, undefined, 60, 86400) });
  } catch (error) {
    sendErrorCard(
      res,
      query,
      error instanceof Error ? error.message : 'Unknown error',
      'Repo unavailable'
    );
  }
}
