/**
 * Sistema de Toasts (notificações não-bloqueantes)
 *
 * Uso:
 *   import { showToast } from './toast.js';
 *   showToast('Tarefa excluída', { action: { label: 'Desfazer', fn: () => store.undo() } });
 */

let _container = null;
const _activeToasts = new Map(); // id → { element, timerId }
let _idCounter = 0;

function _getContainer() {
  if (_container && document.body.contains(_container)) return _container;

  _container = document.createElement('div');
  _container.className = 'toast-container';
  _container.setAttribute('aria-live', 'polite');
  _container.setAttribute('aria-atomic', 'false');
  document.body.appendChild(_container);
  return _container;
}

/**
 * Exibe um toast.
 * @param {string} message
 * @param {object} options
 * @param {'success'|'warning'|'error'|'info'|'default'} options.type
 * @param {number} options.duration — ms antes de fechar automaticamente (0 = manual)
 * @param {{ label: string, fn: Function }} options.action — botão de ação (ex.: Desfazer)
 */
export function showToast(message, options = {}) {
  const {
    type = 'default',
    duration = 5000,
    action = null
  } = options;

  const container = _getContainer();
  const id = ++_idCounter;

  // Ícones por tipo
  const icons = {
    success: '✓',
    warning: '⚠',
    error: '✕',
    info: 'ℹ',
    default: ''
  };

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.setAttribute('role', 'status');

  // Cores de borda por tipo
  if (type === 'success') toast.style.borderColor = 'rgba(16, 185, 129, 0.4)';
  else if (type === 'error') toast.style.borderColor = 'rgba(239, 68, 68, 0.4)';
  else if (type === 'warning') toast.style.borderColor = 'rgba(245, 158, 11, 0.4)';

  const contentEl = document.createElement('div');
  contentEl.className = 'toast-content';

  if (icons[type]) {
    const iconEl = document.createElement('span');
    iconEl.textContent = icons[type];
    iconEl.style.flexShrink = '0';
    if (type === 'success') iconEl.style.color = '#10b981';
    else if (type === 'error') iconEl.style.color = '#f87171';
    else if (type === 'warning') iconEl.style.color = '#fbbf24';
    contentEl.appendChild(iconEl);
  }

  const msgEl = document.createElement('span');
  msgEl.textContent = message;
  contentEl.appendChild(msgEl);

  toast.appendChild(contentEl);

  if (action) {
    const actionBtn = document.createElement('button');
    actionBtn.className = 'toast-action';
    actionBtn.textContent = action.label;
    actionBtn.addEventListener('click', () => {
      action.fn();
      _dismissToast(id);
    });
    toast.appendChild(actionBtn);
  }

  // Botão de fechar
  const closeBtn = document.createElement('button');
  closeBtn.className = 'btn btn-ghost btn-icon btn-sm';
  closeBtn.setAttribute('aria-label', 'Fechar notificação');
  closeBtn.style.cssText = 'width:32px;height:32px;min-height:32px;flex-shrink:0;color:var(--text-muted);';
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', () => _dismissToast(id));
  toast.appendChild(closeBtn);

  container.appendChild(toast);

  let timerId = null;
  if (duration > 0) {
    timerId = setTimeout(() => _dismissToast(id), duration);
  }

  _activeToasts.set(id, { element: toast, timerId });
  return id;
}

function _dismissToast(id) {
  const entry = _activeToasts.get(id);
  if (!entry) return;

  const { element, timerId } = entry;
  if (timerId) clearTimeout(timerId);

  element.style.transition = 'opacity 200ms ease, transform 200ms ease';
  element.style.opacity = '0';
  element.style.transform = 'translateY(10px) scale(0.95)';

  setTimeout(() => {
    element.remove();
    _activeToasts.delete(id);
  }, 200);
}

export function dismissToast(id) {
  _dismissToast(id);
}
