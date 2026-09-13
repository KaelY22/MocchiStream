import { API_BASE, showToast } from './utils.js';

let adminPassword = '';

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
  setupAdminTabs();
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
    showToast(`Caché purgada: ${res.deleted} claves eliminadas`);
    loadPanel();
  } catch (e) { showToast('Error al purgar caché', true); }
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
window.saveAvatar = saveAvatar;
window.deleteAvatar = deleteAvatar;