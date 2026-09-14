# MocchiStream

Reproductor y catálogo de streaming personal, **sin anuncios**, con portada curada, búsqueda universal y panel de administración privado.

MocchiStream agrega contenido de **Pelispedia** (proveedor único), lo organiza en una sola interfaz y reproduce los episodios en un **reproductor propio** (HLS directo) sin los anuncios de las fuentes originales. Cuando una fuente no se puede resolver, cae a un iframe limpio.

- **Producción**: https://mocchi-stream.pages.dev
- **API**: `mocchistream.kael-iv22.workers.dev`
- **Base de datos**: Cloudflare D1 (`mocchistream-db`)
- **Plataforma**: Cloudflare Pages + Worker + D1

---

## Características

- **Portada (Selecciones)** con títulos curados y **Explorar** con 9 secciones (Películas, Series, Estrenos y 6 géneros, con animes separados).
- **Secciones de Pelispedia** con deduplicación por título y badge de proveedor.
- **Búsqueda universal** con acentos normalizados y filtros por tipo.
- **Reproductor propio sin anuncios** para las fuentes compatibles (HLS vía worker) con fallback a iframe.
- **Detalle full-screen**: póster, sinopsis, temporadas con pestañas, episodios clicables y compartir.
- **Guardados**: Favoritos, Historial (máx. 40) y Ver después.
- **PWA instalable** + pull-to-refresh en la portada.
- **Descarga por capítulo** cuando el administrador la define; episodios solo-descarga sin streaming.
- **Panel de administración privado**: categorías personalizadas, catálogo, perfil y enlaces de descarga por capítulo.

---

## Stack

| Herramienta | Uso |
|---|---|
| HTML + CSS + JS vanilla | Frontend, ES modules sin build (sin frameworks) |
| hls.js 1.5.13 (local) | Reproductor HLS propio |
| Cloudflare Pages | Deploy del frontend |
| Cloudflare Worker | API de catálogo, búsqueda, stream y proxy |
| Cloudflare D1 | Metadatos, categorías personalizadas, perfil y caché |

Sin CDNs para tipografías ni iconos: todo vive local (`css/fonts/`), pensado para rendimiento y disponibilidad.

## Puesta en marcha

El frontend no requiere build: abre `index.html` o sírvelo estático.

Para la API:

```bash
# Deploy del Worker
wrangler deploy

# Deploy del frontend a Pages
wrangler pages deploy . --project-name=mocchi-stream
```

La configuración del worker (binding D1, secretos) vive en `wrangler.toml`. La autenticación de admin usa la variable de entorno `ADMIN_PASSWORD` (secreto).

> Los detalles de extracción de streams, hosts soportados, caché y el historial técnico están en `docs/DESARROLLO.md`.

---

## Estructura

```
├── index.html            MPA: Explorar (secciones + scroll infinito)
├── buscar.html           Resultados de búsqueda (?q=)
├── categorias.html       Categorías (?cat=peliculas|series|anime|kdrama)
├── favoritos.html        Favoritos
├── ver-despues.html      Ver después
├── historial.html        Historial
├── playlist.html         Playlists (próximamente)
├── detalle.html          Detalle (?id=&type=)
├── ver.html              Reproductor (?id=&season=&episode=)
├── admin.html            Panel privado
├── manifest.webmanifest  PWA (standalone)
├── sw.js                 Service worker
├── css/
│   ├── style.css         Diseño dark + tema claro con tokens
│   ├── fonts-material.css
│   └── fonts/            Inter y Material Symbols (locales)
├── js/
│   ├── utils.js          API base, helpers, toasts, persistencia
│   ├── catalog.js        Favoritos/historial, cards, tipos
│   ├── header.js         Tema, sidebar (menú), búsqueda, install, SW
│   ├── home.js           Portada, secciones, scroll infinito
│   ├── library.js        Listas por tipo (favs/wl/hist)
│   ├── detail.js         Detalle, temporadas, episodios, compartir
│   ├── player.js         Reproductor propio / iframe + fuentes
│   ├── app*.js           Boots por página (app, app-search, app-cat, app-lib, app-playlist, app-detail, app-ver)
│   └── admin.js          Panel admin
└── worker/
    ├── worker.js         API del Worker
    └── wrangler.toml     Configuración del deploy
```

## API del Worker

| Endpoint | Qué hace |
|---|---|
| `/api/search?q=` | Búsqueda en Pelispedia |
| `/api/mainpage?section=&page=` | Portada y secciones |
| `/api/details?url=` | Detalle + episodios + enlaces de descarga |
| `/api/links?url=` | Servidores del embed disponibles |
| `/api/stream?url=` | Resuelve embed → m3u8/mp4 para el reproductor propio |
| `/api/proxy?url=&ref=` | Passthrough del stream con retries y CORS |
| `/api/metadata` y `/api/categories` | Categorías personalizadas |
| `/api/avatar` | Avatar del perfil |
| `/api/admin/*` | Gestión privada (protegido con `X-Admin-Password`) |

---

## Documentación

- **`docs/DESARROLLO.md`** — arquitectura interna: proveedores, extracción de streams, caché, D1 y lecciones técnicas.

## Licencia

MIT — ver [LICENSE](LICENSE).

> Hecho con la ayuda de un compañero de código IA. ✨