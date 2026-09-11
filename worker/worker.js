// worker.js - MocchiStream (PelisplusHD + Cuevana) - V3

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const CINECALIDAD_URL = 'https://www.cinecalidad.am';
const CUEVANA_URL = 'https://wv3.cuevana3.eu';
const PHD_URL = 'https://pelisplushd.bz';
const PAGE_SIZE = 60;
const CACHE_SEARCH_TTL = 300;
const CACHE_MAIN_TTL = 300;
const D1_CHUNK = 80;
const CACHE_HOST = 'https://mocchi-cache.internal';

const GENRE_SECTIONS = [
  ['accion', 'Acción'],
  ['terror', 'Terror'],
  ['animacion', 'Animación'],
  ['ciencia-ficcion', 'Ciencia ficción'],
  ['comedia', 'Comedia'],
  ['romance', 'Romance'],
];

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Password'
    };

    if (method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    if (path === '/api/search' && method === 'GET') {
      const query = url.searchParams.get('q');
      const page = parseInt(url.searchParams.get('page')) || 1;
      if (!query) return jsonResponse({ error: 'Missing query' }, corsHeaders, 400);
      return handleSearch(query, page, env, corsHeaders, url.searchParams.get('source') || '');
    }

    if (path === '/api/mainpage' && method === 'GET') {
      return handleMainPage(url, env, corsHeaders);
    }

    if (path === '/api/details' && method === 'GET') {
      const targetUrl = url.searchParams.get('url');
      if (!targetUrl) return jsonResponse({ error: 'Missing url' }, corsHeaders, 400);
      return handleDetails(targetUrl, corsHeaders, env);
    }

    if (path === '/api/links' && method === 'GET') {
      const targetUrl = url.searchParams.get('url');
      if (!targetUrl) return jsonResponse({ error: 'Missing url' }, corsHeaders, 400);
      return handleLinks(targetUrl, corsHeaders, env);
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

    if (path === '/api/metadata' && method === 'GET') {
      const externalUrl = url.searchParams.get('url');
      if (!externalUrl) return jsonResponse({ error: 'Missing url' }, corsHeaders, 400);
      return handleGetMetadata(externalUrl, env, corsHeaders);
    }

    if (path === '/api/metadata/bycategory' && method === 'GET') {
      const category = url.searchParams.get('cat');
      if (!category) return jsonResponse({ error: 'Missing category' }, corsHeaders, 400);
      return handleGetByCategory(category, env, corsHeaders);
    }

    if (path === '/api/categories' && method === 'GET') {
      return handleGetCategories(env, corsHeaders);
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

      if (path === '/api/admin/metadata' && method === 'POST') {
        return handleSaveMetadata(request, env, corsHeaders);
      }
      if (path === '/api/admin/metadata' && method === 'DELETE') {
        const externalUrl = url.searchParams.get('url');
        if (!externalUrl) return jsonResponse({ error: 'Missing url' }, corsHeaders, 400);
        return handleDeleteMetadata(externalUrl, env, corsHeaders);
      }
      if (path === '/api/admin/metadata/all' && method === 'GET') {
        return handleGetAllMetadata(env, corsHeaders);
      }
      if (path === '/api/admin/episodes' && method === 'GET') {
        const seriesUrl = url.searchParams.get('url');
        if (!seriesUrl) return jsonResponse({ error: 'Missing url' }, corsHeaders, 400);
        return handleListEpisodes(seriesUrl, env, corsHeaders);
      }
      if (path === '/api/admin/episodes' && method === 'POST') {
        return handleUpsertEpisode(request, env, corsHeaders);
      }
      if (path === '/api/admin/episodes' && method === 'DELETE') {
        return handleDeleteEpisode(url, env, corsHeaders);
      }
      if (path === '/api/admin/avatar') {
        if (method === 'GET') return handleGetAvatar(env, corsHeaders);
        if (method === 'POST') return handleUpdateAvatar(request, env, corsHeaders);
        if (method === 'DELETE') return handleDeleteAvatar(env, corsHeaders);
      }
      if (path === '/api/admin/stats' && method === 'GET') {
        return handleAdminStats(env, corsHeaders);
      }
      if (path === '/api/admin/cache/purge' && method === 'POST') {
        return handleCachePurge(request, env, corsHeaders);
      }
      if (path === '/api/admin/category/rename' && method === 'POST') {
        return handleCategoryRename(request, env, corsHeaders);
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

const PROVIDER_ALLOWED_HOSTS = ['pelisplushd.bz', 'cuevana3.eu', 'cinecalidad.am'];

const STREAM_ALLOWED_HOSTS = [
  'vimeos.net', 'goodstream.one', 'hlswish.com', 'uqload.*', 'vidhidepro.com', 'morencius.com',
  'streamwish.to', 'filemoon.sx', 'watchsb.com', 'lulustream.com', 'dood.la', 'doodstream.com',
  'dooood.com', 'doods.pro', 'd0000d.com', 'd000d.com', 'ds2play.com', 'ds2video.com',
  'myvidplay.com', 'playmogo.com', 'dood.video', 'byse.com', 'byse.sx', 'streamtape.com',
  'streamtape.net', 'streamtape.xyz', 'watchadsontape.com', 'shavetape.cash', 'vide0.net',
  'minochinos.com', 'acek-cdn.com', 'dramiyos-cdn.com', 'cloudatacdn.com', 'filelions.live',
  'filelions.online', 'filelions.to', 'embed69.org', 'xupalace.org', 'hglink.to',
  'premilkyway.com', 'pelisplushd.bz', 'cuevana3.eu', 'cinecalidad.am'
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

async function invalidateMainPage(env) {
  await caches.default.delete(new Request(`${CACHE_HOST}/home/v8`));
  if (env && env.DB) {
    await env.DB.prepare("DELETE FROM cache_keys WHERE key = 'home/v8'").run().catch(() => {});
  }
}

async function invalidateDetails(url, env) {
  const key = 'details/v1/' + encodeURIComponent(url);
  await caches.default.delete(new Request(CACHE_HOST + '/' + key));
  if (env && env.DB) {
    await env.DB.prepare('DELETE FROM cache_keys WHERE key = ?').bind(key).run().catch(() => {});
  }
}

function normTitle(t) {
  return String(t || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s*\((?:19|20)\d{2}\)\s*/g, ' ')
    .replace(/\b(?:19|20)\d{2}\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function combineItems(phdHtml, cueHtml, cineHtml, opts = {}) {
  const { filterAnime = false } = opts;
  const phd = phdHtml ? dedupItems(extractPelisplusHDItems(phdHtml)) : [];
  const cue = cueHtml ? dedupItems(extractCuevanaItems(cueHtml)) : [];
  const cine = cineHtml ? dedupItems(extractCinecalidadItems(cineHtml)) : [];
  const seen = new Set();
  const out = [];
  for (const it of [...phd, ...cue, ...cine]) {
    if (filterAnime && /\/animes?\//.test(String(it.url || ''))) continue;
    const k = normTitle(it.title);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(it);
  }
  return out;
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

function fixHostsLinks(url) {
  return url
    .replace(/^https:\/\/hglink\.to/, 'https://streamwish.to')
    .replace(/^https:\/\/swdyu\.com/, 'https://streamwish.to')
    .replace(/^https:\/\/cybervynx\.com/, 'https://streamwish.to')
    .replace(/^https:\/\/dumbalag\.com/, 'https://streamwish.to')
    .replace(/^https:\/\/mivalyo\.com/, 'https://vidhidepro.com')
    .replace(/^https:\/\/dinisglows\.com/, 'https://vidhidepro.com')
    .replace(/^https:\/\/dhtpre\.com/, 'https://vidhidepro.com')
    .replace(/^https:\/\/filemoon\.link/, 'https://filemoon.sx')
    .replace(/^https:\/\/sblona\.com/, 'https://watchsb.com')
    .replace(/^https:\/\/lulu\.st/, 'https://lulustream.com')
    .replace(/^https:\/\/uqload\.io/, 'https://uqload.com')
    .replace(/^https:\/\/do7go\.com/, 'https://dood.la');
}

// ==================== PROVEEDOR 1: CINECALIDAD ====================
const CINE_DEAD_HOSTS = /(?:voe\.sx|filemoon\.sx|youtube\.com|nicolehappyoutside\.com)/i;

function extractCinecalidadItems(html) {
  const items = [];
  const itemRegex = /<article[^>]*class="[^"]*item[^"]*"[^>]*>([\s\S]*?)<\/article>/gi;
  let match;
  while ((match = itemRegex.exec(html)) !== null) {
    const block = match[1];
    const titleMatch = block.match(/<div[^>]*class="[^"]*in_title[^"]*"[^>]*>([^<]*)<\/div>/i);
    const linkMatch = block.match(/<a[^>]*href="([^"]*)"[^>]*>/i);
    let poster = null;
    const imgMatch = block.match(/<img[^>]*(?:data-src|src)="([^"]*)"[^>]*>/i);
    if (imgMatch) {
      let imgUrl = decodeEntities(imgMatch[1]);
      if (imgUrl.startsWith('//')) imgUrl = 'https:' + imgUrl;
      else if (imgUrl.startsWith('/')) imgUrl = CINECALIDAD_URL + imgUrl;
      if (!imgUrl.includes('.svg') && !imgUrl.startsWith('data:')) poster = imgUrl;
    }
    if (titleMatch && linkMatch) {
      let link = linkMatch[1];
      if (link.startsWith('/')) link = CINECALIDAD_URL + link;
      if (!/\/ver-pelicula\/|\/ver-serie\//.test(link)) continue;
      items.push({
        title: decodeEntities(titleMatch[1]).trim(),
        url: link,
        poster,
        category: getCategoryFromCinecalidadUrl(link),
        source: 'Cinecalidad',
        external: true,
      });
    }
  }
  return items;
}

function getCategoryFromCinecalidadUrl(url) {
  const match = url.match(/\/genero-de-la-pelicula\/([^\/]+)/);
  if (match) return match[1].replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  return 'Estrenos';
}

async function getCinecalidadDetails(targetUrl) {
  const html = await fetchHTML(targetUrl);
  const brandMatch = html.match(/<h1[^>]*class="[^"]*h1titlecc[^"]*"[^>]*>([^<]*)<\/h1>/i);
  const brandName = brandMatch ? brandMatch[1].trim().toLowerCase() : 'cinecalidad';
  let title = '';
  const h1Regex = /<h1[^>]*>([^<]*)<\/h1>/gi;
  let h1Match;
  while ((h1Match = h1Regex.exec(html)) !== null) {
    const candidate = h1Match[1].trim();
    if (candidate && candidate.toLowerCase() !== brandName) {
      title = candidate;
      break;
    }
  }
  const descMatch = html.match(/<div[^>]*class="[^"]*single_left[^"]*"[^>]*>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i);
  let poster = null;
  const posterMatch = html.match(/<img[^>]*(?:data-src|src)="([^"]*)"[^>]*class="[^"]*alignnone[^"]*"[^>]*>/i);
  if (posterMatch) {
    let imgUrl = decodeEntities(posterMatch[1]);
    if (imgUrl.startsWith('//')) imgUrl = 'https:' + imgUrl;
    else if (imgUrl.startsWith('/')) imgUrl = CINECALIDAD_URL + imgUrl;
    if (!imgUrl.includes('.svg') && !imgUrl.startsWith('data:')) poster = imgUrl;
  }

  const isMovie = targetUrl.includes('/ver-pelicula/');
  title = title || 'Sin título';
  const description = descMatch
    ? decodeEntities(descMatch[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')).trim()
    : '';

  if (isMovie) {
    return { type: 'movie', title, description, poster, url: targetUrl, external: true, source: 'Cinecalidad' };
  }

  const episodes = [];
  const epRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  let epMatch;
  while ((epMatch = epRegex.exec(html)) !== null) {
    const block = epMatch[1];
    if (!/episodiotitle/i.test(block)) continue;
    const aMatch = block.match(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!aMatch) continue;
    const name = decodeEntities(aMatch[2].replace(/<[^>]*>/g, '')).trim();
    const seasonEpMatch = block.match(/S(\d+)\s*-\s*E(\d+)/i);
    const season = seasonEpMatch ? parseInt(seasonEpMatch[1]) : null;
    const episode = seasonEpMatch ? parseInt(seasonEpMatch[2]) : null;
    const imgMatch = block.match(/<img[^>]*(?:data-src|src)="([^"]*)"[^>]*>/i);
    let epPoster = null;
    if (imgMatch && !imgMatch[1].includes('svg') && !imgMatch[1].startsWith('data:')) epPoster = imgMatch[1];
    episodes.push({
      name,
      link: aMatch[1],
      season,
      episode,
      poster: epPoster,
    });
  }
  return {
    type: 'series',
    title,
    description,
    poster,
    episodes,
    url: targetUrl,
    external: true,
    source: 'Cinecalidad'
  };
}

async function getCinecalidadLinks(targetUrl) {
  const html = await fetchHTML(targetUrl);
  const links = [];
  const linkRegex = /<li[^>]*data-option="([^"]*)"[^>]*>/gi;
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    links.push(fixHostsLinks(match[1]));
  }
  if (links.length === 0) {
    const firstEp = html.match(/href="([^"]*ver-el-episodio\/[^"]*)"/i);
    if (firstEp) {
      try {
        const epHtml = await fetchHTML(firstEp[1]);
        while ((match = linkRegex.exec(epHtml)) !== null) {
          links.push(fixHostsLinks(match[1]));
        }
      } catch (e) {}
    }
  }
  const seen = new Set();
  return links.filter(u => {
    if (CINE_DEAD_HOSTS.test(u)) return false;
    if (seen.has(u)) return false;
    seen.add(u);
    return true;
  });
}

// ==================== PROVEEDOR 2: CUEVANA ====================
function extractCuevanaItems(html) {
  const items = [];
  const itemRegex = /<li[^>]*class="[^"]*TPostMv[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;
  let match;
  while ((match = itemRegex.exec(html)) !== null) {
    const block = match[1];
    const titleMatch = block.match(/<span[^>]*class="[^"]*Title[^"]*"[^>]*>([^<]*)<\/span>/i);
    const linkMatch = block.match(/<a[^>]*href="([^"]*)"[^>]*>/i);
    let poster = null;
    const imgMatch = block.match(/<img[^>]*src="([^"]*)"[^>]*>/i);
    if (imgMatch) {
      let imgUrl = decodeEntities(imgMatch[1]);
      if (imgUrl.startsWith('//')) imgUrl = 'https:' + imgUrl;
      else if (imgUrl.startsWith('/')) imgUrl = CUEVANA_URL + imgUrl;
      poster = imgUrl;
    }
    if (titleMatch && linkMatch) {
      let link = linkMatch[1];
      if (link.startsWith('/')) link = CUEVANA_URL + link;
      if (!/\/ver-pelicula\/|\/ver-serie\//.test(link)) continue;
      items.push({
        title: decodeEntities(titleMatch[1]).trim(),
        url: link,
        poster: poster,
        category: 'Estrenos',
        source: 'Cuevana',
        external: true,
      });
    }
  }
  return items;
}

// ==================== PROVEEDOR 3: PELISPLUSHD ====================
function extractPelisplusHDItems(html) {
  const items = [];
  const cardRegex = /<a([^>]*class="Posters-link[^"]*"[^>]*)>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = cardRegex.exec(html)) !== null) {
    const attrs = match[1];
    const block = match[2];
    const hrefMatch = attrs.match(/href="([^"]*)"/i);
    if (!hrefMatch || !hrefMatch[1].includes('pelisplushd.bz')) continue;
    const url = hrefMatch[1];
    const imgMatch = block.match(/<img[^>]*src="([^"]*)"[^>]*>/i);
    let title = null;
    const titleMatch = block.match(/listing-content[^>]*>\s*<p>([^<]*)</i);
    if (titleMatch) title = titleMatch[1];
    if (!title) {
      const dataTitle = attrs.match(/data-title="VER ([^(]*)\(/i);
      if (dataTitle) title = dataTitle[1];
    }
    if (!title) continue;
    title = decodeEntities(title).trim();
    if (!title) continue;
    items.push({
      title,
      url,
      poster: imgMatch && !imgMatch[1].includes('hover.png') ? imgMatch[1] : null,
      category: url.includes('/serie/') ? 'Series' : url.includes('/anime/') ? 'Anime' : 'Películas',
      source: 'PelisplusHD',
      external: true,
    });
  }
  return items;
}

async function getPelisplusHDDetails(targetUrl) {
  const html = await fetchHTML(targetUrl);
  const titleMatch = html.match(/<h1[^>]*class="[^"]*m-b-5[^"]*"[^>]*>\s*([^<]*)</i);
  let title = titleMatch ? decodeEntities(titleMatch[1]).trim() : 'Sin título';
  const yearMatch = title.match(/\((\d{4})\)/);
  const year = yearMatch ? yearMatch[1] : null;
  title = title.replace(/\s*\(\d{4}\)\s*$/, '');
  const descMatch = html.match(/<div[^>]*class="[^"]*text-large[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  const description = descMatch ? decodeEntities(descMatch[1].replace(/<[^>]*>/g, '')).trim() : '';
  let poster = null;
  const posterMatch = html.match(/<img[^>]*class="[^"]*img-fluid[^"]*"[^>]*?src="([^"]+)"[^>]*>/i)
    || html.match(/<img[^>]*?src="([^"]+)"[^>]*class="[^"]*img-fluid[^"]*"[^>]*>/i);
  if (posterMatch) poster = posterMatch[1];
  if (!poster) {
    const ogMatch = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]*)"/i);
    if (ogMatch) poster = ogMatch[1];
  }

  const isMovie = targetUrl.includes('/pelicula/');
  if (isMovie) {
    return { type: 'movie', title, description, poster, url: targetUrl, external: true, source: 'PelisplusHD' };
  }

  const episodes = [];
  const epRegex = /<a[^>]*href="([^"]*\/temporada\/(\d+)\/capitulo\/(\d+))"[^>]*>([\s\S]*?)<\/a>/gi;
  let epMatch;
  while ((epMatch = epRegex.exec(html)) !== null) {
    let name = epMatch[4].replace(/<[^>]*>/g, '').trim();
    name = name.replace(/T\d+.*E\d+:\s*/i, '').trim();
    episodes.push({
      name: decodeEntities(name) || 'Episodio ' + epMatch[3],
      link: epMatch[1],
      season: parseInt(epMatch[2]),
      episode: parseInt(epMatch[3]),
      poster: null,
    });
  }

  return {
    type: 'series',
    title,
    description,
    poster,
    episodes,
    url: targetUrl,
    external: true,
    source: 'PelisplusHD'
  };
}

async function deriveAesKey(challenge, difficulty, salt) {
  const prefix = '0'.repeat(difficulty);
  let nonce = 0;
  while (true) {
    const hashHex = await sha256Hex(challenge + nonce);
    if (hashHex.startsWith(prefix)) {
      return sha256Bytes(challenge + nonce + salt);
    }
    nonce++;
  }
}

async function sha256Hex(input) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Bytes(input) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return new Uint8Array(buf);
}

async function decryptAES(encryptedBase64, aesKey) {
  const raw = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));
  const iv = raw.slice(0, 16);
  const data = raw.slice(16);
  const key = await crypto.subtle.importKey('raw', aesKey.slice(0, 32), { name: 'AES-CBC' }, false, ['decrypt']);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, key, data);
  return new TextDecoder().decode(decrypted);
}

async function extractEmbed69(url) {
  const html = await fetchHTML(url);
  const scriptMatch = html.match(/dataLink\s*=\s*(\[[\s\S]*?\]);/);
  const powMatch = html.match(/const POW_CHALLENGE = '([^']*)'/);
  const diffMatch = html.match(/const POW_DIFFICULTY = (\d+)/);
  const saltMatch = html.match(/const POW_SALT = '([^']*)'/);
  if (!scriptMatch || !powMatch || !diffMatch || !saltMatch) return [];
  let parsed;
  try {
    parsed = JSON.parse(scriptMatch[1]);
  } catch (e) {
    return [];
  }
  const aesKey = await deriveAesKey(powMatch[1], parseInt(diffMatch[1]), saltMatch[1]);
  const links = [];
  for (const lang of parsed) {
    for (const server of lang.sortedEmbeds || []) {
      if (!server.link) continue;
      try {
        const decrypted = await decryptAES(server.link, aesKey);
        if (decrypted) links.push(fixHostsLinks(decrypted));
      } catch (e) {}
    }
  }
  return links;
}

async function getPelisplusHDLinks(targetUrl) {
  const html = await fetchHTML(targetUrl);
  const scriptMatch = html.match(/var video = \[\];([\s\S]*?)(?:<\/script>|$)/i);
  const script = scriptMatch ? scriptMatch[1] : '';
  const urlRegex = /(https?:\/\/[^\s"'\\]+)/g;
  const embeds = [];
  let m;
  while ((m = urlRegex.exec(script)) !== null) {
    const u = m[1].replace(/[);,'"]+$/, '');
    if (!u.includes('http')) continue;
    embeds.push(u);
  }
  const links = [];
  await mapLimit(embeds, 4, async u => {
    if (u.includes('embed69.org')) {
      try {
        links.push(...await extractEmbed69(u));
      } catch (e) {}
    } else if (u.includes('xupalace.org/video')) {
      try {
        const page = await fetchHTML(u);
        const re = /(?:go_to_player|go_to_playerVast)\('(.*?)'/g;
        let g;
        while ((g = re.exec(page)) !== null) links.push(fixHostsLinks(g[1]));
      } catch (e) {}
    } else {
      try {
        const page = await fetchHTML(u);
        const iframeMatch = page.match(/<iframe[^>]*src="([^"]*)"/i);
        if (iframeMatch) links.push(fixHostsLinks(iframeMatch[1]));
      } catch (e) {}
    }
  });
  if (links.length === 0) {
    const firstEp = html.match(/href="([^"]*\/temporada\/\d+\/capitulo\/\d+)"[^>]*>/i);
    if (firstEp && firstEp[1] !== targetUrl) {
      try {
        return await getPelisplusHDLinks(firstEp[1]);
      } catch (e) {}
    }
  }
  const liveLinks = links.filter(u => !CUEVANA_DEAD_HOSTS.test(u));
  return liveLinks.length > 0 ? liveLinks : links;
}

async function getCuevanaDetails(targetUrl) {
  const html = await fetchHTML(targetUrl);
  const titleMatch = html.match(/<h1[^>]*class="[^"]*Title[^"]*"[^>]*>([^<]*)<\/h1>/i);
  const descMatch = html.match(/<div[^>]*class="[^"]*Description[^"]*"[^>]*>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i);
  let poster = null;
  const posterMatch = html.match(/<div[^>]*class="[^"]*Image[^"]*"[^>]*>[\s\S]*?<img[^>]*src="([^"]*)"[^>]*>/i);
  if (posterMatch) {
    let imgUrl = decodeEntities(posterMatch[1]);
    if (imgUrl.startsWith('//')) imgUrl = 'https:' + imgUrl;
    else if (imgUrl.startsWith('/')) imgUrl = CUEVANA_URL + imgUrl;
    poster = imgUrl;
  }

  const isMovie = targetUrl.includes('/ver-pelicula/');
  const title = titleMatch ? titleMatch[1].trim() : 'Sin título';
  const description = descMatch ? descMatch[1].trim() : '';

  if (isMovie) {
    return { type: 'movie', title, description, poster, url: targetUrl, external: true, source: 'Cuevana' };
  }

  let episodes = [];
  const scriptMatch = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (scriptMatch) {
    try {
      const jsonData = JSON.parse(scriptMatch[1]);
      const series = jsonData?.props?.pageProps?.thisSerie;
      const serieName = series?.slug?.name || '';
      if (series && series.seasons) {
        for (const season of series.seasons) {
          for (const ep of season.episodes) {
            const epLink = serieName
              ? `${CUEVANA_URL}/episodio/${serieName}-temporada-${season.number}-episodio-${ep.number}`
              : '';
            episodes.push({
              name: decodeEntities(ep.title || 'Episodio'),
              link: epLink,
              season: season.number,
              episode: ep.number,
              poster: ep.image || null,
            });
          }
        }
      }
    } catch (e) {}
  }

  return {
    type: 'series',
    title,
    description,
    poster,
    episodes,
    url: targetUrl,
    external: true,
    source: 'Cuevana'
  };
}

const CUEVANA_DEAD_HOSTS = /(?:streamwish\.to|hglink\.to|swdyu\.com|cybervynx\.com|dumbalag\.com|voe\.sx)/i;

async function extractCuevanaLinksFromHtml(html) {
  const links = [];
  const seen = new Set();
  const dataTrRegex = /data-tr="([^"]*)"/gi;
  const iframes = [];
  let match;
  while ((match = dataTrRegex.exec(html)) !== null) {
    const iframeUrl = match[1];
    if (!iframeUrl || seen.has(iframeUrl)) continue;
    seen.add(iframeUrl);
    iframes.push(iframeUrl);
  }
  await mapLimit(iframes, 4, async iframeUrl => {
    try {
      const iframeHtml = await fetchHTML(iframeUrl);
      const urlMatch = iframeHtml.match(/var url = '([^']*)';/i);
      if (!urlMatch) return;
      let videoUrl = fixHostsLinks(urlMatch[1]);
      if (!videoUrl || CUEVANA_DEAD_HOSTS.test(videoUrl)) return;
      if (!links.includes(videoUrl)) links.push(videoUrl);
    } catch (e) {}
  });
  return links;
}

async function getCuevanaLinks(targetUrl) {
  const html = await fetchHTML(targetUrl);
  let links = await extractCuevanaLinksFromHtml(html);
  if (links.length === 0) {
    const firstEp = html.match(/href="(\/episodio\/[^"]*)"/i);
    if (firstEp) {
      try {
        const epHtml = await fetchHTML(CUEVANA_URL + firstEp[1]);
        links = await extractCuevanaLinksFromHtml(epHtml);
      } catch (e) {}
    }
  }
  if (links.length === 0) {
    const scriptMatch = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
    if (scriptMatch) {
      try {
        const jsonData = JSON.parse(scriptMatch[1]);
        const series = jsonData?.props?.pageProps?.thisSerie;
        const serieName = series?.slug?.name || '';
        for (const season of series?.seasons || []) {
          const eps = season?.episodes || [];
          if (eps.length > 0) {
            const epUrl = `${CUEVANA_URL}/episodio/${serieName}-temporada-${season.number}-episodio-${eps[0].number}`;
            const epHtml = await fetchHTML(epUrl);
            links = await extractCuevanaLinksFromHtml(epHtml);
            break;
          }
        }
      } catch (e) {}
    }
  }
  return links;
}

// ==================== MANEJADORES ====================

function dedupItems(arr) {
  const seen = new Set();
  const out = [];
  for (const it of arr) {
    const keyTitle = (it.title || '').toLowerCase().trim();
    if (!keyTitle || seen.has(keyTitle)) continue;
    seen.add(keyTitle);
    out.push(it);
  }
  return out;
}

async function handleMainPage(url, env, corsHeaders) {
  const section = url.searchParams.get('section') || '';
  const source = url.searchParams.get('source') || '';
  const page = Math.max(1, parseInt(url.searchParams.get('page')) || 1);
  const sourceKey = source ? '/' + source.toLowerCase() : '';
  const filterBySource = arr => (source ? arr.filter(it => (it.source || '') === source) : arr);

  const fetchTriple = async (phdUrl, cueUrl, cineUrl, opts = {}) => {
    const [a, b, c] = await Promise.allSettled([
      fetchHTML(phdUrl),
      cueUrl ? fetchHTML(cueUrl) : Promise.resolve(''),
      cineUrl ? fetchHTML(cineUrl) : Promise.resolve('')
    ]);
    return combineItems(
      a.status === 'fulfilled' ? a.value : '',
      b.status === 'fulfilled' ? b.value : '',
      c.status === 'fulfilled' ? c.value : '',
      opts
    );
  };

  if (section) {
    const key = `home/v8/${section}/${page}${sourceKey}`;
    const hit = await cacheGet(key);
    if (hit) return hit;
    let items = [];
    if (section === 'peliculas-phd') {
      items = await fetchTriple(`${PHD_URL}/peliculas?page=${page}`, `${CUEVANA_URL}/peliculas${page > 1 ? `/page/${page}/` : ''}`, '');
    } else if (section === 'series-phd') {
      items = await fetchTriple(`${PHD_URL}/series?page=${page}`, `${CUEVANA_URL}/series${page > 1 ? `/page/${page}/` : ''}`, `${CINECALIDAD_URL}/ver-serie/${page > 1 ? `page/${page}/` : ''}`);
    } else if (section === 'estrenos') {
      items = await fetchTriple(`${PHD_URL}/?page=${page}`, `${CUEVANA_URL}/page/${page}/`, `${CINECALIDAD_URL}/page/${page}/`, { filterAnime: true });
    } else if (section.startsWith('genero-')) {
      const genre = section.slice('genero-'.length);
      items = await fetchTriple(`${PHD_URL}/generos/${genre}?page=${page}`, `${CUEVANA_URL}/genero/${genre}${page > 1 ? `/page/${page}/` : ''}`, `${CINECALIDAD_URL}/genero-de-la-pelicula/${genre}${page > 1 ? `/page/${page}/` : ''}`, { filterAnime: true });
    } else if (section === 'anime') {
      items = await fetchTriple(`${PHD_URL}/animes?page=${page}`, '', '');
    }
    items = filterBySource(items);
    if (!items.length) return jsonResponse([], corsHeaders);
    const enriched = await enrichItems(items, env);
    return cachePut(key, enriched, CACHE_MAIN_TTL, corsHeaders, env);
  }

  const key = `home/v8${sourceKey}`;
  const hit = await cacheGet(key);
  if (hit) return hit;

  const fetchCineHome = async () => {
    try {
      return await fetchHTML(CINECALIDAD_URL + '/');
    } catch (e) {
      try { return await fetchHTML(CINECALIDAD_URL + '/page/1/'); } catch (e2) { return ''; }
    }
  };

  const [phdPelis, phdSeries, phdHome, cueHome, cuePelis, cueSeries, cineHome, cineSeries] = await Promise.allSettled([
    fetchHTML(PHD_URL + '/peliculas?page=1'),
    fetchHTML(PHD_URL + '/series?page=1'),
    fetchHTML(PHD_URL + '/'),
    fetchHTML(CUEVANA_URL + '/'),
    fetchHTML(CUEVANA_URL + '/peliculas'),
    fetchHTML(CUEVANA_URL + '/series'),
    fetchHTML(CINECALIDAD_URL + '/ver-serie/'),
    fetchCineHome(),
  ]);

  const sections = [];
  const seenTitles = new Set();

  const addItemsToSection = (items, slug, title, hasMore = true, dedupe = true) => {
    const fresh = dedupe ? items.filter(it => {
      const t = normTitle(it.title);
      if (!t || seenTitles.has(t)) return false;
      seenTitles.add(t);
      return true;
    }) : items;
    if (!fresh.length) return;
    let sec = sections.find(s => s.slug === slug);
    if (!sec) {
      sec = { slug, title, hasMore, items: [] };
      sections.push(sec);
    }
    sec.items.push(...fresh);
  };

  addItemsToSection(filterBySource(combineItems(phdPelis.status === 'fulfilled' ? phdPelis.value : '', cuePelis.status === 'fulfilled' ? cuePelis.value : '', '')), 'peliculas-phd', 'Películas', true);
  addItemsToSection(filterBySource(combineItems(phdSeries.status === 'fulfilled' ? phdSeries.value : '', cueSeries.status === 'fulfilled' ? cueSeries.value : '', cineSeries.status === 'fulfilled' ? cineSeries.value : '')), 'series-phd', 'Series', true);
  addItemsToSection(filterBySource(combineItems(phdHome.status === 'fulfilled' ? phdHome.value : '', cueHome.status === 'fulfilled' ? cueHome.value : '', cineHome.status === 'fulfilled' ? cineHome.value : '', { filterAnime: true })), 'estrenos', 'Estrenos', true);
  const genreRes = await Promise.allSettled(GENRE_SECTIONS.map(async ([slug, title]) => {
    try {
      const items = await fetchTriple(`${PHD_URL}/generos/${slug}?page=1`, `${CUEVANA_URL}/genero/${slug}`, `${CINECALIDAD_URL}/genero-de-la-pelicula/${slug}/`, { filterAnime: true });
      return { slug: 'genero-' + slug, title, items: filterBySource(items) };
    } catch (e) { return { slug: 'genero-' + slug, title, items: [] }; }
  }));
  for (const r of genreRes) {
    if (r.status === 'fulfilled' && r.value.items.length) {
      addItemsToSection(r.value.items, r.value.slug, r.value.title, true, false);
    }
  }
  const animeRes = await Promise.allSettled([(async () => {
    try {
      const html = await fetchHTML(`${PHD_URL}/animes?page=1`);
      return { slug: 'anime', title: 'Anime', items: filterBySource(dedupItems(extractPelisplusHDItems(html))) };
    } catch (e) { return { slug: 'anime', title: 'Anime', items: [] }; }
  })()]);
  for (const r of animeRes) {
    if (r.status === 'fulfilled' && r.value.items.length) {
      addItemsToSection(r.value.items, r.value.slug, r.value.title, true, false);
    }
  }

  const enriched = await enrichItems(sections.flatMap(s => s.items), env);
  const enrichedByUrl = new Map(enriched.map(it => [it.url, it]));
  for (const sec of sections) {
    sec.items = sec.items.map(it => enrichedByUrl.get(it.url) || it);
  }

  return cachePut(key, { sections }, CACHE_MAIN_TTL, corsHeaders, env);
}

function normalizeQuery(q) {
  return String(q).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function cleanQuery(q) {
  return String(q)
    .replace(/\s*\(\d{4}\)\s*/g, ' ')
    .replace(/\b(?:19|20)\d{2}\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function searchAllProviders(query) {
  const [phdResult, cueResult, cineResult] = await Promise.allSettled([
    fetchHTML(`${PHD_URL}/search?s=${encodeURIComponent(query)}`),
    fetchHTML(`${CUEVANA_URL}/search?q=${encodeURIComponent(query)}`),
    fetchHTML(`${CINECALIDAD_URL}/?s=${encodeURIComponent(query)}`)
  ]);

  let items = [];
  if (phdResult.status === 'fulfilled' && phdResult.value) {
    items = items.concat(extractPelisplusHDItems(phdResult.value));
  }
  if (cueResult.status === 'fulfilled' && cueResult.value) {
    items = items.concat(extractCuevanaItems(cueResult.value));
  }
  if (cineResult.status === 'fulfilled' && cineResult.value) {
    items = items.concat(extractCinecalidadItems(cineResult.value));
  }
  return items;
}

async function handleSearch(query, page, env, corsHeaders, source) {
  if (!query || query.trim() === '') {
    return handleMainPage(new URL('https://localhost/api/mainpage'), env, corsHeaders);
  }

  const cacheKey = 'search/v4/' + encodeURIComponent(query.trim().toLowerCase()) + (source ? '/' + source.toLowerCase() : '');
  const hit = await cacheGet(cacheKey);
  if (hit) return hit;

  const variants = [query.trim(), normalizeQuery(query.trim())];
  const cleaned = cleanQuery(query.trim());
  if (cleaned && !variants.includes(cleaned)) variants.push(cleaned);

  let combined = [];
  const seen = new Set();
  for (const variant of variants) {
    if (combined.length > 0) break;
    const items = await searchAllProviders(variant);
    combined = items.filter(it => {
      const key = it.url;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  if (combined.length === 0) {
    return cachePut(cacheKey, [], CACHE_SEARCH_TTL, corsHeaders, env);
  }

  if (source) combined = combined.filter(it => (it.source || '') === source);
  if (combined.length === 0) {
    return cachePut(cacheKey, [], CACHE_SEARCH_TTL, corsHeaders, env);
  }

  combined = await enrichItems(combined, env);
  combined.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
  return cachePut(cacheKey, combined, CACHE_SEARCH_TTL, corsHeaders, env);
}

async function handleDetails(targetUrl, corsHeaders, env) {
  try {
    if (!assertSafeUrl(targetUrl, PROVIDER_ALLOWED_HOSTS)) {
      return jsonResponse({ error: 'URL no permitida' }, corsHeaders, 403);
    }
    const cacheKey = 'details/v1/' + encodeURIComponent(targetUrl);
    const hit = await cacheGet(cacheKey);
    if (hit) return hit;
    let details;
    if (targetUrl.includes('cinecalidad')) {
      details = await getCinecalidadDetails(targetUrl);
    } else if (targetUrl.includes('cuevana')) {
      details = await getCuevanaDetails(targetUrl);
    } else {
      details = await getPelisplusHDDetails(targetUrl);
    }
    if (details && details.type === 'series' && env && env.DB) {
      const { results } = await env.DB.prepare(
        'SELECT season, episode, name, download_link, is_custom FROM episode_metadata WHERE series_url = ?'
      ).bind(targetUrl).all();
      const linkMap = {};
      const customs = [];
      for (const row of results || []) {
        if (row.is_custom) {
          customs.push({
            name: row.name || 'Capítulo ' + row.episode,
            link: null,
            season: row.season,
            episode: row.episode,
            poster: null,
            download_link: row.download_link || null,
            custom: true,
          });
        } else {
          linkMap[`${row.season}|${row.episode}`] = row.download_link;
        }
      }
      details.episodes = (details.episodes || []).map(ep => {
        const dl = linkMap[`${ep.season}|${ep.episode}`];
        if (dl) ep.download_link = dl;
        return ep;
      });
      if (customs.length) {
        details.episodes = details.episodes.concat(customs).sort((a, b) => a.season - b.season || a.episode - b.episode);
      }
    }
    return cachePut(cacheKey, details, 600, corsHeaders, env);
  } catch (err) {
    return jsonResponse({ error: err.message }, corsHeaders, 500);
  }
}

async function handleListEpisodes(seriesUrl, env, corsHeaders) {
  try {
    const { results } = await env.DB.prepare(
      'SELECT season, episode, name, download_link, is_custom, updated_at FROM episode_metadata WHERE series_url = ? ORDER BY season, episode'
    ).bind(seriesUrl).all();
    return jsonResponse(results || [], corsHeaders);
  } catch (err) {
    return jsonResponse({ error: err.message }, corsHeaders, 500);
  }
}

async function handleUpsertEpisode(request, env, corsHeaders) {
  try {
    const body = await request.json();
    const { series_url, season, episode, name, download_link, is_custom } = body;
    if (!series_url || season === undefined || season === null || season === '' || episode === undefined || episode === null || episode === '') {
      return jsonResponse({ error: 'Missing fields' }, corsHeaders, 400);
    }
    const s = parseInt(season);
    const e = parseInt(episode);
    if (!Number.isFinite(s) || !Number.isFinite(e) || s <= 0 || e <= 0) {
      return jsonResponse({ error: 'Temporada y capítulo deben ser números positivos' }, corsHeaders, 400);
    }
    const dl = (download_link || '').trim() || null;
    const custom = is_custom ? 1 : 0;
    if (!custom && !dl) {
      await env.DB.prepare('DELETE FROM episode_metadata WHERE series_url = ? AND season = ? AND episode = ?').bind(series_url, s, e).run();
      await invalidateDetails(series_url, env);
      return jsonResponse({ ok: true, cleared: true }, corsHeaders);
    }
    await env.DB.prepare(
      'INSERT OR REPLACE INTO episode_metadata (series_url, season, episode, name, download_link, is_custom, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(series_url, s, e, (name || '').trim() || null, dl, custom, Date.now()).run();
    await invalidateDetails(series_url, env);
    return jsonResponse({ ok: true }, corsHeaders);
  } catch (err) {
    return jsonResponse({ error: err.message }, corsHeaders, 500);
  }
}

async function handleDeleteEpisode(url, env, corsHeaders) {
  try {
    const seriesUrl = url.searchParams.get('series_url');
    const season = url.searchParams.get('season');
    const episode = url.searchParams.get('episode');
    if (!seriesUrl || !season || !episode) return jsonResponse({ error: 'Missing params' }, corsHeaders, 400);
    await env.DB.prepare('DELETE FROM episode_metadata WHERE series_url = ? AND season = ? AND episode = ?')
      .bind(seriesUrl, parseInt(season), parseInt(episode)).run();
    await invalidateDetails(seriesUrl, env);
    return jsonResponse({ ok: true }, corsHeaders);
  } catch (err) {
    return jsonResponse({ error: err.message }, corsHeaders, 500);
  }
}

async function handleLinks(targetUrl, corsHeaders, env) {
  try {
    if (!assertSafeUrl(targetUrl, PROVIDER_ALLOWED_HOSTS)) {
      return jsonResponse({ error: 'URL no permitida' }, corsHeaders, 403);
    }
    const cacheKey = 'links/v1/' + encodeURIComponent(targetUrl);
    const hit = await cacheGet(cacheKey);
    if (hit) return hit;
    let links;
    if (targetUrl.includes('cinecalidad')) {
      links = await getCinecalidadLinks(targetUrl);
    } else if (targetUrl.includes('cuevana')) {
      links = await getCuevanaLinks(targetUrl);
    } else {
      links = await getPelisplusHDLinks(targetUrl);
    }
    return cachePut(cacheKey, links, 600, corsHeaders, env);
  } catch (err) {
    return jsonResponse({ error: err.message }, corsHeaders, 500);
  }
}

// ==================== METADATOS PERSONALIZADOS ====================
async function enrichItems(items, env) {
  if (!items || items.length === 0) return items;
  const metadataMap = {};

  for (let i = 0; i < items.length; i += D1_CHUNK) {
    const chunk = items.slice(i, i + D1_CHUNK);
    const urls = chunk.map(item => item.url);
    const placeholders = urls.map(() => '?').join(',');
    const { results } = await env.DB.prepare(`SELECT * FROM movie_metadata WHERE external_url IN (${placeholders})`).bind(...urls).all();
    results.forEach(row => {
      metadataMap[row.external_url] = row;
    });
  }

  return items.map(item => {
    const meta = metadataMap[item.url];
    if (meta) {
      if (meta.custom_category) item.category = meta.custom_category;
      if (meta.download_link) item.download_link = meta.download_link;
      item.metadata_id = meta.id;
    }
    if (!item.category) {
      item.category = item.source === 'Cinecalidad' ? getCategoryFromCinecalidadUrl(item.url) : 'Estrenos';
    }
    return item;
  });
}

async function handleGetMetadata(externalUrl, env, corsHeaders) {
  const result = await env.DB.prepare('SELECT * FROM movie_metadata WHERE external_url = ?').bind(externalUrl).first();
  return jsonResponse(result || null, corsHeaders);
}

async function handleGetCategories(env, corsHeaders) {
  const { results } = await env.DB.prepare('SELECT DISTINCT custom_category FROM movie_metadata WHERE custom_category IS NOT NULL AND custom_category != ""').all();
  const categories = results.map(r => r.custom_category).filter(Boolean).sort();
  return jsonResponse(categories, corsHeaders);
}

async function handleGetByCategory(category, env, corsHeaders) {
  try {
    const { results } = await env.DB.prepare('SELECT * FROM movie_metadata WHERE custom_category = ? ORDER BY title ASC').bind(category).all();
    const items = results.map(row => ({
      id: row.id,
      title: row.title || 'Sin título',
      url: row.external_url,
      poster: null,
      download_link: row.download_link,
      external: true,
      category: row.custom_category,
      metadata_id: row.id,
    }));
    await mapLimit(items, 6, async it => {
      if (!assertSafeUrl(it.url, PROVIDER_ALLOWED_HOSTS)) return;
      try {
        let details = null;
        if (it.url.includes('cinecalidad')) details = await getCinecalidadDetails(it.url);
        else if (it.url.includes('cuevana')) details = await getCuevanaDetails(it.url);
        else details = await getPelisplusHDDetails(it.url);
        if (details && details.poster) it.poster = details.poster;
      } catch (e) {}
    });
    return jsonResponse(items, corsHeaders);
  } catch (err) {
    return jsonResponse({ error: err.message }, corsHeaders, 500);
  }
}

async function handleSaveMetadata(request, env, corsHeaders) {
  const body = await request.json();
  const { id, title, external_url, custom_category, download_link } = body;
  if (!id || !title || !external_url) {
    return jsonResponse({ error: 'Missing required fields' }, corsHeaders, 400);
  }
  if (!assertSafeUrl(external_url, PROVIDER_ALLOWED_HOSTS)) {
    return jsonResponse({ error: 'Dominio no permitido' }, corsHeaders, 400);
  }
  if (download_link && !assertSafeUrl(download_link)) {
    return jsonResponse({ error: 'Enlace de descarga no válido' }, corsHeaders, 400);
  }
  await env.DB.prepare(`
    INSERT OR REPLACE INTO movie_metadata (id, title, external_url, custom_category, download_link, updated_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).bind(id, title, external_url, custom_category || null, download_link || null).run();
  await invalidateMainPage(env);
  await invalidateDetails(external_url, env);
  return jsonResponse({ success: true }, corsHeaders);
}

async function handleDeleteMetadata(externalUrl, env, corsHeaders) {
  await env.DB.prepare('DELETE FROM movie_metadata WHERE external_url = ?').bind(externalUrl).run();
  await invalidateMainPage(env);
  await invalidateDetails(externalUrl, env);
  return jsonResponse({ success: true }, corsHeaders);
}

async function handleGetAllMetadata(env, corsHeaders) {
  const { results } = await env.DB.prepare('SELECT * FROM movie_metadata ORDER BY title ASC').all();
  return jsonResponse(results, corsHeaders);
}

// ==================== AVATAR ====================
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

// ==================== REPRODUCTOR PROPIO (patrón CloudStream: ExtractorLink) ====================
const STREAM_TIMEOUT = 12000;

const STREAM_HOSTS = [
  { re: /(?:doodstream\.com|dooood\.com|doods\.pro|dood\.(?:la|to|so|ws|yt|li|wf|cx|sh|pm|watch)|d0000d\.com|d000d\.com|ds2play\.com|ds2video\.com|myvidplay\.com|playmogo\.com)/i, fn: extractDoodstream },
  { re: /byse\w*\.(?:com|sx)/i, fn: extractByse },
  { re: /(?:streamtape\.(?:com|net|xyz)|watchadsontape\.com|shavetape\.cash)/i, fn: extractStreamTape },
];

const STREAM_IFRAME_ONLY = /(?:vidhidepro\.com|morencius\.com|videoapp\.zip|filelions\.(?:live|online|to)|doodstream\.com|dooood\.com|doods\.pro|dood\.(?:la|to|so|ws|yt|li|wf|cx|sh|pm|watch)|d0000d\.com|d000d\.com|ds2play\.com|ds2video\.com|myvidplay\.com|playmogo\.com|vide0\.net|minochinos\.com|acek-cdn\.com|dramiyos-cdn\.com|dood\.video|cloudatacdn\.com)/i;

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
  const md5Match = html.match(/\/pass_md5\/[^']*/);
  if (!md5Match) return null;
  const md5Url = host + md5Match[0];
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
  for (let hop = 0; hop < 4; hop++) {
    if (deadline && Date.now() > deadline) return null;
    if (!assertSafeUrl(current)) return null;
    const html = await fetchHTML(current, STREAM_TIMEOUT);
    const redirectMatch = html.match(/window\.location\.(?:href|replace)\s*=\s*['"]([^'"]+)['"]/i);
    if (redirectMatch) {
      const next = decodeEntities(redirectMatch[1]);
      if (next.startsWith('/')) current = new URL(next, current).href;
      else if (/^https?:/.test(next)) current = next;
      else break;
      continue;
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
    if (STREAM_IFRAME_ONLY.test(targetUrl)) {
      return jsonResponse({ ok: false }, corsHeaders);
    }
    const hostResult = await tryHostExtractors(targetUrl);
    if (hostResult) {
      if (await verifyStream(hostResult)) {
        return cachePut(cacheKey, { ok: true, ...hostResult }, 300, corsHeaders, env);
      }
      return jsonResponse({ ok: false }, corsHeaders);
    }
    if (STREAM_HOSTS.some(h => h.re.test(targetUrl))) {
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

// ==================== ADMIN: STATS / CACHE / CATEGORIAS ====================
async function handleAdminStats(env, corsHeaders) {
  const [cats, meta, dl, eps, epLinks, sSearch, sHome, sOther] = await Promise.all([
    env.DB.prepare('SELECT COUNT(DISTINCT custom_category) c FROM movie_metadata WHERE custom_category IS NOT NULL AND custom_category != ""').first(),
    env.DB.prepare('SELECT COUNT(*) c FROM movie_metadata').first(),
    env.DB.prepare('SELECT COUNT(*) c FROM movie_metadata WHERE download_link IS NOT NULL AND download_link != ""').first(),
    env.DB.prepare('SELECT COUNT(*) c FROM episode_metadata WHERE is_custom = 1').first(),
    env.DB.prepare('SELECT COUNT(*) c FROM episode_metadata WHERE is_custom = 0 AND download_link IS NOT NULL AND download_link != ""').first(),
    env.DB.prepare("SELECT COUNT(*) c FROM cache_keys WHERE key LIKE 'search/%'").first(),
    env.DB.prepare("SELECT COUNT(*) c FROM cache_keys WHERE key LIKE 'home/%'").first(),
    env.DB.prepare("SELECT COUNT(*) c FROM cache_keys WHERE key NOT LIKE 'search/%' AND key NOT LIKE 'home/%'").first(),
  ]);
  return jsonResponse({
    categories: cats.c, metadata: meta.c, with_download: dl.c,
    custom_episodes: eps.c, episode_links: epLinks.c,
    cache: { search: sSearch.c, home: sHome.c, other: sOther.c }
  }, corsHeaders);
}

async function handleCachePurge(request, env, corsHeaders) {
  const { scope } = await request.json();
  if (!['all', 'search', 'home'].includes(scope)) {
    return jsonResponse({ error: 'Invalid scope' }, corsHeaders, 400);
  }
  const where = scope === 'all' ? '' : scope === 'search' ? " WHERE key LIKE 'search/%'" : " WHERE key LIKE 'home/%'";
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

async function handleCategoryRename(request, env, corsHeaders) {
  const { from, to } = await request.json();
  if (!from || !to) return jsonResponse({ error: 'Missing from/to' }, corsHeaders, 400);
  await env.DB.prepare('UPDATE movie_metadata SET custom_category = ? WHERE custom_category = ?').bind(to, from).run();
  await invalidateMainPage(env);
  return jsonResponse({ success: true }, corsHeaders);
}

