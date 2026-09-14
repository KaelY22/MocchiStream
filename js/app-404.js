import { applyTheme, setupTheme, setupMenu, setupSearch, setupInstall, registerSW } from './header.js';

document.addEventListener('DOMContentLoaded', () => {
  applyTheme();
  setupTheme();
  setupMenu();
  setupSearch();
  setupInstall();
  registerSW();
});