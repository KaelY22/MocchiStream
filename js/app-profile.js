import { showToast, resetStorageIfStale } from './utils.js';
import { loadLists } from './catalog.js';
import { loadAvatar, setupInstall, setupAdminEsc, registerSW, openAdminModal, loginAdmin } from './header.js';

document.addEventListener('DOMContentLoaded', () => {
  if (resetStorageIfStale()) showToast('Datos locales renovados');
  loadLists();
  loadAvatar();
  setupInstall();
  setupAdminEsc();
  registerSW();
  const img = document.getElementById('profileAvatar');
  img.src = document.getElementById('avatarImg').src || img.src;
});

window.openAdminModal = openAdminModal;
window.loginAdmin = loginAdmin;