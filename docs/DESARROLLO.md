# MocchiStream — Documentación técnica

> Sistema de streaming personal — Cloudflare Pages + Worker con D1.
> README de uso interno (para Kael).

---

## Qué es

Web app de streaming (catálogo TMDB) que reproduce en **reproductor propio sin anuncios**. Prioridad de fuentes: **Telegram** (links subidos por el bot al canal) y, si no hay, scrapers (Pelispedia, PelisPlusHD, Monoschinos, LaTAnime). Fallback a iframe cuando la fuente no se puede resolver. Incluye admin privado, playlists, cuentas con sesiones y sincronización de listas.

**URL**: `https://mocchi-stream.pages.dev`
**Worker**: `mocchistream` (`mocchistream.kael-iv22.workers.dev`)
**D1**: `mocchistream-db` (`8b081a16-555c-4818-80d7-fbd767bec4c5`)

---

## Stack

- Frontend: HTML + CSS + JS vanilla, **ES modules sin build** (sin TypeScript, sin frameworks)
- Deploy: Cloudflare Pages (`mocchi-stream`) + Worker (`mocchistream`) con D1
- Reproductor: `hls.min.js` 1.7.0 local — HLS propio vía worker `/api/stream` + `/api/proxy`
- Fuentes tipográficas y de iconos LOCALES (`css/fonts/`) — sin CDNs
- PWA: manifest + service worker + iconos generados

---

## Estructura

```
MocchiStream/
├── index.html            → MPA: Explorar (secciones + scroll infinito)
├── buscar.html           → Resultados de búsqueda (?q=)
├── categorias.html       → Categorías (?cat=peliculas|series|anime|kdrama)
├── favoritos.html        → Favoritos
├── ver-despues.html      → Ver después
├── historial.html        → Historial
├── playlist.html         → Playlists (próximamente)
├── detalle.html          → Detalle full-screen (?id=&type=)
├── ver.html              → Reproductor (?id=&season=&episode=)
├── admin.html            → Panel privado (/admin, redirect 308)
├── manifest.webmanifest  → PWA (standalone)
├── sw.js                 → Service worker (CACHE=mocchi-v35)
├── css/
│   ├── style.css         → Diseño oscuro + tema claro (tokens, glass solo en capa funcional)
│   ├── fonts-material.css
│   └── fonts/            → inter-var.woff2 + material-symbols (subset)
├── icons/                → icon-192.png, icon-512.png, profile.png (logo)
├── js/
│   ├── utils.js          → API_BASE, STORAGE_VERSION (v6), esc, showToast, loadLS/saveLS
│   ├── catalog.js        → favs/history/watchLater, cardHtml, itemKey
│   ├── header.js         → tema claro/oscuro, sidebar (menú), búsqueda Enter, install, SW
│   ├── home.js           → Explorar, secciones, scroll infinito, continuar viendo
│   ├── library.js        → render por tipo (favs/wl/hist)
│   ├── detail.js         → detalle full-screen, temporadas, episodios, compartir
│   ├── player.js         → reproductor propio/iframe + fuentes + ajustes
│   ├── app.js            → boot Explorar, PTR, deep link ?t=
│   ├── app-search.js     → boot búsqueda (?q=)
│   ├── app-cat.js        → boot categorías (?cat=) + scroll infinito
│   ├── app-lib.js        → boot biblioteca (data-kind)
│   ├── app-playlist.js   → boot playlist
│   ├── app-detail.js     → boot detalle
│   ├── app-ver.js        → boot reproductor
│   └── admin.js          → panel admin
└── worker/
    └── worker.js         → Worker (V4, proveedor único Pelispedia)
```

---

## Funcionalidades

### Frontend
- **Selecciones** = inicio (títulos curados por Kael) + **Explorar** = todo el contenido (secciones: Películas, Series, Estrenos + géneros, con animes separados)
- Secciones de **Pelispedia** con badge de proveedor (`.sb-pelispedia`) y scroll horizontal infinito
- **Búsqueda universal** con acentos normalizados, filtros por tipo (Todo/Películas/Series)
- **Detalle full-screen**: póster, sinopsis, temporadas con pestañas, episodios clicables, compartir (`navigator.share` + deep link `?t=`)
- **Sheet de fuentes** inferior con tags: `⚡ Sin anuncios` (player propio), `Externa` (va a iframe), `Trailer`, `recomendada`
- **Guardados**: Favoritos / Historial (máx 40) / Ver después (`ms_watchlater`)
- **PWA instalable** + botón "Instalar app" + **pull-to-refresh** en portada
- Descarga por capítulo cuando el admin la define; capítulos "solo descarga" sin streaming
- Cards con badge de tipo (Película/Serie/Anime) y badge de fuente

### Reproductor propio (V4.3)
- El worker resuelve embed→m3u8/mp4 (`/api/stream`) y el frontend reproduce en `<video>` con hls.js (sin anuncios del proveedor)
- **Hosts FAST** (player propio): vimeos.net, vimeos.zip, goodstream.one, hlswish.com, uqload.*, vidcache.net, mp4upload.com, doodstream, filemoon, mixdrop, voe… — lista en `STREAM_ALLOWED_HOSTS`
- **Fallback**: si ninguna fuente FAST funciona → iframe con toast. El match de embeds usa rank (los `-1` van a iframe)
- `/api/proxy`: passthrough con Range/UA/Referer/retries/CORS, allowlist `STREAM_ALLOWED_HOSTS` (403 fuera de lista, bloquea rangos privados)
- ⚠️ Los embeds actuales de pelispedia son morencius/hglink/voe (no FAST) → hoy todo cae a iframe con anuncios. Pendiente: extractor morencius con token fresco o proveedor con hosts FAST.

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
| `/api/search?q=` | GET | Búsqueda en TMDB (caché `search/v5`, TTL 300s) |
| `/api/sections` | GET | Lista de secciones de portada |
| `/api/mainpage?section=&page=` | GET | Portada/secciones (caché `home/v10`) |
| `/api/details` | GET | Detalle película/serie + episodios + download_links (fusión D1) |
| `/api/play?title=&type=&year=&season=&episode=&anime=&id=` | GET | Fuente de reproducción. **Primero Telegram** (si el item tiene link subido) → directo mp4 sin anuncios; si no, scrapers. Devuelve `{ok,type,url}` o `{ok:false,iframe}` |
| `/api/tg-download?item_id=` | GET | Resuelve el link de Telegram a CDN directo |
| `/api/stream?url=` | GET | Resuelve embed→m3u8/mp4 para el player propio (fast-fail IFRAME_ONLY, re-extrae hasta 4x) |
| `/api/proxy?url=&ref=` | GET | Passthrough del stream (Range/UA/Referer/retries/CORS, allowlist) |
| `/api/playlists` · `/api/playlists/{id}` | GET | Playlists públicas |
| `/api/auth/register` · `login` · `logout` · `me` | POST/GET | Sesiones con token (expira a 30 días). Rate-limit: login 10/15 min, registro 5/h por IP |
| `/api/sync/{all,favorites,history,watch-later}` | GET/POST/DELETE | Sincronización de listas del usuario |
| `/api/admin/*` | GET/POST/DELETE | avatar, download-links, stats, cache/purge, playlists (auth `X-Admin-Password` o `X-Bot-Secret`) |

Todo el bloque de admin exige `X-Admin-Password` (variable `ADMIN_PASSWORD`). 401 verificado.
Caché con `caches.default` — **SIEMPRE con CORS** en cachePut, y **borrar también la fila de `cache_keys`** al invalidar (si no, el purge reporta fallos). `/api/details` y `/api/links` TTL 10 min; `/api/stream` TTL 5 min con re-verificación al servir (auto-curación). Los fallos de `/api/play` se cachean 120 s para no re-scrapear en bucle.

### Proveedores
Prioridad de reproducción: **Telegram primero**, luego scrapers.

| Proveedor | Uso | Detalle |
|---|---|---|
| Telegram (canal) | **Prioridad** | Si el item tiene link subido vía bot → mp4 directo sin anuncios |
| Pelispedia | Pelis/series | Embeds vía `/vidurl/` (POW + AES-CBC) |
| PelisPlusHD | Pelis/series | Scraper de búsqueda + embeds |
| Monoschinos | Anime | Embeds `data-player` (base64). Temporadas como slugs aparte |
| LaTAnime | Anime | Igual que Monoschinos; slugs con número de temporada |

Match de anime: además del título en español se consulta `original_name` de TMDB (fix para casos como "Attack on Titan" vs "Shingeki no Kyojin").
~~Cinecalidad~~ eliminado (todos sus dominios quedaron sin buscador funcional).

---

## D1 (mocchistream-db)

- `movie_metadata` — metadatos personalizados (external_url, title, custom_category, poster…)
- `episode_metadata` — PK `(series_url, season, episode)`: name, download_link, is_custom, updated_at
- `download_links` — PK `(item_id, type, season, episode)`: links de Telegram subidos por el bot
- `config` — key/value (avatar)
- `cache_keys` — claves cacheadas para stats/purge
- `users` · `sessions` (+`expires_at`, 30 días) — cuentas y sesiones
- `user_favorites` · `user_history` (+`anime`) · `user_watch_later` — listas sincronizadas
- `playlists` · `playlist_items` — playlists públicas
- `rate_limits` — contador de intentos por IP/ventana (login/registro)
- `tg_state` — estado conversacional del bot de Telegram

---

## Deploy

```bash
# Worker
CLOUDFLARE_ACCOUNT_ID=b7ccd04fa7c5cd02effd43406b25e4a7 CLOUDFLARE_API_TOKEN=<token> wrangler deploy

# Pages — SIEMPRE desde copia limpia SIN worker/ ni wrangler.toml (el código fuente no debe servirse como asset)
rsync -a --exclude worker --exclude wrangler.toml --exclude .git --exclude .wrangler --exclude docs --exclude README.md --exclude LICENSE . /tmp/opencode/mocchi-pages/
CLOUDFLARE_ACCOUNT_ID=b7ccd04fa7c5cd02effd43406b25e4a7 CLOUDFLARE_API_TOKEN=<token> wrangler pages deploy /tmp/opencode/mocchi-pages --project-name=mocchi-stream
```

Tras deploys repetidos, verificar con cache-bust (`?v=$(date +%s)`) — el CDN sirve HTML viejo por minutos.

---

## Estado actual (cierre 09-13)

- **En producción**: worker V4 (proveedor único Pelispedia, deploys 09-13 `3427de44`/`3a03654f`) + Pages `c2ab2462` (migración a Pelispedia)
- **Player propio funciona para**: vimeos.net, vimeos.zip, goodstream.one, hlswish.com, uqload.* (badge `⚡ Sin anuncios`)
- **iframe-only**: morencius, hglink/streamwish, voe, minochinos, vidhidepro, doodstream (+espejos), filelions
- **Git**: HEAD = `fd956c8` (auditoría 09-11). Cambios post-`fd956c8` SIN commitear (migración Pelispedia + limpieza 09-13) — **preguntar a Kael antes de subir**

## Lecciones guardadas

- hls.js 1.5+: `xhrSetup(xhr, url)` — la URL es 2º argumento string; `fetchSetup` debe **devolver un `Request`**
- Tokens de CDN (acek/dramiyos) **ligados al ASN** del que genera el embed → el worker (ASN datacenter) NO puede reproducir minochinos/vidhidepro
- Packer Dean Edwards: el dict usa `\"` (comillas dobles escapadas) — restaurar backslash simple al desempaquetar
- morencius (rebrand vidhide): el token `t=` del m3u8 caduca ~1.5h y el embed lo cachea → player propio solo viable con re-extracción de token fresco
- hglink/streamwish: ofuscador custom que exige navegador completo (fingerprint/cookies) → imposible en Workers
- voe.sx: anti-bot Altcha (PBKDF2 cost 10000) → requiere extractor dedicado, caro e inestable
- Verificar con `curl -H "Origin: https://<site>.pages.dev"` los endpoints cacheados