import { cardHtml, getFavs, getHistory, getWatchLater, setListChangeListener } from './catalog.js';
import { renderContinueRow } from './home.js';

const MSGS = {
  favs: 'Aún no tienes favoritos. Toca el corazón en cualquier tarjeta.',
  wl: 'Aún no tienes nada en Ver después. Toca el marcador en un título.',
  hist: 'Aún no has reproducido nada.'
};

const GROUPS = [
  { key: 'anime', label: 'Anime', test: i => !!i.anime },
  { key: 'series', label: 'Series', test: i => !i.anime && i.type === 'tv' },
  { key: 'peliculas', label: 'Películas', test: i => !i.anime && i.type !== 'tv' },
];

export function setupLibrary(kind) {
  setListChangeListener(() => {
    renderLibrary(kind);
    renderContinueRow();
  });
}

export function renderLibrary(kind) {
  const grid = document.getElementById('libGrid');
  if (!grid) return;
  const items = kind === 'favs' ? getFavs() : kind === 'wl' ? getWatchLater() : getHistory();
  if (!items.length) {
    grid.innerHTML = `<p class="empty-msg">${MSGS[kind]}</p>`;
    return;
  }
  const delHandler = kind === 'favs' ? null : (kind === 'wl' ? 'removeFromWatchLater' : 'removeFromHistory');
  const sorted = [...items].sort((a, b) => (a.title || '').localeCompare(b.title || '', 'es'));
  const groups = GROUPS.map(g => ({ ...g, items: sorted.filter(g.test) })).filter(g => g.items.length);
  grid.innerHTML = groups.map(g => `
    <section class="lib-group">
      <h3 class="lib-group-title">${g.label}</h3>
      <div class="video-grid">${g.items.map(it => cardHtml(it, delHandler ? { deletable: delHandler } : {})).join('')}</div>
    </section>`).join('');
}