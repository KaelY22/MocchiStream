import { showToast, resetStorageIfStale } from './utils.js';
import { loadLists } from './catalog.js';
import { setupLibrary, renderLibrary } from './library.js';
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
  const kind = document.getElementById('view-lib').dataset.kind;
  setupLibrary(kind);
  renderLibrary(kind);
  document.addEventListener('click', e => {
    const card = e.target.closest('.video-card');
    if (card) location.href = `detalle.html?id=${encodeURIComponent(card.dataset.id)}&type=${encodeURIComponent(card.dataset.type)}`;
  });
});