import { API_BASE, esc, showToast } from './utils.js';
import { addHistory, updateProgress, getHistory } from './catalog.js';

let currentSheetItem = null;
let pendingTitle = null;
let hlsInstance = null;
let controlsTimer = null;
let saveTimer = null;
let currentPlaying = null;
let currentNextResolver = null;
let currentNext = null;
let currentStream = null;
let downloading = false;
let sourceCandidates = [];
let candidateIdx = -1;
let originalVideoUrl = null;
let settingsHls = null;
let currentAudioTrack = -1;
let currentSubTrack = -1;
let currentSpeed = 1;

const FAST_HOSTS = /(?:vimeos\.(?:net|zip)|goodstream\.one|hlswish\.com|uqload\.[a-z]+)/i;
const IFRAME_HOSTS = /(?:vidhidepro\.com|morencius\.com|videoapp\.zip|filelions\.(?:live|online|to)|doodstream\.com|dooood\.com|doods\.pro|dood\.(?:la|to|so|ws|yt|li|wf|cx|sh|pm|watch)|d0000d\.com|d000d\.com|ds2play\.com|ds2video\.com|myvidplay\.com|playmogo\.com|vide0\.net|minochinos\.com)/i;

export function initPlayer() {
  document.getElementById('sourceSheet').addEventListener('click', e => {
    if (e.target === e.currentTarget || e.target.classList.contains('sheet-handle')) closeSheet();
  });

  const video = document.getElementById('playerVideoBox');
  video.addEventListener('click', toggleControls);
  video.addEventListener('dblclick', toggleFullscreen);
  document.getElementById('overlayPlayBtn').addEventListener('click', () => {
    video.play();
    hideOverlay();
    showControls(true);
  });
  document.getElementById('ctrlPlay').addEventListener('click', togglePlay);
  document.getElementById('ctrlBack').addEventListener('click', () => { video.currentTime = Math.max(0, video.currentTime - 10); });
  document.getElementById('ctrlFwd').addEventListener('click', () => { video.currentTime = video.currentTime + 10; });
  document.getElementById('ctrlFull').addEventListener('click', toggleFullscreen);
  document.getElementById('ctrlDownload').addEventListener('click', downloadCurrent);
  document.getElementById('ctrlSettings').addEventListener('click', toggleSettingsPanel);
  document.getElementById('ctrlSeek').addEventListener('input', e => {
    if (!isNaN(video.duration)) {
      video.currentTime = (e.target.value / 1000) * video.duration;
    }
  });
  video.addEventListener('timeupdate', () => {
    if (!saveTimer && video.currentTime > 0) {
      saveTimer = setTimeout(() => {
        saveTimer = null;
        saveProgress();
      }, 5000);
    }
    updateControls();
  });
  video.addEventListener('loadedmetadata', updateControls);
  video.addEventListener('play', () => {
    updatePlayIcon(true);
    hideOverlay();
    showBuffering(false);
  });
  video.addEventListener('pause', () => {
    updatePlayIcon(false);
    showOverlay();
    saveProgress();
  });
  video.addEventListener('waiting', () => {
    showBuffering(true);
    showControls(true);
  });
  video.addEventListener('playing', () => showBuffering(false));
  video.addEventListener('ended', onEnded);
  document.getElementById('endedReplayBtn').addEventListener('click', () => {
    hideEndedBox();
    video.currentTime = 0;
    video.play().catch(() => showOverlay());
  });
  document.getElementById('endedNextBtn').addEventListener('click', playNextEpisode);

  document.addEventListener('keydown', e => {
    const player = document.getElementById('fullPlayer');
    if (player.classList.contains('hidden')) return;
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      closeFullPlayer();
    } else if (e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault();
      togglePlay();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      video.currentTime = Math.max(0, video.currentTime - 10);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      video.currentTime = video.currentTime + 10;
    } else if (e.key.toLowerCase() === 'f') {
      toggleFullscreen();
    } else if (e.key.toLowerCase() === 'm') {
      video.muted = !video.muted;
      showToast(video.muted ? 'Silenciado' : 'Sonido activado');
    } else if (e.key.toLowerCase() === 's') {
      toggleSettingsPanel();
    }
  });
}

function togglePlay() {
  const video = document.getElementById('playerVideoBox');
  if (video.paused) video.play().catch(() => showOverlay());
  else video.pause();
}

function showBuffering(on) {
  document.getElementById('playerBuffering').classList.toggle('hidden', !on);
}

function hideEndedBox() {
  document.getElementById('endedBox').classList.add('hidden');
}

function saveProgress() {
  const video = document.getElementById('playerVideoBox');
  if (!currentPlaying || !video.duration || isNaN(video.duration)) return;
  updateProgress(currentPlaying, video.currentTime, video.duration);
}

function onEnded() {
  saveProgress();
  currentNext = currentNextResolver ? currentNextResolver(currentPlaying ? currentPlaying.url : '') : null;
  document.getElementById('endedNextBtn').classList.toggle('hidden', !currentNext);
  document.getElementById('endedBox').classList.remove('hidden');
  showControls(true);
}

function playNextEpisode() {
  if (!currentNext) return;
  hideEndedBox();
  const nxt = currentNext;
  currentNext = null;
  fetch(`${API_BASE}/links?url=${encodeURIComponent(nxt.link)}`)
    .then(res => res.json())
    .then(links => {
      if (!links || !links.length) {
        showToast('Este capítulo no tiene fuentes todavía.', true);
        closeFullPlayer();
        return;
      }
      const sorted = links.slice().sort((a, b) => (FAST_HOSTS.test(a) ? 0 : 1) - (FAST_HOSTS.test(b) ? 0 : 1));
      startPlayback(nxt.link, nxt.title, currentPlaying ? currentPlaying.poster : null, sorted[0], sorted);
    })
    .catch(() => {
      showToast('Error al cargar el siguiente capítulo.', true);
    });
}

function proxyUrl(url, ref) {
  const u = new URL(API_BASE + '/proxy');
  u.searchParams.set('url', url);
  if (ref) u.searchParams.set('ref', ref);
  return u.href;
}

function fetchStream(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  return fetch(`${API_BASE}/stream?url=${encodeURIComponent(url)}`, { signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

function hideOverlay() {
  document.getElementById('playerOverlay').classList.add('hide-overlay');
}

function showOverlay() {
  document.getElementById('playerOverlay').classList.remove('hide-overlay');
}

function showControls(on) {
  const stage = document.getElementById('playerStage');
  clearTimeout(controlsTimer);
  if (on) stage.classList.add('controls-on');
  else stage.classList.remove('controls-on');
  if (on && !document.getElementById('playerVideoBox').paused) {
    controlsTimer = setTimeout(() => stage.classList.remove('controls-on'), 2800);
  }
}

function toggleControls() {
  const stage = document.getElementById('playerStage');
  const settingPanel = document.getElementById('settingsPanel');
  if (stage.classList.contains('controls-on')) {
    stage.classList.remove('controls-on');
    settingPanel.classList.add('hidden');
  } else {
    stage.classList.add('controls-on');
    controlsTimer = setTimeout(() => {
      stage.classList.remove('controls-on');
      settingPanel.classList.add('hidden');
    }, 2800);
  }
}

function toggleFullscreen() {
  const el = document.getElementById('playerStage');
  if (document.fullscreenElement) {
    document.exitFullscreen();
  } else if (el.requestFullscreen) {
    el.requestFullscreen();
  }
}

function updatePlayIcon(playing) {
  const svg = document.getElementById('ctrlPlay').querySelector('svg');
  svg.innerHTML = playing
    ? '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 5h4v14H6zM14 5h4v14h-4z"/>'
    : '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5v14l11-7z"/>';
}

function formatTime(sec) {
  if (isNaN(sec)) return '0:00';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

function updateControls() {
  const video = document.getElementById('playerVideoBox');
  const seek = document.getElementById('ctrlSeek');
  if (!isNaN(video.duration) && video.duration > 0) {
    seek.value = Math.round((video.currentTime / video.duration) * 1000);
  }
  document.getElementById('ctrlTime').textContent = `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`;
}

function showPlayer(title, category) {
  document.getElementById('playerTitle').textContent = title;
  document.getElementById('playerCategory').textContent = category || 'Online';
  document.getElementById('fullPlayer').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function playIframe(videoUrl, title) {
  const iframeContainer = document.getElementById('playerIframeBox');
  const iframe = document.getElementById('playerIframe');
  iframeContainer.classList.remove('hidden');
  document.getElementById('playerStage').classList.add('hidden');
  document.getElementById('ctrlDownload').classList.add('hidden');
  currentStream = null;
  iframe.src = videoUrl;
  showPlayer(title, 'Fuente externa');
}

function tryNextFastSource(title, resumeAt, reason) {
  while (candidateIdx + 1 < sourceCandidates.length) {
    candidateIdx++;
    const next = sourceCandidates[candidateIdx];
    if (!FAST_HOSTS.test(next)) break;
    showToast(`Fuente agotada (${reason}). Probando la siguiente sin anuncios...`, false);
    fetchStream(next)
      .then(res => res.json())
      .then(s => {
        if (s && s.ok) {
          s.sourceUrl = next;
          playOwnPlayer(s, title, resumeAt);
        } else {
          tryNextFastSource(title, resumeAt, 'sin player disponible');
        }
      })
      .catch(() => tryNextFastSource(title, resumeAt, 'error de red'));
    return;
  }
  showToast(`Player propio falló (${reason}). Abriendo la externa...`, true);
  playIframe(originalVideoUrl || (sourceCandidates[candidateIdx] || ''), title);
}

function playOwnPlayer(stream, title, resumeAt) {
  const video = document.getElementById('playerVideoBox');
  document.getElementById('playerStage').classList.remove('hidden');
  document.getElementById('playerIframeBox').classList.add('hidden');
  document.getElementById('playerIframe').src = '';
  document.getElementById('ctrlDownload').classList.remove('hidden');
  currentStream = stream;
  showPlayer(title, 'MocchiPlayer · Sin anuncios');

  const onError = (reason) => {
    if (stream.retried) {
      destroyOwnPlayer();
      tryNextFastSource(title, resumeAt, reason);
    } else {
      stream.retried = true;
      destroyOwnPlayer();
      showToast('Reintentando la fuente con un token nuevo...', false);
      fetchStream(stream.sourceUrl)
        .then(res => res.json())
        .then(s => {
          if (s && s.ok) {
            s.sourceUrl = stream.sourceUrl;
            s.retried = true;
            playOwnPlayer(s, title, resumeAt);
          } else {
            tryNextFastSource(title, resumeAt, 'reintento no ok');
          }
        })
        .catch(() => tryNextFastSource(title, resumeAt, 'reintento error'));
    }
  };

  if (stream.type === 'hls' && window.Hls && Hls.isSupported()) {
    if (hlsInstance) hlsInstance.destroy();
    hlsInstance = new Hls({
      xhrSetup: (xhr, url) => xhr.open('GET', proxyUrl(url, stream.referer), true),
      fetchSetup: (ctx, init) => new Request(proxyUrl(ctx.url, stream.referer), init),
      manifestLoadingTimeOut: 10000,
      levelLoadingTimeOut: 10000,
      fragLoadingTimeOut: 8000,
      manifestLoadingMaxRetry: 3,
      levelLoadingMaxRetry: 3,
      fragLoadingMaxRetry: 2,
      progressive: false,
      maxBufferLength: 10,
      maxBufferSize: 20 * 1000 * 1000,
    });
    hlsInstance.on(Hls.Events.ERROR, (_evt, data) => {
      if (data.fatal) {
        const msg = data.err && data.err.message ? data.err.message.slice(0, 90) : '';
        const reason = `${data.details || data.type || ''}${msg ? ' | ' + msg : ''}`;
        hlsInstance.destroy();
        hlsInstance = null;
        onError(reason);
      }
    });
    hlsInstance.loadSource(stream.url);
    hlsInstance.attachMedia(video);
    hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
      settingsHls = hlsInstance;
      populateSettings();
      applySavedSettings();
      if (resumeAt > 0) {
        video.currentTime = resumeAt;
        showToast(`Continuando en ${formatTime(resumeAt)}`);
      }
      video.play().catch(() => showOverlay());
    });
  } else if (stream.type === 'mp4' || (stream.type === 'hls' && video.canPlayType('application/vnd.apple.mpegurl'))) {
    video.src = proxyUrl(stream.url, stream.referer);
    if (resumeAt > 0) {
      video.addEventListener('loadedmetadata', () => {
        video.currentTime = resumeAt;
        showToast(`Continuando en ${formatTime(resumeAt)}`);
      }, { once: true });
    }
    video.play().catch(() => showOverlay());
    video.addEventListener('error', onError, { once: true });
  } else {
    onError();
  }
}

function destroyOwnPlayer() {
  const video = document.getElementById('playerVideoBox');
  if (hlsInstance) {
    hlsInstance.destroy();
    hlsInstance = null;
  }
  video.pause();
  video.removeAttribute('src');
  video.load();
}

function safeFileName(name) {
  return String(name || 'video').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80);
}

function resolveUrl(u, base) {
  try { return new URL(u, base).href; } catch (e) { return u; }
}

function pickVariant(master, base) {
  if (!/#EXT-X-STREAM-INF/i.test(master)) return base;
  let best = null;
  const lines = master.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().startsWith('#EXT-X-STREAM-INF')) {
      const bw = parseInt((lines[i].match(/BANDWIDTH=(\d+)/) || [])[1] || '0', 10);
      const next = (lines[i + 1] || '').trim();
      if (next && !next.startsWith('#')) {
        const u = resolveUrl(next, base);
        if (!best || bw > best.bw) best = { bw, url: u };
      }
    }
  }
  return best ? best.url : base;
}

function parseSegments(media, base) {
  const segs = [];
  let expectUri = false;
  for (const raw of media.split('\n')) {
    const t = raw.trim();
    if (expectUri) {
      if (t && !t.startsWith('#')) { segs.push(resolveUrl(t, base)); expectUri = false; }
    } else if (t.startsWith('#EXTINF')) {
      expectUri = true;
    }
  }
  return segs;
}

async function streamToWriter(res, writer) {
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  const reader = res.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    await writer.write(value);
  }
}

async function downloadCurrent() {
  if (downloading) { showToast('Ya hay una descarga en curso...', true); return; }
  if (!currentStream || !currentStream.url) { showToast('Esta fuente no es descargable.', true); return; }
  if (typeof streamSaver === 'undefined' || !streamSaver.WritableStream) {
    showToast('Tu navegador no soporta la descarga directa.', true);
    return;
  }
  const name = safeFileName(currentPlaying ? currentPlaying.title : 'video');
  downloading = true;
  try {
    streamSaver.mitm = '/saver/mitm.html';
    if (currentStream.type === 'mp4') {
      showToast('Descarga iniciada — revisa tus descargas.');
      const fileStream = streamSaver.createWriteStream(`${name}.mp4`);
      const writer = fileStream.getWriter();
      try {
        await streamToWriter(await fetch(proxyUrl(currentStream.url, currentStream.referer)), writer);
      } finally {
        try { await writer.close(); } catch (e) {}
      }
      showToast('Descarga completada ✓');
    } else {
      const master = await (await fetch(proxyUrl(currentStream.url, currentStream.referer))).text();
      const variant = pickVariant(master, currentStream.url);
      const media = await (await fetch(proxyUrl(variant, currentStream.referer))).text();
      const segments = parseSegments(media, variant);
      if (!segments.length) throw new Error('sin segmentos');
      showToast(`Descargando ${name}.ts (${segments.length} partes)...`);
      const fileStream = streamSaver.createWriteStream(`${name}.ts`);
      const writer = fileStream.getWriter();
      try {
        for (let i = 0; i < segments.length; i++) {
          await streamToWriter(await fetch(proxyUrl(segments[i], currentStream.referer)), writer);
          if ((i + 1) % 10 === 0 || i === segments.length - 1) {
            showToast(`Descargando ${i + 1}/${segments.length} partes...`);
          }
        }
      } finally {
        try { await writer.close(); } catch (e) {}
      }
      showToast('Descarga completada ✓');
    }
  } catch (err) {
    showToast('Descarga externa fallida. Deberás intentar con descargas locales por parte del dev.', true);
  } finally {
    downloading = false;
  }
}

export function openFullPlayerExternal(title, videoUrl) {
  const finalTitle = pendingTitle || title || 'Sin título';
  pendingTitle = null;
  hideEndedBox();
  showBuffering(false);
  const h = currentPlaying ? getHistory().find(e => e.url === currentPlaying.url) : null;
  const resumeAt = (h && h.pos && h.dur && h.pos > 10 && h.pos < h.dur * 0.93) ? h.pos : 0;
  fetchStream(videoUrl)
    .then(res => res.json())
    .then(stream => {
      if (stream && stream.ok) {
        stream.sourceUrl = videoUrl;
        playOwnPlayer(stream, finalTitle, resumeAt);
      } else {
        playIframe(videoUrl, finalTitle);
      }
    })
    .catch(() => playIframe(videoUrl, finalTitle));
}

export function closeSheet() {
  document.getElementById('sourceSheet').classList.add('hidden');
  document.getElementById('sheetList').innerHTML = '';
}

export function closeFullPlayer() {
  saveProgress();
  destroyOwnPlayer();
  hideEndedBox();
  hideSettingsPanel();
  showBuffering(false);
  currentPlaying = null;
  currentNextResolver = null;
  currentNext = null;
  currentStream = null;
  sourceCandidates = [];
  candidateIdx = -1;
  originalVideoUrl = null;
  settingsHls = null;
  currentAudioTrack = -1;
  currentSubTrack = -1;
  currentSpeed = 1;
  document.getElementById('ctrlDownload').classList.add('hidden');
  document.getElementById('fullPlayer').classList.add('hidden');
  const iframe = document.getElementById('playerIframe');
  if (iframe) iframe.src = '';
  document.body.style.overflow = 'auto';
}

export function openSheet(url, title, poster, nextResolver) {
  currentSheetItem = { url, title: title || 'Contenido', poster: poster || null };
  currentNextResolver = nextResolver || null;
  currentNext = null;
  document.getElementById('sheetTitle').textContent = 'Seleccionar fuente';
  document.getElementById('sheetSub').textContent = title || '';
  const list = document.getElementById('sheetList');
  list.innerHTML = '<div class="hint"><span class="spinner"></span>Cargando fuentes...</div>';
  document.getElementById('sourceSheet').classList.remove('hidden');
  fetch(`${API_BASE}/links?url=${encodeURIComponent(url)}`)
    .then(res => res.json())
    .then(links => {
      if (!links || links.length === 0) {
        list.innerHTML = '<p class="error">No se encontraron fuentes de video.</p>';
        return;
      }
      const sorted = links.slice().sort((a, b) => {
        const fa = FAST_HOSTS.test(a) ? 0 : 1;
        const fb = FAST_HOSTS.test(b) ? 0 : 1;
        return fa - fb;
      });
      list.innerHTML = sorted.map(link => {
        try {
          const hostname = new URL(link).hostname;
          let extra = '';
          if (FAST_HOSTS.test(link)) extra = ' <span class="tag tag-fast">⚡ Sin anuncios</span>';
          else if (IFRAME_HOSTS.test(link)) extra = ' <span class="tag tag-ext">Con Anuncios</span>';
          else if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) extra = ' <span class="tag tag-trailer">Trailer</span>';
          else extra = ' <span class="tag tag-ext">Con Anuncios</span>';
          return `
            <button class="source-btn" data-url="${esc(link)}">
              <span class="source-icon">
                <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
              </span>
              <span class="source-name">${esc(hostname)}</span>${extra}
            </button>`;
        } catch (e) { return ''; }
      }).join('');
      list.querySelectorAll('.source-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const selectedUrl = btn.dataset.url;
          startPlayback(url, currentSheetItem.title, currentSheetItem.poster, selectedUrl, sorted);
        });
      });
    })
    .catch(() => {
      list.innerHTML = '<p class="error">Error al cargar fuentes.</p>';
    });
}

function startPlayback(url, title, poster, videoUrl, candidates) {
  addHistory({ url, title, poster: poster || null, source: '' });
  currentPlaying = { url, title, poster: poster || null };
  sourceCandidates = candidates || [];
  candidateIdx = sourceCandidates.indexOf(videoUrl);
  originalVideoUrl = videoUrl;
  closeSheet();
  openFullPlayerExternal(title, videoUrl);
}

const SPEED_OPTIONS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

function toggleSettingsPanel() {
  const panel = document.getElementById('settingsPanel');
  if (panel.classList.contains('hidden')) {
    panel.classList.remove('hidden');
    showControls(true);
  } else {
    hideSettingsPanel();
  }
}

function hideSettingsPanel() {
  const panel = document.getElementById('settingsPanel');
  panel.classList.add('hidden');
}

function buildCheckSvg() {
  return '<svg class="settings-item-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>';
}

function populateSettings() {
  if (!settingsHls) return;
  const qList = document.getElementById('settingsQualityList');
  const qSection = document.getElementById('settingsQualitySection');
  const sList = document.getElementById('settingsSpeedList');
  const aList = document.getElementById('settingsAudioList');
  const aSection = document.getElementById('settingsAudioSection');
  const subList = document.getElementById('settingsSubList');
  const subSection = document.getElementById('settingsSubSection');

  qList.innerHTML = `<button class="settings-item active" data-quality="-1"><span class="settings-item-label">Automática</span>${buildCheckSvg()}</button>`;
  settingsHls.levels.forEach((level, i) => {
    const h = level.height || level.bitrate ? Math.round(level.bitrate / 1000) + ' kbps' : `Nivel ${i + 1}`;
    const label = level.height ? `${level.height}p` : h;
    qList.innerHTML += `<button class="settings-item" data-quality="${i}"><span class="settings-item-label">${label}</span>${buildCheckSvg()}</button>`;
  });
  qSection.classList.toggle('hidden', settingsHls.levels.length < 2);
  qList.querySelectorAll('.settings-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.quality, 10);
      settingsHls.currentLevel = idx;
      localStorage.setItem('ms_quality', idx);
      qList.querySelectorAll('.settings-item').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  sList.innerHTML = '';
  SPEED_OPTIONS.forEach(spd => {
    const label = spd === 1 ? 'Normal' : spd + 'x';
    sList.innerHTML += `<button class="settings-item${spd === currentSpeed ? ' active' : ''}" data-speed="${spd}"><span class="settings-item-label">${label}</span>${buildCheckSvg()}</button>`;
  });
  sList.querySelectorAll('.settings-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const spd = parseFloat(btn.dataset.speed);
      document.getElementById('playerVideoBox').playbackRate = spd;
      currentSpeed = spd;
      localStorage.setItem('ms_speed', spd);
      sList.querySelectorAll('.settings-item').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  const audioTracks = settingsHls.audioTracks;
  if (audioTracks.length > 1) {
    aSection.classList.remove('hidden');
    aList.innerHTML = '';
    audioTracks.forEach((track, i) => {
      const label = track.name || track.lang || `Pista ${i + 1}`;
      aList.innerHTML += `<button class="settings-item" data-audio="${i}"><span class="settings-item-label">${label}</span>${buildCheckSvg()}</button>`;
    });
    aList.querySelectorAll('.settings-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.audio, 10);
        settingsHls.audioTrack = idx;
        currentAudioTrack = idx;
        aList.querySelectorAll('.settings-item').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });
  } else {
    aSection.classList.add('hidden');
  }

  const subTracks = settingsHls.subtitleTracks;
  if (subTracks.length > 0) {
    subSection.classList.remove('hidden');
    subList.innerHTML = `<button class="settings-item active" data-sub="-1"><span class="settings-item-label">Desactivados</span>${buildCheckSvg()}</button>`;
    subTracks.forEach((track, i) => {
      const label = track.name || track.lang || `Pista ${i + 1}`;
      subList.innerHTML += `<button class="settings-item" data-sub="${i}"><span class="settings-item-label">${label}</span>${buildCheckSvg()}</button>`;
    });
    subList.querySelectorAll('.settings-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.sub, 10);
        settingsHls.subtitleTrack = idx;
        settingsHls.subtitleDisplay = idx >= 0;
        currentSubTrack = idx;
        subList.querySelectorAll('.settings-item').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });
  } else {
    subSection.classList.add('hidden');
  }
}

function applySavedSettings() {
  if (!settingsHls) return;
  const savedQuality = localStorage.getItem('ms_quality');
  if (savedQuality !== null) {
    const idx = parseInt(savedQuality, 10);
    if (idx >= -1 && idx < settingsHls.levels.length) {
      settingsHls.currentLevel = idx;
      const btn = document.querySelector(`#settingsQualityList [data-quality="${idx}"]`);
      if (btn) {
        document.querySelectorAll('#settingsQualityList .settings-item').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      }
    }
  }
  const savedSpeed = localStorage.getItem('ms_speed');
  if (savedSpeed !== null) {
    const spd = parseFloat(savedSpeed);
    if (!isNaN(spd) && SPEED_OPTIONS.includes(spd)) {
      document.getElementById('playerVideoBox').playbackRate = spd;
      currentSpeed = spd;
      const btn = document.querySelector(`#settingsSpeedList [data-speed="${spd}"]`);
      if (btn) {
        document.querySelectorAll('#settingsSpeedList .settings-item').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      }
    }
  }
}