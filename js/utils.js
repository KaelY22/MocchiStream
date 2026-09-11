export const API_BASE = 'https://mocchistream.kael-iv22.workers.dev/api';
export const STORAGE_VERSION = 'v5';
export const PLACEHOLDER_SVG = `data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 640"%3E%3Crect fill="%231a1a2e" width="360" height="640"/%3E%3Ctext x="50%25" y="50%25" fill="%23666" font-family="sans-serif" font-size="20" text-anchor="middle" dominant-baseline="central"%3ESin imagen%3C/text%3E%3C/svg%3E`;

export function resetStorageIfStale() {
  try {
    if (localStorage.getItem('ms_storage_ver') === STORAGE_VERSION) return false;
    Object.keys(localStorage).filter(k => k.startsWith('ms_')).forEach(k => localStorage.removeItem(k));
    localStorage.setItem('ms_storage_ver', STORAGE_VERSION);
    return true;
  } catch (e) { return false; }
}

export function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function safeImg(url) {
  try {
    const u = new URL(String(url || ''));
    if (u.protocol === 'http:' || u.protocol === 'https:') return esc(url);
  } catch (e) {}
  return PLACEHOLDER_SVG;
}

export function showToast(msg, error = false) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = `toast ${error ? 'err' : 'ok'}`;
  clearTimeout(t._t);
  t.classList.remove('out');
  t._t = setTimeout(() => {
    t.classList.add('out');
    setTimeout(() => { t.classList.add('hidden'); t.classList.remove('out'); }, 180);
  }, 3200);
}

export function loadLS(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (e) { return fallback; }
}

export function saveLS(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
}
