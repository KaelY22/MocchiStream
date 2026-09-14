import { API_BASE, esc } from './utils.js';
import { cardHtml, getHistory } from './catalog.js';

export function loadHome() {
  const home = document.getElementById('homeSections');
  if (home.dataset.loaded) return;
  home.dataset.loaded = '1';
  home.innerHTML = Array.from({ length: 4 }).map(() => `
    <div class="skeleton-section">
      ${Array.from({ length: 6 }).map(() => '<div class="skeleton skeleton-card"></div>').join('')}
    </div>
  `).join('');
  fetch(`${API_BASE}/sections`)
    .then(res => res.json())
    .then(sections => {
      if (!sections || sections.length === 0) {
        home.innerHTML = '<p class="empty-msg">No hay contenido disponible.</p>';
        return;
      }
      home.innerHTML = '';
      let idx = 0;
      let pending = 0;
      const finish = () => {
        if (pending > 0) return;
        if (!home.querySelector('.home-section')) {
          home.innerHTML = '<p class="empty-msg">No hay contenido disponible.</p>';
          return;
        }
        bindHomeEvents(home);
        renderContinueRow();
      };
      const loadNext = () => {
        if (idx >= sections.length) {
          finish();
          return;
        }
        const sec = sections[idx++];
        pending++;
        fetch(`${API_BASE}/mainpage?section=${encodeURIComponent(sec.slug)}`)
          .then(res => res.json())
          .then(items => {
            if (items && items.length) appendSection(home, sec, items, idx - 1);
          })
          .catch(() => {})
          .finally(() => { pending--; loadNext(); });
      };
      for (let k = 0; k < 4; k++) loadNext();
    })
    .catch(() => {
      home.dataset.loaded = '';
      home.innerHTML = '<p class="empty-msg">Error al cargar la portada. Recarga la página.</p>';
    });
}

function appendSection(home, sec, items, index) {
  const el = document.createElement('section');
  el.className = 'home-section enter';
  el.dataset.slug = esc(sec.slug);
  el.style.animationDelay = `${Math.min(index * 70, 420)}ms`;
  el.innerHTML = `
    <div class="section-head">
      <h2 class="section-title">${esc(sec.title)}</h2>
      <div class="sec-arrows">
        <button class="sec-arrow prev" aria-label="Anterior">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 19l-7-7 7-7"/></svg>
        </button>
        <button class="sec-arrow next" aria-label="Siguiente">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 19l-7-7 7-7"/></svg>
        </button>
      </div>
    </div>
    <div class="grid-horizontal" data-page="1">${items.map(cardHtml).join('')}</div>`;
  home.appendChild(el);
  el.addEventListener('animationend', () => { el.classList.remove('enter'); el.style.animationDelay = ''; }, { once: true });
}

export function renderContinueRow() {
  const home = document.getElementById('homeSections');
  if (!home || !home.dataset.loaded) return;
  let row = document.getElementById('continueRow');
  const recent = getHistory().slice(0, 12);
  if (!recent.length) {
    if (row) row.remove();
    return;
  }
  if (!row) {
    row = document.createElement('section');
    row.className = 'home-section enter';
    row.id = 'continueRow';
    home.prepend(row);
  }
  row.innerHTML = `
    <div class="section-head">
      <h2 class="section-title">Continuar viendo</h2>
    </div>
    <div class="grid-horizontal">${recent.map(cardHtml).join('')}</div>`;
}

function bindHomeEvents(home) {
  home.querySelectorAll('.home-section').forEach(sec => {
    const gridEl = sec.querySelector('.grid-horizontal');
    if (!gridEl) return;
    gridEl.addEventListener('scroll', () => {
      if (gridEl.dataset.done) return;
      if (gridEl.scrollLeft + gridEl.clientWidth >= gridEl.scrollWidth - 400) {
        loadSectionMore(sec, gridEl);
      }
    });
    const prev = sec.querySelector('.sec-arrow.prev');
    const next = sec.querySelector('.sec-arrow.next');
    if (prev) prev.addEventListener('click', () => gridEl.scrollBy({ left: -gridEl.clientWidth * 0.85, behavior: 'smooth' }));
    if (next) next.addEventListener('click', () => gridEl.scrollBy({ left: gridEl.clientWidth * 0.85, behavior: 'smooth' }));
  });
}

const loadingSections = new Set();

function loadSectionMore(sec, gridEl) {
  const slug = sec.dataset.slug;
  if (loadingSections.has(slug)) return;
  loadingSections.add(slug);
  const page = parseInt(gridEl.dataset.page) + 1;
  gridEl.dataset.page = page;
  fetch(`${API_BASE}/mainpage?section=${encodeURIComponent(slug)}&page=${page}`)
    .then(res => res.json())
    .then(items => {
      if (!items || items.length === 0) {
        gridEl.dataset.done = '1';
        return;
      }
      const existing = new Set([...gridEl.querySelectorAll('.video-card')].map(c => `${c.dataset.type}|${c.dataset.id}`));
      const fresh = items.filter(it => !existing.has(`${it.type}|${it.id}`));
      if (fresh.length) gridEl.insertAdjacentHTML('beforeend', fresh.map(cardHtml).join(''));
    })
    .catch(() => { gridEl.dataset.page = page - 1; })
    .finally(() => { loadingSections.delete(slug); });
}