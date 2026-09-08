import { API_BASE, esc } from './utils.js';
import { cardHtml } from './catalog.js';

let currentCat = null;

export function loadCatsView() {
  if (currentCat) return;
  const tiles = document.getElementById('catTiles');
  if (tiles.dataset.loaded) return;
  tiles.dataset.loaded = '1';
  tiles.innerHTML = '<div class="skeleton cat-tile"></div><div class="skeleton cat-tile"></div><div class="skeleton cat-tile"></div>';
  fetch(`${API_BASE}/categories`)
    .then(res => res.json())
    .then(async cats => {
      const list = Array.isArray(cats) ? cats : [];
      if (!list.length) {
        tiles.innerHTML = '<p class="empty-msg" style="grid-column:1/-1;">No tienes selecciones todavía.<br>Agrega títulos desde el panel de admin (Catálogo → editar → categoría).</p>';
        return;
      }
      const withCounts = await Promise.all(list.map(async c => {
        try {
          const items = await fetch(`${API_BASE}/metadata/bycategory?cat=${encodeURIComponent(c)}`).then(r => r.json());
          return { name: c, items: Array.isArray(items) ? items : [] };
        } catch (e) { return { name: c, items: [] }; }
      }));
      tiles.innerHTML = withCounts.map((c, i) => {
        const hue = (i * 47 + 255) % 360;
        const cover = (c.items[0] && c.items[0].poster) ? c.items[0].poster : '';
        return `
          <button class="cat-tile" data-cat="${esc(c.name)}" style="background: linear-gradient(135deg, hsl(${hue}, 72%, 30%), hsl(${(hue + 80) % 360}, 72%, 20%));">
            ${cover ? `<img src="${esc(cover)}" alt="" loading="lazy" />` : ''}
            <span class="cat-tile-name">${esc(c.name)}</span>
            <span class="cat-tile-count">${c.items.length} ${c.items.length === 1 ? 'título' : 'títulos'}</span>
          </button>`;
      }).join('');
      tiles.querySelectorAll('.cat-tile').forEach(tile => {
        tile.addEventListener('click', () => openCat(tile.dataset.cat, withCounts.find(c => c.name === tile.dataset.cat)?.items || []));
      });
    })
    .catch(() => {
      tiles.dataset.loaded = '';
      tiles.innerHTML = '<p class="error">Error al cargar categorías</p>';
    });
}

function openCat(name, items) {
  currentCat = name;
  document.getElementById('selectionsTitle').classList.add('hidden');
  document.getElementById('selectionsHint').classList.add('hidden');
  document.getElementById('catTiles').classList.add('hidden');
  document.getElementById('catBackRow').classList.remove('hidden');
  document.getElementById('catHead').textContent = name;
  const grid = document.getElementById('catGrid');
  grid.classList.remove('hidden');
  if (!items.length) {
    grid.innerHTML = '<p class="empty-msg" style="grid-column:1/-1;">Esta selección está vacía.</p>';
    return;
  }
  grid.innerHTML = items.filter(it => it && it.title).map(cardHtml).join('');
}

export function backToCats() {
  currentCat = null;
  document.getElementById('selectionsTitle').classList.remove('hidden');
  document.getElementById('selectionsHint').classList.remove('hidden');
  document.getElementById('catTiles').classList.remove('hidden');
  document.getElementById('catBackRow').classList.add('hidden');
  document.getElementById('catGrid').classList.add('hidden');
  document.getElementById('catGrid').innerHTML = '';
}
