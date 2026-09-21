import { showToast } from './utils.js';
import { loadLists } from './catalog.js';
import { loadHome } from './home.js';
import { initPage } from './header.js';

document.addEventListener('DOMContentLoaded', () => {
  initPage();
  loadLists();
  const params = new URLSearchParams(location.search);
  const deepId = params.get('t');
  if (deepId) {
    location.replace(`detalle.html?id=${encodeURIComponent(deepId)}&type=${encodeURIComponent(params.get('type') || 'movie')}`);
    return;
  }
  loadHome();
  setupPtr();
  document.addEventListener('click', e => {
    const card = e.target.closest('.video-card');
    if (card) location.href = `detalle.html?id=${encodeURIComponent(card.dataset.id)}&type=${encodeURIComponent(card.dataset.type)}`;
  });
});

let ptrStart = 0;
let ptrDist = 0;
let ptrTracking = false;
let ptrRefresh = false;

function setupPtr() {
  const indicator = document.getElementById('ptrIndicator');
  const arrow = indicator.querySelector('.ptr-arrow');
  window.addEventListener('touchstart', e => {
    if (window.scrollY > 0) return;
    ptrStart = e.touches[0].clientY;
    ptrDist = 0;
    ptrTracking = true;
    ptrRefresh = false;
  }, { passive: true });
  window.addEventListener('touchmove', e => {
    if (!ptrTracking) return;
    ptrDist = e.touches[0].clientY - ptrStart;
    if (ptrDist > 0 && window.scrollY <= 0) {
      e.preventDefault();
      const d = Math.min(ptrDist, 90);
      indicator.classList.remove('hidden');
      arrow.style.transform = `rotate(${Math.min(d / 90 * 360, 360)}deg)`;
      indicator.style.opacity = Math.min(d / 60, 1);
      indicator.style.transform = `translateY(${d * 0.5}px)`;
      ptrRefresh = d >= 60;
      arrow.textContent = ptrRefresh ? '↻' : '↓';
    }
  }, { passive: false });
  window.addEventListener('touchend', () => {
    if (!ptrTracking) return;
    ptrTracking = false;
    indicator.classList.add('hidden');
    indicator.style.opacity = 0;
    indicator.style.transform = 'translateY(0)';
    arrow.textContent = '↓';
    if (ptrRefresh) refreshHome();
  });
}

function refreshHome() {
  showToast('Actualizando...');
  const home = document.getElementById('homeSections');
  delete home.dataset.loaded;
  home.innerHTML = Array.from({ length: 4 }).map(() => `
    <div class="skeleton-section">
      ${Array.from({ length: 6 }).map(() => '<div class="skeleton skeleton-card"></div>').join('')}
    </div>
  `).join('');
  loadHome();
}