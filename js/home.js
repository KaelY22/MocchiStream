import { API_BASE, esc } from './utils.js';
import { cardHtml, getHistory } from './catalog.js';
import { openDetailFromId } from './detail.js';

export function loadHome() {
  const home = document.getElementById('homeSections');
  if (home.dataset.loaded) return;
  home.dataset.loaded = '1';
  home.innerHTML = Array.from({ length: 4 }).map(() => `
    <div class="skeleton-section">
      ${Array.from({ length: 6 }).map(() => '<div class="skeleton skeleton-card"></div>').join('')}
    </div>
  `).join('');
  fetch(`${API_BASE}/mainpage`)
    .then(res => res.json())
    .then(data => {
      const sections = (data && data.sections) || [];
      if (sections.length === 0) {
        home.innerHTML = '<p class="empty-msg">No hay contenido disponible.</p>';
        return;
      }
      home.innerHTML = sections.map(sec => `
        <section class="home-section" data-slug="${esc(sec.slug)}">
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
          <div class="grid-horizontal" data-page="1">${sec.items.map(cardHtml).join('')}</div>
        </section>`;
      }).join('');
      [...home.querySelectorAll('.home-section')].forEach((sec, i) => {
        sec.classList.add('enter');
        sec.style.animationDelay = `${Math.min(i * 70, 420)}ms`;
        sec.addEventListener('animationend', () => { sec.classList.remove('enter'); sec.style.animationDelay = ''; }, { once: true });
      });
      bindHomeEvents(home);
      renderContinueRow();
    })
    .catch(() => {
      home.dataset.loaded = '';
      home.innerHTML = '<p class="empty-msg">Error al cargar la portada. Recarga la página.</p>';
    });
}

export function renderContinueRow() {
  const home = document.getElementById('homeSections');
  if (!home.dataset.loaded) return;
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

let sectionLoading = false;

function loadSectionMore(sec, gridEl) {
  if (sectionLoading) return;
  sectionLoading = true;
  const page = parseInt(gridEl.dataset.page) + 1;
  gridEl.dataset.page = page;
  const slug = sec.dataset.slug;
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
    .finally(() => { sectionLoading = false; });
}

export { openDetailFromId };