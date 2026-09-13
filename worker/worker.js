// worker.js - MocchiStream V5 (Catálogo TMDB + reproducción on-demand)

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const CACHE_HOST = 'https://mocchi-cache.internal';
const TMDB_KEY = 'e6333b32409e02a4a6eba6fb7ff866bb';
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
  ['top10global', 'Top 10 Global'], ['top10mexico', 'Top 10 México'],
  ['popular', 'Netflix Popular'], ['top', 'Mejor Calificadas'],
  ['nuevos', 'Estrenos'], ['originales', 'Netflix Originales'],
  ['kdrama', 'K-Drama'], ['anime', 'Anime'],
];

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    const key = env.TMDB_KEY || TMDB_KEY;

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Password'
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
      return handlePlay(url, env, corsHeaders);
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
    if (path === '/api/avatar' && method === 'GET') {
      return handleGetAvatar(env, corsHeaders);
    }

    if (path.startsWith('/api/admin')) {
      const password = request.headers.get('X-Admin-Password');
      if (password !== env.ADMIN_PASSWORD) {
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
    }

    return new Response('Not Found', { status: 404, headers: corsHeaders });
  }
};

// ==================== UTILIDADES ====================
function jsonResponse(data, corsHeaders, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders }
  });
}

const PRIVATE_HOST_RE = /(?:^|\.)(?:local|internal|localhost|lan)$|^(?:10\.|127\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|100\.(?:6[4-9]|[7-9]\d)\.|0\.)/i;

const STREAM_ALLOWED_HOSTS = [
  'vimeos.net', 'vimeos.zip', 'goodstream.one', 'hlswish.com', 'uqload.*', 'fastream.to',
  'doodstream.com', 'dooood.com', 'doods.pro', 'dood.la', 'd0000d.com', 'd000d.com',
  'ds2play.com', 'ds2video.com', 'myvidplay.com', 'playmogo.com', 'dood.video',
  'byse.com', 'byse.sx', 'streamtape.com', 'streamtape.net', 'streamtape.xyz',
  'watchadsontape.com', 'shavetape.cash', 'vide0.net', 'filelions.live', 'filelions.online',
  'filelions.to', 'embed69.org', 'xupalace.org', 'hglink.to', 'premilkyway.com',
  'savefiles.com', 'mwish.pro', 'dwish.pro', 'embedwish.com', 'wishembed.pro',
  'kswplayer.info', 'wishfast.top', 'streamwish.site', 'sfastwish.com', 'strwish.xyz',
  'voe.sx', 'videoapp.zip', 'vidhidepro.com', 'morencius.com', 'minochinos.com',
  'acek-cdn.com', 'dramiyos-cdn.com', 'cloudatacdn.com', 'pelispedia.is', 'pelispedia.mov',
  'cinecalidad.am', 'cinecalidad.ec', 'cinecalidad.run', 'seriesmetro.net', 'monoschinos.st',
  'latanime.org', 'ok.ru', 'mp4upload.com',
];

const SITE_ALLOWED_HOSTS = [
  'cinecalidad.am', 'cinecalidad.ec', 'cinecalidad.run', 'pelispedia.is', 'pelispedia.mov',
  'pelispedia.ink', 'seriesmetro.net', 'monoschinos.st', 'latanime.org',
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

const adminAttempts = new Map();
function adminRateLimited(ip) {
  const now = Date.now();
  let record = adminAttempts.get(ip);
  if (!record || now > record.reset) {
    record = { count: 0, reset: now + 15 * 60 * 1000 };
    adminAttempts.set(ip, record);
  }
  record.count++;
  return record.count > 10;
}

async function fetchHTML(url, timeout = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
      },
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
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
  const cacheKey = 'tmdb/' + path + '?' + qs;
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
  return {
    id: r.id,
    type: isTv ? 'tv' : 'movie',
    title,
    year: parseInt((r.release_date || r.first_air_date || '').slice(0, 4)) || null,
    poster: imgUrl(r.poster_path, 'w342'),
    backdrop: imgUrl(r.backdrop_path, 'w780'),
    score: r.vote_average ? Math.round(r.vote_average * 10) / 10 : null,
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

async function fetchTop10(url, env, key) {
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
      return fetchTop10('https://www.netflix.com/tudum/top10', env, key);
    case 'top10mexico':
      return fetchTop10('https://www.netflix.com/tudum/top10/mexico', env, key);
    case 'popular':
      return discover('movie', page, {}, env, key).then(m => discover('tv', page, {}, env, key).then(t => m.concat(t)));
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
    const cacheKey = `home/v9/${section}/${page}`;
    const hit = await cacheGet(cacheKey);
    if (hit) return hit;
    try {
      const items = await homeSection(section, page, env, key);
      return cachePut(cacheKey, items, 86400, corsHeaders, env);
    } catch (e) {
      return jsonResponse([], corsHeaders);
    }
  }

  const cacheKey = 'home/v9';
  const hit = await cacheGet(cacheKey);
  if (hit) return hit;

  const sections = [];
  const seen = new Set();
  const results = await Promise.allSettled(
    HOME_SECTIONS.slice(0, 3).map(async ([slug, title]) => {
        try {
          const items = await homeSection(slug, 1, env, key);
          return { slug, title, items: items.filter(it => {
            const k = it.type + '|' + it.id;
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
          }) };
        } catch (e) {
          return { slug, title, items: [] };
        }
      })
  );
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value.items.length) sections.push(r.value);
  }
  return cachePut(cacheKey, { sections }, 86400, corsHeaders, env);
}

async function handleSearch(query, env, corsHeaders, key) {
  const cacheKey = 'search/v6/' + encodeURIComponent(query.trim().toLowerCase());
  const hit = await cacheGet(cacheKey);
  if (hit) return hit;
  try {
    const [movies, series] = await Promise.all([
      tmdbGet('/search/movie', { query }, env, key, 3600),
      tmdbGet('/search/tv', { query }, env, key, 3600),
    ]);
    const seen = new Set();
    const items = [];
    for (const r of [...(movies.results || []), ...(series.results || [])]) {
      const it = toItem(r, false);
      if (!it) continue;
      const k = it.type + '|' + it.id;
      if (seen.has(k)) continue;
      seen.add(k);
      items.push(it);
    }
    items.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    return cachePut(cacheKey, items, 3600, corsHeaders, env);
  } catch (e) {
    return jsonResponse([], corsHeaders);
  }
}

async function handleDetails(id, type, env, corsHeaders, key) {
  const cacheKey = `details/v2/${type}/${id}`;
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
      anime: type === 'tv' && d.original_language === 'ja' && (d.genres || []).some(g => g.id === 16),
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
    return cachePut(cacheKey, item, 604800, corsHeaders, env);
  } catch (e) {
    return jsonResponse({ error: e.message }, corsHeaders, 500);
  }
}

// ==================== REPRODUCCIÓN ON-DEMAND ====================
const FAST_PRIORITY = [
  /vimeos\.(?:net|zip)/i, /goodstream\.one/i, /fastream\.to/i, /hlswish\.com/i,
  /doodstream\.com|dooood\.com|doods\.pro|dood\.la|d0000d\.com|d000d\.com/i,
  /uqload\.[a-z]+/i,
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

function extractCinecalidadItems(html) {
  const items = [];
  const re = /<article[^>]*class="[^"]*item movies[^"]*"[^>]*>([\s\S]*?)<\/article>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const block = m[1];
    const href = block.match(/<a[^>]*href="([^"]*\/ver-(?:pelicula|serie)\/[^"]*)"/i);
    if (!href) continue;
    const title = block.match(/class="in_title"[^>]*>\s*([^<]+)</i);
    if (!title) continue;
    const year = block.match(/<p>(\d{4})<\/p>/);
    const type = /\/ver-serie\//.test(href[1]) ? 'tv' : 'movie';
    items.push({
      title: decodeEntities(title[1]).trim(),
      url: href[1],
      type,
      year: year ? parseInt(year[1]) : null,
    });
  }
  return items;
}

function cinecalidadEmbeds(html) {
  return [...html.matchAll(/data-option="([^"]+)"/gi)]
    .map(m => decodeEntities(m[1]))
    .filter(u => /^https?:/.test(u));
}

function cinecalidadEpisodeLinks(html) {
  const links = [];
  const re = /href="([^"]*\/ver-el-episodio\/([^"]*?)-(\d+)x(\d+)\/?)"/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    links.push({ url: m[1], season: parseInt(m[3]), episode: parseInt(m[4]) });
  }
  return links;
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
      url: link[1].startsWith('/') ? 'https://pelispedia.is' + link[1] : link[1],
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

function monoschinosEmbeds(html) {
  return [...html.matchAll(/data-player="([^"]+)"/gi)]
    .map(m => {
      try {
        const fixed = m[1].replace(/-/g, '+').replace(/_/g, '/');
        return atob(fixed + '='.repeat((4 - fixed.length % 4) % 4));
      } catch (e) { return ''; }
    })
    .filter(u => /^https?:/.test(u));
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

function latanimeEmbeds(html) {
  return [...html.matchAll(/data-player="([^"]+)"/gi)]
    .map(m => {
      try {
        const fixed = m[1].replace(/-/g, '+').replace(/_/g, '/');
        return atob(fixed + '='.repeat((4 - fixed.length % 4) % 4));
      } catch (e) { return ''; }
    })
    .filter(u => /^https?:/.test(u));
}

const SITES = {
  movies: [
    {
      name: 'Cinecalidad',
      searchUrl: q => `https://www.cinecalidad.am/?s=${encodeURIComponent(q)}`,
      parse: extractCinecalidadItems,
      embeds: cinecalidadEmbeds,
      episodeLinks: cinecalidadEpisodeLinks,
      hasEpisodes: false,
    },
    {
      name: 'Pelispedia',
      searchUrl: q => `https://pelispedia.is/?s=${encodeURIComponent(q)}`,
      parse: extractPelispediaItems,
      embeds: pelispediaEmbeds,
      episodeUrl: (base, season, episode) => {
        const slug = base.replace(/\/+$/, '').split('/').pop();
        return `https://pelispedia.is/temporada/${season}/capitulo/${episode}/`;
      },
      hasEpisodes: true,
    },
    {
      name: 'SeriesMetro',
      searchUrl: q => `https://www3.seriesmetro.net/?s=${encodeURIComponent(q)}`,
      parse: extractPelispediaItems,
      embeds: pelispediaEmbeds,
      episodeUrl: (base, season, episode) => {
        const slug = base.replace(/\/+$/, '').split('/').pop();
        return `https://www3.seriesmetro.net/temporada/${season}/capitulo/${episode}/`;
      },
      hasEpisodes: true,
    },
  ],
  anime: [
    {
      name: 'Monoschinos',
      searchUrl: q => `https://monoschinos.st/buscar?q=${encodeURIComponent(q)}`,
      parse: extractMonoschinosItems,
      embeds: monoschinosEmbeds,
      episodeUrl: (base, season, episode) => {
        const slug = base.replace(/\/+$/, '').split('/').pop();
        return `https://monoschinos.st/ver/${slug}-episodio-${episode}`;
      },
      hasEpisodes: true,
    },
    {
      name: 'LaTAnime',
      searchUrl: q => `https://latanime.org/buscar?q=${encodeURIComponent(q)}`,
      parse: extractLatanimeItems,
      embeds: latanimeEmbeds,
      episodeUrl: (base, season, episode) => {
        const slug = base.replace(/\/+$/, '').split('/').pop();
        return `https://latanime.org/ver/${slug}-episodio-${episode}`;
      },
      hasEpisodes: true,
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
  if (hostResult && (await verifyStream(hostResult))) {
    return { ...hostResult, sourceUrl: embedUrl };
  }
  if (Date.now() > deadline) return null;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (Date.now() > deadline) return null;
    let result = null;
    try {
      result = await extractOnce(embedUrl, deadline);
    } catch (e) {}
    if (result && (await verifyStream(result))) {
      return { ...result, sourceUrl: embedUrl };
    }
  }
  return null;
}

async function trySite(site, query, season, episode, deadline) {
  if (Date.now() > deadline) return { fast: null, iframe: null };
  let items = [];
  try {
    const html = await fetchHTML(site.searchUrl(query), 8000);
    items = site.parse(html);
  } catch (e) {
    return { fast: null, iframe: null };
  }
  const q = normTitle(query);
  const match = items.find(it => normTitle(it.title) === q)
    || items.find(it => normTitle(it.title).includes(q) || q.includes(normTitle(it.title)));
  if (!match) return { fast: null, iframe: null };

  let embeds = [];
  try {
    let target = pickEpisodeUrl(site, match, season, episode);
    let html = await fetchHTML(target, 8000);
    if (season && episode && site.episodeLinks) {
      const ep = site.episodeLinks(html).find(l => l.season === season && l.episode === episode);
      if (ep) html = await fetchHTML(ep.url, 8000);
    }
    embeds = site.embeds(html);
  } catch (e) {
    return { fast: null, iframe: null };
  }
  if (!embeds.length) return { fast: null, iframe: null };

  const sorted = sortEmbeds(embeds);
  const firstIframe = sorted.find(u => fastRank(u) === -1) || null;
  for (const u of sorted) {
    if (fastRank(u) === -1) break;
    const result = await resolveEmbed(u, deadline);
    if (result) return { fast: result, iframe: null };
    if (Date.now() > deadline) break;
  }
  return { fast: null, iframe: firstIframe };
}

async function handlePlay(url, env, corsHeaders) {
  const title = (url.searchParams.get('title') || '').trim();
  const year = url.searchParams.get('year');
  const type = url.searchParams.get('type') === 'tv' ? 'tv' : 'movie';
  const season = parseInt(url.searchParams.get('season')) || null;
  const episode = parseInt(url.searchParams.get('episode')) || null;
  const anime = url.searchParams.get('anime') === '1';
  if (!title) return jsonResponse({ error: 'Missing title' }, corsHeaders, 400);

  const sites = anime ? SITES.anime : SITES.movies;
  const deadline = Date.now() + (season ? 16000 : 12000);
  const query = year ? `${title} ${year}` : title;

  let fallbackIframe = null;
  const results = await mapLimit(sites, sites.length, async site => {
    const r = await trySite(site, query, season, episode, deadline);
    if (r.iframe && !fallbackIframe) fallbackIframe = r.iframe;
    return r.fast;
  });
  const winner = results.find(Boolean);
  if (winner) {
    return jsonResponse({ ok: true, ...winner }, corsHeaders);
  }
  if (fallbackIframe) {
    return jsonResponse({ ok: false, iframe: fallbackIframe }, corsHeaders);
  }
  return jsonResponse({ ok: false }, corsHeaders);
}

// ==================== REPRODUCTOR PROPIO ====================
const STREAM_HOSTS = [
  { re: /(?:doodstream\.com|dooood\.com|doods\.pro|dood\.(?:la|to|so|ws|yt|li|wf|cx|sh|pm|watch|video)|d0000d\.com|d000d\.com|ds2play\.com|ds2video\.com|myvidplay\.com|playmogo\.com)/i, fn: extractDoodstream },
  { re: /byse\w*\.(?:com|sx)/i, fn: extractByse },
  { re: /(?:streamtape\.(?:com|net|xyz)|watchadsontape\.com|shavetape\.cash)/i, fn: extractStreamTape },
  { re: /(?:hglink\.to|savefiles\.com|mwish\.pro|dwish\.pro|embedwish\.com|wishembed\.pro|kswplayer\.info|wishfast\.top|streamwish\.site|sfastwish\.com|strwish\w*\.\w+|streamwish\.to)/i, fn: extractStreamWish },
];

function b64UrlDecode(str) {
  const fixed = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = (4 - (fixed.length % 4)) % 4;
  const raw = atob(fixed + '='.repeat(pad));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

async function fetchFollow(url, timeout = 8000) {
  if (!assertSafeUrl(url)) throw new Error('URL no permitida');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
      },
      redirect: 'follow',
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return { url: response.url, text: await response.text() };
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

async function extractDoodstream(url) {
  const embedUrl = url.replace('/d/', '/e/');
  const { url: finalUrl, text: html } = await fetchFollow(embedUrl, STREAM_TIMEOUT);
  const host = new URL(finalUrl).origin;
  const md5Match = html.match(/\/pass_md5\/([0-9a-zA-Z]+)/);
  if (!md5Match) return null;
  const md5Url = host + '/pass_md5/' + md5Match[1];
  const res = await fetch(md5Url, {
    headers: { 'User-Agent': USER_AGENT, 'Referer': finalUrl },
    redirect: 'follow'
  });
  if (!res.ok) return null;
  const videoUrl = (await res.text()).trim();
  if (!videoUrl.startsWith('http')) return null;
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let random = '';
  for (let i = 0; i < 10; i++) random += alphabet[Math.floor(Math.random() * alphabet.length)];
  const hash = md5Match[0].split('/').pop();
  return { type: 'mp4', url: `${videoUrl}${random}?token=${hash}`, referer: finalUrl };
}

async function extractByse(url) {
  const base = new URL(url).origin;
  const code = new URL(url).pathname.replace(/\/+$/, '').split('/').pop();
  const detailsRes = await fetch(`${base}/api/videos/${code}/embed/details`, {
    headers: { 'User-Agent': USER_AGENT }
  });
  if (!detailsRes.ok) return null;
  const details = await detailsRes.json();
  const embedFrameUrl = details.embed_frame_url;
  if (!embedFrameUrl) return null;
  const embedBase = new URL(embedFrameUrl).origin;
  const ecode = new URL(embedFrameUrl).pathname.replace(/\/+$/, '').split('/').pop();
  const playbackRes = await fetch(`${embedBase}/api/videos/${ecode}/embed/playback`, {
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
  if (!playback || !playback.key_parts) return null;
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
  const idx = input.indexOf('eval(function(p,a,c,k,e,d)');
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
  const argsMatch = input.slice(j + 1).match(/^\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'([^']*)'\.split\('\|'\)\)/);
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
    const redirectMatch = html.match(/window\.location\.(?:href|replace)\s*=\s*['"]([^'"]+)['"]/i);
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
  if (!result || result.type !== 'hls') return true;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);
  try {
    const headers = { 'User-Agent': USER_AGENT, 'Accept': '*/*' };
    if (result.referer) headers['Referer'] = result.referer;
    const res = await fetch(result.url, { headers, redirect: 'follow', signal: controller.signal });
    if (!res.ok) return false;
    const text = await res.text();
    if (!text.trimStart().startsWith('#EXTM3U')) return false;
    if (/#EXT-X-STREAM-INF/i.test(text)) return true;
    const segMatch = text.match(/#EXTINF:[^,\n]+,?\s*\n\s*([^\s#][^\n]*)/);
    if (!segMatch) return true;
    const segUrl = new URL(segMatch[1], result.url).href;
    const segController = new AbortController();
    const segTimer = setTimeout(() => segController.abort(), 3000);
    try {
      const segRes = await fetch(segUrl, { headers, redirect: 'follow', signal: segController.signal });
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
    } finally {
      clearTimeout(segTimer);
    }
  } catch (e) {
    return false;
  } finally {
    clearTimeout(timer);
  }
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
      await caches.default.delete(new Request(CACHE_HOST + '/' + cacheKey));
      if (env && env.DB) {
        await env.DB.prepare('DELETE FROM cache_keys WHERE key = ?').bind(cacheKey).run().catch(() => {});
      }
    }
    const hostResult = await tryHostExtractors(targetUrl);
    if (hostResult) {
      if (await verifyStream(hostResult)) {
        return cachePut(cacheKey, { ok: true, ...hostResult }, 300, corsHeaders, env);
      }
      return jsonResponse({ ok: false }, corsHeaders);
    }
    const deadline = Date.now() + 15000;
    for (let attempt = 0; attempt < 4; attempt++) {
      if (Date.now() > deadline) break;
      let result = null;
      try {
        result = await extractOnce(targetUrl, deadline);
      } catch (e) {}
      if (result && (await verifyStream(result))) {
        return cachePut(cacheKey, { ok: true, ...result }, 300, corsHeaders, env);
      }
      if (attempt < 3 && Date.now() < deadline) await new Promise(r => setTimeout(r, 500));
    }
    return jsonResponse({ ok: false }, corsHeaders);
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message }, corsHeaders);
  }
}

async function fetchM3U8WithRetry(targetUrl, ref) {
  const headers = {
    'User-Agent': USER_AGENT,
    'Accept': '*/*',
  };
  if (ref) headers['Referer'] = ref;
  for (let attempt = 0; attempt < 3; attempt++) {
    let res;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      res = await fetch(targetUrl, { headers, redirect: 'follow', signal: controller.signal });
    } catch (err) {
      clearTimeout(timer);
      await new Promise(r => setTimeout(r, 600 * (attempt + 1)));
      continue;
    }
    clearTimeout(timer);
    if (!res.ok) {
      await new Promise(r => setTimeout(r, 600 * (attempt + 1)));
      continue;
    }
    const text = await res.text();
    if (!text.trimStart().startsWith('#EXTM3U')) {
      await new Promise(r => setTimeout(r, 600 * (attempt + 1)));
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
  return jsonResponse({ error: 'Upstream no devolvió un manifiesto válido' }, { 'Access-Control-Allow-Origin': '*' }, 502);
}

async function handleProxy(targetUrl, reqUrl, request, corsHeaders) {
  if (!assertSafeUrl(targetUrl, STREAM_ALLOWED_HOSTS)) {
    return jsonResponse({ error: 'URL no permitida' }, corsHeaders, 403);
  }
  const ref = reqUrl.searchParams.get('ref') || '';
  const range = request.headers.get('Range') || '';
  if (/\.(?:m3u8|txt)([?#]|$)/i.test(targetUrl)) {
    return fetchM3U8WithRetry(targetUrl, ref);
  }
  const headers = {
    'User-Agent': USER_AGENT,
    'Accept': '*/*',
  };
  if (ref) headers['Referer'] = ref;
  if (range) headers['Range'] = range;

  for (let attempt = 0; attempt < 3; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch(targetUrl, { headers, redirect: 'follow', signal: controller.signal });
      clearTimeout(timer);
      if ((res.status === 403 || res.status === 429 || res.status >= 500) && attempt < 2) {
        await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
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
      clearTimeout(timer);
      if (attempt < 2) {
        await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
        continue;
      }
      return jsonResponse({ error: err.message }, corsHeaders, 502);
    }
  }
}

// ==================== ADMIN ====================
async function handleGetAvatar(env, corsHeaders) {
  const { results } = await env.DB.prepare('SELECT value FROM config WHERE key = ?').bind('avatar').all();
  const avatar = results.length ? results[0].value : '';
  return jsonResponse({ avatar }, corsHeaders);
}

async function handleUpdateAvatar(request, env, corsHeaders) {
  const { avatar } = await request.json();
  await env.DB.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)').bind('avatar', avatar).run();
  return jsonResponse({ success: true }, corsHeaders);
}

async function handleDeleteAvatar(env, corsHeaders) {
  await env.DB.prepare('UPDATE config SET value = ? WHERE key = ?').bind('', 'avatar').run();
  return jsonResponse({ success: true }, corsHeaders);
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
  const { scope } = await request.json();
  if (!['all', 'search', 'home', 'tmdb'].includes(scope)) {
    return jsonResponse({ error: 'Invalid scope' }, corsHeaders, 400);
  }
  const where = scope === 'all' ? ''
    : scope === 'search' ? " WHERE key LIKE 'search/%'"
    : scope === 'home' ? " WHERE key LIKE 'home/%'"
    : " WHERE key LIKE 'tmdb/%'";
  const { results } = await env.DB.prepare('SELECT key FROM cache_keys' + where).all();
  let deleted = 0;
  for (const row of results) {
    await caches.default.delete(new Request(CACHE_HOST + '/' + row.key));
    deleted++;
  }
  await env.DB.prepare('DELETE FROM cache_keys' + where).run();
  const stale = await env.DB.prepare("DELETE FROM cache_keys WHERE updated_at < datetime('now', '-1 day')").run();
  return jsonResponse({ success: true, deleted, stale: stale.meta.changes || 0 }, corsHeaders);
}