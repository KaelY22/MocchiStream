import { showToast, resetStorageIfStale } from './utils.js';
import { loadLists } from './catalog.js';
import { setupLibrary, renderLibrary } from './library.js';
import { loadAvatar, setupAdminEsc, registerSW, openAdminModal, loginAdmin } from './header.js';

document.addEventListener('DOMContentLoaded', () => {
  if (resetStorageIfStale()) showToast('Datos locales renovados');
  loadLists();
  loadAvatar();
  setupAdminEsc();
  registerSW();
  setupLibrary();
  renderLibrary();
  document.addEventListener('click', e => {
    const card = e.target.closest('.video-card');
    if (card) location.href = `detalle.html?id=${encodeURIComponent(card.dataset.id)}&type=${encodeURIComponent(card.dataset.type)}`;
  });
});

window.openAdminModal = openAdminModal;
window.loginAdmin = loginAdmin;