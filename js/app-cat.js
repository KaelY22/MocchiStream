import { API_BASE } from './utils.js';
import { loadLists, cardHtml } from './catalog.js';
import { initPage } from './header.js';

const TITLES = { peliculas: 'Películas', series: 'Series', anime: 'Anime', kdrama: 'K-Dramas' };

let currentCat = '';
let page = 1;
let loading = false;
let done = false;

document.addEventListener('DOMContentLoaded', () => {
  initPage();
  loadLists();
  const cat = new URLSearchParams(location.search).get('cat');
  if (!TITLES[cat]) {
    document.getElementById('catHead').textContent = 'Categoría no encontrada';
    document.getElementById('catGrid').innerHTML = '<p class="empty-msg" style="grid-column:1/-1;">Esa categoría no existe.</p>';
    return;
  }
  currentCat = cat;
  document.getElementById('catHead').textContent = TITLES[cat];
  loadCat();
  document.addEventListener('click', e => {
    const card = e.target.closest('.video-card');
    if (card) location.href = `detalle.html?id=${encodeURIComponent(card.dataset.id)}&type=${encodeURIComponent(card.dataset.type)}`;
  });
});

function loadCat() {
  const grid = document.getElementById('catGrid');
  if (loading || done) return;
  loading = true;
  if (page === 1) grid.innerHTML = '<p class="hint" style="grid-column:1/-1;"><span class="spinner"></span>Cargando...</p>';
  fetch(`${API_BASE}/mainpage?section=${encodeURIComponent(currentCat)}&page=${page}`)
    .then(res => res.json())
    .then(items => {
      if (page === 1) grid.innerHTML = '';
      const fresh = (items || []).filter(it => it && it.title);
      if (!fresh.length) {
        done = true;
        if (!grid.children.length) grid.innerHTML = '<p class="empty-msg" style="grid-column:1/-1;">No hay contenido en esta categoría.</p>';
        return;
      }
      const existing = new Set([...grid.querySelectorAll('.video-card')].map(c => `${c.dataset.type}|${c.dataset.id}`));
      grid.insertAdjacentHTML('beforeend', fresh.filter(it => !existing.has(`${it.type}|${it.id}`)).map(cardHtml).join(''));
      page++;
    })
    .catch(() => {
      if (page === 1) grid.innerHTML = '<p class="empty-msg" style="grid-column:1/-1;">Error al cargar. Recarga la página.</p>';
    })
    .finally(() => { loading = false; });
}

window.addEventListener('scroll', () => {
  if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 600) loadCat();
}, { passive: true });