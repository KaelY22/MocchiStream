export function parseRoute() {
  const p = location.pathname;
  if (p === '/buscar') return { name: 'search' };
  if (p === '/guardados') return { name: 'library' };
  if (p === '/perfil') return { name: 'profile' };
  let m = p.match(/^\/titulo\/([^/]+)\/([^/]+)\/?$/);
  if (m) return { name: 'detail', id: decodeURIComponent(m[1]), type: decodeURIComponent(m[2]) };
  m = p.match(/^\/ver\/([^/]+)\/([^/]+)(?:\/(\d+)\/(\d+))?\/?$/);
  if (m) return { name: 'play', id: decodeURIComponent(m[1]), type: decodeURIComponent(m[2]), season: m[3] ? parseInt(m[3], 10) : null, episode: m[4] ? parseInt(m[4], 10) : null };
  return { name: 'explore' };
}

export function navigate(path) {
  if (location.pathname + location.search === path) return;
  history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}