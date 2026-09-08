# MocchiStream — Documentación técnica

# MocchiStream

> Sistema de streaming personal — Cloudflare Pages + Worker con D1.
> README de uso interno (para Kael).

---

## Qué es

Web app de streaming con 3 proveedores: **PelisplusHD (principal)** + **Cuevana (secundario)** + **Cinecalidad (discreta)**. Busca, ve portada por secciones, abre detalles y reproduce en **reproductor propio sin anuncios** (el worker extrae el m3u8 directo) con fallback a iframe cuando la fuente no se puede resolver. Incluye admin privado para categorías personalizadas y enlaces de descarga por capítulo.

**URL**: `https://mocchi-stream.pages.dev`
**Worker**: `mocchistream` (`mocchistream.kael-iv22.workers.dev`)
**D1**: `mocchistream-db` (`8b081a16-555c-4818-80d7-fbd767bec4c5`)

---

## Stack

- Frontend: HTML + CSS + JS vanilla, **ES modules sin build** (sin TypeScript, sin frameworks)
- Deploy: Cloudflare Pages (`mocchi-stream`) + Worker (`mocchistream`) con D1
- Reproductor: `hls.min.js` 1.5.13 local (jsdelivr) — HLS propio vía worker `/api/stream` + `/api/proxy`
- Fuentes tipográficas y de iconos LOCALES (`css/fonts/`) — sin CDNs
- PWA: manifest + service worker + iconos generados

---

## Estructura

```
MocchiStream/
├── index.html            → SPA (Selecciones + 5 vistas)
├── admin.html            → Panel privado (/admin, redirect 308)
├── manifest.webmanifest  → PWA (standalone)
├── sw.js                 → Service worker (CACHE=mocchi-v12)
├── css/
│   ├── style.css         → Diseño Apple HIG oscuro (tokens, glass solo en capa funcional)
│   ├── fonts-material.css
│   └── fonts/            → inter-var.woff2 + material-symbols (subset)
├── icons/                → icon-192.png, icon-512.png
├── js/
│   ├── utils.js          → API_BASE, STORAGE_VERSION (v5), esc, showToast, loadLS/saveLS
│   ├── catalog.js        → favs/history/watchLater, cardHtml, getItemType, cleanStale
│   ├── home.js           → Selecciones/Explorar, hero, secciones combinadas, scroll infinito
│   ├── search.js         → búsqueda con debounce, grupos por fuente, chips
│   ├── categories.js     → tiles de categorías personalizadas
│   ├── library.js        → tabs Favoritos / Historial / Ver después
│   ├── detail.js         → detalle full-screen, temporadas, episodios, compartir
│   ├── player.js         → sheet de fuentes + reproductor propio/iframe + tags
│   └── app.js            → boot, router, nav, PTR, deep link ?t=, admin modal
└── worker/
    ├── worker.js               → Worker actual (V3.6)
    ├── worker.original.js      → backup pre-V2 (08-13)
    └── worker.sololatino.bak.js → backup pre-PelisplusHD (08-13)
```

---

## Funcionalidades

### Frontend
- **Selecciones** = inicio (títulos curados por Kael) + **Explorar** = todo el contenido (9 secciones: Películas, Series, Estrenos + 6 géneros, con **animes separados**)
- Secciones **combinadas PHD+Cuevana+Cinecalidad** con dedup por título normalizado (`normTitle`), badge de fuente por proveedor (`.sb-*`) y scroll horizontal infinito
- **Búsqueda universal** con acentos normalizados y sin año, agrupada por fuente (PHD→Cuevana→Cinecalidad), filtros por fuente/tipo
- **Detalle full-screen**: póster, sinopsis, temporadas con pestañas, episodios clicables, compartir (`navigator.share` + deep link `?t=`)
- **Sheet de fuentes** inferior con tags: `⚡ Sin anuncios` (player propio), `Externa` (va a iframe), `Trailer`, `recomendada`
- **Mi lista**: Favoritos / Historial (máx 40) / Ver después (`ms_watchlater`)
- **PWA instalable** + botón "Instalar app" + **pull-to-refresh** en portada
- Descarga por capítulo cuando el admin la define; capítulos "solo descarga" sin streaming
- Cards con badge de tipo (Película/Serie/Anime) y badge de fuente con color por proveedor

### Reproductor propio (V4.0)
- El worker resuelve embed→m3u8/mp4 (`/api/stream`) y el frontend reproduce en `<video>` con hls.js (sin anuncios del proveedor)
- **Extractores portados de CloudStream** (`STREAM_HOSTS`): Doodstream/playmogo (`/pass_md5`), Byse (AES-GCM), StreamTape (`botlink`) + unpack de packers Dean Edwards + redirects JS + regex genérica
- **Hosts `STREAM_IFRAME_ONLY`** (ASN-locked / anti-bot → siempre iframe limpio, sin flash roto): vidhidepro, filelions, doodstream (y espejos), minochinos
- `/api/proxy`: passthrough con UA/Referer/Range + retries x3 backoff + CORS, sin Content-Length
- Fallback a iframe con toast visible si el player propio falla

### Admin (`/admin`, acceso privado — doble tap en avatar)
- **Catálogo**: busca y agrega/quita items a categorías personalizadas (tabla `movie_metadata`)
- **Mis categorías**: filas expandibles con conteo, mini-poster, eliminar
- **Perfil**: avatar + contraseña admin
- **Enlaces de descarga por capítulo** (serie): upsert por temporada/capítulo, capítulos personalizados, eliminar (tabla `episode_metadata`)
- **Stats + purga de caché**: reales vía tabla `cache_keys` (NOTA: `caches.default.keys()` NO existe en Workers)

---

## API del worker (`worker.js`)

| Endpoint | Método | Qué hace |
|---|---|---|
| `/api/search?q=&source=&type=` | GET | Búsqueda PHD→Cuevana→Cinecalidad (caché `search/v4`, TTL 300s) |
| `/api/mainpage?section=&source=&page=` | GET | Portada/secciones (caché `home/v5`, combinadas con dedup) |
| `/api/details?url=` | GET | Detalle película/serie + episodios + download_links (fusión D1) |
| `/api/links?url=` | GET | Servidores del embed (filtro de hosts muertos por proveedor) |
| `/api/stream?url=` | GET | Resuelve embed→m3u8/mp4 para el player propio (fast-fail IFRAME_ONLY) |
| `/api/proxy?url=&ref=` | GET | Passthrough del stream (Range/UA/Referer/retries/CORS) |
| `/api/metadata` | GET/POST/DELETE | Categorías personalizadas |
| `/api/metadata/bycategory?cat=` | GET | Items de una categoría |
| `/api/categories` | GET | Lista de categorías con conteo |
| `/api/avatar` | GET/POST/DELETE | Avatar del perfil (tabla `config`) |
| `/api/admin/*` | GET/POST/DELETE | metadata, episodes, stats, cache/purge, category/rename (auth `X-Admin-Password`) |

Todo el bloque de admin exige `X-Admin-Password` (variable `ADMIN_PASSWORD`). 401 verificado.
Caché con `caches.default` — **SIEMPRE con CORS** en cachePut (lección 08-13). Invalidación de cache al editar metadatos.

### Proveedores
| Proveedor | URL | Detalle |
|---|---|---|
| PelisplusHD (principal) | `pelisplushd.bz` | Links: `var video=[]` → embed69/xupalace/minochinos/uqload; hosts muertos filtrados |
| Cuevana (secundario) | `wv3.cuevana3.eu` | Links vía `player.cuevana3.eu/player.php?h=` (rotación) + `data-tr`; hosts vivos = vidhidepro/doodstream (ambos iframe-only) |
| Cinecalidad (discreta) | `www.cinecalidad.am` | Links vimeos/hlswish/goodstream/uqload (¡player propio!); sin listing de películas |

---

## D1 (mocchistream-db)

- `movie_metadata` — categorías personalizadas (external_url, title, custom_category, poster…)
- `episode_metadata` — PK `(series_url, season, episode)`: name, download_link, is_custom, updated_at
- `config` — key/value (avatar)
- `cache_keys` — claves cacheadas para stats/purge (fix `caches.default.keys()`)

---

## Deploy

```bash
CLOUDFLARE_ACCOUNT_ID=b7ccd04fa7c5cd02effd43406b25e4a7 CLOUDFLARE_API_TOKEN=<token> wrangler pages deploy . --project-name=mocchi-stream
CLOUDFLARE_ACCOUNT_ID=b7ccd04fa7c5cd02effd43406b25e4a7 CLOUDFLARE_API_TOKEN=<token> wrangler deploy
```

Tras deploys repetidos, verificar con cache-bust (`?v=$(date +%s)`) — el CDN sirve HTML viejo por minutos.

---

## Estado actual (cierre 08-15)

- **En producción**: worker V3.6 (`47fb457b`) + Pages `cd1926d3` (sw CACHE `mocchi-v12`, STORAGE_VERSION `v5`)
- **Player propio funciona para**: vimeos.net, goodstream.one, hlswish.com, uqload.com (badge `⚡ Sin anuncios`)
- **iframe-only** (ASN-locked/anti-bot): minochinos, vidhidepro, doodstream (+espejos), filelions
- **Git**: HEAD = `5ab9a73` (backup V3.6). Cambios post-`5ab9a73` SIN commitear — **preguntar a Kael antes de subir**

## Lecciones guardadas

- hls.js 1.5+: `xhrSetup(xhr, url)` — la URL es 2º argumento string; `fetchSetup` debe **devolver un `Request`**
- Tokens de CDN (acek/dramiyos) **ligados al ASN** del que genera el embed → el worker (ASN datacenter 132892) NO puede reproducir minochinos/vidhidepro; mismo problema pendiente = minochinos en browser
- Packer Dean Edwards: el dict usa `\"` (comillas dobles escapadas) — restaurar backslash simple al desempaquetar
- goodstream/hlswish CDNs flaky (403/502 transitorios por rate-limit)
- Playwright-core + chromium-headless-shell en sandbox (`--no-sandbox`) para reproducir bugs de browser
- Verificar con `curl -H "Origin: https://<site>.pages.dev"` los endpoints cacheados
