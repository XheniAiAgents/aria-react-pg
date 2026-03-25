/**
 * apiFetch — central fetch wrapper that attaches the JWT token automatically.
 * Use this instead of fetch() for all authenticated API calls.
 *
 * Usage:
 *   import { apiFetch } from '../utils/apiFetch';
 *   const data = await apiFetch('/tasks');
 *   const data = await apiFetch('/chat', { method: 'POST', json: { message } });
 *
 * For FormData (file uploads), pass body directly — don't use json:
 *   const data = await apiFetch('/chat/file', { method: 'POST', body: formData });
 */

const API = window.location.origin;

export function getToken() {
  return localStorage.getItem('aria_token');
}

export function setToken(token) {
  localStorage.setItem('aria_token', token);
}

export function clearToken() {
  localStorage.removeItem('aria_token');
}

export async function apiFetch(path, options = {}) {
  const token = getToken();
  const headers = { ...(options.headers || {}) };

  if (token) headers['Authorization'] = `Bearer ${token}`;

  // If `json` key provided, serialize it and set Content-Type
  if (options.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    options = { ...options, body: JSON.stringify(options.json) };
    delete options.json;
  }

  const res = await fetch(`${API}${path}`, { ...options, headers });

  // Auto-logout on 401
  if (res.status === 401) {
    clearToken();
    localStorage.removeItem('aria_user');
    window.location.reload();
    throw new Error('Session expired');
  }

  return res;
}
