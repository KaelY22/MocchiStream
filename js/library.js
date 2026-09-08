import { cardHtml, getFavs, getHistory, getWatchLater, setListChangeListener } from './catalog.js';
import { renderContinueRow } from './home.js';

let libTab = 'favs';

export function setupLibrary() {
  document.getElementById('libTabFavs').addEventListener('click', () => setLibTab('favs'));
  document.getElementById('libTabWL').addEventListener('click', () => setLibTab('wl'));
  document.getElementById('libTabHist').addEventListener('click', () => setLibTab('hist'));
  setListChangeListener(() => {
    if (!document.getElementById('view-library').classList.contains('hidden')) renderLibrary();
    renderContinueRow();
  });
}

function setLibTab(tab) {
  libTab = tab;
  document.querySelectorAll('.lib-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  renderLibrary();
}

export function renderLibrary() {
  const grid = document.getElementById('libGrid');
  const items = libTab === 'favs' ? getFavs() : libTab === 'wl' ? getWatchLater() : getHistory();
  if (!items.length) {
    const msgs = {
      favs: 'Aún no tienes favoritos. Toca el corazón en cualquier tarjeta.',
      wl: 'Aún no tienes nada en Ver después. Toca el marcador en un título.',
      hist: 'Aún no has reproducido nada.'
    };
    grid.innerHTML = `<p class="empty-msg" style="grid-column:1/-1;">${msgs[libTab]}</p>`;
    return;
  }
  const delHandler = libTab === 'favs' ? null : (libTab === 'wl' ? 'removeFromWatchLater' : 'removeFromHistory');
  grid.innerHTML = items.map(it => cardHtml(it, delHandler ? { deletable: delHandler } : {})).join('');
}
