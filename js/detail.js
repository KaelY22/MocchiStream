import { API_BASE, esc, showToast, safeImg, PLACEHOLDER_SVG } from './utils.js';
import { isFav, toggleFav, isInWatchLater, toggleWatchLater, setDetailFavUpdater } from './catalog.js';

let currentDetail = null;
let detailSeason = 1;

export function fetchItem(id, type) {
  return fetch(`${API_BASE}/details?id=${encodeURIComponent(id)}&type=${encodeURIComponent(type || 'movie')}`)
    .then(res => res.json())
    .then(details => {
      if (!details || !details.id) throw new Error('sin datos');
      return {
        id: details.id,
        type: details.type || type || 'movie',
        title: details.title || 'Sin título',
        poster: details.poster || null,
        backdrop: details.backdrop || null,
        overview: details.overview || '',
        genres: details.genres || [],
        year: details.year || null,
        score: details.score || null,
        anime: !!details.anime,
        episodes: details.episodes || []
      };
    });
}

export function nextEpisodeResolver(item) {
  if (item.type !== 'tv') return null;
  const epsAll = (item.episodes || []).slice().sort((a, b) => (a.season - b.season) || (a.episode - b.episode));
  return (currentEp) => {
    const idx = epsAll.findIndex(e => e.season === currentEp.season && e.episode === currentEp.episode);
    const nxt = idx >= 0 ? epsAll[idx + 1] : null;
    if (!nxt) return null;
    return { season: nxt.season, episode: nxt.episode, title: `${item.title} — Cap ${nxt.episode}` };
  };
}

export function initDetail() {
  setDetailFavUpdater(updateDetailFavBtn);
  document.getElementById('detailFavBtn').addEventListener('click', () => {
    if (currentDetail) toggleFav({ id: currentDetail.id, type: currentDetail.type, title: currentDetail.title, poster: currentDetail.poster });
  });
  document.getElementById('detailWLBtn').addEventListener('click', () => {
    if (currentDetail) toggleWatchLater({ id: currentDetail.id, type: currentDetail.type, title: currentDetail.title, poster: currentDetail.poster });
  });
}

export function openDetailFromId(id, type) {
  fetchItem(id, type)
    .then(item => openDetail(item))
    .catch(() => {
      showToast('No se pudo cargar el título.', true);
    });
}

export function openDetail(item, season) {
  currentDetail = item;
  const seasons = [...new Set((item.episodes || []).map(e => e.season).filter(n => n !== null && n !== undefined))].sort((a, b) => a - b);
  detailSeason = season || seasons[0] || 1;

  const backdrop = document.getElementById('detailBackdrop');
  const bgUrl = safeImg(item.backdrop || item.poster);
  backdrop.style.backgroundImage = bgUrl !== PLACEHOLDER_SVG ? `url(${bgUrl})` : '';
  document.getElementById('detailTitle').textContent = item.title;
  const badges = [item.type === 'tv' ? 'Serie' : 'Película'];
  if (item.year) badges.push(String(item.year));
  if (item.score) badges.push(`★ ${item.score}`);
  document.getElementById('detailBadges').innerHTML = badges.map(b => `<span class="detail-badge">${esc(b)}</span>`).join('');
  document.getElementById('detailDesc').textContent = item.overview || '';
  const playBtn = document.getElementById('detailPlayBtn');
  playBtn.onclick = () => {
    if (item.type === 'tv') {
      const eps = (item.episodes || []).filter(e => e.season === detailSeason);
      const ep = eps[0];
      if (ep) location.href = `ver.html?id=${encodeURIComponent(item.id)}&type=${item.type}&season=${ep.season}&episode=${ep.episode}`;
      else showToast('No hay episodios en esta temporada.', true);
    } else {
      location.href = `ver.html?id=${encodeURIComponent(item.id)}&type=${item.type}`;
    }
  };
  const seasonsTitle = document.getElementById('detailSeasonsTitle');
  const seasonsBox = document.getElementById('detailSeasons');
  if (item.type === 'tv' && item.episodes && item.episodes.length) {
    seasonsTitle.textContent = 'Episodios';
    seasonsTitle.classList.remove('hidden');
    seasonsBox.innerHTML = `
      ${seasons.length > 1 ? `<div class="season-tabs">${seasons.map(s => `<button class="season-tab ${s === detailSeason ? 'active' : ''}" data-season="${s}">Temporada ${s}</button>`).join('')}</div>` : ''}
      <div class="ep-list">${renderEps(item.episodes.filter(e => e.season === detailSeason), item)}</div>`;
    seasonsBox.classList.remove('hidden');
    seasonsBox.querySelectorAll('.season-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        openDetail(item, parseInt(tab.dataset.season));
      });
    });
    seasonsBox.querySelectorAll('.ep-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const ep = { season: parseInt(btn.dataset.season), episode: parseInt(btn.dataset.episode), name: btn.querySelector('.ep-name').textContent };
        location.href = `ver.html?id=${encodeURIComponent(item.id)}&type=${item.type}&season=${ep.season}&episode=${ep.episode}`;
      });
    });
  } else {
    seasonsTitle.classList.add('hidden');
    seasonsBox.classList.add('hidden');
  }
  updateDetailFavBtn();
  const shareBtn = document.getElementById('detailShareBtn');
  shareBtn.dataset.id = item.id;
  shareBtn.dataset.type = item.type;
  shareBtn.dataset.title = item.title;
  const view = document.getElementById('detailView');
  view.classList.remove('hidden', 'closing');
  void view.offsetWidth;
  view.classList.add('opening');
  clearTimeout(view._ot);
  view._ot = setTimeout(() => view.classList.remove('opening'), 1400);
  document.body.style.overflow = 'hidden';
  document.getElementById('detailView').scrollTop = 0;
}

function renderEps(eps, item) {
  if (!eps.length) return '<p class="hint">Sin episodios en esta temporada.</p>';
  return eps.map(e => {
    const thumb = (e.still && String(e.still).startsWith('http')) ? safeImg(e.still) : (item.poster ? safeImg(item.poster) : '');
    const numLabel = `Cap ${e.episode}`;
    return `
      <div class="ep-item" data-season="${e.season}" data-episode="${e.episode}">
        ${thumb ? `<img class="ep-thumb" src="${thumb}" alt="" loading="lazy" onerror="this.style.display='none'" />` : `<span class="ep-num">${numLabel}</span>`}
        <span class="ep-name">${esc(e.name)}</span>
        ${thumb ? `<span class="ep-num">${numLabel}</span>` : ''}
      </div>`;
  }).join('');
}

function updateDetailFavBtn() {
  const btn = document.getElementById('detailFavBtn');
  if (!currentDetail) return;
  const on = isFav(currentDetail);
  btn.classList.toggle('fav-on', on);
  btn.innerHTML = on
    ? `<svg viewBox="0 0 24 24"><path d="M12 21s-7.5-4.9-10-9.3C.4 8.6 2.3 5 5.8 5c2 0 3.6 1.1 4.4 2.7h3.6C14.6 6.1 16.2 5 18.2 5c3.5 0 5.4 3.6 3.8 6.7C19.5 16.1 12 21 12 21z"/></svg>`
    : `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 21s-7.5-4.9-10-9.3C.4 8.6 2.3 5 5.8 5c2 0 3.6 1.1 4.4 2.7h3.6C14.6 6.1 16.2 5 18.2 5c3.5 0 5.4 3.6 3.8 6.7C19.5 16.1 12 21 12 21z"/></svg>`;
  const wlBtn = document.getElementById('detailWLBtn');
  wlBtn.classList.toggle('fav-on', isInWatchLater(currentDetail));
}

export function closeDetail() {
  const view = document.getElementById('detailView');
  if (view.classList.contains('hidden') || view.classList.contains('closing')) return;
  view.classList.add('closing');
  setTimeout(() => {
    view.classList.add('hidden');
    view.classList.remove('closing', 'opening');
    document.body.style.overflow = 'auto';
    currentDetail = null;
  }, 160);
  history.back();
}