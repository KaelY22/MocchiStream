# MocchiStream

Reproductor y catálogo de streaming personal, **sin anuncios**, con portada curada, búsqueda universal y panel de administración privado.

MocchiStream agrega contenido de varios proveedores, combina los resultados en una sola interfaz y reproduce los episodios en un **reproductor propio** (HLS directo) sin los anuncios de las fuentes originales. Cuando una fuente no se puede resolver, cae a un iframe limpio.

- **Producción**: https://mocchi-stream.pages.dev
- **API**: `mocchistream.kael-iv22.workers.dev`
- **Base de datos**: Cloudflare D1 (`mocchistream-db`)
- **Plataforma**: Cloudflare Pages + Worker + D1

---

## Características

- **Portada (Selecciones)** con títulos curados y **Explorar** con 9 secciones (Películas, Series, Estrenos y 6 géneros, con animes separados).
- **Secciones combinadas** de varias fuentes con deduplicación por título y badge de proveedor.
- **Búsqueda universal** con acentos normalizados, agrupada por fuente y con filtros por tipo.
- **Reproductor propio sin anuncios** para las fuentes compatibles (HLS vía worker) con fallback a iframe.
- **Detalle full-screen**: póster, sinopsis, temporadas con pestañas, episodios clicables y compartir.
- **Mi lista**: Favoritos, Historial (máx. 40) y Ver después.
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
├── index.html            SPA (Selecciones + 5 vistas)
├── admin.html            Panel privado
├── manifest.webmanifest  PWA (standalone)
├── sw.js                 Service worker
├── css/
│   ├── style.css         Diseño dark con tokens
│   ├── fonts-material.css
│   └── fonts/            Inter y Material Symbols (locales)
├── js/
│   ├── utils.js          API base, helpers, toasts, persistencia
│   ├── catalog.js        Favoritos/historial, cards, tipos
│   ├── home.js           Portada, hero, secciones, scroll infinito
│   ├── search.js         Búsqueda con debounce y filtros
│   ├── categories.js     Tiles de categorías personalizadas
│   ├── library.js        Favoritos / Historial / Ver después
│   ├── detail.js         Detalle, temporadas, episodios, compartir
│   ├── player.js         Reproductor propio / iframe + fuentes
│   └── app.js            Boot, router, nav, deep links, admin modal
└── worker/
    ├── worker.js         API del Worker
    └── wrangler.toml     Configuración del deploy
```

## API del Worker

| Endpoint | Qué hace |
|---|---|
| `/api/search?q=&source=&type=` | Búsqueda en las fuentes configuradas |
| `/api/mainpage?section=&source=&page=` | Portada y secciones combinadas |
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