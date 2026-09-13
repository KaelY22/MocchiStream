export const API_BASE = 'https://mocchistream.kael-iv22.workers.dev/api';
export const STORAGE_VERSION = 'v6';
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
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function safeImg(url) {
  try {
    const u = new URL(url || '');
    if (u.protocol === 'http:' || u.protocol === 'https:') return url;
  } catch (e) {}
  return PLACEHOLDER_SVG;
}

let toastTimer = null;
export function showToast(msg, isError = false) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = `toast ${isError ? 'err' : 'ok'}`;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 3000);
}

export function loadLS(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (e) { return fallback; }
}

export function saveLS(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
}

export function normTitle(t) {
  return String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[:;,.!?()\-_]/g, ' ').replace(/\s*\((?:19|20)\d{2}\)\s*/g, ' ')
    .replace(/\b(?:19|20)\d{2}\b/g, ' ').replace(/\s+/g, ' ').trim();
}

export function decodeEntities(str) {
  return String(str || '')
    .replace(/&#0*38;|&amp;/g, '&')
    .replace(/&#0*39;|&apos;|&#x27;/g, "'")
    .replace(/&#0*34;|&quot;/g, '"')
    .replace(/&#0*8217;/g, "'")
    .replace(/&#0*8211;/g, '-')
    .replace(/&#0*8212;/g, '-')
    .replace(/&#0*8230;/g, '...')
    .replace(/&#0*160;|&nbsp;/g, ' ');
}
