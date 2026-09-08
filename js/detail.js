import { API_BASE, esc, showToast } from './utils.js';
import { isFav, toggleFav, isInWatchLater, toggleWatchLater, setDetailFavUpdater } from './catalog.js';
import { openSheet } from './player.js';

let currentDetail = null;
let detailSeason = 1;

export function initDetail() {
  setDetailFavUpdater(updateDetailFavBtn);
  document.getElementById('detailFavBtn').addEventListener('click', () => {
    if (currentDetail) toggleFav({ url: currentDetail.url, title: currentDetail.title, poster: currentDetail.poster, source: currentDetail.source });
  });
  document.getElementById('detailWLBtn').addEventListener('click', () => {
    if (currentDetail) toggleWatchLater({ url: currentDetail.url, title: currentDetail.title, poster: currentDetail.poster, source: currentDetail.source });
  });
}

export function openDetailFromUrl(url) {
  fetch(`${API_BASE}/details?url=${encodeURIComponent(url)}`)
    .then(res => res.json())
    .then(details => {
      openDetail({
        url,
        title: details.title || 'Sin título',
        poster: details.poster || null,
        source: details.source || '',
        description: details.description || '',
        type: details.type || 'movie',
        episodes: details.episodes || []
      });
    })
    .catch(() => {
      openDetail({ url, title: 'Contenido', poster: null, source: '', description: '', type: 'movie', episodes: [] });
    });
}

export function openDetail(item, season) {
  currentDetail = item;
  const seasons = [...new Set((item.episodes || []).map(e => e.season).filter(n => n !== null && n !== undefined))].sort((a, b) => a - b);
  detailSeason = season || seasons[0] || 1;
  const epsAll = (item.episodes || []).slice().sort((a, b) => (a.season - b.season) || (a.episode - b.episode));
  const nextResolver = item.type === 'series'
    ? (epLink) => {
        const idx = epsAll.findIndex(e => e.link === epLink);
        const nxt = idx >= 0 ? epsAll[idx + 1] : null;
        if (!nxt) return null;
        return { link: nxt.link, title: `${item.title} — Cap ${nxt.episode}` };
      }
    : null;

  const backdrop = document.getElementById('detailBackdrop');
  backdrop.style.backgroundImage = item.poster ? `url(${item.poster})` : '';
  document.getElementById('detailTitle').textContent = item.title;
  const badges = [item.source || 'Fuente', item.type === 'series' ? 'Serie' : 'Película'];
  document.getElementById('detailBadges').innerHTML = badges.map(b => `<span class="detail-badge">${esc(b)}</span>`).join('');
  document.getElementById('detailDesc').textContent = item.description || '';
  document.getElementById('detailDownloadBtn').classList.toggle('hidden', item.type === 'series');
  const playBtn = document.getElementById('detailPlayBtn');
  playBtn.onclick = () => {
    if (item.type === 'series') {
      const eps = (item.episodes || []).filter(e => e.season === detailSeason);
      const ep = eps[0];
      if (ep) openSheet(ep.link, `${item.title} — Cap ${ep.episode}`, item.poster, nextResolver);
      else showToast('No hay episodios en esta temporada.', true);
    } else {
      openSheet(item.url, item.title, item.poster);
    }
  };
  const seasonsTitle = document.getElementById('detailSeasonsTitle');
  const seasonsBox = document.getElementById('detailSeasons');
  if (item.type === 'series' && item.episodes && item.episodes.length) {
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
        const url = btn.dataset.url;
        if (!url) {
          showToast('Este capítulo solo está disponible para descarga.');
          return;
        }
        openSheet(url, `${item.title} — ${btn.querySelector('.ep-name').textContent}`, item.poster, nextResolver);
      });
    });
  } else {
    seasonsTitle.classList.add('hidden');
    seasonsBox.classList.add('hidden');
  }
  updateDetailFavBtn();
  const shareBtn = document.getElementById('detailShareBtn');
  shareBtn.dataset.url = item.url;
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
    const thumb = (e.poster && String(e.poster).startsWith('http')) ? e.poster : (item.poster || '');
    const numLabel = `Cap ${e.episode}`;
    return `
      <div class="ep-item ${e.custom ? 'ep-custom' : ''}" data-url="${esc(e.link || '')}">
        ${thumb ? `<img class="ep-thumb" src="${thumb}" alt="" loading="lazy" onerror="this.style.display='none'" />` : `<span class="ep-num">${numLabel}</span>`}
        <span class="ep-name">${esc(e.name)}</span>
        ${thumb ? `<span class="ep-num">${numLabel}</span>` : ''}
        <button class="ep-dl" onclick="epDownload(event, this)" data-link="${esc(e.download_link || '')}" aria-label="Descargar capítulo">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v10m0 0 4-4m-4 4-4-4M4 19h16"/></svg>
        </button>
      </div>`;
  }).join('');
}

export function epDownload(e, btn) {
  e.stopPropagation();
  const link = btn.dataset.link;
  if (link) {
    window.open(link, '_blank');
  } else {
    showToast('Podrías intentar una descarga externa en el reproductor, pero no es seguro que funcione. Si no, avísale al dev y te dará una descarga local.');
  }
}

function updateDetailFavBtn() {
  const btn = document.getElementById('detailFavBtn');
  if (!currentDetail) return;
  const on = isFav(currentDetail.url);
  btn.classList.toggle('fav-on', on);
  btn.innerHTML = on
    ? `<svg viewBox="0 0 24 24"><path d="M12 21s-7.5-4.9-10-9.3C.4 8.6 2.3 5 5.8 5c2 0 3.6 1.1 4.4 2.7h3.6C14.6 6.1 16.2 5 18.2 5c3.5 0 5.4 3.6 3.8 6.7C19.5 16.1 12 21 12 21z"/></svg>`
    : `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 21s-7.5-4.9-10-9.3C.4 8.6 2.3 5 5.8 5c2 0 3.6 1.1 4.4 2.7h3.6C14.6 6.1 16.2 5 18.2 5c3.5 0 5.4 3.6 3.8 6.7C19.5 16.1 12 21 12 21z"/></svg>`;
  const wlBtn = document.getElementById('detailWLBtn');
  wlBtn.classList.toggle('fav-on', isInWatchLater(currentDetail.url));
}

export function closeDetail() {
  const view = document.getElementById('detailView');
  if (view.classList.contains('hidden')) return;
  view.classList.add('closing');
  setTimeout(() => {
    view.classList.add('hidden');
    view.classList.remove('closing', 'opening');
    document.body.style.overflow = 'auto';
    currentDetail = null;
  }, 160);
}

export function detailDownload() {
  if (!currentDetail) return;
  fetch(`${API_BASE}/metadata?url=${encodeURIComponent(currentDetail.url)}`)
    .then(res => res.json())
    .then(meta => {
      if (meta && meta.download_link) {
        window.open(meta.download_link, '_blank');
      } else {
        showToast('Actualmente no contamos con la descarga de este título. El dev está en eso — ¡pronto estará disponible! 🛠');
      }
    })
    .catch(() => {
      showToast('Actualmente no contamos con la descarga de este título. El dev está en eso — ¡pronto estará disponible! 🛠');
    });
}
