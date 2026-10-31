/**
 * Modo Bolhas (Experimental, Carregado sob demanda) — Fase 3
 *
 * Especificação atendida:
 *   - Elementos flutuantes arrastáveis (Pointer Events) com limite estrito de objetos (`maxBubbles`)
 *   - Botão de reorganizar e botão de fallback imediato para Grid
 *   - Física de colisão + amortecimento que PARA completamente o loop de rAF quando estabiliza
 *     (zero consumo de CPU quando parada)
 *   - Alternativa/fallback automático em nível mínimo ou `prefers-reduced-motion`
 */

import { getState, dispatch } from '../store/store.js';
import { getMergedProjects, filterAndSortProjects } from '../utils/domain.js';
import {
  addFrameListener,
  getFxLevel,
  isReducedMotion,
  getObjectLimits,
  registerViewEffect
} from '../fx/effects.js';
import { navigate } from '../router.js';

const STATUS_BORDER = {
  'ideia': '#a855f7',
  'em andamento': '#06b6d4',
  'pausado': '#f59e0b',
  'concluído': '#10b981',
  'arquivado': '#64748b'
};

/**
 * Monta o palco experimental de bolhas dentro de um container (ex.: na Home ou em `#/bubbles`).
 * @param {HTMLElement} hostEl
 * @param {Array} items — lista de projetos filtrados
 * @param {Function} onFallbackToGrid — callback para voltar ao modo Grid
 * @returns {{ destroy: Function }}
 */
export function mountBubblesStage(hostEl, items, onFallbackToGrid) {
  hostEl.innerHTML = '';

  const limits = getObjectLimits();
  const maxBubbles = limits.maxBubbles || 30;
  const visibleItems = items.slice(0, maxBubbles);

  const wrapper = document.createElement('div');
  wrapper.className = 'bubbles-stage-wrapper card';

  // Barra superior do Modo Bolhas
  const topBar = document.createElement('div');
  topBar.className = 'bubbles-stage-header';
  topBar.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
      <span class="badge badge-ideia">🫧 Experimental</span>
      <span style="font-size:var(--text-xs);color:var(--text-secondary);">
        Exibindo <strong>${visibleItems.length}</strong> de <strong>${items.length}</strong> projeto(s). Arraste as bolhas ou clique duas vezes para abrir.
      </span>
      <span id="bubbles-cpu-pill" class="widget-origin-tag tabular">Física ativa</span>
    </div>
  `;

  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;';

  const reorgBtn = document.createElement('button');
  reorgBtn.type = 'button';
  reorgBtn.className = 'btn btn-secondary btn-sm';
  reorgBtn.textContent = '🔄 Reorganizar';

  const gridFallbackBtn = document.createElement('button');
  gridFallbackBtn.type = 'button';
  gridFallbackBtn.className = 'btn btn-primary btn-sm';
  gridFallbackBtn.textContent = '⊞ Voltar para Grid';
  gridFallbackBtn.addEventListener('click', () => {
    if (typeof onFallbackToGrid === 'function') {
      onFallbackToGrid();
    } else {
      dispatch({ type: 'CONFIG_UPDATE', payload: { homeViewMode: 'grid' } });
      navigate('#/home');
    }
  });

  actions.appendChild(reorgBtn);
  actions.appendChild(gridFallbackBtn);
  topBar.appendChild(actions);

  const arena = document.createElement('div');
  arena.className = 'bubbles-arena';
  arena.setAttribute('role', 'region');
  arena.setAttribute('aria-label', 'Arena de bolhas de projetos');

  wrapper.appendChild(topBar);
  wrapper.appendChild(arena);
  hostEl.appendChild(wrapper);

  let arenaWidth = Math.max(320, arena.clientWidth || 860);
  let arenaHeight = 460;

  // Cria nós de bolhas
  const bubbles = visibleItems.map((proj, idx) => {
    const r = Math.max(42, Math.min(68, 44 + proj.openTasksCount * 4 + Math.min(12, proj.stars * 1.5)));
    const cols = Math.max(3, Math.floor(arenaWidth / 135));
    const col = idx % cols;
    const row = Math.floor(idx / cols);

    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'project-bubble-node';
    el.style.width = `${r * 2}px`;
    el.style.height = `${r * 2}px`;
    el.style.borderColor = proj.customColor || STATUS_BORDER[proj.status] || '#8b5cf6';
    el.setAttribute('aria-label', `${proj.name} (${proj.status}) — Enter para abrir`);
    el.innerHTML = `
      <span class="bubble-node-icon">${proj.customIcon || '📦'}</span>
      <span class="bubble-node-name">${_escape(proj.name)}</span>
      <span class="bubble-node-meta tabular">${proj.doneTasksCount}/${proj.tasks.length}</span>
    `;

    // Acessibilidade por teclado: Enter abre o projeto diretamente
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        navigate(`#/project/${proj.repoId}`);
      }
    });

    arena.appendChild(el);

    return {
      proj,
      el,
      r,
      x: 80 + col * 130 + (row % 2) * 30,
      y: 80 + row * 115,
      vx: (idx % 2 === 0 ? 1 : -1) * 0.8,
      vy: (idx % 3 === 0 ? 1 : -1) * 0.6,
      dragging: false
    };
  });

  let removeFrame = null;
  let settled = false;
  let ticks = 0;

  function stopPhysics() {
    if (removeFrame) {
      removeFrame();
      removeFrame = null;
    }
  }

  function updateCpuPill(text) {
    const pill = wrapper.querySelector('#bubbles-cpu-pill');
    if (pill) pill.textContent = text;
  }

  function renderPositions() {
    for (const b of bubbles) {
      b.el.style.transform = `translate3d(${(b.x - b.r).toFixed(1)}px, ${(b.y - b.r).toFixed(1)}px, 0)`;
    }
  }

  function stepPhysics() {
    arenaWidth = Math.max(320, arena.clientWidth || 860);
    arenaHeight = Math.max(380, arena.clientHeight || 460);
    const damping = 0.88;
    let totalEnergy = 0;

    // Colisão elástica amortecida entre bolhas
    for (let i = 0; i < bubbles.length; i++) {
      const a = bubbles[i];
      for (let j = i + 1; j < bubbles.length; j++) {
        const b = bubbles[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.max(1, Math.hypot(dx, dy));
        const minDist = a.r + b.r + 6;
        if (dist < minDist) {
          const overlap = (minDist - dist) * 0.35;
          const nx = dx / dist;
          const ny = dy / dist;
          if (!a.dragging) { a.vx -= nx * overlap * 0.25; a.vy -= ny * overlap * 0.25; a.x -= nx * overlap * 0.5; a.y -= ny * overlap * 0.5; }
          if (!b.dragging) { b.vx += nx * overlap * 0.25; b.vy += ny * overlap * 0.25; b.x += nx * overlap * 0.5; b.y += ny * overlap * 0.5; }
        }
      }
    }

    // Integração e limites das bordas da arena
    for (const b of bubbles) {
      if (b.dragging) continue;
      b.vx *= damping;
      b.vy *= damping;
      b.x += b.vx;
      b.y += b.vy;

      if (b.x - b.r < 8) { b.x = b.r + 8; b.vx = Math.abs(b.vx) * 0.6; }
      if (b.x + b.r > arenaWidth - 8) { b.x = arenaWidth - b.r - 8; b.vx = -Math.abs(b.vx) * 0.6; }
      if (b.y - b.r < 8) { b.y = b.r + 8; b.vy = Math.abs(b.vy) * 0.6; }
      if (b.y + b.r > arenaHeight - 8) { b.y = arenaHeight - b.r - 8; b.vy = -Math.abs(b.vy) * 0.6; }

      totalEnergy += b.vx * b.vx + b.vy * b.vy;
    }

    renderPositions();
    return totalEnergy / Math.max(1, bubbles.length);
  }

  function wakePhysics(impulse = false) {
    stopPhysics();
    settled = false;
    ticks = 0;

    if (impulse) {
      bubbles.forEach((b, i) => {
        const angle = (i / Math.max(1, bubbles.length)) * Math.PI * 2;
        b.vx = Math.cos(angle) * 4.2;
        b.vy = Math.sin(angle) * 3.8;
      });
    }

    if (getFxLevel() === 'minimo' || isReducedMotion()) {
      for (let i = 0; i < 35; i++) stepPhysics();
      settled = true;
      updateCpuPill('Parado (0% CPU)');
      return;
    }

    updateCpuPill('Acomodando…');
    removeFrame = addFrameListener(() => {
      const energy = stepPhysics();
      ticks++;
      if (energy < 0.035 || ticks > 150) {
        settled = true;
        stopPhysics();
        updateCpuPill('Parado (0% CPU)');
      }
    });
  }

  reorgBtn.addEventListener('click', () => wakePhysics(true));

  // Pointer Events para arrastar bolhas ou clicar para abrir
  let activeBubble = null;
  let dragMoved = false;
  let offsetX = 0;
  let offsetY = 0;

  bubbles.forEach(b => {
    b.el.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      activeBubble = b;
      b.dragging = true;
      dragMoved = false;
      const arenaRect = arena.getBoundingClientRect();
      offsetX = (e.clientX - arenaRect.left) - b.x;
      offsetY = (e.clientY - arenaRect.top) - b.y;
      b.el.classList.add('is-dragging');
    });
  });

  const onWindowMove = (e) => {
    if (!activeBubble) return;
    const arenaRect = arena.getBoundingClientRect();
    const nx = (e.clientX - arenaRect.left) - offsetX;
    const ny = (e.clientY - arenaRect.top) - offsetY;
    if (Math.hypot(nx - activeBubble.x, ny - activeBubble.y) > 4) {
      dragMoved = true;
    }
    activeBubble.x = Math.max(activeBubble.r + 6, Math.min(arenaRect.width - activeBubble.r - 6, nx));
    activeBubble.y = Math.max(activeBubble.r + 6, Math.min(arenaRect.height - activeBubble.r - 6, ny));
    if (settled) {
      wakePhysics(false);
    } else {
      renderPositions();
    }
  };

  const onWindowUp = () => {
    if (!activeBubble) return;
    const clickedProj = activeBubble.proj;
    activeBubble.dragging = false;
    activeBubble.el.classList.remove('is-dragging');
    const wasTap = !dragMoved;
    activeBubble = null;
    if (wasTap) {
      navigate(`#/project/${clickedProj.repoId}`);
    }
  };

  window.addEventListener('pointermove', onWindowMove, { passive: true });
  window.addEventListener('pointerup', onWindowUp);
  window.addEventListener('pointercancel', onWindowUp);

  wakePhysics(false);

  const handle = {
    stop: stopPhysics,
    destroy() {
      stopPhysics();
      window.removeEventListener('pointermove', onWindowMove);
      window.removeEventListener('pointerup', onWindowUp);
      window.removeEventListener('pointercancel', onWindowUp);
    }
  };

  registerViewEffect(handle);
  return handle;
}

// View autônoma caso acessada via `#/bubbles`
let _standaloneCleanup = null;

export const BubblesView = {
  mount(container) {
    const state = getState();
    const items = filterAndSortProjects(getMergedProjects(state), { special: 'ativos', sort: 'updated' });
    _standaloneCleanup = mountBubblesStage(container, items, () => navigate('#/home'));
  },
  unmount() {
    _standaloneCleanup?.destroy();
    _standaloneCleanup = null;
  }
};

export default BubblesView;

function _escape(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
