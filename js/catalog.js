import { API_BASE, esc, safeImg, showToast, loadLS, saveLS, normTitle, PLACEHOLDER_SVG } from './utils.js';
import { pushItem, removeItem, pullAll } from './sync.js';
import { isLoggedIn } from './auth.js';

let favs = [];
let history = [];
let watchLater = [];
let detailFavUpdater = null;
let listChangeListener = null;
let currentDetailItem = null;

const KEEP_RE = /pelispedia\./i;

function cleanStale(list) {
  return (list || []).filter(i => i && (i.id || KEEP_RE.test(i.url || '')));
}

export function loadLists() {
  favs = cleanStale(loadLS('ms_favs', []));
  history = cleanStale(loadLS('ms_history', []));
  watchLater = cleanStale(loadLS('ms_watchlater', []));
  migrateLegacyLists();
  if (isLoggedIn()) {
    pullAll().then(data => {
      if (!data) return;
      const hasAny = data.favorites.length || data.history.length || data.watch_later.length;
      if (hasAny) {
        favs = data.favorites;
        history = data.history;
        watchLater = data.watch_later;
      } else if (favs.length || history.length || watchLater.length) {
        favs.forEach(i => pushItem('favorites', i));
        history.forEach(i => pushItem('history', i));
        watchLater.forEach(i => pushItem('watch-later', i));
      }
      saveLS('ms_favs', favs);
      saveLS('ms_history', history);
      saveLS('ms_watchlater', watchLater);
      notifyListChanged();
    }).catch(() => {});
  }
}

async function migrateLegacyLists() {
  const legacy = [...favs, ...history, ...watchLater].filter(i => i && i.url && !i.id);
  if (!legacy.length) return;
  showToast('Migrando tu lista al nuevo catálogo...');
  const resolved = new Map();
  const seen = new Set();
  let idx = 0;
  const workers = Array.from({ length: 3 }, async () => {
    while (true) {
      const i = idx++;
      if (i >= legacy.length) return;
      const old = legacy[i];
      const key = old.url;
      if (seen.has(key)) continue;
      seen.add(key);
      try {
        const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(old.title || '')}`);
        const items = await res.json();
        const q = normTitle(old.title);
        const match = (items || []).find(it => normTitle(it.title) === q)
          || (items || []).find(it => normTitle(it.title).includes(q) || q.includes(normTitle(it.title)));
        if (match) resolved.set(key, { id: match.id, type: match.type, title: match.title, poster: match.poster });
      } catch (e) {}
    }
  });
  await Promise.allSettled(workers);
  const mapList = list => list.map(it => {
    if (it && it.id) return it;
    const r = resolved.get(it.url);
    if (r) return { id: r.id, type: r.type, title: r.title, poster: r.poster || null };
    return null;
  }).filter(Boolean);
  favs = mapList(favs);
  history = mapList(history);
  watchLater = mapList(watchLater);
  saveLS('ms_favs', favs);
  saveLS('ms_history', history);
  saveLS('ms_watchlater', watchLater);
  notifyListChanged();
}

export function itemKey(item) {
  return `${item?.type || 'movie'}|${item?.id}`;
}

export function isFav(item) {
  return favs.some(f => itemKey(f) === itemKey(item));
}

export function isInWatchLater(item) {
  return watchLater.some(w => itemKey(w) === itemKey(item));
}

export function getFavs() { return favs; }
export function getHistory() { return history; }
export function getWatchLater() { return watchLater; }

export function setDetailFavUpdater(fn) { detailFavUpdater = fn; }
export function setListChangeListener(fn) { listChangeListener = fn; }

function notifyListChanged() {
  if (listChangeListener) listChangeListener();
  if (detailFavUpdater) detailFavUpdater();
}

export function toggleFavFromCard(e, btn) {
  e.stopPropagation();
  toggleFav({
    id: btn.dataset.id,
    type: btn.dataset.type || 'movie',
    title: btn.dataset.title || 'Sin título',
    poster: btn.dataset.poster || null,
    anime: btn.dataset.anime === '1'
  });
}

export function toggleFav(item) {
  const k = itemKey(item);
  const idx = favs.findIndex(f => itemKey(f) === k);
  if (idx >= 0) {
    favs.splice(idx, 1);
    showToast('Eliminado de favoritos');
    removeItem('favorites', item);
  } else {
    favs.unshift({ id: item.id, type: item.type || 'movie', title: item.title, poster: item.poster || null, anime: !!item.anime });
    showToast('Agregado a favoritos');
    pushItem('favorites', item);
  }
  saveLS('ms_favs', favs);
  document.querySelectorAll('.fav-btn').forEach(btn => {
    if (btn.dataset.id === String(item.id) && btn.dataset.type === item.type) btn.classList.toggle('on', isFav(item));
  });
  notifyListChanged();
}

export function toggleWatchLater(item) {
  const k = itemKey(item);
  const idx = watchLater.findIndex(w => itemKey(w) === k);
  if (idx >= 0) {
    watchLater.splice(idx, 1);
    showToast('Eliminado de Ver después');
    removeItem('watch-later', item);
  } else {
    watchLater.unshift({ id: item.id, type: item.type || 'movie', title: item.title, poster: item.poster || null, anime: !!item.anime });
    showToast('Agregado a Ver después');
    pushItem('watch-later', item);
  }
  saveLS('ms_watchlater', watchLater);
  notifyListChanged();
}

export function addHistory(item) {
  const k = itemKey(item);
  history = history.filter(h => itemKey(h) !== k);
  history.unshift({ id: item.id, type: item.type || 'movie', title: item.title, poster: item.poster || null, anime: !!item.anime, ts: Date.now() });
  if (history.length > 40) history = history.slice(0, 40);
  saveLS('ms_history', history);
  pushItem('history', { id: item.id, type: item.type, title: item.title, poster: item.poster });
  notifyListChanged();
}

export function updateProgress(item, pos, dur) {
  if (!item?.id || !dur || isNaN(dur) || dur <= 0) return;
  const k = itemKey(item);
  const entry = history.find(h => itemKey(h) === k);
  if (!entry) return;
  if (pos >= dur * 0.93 || dur - pos < 20) {
    delete entry.posAt;
    delete entry.durAt;
  } else {
    entry.posAt = Math.round(pos);
    entry.durAt = Math.round(dur);
  }
  saveLS('ms_history', history);
  pushItem('history', entry);
}

export function removeFromHistory(e, btn) {
  e.stopPropagation();
  const k = `${btn.dataset.type || 'movie'}|${btn.dataset.id}`;
  history = history.filter(h => itemKey(h) !== k);
  saveLS('ms_history', history);
  removeItem('history', { id: btn.dataset.id, type: btn.dataset.type || 'movie' });
  notifyListChanged();
  showToast('Eliminado del historial');
}

export function removeFromWatchLater(e, btn) {
  e.stopPropagation();
  const k = `${btn.dataset.type || 'movie'}|${btn.dataset.id}`;
  watchLater = watchLater.filter(w => itemKey(w) !== k);
  saveLS('ms_watchlater', watchLater);
  notifyListChanged();
  showToast('Eliminado de Ver después');
}

export function cardHtml(item, opts = {}) {
  const title = item.title || 'Sin título';
  const poster = safeImg(item.poster);
  const typeLabel = item.anime ? 'Anime' : (item.type === 'tv' ? 'Serie' : 'Película');
  const progress = (item.posAt && item.durAt && item.posAt > 0 && item.posAt < item.durAt * 0.93)
    ? `<div class="card-progress"><i style="width:${Math.min(100, Math.round(item.posAt / item.durAt * 100))}%"></i></div>`
    : '';
  return `
    <div class="video-card" data-id="${esc(item.id)}" data-type="${esc(item.type || 'movie')}">
      ${opts.deletable ? `<button class="card-del" data-id="${esc(item.id)}" data-type="${esc(item.type || 'movie')}" onclick="${opts.deletable}(event, this)" aria-label="Eliminar"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.87 12.14A2 2 0 0116.14 21H7.86a2 2 0 01-1.99-1.86L5 7m5 4v6m4-6v6M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3M4 7h16"/></svg></button>` : ''}
      <button class="fav-btn ${isFav(item) ? 'on' : ''}" data-id="${esc(item.id)}" data-type="${esc(item.type || 'movie')}" data-title="${esc(title)}" data-poster="${esc(item.poster || '')}" data-anime="${item.anime ? '1' : ''}" onclick="toggleFavFromCard(event, this)" aria-label="Favorito">
        <svg viewBox="0 0 24 24"><path d="M12 21s-7.5-4.9-10-9.3C.4 8.6 2.3 5 5.8 5c2 0 3.6 1.1 4.4 2.7h3.6C14.6 6.1 16.2 5 18.2 5c3.5 0 5.4 3.6 3.8 6.7C19.5 16.1 12 21 12 21z"/></svg>
      </button>
      <img src="${poster}" alt="${esc(title)}" loading="lazy" decoding="async" onerror="this.src='${esc(PLACEHOLDER_SVG)}'" />
      <div class="title-overlay">${esc(title)}</div>
      <span class="cat-badge">${esc(typeLabel)}</span>
      ${progress}
    </div>
  `;
}

export function setCurrentDetailItem(item) { currentDetailItem = item; }
export function getCurrentDetailItem() { return currentDetailItem; }

window.toggleFavFromCard = toggleFavFromCard;
window.removeFromHistory = removeFromHistory;
window.removeFromWatchLater = removeFromWatchLater;
