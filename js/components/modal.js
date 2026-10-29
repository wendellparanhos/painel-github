/**
 * Modal acessível com focus trap e fechamento via Escape.
 *
 * Uso:
 *   import { openModal, closeModal } from './modal.js';
 *   openModal({ title: 'Confirmar', body: el, onConfirm: fn });
 */

import { trapFocus } from '../utils/dom.js';

let _currentModal = null;
let _releaseFocusTrap = null;
let _previouslyFocused = null;

/**
 * @param {object} options
 * @param {string} options.title
 * @param {HTMLElement|string} options.body — nó DOM ou texto simples
 * @param {string} [options.confirmLabel='Confirmar']
 * @param {string} [options.cancelLabel='Cancelar']
 * @param {'danger'|'primary'} [options.confirmVariant='primary']
 * @param {Function} [options.onConfirm]
 * @param {Function} [options.onCancel]
 * @param {boolean} [options.hideCancel=false]
 */
export function openModal(options = {}) {
  if (_currentModal) closeModal();

  const {
    title = '',
    body = '',
    confirmLabel = 'Confirmar',
    cancelLabel = 'Cancelar',
    confirmVariant = 'primary',
    onConfirm = null,
    onCancel = null,
    hideCancel = false
  } = options;

  _previouslyFocused = document.activeElement;

  // Backdrop
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-label', title);

  // Dialog
  const dialog = document.createElement('div');
  dialog.className = 'modal-dialog';

  // Header
  const header = document.createElement('div');
  header.className = 'modal-header';

  const titleEl = document.createElement('h2');
  titleEl.style.fontSize = 'var(--text-lg)';
  titleEl.style.fontWeight = '700';
  titleEl.textContent = title;

  const closeBtn = document.createElement('button');
  closeBtn.className = 'btn btn-ghost btn-icon';
  closeBtn.setAttribute('aria-label', 'Fechar');
  closeBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
  closeBtn.addEventListener('click', () => {
    if (onCancel) onCancel();
    closeModal();
  });

  header.appendChild(titleEl);
  header.appendChild(closeBtn);

  // Body
  const bodyEl = document.createElement('div');
  bodyEl.className = 'modal-body';
  if (typeof body === 'string') {
    bodyEl.textContent = body;
  } else if (body instanceof Node) {
    bodyEl.appendChild(body);
  }

  // Footer
  const footer = document.createElement('div');
  footer.className = 'modal-footer';

  if (!hideCancel) {
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-secondary';
    cancelBtn.textContent = cancelLabel;
    cancelBtn.addEventListener('click', () => {
      if (onCancel) onCancel();
      closeModal();
    });
    footer.appendChild(cancelBtn);
  }

  if (onConfirm) {
    const confirmBtn = document.createElement('button');
    confirmBtn.className = `btn btn-${confirmVariant}`;
    confirmBtn.textContent = confirmLabel;
    confirmBtn.addEventListener('click', () => {
      onConfirm();
      closeModal();
    });
    footer.appendChild(confirmBtn);
  }

  dialog.appendChild(header);
  dialog.appendChild(bodyEl);
  dialog.appendChild(footer);
  backdrop.appendChild(dialog);
  document.body.appendChild(backdrop);

  // Ativa com pequeno delay para disparar transição CSS
  requestAnimationFrame(() => {
    requestAnimationFrame(() => backdrop.classList.add('is-open'));
  });

  // Focus trap
  setTimeout(() => {
    _releaseFocusTrap = trapFocus(dialog);
  }, 100);

  // Fecha ao clicar fora do dialog
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) {
      if (onCancel) onCancel();
      closeModal();
    }
  });

  // Fecha com Escape
  function handleKeyDown(e) {
    if (e.key === 'Escape') {
      if (onCancel) onCancel();
      closeModal();
    }
  }
  document.addEventListener('keydown', handleKeyDown);

  _currentModal = { backdrop, handleKeyDown };
}

export function closeModal() {
  if (!_currentModal) return;

  const { backdrop, handleKeyDown } = _currentModal;

  if (_releaseFocusTrap) {
    _releaseFocusTrap();
    _releaseFocusTrap = null;
  }

  document.removeEventListener('keydown', handleKeyDown);
  backdrop.classList.remove('is-open');

  setTimeout(() => {
    backdrop.remove();
    if (_previouslyFocused && _previouslyFocused.focus) {
      try { _previouslyFocused.focus(); } catch { /* silencioso */ }
    }
    _previouslyFocused = null;
  }, 200);

  _currentModal = null;
}
