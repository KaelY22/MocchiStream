import { API_BASE, showToast } from './utils.js';

export function loadAvatar() {
  const img = document.getElementById('avatarImg');
  const fallback = () => { img.src = 'icons/profile.png'; img.style.display = 'block'; };
  fetch(`${API_BASE}/avatar`)
    .then(res => res.json())
    .then(data => {
      if (data && data.avatar) { img.src = data.avatar; img.style.display = 'block'; }
      else fallback();
    })
    .catch(fallback);
}

export function openAdminModal() {
  const modal = document.getElementById('adminLoginModal');
  if (!modal) return;
  modal.classList.remove('hidden');
  const input = document.getElementById('adminPasswordInput');
  if (input) input.focus();
}

export function loginAdmin() {
  const password = document.getElementById('adminPasswordInput').value;
  if (password) {
    localStorage.setItem('admin_password', password);
    localStorage.setItem('admin_timestamp', Date.now().toString());
    window.location.href = '/admin.html';
  }
}

export function setupInstall() {
  const btn = document.getElementById('installBtn');
  if (!btn) return;
  let deferredInstall = null;
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

export function setupAdminEsc() {
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const modal = document.getElementById('adminLoginModal');
    if (modal && !modal.classList.contains('hidden')) modal.classList.add('hidden');
  });
}

export function registerSW() {
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