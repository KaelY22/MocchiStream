import { showToast } from './utils.js';

const THEME_KEY = 'ms_theme';
const SUN_SVG = '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>';
const MOON_SVG = '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>';
const HOME_SVG = '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/></svg>';
const FILM_SVG = '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 4v16m10-16v16M3 8h18M3 16h18M4 4h16a1 1 0 011 1v14a1 1 0 01-1 1H4a1 1 0 01-1-1V5a1 1 0 011-1z"/></svg>';
const TV_SVG = '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2 7h20v13H2zM17 3l-5 4-5-4"/></svg>';
const SPARKLES_SVG = '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3l1.9 5.8a2 2 0 001.3 1.3L21 12l-5.8 1.9a2 2 0 00-1.3 1.3L12 21l-1.9-5.8a2 2 0 00-1.3-1.3L3 12l5.8-1.9a2 2 0 001.3-1.3z"/></svg>';
const CLAPPER_SVG = '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3Z"/><path d="m6.2 5.3 3.1 3.9"/><path d="m12.4 3.4 3.1 4"/><path d="M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/></svg>';
const LIST_MUSIC_SVG = '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 15V6"/><path d="M18.5 18a2.5 2.5 0 1 0 1.5-4.5"/><path d="M12 12H3"/><path d="M16 6H3"/><path d="M12 18H3"/></svg>';
const HEART_SVG = '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>';
const BOOKMARK_SVG = '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/></svg>';
const HISTORY_SVG = '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></svg>';
const DOWNLOAD_SVG = '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v10m0 0 4-4m-4 4-4-4M4 19h16"/></svg>';

export function applyTheme() {
  const root = document.documentElement;
  const theme = localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';
  root.setAttribute('data-theme', theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'light' ? '#f6f5fb' : '#0f0f1a');
  const cs = document.querySelector('meta[name="color-scheme"]');
  if (cs) cs.setAttribute('content', theme);
  const btn = document.getElementById('themeBtn');
  if (btn) btn.innerHTML = theme === 'light' ? SUN_SVG : MOON_SVG;
  return theme;
}

export function setupTheme() {
  const btn = document.getElementById('themeBtn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    localStorage.setItem(THEME_KEY, next);
    applyTheme();
    showToast(next === 'light' ? 'Tema claro activado' : 'Tema oscuro activado');
  });
}

export function setupMenu() {
  let sidebar = document.getElementById('sidebar');
  let overlay = document.getElementById('sidebarOverlay');
  if (!sidebar) {
    sidebar = document.createElement('nav');
    sidebar.id = 'sidebar';
    sidebar.className = 'sidebar';
    document.body.appendChild(sidebar);
  }
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'sidebarOverlay';
    overlay.className = 'sidebar-overlay';
    document.body.appendChild(overlay);
  }
  const params = new URLSearchParams(location.search);
  const cat = params.get('cat');
  const path = location.pathname.replace(/\.html$/, '');
  const isPage = p => path === '/' || path.endsWith('/' + p);
  const isCat = p => isPage('categorias') && cat === p;
  const item = (href, label, icon, active) =>
    `<a class="sidebar-item${active ? ' active' : ''}" href="${href}">${icon}${label}</a>`;
  sidebar.innerHTML =
    `<div class="sidebar-group">
      <p class="sidebar-label">Categorías</p>
      ${item('/', 'Inicio', HOME_SVG, isPage('index'))}
      ${item('categorias.html?cat=peliculas', 'Películas', FILM_SVG, isCat('peliculas'))}
      ${item('categorias.html?cat=series', 'Series', TV_SVG, isCat('series'))}
      ${item('categorias.html?cat=anime', 'Anime', SPARKLES_SVG, isCat('anime'))}
      ${item('categorias.html?cat=kdrama', 'K-Dramas', CLAPPER_SVG, isCat('kdrama'))}
    </div>
    <div class="sidebar-group">
      <p class="sidebar-label">Biblioteca</p>
      ${item('playlist.html', 'Playlists', LIST_MUSIC_SVG, isPage('playlist'))}
      ${item('favoritos.html', 'Favoritos', HEART_SVG, isPage('favoritos'))}
      ${item('ver-despues.html', 'Ver después', BOOKMARK_SVG, isPage('ver-despues'))}
      ${item('historial.html', 'Historial', HISTORY_SVG, isPage('historial'))}
    </div>
    <div class="sidebar-foot">
      <button class="sidebar-item hidden" id="installBtn">${DOWNLOAD_SVG}Instalar app</button>
      <p>© 2026 · Hecho por Kael~</p>
    </div>`;
  const btn = document.getElementById('menuBtn');
  if (!btn) return;
  const close = () => {
    sidebar.classList.remove('open');
    overlay.classList.remove('open');
    document.body.style.overflow = '';
  };
  btn.addEventListener('click', () => {
    const opening = !sidebar.classList.contains('open');
    sidebar.classList.toggle('open');
    overlay.classList.toggle('open');
    document.body.style.overflow = opening ? 'hidden' : '';
  });
  overlay.addEventListener('click', close);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') close();
  });
  sidebar.querySelectorAll('a').forEach(a => a.addEventListener('click', close));
  const installBtn = document.getElementById('installBtn');
  if (installBtn) installBtn.addEventListener('click', close);
}

export function setupSearch() {
  const input = document.getElementById('searchInput');
  if (!input) return;
  input.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const q = input.value.trim();
    if (!q) return;
    location.href = `buscar.html?q=${encodeURIComponent(q)}`;
  });
}

export function setupInstall() {
  const btn = document.getElementById('installBtn');
  if (!btn) return;
  let deferredInstall = null;
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredInstall = e;
    btn.classList.remove('hidden');
  });
  btn.addEventListener('click', async () => {
    if (!deferredInstall) return;
    deferredInstall.prompt();
    await deferredInstall.userChoice;
    deferredInstall = null;
    btn.classList.add('hidden');
  });
  window.addEventListener('appinstalled', () => btn.classList.add('hidden'));
  if (window.matchMedia('(display-mode: standalone)').matches) btn.classList.add('hidden');
}

export function registerSW() {
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => {
        reg.addEventListener('updatefound', () => {
          const nw = reg.installing;
          if (!nw) return;
          nw.addEventListener('statechange', () => {
            if (nw.state === 'installed' && navigator.serviceWorker.controller) {
              showToast('Actualización disponible, aplicando...');
              nw.postMessage({ type: 'SKIP_WAITING' });
            }
          });
        });
      })
      .catch(() => {});
    navigator.serviceWorker.addEventListener('controllerchange', () => location.reload());
  }
}