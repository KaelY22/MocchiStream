import { API_BASE, esc, safeImg, resetStorageIfStale, showToast } from './utils.js';
import { cardHtml, loadLists } from './catalog.js';
import { applyTheme, setupTheme, setupMenu, setupSearch, setupInstall, registerSW } from './header.js';

document.addEventListener('DOMContentLoaded', () => {
  if (resetStorageIfStale()) showToast('Datos locales renovados');
  applyTheme();
  loadLists();
  setupTheme();
  setupMenu();
  setupSearch();
  setupInstall();
  registerSW();
  loadPlaylists();
  document.addEventListener('click', e => {
    const card = e.target.closest('.video-card');
    if (card) location.href = `detalle.html?id=${encodeURIComponent(card.dataset.id)}&type=${encodeURIComponent(card.dataset.type)}`;
  });
});

async function loadPlaylists() {
  const grid = document.getElementById('playlistsGrid');
  grid.innerHTML = '<div class="cache-row"><span class="spinner"></span></div>';
  try {
    const res = await fetch(`${API_BASE}/playlists`);
    const data = await res.json();
    const list = data.playlists || [];
    if (!list.length) {
      grid.innerHTML = '<p class="empty-msg">Aún no hay playlists.</p>';
      return;
    }
    grid.innerHTML = list.map(p => `
      <button class="playlist-card${p.cover ? ' has-cover' : ''}" onclick="openPlaylist(${p.id})">
        ${p.cover ? `<img class="playlist-cover" src="${safeImg(p.cover)}" alt="" loading="lazy" onerror="this.remove()" />` : ''}
        <span class="playlist-body">
          <span class="playlist-name">${esc(p.name)}</span>
          <span class="playlist-count">${p.count} títulos</span>
        </span>
      </button>`).join('');
  } catch (e) {
    grid.innerHTML = '<p class="empty-msg">No se pudieron cargar las playlists.</p>';
  }
}

async function openPlaylist(id) {
  try {
    const res = await fetch(`${API_BASE}/playlists/${id}`);
    const data = await res.json();
    const pl = data.playlist;
    if (!pl) { showToast('Playlist no encontrada', true); return; }
    document.getElementById('playlistDetailTitle').textContent = pl.name;
    const detailCover = document.getElementById('plDetailCover');
    if (pl.cover) { detailCover.src = safeImg(pl.cover); detailCover.classList.remove('hidden'); }
    else detailCover.classList.add('hidden');
    const grid = document.getElementById('plItemsGrid');
    grid.innerHTML = pl.items.length
      ? pl.items.map(it => cardHtml({ id: it.item_id, type: it.type, title: it.title, poster: it.poster })).join('')
      : '<p class="empty-msg" style="grid-column:1/-1;">Esta playlist está vacía.</p>';
    document.getElementById('view-playlists').classList.add('hidden');
    document.getElementById('view-playlist-detail').classList.remove('hidden');
    window.scrollTo({ top: 0 });
  } catch (e) {
    showToast('Error al abrir la playlist', true);
  }
}

function backToPlaylists() {
  document.getElementById('view-playlist-detail').classList.add('hidden');
  document.getElementById('view-playlists').classList.remove('hidden');
}

window.openPlaylist = openPlaylist;
window.backToPlaylists = backToPlaylists;