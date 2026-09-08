import { API_BASE, esc } from './utils.js';
import { cardHtml, getItemType } from './catalog.js';

let searchQuery = '';
let sourceFilter = '';
let typeFilter = '';
let searchPage = 1;
let searchLoading = false;
let searchHasMore = true;

export function setupSearch() {
  const input = document.getElementById('searchInput');
  let timeout;
  input.addEventListener('input', () => {
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      searchQuery = input.value.trim();
      doSearch(true);
    }, 450);
  });
  const trigger = document.createElement('div');
  trigger.id = 'searchTrigger';
  trigger.style.height = '1px';
  document.getElementById('searchGrid').parentNode.appendChild(trigger);
  new IntersectionObserver(entries => {
    if (entries[0].isIntersecting && !searchLoading && searchHasMore && searchQuery) {
      doSearch(false);
    }
  }, { rootMargin: '300px' }).observe(trigger);
}

export function setupFilterChips() {
  const container = document.getElementById('searchChips');
  const sources = ['', 'PelisplusHD', 'Cuevana', 'Cinecalidad'];
  const labels = ['Todas', 'PelisplusHD', 'Cuevana', 'Cinecalidad'];
  container.innerHTML = sources.map((s, i) =>
    `<button class="chip ${s === sourceFilter ? 'active' : ''}" data-src="${esc(s)}">${labels[i]}</button>`
  ).join('') +
  '<button class="chip" data-type="">Todo</button>' +
  '<button class="chip" data-type="movie">Películas</button>' +
  '<button class="chip" data-type="series">Series</button>';
  container.querySelectorAll('[data-src]').forEach(chip => {
    chip.addEventListener('click', () => {
      sourceFilter = chip.dataset.src;
      container.querySelectorAll('[data-src]').forEach(c => c.classList.toggle('active', c.dataset.src === sourceFilter));
      if (searchQuery) doSearch(true);
    });
  });
  container.querySelectorAll('[data-type]').forEach(chip => {
    chip.addEventListener('click', () => {
      typeFilter = chip.dataset.type;
      container.querySelectorAll('[data-type]').forEach(c => c.classList.toggle('active', c.dataset.type === typeFilter));
      doSearch(true);
    });
  });
}

function filterByType(items) {
  if (typeFilter === 'movie') return items.filter(it => getItemType(it.url) === 'Película');
  if (typeFilter === 'series') return items.filter(it => getItemType(it.url) === 'Serie' || getItemType(it.url) === 'Anime');
  return items;
}

function groupSearchResults(items) {
  const order = ['PelisplusHD', 'Cuevana', 'Cinecalidad'];
  const groups = {};
  for (const it of items) {
    const s = it.source || 'Otros';
    (groups[s] = groups[s] || []).push(it);
  }
  return order.filter(s => groups[s]).map(s => ({ source: s, items: groups[s] }));
}

function renderSearchGroups(groups, grid, append) {
  for (const g of groups) {
    let groupEl = grid.querySelector(`.search-group[data-source="${g.source}"]`);
    if (!groupEl) {
      groupEl = document.createElement('div');
      groupEl.className = 'search-group';
      groupEl.dataset.source = g.source;
      groupEl.innerHTML = `
        <div class="search-group-head">
          <span class="group-src-badge sb-${esc((g.source || '').toLowerCase())}">${esc(g.source)}</span>
          <span class="group-count">${g.items.length}</span>
        </div>
        <div class="video-grid"></div>`;
      grid.appendChild(groupEl);
    }
    const gridEl = groupEl.querySelector('.video-grid');
    if (append) gridEl.insertAdjacentHTML('beforeend', g.items.map(cardHtml).join(''));
    else gridEl.innerHTML = g.items.map(cardHtml).join('');
  }
}

function doSearch(reset) {
  const grid = document.getElementById('searchGrid');
  const status = document.getElementById('searchStatus');
  const head = document.getElementById('searchHead');
  if (reset) {
    searchPage = 1;
    searchHasMore = true;
    grid.innerHTML = '<p class="hint"><span class="spinner"></span>Buscando...</p>';
    status.classList.add('hidden');
  }
  if (!searchQuery) {
    grid.innerHTML = '';
    head.textContent = 'Resultados';
    status.classList.add('hidden');
    searchLoading = false;
    searchHasMore = false;
    return;
  }
  if (searchLoading) return;
  searchLoading = true;
  head.textContent = `Resultados de "${searchQuery}"`;
  let url = `${API_BASE}/search?q=${encodeURIComponent(searchQuery)}&page=${searchPage}`;
  if (sourceFilter) url += `&source=${encodeURIComponent(sourceFilter)}`;
  fetch(url)
    .then(res => res.json())
    .then(items => {
      const all = (items || []).filter(it => it && it.title);
      const filtered = filterByType(all);
      const groups = groupSearchResults(filtered);
      if (reset) {
        grid.innerHTML = '';
        renderSearchGroups(groups, grid, false);
        const hasPhd = groups.some(g => g.source === 'PelisplusHD');
        const hasOthers = groups.some(g => g.source !== 'PelisplusHD');
        if (!hasPhd && hasOthers && !sourceFilter) {
          grid.insertAdjacentHTML('afterbegin',
            '<p class="hint fallback-note">PelisplusHD no tiene resultados para esto — mostrando alternativas de Cuevana y Cinecalidad.</p>');
        }
      } else {
        renderSearchGroups(groups, grid, true);
      }
      searchHasMore = false;
      if (!all.length) {
        status.textContent = 'No se encontraron resultados. Prueba con otro término.';
        status.classList.remove('hidden');
      }
    })
    .catch(() => {
      if (reset) {
        grid.innerHTML = '';
        status.textContent = 'Error al buscar. Intenta de nuevo.';
        status.classList.remove('hidden');
      }
    })
    .finally(() => { searchLoading = false; });
}
