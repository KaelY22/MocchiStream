import { showToast } from './utils.js';
import { loadLists } from './catalog.js';
import { initPlayer, playItem, closeFullPlayer } from './player.js';
import { fetchItem, nextEpisodeResolver } from './detail.js';
import { initPage } from './header.js';

document.addEventListener('DOMContentLoaded', () => {
  initPage();
  loadLists();
  initPlayer();
  const params = new URLSearchParams(location.search);
  const id = params.get('id');
  const type = params.get('type') || 'movie';
  const season = params.get('season');
  const episode = params.get('episode');
  if (!id) {
    showToast('Falta el título.', true);
    return;
  }
  fetchItem(id, type)
    .then(item => {
      const ep = (season && episode) ? { season: parseInt(season, 10), episode: parseInt(episode, 10) } : null;
      playItem(item, ep, nextEpisodeResolver(item));
    })
    .catch(() => showToast('No se pudo cargar el título.', true));
});

window.closeFullPlayer = closeFullPlayer;