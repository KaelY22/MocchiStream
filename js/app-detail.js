import { showToast } from './utils.js';
import { loadLists } from './catalog.js';
import { initDetail, openDetail, closeDetail, fetchItem } from './detail.js';
import { initPage } from './header.js';

document.addEventListener('DOMContentLoaded', () => {
  initPage();
  loadLists();
  initDetail();
  document.getElementById('detailShareBtn').addEventListener('click', shareTitle);
  const params = new URLSearchParams(location.search);
  const id = params.get('id');
  const type = params.get('type') || 'movie';
  if (!id) {
    showToast('Falta el título.', true);
    return;
  }
  fetchItem(id, type)
    .then(item => openDetail(item))
    .catch(() => showToast('No se pudo cargar el título.', true));
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') { e.target.blur(); return; }
    closeDetail();
  });
});

window.closeDetail = closeDetail;

function shareTitle() {
  const btn = document.getElementById('detailShareBtn');
  const id = btn.dataset.id;
  const type = btn.dataset.type;
  const title = btn.dataset.title;
  if (!id) return;
  const link = `${location.origin}/detalle.html?id=${encodeURIComponent(id)}&type=${encodeURIComponent(type || 'movie')}`;
  const text = `${title} — Míralo en MocchiStream`;
  if (navigator.share) {
    navigator.share({ title, text, url: link }).catch(() => {});
  } else if (navigator.clipboard) {
    navigator.clipboard.writeText(`${text} ${link}`).then(() => showToast('Enlace copiado')).catch(() => showToast('No se pudo copiar', true));
  } else {
    showToast('No se pudo compartir', true);
  }
}