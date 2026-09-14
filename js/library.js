import { cardHtml, getFavs, getHistory, getWatchLater, setListChangeListener } from './catalog.js';
import { renderContinueRow } from './home.js';

const MSGS = {
  favs: 'Aún no tienes favoritos. Toca el corazón en cualquier tarjeta.',
  wl: 'Aún no tienes nada en Ver después. Toca el marcador en un título.',
  hist: 'Aún no has reproducido nada.'
};

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
    grid.innerHTML = `<p class="empty-msg" style="grid-column:1/-1;">${MSGS[kind]}</p>`;
    return;
  }
  const delHandler = kind === 'favs' ? null : (kind === 'wl' ? 'removeFromWatchLater' : 'removeFromHistory');
  grid.innerHTML = items.map(it => cardHtml(it, delHandler ? { deletable: delHandler } : {})).join('');
}