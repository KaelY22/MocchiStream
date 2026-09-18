import { API_BASE, showToast } from './utils.js';

const TOKEN_KEY = 'ms_token';
const USER_KEY = 'ms_username';
const ADMIN_KEY = 'ms_is_admin';

const LOGIN_SVG = '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5-5-5-5M15 12H3"/></svg>';
const LOGOUT_SVG = '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>';
const ADMIN_SVG = '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function getUsername() {
  return localStorage.getItem(USER_KEY) || '';
}

export function isAdmin() {
  return localStorage.getItem(ADMIN_KEY) === '1';
}

export function isLoggedIn() {
  return !!getToken();
}

export function setSession(token, username, isAdmin = false) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, username);
  localStorage.setItem(ADMIN_KEY, isAdmin ? '1' : '0');
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(ADMIN_KEY);
  localStorage.removeItem('ms_favs');
  localStorage.removeItem('ms_history');
  localStorage.removeItem('ms_watchlater');
}

export async function authFetch(url, options = {}) {
  const headers = { ...options.headers };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(url, { ...options, headers });
  if (res.status === 401) {
    clearSession();
    throw new Error('Sesión expirada');
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Error ${res.status}`);
  }
  return res.json();
}

export async function checkSession() {
  const token = getToken();
  if (!token) return false;
  try {
    const data = await fetch(`${API_BASE}/auth/me`, {
      headers: { 'Authorization': `Bearer ${token}` }
    }).then(r => { if (!r.ok) throw 0; return r.json(); });
    if (data.username) {
      localStorage.setItem(USER_KEY, data.username);
      localStorage.setItem(ADMIN_KEY, data.isAdmin ? '1' : '0');
      return true;
    }
  } catch (e) {}
  clearSession();
  return false;
}

export function setupAuth() {
  const foot = document.querySelector('.sidebar-foot');
  if (!foot) return;
  const link = document.createElement('a');
  link.className = 'sidebar-item';
  link.href = isLoggedIn() ? '#' : 'login.html';
  renderAuthLink(link);
  foot.prepend(link);

  if (isLoggedIn() && isAdmin()) {
    const adminLink = document.createElement('a');
    adminLink.className = 'sidebar-item';
    adminLink.href = '/admin';
    adminLink.innerHTML = `${ADMIN_SVG}Admin`;
    link.after(adminLink);
  }

  if (isLoggedIn()) {
    link.addEventListener('click', async e => {
      e.preventDefault();
      try {
        await authFetch(`${API_BASE}/auth/logout`, { method: 'POST' });
      } catch (e) {}
      clearSession();
      renderAuthLink(link);
      link.href = 'login.html';
      showToast('Sesión cerrada');
      setTimeout(() => location.reload(), 600);
    });
  }
}

function renderAuthLink(link) {
  if (isLoggedIn()) {
    link.innerHTML = `${LOGOUT_SVG}${getUsername()} · Cerrar sesión`;
    link.href = '#';
  } else {
    link.innerHTML = `${LOGIN_SVG}Iniciar sesión`;
    link.href = 'login.html';
  }
}
