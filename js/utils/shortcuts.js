/**
 * Gerenciador de Atalhos de Teclado Globais — Fase 2
 *
 * Regras estritas de segurança/ergonomia:
 *   - Ignora completamente quando o foco estiver em <input>, <textarea>, <select> ou [contenteditable]
 *   - Ignora quando houver modal aberto (.modal-backdrop.is-open) ou Command Palette aberta
 *   - Ignora combinações com modificadores (Ctrl, Alt, Meta), exceto Ctrl/Cmd + K para a Command Palette
 *
 * Atalhos suportados:
 *   Ctrl/Cmd + K → Abre/fecha a Command Palette
 *   /            → Foca o campo de busca da tela atual (ou abre a Palette)
 *   n            → Nova tarefa (foca input de tarefa no projeto ou abre modal rápido)
 *   c            → Captura rápida na Inbox
 *   g h          → Ir para Home (#/home)
 *   g k          → Ir para Kanban (#/kanban)
 *   g i          → Ir para Inbox (#/inbox)
 *   ?            → Abre modal de ajuda de atalhos
 */

import { openCommandPalette, isPaletteOpen } from '../components/palette.js';
import { openQuickTaskModal } from '../components/palette.js';
import { openQuickInboxCaptureModal } from '../views/inbox.js';
import { openModal } from '../components/modal.js';
import { navigate } from '../router.js';

let _gPrefixActive = false;
let _gTimer = null;
let _initialized = false;

function _isEditableTarget(target) {
  if (!target || !(target instanceof Element)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable || target.closest('[contenteditable="true"]')) return true;
  return false;
}

function _isOverlayOpen() {
  if (isPaletteOpen()) return true;
  if (document.querySelector('.modal-backdrop.is-open')) return true;
  return false;
}

export function initShortcuts() {
  if (_initialized) return;
  _initialized = true;

  document.addEventListener('keydown', _handleGlobalKeyDown);
}

function _handleGlobalKeyDown(e) {
  // 1. Ctrl/Cmd + K → Command Palette
  if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
    if (document.querySelector('.modal-backdrop.is-open')) return;
    e.preventDefault();
    openCommandPalette();
    return;
  }

  // 2. Ignora se houver outros modificadores, modal/palette aberta ou foco em campo editável
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (_isOverlayOpen()) return;
  if (_isEditableTarget(e.target)) return;

  const key = e.key;

  // Sequência iniciada por 'g' (g h, g k, g i)
  if (_gPrefixActive) {
    _clearGPrefix();
    const lower = key.toLowerCase();
    if (lower === 'h') {
      e.preventDefault();
      navigate('#/home');
      return;
    }
    if (lower === 'k') {
      e.preventDefault();
      navigate('#/kanban');
      return;
    }
    if (lower === 'i') {
      e.preventDefault();
      navigate('#/inbox');
      return;
    }
  }

  if (key === 'g' || key === 'G') {
    _gPrefixActive = true;
    if (_gTimer) clearTimeout(_gTimer);
    _gTimer = setTimeout(() => { _gPrefixActive = false; }, 800);
    return;
  }

  // '/' → Foca a busca da tela
  if (key === '/') {
    e.preventDefault();
    const searchInput = document.getElementById('global-search-input') || document.querySelector('.search-input');
    if (searchInput) {
      searchInput.focus();
      searchInput.select?.();
    } else {
      openCommandPalette();
    }
    return;
  }

  // 'n' → Nova tarefa
  if (key === 'n' || key === 'N') {
    e.preventDefault();
    const projectTaskInput = document.getElementById('new-task-title-input');
    if (projectTaskInput && projectTaskInput.offsetParent !== null) {
      projectTaskInput.focus();
    } else {
      openQuickTaskModal();
    }
    return;
  }

  // 'c' → Captura rápida na Inbox
  if (key === 'c' || key === 'C') {
    e.preventDefault();
    openQuickInboxCaptureModal();
    return;
  }

  // '?' → Ajuda de atalhos
  if (key === '?') {
    e.preventDefault();
    openShortcutsHelpModal();
  }
}

function _clearGPrefix() {
  _gPrefixActive = false;
  if (_gTimer) {
    clearTimeout(_gTimer);
    _gTimer = null;
  }
}

export function openShortcutsHelpModal() {
  const body = document.createElement('div');
  body.className = 'shortcuts-help-grid';

  const shortcuts = [
    { keys: 'Ctrl / ⌘ + K', desc: 'Abrir Command Palette (busca global e ações)' },
    { keys: '/', desc: 'Focar campo de busca da tela atual' },
    { keys: 'N', desc: 'Criar nova tarefa rapidamente' },
    { keys: 'C', desc: 'Captura rápida na Inbox' },
    { keys: 'G  depois  H', desc: 'Ir para a Home (#/home)' },
    { keys: 'G  depois  K', desc: 'Ir para o Quadro Kanban (#/kanban)' },
    { keys: 'G  depois  I', desc: 'Ir para a Inbox (#/inbox)' },
    { keys: 'Alt + ◀ / ▶', desc: 'Mover cartão focado no Kanban entre colunas' },
    { keys: '?', desc: 'Exibir este guia de atalhos' },
    { keys: 'Esc', desc: 'Fechar modal, paleta ou cancelar arrasto' }
  ];

  for (const s of shortcuts) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:8px 10px;background:var(--bg-surface);border-radius:var(--radius-sm);border:1px solid var(--border-subtle);gap:12px;';
    row.innerHTML = `
      <span style="font-size:var(--text-sm);color:var(--text-secondary);">${s.desc}</span>
      <kbd style="background:var(--bg-card);padding:3px 8px;border-radius:var(--radius-xs);border:1px solid var(--border-highlight);font-size:var(--text-xs);white-space:nowrap;">${s.keys}</kbd>
    `;
    body.appendChild(row);
  }

  body.style.cssText = 'display:flex;flex-direction:column;gap:8px;';

  openModal({
    title: '⌨️ Atalhos de Teclado',
    body,
    hideCancel: true,
    confirmLabel: 'Entendi',
    onConfirm: () => {}
  });
}
