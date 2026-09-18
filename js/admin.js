import { API_BASE, esc, safeImg, showToast } from './utils.js';
import { isLoggedIn, isAdmin, getToken, clearSession } from './auth.js';

let adminPassword = '';

document.addEventListener('DOMContentLoaded', () => {
  const eyeBtn = document.querySelector('#loginScreen .field-eye');
  if (eyeBtn) eyeBtn.addEventListener('click', () => {
    const input = document.getElementById('loginPassword');
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    eyeBtn.classList.toggle('visible', show);
  });
  const form = document.getElementById('adminLoginForm');
  if (form) form.addEventListener('submit', e => { e.preventDefault(); adminLoginCheck(); });
  setupCoverPreview('plCoverInput', 'plCoverPreview');
  if (isLoggedIn() && isAdmin()) {
    showAdminUI();
    return;
  }
  const stored = localStorage.getItem('admin_password');
  const timestamp = localStorage.getItem('admin_timestamp');
  if (stored && timestamp && (Date.now() - parseInt(timestamp)) < 30 * 60 * 1000) {
    adminPassword = stored;
    showAdminUI();
  } else {
    document.getElementById('loginScreen').classList.remove('hidden');
    localStorage.removeItem('admin_password');
    localStorage.removeItem('admin_timestamp');
  }
});

function adminLoginCheck() {
  const pwd = document.getElementById('loginPassword').value;
  if (!pwd) return;
  const btn = document.getElementById('adminSubmit');
  btn.classList.add('loading');
  btn.querySelector('.btn-label').textContent = 'Verificando...';
  btn.disabled = true;
  fetch(`${API_BASE}/admin/avatar`, { headers: { 'X-Admin-Password': pwd } })
    .then(res => {
      if (!res.ok) throw new Error('Invalid password');
      adminPassword = pwd;
      localStorage.setItem('admin_password', pwd);
      localStorage.setItem('admin_timestamp', Date.now().toString());
      showAdminUI();
    })
    .catch(() => {
      const msg = document.getElementById('loginErrorMsg');
      const card = document.getElementById('adminCard');
      msg.classList.remove('hidden');
      card.classList.remove('auth-shake');
      void card.offsetWidth;
      card.classList.add('auth-shake');
      localStorage.removeItem('admin_password');
      localStorage.removeItem('admin_timestamp');
    })
    .finally(() => {
      btn.classList.remove('loading');
      btn.querySelector('.btn-label').textContent = 'Ingresar';
      btn.disabled = false;
    });
}

function showAdminUI() {
  const header = document.querySelector('.admin-header');
  if (header) header.classList.remove('header-floating');
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('adminContent').classList.remove('hidden');
  document.getElementById('adminNav').classList.remove('hidden');
  setupAdminTabs();
  setupPlaylistSearch();
  loadPanel();
}

function setupAdminTabs() {
  document.querySelectorAll('#adminNav .nav-item').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.view));
  });
}

function switchTab(view) {
  document.querySelectorAll('#adminNav .nav-item').forEach(t => t.classList.remove('active'));
  const tab = document.querySelector(`#adminNav .nav-item[data-view="${view}"]`);
  if (tab) tab.classList.add('active');
  document.querySelectorAll('.admin-view').forEach(v => v.classList.add('hidden'));
  document.getElementById('view-' + view).classList.remove('hidden');
  if (view === 'panel') loadPanel();
  if (view === 'playlists') loadPlaylists();
}

/* ============ PANEL ============ */
async function loadPanel() {
  try {
    const s = await apiFetch(`${API_BASE}/admin/stats`);
    const cache = s.cache || { search: 0, home: 0, tmdb: 0, other: 0 };
    document.getElementById('cacheBox').innerHTML = `
      <div class="cache-row">
        <span class="cache-name">Búsquedas guardadas <span class="cache-count">${cache.search}</span></span>
        <button class="btn btn-ghost btn-small" onclick="purgeCache('search')">Purgar</button>
      </div>
      <div class="cache-row">
        <span class="cache-name">Portada (mainpage) <span class="cache-count">${cache.home}</span></span>
        <button class="btn btn-ghost btn-small" onclick="purgeCache('home')">Purgar</button>
      </div>
      <div class="cache-row">
        <span class="cache-name">TMDB <span class="cache-count">${cache.tmdb}</span></span>
        <button class="btn btn-ghost btn-small" onclick="purgeCache('tmdb')">Purgar</button>
      </div>
      <div class="cache-row">
        <span class="cache-name">Otras claves <span class="cache-count">${cache.other}</span></span>
        <button class="btn btn-ghost btn-small" onclick="purgeCache('all')">Purgar todo</button>
      </div>`;
  } catch (e) {
    document.getElementById('cacheBox').innerHTML = '<p class="error">Error al cargar la caché</p>';
  }
}

async function purgeCache(scope) {
  try {
    const res = await apiFetch(`${API_BASE}/admin/cache/purge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope })
    });
    if (res.error) throw new Error(res.error);
    showToast(`Caché purgada: ${res.deleted} claves eliminadas${res.failed ? ` (${res.failed} fallaron)` : ''}`);
    loadPanel();
  } catch (e) { showToast('Error al purgar caché: ' + e.message, true); }
}

function logout() {
  localStorage.removeItem('admin_password');
  localStorage.removeItem('admin_timestamp');
  window.location.reload();
}

async function apiFetch(url, options = {}) {
  const token = (isLoggedIn() && isAdmin()) ? getToken() : '';
  const headers = token
    ? { 'Authorization': `Bearer ${token}`, ...options.headers }
    : { 'X-Admin-Password': adminPassword, ...options.headers };
  const res = await fetch(url, { ...options, headers });
  if (res.status === 401) {
    if (token) clearSession();
    logout();
    throw new Error('Sesión expirada');
  }
  if (!res.ok) throw new Error('API error');
  return res.json();
}

window.logout = logout;
window.adminLoginCheck = adminLoginCheck;
window.switchTab = switchTab;
window.purgeCache = purgeCache;
window.createPlaylist = createPlaylist;
window.renamePlaylist = renamePlaylist;
window.deletePlaylist = deletePlaylist;
window.openEditor = openEditor;
window.closeEditor = closeEditor;
window.addItem = addItem;
window.removeItem = removeItem;
window.editCover = editCover;
window.saveCover = saveCover;
window.removeCover = removeCover;
window.openDownloadEditor = openDownloadEditor;
window.closeDownloadEditor = closeDownloadEditor;
window.saveDownloadLink = saveDownloadLink;

/* ============ PLAYLISTS ============ */
let currentPlaylistId = null;
let plSearchTimer = null;
let plResults = [];
let plAddedKeys = new Set();
let currentPlaylists = [];

function setupCoverPreview(inputId, previewId) {
  const input = document.getElementById(inputId);
  const preview = document.getElementById(previewId);
  if (!input || !preview) return;
  input.addEventListener('input', () => {
    const v = input.value.trim();
    if (v) { preview.src = v; preview.classList.remove('hidden'); }
    else preview.classList.add('hidden');
  });
}

function plKey(it) {
  return `${it.type || 'movie'}|${it.item_id ?? it.id}`;
}

async function loadPlaylists() {
  try {
    const data = await apiFetch(`${API_BASE}/admin/playlists`);
    const list = data.playlists || [];
    currentPlaylists = list;
    document.getElementById('playlistsBox').innerHTML = list.length ? list.map(p => `
      <div class="playlist-row" id="plRow-${p.id}">
        ${p.cover ? `<img class="pl-row-cover" src="${safeImg(p.cover)}" alt="" onerror="this.remove()" />` : ''}
        <span class="playlist-row-name" id="plName-${p.id}">${esc(p.name)}</span>
        <span class="playlist-row-count">${p.count} títulos</span>
        <div class="btn-row" style="margin-top:0;">
          <button class="btn btn-ghost btn-small" onclick="openEditor(${p.id})">Editar</button>
          <button class="btn btn-ghost btn-small" onclick="renamePlaylist(${p.id})">Renombrar</button>
          <button class="btn btn-ghost btn-small" onclick="editCover(${p.id})">Portada</button>
          <button class="btn btn-danger btn-small" onclick="deletePlaylist(${p.id})">Borrar</button>
        </div>
      </div>`).join('') : '<p class="empty-msg">Aún no hay playlists. Crea la primera arriba.</p>';
  } catch (e) {
    document.getElementById('playlistsBox').innerHTML = '<p class="error">Error al cargar playlists</p>';
  }
}

function editCover(id) {
  const row = document.getElementById('plRow-' + id);
  const pl = currentPlaylists.find(p => p.id === id);
  if (!row || !pl) return;
  row.innerHTML = `
    <div class="pl-cover-editor">
      <img class="pl-cover-preview ${pl.cover ? '' : 'hidden'}" id="plCoverPrev-${id}" src="${safeImg(pl.cover)}" alt="" onerror="this.classList.add('hidden')" />
      <input type="url" id="plCoverIn-${id}" class="input-glass" placeholder="URL de portada" value="${esc(pl.cover || '')}" autocomplete="off" spellcheck="false" />
      <div class="btn-row" style="margin-top:0;">
        <button class="btn btn-neon btn-small" onclick="saveCover(${id})">Guardar</button>
        <button class="btn btn-ghost btn-small" onclick="removeCover(${id})">Quitar</button>
        <button class="btn btn-ghost btn-small" onclick="loadPlaylists()">Cancelar</button>
      </div>
    </div>`;
  setupCoverPreview('plCoverIn-' + id, 'plCoverPrev-' + id);
}

async function saveCover(id) {
  const pl = currentPlaylists.find(p => p.id === id);
  const v = document.getElementById('plCoverIn-' + id).value.trim();
  try {
    await apiFetch(`${API_BASE}/admin/playlists/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: pl.name, cover: v })
    });
    showToast(v ? 'Portada guardada' : 'Portada quitada');
  } catch (e) { showToast('Error', true); }
  loadPlaylists();
}

async function removeCover(id) {
  const pl = currentPlaylists.find(p => p.id === id);
  try {
    await apiFetch(`${API_BASE}/admin/playlists/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: pl.name, cover: '' })
    });
    showToast('Portada quitada');
  } catch (e) { showToast('Error', true); }
  loadPlaylists();
}

async function createPlaylist() {
  const input = document.getElementById('plNameInput');
  const coverInput = document.getElementById('plCoverInput');
  const name = input.value.trim();
  if (!name) { showToast('Escribe un nombre', true); return; }
  try {
    const data = await apiFetch(`${API_BASE}/admin/playlists`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, cover: coverInput.value.trim() })
    });
    input.value = '';
    coverInput.value = '';
    document.getElementById('plCoverPreview').classList.add('hidden');
    showToast('Playlist creada');
    loadPlaylists();
    openEditor(data.id);
  } catch (e) { showToast('Error', true); }
}

function renamePlaylist(id) {
  const span = document.getElementById('plName-' + id);
  const current = span.textContent;
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'input-glass';
  input.value = current;
  input.autocomplete = 'off';
  span.replaceWith(input);
  input.focus();
  input.select();
  const commit = async () => {
    const name = input.value.trim();
    if (name && name !== current) {
      try {
        await apiFetch(`${API_BASE}/admin/playlists/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name })
        });
        showToast('Playlist renombrada');
      } catch (e) { showToast('Error', true); }
    }
    loadPlaylists();
  };
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') commit();
    if (e.key === 'Escape') loadPlaylists();
  });
  input.addEventListener('blur', commit);
}

function deletePlaylist(id) {
  if (!confirm('¿Borrar esta playlist? Se eliminan sus títulos.')) return;
  apiFetch(`${API_BASE}/admin/playlists/${id}`, { method: 'DELETE' })
    .then(() => { showToast('Playlist eliminada'); loadPlaylists(); })
    .catch(() => showToast('Error', true));
}

function setupPlaylistSearch() {
  const input = document.getElementById('plSearchInput');
  input.addEventListener('input', () => {
    clearTimeout(plSearchTimer);
    const q = input.value.trim();
    if (q.length < 2) { document.getElementById('plSearchResults').innerHTML = ''; return; }
    plSearchTimer = setTimeout(() => searchTitles(q), 350);
  });
}

async function searchTitles(q) {
  const box = document.getElementById('plSearchResults');
  box.innerHTML = '<div class="cache-row"><span class="spinner"></span></div>';
  try {
    const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(q)}`);
    const items = await res.json();
    if (!items || !items.length) { box.innerHTML = '<p class="empty-msg">Sin resultados</p>'; return; }
    plResults = items;
    renderSearchResults();
  } catch (e) {
    box.innerHTML = '<p class="error">Error al buscar</p>';
  }
}

function renderSearchResults() {
  const box = document.getElementById('plSearchResults');
  box.innerHTML = plResults.map((it, i) => {
    const added = plAddedKeys.has(plKey(it));
    return `
      <div class="search-result-item">
        <img src="${safeImg(it.poster)}" alt="" loading="lazy" onerror="this.style.display='none'" />
        <span class="result-title">${esc(it.title)}</span>
        <span class="result-source">${it.type === 'tv' ? 'Serie' : 'Película'}</span>
        ${added
          ? '<button class="btn btn-ghost btn-small" disabled>✓</button>'
          : `<button class="btn btn-neon btn-small" onclick="addItem(${i})">+</button>`}
      </div>`;
  }).join('');
}

async function addItem(idx) {
  const it = plResults[idx];
  if (!it || !currentPlaylistId) return;
  try {
    const token = (isLoggedIn() && isAdmin()) ? getToken() : '';
    const headers = token
      ? { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
      : { 'Content-Type': 'application/json', 'X-Admin-Password': adminPassword };
    const res = await fetch(`${API_BASE}/admin/playlists/${currentPlaylistId}/items`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ item_id: it.id, type: it.type || 'movie', title: it.title, poster: it.poster || null, release_date: it.release_date || null, anime: !!it.anime })
    });
    if (res.status === 401) { logout(); return; }
    const data = await res.json();
    if (!res.ok) { showToast(data.error || 'Error', true); return; }
    showToast('Agregado a la playlist');
    plAddedKeys.add(plKey(it));
    renderSearchResults();
    loadEditorItems(currentPlaylistId);
  } catch (e) { showToast('Error', true); }
}

async function removeItem(plId, itemDbId) {
  try {
    await apiFetch(`${API_BASE}/admin/playlists/${plId}/items/${itemDbId}`, { method: 'DELETE' });
    showToast('Título quitado');
    loadEditorItems(plId);
  } catch (e) { showToast('Error', true); }
}

async function openEditor(id) {
  currentPlaylistId = id;
  plAddedKeys = new Set();
  document.getElementById('plEditor').classList.remove('hidden');
  document.getElementById('plSearchInput').value = '';
  document.getElementById('plSearchResults').innerHTML = '';
  await loadEditorItems(id);
  document.getElementById('plEditor').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closeEditor() {
  currentPlaylistId = null;
  document.getElementById('plEditor').classList.add('hidden');
}

async function loadEditorItems(id) {
  try {
    const data = await apiFetch(`${API_BASE}/admin/playlists`);
    const pl = (data.playlists || []).find(p => p.id === id);
    if (pl) document.getElementById('plEditorTitle').textContent = pl.name;
    const res = await fetch(`${API_BASE}/playlists/${id}`);
    const d = await res.json();
    const items = (d.playlist && d.playlist.items) || [];
    currentPlaylistItems = items;
    plAddedKeys = new Set(items.map(plKey));
    document.getElementById('plItemsList').innerHTML = items.length ? items.map((it, i) => `
      <div class="search-result-item">
        <img src="${safeImg(it.poster)}" alt="" loading="lazy" onerror="this.style.display='none'" />
        <span class="result-title">${esc(it.title)}</span>
        <span class="result-source">${it.anime ? 'Anime' : (it.type === 'tv' ? 'Serie' : 'Película')}</span>
        <button class="btn btn-ghost btn-small" onclick="openDownloadEditor(${i})">Descargar</button>
        <button class="btn btn-danger btn-small" onclick="removeItem(${id}, ${it.id})">Quitar</button>
      </div>`).join('') : '<p class="empty-msg">Vacía. Busca arriba y agrega títulos.</p>';
  } catch (e) {
    document.getElementById('plItemsList').innerHTML = '<p class="error">Error al cargar</p>';
  }
}

let currentPlaylistItems = [];
let currentDlItem = null;

async function openDownloadEditor(idx) {
  const it = currentPlaylistItems[idx];
  if (!it) return;
  currentDlItem = it;
  document.getElementById('dlEditor').classList.remove('hidden');
  const body = document.getElementById('dlEditorBody');
  document.getElementById('dlEditorTitle').textContent = `Descargas — ${it.title}`;
  body.innerHTML = '<div class="cache-row"><span class="spinner"></span></div>';
  try {
    const res = await fetch(`${API_BASE}/details?id=${encodeURIComponent(it.item_id)}&type=${it.type}`);
    const d = await res.json();
    const downloads = d.downloads || [];
    if (it.type === 'tv' && d.episodes && d.episodes.length) {
      body.innerHTML = `<div class="dl-ep-grid">${d.episodes.map(ep => {
        const dl = downloads.find(x => x.season === ep.season && x.episode === ep.episode);
        return `
          <div class="dl-ep-row">
            <span class="dl-ep-label">${esc(ep.name)} <small>${ep.season}x${ep.episode}</small></span>
            <input type="url" class="input-glass dl-ep-input" id="dlIn-${ep.season}-${ep.episode}" placeholder="URL de descarga" value="${esc(dl ? dl.url : '')}" autocomplete="off" spellcheck="false" />
            <button class="btn btn-neon btn-small" onclick="saveDownloadLink(${ep.season}, ${ep.episode})">Guardar</button>
          </div>`;
      }).join('')}</div>`;
    } else {
      const dl = downloads.find(x => !x.season && !x.episode) || downloads[0];
      body.innerHTML = `
        <div class="dl-ep-row">
          <input type="url" class="input-glass dl-ep-input" id="dlIn-0-0" placeholder="URL de descarga" value="${esc(dl ? dl.url : '')}" autocomplete="off" spellcheck="false" />
          <button class="btn btn-neon btn-small" onclick="saveDownloadLink(0, 0)">Guardar</button>
        </div>`;
    }
  } catch (e) {
    body.innerHTML = '<p class="error">Error al cargar</p>';
  }
  document.getElementById('dlEditor').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closeDownloadEditor() {
  currentDlItem = null;
  document.getElementById('dlEditor').classList.add('hidden');
}

async function saveDownloadLink(season, episode) {
  const input = document.getElementById(`dlIn-${season}-${episode}`);
  if (!input || !currentDlItem) return;
  const url = input.value.trim();
  try {
    await apiFetch(`${API_BASE}/admin/download-links`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_id: currentDlItem.item_id, type: currentDlItem.type, season, episode, url })
    });
    showToast(url ? 'Enlace guardado' : 'Enlace quitado');
  } catch (e) { showToast('Error', true); }
}