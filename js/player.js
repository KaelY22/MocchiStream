import { API_BASE, esc, showToast } from './utils.js';
import { addHistory, updateProgress, getHistory, itemKey } from './catalog.js';

let pendingTitle = null;
let hlsInstance = null;
let controlsTimer = null;
let saveTimer = null;
let currentPlaying = null;
let currentNextResolver = null;
let currentNext = null;
let currentStream = null;
let downloading = false;
let settingsHls = null;
let currentAudioTrack = -1;
let currentSubTrack = -1;
let currentSpeed = 1;

export function initPlayer() {
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
    showControls(false);
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

function showLoading(on) {
  document.getElementById('playerLoading').classList.toggle('hidden', !on);
  if (on) showControls(false);
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
  currentNext = currentNextResolver ? currentNextResolver(currentPlaying && currentPlaying._ep ? currentPlaying._ep : null) : null;
  document.getElementById('endedNextBtn').classList.toggle('hidden', !currentNext);
  document.getElementById('endedBox').classList.remove('hidden');
  showControls(true);
}

function playNextEpisode() {
  if (!currentNext || !currentPlaying) return;
  hideEndedBox();
  const nxt = currentNext;
  currentNext = null;
  location.href = `ver.html?id=${encodeURIComponent(currentPlaying.id)}&type=${encodeURIComponent(currentPlaying.type)}&season=${nxt.season}&episode=${nxt.episode}`;
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
  const panelOpen = !document.getElementById('settingsPanel').classList.contains('hidden');
  if (on && !document.getElementById('playerVideoBox').paused && !panelOpen) {
    controlsTimer = setTimeout(() => stage.classList.remove('controls-on'), 2800);
  }
}

function toggleControls() {
  const stage = document.getElementById('playerStage');
  if (stage.classList.contains('controls-on')) stage.classList.remove('controls-on');
  else {
    stage.classList.add('controls-on');
    clearTimeout(controlsTimer);
    controlsTimer = setTimeout(() => stage.classList.remove('controls-on'), 2800);
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
  showPlayer(title, 'Fuente externa · con anuncios');
}

export function playItem(item, ep, nextResolver) {
  const title = ep ? `${item.title} — Cap ${ep.episode}` : item.title;
  addHistory({ id: item.id, type: item.type, title: item.title, poster: item.poster });
  currentPlaying = { id: item.id, type: item.type, title: item.title, poster: item.poster || null, url: itemKey(item), _ep: ep || null };
  currentNextResolver = nextResolver || null;
  currentNext = null;
  hideEndedBox();
  hideSettingsPanel();
  showLoading(true);
  showPlayer(title, item.type === 'tv' ? 'Serie' : 'Película');
  const h = getHistory().find(e => itemKey(e) === itemKey(item));
  const resumeAt = (h && h.posAt && h.durAt && h.posAt > 10 && h.posAt < h.durAt * 0.93) ? h.posAt : 0;
  const params = new URLSearchParams({ title: item.title, type: item.type });
  if (item.year) params.set('year', item.year);
  if (ep) { params.set('season', ep.season); params.set('episode', ep.episode); }
  if (item.anime) params.set('anime', '1');
  fetch(`${API_BASE}/play?${params}`)
    .then(res => res.json())
    .then(data => {
      showLoading(false);
      if (data && data.ok && data.url) {
        playOwnPlayer(data, title, resumeAt);
      } else if (data && data.iframe) {
        playIframe(data.iframe, title);
      } else {
        showToast('No se encontró una fuente sin anuncios para este título.', true);
        closeFullPlayer();
      }
    })
    .catch(() => {
      showLoading(false);
      showToast('Error al buscar la fuente.', true);
      closeFullPlayer();
    });
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
      showToast(`La fuente falló (${reason}). Prueba con otro título o más tarde.`, true);
      closeFullPlayer();
    } else {
      stream.retried = true;
      destroyOwnPlayer();
      showToast('Reintentando la fuente con un token nuevo...', false);
      fetchStream(stream.sourceUrl || stream.url)
        .then(res => res.json())
        .then(s => {
          if (s && s.ok) {
            s.sourceUrl = stream.sourceUrl || stream.url;
            s.retried = true;
            playOwnPlayer(s, title, resumeAt);
          } else {
            showToast('La fuente falló. Prueba con otro título o más tarde.', true);
            closeFullPlayer();
          }
        })
        .catch(() => {
          showToast('Error de red al reintentar.', true);
          closeFullPlayer();
        });
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
    video.addEventListener('error', (e) => onError(e.message || 'Error de reproducción'), { once: true });
  } else {
    onError('Fuente no compatible');
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
    if (t.startsWith('#EXT-X-KEY')) throw new Error('stream cifrado (AES) no descargable');
    if (t.startsWith('#EXT-X-BYTERANGE')) throw new Error('stream con byte-range no descargable');
    if (t.startsWith('#EXT-X-MAP')) throw new Error('stream fMP4 no descargable');
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
          let ok = false;
          for (let attempt = 0; attempt < 2 && !ok; attempt++) {
            try {
              await streamToWriter(await fetch(proxyUrl(segments[i], currentStream.referer)), writer);
              ok = true;
            } catch (e) {
              if (attempt === 1) throw e;
              await new Promise(r => setTimeout(r, 800));
            }
          }
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

export function closeFullPlayer() {
  saveProgress();
  destroyOwnPlayer();
  hideEndedBox();
  hideSettingsPanel();
  showBuffering(false);
  showLoading(false);
  currentPlaying = null;
  currentNextResolver = null;
  currentNext = null;
  currentStream = null;
  settingsHls = null;
  currentAudioTrack = -1;
  currentSubTrack = -1;
  currentSpeed = 1;
  document.getElementById('ctrlDownload').classList.add('hidden');
  document.getElementById('fullPlayer').classList.add('hidden');
  const iframe = document.getElementById('playerIframe');
  if (iframe) iframe.src = '';
  document.body.style.overflow = 'auto';
  history.back();
}

const SPEED_OPTIONS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

function toggleSettingsPanel() {
  const panel = document.getElementById('settingsPanel');
  if (panel.classList.contains('hidden')) {
    panel.classList.remove('hidden');
    clearTimeout(controlsTimer);
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
      const label = esc(track.name || track.lang || `Pista ${i + 1}`);
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
      const label = esc(track.name || track.lang || `Pista ${i + 1}`);
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