import { API_BASE, PLACEHOLDER_SVG, showToast, esc, safeImg } from './utils.js';

let adminPassword = '';
let searchResults = [];
let selectedMovie = null;
let registryData = [];

document.addEventListener('DOMContentLoaded', () => {
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
  adminPassword = pwd;
  localStorage.setItem('admin_password', pwd);
  localStorage.setItem('admin_timestamp', Date.now().toString());
  fetch(`${API_BASE}/admin/avatar`, { headers: { 'X-Admin-Password': pwd } })
    .then(res => {
      if (res.ok) { showAdminUI(); }
      else { throw new Error('Invalid password'); }
    })
    .catch(() => {
      document.getElementById('loginErrorMsg').classList.remove('hidden');
      localStorage.removeItem('admin_password');
    });
}

function showAdminUI() {
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('adminContent').classList.remove('hidden');
  document.getElementById('adminNav').classList.remove('hidden');
  loadAvatar();
  setupSearch();
  setupAdminTabs();
  setupRegistryFilter();
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
  if (view === 'categories') loadCategoriesView();
  if (view === 'panel') loadPanel();
  if (view === 'registry') loadRegistry();
}

/* ============ PANEL ============ */
async function loadPanel() {
  try {
    const s = await apiFetch(`${API_BASE}/admin/stats`);
    document.getElementById('statsGrid').innerHTML = [
      { n: s.categories, l: 'Categorías' },
      { n: s.metadata, l: 'Títulos con metadatos' },
      { n: s.with_download, l: 'Con enlace de descarga' },
      { n: s.custom_episodes, l: 'Capítulos personalizados' }
    ].map(c => `
      <div class="stat-card">
        <span class="stat-num">${c.n}</span>
        <span class="stat-label">${c.l}</span>
      </div>`).join('');

    const cache = s.cache || { search: 0, home: 0, other: 0 };
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
        <span class="cache-name">Otras claves <span class="cache-count">${cache.other}</span></span>
        <button class="btn btn-ghost btn-small" onclick="purgeCache('all')">Purgar todo</button>
      </div>`;
  } catch (e) {
    document.getElementById('statsGrid').innerHTML = '<p class="error">Error al cargar estadísticas</p>';
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
    showToast(`Caché purgada: ${res.deleted} claves eliminadas`);
    loadPanel();
  } catch (e) { showToast('Error al purgar caché', true); }
}

/* ============ CATEGORIAS ============ */
async function loadCategoriesView() {
  const list = document.getElementById('categoriesList');
  try {
    const cats = await apiFetch(`${API_BASE}/categories`);
    if (!cats || cats.length === 0) {
      list.innerHTML = '<div class="empty-state">No tienes categorías personalizadas todavía.<br>Busca algo en el catálogo y asígnalo a una.</div>';
      return;
    }
    const rows = await Promise.all(cats.map(async c => {
      try {
        const items = await apiFetch(`${API_BASE}/metadata/bycategory?cat=${encodeURIComponent(c)}`);
        return { name: c, items: Array.isArray(items) ? items : [] };
      } catch (e) { return { name: c, items: [] }; }
    }));
    list.innerHTML = rows.map((r, i) => `
      <div class="cat-row" data-cat="${esc(r.name)}">
        <div class="cat-row-head" role="button" tabindex="0" onclick="toggleCatRow(this)" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();toggleCatRow(this)}">
          <span class="cat-row-name">${esc(r.name)}</span>
          <span class="cat-row-count">${r.items.length} ${r.items.length === 1 ? 'item' : 'items'}</span>
          <button class="btn btn-ghost btn-small cat-row-rename" onclick="renameCategory(this)" title="Renombrar">Renombrar</button>
          <svg class="cat-row-chev ${i === 0 ? 'open' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7"/></svg>
        </div>
        <div class="cat-items ${i === 0 ? 'open' : ''}">
          ${r.items.length ? r.items.map(item => `
            <div class="cat-item">
              <img class="cat-item-poster" src="${safeImg(item.poster)}" alt="" loading="lazy" />
              <span class="cat-item-title">${esc(item.title)}</span>
              <span class="src-badge sb-${esc((item.source || '').toLowerCase())}">${esc(item.source || '')}</span>
              <button class="cat-item-move" onclick="moveCatItem(this)" data-url="${encodeURIComponent(item.url)}" title="Mover a otra categoría">↗</button>
              <button class="cat-item-del" onclick="deleteCatItem(this)" data-url="${encodeURIComponent(item.url)}" aria-label="Eliminar">&times;</button>
            </div>
          `).join('') : '<p class="hint">Esta categoría está vacía.</p>'}
        </div>
      </div>`).join('');
  } catch (e) {
    list.innerHTML = '<p class="error">Error al cargar categorías</p>';
  }
}

function toggleCatRow(headBtn) {
  const row = headBtn.closest('.cat-row');
  const items = row.querySelector('.cat-items');
  const chev = headBtn.querySelector('.cat-row-chev');
  items.classList.toggle('open');
  chev.classList.toggle('open');
}

async function renameCategory(btn) {
  btn.stopPropagation();
  const row = btn.closest('.cat-row');
  const current = row.dataset.cat;
  const name = prompt('Nuevo nombre para la categoría:', current);
  if (!name || name.trim() === current) return;
  try {
    await apiFetch(`${API_BASE}/admin/category/rename`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: current, to: name.trim() })
    });
    showToast(`Categoría renombrada a "${name.trim()}"`);
    loadCategoriesView();
    loadPanel();
  } catch (e) { showToast('Error al renombrar', true); }
}

async function moveCatItem(btn) {
  const url = decodeURIComponent(btn.dataset.url);
  const target = prompt('Mover a la categoría (escribe el nombre):');
  if (!target || !target.trim()) return;
  try {
    const movie = { title: btn.closest('.cat-item').querySelector('.cat-item-title').textContent, url };
    await apiFetch(`${API_BASE}/admin/metadata`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: url,
        title: movie.title,
        external_url: url,
        custom_category: target.trim(),
        download_link: null
      })
    });
    showToast('Título movido de categoría');
    loadCategoriesView();
    loadPanel();
  } catch (e) { showToast('Error al mover', true); }
}

function deleteCatItem(btn) {
  if (!confirm('¿Quitar este título de tu categoría? (Se eliminarán sus metadatos personalizados)')) return;
  const url = decodeURIComponent(btn.dataset.url);
  apiFetch(`${API_BASE}/admin/metadata?url=${encodeURIComponent(url)}`, { method: 'DELETE' })
    .then(() => {
      showToast('Título eliminado de la categoría');
      loadCategoriesView();
      loadPanel();
    })
    .catch(e => showToast('Error: ' + e.message, true));
}

function logout() {
  localStorage.removeItem('admin_password');
  localStorage.removeItem('admin_timestamp');
  window.location.reload();
}

async function apiFetch(url, options = {}) {
  const headers = { 'X-Admin-Password': adminPassword, ...options.headers };
  const res = await fetch(url, { ...options, headers });
  if (res.status === 401) {
    logout();
    throw new Error('Sesión expirada');
  }
  if (!res.ok) throw new Error('API error');
  return res.json();
}

async function loadAvatar() {
  try {
    const data = await apiFetch(`${API_BASE}/admin/avatar`);
    document.getElementById('adminAvatarPreview').src = data.avatar || '';
    document.getElementById('avatarUrlInput').value = data.avatar || '';
  } catch (e) {}
}

/* ============ CATALOGO: BUSQUEDA ============ */
function setupSearch() {
  const input = document.getElementById('adminSearch');
  const resultsDiv = document.getElementById('searchResults');
  let timeout;
  const run = () => {
    clearTimeout(timeout);
    const query = input.value.trim();
    if (query.length < 2) { resultsDiv.innerHTML = ''; return; }
    timeout = setTimeout(async () => {
      const source = document.querySelector('#adminSourceChips .chip.active')?.dataset.src || '';
      try {
        const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(query)}${source ? '&source=' + encodeURIComponent(source) : ''}`);
        const items = await res.json();
        searchResults = items;
        resultsDiv.innerHTML = items.length ? items.map(item => `
          <button class="search-result-item" data-url="${encodeURIComponent(item.url || '')}">
            <img src="${safeImg(item.poster)}" />
            <span class="result-title">${esc(item.title)}</span>
            ${item.source ? `<span class="result-source">${esc(item.source)}</span>` : ''}
          </button>
        `).join('') : '<p class="hint">Sin resultados.</p>';
        resultsDiv.querySelectorAll('.search-result-item').forEach(el => {
          el.addEventListener('click', () => {
            const url = decodeURIComponent(el.dataset.url);
            openEditForm({ url, title: el.querySelector('.result-title').textContent });
          });
        });
      } catch (e) { resultsDiv.innerHTML = '<p class="error">Error al buscar</p>'; }
    }, 500);
  };
  input.addEventListener('input', run);
  document.querySelectorAll('#adminSourceChips .chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#adminSourceChips .chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      run();
    });
  });
}

async function openEditForm(movie) {
  selectedMovie = movie;
  let meta = null;
  try {
    meta = await apiFetch(`${API_BASE}/metadata?url=${encodeURIComponent(movie.url)}`);
  } catch (e) {}
  document.getElementById('editTitle').textContent = movie.title;
  document.getElementById('editCategory').value = meta?.custom_category || '';
  document.getElementById('editDownload').value = meta?.download_link || '';
  document.getElementById('editDownloadGroup').classList.toggle('hidden', isSeriesUrl(movie.url));
  document.getElementById('editForm').classList.remove('hidden');
  document.getElementById('editForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
  if (isSeriesUrl(movie.url)) {
    document.getElementById('episodesSection').classList.remove('hidden');
    loadEpisodesSection();
  } else {
    document.getElementById('episodesSection').classList.add('hidden');
  }
}

function isSeriesUrl(url) {
  return /(\/ver-serie\/|\/serie\/[^/]+$)/.test(url || '');
}

async function loadEpisodesSection() {
  const box = document.getElementById('episodesList');
  if (!selectedMovie) return;
  box.innerHTML = '<p class="hint"><span class="spinner"></span>Cargando episodios...</p>';
  let details = null;
  let saved = [];
  try {
    details = await fetch(`${API_BASE}/details?url=${encodeURIComponent(selectedMovie.url)}`).then(r => r.json());
  } catch (e) {}
  try {
    saved = await apiFetch(`${API_BASE}/admin/episodes?url=${encodeURIComponent(selectedMovie.url)}`);
  } catch (e) {}
  const eps = (details && details.episodes) || [];
  const savedMap = {};
  (saved || []).forEach(r => { savedMap[`${r.season}|${r.episode}`] = r; });
  const seasons = [...new Set(eps.map(e => e.season).filter(n => n !== null && n !== undefined))].sort((a, b) => a - b);
  let html = '';
  for (const s of seasons) {
    html += `<h4 class="ep-sec-title">Temporada ${s}</h4>`;
    for (const ep of eps.filter(e => e.season === s)) {
      const savedRow = savedMap[`${ep.season}|${ep.episode}`];
      html += `
        <div class="ep-edit-row" data-key="${ep.season}|${ep.episode}">
          <span class="ep-edit-name">${esc(ep.name)}</span>
          <input type="text" class="input-glass ep-edit-input" autocomplete="off" placeholder="Enlace de descarga" value="${esc(savedRow ? savedRow.download_link || '' : '')}" />
          <button class="btn btn-neon btn-small" onclick="saveEpLink(this)">Guardar</button>
        </div>`;
    }
  }
  const customs = (saved || []).filter(r => r.is_custom);
  if (customs.length) {
    html += '<h4 class="ep-sec-title">Capítulos personalizados</h4>';
    for (const c of customs) {
      html += `
        <div class="ep-edit-row">
          <span class="ep-edit-name">T${c.season}x${c.episode} · ${esc(c.name || 'Capítulo ' + c.episode)}</span>
          <span class="ep-edit-dl">${esc(c.download_link || '')}</span>
          <button class="btn btn-danger btn-small" onclick="deleteCustomEp(this)" data-season="${c.season}" data-episode="${c.episode}">Eliminar</button>
        </div>`;
    }
  }
  html += `
    <h4 class="ep-sec-title">Agregar capítulo nuevo (solo descarga)</h4>
    <div class="ep-add-row">
      <div class="ep-add-field">
        <label class="ep-add-label">Temporada</label>
        <input type="text" id="newEpSeason" class="input-glass" autocomplete="off" placeholder="Ej: 1" />
      </div>
      <div class="ep-add-field">
        <label class="ep-add-label">Capítulo</label>
        <input type="text" id="newEpNum" class="input-glass" autocomplete="off" placeholder="Ej: 8" />
      </div>
      <div class="ep-add-field">
        <label class="ep-add-label">Nombre</label>
        <input type="text" id="newEpName" class="input-glass" autocomplete="off" placeholder="Ej: Capítulo extra" />
      </div>
    </div>
    <div class="ep-add-row">
      <input type="text" id="newEpLink" class="input-glass w-full" autocomplete="off" placeholder="Enlace de descarga (mega.nz, drive...)" />
      <button class="btn btn-neon btn-small" onclick="addCustomEp()">Agregar</button>
    </div>`;
  box.innerHTML = html;
}

async function saveEpLink(btn) {
  if (!selectedMovie) return;
  const row = btn.closest('.ep-edit-row');
  const parts = row.dataset.key.split('|');
  const link = row.querySelector('.ep-edit-input').value.trim();
  try {
    await apiFetch(`${API_BASE}/admin/episodes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        series_url: selectedMovie.url,
        season: parseInt(parts[0]),
        episode: parseInt(parts[1]),
        download_link: link,
        is_custom: false
      })
    });
    showToast(link ? 'Enlace de descarga guardado' : 'Enlace de descarga eliminado');
  } catch (e) { showToast('Error: ' + e.message, true); }
}

async function addCustomEp() {
  if (!selectedMovie) return;
  const season = document.getElementById('newEpSeason').value;
  const episode = document.getElementById('newEpNum').value;
  const name = document.getElementById('newEpName').value.trim();
  const link = document.getElementById('newEpLink').value.trim();
  if (!season || !episode || !link) {
    showToast('Completa temporada, capítulo y enlace de descarga', true);
    return;
  }
  try {
    await apiFetch(`${API_BASE}/admin/episodes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        series_url: selectedMovie.url,
        season: parseInt(season),
        episode: parseInt(episode),
        name,
        download_link: link,
        is_custom: true
      })
    });
    showToast('Capítulo agregado');
    loadEpisodesSection();
  } catch (e) { showToast('Error: ' + e.message, true); }
}

async function deleteCustomEp(btn) {
  if (!selectedMovie) return;
  if (!confirm('¿Eliminar este capítulo personalizado?')) return;
  try {
    await apiFetch(`${API_BASE}/admin/episodes?series_url=${encodeURIComponent(selectedMovie.url)}&season=${btn.dataset.season}&episode=${btn.dataset.episode}`, { method: 'DELETE' });
    showToast('Capítulo eliminado');
    loadEpisodesSection();
  } catch (e) { showToast('Error: ' + e.message, true); }
}

async function saveMetadata() {
  if (!selectedMovie) return;
  const custom_category = document.getElementById('editCategory').value.trim() || null;
  const download_link = document.getElementById('editDownload').value.trim() || null;
  const id = selectedMovie.url;

  try {
    await apiFetch(`${API_BASE}/admin/metadata`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id,
        title: selectedMovie.title,
        external_url: selectedMovie.url,
        custom_category,
        download_link
      })
    });
    showToast('Metadatos guardados correctamente');
    document.getElementById('editForm').classList.add('hidden');
    document.getElementById('adminSearch').dispatchEvent(new Event('input'));
    loadRegistry();
  } catch (e) {
    showToast('Error al guardar: ' + e.message, true);
  }
}

function deleteMetadata() {
  if (!selectedMovie) return;
  if (!confirm('¿Eliminar metadatos personalizados de esta película?')) return;
  apiFetch(`${API_BASE}/admin/metadata?url=${encodeURIComponent(selectedMovie.url)}`, { method: 'DELETE' })
    .then(() => {
      showToast('Metadatos eliminados');
      document.getElementById('editForm').classList.add('hidden');
      document.getElementById('adminSearch').dispatchEvent(new Event('input'));
      loadRegistry();
    })
    .catch(e => showToast('Error: ' + e.message, true));
}

function closeEditForm() {
  document.getElementById('editForm').classList.add('hidden');
  document.getElementById('episodesSection').classList.add('hidden');
  selectedMovie = null;
}

/* ============ REGISTRO ============ */
function setupRegistryFilter() {
  document.getElementById('registryFilter').addEventListener('input', renderRegistry);
}

async function loadRegistry() {
  const list = document.getElementById('registryList');
  list.innerHTML = '<p class="hint"><span class="spinner"></span>Cargando registro...</p>';
  try {
    registryData = await apiFetch(`${API_BASE}/admin/metadata/all`);
    renderRegistry();
  } catch (e) {
    list.innerHTML = '<p class="error">Error al cargar el registro</p>';
  }
}

function renderRegistry() {
  const list = document.getElementById('registryList');
  const filter = (document.getElementById('registryFilter').value || '').toLowerCase().trim();
  const items = filter
    ? registryData.filter(r => (r.title || '').toLowerCase().includes(filter) || (r.custom_category || '').toLowerCase().includes(filter))
    : registryData;
  if (!items.length) {
    list.innerHTML = '<div class="empty-state">Sin resultados' + (filter ? ' para ese filtro.' : ' todavía. Agrega metadatos desde el catálogo.') + '</div>';
    return;
  }
  list.innerHTML = items.map(r => `
    <div class="reg-item">
      <span class="reg-title">${esc(r.title)}</span>
      <span class="reg-cat">${r.custom_category ? esc(r.custom_category) : '<em class="reg-none">sin categoría</em>'}</span>
      ${r.download_link ? '<span class="reg-dl">↓ descarga</span>' : ''}
      <span class="reg-date">${esc(String(r.updated_at || '').slice(0, 10))}</span>
      <button class="btn btn-ghost btn-small" onclick="editRegistryItem(this)" data-url="${encodeURIComponent(r.external_url)}" data-title="${esc(r.title)}">Editar</button>
      <button class="btn btn-danger btn-small" onclick="deleteRegistryItem(this)" data-url="${encodeURIComponent(r.external_url)}">×</button>
    </div>`).join('');
}

function editRegistryItem(btn) {
  switchTab('catalog');
  openEditForm({ url: decodeURIComponent(btn.dataset.url), title: btn.dataset.title });
}

function deleteRegistryItem(btn) {
  if (!confirm('¿Eliminar los metadatos de este título?')) return;
  const url = decodeURIComponent(btn.dataset.url);
  apiFetch(`${API_BASE}/admin/metadata?url=${encodeURIComponent(url)}`, { method: 'DELETE' })
    .then(() => {
      showToast('Metadatos eliminados');
      loadRegistry();
      loadPanel();
    })
    .catch(e => showToast('Error: ' + e.message, true));
}

/* ============ PERFIL ============ */
async function saveAvatar() {
  const avatar = document.getElementById('avatarUrlInput').value.trim();
  try {
    await apiFetch(`${API_BASE}/admin/avatar`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ avatar })
    });
    document.getElementById('adminAvatarPreview').src = avatar;
    showToast('Avatar actualizado');
  } catch (e) { showToast('Error', true); }
}

async function deleteAvatar() {
  try {
    await apiFetch(`${API_BASE}/admin/avatar`, { method: 'DELETE' });
    document.getElementById('avatarUrlInput').value = '';
    document.getElementById('adminAvatarPreview').src = '';
    showToast('Avatar eliminado');
  } catch (e) { showToast('Error', true); }
}

window.logout = logout;
window.adminLoginCheck = adminLoginCheck;
window.switchTab = switchTab;
window.purgeCache = purgeCache;
window.toggleCatRow = toggleCatRow;
window.renameCategory = renameCategory;
window.moveCatItem = moveCatItem;
window.deleteCatItem = deleteCatItem;
window.saveEpLink = saveEpLink;
window.addCustomEp = addCustomEp;
window.deleteCustomEp = deleteCustomEp;
window.saveMetadata = saveMetadata;
window.deleteMetadata = deleteMetadata;
window.closeEditForm = closeEditForm;
window.editRegistryItem = editRegistryItem;
window.deleteRegistryItem = deleteRegistryItem;
window.saveAvatar = saveAvatar;
window.deleteAvatar = deleteAvatar;