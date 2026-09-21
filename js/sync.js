import { API_BASE } from './utils.js';
import { getToken, isLoggedIn } from './auth.js';

async function syncFetch(path, options = {}) {
  const token = getToken();
  if (!token) return;
  const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', ...options.headers };
  try {
    const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
    if (!res.ok) return;
    return await res.json();
  } catch (e) {}
}

export async function pullAll() {
  if (!isLoggedIn()) return null;
  const data = await syncFetch('/sync/all');
  return data || null;
}

export function pushItem(kind, item) {
  if (!isLoggedIn()) return;
  const body = { item_id: item.id, type: item.type, title: item.title, poster: item.poster };
  if (kind === 'history') {
    body.season = item.season || 0;
    body.episode = item.episode || 0;
    body.posAt = item.posAt || 0;
    body.durAt = item.durAt || 0;
    body.anime = item.anime ? 1 : 0;
  }
  syncFetch(`/sync/${kind}`, { method: 'POST', body: JSON.stringify(body) });
}

export function removeItem(kind, item) {
  if (!isLoggedIn()) return;
  syncFetch(`/sync/${kind}`, { method: 'DELETE', body: JSON.stringify({ item_id: item.id, type: item.type }) });
}
