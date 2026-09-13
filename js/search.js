import { API_BASE } from './utils.js';
import { cardHtml, getItemType } from './catalog.js';

let searchQuery = '';
let typeFilter = '';
let searchLoading = false;

export function setupSearch() {
  const input = document.getElementById('searchInput');
  let timeout;
  input.addEventListener('input', () => {
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      searchQuery = input.value.trim();
      doSearch();
    }, 450);
  });
}

export function setupFilterChips() {
  const container = document.getElementById('searchChips');
  container.innerHTML =
    '<button class="chip active" data-type="">Todo</button>' +
    '<button class="chip" data-type="movie">Películas</button>' +
    '<button class="chip" data-type="series">Series</button>';
  container.querySelectorAll('[data-type]').forEach(chip => {
    chip.addEventListener('click', () => {
      typeFilter = chip.dataset.type;
      container.querySelectorAll('[data-type]').forEach(c => c.classList.toggle('active', c.dataset.type === typeFilter));
      doSearch();
    });
  });
}

function filterByType(items) {
  if (typeFilter === 'movie') return items.filter(it => getItemType(it.url) === 'Película');
  if (typeFilter === 'series') return items.filter(it => getItemType(it.url) === 'Serie' || getItemType(it.url) === 'Anime');
  return items;
}

function doSearch() {
  const grid = document.getElementById('searchGrid');
  const status = document.getElementById('searchStatus');
  const head = document.getElementById('searchHead');
  if (!searchQuery) {
    grid.innerHTML = '';
    head.textContent = 'Resultados';
    status.classList.add('hidden');
    searchLoading = false;
    return;
  }
  if (searchLoading) return;
  searchLoading = true;
  head.textContent = `Resultados de "${searchQuery}"`;
  grid.innerHTML = '<p class="hint"><span class="spinner"></span>Buscando...</p>';
  status.classList.add('hidden');
  fetch(`${API_BASE}/search?q=${encodeURIComponent(searchQuery)}`)
    .then(res => res.json())
    .then(items => {
      const all = (items || []).filter(it => it && it.title);
      const filtered = filterByType(all);
      grid.innerHTML = '';
      if (filtered.length) grid.insertAdjacentHTML('beforeend', filtered.map(cardHtml).join(''));
      if (!all.length) {
        status.textContent = 'No se encontraron resultados. Prueba con otro término.';
        status.classList.remove('hidden');
      }
    })
    .catch(() => {
      grid.innerHTML = '';
      status.textContent = 'Error al buscar. Intenta de nuevo.';
      status.classList.remove('hidden');
    })
    .finally(() => { searchLoading = false; });
}