const LS_TOKEN = 'isabelle-v2-github-token';

function getConfig() {
  if (typeof window === 'undefined') return null;
  const token = localStorage.getItem(LS_TOKEN);
  const match = window.location.hostname.match(/^([^.]+)\.github\.io$/);
  if (!match) return null;
  const owner = match[1];
  const repo = document.documentElement.dataset.repo || 'isabelle';
  if (!token) return null;
  return { owner, repo, token };
}

function utf8ToBase64(str) {
  if (typeof btoa !== 'undefined') {
    return btoa(unescape(encodeURIComponent(str)));
  }
  return Buffer.from(str, 'utf8').toString('base64');
}

export async function fetchFromGitHub(filename) {
  const cfg = getConfig();
  if (!cfg) throw Object.assign(new Error('missing_config'), { code: 'missing_config' });
  const res = await fetch(
    `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${filename}`,
    {
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        Accept: 'application/vnd.github+json',
      },
    }
  );
  if (res.status === 401 || res.status === 403 || res.status === 404) {
    throw Object.assign(new Error('bad_token'), { code: 'bad_token' });
  }
  if (res.status === 429) {
    throw Object.assign(new Error('rate_limited'), { code: 'rate_limited' });
  }
  if (!res.ok) throw new Error(`github_error_${res.status}`);
  const data = await res.json();
  const jsonStr =
    typeof atob !== 'undefined'
      ? decodeURIComponent(escape(atob(data.content.replace(/\s/g, ''))))
      : Buffer.from(data.content, 'base64').toString('utf8');
  return { content: JSON.parse(jsonStr), sha: data.sha };
}

export async function saveToGitHub(filename, content) {
  const cfg = getConfig();
  if (!cfg) throw Object.assign(new Error('missing_config'), { code: 'missing_config' });

  let sha;
  try {
    const current = await fetchFromGitHub(filename);
    sha = current.sha;
  } catch (e) {
    if (e.code === 'missing_config' || e.code === 'bad_token') throw e;
    throw Object.assign(new Error('get_failed'), { code: 'get_failed' });
  }

  const raw = JSON.stringify(content, null, 2);
  const body = JSON.stringify({
    message: `update ${filename}`,
    content: utf8ToBase64(raw),
    sha,
  });

  const res = await fetch(
    `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${filename}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        'Content-Type': 'application/json',
        Accept: 'application/vnd.github+json',
      },
      body,
    }
  );

  if (res.status === 409 || res.status === 422) {
    throw Object.assign(new Error('sha_conflict'), { code: 'sha_conflict' });
  }
  if (res.status === 401 || res.status === 403 || res.status === 404) {
    throw Object.assign(new Error('bad_token'), { code: 'bad_token' });
  }
  if (res.status === 429) {
    throw Object.assign(new Error('rate_limited'), { code: 'rate_limited' });
  }
  if (!res.ok) throw new Error(`github_error_${res.status}`);
}

export function getToken() {
  return typeof localStorage !== 'undefined' ? localStorage.getItem(LS_TOKEN) || '' : '';
}
export function setToken(t) {
  if (typeof localStorage !== 'undefined') localStorage.setItem(LS_TOKEN, t);
}
