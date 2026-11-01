/**
 * Componente Reutilizável de Empty States Ilustrados em SVG — Fase 6.
 */

export function renderEmptyState({
  illustration = 'empty_box',
  title = 'Nenhum item encontrado',
  description = 'Não há itens registrados ou compatíveis com os filtros selecionados.',
  actionLabel = null,
  onAction = null
} = {}) {
  const container = document.createElement('div');
  container.className = 'empty-state-box';
  container.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:3rem 1.5rem;max-width:440px;margin:2rem auto;';

  let svgHtml = '';
  if (illustration === 'search') {
    svgHtml = `
      <svg width="68" height="68" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.6;margin-bottom:1rem;">
        <circle cx="11" cy="11" r="8"></circle>
        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        <line x1="8" y1="11" x2="14" y2="11"></line>
      </svg>
    `;
  } else if (illustration === 'inbox') {
    svgHtml = `
      <svg width="68" height="68" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.6;margin-bottom:1rem;">
        <polyline points="22 12 16 12 14 15 10 15 8 12 2 12"></polyline>
        <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"></path>
      </svg>
    `;
  } else if (illustration === 'focus') {
    svgHtml = `
      <svg width="68" height="68" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.6;margin-bottom:1rem;">
        <circle cx="12" cy="12" r="10"></circle>
        <polyline points="12 6 12 12 16 14"></polyline>
      </svg>
    `;
  } else {
    // empty_box / repos
    svgHtml = `
      <svg width="68" height="68" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.6;margin-bottom:1rem;">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
        <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
        <line x1="12" y1="22.08" x2="12" y2="12"></line>
      </svg>
    `;
  }

  container.innerHTML = `
    ${svgHtml}
    <h3 style="font-size:var(--text-base);font-weight:700;color:var(--text-main);margin-bottom:6px;">
      ${title}
    </h3>
    <p style="font-size:var(--text-xs);color:var(--text-secondary);line-height:1.5;margin-bottom:1rem;">
      ${description}
    </p>
  `;

  if (actionLabel && typeof onAction === 'function') {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-secondary btn-sm';
    btn.textContent = actionLabel;
    btn.addEventListener('click', onAction);
    container.appendChild(btn);
  }

  return container;
}
