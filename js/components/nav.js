/**
 * Componente de Navegação (Header + Dock Mobile + Botão Command Palette + FAB da Inbox) — Fase 2
 */

import { getState, subscribe } from '../store/store.js';
import { openCommandPalette } from './palette.js';
import { openQuickInboxCaptureModal } from '../views/inbox.js';
import { openShortcutsHelpModal } from '../utils/shortcuts.js';

const NAV_ITEMS = [
  {
    hash: '#/home',
    label: 'Projetos',
    icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`
  },
  {
    hash: '#/kanban',
    label: 'Kanban',
    icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="5" height="18" rx="1"/><rect x="10" y="3" width="5" height="12" rx="1"/><rect x="17" y="3" width="5" height="15" rx="1"/></svg>`
  },
  {
    hash: '#/inbox',
    label: 'Inbox',
    isInbox: true,
    icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>`
  },
  {
    hash: '#/settings',
    label: 'Config',
    icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`
  }
];

let _header = null;
let _dock = null;
let _fab = null;
let _unsubscribeHash = null;
let _unsubscribeStore = null;

export function renderNav(appRoot) {
  // ── HEADER ─────────────────────────────────
  _header = document.createElement('header');
  _header.className = 'app-header';
  _header.setAttribute('role', 'banner');

  const container = document.createElement('div');
  container.className = 'header-container';

  // Marca / Logo
  const brand = document.createElement('a');
  brand.href = '#/home';
  brand.className = 'brand';
  brand.setAttribute('aria-label', 'Ir para a página inicial');
  brand.innerHTML = `
    <div class="brand-icon" aria-hidden="true">W</div>
    <span class="brand-title">wendell<span style="opacity:0.45">.dev</span></span>
  `;

  // Nav desktop
  const desktopNav = document.createElement('nav');
  desktopNav.className = 'desktop-nav';
  desktopNav.setAttribute('aria-label', 'Navegação principal');

  for (const item of NAV_ITEMS) {
    const link = document.createElement('a');
    link.href = item.hash;
    link.className = 'nav-link';
    link.setAttribute('aria-label', item.label);
    link.innerHTML = `
      ${item.icon}
      <span>${item.label}</span>
      ${item.isInbox ? '<span class="nav-inbox-badge tabular" style="display:none;">0</span>' : ''}
    `;
    desktopNav.appendChild(link);
  }

  // Ações do Header (Botão Command Palette visível em mobile/desktop + Ajuda + Rate Limit)
  const headerActions = document.createElement('div');
  headerActions.className = 'header-actions';

  const paletteBtn = document.createElement('button');
  paletteBtn.type = 'button';
  paletteBtn.className = 'btn btn-secondary btn-sm palette-trigger-btn';
  paletteBtn.setAttribute('aria-label', 'Abrir busca e comandos rápidos (Ctrl+K)');
  paletteBtn.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
    <span class="palette-trigger-label">Comandos</span>
    <kbd class="palette-trigger-kbd">⌘K</kbd>
  `;
  paletteBtn.addEventListener('click', () => openCommandPalette());

  const helpBtn = document.createElement('button');
  helpBtn.type = 'button';
  helpBtn.className = 'btn btn-ghost btn-icon btn-sm shortcuts-help-btn';
  helpBtn.setAttribute('aria-label', 'Atalhos de teclado (?)');
  helpBtn.title = 'Atalhos de teclado (?)';
  helpBtn.textContent = '?';
  helpBtn.addEventListener('click', () => openShortcutsHelpModal());

  const rateLimitEl = document.createElement('div');
  rateLimitEl.id = 'rate-limit-indicator';
  rateLimitEl.style.display = 'none';

  headerActions.appendChild(paletteBtn);
  headerActions.appendChild(helpBtn);
  headerActions.appendChild(rateLimitEl);

  container.appendChild(brand);
  container.appendChild(desktopNav);
  container.appendChild(headerActions);
  _header.appendChild(container);

  // ── DOCK MOBILE ───────────────────────────
  _dock = document.createElement('nav');
  _dock.className = 'mobile-dock';
  _dock.setAttribute('aria-label', 'Navegação inferior');

  for (const item of NAV_ITEMS) {
    const dockItem = document.createElement('a');
    dockItem.href = item.hash;
    dockItem.className = 'dock-item';
    dockItem.setAttribute('aria-label', item.label);
    dockItem.innerHTML = `
      <div class="dock-icon" aria-hidden="true" style="position:relative;">
        ${item.icon}
        ${item.isInbox ? '<span class="dock-inbox-badge tabular" style="display:none;">0</span>' : ''}
      </div>
      <span>${item.label}</span>
    `;
    _dock.appendChild(dockItem);
  }

  // ── BOTÃO FLUTUANTE DA INBOX RÁPIDA (FAB) ─
  _fab = document.createElement('button');
  _fab.type = 'button';
  _fab.className = 'inbox-fab';
  _fab.setAttribute('aria-label', 'Captura rápida na Inbox (Atalho: C)');
  _fab.title = 'Captura rápida na Inbox (Atalho: C)';
  _fab.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
    <span class="inbox-fab-label">Inbox</span>
  `;
  _fab.addEventListener('click', () => openQuickInboxCaptureModal());

  appRoot.appendChild(_header);
  document.body.appendChild(_fab);
  document.body.appendChild(_dock);

  _unsubscribeHash = _listenToHash();
  _unsubscribeStore = subscribe(() => _updateInboxBadges());
  _updateActiveLinks();
  _updateInboxBadges();
}

function _listenToHash() {
  function onHashChange() { _updateActiveLinks(); }
  window.addEventListener('hashchange', onHashChange);
  return () => window.removeEventListener('hashchange', onHashChange);
}

function _updateInboxBadges() {
  const state = getState();
  const pendingCount = (state?.inbox || []).filter(i => !i.completed).length;

  document.querySelectorAll('.nav-inbox-badge, .dock-inbox-badge').forEach(el => {
    if (pendingCount > 0) {
      el.style.display = 'inline-flex';
      el.textContent = String(pendingCount);
    } else {
      el.style.display = 'none';
    }
  });
}

function _updateActiveLinks() {
  const currentHash = window.location.hash || '#/home';

  if (_header) {
    const links = _header.querySelectorAll('.nav-link');
    links.forEach(link => {
      const isActive = currentHash.startsWith(link.getAttribute('href'));
      link.classList.toggle('is-active', isActive);
      link.setAttribute('aria-current', isActive ? 'page' : 'false');
    });
  }

  if (_dock) {
    const dockItems = _dock.querySelectorAll('.dock-item');
    dockItems.forEach(item => {
      const isActive = currentHash.startsWith(item.getAttribute('href'));
      item.classList.toggle('is-active', isActive);
      item.setAttribute('aria-current', isActive ? 'page' : 'false');
    });
  }
}

export function updateRateLimitIndicator(rateLimit) {
  const el = document.getElementById('rate-limit-indicator');
  if (!el) return;

  if (!rateLimit) {
    el.style.display = 'none';
    return;
  }

  const { remaining, limit, resetAt } = rateLimit;
  el.style.display = 'inline-flex';
  el.className = 'rate-limit-pill';

  const pct = remaining / limit;
  if (pct < 0.15) {
    el.classList.add('is-danger');
  } else if (pct < 0.35) {
    el.classList.add('is-warning');
  }

  el.setAttribute('title', resetAt ? `Renova em ${new Date(resetAt).toLocaleTimeString('pt-BR')}` : '');
  el.innerHTML = `
    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="12" r="10"/>
    </svg>
    ${remaining}/${limit}
  `;
}

export function destroyNav() {
  if (_unsubscribeHash) _unsubscribeHash();
  if (_unsubscribeStore) _unsubscribeStore();
  _fab?.remove();
  _dock?.remove();
  _header?.remove();
  _fab = null;
  _header = null;
  _dock = null;
}
