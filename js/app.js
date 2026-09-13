import { API_BASE, showToast, resetStorageIfStale } from './utils.js';
import { loadLists, toggleFavFromCard, removeFromHistory, removeFromWatchLater } from './catalog.js';
import { loadHome, renderContinueRow } from './home.js';
import { setupSearch, setupFilterChips } from './search.js';
import { setupLibrary, renderLibrary } from './library.js';
import { openDetailFromId, initDetail, closeDetail } from './detail.js';
import { initPlayer, closeFullPlayer } from './player.js';

let deferredInstall = null;

document.addEventListener('DOMContentLoaded', () => {
  if (resetStorageIfStale()) showToast('Datos locales renovados');
  loadLists();
  loadAvatar();
  setupNav();
  setupSearch();
  setupFilterChips();
  setupLibrary();
  initDetail();
  initPlayer();
  loadHome();
  setupPtr();
  setupInstall();
  registerSW();
  const params = new URLSearchParams(location.search);
  const deepId = params.get('t');
  const deepType = params.get('type') || 'movie';
  if (deepId) setTimeout(() => openDetailFromId(deepId, deepType), 400);
  document.addEventListener('click', e => {
    const card = e.target.closest('.video-card');
    if (card) openDetailFromId(card.dataset.id, card.dataset.type);
  });
});

function showView(name) {
  document.querySelectorAll('.app-view').forEach(v => v.classList.add('hidden'));
  document.getElementById('view-' + name).classList.remove('hidden');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.view === name));
  if (name === 'explore') renderContinueRow();
  if (name === 'search') {
    const input = document.getElementById('searchInput');
    setTimeout(() => input.focus(), 120);
  }
  if (name === 'library') renderLibrary();
  if (name === 'profile') {
    const img = document.getElementById('profileAvatar');
    img.src = document.getElementById('avatarImg').src || img.src;
  }
  window.scrollTo(0, 0);
}

function setupNav() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => showView(item.dataset.view));
  });
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.classList.add('hidden'); });
  });
  document.getElementById('detailShareBtn').addEventListener('click', shareTitle);
}

async function loadAvatar() {
  try {
    const res = await fetch(`${API_BASE}/avatar`);
    const data = await res.json();
    const img = document.getElementById('avatarImg');
    if (data && data.avatar) {
      img.src = data.avatar;
      img.style.display = 'block';
    } else {
      img.src = 'icons/profile.png';
      img.style.display = 'block';
    }
  } catch (e) {
    const img = document.getElementById('avatarImg');
    img.src = 'icons/profile.png';
    img.style.display = 'block';
  }
}

function openAdminModal() {
  document.getElementById('adminLoginModal').classList.remove('hidden');
  document.getElementById('adminPasswordInput').focus();
}

function loginAdmin() {
  const password = document.getElementById('adminPasswordInput').value;
  if (password) {
    localStorage.setItem('admin_password', password);
    localStorage.setItem('admin_timestamp', Date.now().toString());
    window.location.href = '/admin.html';
  }
}

function shareTitle() {
  const btn = document.getElementById('detailShareBtn');
  const id = btn.dataset.id;
  const type = btn.dataset.type;
  const title = btn.dataset.title;
  if (!id) return;
  const link = `${location.origin}/?t=${encodeURIComponent(id)}&type=${encodeURIComponent(type || 'movie')}`;
  const text = `${title} — Míralo en MocchiStream`;
  if (navigator.share) {
    navigator.share({ title, text, url: link }).catch(() => {});
  } else if (navigator.clipboard) {
    navigator.clipboard.writeText(`${text} ${link}`).then(() => showToast('Enlace copiado')).catch(() => showToast('No se pudo copiar', true));
  } else {
    showToast('No se pudo compartir', true);
  }
}

function setupInstall() {
  const btn = document.getElementById('installBtn');
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredInstall = e;
    btn.classList.remove('hidden');
  });
  btn.addEventListener('click', async () => {
    if (!deferredInstall) return;
    deferredInstall.prompt();
    await deferredInstall.userChoice;
    deferredInstall = null;
    btn.classList.add('hidden');
  });
  window.addEventListener('appinstalled', () => btn.classList.add('hidden'));
  if (window.matchMedia('(display-mode: standalone)').matches) btn.classList.add('hidden');
}

function registerSW() {
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => {
        reg.addEventListener('updatefound', () => {
          const nw = reg.installing;
          if (!nw) return;
          nw.addEventListener('statechange', () => {
            if (nw.state === 'installed' && navigator.serviceWorker.controller) {
              showToast('Actualización disponible, aplicando...');
              nw.postMessage({ type: 'SKIP_WAITING' });
            }
          });
        });
      })
      .catch(() => {});
    navigator.serviceWorker.addEventListener('controllerchange', () => location.reload());
  }
}

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea') { e.target.blur(); return; }
  if (!document.getElementById('fullPlayer').classList.contains('hidden')) { closeFullPlayer(); return; }
  if (!document.getElementById('detailView').classList.contains('hidden')) { closeDetail(); return; }
  if (!document.getElementById('adminLoginModal').classList.contains('hidden')) {
    document.getElementById('adminLoginModal').classList.add('hidden');
  }
});

let ptrStart = 0;
let ptrDist = 0;
let ptrTracking = false;
let ptrRefresh = false;

function setupPtr() {
  const indicator = document.getElementById('ptrIndicator');
  const arrow = indicator.querySelector('.ptr-arrow');
  window.addEventListener('touchstart', e => {
    const explore = document.getElementById('view-explore');
    if (explore.classList.contains('hidden')) return;
    if (window.scrollY > 0) return;
    if (document.getElementById('detailView').classList.contains('hidden') === false) return;
    ptrStart = e.touches[0].clientY;
    ptrDist = 0;
    ptrTracking = true;
    ptrRefresh = false;
  }, { passive: true });
  window.addEventListener('touchmove', e => {
    if (!ptrTracking) return;
    ptrDist = e.touches[0].clientY - ptrStart;
    if (ptrDist > 0 && window.scrollY <= 0) {
      e.preventDefault();
      const d = Math.min(ptrDist, 90);
      indicator.classList.remove('hidden');
      arrow.style.transform = `rotate(${Math.min(d / 90 * 360, 360)}deg)`;
      indicator.style.opacity = Math.min(d / 60, 1);
      indicator.style.transform = `translateY(${d * 0.5}px)`;
      if (d >= 60) {
        ptrRefresh = true;
        arrow.textContent = '↻';
      } else {
        ptrRefresh = false;
        arrow.textContent = '↓';
      }
    }
  }, { passive: false });
  window.addEventListener('touchend', () => {
    if (!ptrTracking) return;
    ptrTracking = false;
    indicator.classList.add('hidden');
    indicator.style.opacity = 0;
    indicator.style.transform = 'translateY(0)';
    arrow.textContent = '↓';
    if (ptrRefresh) refreshHome();
  });
}

function refreshHome() {
  showToast('Actualizando...');
  const home = document.getElementById('homeSections');
  delete home.dataset.loaded;
  home.innerHTML = Array.from({ length: 4 }).map(() => `
    <div class="skeleton-section">
      ${Array.from({ length: 6 }).map(() => '<div class="skeleton skeleton-card"></div>').join('')}
    </div>
  `).join('');
  loadHome();
  loadAvatar();
}

window.toggleFavFromCard = toggleFavFromCard;
window.removeFromHistory = removeFromHistory;
window.removeFromWatchLater = removeFromWatchLater;
window.closeDetail = closeDetail;
window.closeFullPlayer = closeFullPlayer;
window.openAdminModal = openAdminModal;
window.loginAdmin = loginAdmin;