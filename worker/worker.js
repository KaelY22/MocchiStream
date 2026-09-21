// worker.js - MocchiStream V5 (Catálogo TMDB + reproducción on-demand)

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const CACHE_HOST = 'https://mocchi-cache.internal';
const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMG = 'https://image.tmdb.org/t/p';
const NETFLIX_PROVIDER = '8';
const NETFLIX_NETWORK = '213';
const WATCH_REGION = 'MX';
const MIN_VOTES = 50;
const STREAM_TIMEOUT = 12000;

const GENRE_SECTIONS = [
  ['accion', 'Acción', 28], ['drama', 'Drama', 18], ['comedia', 'Comedia', 35],
  ['thriller', 'Thriller', 53], ['misterio', 'Misterio', 9648], ['scifi', 'Ciencia ficción', 878],
  ['fantasia', 'Fantasía', 14], ['horror', 'Horror', 27], ['documental', 'Documentales', 99],
  ['animacion', 'Animación', 16], ['aventura', 'Aventura', 12], ['romance', 'Romance', 10749],
];

const HOME_SECTIONS = [
  ['top10global', 'Top 10 Mejores'],
  ['popular', 'Netflix Popular'], ['top', 'Mejor Calificadas'],
  ['nuevos', 'Estrenos'], ['originales', 'Netflix Originales'],
  ['kdrama', 'K-Drama'], ['anime', 'Anime'],
];

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    const key = env.TMDB_KEY;

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Password, Authorization'
    };

    if (method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

    if (path === '/api/mainpage' && method === 'GET') {
      return handleMainPage(url, env, corsHeaders, key);
    }
    if (path === '/api/sections' && method === 'GET') {
      return jsonResponse([
        ...HOME_SECTIONS.map(([s, t]) => ({ slug: s, title: t })),
        ...GENRE_SECTIONS.map(([s, t]) => ({ slug: 'genero-' + s, title: t })),
      ], corsHeaders);
    }
    if (path === '/api/search' && method === 'GET') {
      const q = url.searchParams.get('q');
      if (!q) return jsonResponse({ error: 'Missing query' }, corsHeaders, 400);
      return handleSearch(q, env, corsHeaders, key);
    }
    if (path === '/api/details' && method === 'GET') {
      const id = url.searchParams.get('id');
      const type = url.searchParams.get('type') === 'tv' ? 'tv' : 'movie';
      if (!id) return jsonResponse({ error: 'Missing id' }, corsHeaders, 400);
      return handleDetails(id, type, env, corsHeaders, key);
    }
    if (path === '/api/play' && method === 'GET') {
      return handlePlay(url, env, corsHeaders, key);
    }
    if (path === '/api/tg-download' && method === 'GET') {
      const tgUrl = url.searchParams.get('url');
      if (!tgUrl || !/^https?:\/\/t\.me\//i.test(tgUrl)) return jsonResponse({ error: 'URL inválida' }, corsHeaders, 400);
      const cdn = await resolveTelegram(tgUrl, env);
      if (!cdn) return jsonResponse({ ok: false }, corsHeaders);
      return jsonResponse({ ok: true, url: cdn }, corsHeaders);
    }
    if (path === '/api/stream' && method === 'GET') {
      const targetUrl = url.searchParams.get('url');
      if (!targetUrl) return jsonResponse({ error: 'Missing url' }, corsHeaders, 400);
      return handleStreamResolve(targetUrl, corsHeaders, env);
    }
    if (path === '/api/proxy' && method === 'GET') {
      const targetUrl = url.searchParams.get('url');
      if (!targetUrl) return jsonResponse({ error: 'Missing url' }, corsHeaders, 400);
      return handleProxy(targetUrl, url, request, corsHeaders);
    }
    if (path === '/api/playlists' && method === 'GET') {
      return handlePublicPlaylists(env, corsHeaders);
    }
    if (path.startsWith('/api/playlists/') && method === 'GET') {
      const id = path.split('/')[3];
      if (!/^\d+$/.test(id || '')) return jsonResponse({ error: 'Invalid id' }, corsHeaders, 400);
      return handlePublicPlaylist(id, env, corsHeaders);
    }

    if (path === '/api/auth/register' && method === 'POST') {
      return handleRegister(request, env, corsHeaders);
    }
    if (path === '/api/auth/login' && method === 'POST') {
      return handleLogin(request, env, corsHeaders);
    }
    if (path === '/api/auth/logout' && method === 'POST') {
      return handleLogout(request, env, corsHeaders);
    }
    if (path === '/api/auth/me' && method === 'GET') {
      return handleMe(request, env, corsHeaders);
    }

    if (path === '/api/sync/all' && method === 'GET') {
      return handleSyncAll(request, env, corsHeaders);
    }
    if (path === '/api/sync/favorites' && (method === 'POST' || method === 'DELETE')) {
      return method === 'POST' ? handleSyncAdd(request, env, corsHeaders, 'favorites') : handleSyncRemove(request, env, corsHeaders, 'favorites');
    }
    if (path === '/api/sync/history' && (method === 'POST' || method === 'DELETE')) {
      return method === 'POST' ? handleSyncAdd(request, env, corsHeaders, 'history') : handleSyncRemove(request, env, corsHeaders, 'history');
    }
    if (path === '/api/sync/watch-later' && (method === 'POST' || method === 'DELETE')) {
      return method === 'POST' ? handleSyncAdd(request, env, corsHeaders, 'watch_later') : handleSyncRemove(request, env, corsHeaders, 'watch_later');
    }

    if (path.startsWith('/api/admin')) {
      const password = request.headers.get('X-Admin-Password');
      let authorized = password === env.ADMIN_PASSWORD;
      if (!authorized && path === '/api/admin/download-links' && method === 'PUT' && env.TG_BOT_SECRET) {
        authorized = request.headers.get('X-Bot-Secret') === env.TG_BOT_SECRET;
      }
      if (!authorized) {
        const sessionUser = await getSessionUser(request, env);
        authorized = !!(sessionUser && sessionUser.is_admin === 1);
      }
      if (!authorized) {
        const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
        if (adminRateLimited(ip)) {
          return jsonResponse({ error: 'Demasiados intentos. Espera 15 minutos.' }, corsHeaders, 429);
        }
        return jsonResponse({ error: 'Unauthorized' }, corsHeaders, 401);
      }
      if (path === '/api/admin/stats' && method === 'GET') {
        return handleAdminStats(env, corsHeaders);
      }
      if (path === '/api/admin/cache/purge' && method === 'POST') {
        return handleCachePurge(request, env, corsHeaders);
      }
      if (path === '/api/admin/avatar') {
        if (method === 'GET') return handleGetAvatar(env, corsHeaders);
        if (method === 'POST') return handleUpdateAvatar(request, env, corsHeaders);
        if (method === 'DELETE') return handleDeleteAvatar(env, corsHeaders);
      }
      if (path === '/api/admin/playlists' && method === 'POST') {
        return handleCreatePlaylist(request, env, corsHeaders);
      }
      if (/^\/api\/admin\/playlists\/\d+$/.test(path) && method === 'PATCH') {
        return handleRenamePlaylist(path.split('/')[4], request, env, corsHeaders);
      }
      if (/^\/api\/admin\/playlists\/\d+$/.test(path) && method === 'DELETE') {
        return handleDeletePlaylist(path.split('/')[4], env, corsHeaders);
      }
      if (/^\/api\/admin\/playlists\/\d+\/items$/.test(path) && method === 'POST') {
        return handleAddPlaylistItem(path.split('/')[4], request, env, corsHeaders);
      }
      if (/^\/api\/admin\/playlists\/\d+\/items\/\d+$/.test(path) && method === 'DELETE') {
        const parts = path.split('/');
        return handleRemovePlaylistItem(parts[4], parts[6], env, corsHeaders);
      }
      if (path === '/api/admin/download-links' && method === 'PUT') {
        return handleUpsertDownloadLink(request, env, corsHeaders);
      }
    }

    return jsonResponse({ error: 'Not Found' }, corsHeaders, 404);
  },

  async scheduled(event, env, ctx) {
    const key = env.TMDB_KEY;
    const sectionSlugs = HOME_SECTIONS.slice(0, 3);

    for (const [slug, title] of sectionSlugs) {
      try {
        const items = await homeSection(slug, 1, env, key);
        await cachePut('home/v10/' + encodeURIComponent(slug) + '/1', items, 86400, {}, env);
      } catch (e) {}
    }

    try {
      await env.DB.prepare("DELETE FROM sessions WHERE expires_at IS NOT NULL AND expires_at < datetime('now')").run();
      await env.DB.prepare('DELETE FROM rate_limits WHERE window_start < ?').bind(Math.floor(Date.now() / 1000) - 86400).run();
    } catch (e) {}
  }
};

// ==================== UTILIDADES ====================
function jsonResponse(data, corsHeaders, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders }
  });
}

const PRIVATE_HOST_RE = /(?:^|\.)(?:local|internal|localhost|lan)$|^(?:10\.|127\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|100\.(?:6[4-9]|[7-9]\d)\.|0\.)|:|^\d+$/i;

const STREAM_ALLOWED_HOSTS = [
  'vimeos.net', 'vimeos.zip', 'goodstream.one', 'hlswish.com', 'uqload.*', 'fastream.to',
  'doodstream.com', 'dooood.com', 'doods.pro', 'dood.la', 'd0000d.com', 'd000d.com',
  'ds2play.com', 'ds2video.com', 'myvidplay.com', 'playmogo.com', 'dood.video',
  'byse.com', 'byse.sx', 'streamtape.com', 'streamtape.net', 'streamtape.xyz',
  'watchadsontape.com', 'shavetape.cash', 'vide0.net', 'filelions.live', 'filelions.online',
  'filelions.to', 'embed69.org', 'xupalace.org', 'hglink.to', 'premilkyway.com',
  'savefiles.com', 'mwish.pro', 'dwish.pro', 'embedwish.com', 'wishembed.pro',
  'kswplayer.info', 'wishfast.top', 'streamwish.site', 'sfastwish.com', 'strwish.xyz',
  'obeywish.com', 'asnwish.com', 'voe.sx', 'videoapp.zip', 'vidhidepro.com', 'vidhide.*', 'morencius.com', 'minochinos.com',
  'acek-cdn.com', 'dramiyos-cdn.com', 'cloudatacdn.com', 'pelispedia.is', 'pelispedia.mov',
  'seriesmetro.net', 'monoschinos.st',
  'latanime.org', 'ok.ru', 'mp4upload.com', 'filemoon.sx', 'filemoon.top', 'filemoon.xyz',
  'filemoon.fun', 'mixdrop.*', 'miixdrop.top', 'mxdrop.to', 'mxdrop.top', 'mdy48tn97.com',
  'luluvid.com', 'luluvdo.com', 'dsvplay.com', 'n1mwq.org', 'hqq.tv', 'hqq.to', 'yourupload.com',
  'vidcache.net', 'pdrain.*', 'pelisplushd.bz', 't.me', 'telesco.pe', 'telegram.org',
];

const SITE_ALLOWED_HOSTS = [
  'pelispedia.is', 'pelispedia.mov',
  'pelispedia.ink', 'seriesmetro.net', 'monoschinos.st', 'latanime.org', 'pelisplushd.bz',
];

function hostAllowed(host, suffixes) {
  return suffixes.some(s => {
    if (s.includes('*')) {
      const re = new RegExp('^(?:[a-z0-9-]+\\.)*' + s.replace(/\./g, '\\.').replace(/\*/g, '[a-z0-9-]+') + '$');
      return re.test(host);
    }
    return host === s || host.endsWith('.' + s);
  });
}

function assertSafeUrl(rawUrl, allowedSuffixes) {
  let u;
  try { u = new URL(rawUrl); } catch (e) { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  const host = u.hostname.toLowerCase();
  if (PRIVATE_HOST_RE.test(host)) return null;
  if (allowedSuffixes && !hostAllowed(host, allowedSuffixes)) return null;
  return u;
}

async function mapLimit(arr, limit, fn) {
  const out = new Array(arr.length);
  let idx = 0;
  const workers = Array.from({ length: Math.min(limit, arr.length) }, async () => {
    while (true) {
      const i = idx++;
      if (i >= arr.length) return;
      out[i] = await fn(arr[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

function firstSuccess(promises) {
  return new Promise(resolve => {
    let done = false;
    let pending = promises.length;
    if (!pending) return resolve(null);
    for (const p of promises) {
      p.then(r => {
        if (done) return;
        if (r) { done = true; resolve(r); }
        else if (--pending === 0) resolve(null);
      }).catch(() => {
        if (done) return;
        if (--pending === 0) resolve(null);
      });
    }
  });
}

const adminAttempts = new Map();
function adminRateLimited(ip) {
  if (adminAttempts.size > 1000) {
    const now = Date.now();
    for (const [k, v] of adminAttempts) if (now > v.reset) adminAttempts.delete(k);
  }
  const now = Date.now();
  let record = adminAttempts.get(ip);
  if (!record || now > record.reset) {
    record = { count: 0, reset: now + 15 * 60 * 1000 };
    adminAttempts.set(ip, record);
  }
  record.count++;
  return record.count > 10;
}

async function fetchSafe(url, opts = {}) {
  const { allowed = null, timeout = 10000, headers = {}, redirects = 3 } = opts;
  let current = url;
  for (let i = 0; i <= redirects; i++) {
    if (allowed && !assertSafeUrl(current, allowed)) throw new Error('URL no permitida');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const res = await fetch(current, { headers, signal: controller.signal, redirect: 'manual' });
      clearTimeout(timer);
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location');
        if (!loc) return res;
        current = new URL(loc, current).href;
        continue;
      }
      return res;
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  }
  throw new Error('Demasiados redirects');
}

async function fetchHTML(url, timeout = 8000, allowed = null) {
  const headers = {
    'User-Agent': USER_AGENT,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
  };
  const firstHost = new URL(url).hostname;
  const res = await fetchSafe(url, { allowed: allowed || [firstHost], timeout, headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

async function cacheGet(key) {
  return caches.default.match(new Request(CACHE_HOST + '/' + key));
}

async function cachePut(key, data, ttl, corsHeaders, env) {
  const res = new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': `s-maxage=${ttl}`, ...corsHeaders }
  });
  await caches.default.put(new Request(CACHE_HOST + '/' + key), res.clone());
  if (env && env.DB) {
    await env.DB.prepare('INSERT OR REPLACE INTO cache_keys (key, updated_at) VALUES (?, CURRENT_TIMESTAMP)').bind(key).run().catch(() => {});
  }
  return res;
}

async function cacheDelete(key, env) {
  let deleted = false;
  try {
    deleted = await caches.default.delete(new Request(CACHE_HOST + '/' + key));
  } catch (e) {}
  if (env && env.DB) {
    await env.DB.prepare('DELETE FROM cache_keys WHERE key = ?').bind(key).run().catch(() => {});
  }
  return deleted;
}

function normTitle(t) {
  return String(t || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[:;,.!?()\-_]/g, ' ')
    .replace(/\s*\((?:19|20)\d{2}\)\s*/g, ' ')
    .replace(/\b(?:19|20)\d{2}\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeEntities(str) {
  return String(str)
    .replace(/&#0*38;|&amp;/g, '&')
    .replace(/&#0*39;|&apos;|&#x27;/g, "'")
    .replace(/&#0*34;|&quot;/g, '"')
    .replace(/&#0*8217;/g, "'")
    .replace(/&#0*8211;/g, '-')
    .replace(/&#0*8212;/g, '-')
    .replace(/&#0*8230;/g, '...')
    .replace(/&#0*160;|&nbsp;/g, ' ');
}

// ==================== TMDB ====================
async function tmdbGet(path, params, env, key, ttl = 86400) {
  const qs = new URLSearchParams({ api_key: key, language: 'es-MX', ...params }).toString();
  const cacheKey = 'tmdb/' + path.replace(/^\//, '') + '?' + qs;
  const hit = await cacheGet(cacheKey);
  if (hit) return hit.json();
  const res = await fetch(`${TMDB_BASE}${path}?${qs}`);
  if (!res.ok) throw new Error(`TMDB ${res.status}`);
  const data = await res.json();
  return cachePut(cacheKey, data, ttl, {}, env).then(r => data);
}

function imgUrl(p, size) {
  return p ? `${TMDB_IMG}/${size}${p}` : null;
}

function toItem(r, netflix = true) {
  const isTv = r.media_type === 'tv' || r.name != null || r.first_air_date != null;
  const title = r.title || r.name || r.original_title || r.original_name || '';
  if (!title || !r.id) return null;
  const genres = r.genre_ids || [];
  return {
    id: r.id,
    type: isTv ? 'tv' : 'movie',
    title,
    year: parseInt((r.release_date || r.first_air_date || '').slice(0, 4)) || null,
    release_date: r.release_date || r.first_air_date || null,
    anime: r.original_language === 'ja' && genres.includes(16),
    poster: imgUrl(r.poster_path, 'w342'),
    backdrop: imgUrl(r.backdrop_path, 'w780'),
    score: r.vote_average ? Math.round(r.vote_average * 10) / 10 : null,
    vote_count: r.vote_count || 0,
    popularity: r.popularity || 0,
    netflix,
  };
}

async function discover(path, page, params, env, key) {
  const data = await tmdbGet(`/discover/${path}`, {
    page: String(page),
    sort_by: 'popularity.desc',
    with_watch_providers: NETFLIX_PROVIDER,
    watch_region: WATCH_REGION,
    vote_count: { movie: String(MIN_VOTES), tv: '20' }[path],
    ...params,
  }, env, key);
  return (data.results || []).map(r => toItem(r, true)).filter(Boolean);
}

async function fetchTop10(env, key) {
  const [m, t] = await Promise.all([
    tmdbGet('/trending/movie/week', {}, env, key, 86400),
    tmdbGet('/trending/tv/week', {}, env, key, 86400),
  ]);
  return [...(m.results || []), ...(t.results || [])]
    .slice(0, 10)
    .map(r => toItem(r, true))
    .filter(Boolean);
}

async function homeSection(slug, page, env, key) {
  const now = new Date().getFullYear();
  switch (slug) {
    case 'top10global':
      return fetchTop10(env, key);
    case 'popular':
      return Promise.all([
        discover('movie', page, {}, env, key),
        discover('tv', page, {}, env, key),
      ]).then(([m, t]) => m.concat(t));
    case 'top':
      return Promise.all([
        discover('movie', page, { sort_by: 'vote_average.desc', vote_count: '200' }, env, key),
        discover('tv', page, { sort_by: 'vote_average.desc', vote_count: '100' }, env, key),
      ]).then(([m, t]) => m.concat(t));
    case 'nuevos':
      return Promise.all([
        discover('movie', page, { sort_by: 'primary_release_date.desc', 'primary_release_date.gte': `${now}-01-01` }, env, key),
        discover('tv', page, { sort_by: 'first_air_date.desc', 'first_air_date.gte': `${now}-01-01` }, env, key),
      ]).then(([m, t]) => m.concat(t));
    case 'originales':
      return discover('tv', page, { with_networks: NETFLIX_NETWORK }, env, key);
    case 'kdrama':
      return discover('tv', page, { with_original_language: 'ko' }, env, key);
    case 'anime':
      return discover('tv', page, { with_genres: '16', with_original_language: 'ja' }, env, key);
    case 'peliculas':
      return discover('movie', page, {}, env, key);
    case 'series':
      return discover('tv', page, {}, env, key);
    default: {
      const g = GENRE_SECTIONS.find(([s]) => s === slug.replace('genero-', ''));
      if (!g) return [];
      return Promise.all([
        discover('movie', page, { with_genres: String(g[2]) }, env, key),
        discover('tv', page, { with_genres: String(g[2]) }, env, key),
      ]).then(([m, t]) => m.concat(t));
    }
  }
}

async function handleMainPage(url, env, corsHeaders, key) {
  const section = url.searchParams.get('section') || '';
  const page = Math.max(1, parseInt(url.searchParams.get('page')) || 1);

  if (section) {
    const cacheKey = 'home/v10/' + encodeURIComponent(section) + '/' + page;
    const hit = await cacheGet(cacheKey);
    if (hit) return hit;
    try {
      const items = await homeSection(section, page, env, key);
      return cachePut(cacheKey, items, 86400, corsHeaders, env);
    } catch (e) {
      return jsonResponse([], corsHeaders);
    }
  }
  return jsonResponse({ error: 'Missing section' }, corsHeaders, 400);
}

async function handleSearch(query, env, corsHeaders, key) {
  const cacheKey = 'search/v9/' + encodeURIComponent(query.trim().toLowerCase());
  const hit = await cacheGet(cacheKey);
  if (hit) return hit;
  try {
    const results = await Promise.all([1, 2].flatMap(p => [
      tmdbGet('/search/movie', { query, page: p }, env, key, 3600),
      tmdbGet('/search/tv', { query, page: p }, env, key, 3600),
    ]));
    const seen = new Set();
    const items = [];
    for (const r of results.flatMap(x => x.results || [])) {
      const it = toItem(r, false);
      if (!it || !it.poster || it.vote_count < 5) continue;
      const k = it.type + '|' + it.id;
      if (seen.has(k)) continue;
      seen.add(k);
      items.push(it);
    }
    items.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
    return cachePut(cacheKey, items, 3600, corsHeaders, env);
  } catch (e) {
    return jsonResponse([], corsHeaders);
  }
}

async function handleDetails(id, type, env, corsHeaders, key) {
  const cacheKey = 'details/v2/' + type + '/' + encodeURIComponent(id);
  const hit = await cacheGet(cacheKey);
  if (hit) return hit;
  try {
    const d = await tmdbGet(`/${type}/${id}`, { append_to_response: 'external_ids' }, env, key, 604800);
    const item = {
      id: d.id,
      type,
      title: d.title || d.name || '',
      year: parseInt((d.release_date || d.first_air_date || '').slice(0, 4)) || null,
      overview: d.overview || '',
      poster: imgUrl(d.poster_path, 'w500'),
      backdrop: imgUrl(d.backdrop_path, 'w780'),
      score: d.vote_average ? Math.round(d.vote_average * 10) / 10 : null,
      genres: (d.genres || []).map(g => g.name),
      runtime: d.runtime || null,
      netflix: true,
      imdb: d.external_ids && d.external_ids.imdb_id || null,
      anime: d.original_language === 'ja' && (d.genres || []).some(g => g.id === 16),
    };
    if (type === 'tv') {
      const seasonsCount = d.number_of_seasons || 0;
      const eps = [];
      await mapLimit(Array.from({ length: seasonsCount }, (_, i) => i + 1), 4, async s => {
        try {
          const sd = await tmdbGet(`/tv/${id}/season/${s}`, {}, env, key, 604800);
          for (const e of sd.episodes || []) {
            eps.push({
              name: e.name || `Capítulo ${e.episode_number}`,
              season: s,
              episode: e.episode_number,
              still: imgUrl(e.still_path, 'w300'),
            });
          }
        } catch (e) {}
      });
      item.episodes = eps.sort((a, b) => a.season - b.season || a.episode - b.episode);
    }
    const [downloads, inPlaylist] = await Promise.all([
      env.DB.prepare('SELECT season, episode, url FROM download_links WHERE item_id = ? AND type = ? ORDER BY season, episode').bind(String(id), type).all(),
      env.DB.prepare('SELECT 1 FROM playlist_items WHERE item_id = ? AND type = ? LIMIT 1').bind(String(id), type).first(),
    ]);
    item.downloads = downloads.results;
    item.in_playlist = !!inPlaylist;
    return cachePut(cacheKey, item, 604800, corsHeaders, env);
  } catch (e) {
    return jsonResponse({ error: 'Error interno' }, corsHeaders, 500);
  }
}

// ==================== REPRODUCCIÓN ON-DEMAND ====================
const FAST_PRIORITY = [
  /vimeos\.(?:net|zip)/i,
  /byse\w*\.(?:com|sx)/i,
  /streamtape\.(?:com|net|xyz)|watchadsontape\.com|shavetape\.cash/i,
  /streamwish\.site|sfastwish\.com|strwish\w*\.\w+|streamwish\.to|embedwish\.com|wishembed\.pro|hglink\.to|savefiles\.com|mwish\.pro|dwish\.pro|kswplayer\.info|wishfast\.top|obeywish\.com|asnwish\.com|hlswish\.com/i,
  /filemoon\.(?:sx|top|xyz|fun)/i,
  /vidhide\w*\.\w+|morencius\.com/i,
  /mixdrop\w*\.\w+|miixdrop\.top|mxdrop\.(?:to|top)|mdy48tn97\.com/i,
  /luluvid\.com|luluvdo\.com|dsvplay\.com/i,
  /hqq\.(?:tv|to)/i,
  /mp4upload\.com/i,
  /yourupload\.com/i,
  /goodstream\.one/i,
  /doodstream\.com|dooood\.com|doods\.pro|dood\.la|d0000d\.com|d000d\.com|playmogo\.com/i,
  /voe\.sx/i,
  /uqload\.[a-z]+/i,
  /fastream\.to/i,
];

function fastRank(u) {
  for (let i = 0; i < FAST_PRIORITY.length; i++) {
    if (FAST_PRIORITY[i].test(u)) return i;
  }
  return -1;
}

function sortEmbeds(embeds) {
  return embeds.slice().sort((a, b) => {
    const ra = fastRank(a), rb = fastRank(b);
    if (ra === -1 && rb === -1) return 0;
    if (ra === -1) return 1;
    if (rb === -1) return -1;
    return ra - rb;
  });
}

function extractPelispediaItems(html) {
  const items = [];
  const re = /<article[^>]*class="post dfx fcl[^"]*"[^>]*>([\s\S]*?)<\/article>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const block = m[1];
    const link = block.match(/<a[^>]*href="([^"]*)"[^>]*class="[^"]*lnk-blk[^"]*"/i);
    if (!link) continue;
    const titleMatch = block.match(/<h2[^>]*class="entry-title"[^>]*>([\s\S]*?)<\/h2>/i);
    if (!titleMatch) continue;
    const title = decodeEntities(titleMatch[1].replace(/<[^>]*>/g, '')).trim();
    if (!title) continue;
    const yearMatch = block.match(/<span class="year">(\d{4})<\/span>/);
    const type = /\/anime\//.test(link[1]) ? 'tv' : /\/pelicula\//.test(link[1]) ? 'movie' : 'tv';
    items.push({
      title,
      url: link[1],
      type,
      year: yearMatch ? parseInt(yearMatch[1]) : null,
    });
  }
  return items;
}

function pelispediaEmbeds(html) {
  return [...html.matchAll(/<iframe[^>]*src="([^"]*\/\?trembed=[^"]*)"/gi)]
    .map(m => decodeEntities(m[1]).replace(/&#038;/g, '&'))
    .filter(u => /^https?:/.test(u));
}

function pelispediaEpisodeLinks(html) {
  const links = [];
  const re = /href="([^"]*\/capitulo\/[^"]*?temporada-(\d+)-capitulo-(\d+)[^"]*)"/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    links.push({ url: m[1], season: parseInt(m[2]), episode: parseInt(m[3]) });
  }
  return links;
}

function extractMonoschinosItems(html) {
  const items = [];
  const re = /<article>([\s\S]*?)<\/article>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const block = m[1];
    const link = block.match(/<a[^>]*href="([^"]*\/anime\/[^"]*)"[^>]*class="[^"]*card-wrap[^"]*"/i);
    if (!link) continue;
    const titleMatch = block.match(/<h3[^>]*class="card-title[^"]*"[^>]*>([\s\S]*?)<\/h3>/i);
    if (!titleMatch) continue;
    const title = decodeEntities(titleMatch[1].replace(/<[^>]*>/g, '')).trim();
    if (!title) continue;
    items.push({ title, url: link[1], type: 'tv', year: null });
  }
  return items;
}

function dataPlayerEmbeds(html) {
  return [...html.matchAll(/data-player="([^"]+)"/gi)]
    .map(m => {
      try {
        const fixed = m[1].replace(/-/g, '+').replace(/_/g, '/');
        return atob(fixed + '='.repeat((4 - fixed.length % 4) % 4));
      } catch (e) { return ''; }
    })
    .filter(u => /^https?:/.test(u));
}

function monoschinosEpisodeLinks(html) {
  const links = [];
  const re = /href="([^"]*\/ver\/[^"]*?episodio-(\d+)[^"]*)"/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    links.push({ url: m[1], season: 1, episode: parseInt(m[2]) });
  }
  return links;
}

function extractLatanimeItems(html) {
  const items = [];
  const re = /<a[^>]*href="([^"]*\/anime\/[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const block = m[2];
    if (!block.includes('class="series"')) continue;
    const titleMatch = block.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
    if (!titleMatch) continue;
    const title = decodeEntities(titleMatch[1].replace(/<[^>]*>/g, '')).trim();
    if (!title) continue;
    items.push({ title, url: m[1], type: 'tv', year: null });
  }
  return items;
}

function latanimeEpisodeLinks(html) {
  const links = [];
  const re = /href="([^"]*\/ver\/[^"]*?episodio-(\d+)[^"]*)"/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    links.push({ url: m[1], season: 1, episode: parseInt(m[2]) });
  }
  return links;
}

function extractPelisplushdItems(html) {
  const items = [];
  const re = /<a[^>]*href="([^"]*)"[^>]*class="Posters-link[^"]*"[^>]*data-title="([^"]*)"/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const dt = decodeEntities(m[2]).trim();
    let title = dt.replace(/^VER\s+/i, '').replace(/\s+Online\s+Gratis\s+HD$/i, '').trim();
    if (!title) continue;
    const yearMatch = title.match(/\((\d{4})\)\s*$/);
    const cleanTitle = yearMatch ? title.replace(/\s*\(\d{4}\)\s*$/, '').trim() : title;
    const type = /\/serie\//.test(m[1]) || /\/anime\//.test(m[1]) ? 'tv' : 'movie';
    items.push({ title: cleanTitle, url: m[1], type, year: yearMatch ? parseInt(yearMatch[1]) : null });
  }
  return items;
}

function pelisplushdEmbeds(html) {
  const embeds = [];
  for (const m of html.matchAll(/video\[\d+\]\s*=\s*['"]([^'"]+)['"]/gi)) {
    if (/^https?:/.test(m[1])) embeds.push(m[1]);
  }
  for (const m of html.matchAll(/<iframe[^>]*src="([^"]+)"/gi)) {
    if (/^https?:/.test(m[1])) embeds.push(m[1]);
  }
  return embeds;
}

function pelisplushdEpisodeLinks(html) {
  const links = [];
  const re = /href="([^"]*\/temporada\/(\d+)\/capitulo\/(\d+)[^"]*)"/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    links.push({ url: m[1], season: parseInt(m[2]), episode: parseInt(m[3]) });
  }
  return links;
}

function buildAnimeEpisodeUrl(base, season, episode) {
  const m = String(base).match(/^(https?:\/\/[^/]+)\/anime\/([^/?#]+)/);
  if (!m) return null;
  const slug = m[2].replace(/-sub-espanol$/, '');
  return `${m[1]}/ver/${slug}-episodio-${episode}`;
}

const SITES = {
  movies: [
    {
      name: 'Pelispedia',
      domains: ['pelispedia.is', 'pelispedia.mov', 'pelispedia.ink'],
      searchPath: q => `/?s=${encodeURIComponent(q)}`,
      parse: extractPelispediaItems,
      embeds: pelispediaEmbeds,
      episodeLinks: pelispediaEpisodeLinks,
      episodeUrl: (base) => base,
      hasEpisodes: true,
    },
    {
      name: 'PelisPlusHD',
      domains: ['pelisplushd.bz'],
      searchPath: q => `/search?s=${encodeURIComponent(q)}`,
      parse: extractPelisplushdItems,
      embeds: pelisplushdEmbeds,
      episodeLinks: pelisplushdEpisodeLinks,
      episodeUrl: (base) => base,
      hasEpisodes: true,
    },
  ],
  anime: [
    {
      name: 'Monoschinos',
      domains: ['monoschinos.st'],
      searchPath: q => `/buscar?q=${encodeURIComponent(q)}`,
      parse: extractMonoschinosItems,
      embeds: dataPlayerEmbeds,
      episodeLinks: monoschinosEpisodeLinks,
      episodeUrl: (base) => base,
      buildEpisodeUrl: buildAnimeEpisodeUrl,
      hasEpisodes: true,
      flatSeasons: true,
    },
    {
      name: 'LaTAnime',
      domains: ['latanime.org'],
      searchPath: q => `/buscar?q=${encodeURIComponent(q)}`,
      parse: extractLatanimeItems,
      embeds: dataPlayerEmbeds,
      episodeLinks: latanimeEpisodeLinks,
      episodeUrl: (base) => base,
      buildEpisodeUrl: buildAnimeEpisodeUrl,
      hasEpisodes: true,
      flatSeasons: true,
    },
  ],
};

function pickEpisodeUrl(site, item, season, episode) {
  if (!season || !episode) return item.url;
  if (site.hasEpisodes) {
    const built = site.episodeUrl(item.url, season, episode);
    return built || item.url;
  }
  return item.url;
}

async function resolveEmbed(embedUrl, deadline) {
  if (Date.now() > deadline) return null;
  if (!assertSafeUrl(embedUrl, STREAM_ALLOWED_HOSTS)) return null;
  const hostResult = await tryHostExtractors(embedUrl);
  if (hostResult) {
    const verified = await verifyWithVimeosRewrite(hostResult);
    if (verified) return { ...verified, sourceUrl: embedUrl };
  }
  if (Date.now() > deadline) return null;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (Date.now() > deadline) return null;
    if (attempt > 0 && Date.now() < deadline) await new Promise(r => setTimeout(r, 500));
    let result = null;
    try {
      result = await extractOnce(embedUrl, deadline);
    } catch (e) {}
    if (result) {
      const verified = await verifyWithVimeosRewrite(result);
      if (verified) return { ...verified, sourceUrl: embedUrl };
    }
  }
  return null;
}

async function siteFetchHTML(site, path, timeout) {
  let lastErr = null;
  for (const domain of site.domains) {
    try {
      const url = `https://${domain}${path}`;
      if (!assertSafeUrl(url, SITE_ALLOWED_HOSTS)) continue;
      return { html: await fetchHTML(url, timeout, SITE_ALLOWED_HOSTS), base: `https://${domain}` };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('Sitio caído');
}

async function matchPool(sameType, q, season) {
  const seasonPool = season > 1
    ? sameType.filter(it => new RegExp(`temporada[-\\s]*${season}|[-\\s]${season}(?:[-\\s]|$)`, 'i').test(normTitle(it.title)))
    : [];
  const base = seasonPool.length ? seasonPool : sameType;
  const pool = base.filter(it => normTitle(it.title).includes(q) || q.includes(normTitle(it.title)))
    .sort((a, b) => Math.abs(normTitle(a.title).length - q.length) - Math.abs(normTitle(b.title).length - q.length));
  const exact = base.find(it => normTitle(it.title) === q);
  return exact ? [exact] : pool.slice(0, 2);
}

async function collectEmbeds(site, matches, season, episode) {
  return (await Promise.allSettled(matches.map(async match => {
    try {
      const target = pickEpisodeUrl(site, match, season, episode);
      if (!assertSafeUrl(target, SITE_ALLOWED_HOSTS)) return [];
      let html = await fetchHTML(target, 4000, SITE_ALLOWED_HOSTS);
      if (season && episode && site.episodeLinks) {
        const eps = site.episodeLinks(html);
        const ep = site.flatSeasons
          ? eps.find(l => l.episode === episode)
          : eps.find(l => l.season === season && l.episode === episode);
        if (ep) {
          if (!assertSafeUrl(ep.url, SITE_ALLOWED_HOSTS)) return [];
          html = await fetchHTML(ep.url, 4000, SITE_ALLOWED_HOSTS);
        } else if (site.buildEpisodeUrl) {
          const built = site.buildEpisodeUrl(target, season, episode);
          if (built && assertSafeUrl(built, SITE_ALLOWED_HOSTS)) {
            try {
              html = await fetchHTML(built, 4000, SITE_ALLOWED_HOSTS);
            } catch (e) {
              return [];
            }
          }
        }
      }
      return site.embeds(html);
    } catch (e) {
      return [];
    }
  }))).flatMap(r => r.status === 'fulfilled' ? r.value : []);
}

async function trySite(site, queries, season, episode, deadline, type) {
  for (const q of queries) {
    if (Date.now() > deadline) break;
    let parsed = [];
    try {
      const { html, base } = await siteFetchHTML(site, site.searchPath(q), 3000);
      parsed = site.parse(html).map(it => ({ ...it, url: /^https?:/.test(it.url) ? it.url : base + it.url }));
    } catch (e) {}
    if (!parsed.length) continue;
    const matches = await matchPool(parsed.filter(it => it.type === type), normTitle(q), season);
    if (!matches.length) continue;
    const embeds = await collectEmbeds(site, matches, season, episode);
    if (embeds.length) return embeds;
  }
  return [];
}

async function handlePlay(url, env, corsHeaders, key) {
  const title = (url.searchParams.get('title') || '').trim();
  const year = url.searchParams.get('year');
  const type = url.searchParams.get('type') === 'tv' ? 'tv' : 'movie';
  const season = parseInt(url.searchParams.get('season')) || null;
  const episode = parseInt(url.searchParams.get('episode')) || null;
  const anime = url.searchParams.get('anime') === '1';
  if (!title) return jsonResponse({ error: 'Missing title' }, corsHeaders, 400);

  const itemId = url.searchParams.get('id');
  if (itemId && /^\d+$/.test(itemId)) {
    const tg = await findTelegramDownload(env, itemId, type, season, episode);
    if (tg) return jsonResponse({ ok: true, type: 'mp4', url: tg, direct: true }, corsHeaders);
  }

  const cacheKey = 'play/v1/' + (anime ? 'anime' : type) + '/' + encodeURIComponent(normTitle(title)) + '/' + (year || 0) + '/' + (season || 0) + '/' + (episode || 0);
  const hit = await cacheGet(cacheKey);
  if (hit) {
    const cached = await hit.json();
    if (cached && cached.ok && cached.url) {
      return jsonResponse(cached, corsHeaders);
    }
    if (cached && cached.ok === false && !cached.iframe) {
      return jsonResponse(cached, corsHeaders);
    }
  }

  const sites = anime ? SITES.anime : SITES.movies;
  const deadline = Date.now() + (season ? 22000 : 18000);
  const queries = [year ? `${title} ${year}` : title, title];
  if (anime && itemId && /^\d+$/.test(itemId)) {
    try {
      const alts = await tmdbGet('/tv/' + itemId + '/alternative_titles', {}, env, key, 604800);
      const seen = new Set(queries.map(normTitle));
      const PRIO = ['JP', 'MX', 'ES', 'US', 'AR', 'CO', 'CL', 'PE'];
      const extra = [];
      for (const a of (alts && alts.results) || []) {
        const t = String(a.title || '').trim();
        if (!t || t.length > 70 || t.length < 6 || !/[A-Za-z]/.test(t)) continue;
        const n = normTitle(t);
        if (!n || seen.has(n)) continue;
        seen.add(n);
        const p = PRIO.indexOf(a.iso_3166_1);
        extra.push({ t, p: p < 0 ? 99 : p, len: t.length });
      }
      extra.sort((x, y) => (x.p - y.p) || (x.len - y.len));
      for (const e of extra.slice(0, 3)) queries.push(e.t);
    } catch (e) {}
  }

  const siteFns = sites.map(site => trySite(site, queries, season, episode, deadline, anime ? 'tv' : type));
  const settled = await Promise.allSettled(siteFns);
  const embeds = settled.flatMap(r => r.status === 'fulfilled' ? r.value : []);
  const sorted = sortEmbeds(embeds);
  const firstIframe = sorted.find(u => fastRank(u) === -1) || null;
  const fasts = sorted.filter(u => fastRank(u) !== -1).slice(0, 4);

  const timeout = ms => new Promise(r => setTimeout(r, ms));
  const winner = await firstSuccess(fasts.map(u =>
    Promise.race([resolveEmbed(u, deadline), timeout(8000).then(() => null)])
  ));
  if (winner) {
    await cachePut(cacheKey, { ok: true, ...winner }, 600, corsHeaders, env);
    return jsonResponse({ ok: true, ...winner }, corsHeaders);
  }
  if (firstIframe) return jsonResponse({ ok: false, iframe: firstIframe }, corsHeaders);
  await cachePut(cacheKey, { ok: false }, 120, corsHeaders, env);
  return jsonResponse({ ok: false }, corsHeaders);
}

// ==================== TELEGRAM (Mocchi Uploader) ====================
async function findTelegramDownload(env, itemId, type, season, episode) {
  try {
    const { results } = await env.DB.prepare(
      'SELECT url FROM download_links WHERE item_id = ? AND type = ? AND ((season = ? AND episode = ?) OR (season = 0 AND episode = 0)) ORDER BY (season = 0) ASC'
    ).bind(String(itemId), type, season || 0, episode || 0).all();
    for (const row of (results || [])) {
      if (/^https?:\/\/t\.me\//i.test(row.url)) {
        const cdn = await resolveTelegram(row.url, env);
        if (cdn) return cdn;
      }
    }
  } catch (e) {}
  return null;
}

async function resolveTelegram(tgUrl, env) {
  const cacheKey = 'tg/v1/' + encodeURIComponent(tgUrl);
  const hit = await cacheGet(cacheKey);
  if (hit) {
    try {
      const cached = await hit.json();
      if (cached && cached.url) return cached.url;
    } catch (e) {}
  }
  const embed = tgUrl.replace(/\/+$/, '') + '?embed=1';
  try {
    const res = await fetchSafe(embed, { allowed: ['t.me'], timeout: 10000, headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) return null;
    const html = await res.text();
    const m = html.match(/<video[^>]+src="([^"]+)"/i);
    if (!m) return null;
    const url = m[1].replace(/&amp;/g, '&');
    if (!/^https:\/\/[a-z0-9.-]*telesco\.pe\//i.test(url)) return null;
    await cachePut(cacheKey, { url }, 7200, {}, env);
    return url;
  } catch (e) {
    return null;
  }
}

// ==================== REPRODUCTOR PROPIO ====================
const STREAM_HOSTS = [
  { re: /(?:doodstream\.com|dooood\.com|doods\.pro|dood\.(?:la|to|so|ws|yt|li|wf|cx|sh|pm|watch|video)|d0000d\.com|d000d\.com|ds2play\.com|ds2video\.com|myvidplay\.com|playmogo\.com)/i, fn: extractDoodstream },
  { re: /byse\w*\.(?:com|sx)/i, fn: extractByse },
  { re: /(?:streamtape\.(?:com|net|xyz)|watchadsontape\.com|shavetape\.cash)/i, fn: extractStreamTape },
  { re: /(?:hglink\.to|savefiles\.com|mwish\.pro|dwish\.pro|embedwish\.com|wishembed\.pro|kswplayer\.info|wishfast\.top|streamwish\.site|sfastwish\.com|strwish\w*\.\w+|streamwish\.to|obeywish\.com|asnwish\.com|hlswish\.com)/i, fn: extractStreamWish },
  { re: /filemoon\.(?:sx|top|xyz|fun)/i, fn: extractFilemoon },
  { re: /vidhide\w*\.\w+|morencius\.com/i, fn: extractVidhide },
  { re: /mixdrop\w*\.\w+|miixdrop\.top|mxdrop\.(?:to|top)|mdy48tn97\.com/i, fn: extractMixdrop },
  { re: /voe\.sx/i, fn: extractVoe },
  { re: /hqq\.(?:tv|to)/i, fn: extractHqq },
  { re: /mp4upload\.com/i, fn: extractMp4upload },
  { re: /yourupload\.com/i, fn: extractYourUpload },
  { re: /embed69\.org/i, fn: extractEmbed69 },
];

function b64UrlDecode(str) {
  const fixed = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = (4 - (fixed.length % 4)) % 4;
  const raw = atob(fixed + '='.repeat(pad));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

async function fetchFollow(url, timeout = 8000) {
  let current = url;
  const headers = {
    'User-Agent': USER_AGENT,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
  };
  for (let i = 0; i <= 3; i++) {
    if (!assertSafeUrl(current, STREAM_ALLOWED_HOSTS)) throw new Error('URL no permitida');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    let response;
    try {
      response = await fetch(current, { headers, signal: controller.signal, redirect: 'manual' });
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
    clearTimeout(timer);
    if (response.status >= 300 && response.status < 400) {
      const loc = response.headers.get('location');
      if (!loc) break;
      current = new URL(loc, current).href;
      continue;
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return { url: current, text: await response.text(), headers: response.headers };
  }
  throw new Error('Demasiados redirects');
}

async function extractDoodstream(url) {
  const embedUrl = url.replace('/d/', '/e/');
  const { url: finalUrl, text: html, headers: embedHeaders } = await fetchFollow(embedUrl, STREAM_TIMEOUT);
  const host = new URL(finalUrl).origin;
  const md5Match = html.match(/\/pass_md5\/([0-9a-zA-Z]+)/);
  if (!md5Match) return null;
  const md5Url = host + '/pass_md5/' + md5Match[1];
  const reqHeaders = { 'User-Agent': USER_AGENT, 'Referer': finalUrl };
  const cookie = embedHeaders ? embedHeaders.get('set-cookie') : null;
  if (cookie) reqHeaders['Cookie'] = cookie;
  const res = await fetchSafe(md5Url, { allowed: STREAM_ALLOWED_HOSTS, timeout: 8000, headers: reqHeaders });
  if (!res.ok) return null;
  const videoUrl = (await res.text()).trim();
  if (!videoUrl.startsWith('http')) return null;
  if (!assertSafeUrl(videoUrl, STREAM_ALLOWED_HOSTS)) return null;
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let random = '';
  for (let i = 0; i < 10; i++) random += alphabet[Math.floor(Math.random() * alphabet.length)];
  const hash = md5Match[0].split('/').pop();
  return { type: 'mp4', url: `${videoUrl}${random}?token=${hash}`, referer: finalUrl };
}

async function extractByse(url) {
  const base = new URL(url).origin;
  const code = new URL(url).pathname.replace(/\/+$/, '').split('/').pop();
  const detailsRes = await fetchSafe(`${base}/api/videos/${code}/embed/details`, {
    allowed: STREAM_ALLOWED_HOSTS,
    timeout: 8000,
    headers: { 'User-Agent': USER_AGENT }
  });
  if (!detailsRes.ok) return null;
  const details = await detailsRes.json();
  const embedFrameUrl = details.embed_frame_url;
  if (!embedFrameUrl) return null;
  if (!assertSafeUrl(embedFrameUrl, STREAM_ALLOWED_HOSTS)) return null;
  const embedBase = new URL(embedFrameUrl).origin;
  const ecode = new URL(embedFrameUrl).pathname.replace(/\/+$/, '').split('/').pop();
  const playbackRes = await fetchSafe(`${embedBase}/api/videos/${ecode}/embed/playback`, {
    allowed: STREAM_ALLOWED_HOSTS,
    timeout: 8000,
    headers: {
      'User-Agent': USER_AGENT,
      'accept': '*/*',
      'accept-language': 'en-US,en;q=0.5',
      'priority': 'u=1, i',
      'referer': embedFrameUrl,
      'x-embed-parent': url,
    }
  });
  if (!playbackRes.ok) return null;
  const playback = (await playbackRes.json()).playback;
  if (!playback || !playback.key_parts || playback.key_parts.length < 2) return null;
  const keyBytes = new Uint8Array([...b64UrlDecode(playback.key_parts[0]), ...b64UrlDecode(playback.key_parts[1])]);
  const iv = b64UrlDecode(playback.iv);
  const payload = b64UrlDecode(playback.payload);
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['decrypt']);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, payload);
  let jsonStr = new TextDecoder().decode(decrypted);
  if (jsonStr.startsWith('\uFEFF')) jsonStr = jsonStr.slice(1);
  const root = JSON.parse(jsonStr);
  const streamUrl = root?.sources?.[0]?.url;
  if (!streamUrl) return null;
  return {
    type: streamUrl.includes('.m3u8') ? 'hls' : 'mp4',
    url: streamUrl,
    referer: base
  };
}

async function extractStreamTape(url) {
  const html = await fetchHTML(url, STREAM_TIMEOUT);
  const m = html.match(/getElementById\(['"]botlink['"]\)\.innerHTML\s*=\s*'([^']+)'/);
  if (!m) return null;
  const final = 'https:' + m[1] + '&stream=1';
  return {
    type: final.includes('.m3u8') ? 'hls' : 'mp4',
    url: final,
    referer: url
  };
}

async function extractStreamWish(url) {
  let target = url;
  const m = url.match(/\/([fe])\/([^/]+)/);
  if (m) target = new URL(m[2], new URL(url).origin).href;
  const html = await fetchHTML(target, STREAM_TIMEOUT);
  const unpacked = unpackPacker(html);
  const found = findStreamUrl(unpacked) || findStreamUrl(html);
  if (found) return { ...found, referer: new URL(target).origin };
  return null;
}

async function extractFilemoon(url) {
  const codeMatch = url.match(/\/[ed]\/([^\/\s]+)\/?$/i);
  if (!codeMatch) return null;
  const origin = new URL(url).origin;
  const res = await fetchSafe(`${origin}/api/videos/${codeMatch[1]}`, {
    allowed: STREAM_ALLOWED_HOSTS,
    timeout: 8000,
    headers: { 'User-Agent': USER_AGENT, 'Referer': url }
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data || data.error !== undefined || !data.playback) return null;
  const playback = data.playback;
  if (!playback.key_parts || playback.key_parts.length !== 2 || !playback.payload) return null;
  const keyBytes = new Uint8Array([...b64UrlDecode(playback.key_parts[0]), ...b64UrlDecode(playback.key_parts[1])]);
  if (keyBytes.length !== 32) return null;
  const iv = b64UrlDecode(playback.iv);
  const payload = b64UrlDecode(playback.payload);
  let decrypted;
  try {
    const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['decrypt']);
    decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, payload);
  } catch (e) {
    return null;
  }
  let jsonStr = new TextDecoder().decode(decrypted);
  if (jsonStr.startsWith('\uFEFF')) jsonStr = jsonStr.slice(1);
  const root = JSON.parse(jsonStr);
  const hls = (root.sources || []).find(s => s.mime_type === 'application/vnd.apple.mpegurl');
  if (!hls || !hls.url) return null;
  return { type: 'hls', url: hls.url, referer: url };
}

async function extractVidhide(url) {
  const html = await fetchHTML(url, STREAM_TIMEOUT);
  const unpacked = unpackPacker(html);
  const sources = [];
  const matches = unpacked.matchAll(/["'](hls4|hls3|hls2)["']\s*:\s*["']([^"']+)["']/g);
  for (const m of matches) {
    const u = new URL(m[2], url).href;
    if (u.includes('.m3u8')) sources.push({ url: u, priority: parseInt(m[1].slice(-1)) });
  }
  if (!sources.length) return null;
  sources.sort((a, b) => b.priority - a.priority);
  return { type: 'hls', url: sources[0].url, referer: url };
}

async function extractMixdrop(url) {
  if (url.includes('club')) url = url.replace('club', 'ps').split('/2')[0];
  const html = await fetchHTML(url, STREAM_TIMEOUT);
  const unpacked = unpackPacker(html);
  const m3u8 = unpacked.match(/https:\/\/[^"']+?\.m3u8[^"']*/i);
  if (m3u8) return { type: 'hls', url: m3u8[0], referer: url };
  const wurl = unpacked.match(/MDCore\.wurl\s*=\s*"([^"]+)"/);
  if (wurl) {
    let u = wurl[1];
    if (u.startsWith('//')) u = 'https:' + u;
    if (!/^https?:/.test(u)) u = new URL(u, url).href;
    return { type: u.includes('.m3u8') ? 'hls' : 'mp4', url: u, referer: url };
  }
  return null;
}

async function extractVoe(url) {
  const html = await fetchHTML(url, STREAM_TIMEOUT);
  const redirect = html.match(/window\.location\.href\s*=\s*['"](https?:\/\/[^'"]+)['"]/i);
  const target = redirect ? redirect[1] : url;
  const finalHtml = redirect ? await fetchHTML(target, STREAM_TIMEOUT) : html;
  const patterns = [
    /sources?\s*:\s*\[\s*\{[^}]*src\s*:\s*["']([^"']+)["']/i,
    /"file"\s*:\s*"([^"]+)"/i,
    /(https?:\/\/[^\s"'<>]+\.(?:mp4|m3u8)[^\s"'<>]*)/i,
  ];
  for (const p of patterns) {
    const m = finalHtml.match(p);
    if (!m || !m[1]) continue;
    const u = m[1].replace(/\\u0026/g, '&').replace(/\\\//g, '/').replace(/&amp;/g, '&').trim();
    if (/\.(?:mp4|m3u8)/i.test(u)) return { type: u.includes('.m3u8') ? 'hls' : 'mp4', url: u, referer: target };
  }
  return null;
}

async function extractHqq(url) {
  const html = await fetchHTML(url, STREAM_TIMEOUT);
  const patterns = [
    /sources?\s*:\s*\[\s*\{[^}]*file\s*:\s*["'](https?:\/\/[^"']+)["']/i,
    /file\s*:\s*"([^"]+\.mp4[^"]*)"/i,
    /video(?:\d+)?\s*=\s*["']([^"']+\.mp4[^"']+)["']/i,
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m && m[1]) return { type: m[1].includes('.m3u8') ? 'hls' : 'mp4', url: m[1], referer: url };
  }
  return null;
}

async function extractMp4upload(url) {
  const html = await fetchHTML(url, STREAM_TIMEOUT);
  const m = html.match(/<script(?:.|\n)+?src:(?:.|\n)*?"(.+?\.mp4)"/);
  if (!m) return null;
  return { type: 'mp4', url: m[1], referer: url };
}

async function extractYourUpload(url) {
  const html = await fetchHTML(url, STREAM_TIMEOUT);
  const meta = html.match(/property\s*=\s*"og:video"[\s\S]*?content\s*=\s*"(\S+)"/i);
  if (!meta || meta[1] === '/embed/novideo.mp4') return null;
  return { type: 'mp4', url: meta[1], referer: 'https://yourupload.com' };
}

async function sha256Hex(text) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Bytes(text) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

async function decryptAesCbc(encryptedBase64, aesKey) {
  const raw = b64UrlDecode(encryptedBase64);
  if (raw.length <= 16) return null;
  const iv = raw.slice(0, 16);
  const ciphertext = raw.slice(16);
  const key = await crypto.subtle.importKey('raw', aesKey.slice(0, 32), { name: 'AES-CBC' }, false, ['decrypt']);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, key, ciphertext);
  return new TextDecoder().decode(decrypted);
}

async function extractEmbed69(url) {
  const html = await fetchHTML(url, STREAM_TIMEOUT);
  const challenge = html.match(/const\s+POW_CHALLENGE\s*=\s*['"]([^'"]+)['"]/);
  const difficulty = html.match(/const\s+POW_DIFFICULTY\s*=\s*(\d+)/);
  const salt = html.match(/const\s+POW_SALT\s*=\s*['"]([^'"]+)['"]/);
  const data = html.match(/let\s+dataLink\s*=\s*(\[[\s\S]*?\]);/);
  if (!challenge || !difficulty || !salt || !data) return null;
  let dataLink;
  try { dataLink = JSON.parse(data[1]); } catch (e) { return null; }
  const target = '0'.repeat(parseInt(difficulty[1]));
  let aesKey = null;
  for (let nonce = 0; nonce < 10000; nonce++) {
    const hash = await sha256Hex(challenge[1] + nonce);
    if (hash.startsWith(target)) {
      aesKey = await sha256Bytes(challenge[1] + nonce + salt[1]);
      break;
    }
  }
  if (!aesKey) return null;
  const links = [];
  for (const file of dataLink) {
    for (const list of [file && file.sortedEmbeds, file && file.downloadEmbeds]) {
      if (!Array.isArray(list)) continue;
      for (const embed of list) {
        if (!embed || !embed.link) continue;
        try {
          const decrypted = await decryptAesCbc(embed.link, aesKey);
          if (decrypted && /^https?:/.test(decrypted)) links.push(decrypted);
        } catch (e) {}
      }
    }
  }
  if (!links.length) return null;
  const m3u8 = links.find(u => u.includes('.m3u8')) || links[0];
  return { type: m3u8.includes('.m3u8') ? 'hls' : 'mp4', url: m3u8, referer: url };
}

async function tryHostExtractors(targetUrl) {
  for (const host of STREAM_HOSTS) {
    if (host.re.test(targetUrl)) {
      try {
        const result = await host.fn(targetUrl);
        if (result && result.url) return result;
      } catch (e) {}
    }
  }
  return null;
}

function unescapeJsLiteral(str) {
  return str
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/\\\\/g, '\\')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '')
    .replace(/\\t/g, ' ');
}

function unpackPacker(input) {
  const idx = input.indexOf('function(p,a,c,k,e,d');
  if (idx === -1) return input;
  const argsStart = input.indexOf("return p}('", idx);
  if (argsStart === -1) return input;
  let j = argsStart + "return p}('".length;
  let payload = '';
  while (j < input.length) {
    const ch = input[j];
    if (ch === '\\') {
      payload += ch + (input[j + 1] || '');
      j += 2;
      continue;
    }
    if (ch === "'") break;
    payload += ch;
    j++;
  }
  const argsMatch = input.slice(j + 1).match(/^\s*"?\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'([^']*)'\.split\(['"]\|['"]\)/);
  if (!argsMatch) return input;
  const a = parseInt(argsMatch[1]);
  const c = parseInt(argsMatch[2]);
  const dict = argsMatch[3].split('|');
  let out = unescapeJsLiteral(payload);
  for (let i = c - 1; i >= 0; i--) {
    const word = dict[i];
    if (!word) continue;
    const token = i.toString(a);
    out = out.replace(new RegExp('\\b' + token + '\\b', 'g'), () => word);
  }
  return out;
}

function findStreamUrl(html) {
  const m3u8Regex = /(https?:\/\/[^\s"'<>\\]+?\.m3u8[^\s"'<>\\]*)/gi;
  const m3u8s = [];
  let m;
  while ((m = m3u8Regex.exec(html)) !== null) {
    const u = m[1].replace(/[;)\]}]+$/, '');
    if (!u.includes('test-videos') && !u.includes('bigbuckbunny') && !m3u8s.includes(u)) m3u8s.push(u);
  }
  if (m3u8s.length) {
    const master = m3u8s.find(u => /master[^/]*\.m3u8|index\.m3u8|playlist\.m3u8/i.test(u)) || m3u8s[0];
    return { type: 'hls', url: master };
  }
  const vidRegex = /(https?:\/\/[^\s"'<>\\]+?\.(?:mp4|webm)[^\s"'<>\\]*)/gi;
  while ((m = vidRegex.exec(html)) !== null) {
    const u = m[1].replace(/[;)\]}]+$/, '');
    if (!u.includes('test-videos') && !u.includes('bigbuckbunny') && !u.includes('trailer')) {
      return { type: 'mp4', url: u };
    }
  }
  return null;
}

async function extractOnce(targetUrl, deadline) {
  let current = targetUrl;
  for (let hop = 0; hop < 5; hop++) {
    if (deadline && Date.now() > deadline) return null;
    if (!assertSafeUrl(current, STREAM_ALLOWED_HOSTS)) return null;
    const html = await fetchHTML(current, STREAM_TIMEOUT);
    const redirectMatch = html.match(/(?:window\.)?(?:document\.)?location\.(?:href\s*=|replace\(|assign\()\s*['"]([^'"]+)['"]/i)
      || html.match(/<meta[^>]*http-equiv=["']refresh["'][^>]*content=["'][^"']*url=([^"']+)["']/i);
    if (redirectMatch) {
      const next = decodeEntities(redirectMatch[1]);
      if (next.startsWith('/')) current = new URL(next, current).href;
      else if (/^https?:/.test(next)) current = next;
      else break;
      continue;
    }
    const iframeMatch = html.match(/<iframe[^>]*src="([^"]+)"/i);
    if (iframeMatch) {
      const next = decodeEntities(iframeMatch[1]);
      if (/^https?:/.test(next) && assertSafeUrl(next, STREAM_ALLOWED_HOSTS)) {
        current = next;
        continue;
      }
    }
    const unpacked = unpackPacker(html);
    const found = findStreamUrl(unpacked) || findStreamUrl(html);
    if (found) return { ...found, referer: current };
    break;
  }
  return null;
}

async function verifyStream(result) {
  if (!result) return false;
  if (result.type === 'mp4') {
    const headers = { 'User-Agent': USER_AGENT, 'Accept': '*/*', 'Range': 'bytes=0-0' };
    if (result.referer) headers['Referer'] = result.referer;
    try {
      const res = await fetchSafe(result.url, { allowed: STREAM_ALLOWED_HOSTS, timeout: 5000, headers });
      return res.ok;
    } catch (e) {
      return false;
    }
  }
  if (result.type !== 'hls') return true;
  const headers = { 'User-Agent': USER_AGENT, 'Accept': '*/*' };
  if (result.referer) headers['Referer'] = result.referer;
  let text;
  try {
    const res = await fetchSafe(result.url, { allowed: STREAM_ALLOWED_HOSTS, timeout: 7000, headers });
    if (!res.ok) return false;
    text = await res.text();
  } catch (e) {
    return false;
  }
  if (!text.trimStart().startsWith('#EXTM3U')) return false;
  if (/#EXT-X-STREAM-INF/i.test(text)) return true;
  const segMatch = text.match(/#EXTINF:[^,\n]+,?\s*\n(?:(?:#EXT-X-[A-Z-]+:[^\n]*|#[^\n]*)\n)*\s*([^\s#][^\n]*)/);
  if (!segMatch) return false;
  const segUrl = new URL(segMatch[1], result.url).href;
  try {
    const segRes = await fetchSafe(segUrl, { allowed: STREAM_ALLOWED_HOSTS, timeout: 3000, headers });
    if (!segRes.ok) return false;
    const reader = segRes.body.getReader();
    const start = Date.now();
    let bytes = 0;
    let elapsed = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      elapsed = (Date.now() - start) / 1000;
      if (elapsed >= 2.5) break;
    }
    return bytes / Math.max(elapsed, 0.1) >= 50 * 1024;
  } catch (e) {
    return false;
  }
}

async function verifyWithVimeosRewrite(result) {
  if (await verifyStream(result)) return result;
  try {
    const u = new URL(result.url);
    if (/^(?:[a-z0-9-]+\.)?vimeos\.(?:net|zip)$/i.test(u.hostname)) {
      for (const host of ['p3.vimeos.zip', 'p2.vimeos.zip']) {
        if (u.hostname === host) continue;
        const alt = { ...result, url: new URL(u.href).href.replace(u.hostname, host) };
        if (await verifyStream(alt)) return alt;
      }
    }
  } catch (e) {}
  return null;
}

async function handleStreamResolve(targetUrl, corsHeaders, env) {
  try {
    if (!assertSafeUrl(targetUrl, STREAM_ALLOWED_HOSTS)) {
      return jsonResponse({ ok: false }, corsHeaders);
    }
    const cacheKey = 'stream/v1/' + encodeURIComponent(targetUrl);
    const hit = await cacheGet(cacheKey);
    if (hit) {
      const cached = await hit.json();
      if (cached && cached.ok && (cached.type !== 'hls' || await verifyStream(cached))) {
        return jsonResponse(cached, corsHeaders);
      }
      await cacheDelete(cacheKey, env);
    }
    const hostResult = await tryHostExtractors(targetUrl);
    if (hostResult) {
      const verified = await verifyWithVimeosRewrite(hostResult);
      if (verified) {
        return cachePut(cacheKey, { ok: true, ...verified }, 300, corsHeaders, env);
      }
    }
    const deadline = Date.now() + 15000;
    for (let attempt = 0; attempt < 4; attempt++) {
      if (Date.now() > deadline) break;
      let result = null;
      try {
        result = await extractOnce(targetUrl, deadline);
      } catch (e) {}
      if (result) {
        const verified = await verifyWithVimeosRewrite(result);
        if (verified) {
          return cachePut(cacheKey, { ok: true, ...verified }, 300, corsHeaders, env);
        }
      }
      if (attempt < 3 && Date.now() < deadline) await new Promise(r => setTimeout(r, 500));
    }
    return jsonResponse({ ok: false }, corsHeaders);
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message }, corsHeaders);
  }
}

async function fetchM3U8WithRetry(targetUrl, ref, corsHeaders) {
  const headers = {
    'User-Agent': USER_AGENT,
    'Accept': '*/*',
  };
  if (ref) headers['Referer'] = ref;
  for (let attempt = 0; attempt < 2; attempt++) {
    let res;
    try {
      res = await fetchSafe(targetUrl, { allowed: STREAM_ALLOWED_HOSTS, timeout: 8000, headers });
    } catch (err) {
      if (attempt < 1) await new Promise(r => setTimeout(r, 400));
      continue;
    }
    if (!res.ok) {
      if (attempt < 1) await new Promise(r => setTimeout(r, 400));
      continue;
    }
    const text = await res.text();
    if (!text.trimStart().startsWith('#EXTM3U')) {
      if (attempt < 1) await new Promise(r => setTimeout(r, 400));
      continue;
    }
    const isMaster = /#EXT-X-STREAM-INF/i.test(text);
    const base = new URL(targetUrl).href;
    const absolutized = text.split('\n').map(line => {
      const t = line.trim();
      if (!t || t.startsWith('#')) return line;
      return new URL(t, base).href;
    }).join('\n');
    const body = isMaster
      ? absolutized.replace(/CODECS="[^"]*",?/gi, '').replace(/,\s*,/g, ',').replace(/,[ \t]*(\r?\n)/g, '$1')
      : absolutized;
    const out = new Headers();
    out.set('Access-Control-Allow-Origin', '*');
    out.set('Content-Type', res.headers.get('Content-Type') || 'application/vnd.apple.mpegurl');
    out.set('Cache-Control', 'no-store');
    return new Response(body, { status: 200, headers: out });
  }
  return jsonResponse({ error: 'Upstream no devolvió un manifiesto válido' }, corsHeaders, 502);
}

async function handleProxy(targetUrl, reqUrl, request, corsHeaders) {
  if (!assertSafeUrl(targetUrl, STREAM_ALLOWED_HOSTS)) {
    return jsonResponse({ error: 'URL no permitida' }, corsHeaders, 403);
  }
  const ref = reqUrl.searchParams.get('ref') || '';
  const range = request.headers.get('Range') || '';
  if (/\.(?:m3u8|txt)([?#]|$)/i.test(targetUrl)) {
    return fetchM3U8WithRetry(targetUrl, ref, corsHeaders);
  }
  const headers = {
    'User-Agent': USER_AGENT,
    'Accept': '*/*',
  };
  if (ref) headers['Referer'] = ref;
  if (range) headers['Range'] = range;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetchSafe(targetUrl, { allowed: STREAM_ALLOWED_HOSTS, timeout: 8000, headers });
      if ((res.status === 403 || res.status === 429 || res.status >= 500) && attempt < 1) {
        await new Promise(r => setTimeout(r, 400 * (attempt + 1)));
        continue;
      }
      const outHeaders = new Headers();
      outHeaders.set('Access-Control-Allow-Origin', '*');
      for (const h of ['Content-Type', 'Content-Range', 'Accept-Ranges']) {
        const v = res.headers.get(h);
        if (v) outHeaders.set(h, v);
      }
      outHeaders.set('Cache-Control', 'no-store');
      return new Response(res.body, { status: res.status, headers: outHeaders });
    } catch (err) {
      if (attempt < 1) {
        await new Promise(r => setTimeout(r, 400 * (attempt + 1)));
        continue;
      }
      return jsonResponse({ error: err.message }, corsHeaders, 502);
    }
  }
}

// ==================== ADMIN ====================
async function handleGetAvatar(env, corsHeaders) {
  try {
    const { results } = await env.DB.prepare('SELECT value FROM config WHERE key = ?').bind('avatar').all();
    const avatar = results.length ? results[0].value : '';
    return jsonResponse({ avatar }, corsHeaders);
  } catch (e) {
    return jsonResponse({ error: 'Error interno' }, corsHeaders, 500);
  }
}

async function handleUpdateAvatar(request, env, corsHeaders) {
  let body;
  try {
    body = await request.json();
  } catch (err) {
    return jsonResponse({ error: 'Invalid body' }, corsHeaders, 400);
  }
  try {
    const avatar = String(body.avatar || '').trim();
    if (avatar && (!/^https:\/\//i.test(avatar) || avatar.length > 500)) {
      return jsonResponse({ error: 'Avatar inválido' }, corsHeaders, 400);
    }
    await env.DB.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)').bind('avatar', avatar).run();
    return jsonResponse({ success: true }, corsHeaders);
  } catch (e) {
    return jsonResponse({ error: 'Error interno' }, corsHeaders, 500);
  }
}

async function handleDeleteAvatar(env, corsHeaders) {
  try {
    await env.DB.prepare('UPDATE config SET value = ? WHERE key = ?').bind('', 'avatar').run();
    return jsonResponse({ success: true }, corsHeaders);
  } catch (e) {
    return jsonResponse({ error: 'Error interno' }, corsHeaders, 500);
  }
}

async function handlePublicPlaylists(env, corsHeaders) {
  try {
    const { results } = await env.DB.prepare(
      'SELECT p.id, p.name, p.cover, COUNT(i.id) AS count FROM playlists p LEFT JOIN playlist_items i ON i.playlist_id = p.id GROUP BY p.id ORDER BY p.name COLLATE NOCASE ASC, p.id ASC'
    ).all();
    return jsonResponse({ playlists: results }, corsHeaders);
  } catch (e) {
    return jsonResponse({ error: 'Error interno' }, corsHeaders, 500);
  }
}

async function handlePublicPlaylist(id, env, corsHeaders) {
  try {
    const pl = await env.DB.prepare('SELECT id, name, cover FROM playlists WHERE id = ?').bind(id).first();
    if (!pl) return jsonResponse({ error: 'Playlist no encontrada' }, corsHeaders, 404);
    const { results } = await env.DB.prepare(
      'SELECT id, item_id, type, title, poster, release_date, anime FROM playlist_items WHERE playlist_id = ? ORDER BY release_date IS NULL, release_date ASC, position, id'
    ).bind(id).all();
    return jsonResponse({ playlist: { ...pl, items: results } }, corsHeaders);
  } catch (e) {
    return jsonResponse({ error: 'Error interno' }, corsHeaders, 500);
  }
}

function cleanCover(raw) {
  const v = String(raw || '').trim();
  if (!v) return null;
  if (v.length > 500) return null;
  try {
    const u = new URL(v);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  } catch (e) { return null; }
  return v;
}

async function handleCreatePlaylist(request, env, corsHeaders) {
  let body;
  try { body = await request.json(); } catch (e) { return jsonResponse({ error: 'Invalid body' }, corsHeaders, 400); }
  const name = String(body.name || '').trim();
  if (!name || name.length > 60) return jsonResponse({ error: 'Nombre inválido' }, corsHeaders, 400);
  const cover = cleanCover(body.cover);
  if (body.cover && cover === null) return jsonResponse({ error: 'URL de portada inválida' }, corsHeaders, 400);
  try {
    const res = await env.DB.prepare('INSERT INTO playlists (name, cover) VALUES (?, ?)').bind(name, cover).run();
    return jsonResponse({ success: true, id: res.meta.last_row_id }, corsHeaders);
  } catch (e) {
    return jsonResponse({ error: 'Error interno' }, corsHeaders, 500);
  }
}

async function handleRenamePlaylist(id, request, env, corsHeaders) {
  let body;
  try { body = await request.json(); } catch (e) { return jsonResponse({ error: 'Invalid body' }, corsHeaders, 400); }
  const name = String(body.name || '').trim();
  if (!name || name.length > 60) return jsonResponse({ error: 'Nombre inválido' }, corsHeaders, 400);
  try {
    if (body.cover === undefined) {
      await env.DB.prepare('UPDATE playlists SET name = ? WHERE id = ?').bind(name, id).run();
    } else {
      const cover = cleanCover(body.cover);
      if (body.cover && cover === null) return jsonResponse({ error: 'URL de portada inválida' }, corsHeaders, 400);
      await env.DB.prepare('UPDATE playlists SET name = ?, cover = ? WHERE id = ?').bind(name, cover, id).run();
    }
    return jsonResponse({ success: true }, corsHeaders);
  } catch (e) {
    return jsonResponse({ error: 'Error interno' }, corsHeaders, 500);
  }
}

async function handleDeletePlaylist(id, env, corsHeaders) {
  try {
    await env.DB.prepare('DELETE FROM playlist_items WHERE playlist_id = ?').bind(id).run();
    await env.DB.prepare('DELETE FROM playlists WHERE id = ?').bind(id).run();
    return jsonResponse({ success: true }, corsHeaders);
  } catch (e) {
    return jsonResponse({ error: 'Error interno' }, corsHeaders, 500);
  }
}

async function handleAddPlaylistItem(id, request, env, corsHeaders) {
  let body;
  try { body = await request.json(); } catch (e) { return jsonResponse({ error: 'Invalid body' }, corsHeaders, 400); }
  const itemId = String(body.item_id || '');
  const type = body.type === 'tv' ? 'tv' : 'movie';
  const title = String(body.title || '').trim();
  if (!itemId || !title) return jsonResponse({ error: 'Item inválido' }, corsHeaders, 400);
  try {
    const exists = await env.DB.prepare(
      'SELECT id FROM playlist_items WHERE playlist_id = ? AND item_id = ? AND type = ?'
    ).bind(id, itemId, type).first();
    if (exists) return jsonResponse({ error: 'Ya está en la playlist' }, corsHeaders, 409);
    const cnt = await env.DB.prepare('SELECT COUNT(*) c FROM playlist_items WHERE playlist_id = ?').bind(id).first();
    if (cnt.c >= 50) return jsonResponse({ error: 'Máximo 50 títulos por playlist' }, corsHeaders, 400);
    const poster = body.poster ? String(body.poster).slice(0, 500) : null;
    const releaseDate = body.release_date ? String(body.release_date).slice(0, 20) : null;
    const anime = body.anime ? 1 : 0;
    const res = await env.DB.prepare(
      'INSERT INTO playlist_items (playlist_id, item_id, type, title, poster, release_date, anime, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(id, itemId, type, title.slice(0, 200), poster, releaseDate, anime, cnt.c).run();
    return jsonResponse({ success: true, id: res.meta.last_row_id }, corsHeaders);
  } catch (e) {
    return jsonResponse({ error: 'Error interno' }, corsHeaders, 500);
  }
}

async function handleRemovePlaylistItem(pid, iid, env, corsHeaders) {
  try {
    await env.DB.prepare('DELETE FROM playlist_items WHERE id = ? AND playlist_id = ?').bind(iid, pid).run();
    return jsonResponse({ success: true }, corsHeaders);
  } catch (e) {
    return jsonResponse({ error: 'Error interno' }, corsHeaders, 500);
  }
}

async function handleUpsertDownloadLink(request, env, corsHeaders) {
  let body;
  try { body = await request.json(); } catch (e) { return jsonResponse({ error: 'Invalid body' }, corsHeaders, 400); }
  const itemId = String(body.item_id || '');
  const type = body.type === 'tv' ? 'tv' : 'movie';
  const season = parseInt(body.season) || 0;
  const episode = parseInt(body.episode) || 0;
  const url = String(body.url || '').trim();
  if (!itemId) return jsonResponse({ error: 'Item inválido' }, corsHeaders, 400);
  if (url) {
    if (url.length > 500) return jsonResponse({ error: 'URL muy larga' }, corsHeaders, 400);
    try {
      const u = new URL(url);
      if (u.protocol !== 'https:' && u.protocol !== 'http:') return jsonResponse({ error: 'URL inválida' }, corsHeaders, 400);
    } catch (e) { return jsonResponse({ error: 'URL inválida' }, corsHeaders, 400); }
  }
  try {
    if (!url) {
      await env.DB.prepare('DELETE FROM download_links WHERE item_id = ? AND type = ? AND season = ? AND episode = ?').bind(itemId, type, season, episode).run();
    } else {
      await env.DB.prepare(
        'INSERT INTO download_links (item_id, type, season, episode, url) VALUES (?, ?, ?, ?, ?) ON CONFLICT(item_id, type, season, episode) DO UPDATE SET url = excluded.url'
      ).bind(itemId, type, season, episode, url).run();
    }
    await cacheDelete('details/v2/' + type + '/' + encodeURIComponent(itemId), env);
    return jsonResponse({ success: true }, corsHeaders);
  } catch (e) {
    return jsonResponse({ error: 'Error interno' }, corsHeaders, 500);
  }
}

async function handleAdminStats(env, corsHeaders) {
  const [sSearch, sHome, sOther, sTmdb] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) c FROM cache_keys WHERE key LIKE 'search/%'").first(),
    env.DB.prepare("SELECT COUNT(*) c FROM cache_keys WHERE key LIKE 'home/%'").first(),
    env.DB.prepare("SELECT COUNT(*) c FROM cache_keys WHERE key NOT LIKE 'search/%' AND key NOT LIKE 'home/%' AND key NOT LIKE 'tmdb/%'").first(),
    env.DB.prepare("SELECT COUNT(*) c FROM cache_keys WHERE key LIKE 'tmdb/%'").first(),
  ]);
  return jsonResponse({
    cache: { search: sSearch.c, home: sHome.c, tmdb: sTmdb.c, other: sOther.c }
  }, corsHeaders);
}

async function handleCachePurge(request, env, corsHeaders) {
  let scope;
  try {
    ({ scope } = await request.json());
  } catch (err) {
    return jsonResponse({ error: 'Invalid body' }, corsHeaders, 400);
  }
  if (!['all', 'search', 'home', 'tmdb'].includes(scope)) {
    return jsonResponse({ error: 'Invalid scope' }, corsHeaders, 400);
  }
  const where = scope === 'all' ? ''
    : scope === 'search' ? " WHERE key LIKE 'search/%'"
    : scope === 'home' ? " WHERE key LIKE 'home/%'"
    : " WHERE key LIKE 'tmdb/%'";
  try {
    const { results } = await env.DB.prepare('SELECT key FROM cache_keys' + where).all();
    let deleted = 0;
    let missing = 0;
    let failed = 0;
    for (const row of results) {
      if (deleted + missing + failed >= 500) break;
      try {
        if (await caches.default.delete(new Request(CACHE_HOST + '/' + row.key))) deleted++;
        else missing++;
      } catch (e) { failed++; }
    }
    await env.DB.prepare('DELETE FROM cache_keys' + where).run();
    const stale = await env.DB.prepare("DELETE FROM cache_keys WHERE updated_at < datetime('now', '-1 day')").run();
    return jsonResponse({ success: true, deleted, missing, failed, stale: stale.meta.changes || 0 }, corsHeaders);
  } catch (e) {
    return jsonResponse({ error: 'Purge failed: ' + String(e && e.message || e) }, corsHeaders, 500);
  }
}

// ==================== AUTH ====================
const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;

function toHex(bytes) {
  return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function randHex(n) {
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

async function hashPassword(password, salt) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations: 100000, hash: 'SHA-256' },
    key, 256
  );
  return toHex(bits);
}

async function createSession(userId, env) {
  const token = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, datetime('now', '+30 days'))").bind(token, userId).run();
  return token;
}

async function getSessionUser(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return null;
  const row = await env.DB.prepare(
    "SELECT s.user_id, u.username, u.is_admin FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND (s.expires_at IS NULL OR s.expires_at > datetime('now'))"
  ).bind(token).first();
  return row || null;
}

async function rateLimit(env, request, bucket, limit, windowSec) {
  try {
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const now = Math.floor(Date.now() / 1000);
    const windowStart = now - (now % windowSec);
    const key = bucket + ':' + ip;
    const row = await env.DB.prepare('SELECT attempts FROM rate_limits WHERE key = ? AND window_start = ?').bind(key, windowStart).first();
    const attempts = (row ? row.attempts : 0) + 1;
    if (row) {
      await env.DB.prepare('UPDATE rate_limits SET attempts = ? WHERE key = ? AND window_start = ?').bind(attempts, key, windowStart).run();
    } else {
      await env.DB.prepare('INSERT INTO rate_limits (key, window_start, attempts) VALUES (?, ?, 1)').bind(key, windowStart).run();
    }
    return attempts <= limit;
  } catch (e) {
    return true;
  }
}

async function handleRegister(request, env, corsHeaders) {
  if (!await rateLimit(env, request, 'register', 5, 3600)) {
    return jsonResponse({ error: 'Demasiados registros. Intenta más tarde.' }, corsHeaders, 429);
  }
  let body;
  try { body = await request.json(); } catch (e) { return jsonResponse({ error: 'Invalid body' }, corsHeaders, 400); }
  const username = String(body.username || '').trim();
  const password = String(body.password || '');
  if (!USERNAME_RE.test(username)) return jsonResponse({ error: 'Usuario: 3-20 caracteres alfanuméricos o _' }, corsHeaders, 400);
  if (password.length < 6) return jsonResponse({ error: 'La contraseña debe tener al menos 6 caracteres' }, corsHeaders, 400);
  const exists = await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(username).first();
  if (exists) return jsonResponse({ error: 'Ese nombre de usuario ya está en uso. Prueba iniciar sesión o elige otro.' }, corsHeaders, 409);
  const salt = randHex(16);
  const hash = await hashPassword(password, salt);
  const isAdmin = username.toLowerCase() === String(env.ADMIN_USERNAME || 'kael').toLowerCase() ? 1 : 0;
  const res = await env.DB.prepare('INSERT INTO users (username, password_hash, password_salt, is_admin) VALUES (?, ?, ?, ?)').bind(username, hash, salt, isAdmin).run();
  const token = await createSession(res.meta.last_row_id, env);
  return jsonResponse({ success: true, token, username, isAdmin: isAdmin === 1 }, corsHeaders, 201);
}

async function handleLogin(request, env, corsHeaders) {
  if (!await rateLimit(env, request, 'login', 10, 900)) {
    return jsonResponse({ error: 'Demasiados intentos. Espera unos minutos.' }, corsHeaders, 429);
  }
  let body;
  try { body = await request.json(); } catch (e) { return jsonResponse({ error: 'Invalid body' }, corsHeaders, 400); }
  const username = String(body.username || '').trim();
  const password = String(body.password || '');
  const user = await env.DB.prepare('SELECT * FROM users WHERE username = ?').bind(username).first();
  if (!user) return jsonResponse({ error: 'Usuario o contraseña incorrectos' }, corsHeaders, 401);
  const hash = await hashPassword(password, user.password_salt);
  if (hash !== user.password_hash) return jsonResponse({ error: 'Usuario o contraseña incorrectos' }, corsHeaders, 401);
  const token = await createSession(user.id, env);
  return jsonResponse({ success: true, token, username: user.username, isAdmin: user.is_admin === 1 }, corsHeaders);
}

async function handleLogout(request, env, corsHeaders) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (token) await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
  return jsonResponse({ success: true }, corsHeaders);
}

async function handleMe(request, env, corsHeaders) {
  const user = await getSessionUser(request, env);
  if (!user) return jsonResponse({ error: 'No autorizado' }, corsHeaders, 401);
  return jsonResponse({ username: user.username, isAdmin: user.is_admin === 1 }, corsHeaders);
}

// ==================== SYNC ====================
async function handleSyncAll(request, env, corsHeaders) {
  const user = await getSessionUser(request, env);
  if (!user) return jsonResponse({ error: 'No autorizado' }, corsHeaders, 401);
  const [favs, hist, wl] = await Promise.all([
    env.DB.prepare('SELECT item_id id, type, title, poster FROM user_favorites WHERE user_id = ? ORDER BY created_at DESC').bind(user.user_id).all(),
    env.DB.prepare('SELECT item_id id, type, title, poster, season, episode, position AS posAt, duration AS durAt, anime, updated_at AS ts FROM user_history WHERE user_id = ? ORDER BY updated_at DESC').bind(user.user_id).all(),
    env.DB.prepare('SELECT item_id id, type, title, poster FROM user_watch_later WHERE user_id = ? ORDER BY created_at DESC').bind(user.user_id).all(),
  ]);
  return jsonResponse({ favorites: favs.results, history: hist.results, watch_later: wl.results }, corsHeaders);
}

async function handleSyncAdd(request, env, corsHeaders, kind) {
  const user = await getSessionUser(request, env);
  if (!user) return jsonResponse({ error: 'No autorizado' }, corsHeaders, 401);
  let body;
  try { body = await request.json(); } catch (e) { return jsonResponse({ error: 'Invalid body' }, corsHeaders, 400); }
  const itemId = parseInt(body.item_id ?? body.id, 10);
  const type = body.type === 'tv' ? 'tv' : 'movie';
  if (!itemId || isNaN(itemId)) return jsonResponse({ error: 'Invalid item' }, corsHeaders, 400);
  const title = String(body.title || '').slice(0, 200);
  const poster = String(body.poster || '').slice(0, 300);
  if (kind === 'favorites') {
    await env.DB.prepare('INSERT OR IGNORE INTO user_favorites (user_id, item_id, type, title, poster) VALUES (?, ?, ?, ?, ?)').bind(user.user_id, itemId, type, title, poster).run();
  } else if (kind === 'watch_later') {
    await env.DB.prepare('INSERT OR IGNORE INTO user_watch_later (user_id, item_id, type, title, poster) VALUES (?, ?, ?, ?, ?)').bind(user.user_id, itemId, type, title, poster).run();
  } else {
    const season = parseInt(body.season, 10) || 0;
    const episode = parseInt(body.episode, 10) || 0;
    const position = parseInt(body.posAt ?? body.position, 10) || 0;
    const duration = parseInt(body.durAt ?? body.duration, 10) || 0;
    const anime = body.anime ? 1 : 0;
    await env.DB.prepare('INSERT OR REPLACE INTO user_history (user_id, item_id, type, title, poster, season, episode, position, duration, anime) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(user.user_id, itemId, type, title, poster, season, episode, position, duration, anime).run();
  }
  return jsonResponse({ success: true }, corsHeaders);
}

async function handleSyncRemove(request, env, corsHeaders, kind) {
  const user = await getSessionUser(request, env);
  if (!user) return jsonResponse({ error: 'No autorizado' }, corsHeaders, 401);
  let body;
  try { body = await request.json(); } catch (e) { return jsonResponse({ error: 'Invalid body' }, corsHeaders, 400); }
  const itemId = parseInt(body.item_id ?? body.id, 10);
  const type = body.type === 'tv' ? 'tv' : 'movie';
  if (!itemId || isNaN(itemId)) return jsonResponse({ error: 'Invalid item' }, corsHeaders, 400);
  const table = kind === 'favorites' ? 'user_favorites' : kind === 'watch_later' ? 'user_watch_later' : 'user_history';
  await env.DB.prepare(`DELETE FROM ${table} WHERE user_id = ? AND item_id = ? AND type = ?`).bind(user.user_id, itemId, type).run();
  return jsonResponse({ success: true }, corsHeaders);
}