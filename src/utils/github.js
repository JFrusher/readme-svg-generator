/**
 * Shared GitHub access: one request helper, one allowlist, one memo.
 *
 * Every route that talks to GitHub goes through here, so timeouts, error
 * wording and caching behave the same whichever card you asked for.
 */

const GITHUB_GRAPHQL = 'https://api.github.com/graphql';

/** How long to wait on GitHub before giving up and rendering an error card. */
const REQUEST_TIMEOUT_MS = 8000;

/** Warm-instance memo TTL. The edge cache does the heavy lifting on top. */
const CACHE_TTL_MS = 10 * 60 * 1000;

/** @type {Map<string, { expires: number, value: unknown }>} */
const memo = new Map();

/**
 * Run a GraphQL query.
 *
 * The timeout matters more than it looks: without one, a hung GitHub
 * connection holds the serverless function open until the platform kills it,
 * and the reader sees a broken image rather than a card explaining itself.
 *
 * @param {string} query
 * @param {Record<string, unknown>} variables
 * @param {string} token
 * @param {{ timeoutMs?: number }} [options]
 * @returns {Promise<Record<string, any>>} the `data` payload
 * @throws {Error} on timeout, transport failure or a GraphQL error
 */
export async function graphql(query, variables, token, { timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(GITHUB_GRAPHQL, {
      method: 'POST',
      headers: {
        Authorization: `bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'readme-svg-generator'
      },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(`GitHub did not respond within ${Math.max(1, Math.round(timeoutMs / 1000))}s`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 401) {
    throw new Error('GitHub rejected the token (401)');
  }
  if (response.status === 403 || response.status === 429) {
    throw new Error('GitHub rate limit reached - try again shortly');
  }
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
 * Memoise an async producer on a warm instance.
 *
 * @template T
 * @param {string} key
 * @param {() => Promise<T>} produce
 * @param {number} [ttlMs]
 * @returns {Promise<T>}
 */
export async function memoized(key, produce, ttlMs = CACHE_TTL_MS) {
  const hit = memo.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;

  const value = await produce();
  memo.set(key, { expires: Date.now() + ttlMs, value });
  return value;
}

/** Drop every memo entry. Tests use this; nothing else should need it. */
export function clearMemo() {
  memo.clear();
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
