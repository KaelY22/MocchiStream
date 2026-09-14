import { API_BASE, showToast, resetStorageIfStale } from './utils.js';
import { loadLists, cardHtml } from './catalog.js';
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
  const q = new URLSearchParams(location.search).get('q') || '';
  if (q) doSearch(q);
  document.addEventListener('click', e => {
    const card = e.target.closest('.video-card');
    if (card) location.href = `detalle.html?id=${encodeURIComponent(card.dataset.id)}&type=${encodeURIComponent(card.dataset.type)}`;
  });
});

function doSearch(q) {
  const grid = document.getElementById('searchGrid');
  const status = document.getElementById('searchStatus');
  const head = document.getElementById('searchHead');
  head.textContent = `Resultados de "${q}"`;
  grid.innerHTML = '<p class="hint" style="grid-column:1/-1;"><span class="spinner"></span>Buscando...</p>';
  status.classList.add('hidden');
  fetch(`${API_BASE}/search?q=${encodeURIComponent(q)}`)
    .then(res => res.json())
    .then(items => {
      const all = (items || []).filter(it => it && it.title);
      grid.innerHTML = '';
      if (all.length) grid.insertAdjacentHTML('beforeend', all.map(cardHtml).join(''));
      else {
        status.textContent = 'No se encontraron resultados. Prueba con otro término.';
        status.classList.remove('hidden');
      }
    })
    .catch(() => {
      grid.innerHTML = '';
      status.textContent = 'Error al buscar. Intenta de nuevo.';
      status.classList.remove('hidden');
    });
}