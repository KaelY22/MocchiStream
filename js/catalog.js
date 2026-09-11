import { esc, PLACEHOLDER_SVG, showToast, loadLS, saveLS, API_BASE, safeImg } from './utils.js';

let favs = [];
let history = [];
let watchLater = [];
let detailFavUpdater = null;
let listChangeListener = null;

const STALE_RE = /cinecalidad/i;

function cleanStale(list) {
  return (list || []).filter(i => !STALE_RE.test(i.url || '') && !STALE_RE.test(i.source || ''));
}

export function loadLists() {
  const rawFavs = loadLS('ms_favs', []);
  const rawHistory = loadLS('ms_history', []);
  const rawWatch = loadLS('ms_watchlater', []);
  favs = cleanStale(rawFavs);
  history = cleanStale(rawHistory);
  watchLater = cleanStale(rawWatch);
  if (favs.length !== rawFavs.length) saveLS('ms_favs', favs);
  if (history.length !== rawHistory.length) saveLS('ms_history', history);
  if (watchLater.length !== rawWatch.length) saveLS('ms_watchlater', watchLater);
  backfillHistoryPosters();
}

async function backfillHistoryPosters() {
  const missing = history.filter(h => h && h.url && !h.poster).slice(0, 20);
  if (!missing.length) return;
  let idx = 0;
  const workers = Array.from({ length: 4 }, async () => {
    while (true) {
      const i = idx++;
      if (i >= missing.length) return;
      const h = missing[i];
      try {
        const r = await fetch(`${API_BASE}/details?url=${encodeURIComponent(h.url)}`);
        const d = await r.json();
        if (d && d.poster && !h.poster) h.poster = d.poster;
      } catch (e) {}
    }
  });
  await Promise.allSettled(workers);
  if (missing.some(h => h.poster)) {
    saveLS('ms_history', history);
    notifyListChanged();
  }
}

export function getFavs() { return favs; }
export function getHistory() { return history; }
export function getWatchLater() { return watchLater; }

export function setDetailFavUpdater(fn) { detailFavUpdater = fn; }
export function setListChangeListener(fn) { listChangeListener = fn; }

function notifyListChanged() {
  if (listChangeListener) listChangeListener();
}

export function isFav(url) {
  return favs.some(f => f.url === url);
}

export function toggleFav(item) {
  const idx = favs.findIndex(f => f.url === item.url);
  if (idx >= 0) {
    favs.splice(idx, 1);
    showToast('Eliminado de Mi lista');
  } else {
    favs.unshift({ url: item.url, title: item.title, poster: item.poster || null, source: item.source || '' });
    showToast('Agregado a Mi lista');
  }
  saveLS('ms_favs', favs);
  document.querySelectorAll('.fav-btn').forEach(btn => {
    if (decodeURIComponent(btn.dataset.url) === item.url) btn.classList.toggle('on', isFav(item.url));
  });
  notifyListChanged();
  if (detailFavUpdater) detailFavUpdater();
}

export function toggleFavFromCard(e, btn) {
  e.stopPropagation();
  toggleFav({
    url: decodeURIComponent(btn.dataset.url),
    title: btn.dataset.title || 'Sin título',
    poster: btn.dataset.poster || null,
    source: btn.dataset.source || ''
  });
}

export function addHistory(item) {
  history = history.filter(h => h.url !== item.url);
  history.unshift({ url: item.url, title: item.title, poster: item.poster || null, source: item.source || '', ts: Date.now() });
  if (history.length > 40) history = history.slice(0, 40);
  saveLS('ms_history', history);
  notifyListChanged();
}

export function updateProgress(item, pos, dur) {
  if (!item || !item.url || !dur || isNaN(dur) || dur <= 0) return;
  const entry = history.find(h => h.url === item.url);
  if (!entry) return;
  if (pos >= dur * 0.93 || dur - pos < 20) {
    delete entry.pos;
    delete entry.dur;
  } else {
    entry.pos = Math.round(pos);
    entry.dur = Math.round(dur);
  }
  history = history.filter(h => h.url !== item.url);
  history.unshift(entry);
  saveLS('ms_history', history);
}

export function removeFromHistory(e, btn) {
  e.stopPropagation();
  const url = decodeURIComponent(btn.dataset.url);
  history = history.filter(h => h.url !== url);
  saveLS('ms_history', history);
  notifyListChanged();
  showToast('Eliminado del historial');
}

export function isInWatchLater(url) {
  return watchLater.some(w => w.url === url);
}

export function toggleWatchLater(item) {
  const idx = watchLater.findIndex(w => w.url === item.url);
  if (idx >= 0) {
    watchLater.splice(idx, 1);
    showToast('Eliminado de Ver después');
  } else {
    watchLater.unshift({ url: item.url, title: item.title, poster: item.poster || null, source: item.source || '' });
    showToast('Agregado a Ver después');
  }
  saveLS('ms_watchlater', watchLater);
  document.querySelectorAll('.wl-btn').forEach(btn => {
    if (decodeURIComponent(btn.dataset.url) === item.url) btn.classList.toggle('on', isInWatchLater(item.url));
  });
  notifyListChanged();
  if (detailFavUpdater) detailFavUpdater();
}

export function removeFromWatchLater(e, btn) {
  e.stopPropagation();
  const url = decodeURIComponent(btn.dataset.url);
  watchLater = watchLater.filter(w => w.url !== url);
  saveLS('ms_watchlater', watchLater);
  notifyListChanged();
  showToast('Eliminado de Ver después');
}

export function getItemType(url) {
  const u = url || '';
  if (/\/anime\//.test(u)) return 'Anime';
  if (/\/ver-pelicula\/|\/pelicula\//.test(u)) return 'Película';
  if (/\/ver-serie\/|\/serie\/|\/episodio\/|\/ver-el-episodio\/|\/ver-capitulo\//.test(u)) return 'Serie';
  return '';
}

export function cardHtml(item, opts = {}) {
  const title = item.title || 'Sin título';
  const poster = safeImg(item.poster);
  const fav = isFav(item.url);
  const typeLabel = getItemType(item.url) || (item.category && item.category !== 'Estrenos' ? item.category : '');
  const progress = (item.pos && item.dur && item.pos > 0 && item.pos < item.dur * 0.93)
    ? `<div class="card-progress"><i style="width:${Math.min(100, Math.round(item.pos / item.dur * 100))}%"></i></div>`
    : '';
  return `
    <div class="video-card" data-url="${encodeURIComponent(item.url || '')}">
      <button class="fav-btn ${fav ? 'on' : ''}" data-url="${encodeURIComponent(item.url || '')}" data-title="${esc(title)}" data-poster="${esc(poster)}" data-source="${esc(item.source || '')}" onclick="toggleFavFromCard(event, this)" aria-label="Favorito">
        <svg viewBox="0 0 24 24"><path d="M12 21s-7.5-4.9-10-9.3C.4 8.6 2.3 5 5.8 5c2 0 3.6 1.1 4.4 2.7h3.6C14.6 6.1 16.2 5 18.2 5c3.5 0 5.4 3.6 3.8 6.7C19.5 16.1 12 21 12 21z"/></svg>
      </button>
      <img src="${poster}" alt="${esc(title)}" loading="lazy" decoding="async" onerror="this.src='${PLACEHOLDER_SVG}'" />
      <div class="title-overlay">${esc(title)}</div>
      ${typeLabel ? `<span class="cat-badge">${esc(typeLabel)}</span>` : ''}
      ${item.source ? `<span class="src-badge sb-${esc((item.source || '').toLowerCase())}">${esc(item.source)}</span>` : ''}
      ${progress}
      ${opts.deletable ? `<button class="card-del" data-url="${encodeURIComponent(item.url || '')}" onclick="${opts.deletable}(event, this)" aria-label="Eliminar">&times;</button>` : ''}
    </div>
  `;
}
