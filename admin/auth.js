const AUTH_STORAGE_KEY = 'mvpMcpAdminAuth';

function getStoredAuth() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY)) || null;
  } catch {
    return null;
  }
}

function setStoredAuth(auth) {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(auth));
}

function clearStoredAuth() {
  localStorage.removeItem(AUTH_STORAGE_KEY);
}

function requireAuthOrRedirect() {
  const auth = getStoredAuth();
  if (!auth?.accessToken) {
    window.location.href = '/admin/index.html';
    return null;
  }
  return auth;
}

async function refreshAccessToken() {
  const auth = getStoredAuth();
  if (!auth?.refreshToken) return null;

  const response = await fetch('/api/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: auth.refreshToken }),
  });

  if (!response.ok) {
    clearStoredAuth();
    return null;
  }

  const tokens = await response.json();
  const nextAuth = { ...auth, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
  setStoredAuth(nextAuth);
  return nextAuth;
}

async function apiFetch(path, options = {}) {
  let auth = getStoredAuth();
  if (!auth?.accessToken) {
    window.location.href = '/admin/index.html';
    throw new Error('Not authenticated');
  }

  const withAuthHeader = (token) => ({
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
      Authorization: `Bearer ${token}`,
      'X-API-Key': window.API_KEY || '',
    },
  });

  let response = await fetch(path, withAuthHeader(auth.accessToken));

  if (response.status === 401) {
    auth = await refreshAccessToken();
    if (!auth) {
      window.location.href = '/admin/index.html';
      throw new Error('Session expired');
    }
    response = await fetch(path, withAuthHeader(auth.accessToken));
  }

  return response;
}
