// js/github.js
// GitHub Contents API GET/PUT for book.json.

function getSettings() {
  return {
    owner: localStorage.getItem('gh_owner') || '',
    repo: localStorage.getItem('gh_repo') || 'isabelle-audiobook',
    token: localStorage.getItem('gh_token') || ''
  };
}

function apiUrl(owner, repo) {
  return `https://api.github.com/repos/${owner}/${repo}/contents/book.json`;
}

/**
 * Fetches the current book.json from GitHub API.
 * Returns { sha, book } where book is the parsed JSON.
 */
export async function fetchFromGitHub() {
  const { owner, repo, token } = getSettings();
  if (!owner || !token) throw new Error('missing_config');

  const res = await fetch(apiUrl(owner, repo), {
    headers: {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github.v3+json'
    }
  });

  if (res.status === 401 || res.status === 403) throw new Error('bad_token');
  if (res.status === 404) throw new Error('repo_not_found');
  if (res.status === 429) throw new Error('rate_limited');
  if (!res.ok) throw new Error(`github_error_${res.status}`);

  const data = await res.json();
  const book = JSON.parse(atob(data.content.replace(/\n/g, '')));
  return { sha: data.sha, book };
}

/**
 * Saves the full book object to GitHub.
 * Merges lastPosition using timestamp-based conflict resolution.
 */
export async function saveToGitHub(localBook) {
  const { owner, repo, token } = getSettings();
  if (!owner || !token) throw new Error('missing_config');

  // GET current SHA and remote position
  const { sha, book: remoteBook } = await fetchFromGitHub();

  // Merge position: use whichever timestamp is more recent
  const localTs = localBook.lastPositionTimestamp || 0;
  const remoteTs = remoteBook.lastPositionTimestamp || 0;

  const merged = {
    ...localBook,
    lastPosition: localTs >= remoteTs ? localBook.lastPosition : remoteBook.lastPosition,
    lastPositionTimestamp: Math.max(localTs, remoteTs)
  };

  const content = btoa(unescape(encodeURIComponent(JSON.stringify(merged, null, 2))));

  const res = await fetch(apiUrl(owner, repo), {
    method: 'PUT',
    headers: {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      message: 'Update book content and position',
      content,
      sha
    })
  });

  if (res.status === 401 || res.status === 403) throw new Error('bad_token');
  if (res.status === 429) throw new Error('rate_limited');
  if (!res.ok) throw new Error(`github_error_${res.status}`);

  return merged;
}
