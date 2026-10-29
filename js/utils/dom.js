/**
 * Utilitários seguros de manipulação de DOM
 */

export function el(tag, attributes = {}, ...children) {
  const element = document.createElement(tag);

  for (const [key, value] of Object.entries(attributes)) {
    if (value === null || value === undefined) continue;

    if (key.startsWith('on') && typeof value === 'function') {
      const eventName = key.slice(2).toLowerCase();
      element.addEventListener(eventName, value);
    } else if (key === 'className' || key === 'class') {
      element.className = value;
    } else if (key === 'dataset') {
      for (const [dataKey, dataVal] of Object.entries(value)) {
        element.dataset[dataKey] = dataVal;
      }
    } else if (key === 'style' && typeof value === 'object') {
      Object.assign(element.style, value);
    } else if (key === 'checked' || key === 'disabled' || key === 'selected') {
      if (value) element.setAttribute(key, '');
      element[key] = Boolean(value);
    } else {
      element.setAttribute(key, String(value));
    }
  }

  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    if (Array.isArray(child)) {
      for (const subChild of child) {
        if (subChild instanceof Node) {
          element.appendChild(subChild);
        } else if (subChild !== null && subChild !== undefined && subChild !== false) {
          element.appendChild(document.createTextNode(String(subChild)));
        }
      }
    } else if (child instanceof Node) {
      element.appendChild(child);
    } else {
      element.appendChild(document.createTextNode(String(child)));
    }
  }

  return element;
}

export function clearChildren(parent) {
  while (parent.firstChild) {
    parent.removeChild(parent.firstChild);
  }
}

export function escapeHTML(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Prende o foco dentro de um elemento modal (Focus Trap para acessibilidade)
 */
export function trapFocus(element) {
  const focusableEls = element.querySelectorAll(
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
  );
  if (!focusableEls.length) return () => {};

  const firstEl = focusableEls[0];
  const lastEl = focusableEls[focusableEls.length - 1];

  function handleKeyDown(e) {
    if (e.key !== 'Tab') return;

    if (e.shiftKey) {
      if (document.activeElement === firstEl) {
        lastEl.focus();
        e.preventDefault();
      }
    } else {
      if (document.activeElement === lastEl) {
        firstEl.focus();
        e.preventDefault();
      }
    }
  }

  element.addEventListener('keydown', handleKeyDown);
  firstEl.focus();

  return () => {
    element.removeEventListener('keydown', handleKeyDown);
  };
}
