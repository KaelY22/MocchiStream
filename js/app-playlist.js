import { showToast, resetStorageIfStale } from './utils.js';
import { loadLists } from './catalog.js';
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
});