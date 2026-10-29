/**
 * View: Kanban (#/kanban) — Fase 2
 *
 * Entregas contempladas:
 *   - 5 colunas por status ('ideia', 'em andamento', 'pausado', 'concluído', 'arquivado')
 *   - Drag-and-drop com Pointer Events (mouse/touch), cancelamento em pointercancel/Escape,
 *     persistência somente no drop válido
 *   - Alternativa 100% acessível por teclado e toque (seletor "Mover para" + botões ◀ ▶ em cada cartão)
 *   - No celular: seletor de coluna ativa no topo + rolagem horizontal com indicação visual
 *   - Filtros unificados por busca, prioridade, prazo e projeto
 *   - Histórico de status registrado e suporte a Undo
 */

import { getState, dispatch, subscribe, undo, canUndo } from '../store/store.js';
import { fetchUserRepos } from '../services/github.js';
import {
  STATUS_ORDER,
  getMergedProjects,
  filterAndSortProjects,
  formatLocalDueDate
} from '../utils/domain.js';
import { showToast } from '../components/toast.js';
import { navigate } from '../router.js';

let _container = null;
let _unsubscribeStore = null;
let _abortController = null;
let _cleanupDrag = null;

let _filters = {
  search: '',
  priority: 'todas',
  dueFilter: 'todos',
  repoId: 'todos'
};

// No mobile, permite focar uma coluna específica ou ver todas com scroll horizontal
let _mobileActiveColumn = 'todas';

export const KanbanView = {
  mount(container) {
    _container = container;
    _abortController = new AbortController();

    _render();
    _ensureReposLoaded();

    _unsubscribeStore = subscribe(() => {
      _renderBoardOnly();
    });
  },

  unmount() {
    _abortController?.abort();
    _abortController = null;
    _unsubscribeStore?.();
    _unsubscribeStore = null;
    _cleanupDrag?.();
    _cleanupDrag = null;
    _container = null;
  }
};

async function _ensureReposLoaded() {
  const state = getState();
  if (!state.githubCache?.repos || state.githubCache.repos.length === 0) {
    const res = await fetchUserRepos(state.githubCache, false, _abortController?.signal);
    if (_abortController?.signal.aborted) return;
    if (res.data) {
      dispatch({
        type: 'GITHUB_CACHE_UPDATE',
        payload: { repos: res.data, fetchedAt: res.fetchedAt, rateLimit: res.rateLimit }
      });
      dispatch({ type: 'PROJECTS_SYNC_GITHUB', payload: { repos: res.data } });
    }
  }
}

function _render() {
  if (!_container) return;
  _container.innerHTML = '';

  const view = document.createElement('div');
  view.className = 'kanban-view';

  // Cabeçalho
  const header = document.createElement('div');
  header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;';

  const titleWrap = document.createElement('div');
  titleWrap.innerHTML = `
    <h1 class="home-title" style="font-size:var(--text-xl);">Quadro Kanban</h1>
    <p style="font-size:var(--text-sm);color:var(--text-secondary);">Arraste cartões entre colunas ou use os controles acessíveis ◀ ▶ / "Mover para" em cada projeto.</p>
  `;

  const headerActions = document.createElement('div');
  headerActions.id = 'kanban-header-actions';
  headerActions.style.cssText = 'display:flex;gap:8px;align-items:center;';

  header.appendChild(titleWrap);
  header.appendChild(headerActions);

  // Barra de Filtros (Prioridade, Prazo, Projeto, Busca)
  const toolbar = _buildFiltersToolbar();

  // Seletor mobile de coluna + indicador visual
  const mobileColSelector = document.createElement('div');
  mobileColSelector.id = 'kanban-mobile-selector';
  mobileColSelector.className = 'kanban-mobile-selector';

  // Container das Colunas
  const boardWrap = document.createElement('div');
  boardWrap.id = 'kanban-board-wrap';

  view.appendChild(header);
  view.appendChild(toolbar);
  view.appendChild(mobileColSelector);
  view.appendChild(boardWrap);

  _container.appendChild(view);

  _renderBoardOnly();
}

function _buildFiltersToolbar() {
  const state = getState();
  const allProjects = getMergedProjects(state).filter(p => !p.hidden);

  const bar = document.createElement('div');
  bar.className = 'toolbar card';
  bar.style.padding = 'var(--space-3) var(--space-4)';

  // Busca
  const searchBox = document.createElement('div');
  searchBox.className = 'search-box';
  searchBox.style.minWidth = '200px';

  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.id = 'global-search-input';
  searchInput.className = 'input';
  searchInput.placeholder = 'Filtrar no Kanban… ( / )';
  searchInput.setAttribute('aria-label', 'Buscar projetos no Kanban');
  searchInput.value = _filters.search;

  let timer;
  searchInput.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      _filters.search = searchInput.value;
      _renderBoardOnly();
    }, 150);
  });
  searchBox.appendChild(searchInput);

  // Filtros
  const group = document.createElement('div');
  group.className = 'filters-group';

  // Filtro por Prioridade de Tarefas
  const prioSelect = document.createElement('select');
  prioSelect.className = 'select';
  prioSelect.setAttribute('aria-label', 'Filtrar por prioridade de tarefa');
  [
    { value: 'todas', label: 'Prioridade: Todas' },
    { value: 'urgente', label: '🔥 Urgente' },
    { value: 'alta', label: '⚡ Alta' },
    { value: 'normal', label: 'Normal' },
    { value: 'baixa', label: 'Baixa' }
  ].forEach(optData => {
    const opt = document.createElement('option');
    opt.value = optData.value;
    opt.textContent = optData.label;
    opt.selected = _filters.priority === optData.value;
    prioSelect.appendChild(opt);
  });
  prioSelect.addEventListener('change', () => {
    _filters.priority = prioSelect.value;
    _renderBoardOnly();
  });

  // Filtro por Prazo
  const dueSelect = document.createElement('select');
  dueSelect.className = 'select';
  dueSelect.setAttribute('aria-label', 'Filtrar por prazo');
  [
    { value: 'todos', label: 'Prazo: Todos' },
    { value: 'overdue', label: '⏰ Com tarefas vencidas' },
    { value: 'due-soon', label: '📅 Vence em breve (3d)' },
    { value: 'with-due', label: '📆 Com qualquer prazo' }
  ].forEach(optData => {
    const opt = document.createElement('option');
    opt.value = optData.value;
    opt.textContent = optData.label;
    opt.selected = _filters.dueFilter === optData.value;
    dueSelect.appendChild(opt);
  });
  dueSelect.addEventListener('change', () => {
    _filters.dueFilter = dueSelect.value;
    _renderBoardOnly();
  });

  // Filtro por Projeto
  const projSelect = document.createElement('select');
  projSelect.className = 'select';
  projSelect.setAttribute('aria-label', 'Filtrar por projeto');
  const defaultProjOpt = document.createElement('option');
  defaultProjOpt.value = 'todos';
  defaultProjOpt.textContent = 'Projeto: Todos';
  projSelect.appendChild(defaultProjOpt);

  allProjects
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.repoId;
      opt.textContent = p.name;
      opt.selected = _filters.repoId === p.repoId;
      projSelect.appendChild(opt);
    });
  projSelect.addEventListener('change', () => {
    _filters.repoId = projSelect.value;
    _renderBoardOnly();
  });

  group.appendChild(prioSelect);
  group.appendChild(dueSelect);
  group.appendChild(projSelect);

  bar.appendChild(searchBox);
  bar.appendChild(group);
  return bar;
}

function _renderBoardOnly() {
  const boardWrap = document.getElementById('kanban-board-wrap');
  const mobileSelector = document.getElementById('kanban-mobile-selector');
  const headerActions = document.getElementById('kanban-header-actions');
  if (!boardWrap) return;

  _cleanupDrag?.();
  _cleanupDrag = null;
  boardWrap.innerHTML = '';

  // Botão Undo no topo do Kanban quando disponível
  if (headerActions) {
    headerActions.innerHTML = '';
    if (canUndo()) {
      const undoBtn = document.createElement('button');
      undoBtn.type = 'button';
      undoBtn.className = 'btn btn-secondary btn-sm';
      undoBtn.textContent = '↩ Desfazer última mudança';
      undoBtn.addEventListener('click', () => {
        if (undo()) {
          showToast('Mudança desfeita!', { type: 'info', duration: 2500 });
        }
      });
      headerActions.appendChild(undoBtn);
    }
  }

  const state = getState();
  const merged = getMergedProjects(state);
  const filtered = filterAndSortProjects(merged, {
    ..._filters,
    status: 'todos',
    special: 'ativos'
  });

  // Seletor rápido de colunas (especialmente útil no mobile para evitar precisão de arrasto)
  if (mobileSelector) {
    mobileSelector.innerHTML = '';
    const allChip = document.createElement('button');
    allChip.type = 'button';
    allChip.className = `btn btn-sm ${_mobileActiveColumn === 'todas' ? 'btn-primary' : 'btn-secondary'}`;
    allChip.textContent = `Todas (${filtered.length})`;
    allChip.addEventListener('click', () => {
      _mobileActiveColumn = 'todas';
      _renderBoardOnly();
    });
    mobileSelector.appendChild(allChip);

    for (const status of STATUS_ORDER) {
      const count = filtered.filter(p => p.status === status).length;
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = `btn btn-sm ${_mobileActiveColumn === status ? 'btn-primary' : 'btn-secondary'}`;
      chip.textContent = `${status} (${count})`;
      chip.addEventListener('click', () => {
        _mobileActiveColumn = status;
        _renderBoardOnly();
      });
      mobileSelector.appendChild(chip);
    }
  }

  const board = document.createElement('div');
  board.className = 'kanban-board';

  const columnsToRender = _mobileActiveColumn === 'todas'
    ? STATUS_ORDER
    : STATUS_ORDER.filter(s => s === _mobileActiveColumn);

  for (const status of columnsToRender) {
    const colItems = filtered.filter(p => p.status === status);
    board.appendChild(_buildColumn(status, colItems));
  }

  boardWrap.appendChild(board);
  _cleanupDrag = _enableKanbanPointerDrag(board);
}

function _buildColumn(status, items) {
  const col = document.createElement('section');
  col.className = 'kanban-column';
  col.setAttribute('data-status-col', status);
  col.setAttribute('aria-label', `Coluna ${status}`);

  const cls = status.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-');

  const colHeader = document.createElement('div');
  colHeader.className = 'kanban-column-header';
  colHeader.innerHTML = `
    <span class="badge badge-${cls}"><span class="badge-dot"></span>${status}</span>
    <span class="kanban-col-count tabular">${items.length}</span>
  `;

  const colBody = document.createElement('div');
  colBody.className = 'kanban-column-body';

  if (items.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'kanban-empty-slot';
    empty.textContent = 'Solte aqui ou mova um projeto para este status';
    colBody.appendChild(empty);
  } else {
    items.forEach(item => {
      colBody.appendChild(_buildKanbanCard(item));
    });
  }

  col.appendChild(colHeader);
  col.appendChild(colBody);
  return col;
}

function _buildKanbanCard(item) {
  const card = document.createElement('article');
  card.className = 'card kanban-card';
  card.setAttribute('data-repo-id', item.repoId);
  card.setAttribute('data-current-status', item.status);
  card.setAttribute('tabindex', '0');
  if (item.customColor) {
    card.style.borderLeft = `3px solid ${item.customColor}`;
  }

  const currentIdx = STATUS_ORDER.indexOf(item.status);

  // Atalho de teclado direto no cartão: Alt + Seta Esquerda / Direita move entre colunas
  card.addEventListener('keydown', (e) => {
    if (e.altKey && e.key === 'ArrowLeft' && currentIdx > 0) {
      e.preventDefault();
      _moveProjectToStatus(item.repoId, item.name, STATUS_ORDER[currentIdx - 1]);
    } else if (e.altKey && e.key === 'ArrowRight' && currentIdx < STATUS_ORDER.length - 1) {
      e.preventDefault();
      _moveProjectToStatus(item.repoId, item.name, STATUS_ORDER[currentIdx + 1]);
    }
  });

  // Topo do cartão: Alça + Título clicável + Pin
  const topRow = document.createElement('div');
  topRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:6px;';

  const titleBtn = document.createElement('a');
  titleBtn.href = `#/project/${item.repoId}`;
  titleBtn.className = 'kanban-card-title';
  titleBtn.textContent = `${item.customIcon ? item.customIcon + ' ' : ''}${item.name}`;

  const dragHandle = document.createElement('span');
  dragHandle.className = 'kanban-drag-handle';
  dragHandle.title = 'Arraste para outra coluna';
  dragHandle.setAttribute('aria-hidden', 'true');
  dragHandle.textContent = `${item.pinned ? '📌 ' : ''}⠿`;

  topRow.appendChild(titleBtn);
  topRow.appendChild(dragHandle);

  // Resumo de tarefas e prazos
  const metaRow = document.createElement('div');
  metaRow.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;align-items:center;font-size:var(--text-xs);color:var(--text-secondary);';

  const totalTasks = item.tasks.length;
  if (totalTasks > 0) {
    metaRow.innerHTML += `<span class="tabular">☑️ ${item.doneTasksCount}/${totalTasks}</span>`;
  } else {
    metaRow.innerHTML += `<span style="color:var(--text-muted);">Sem tarefas</span>`;
  }

  if (item.overdueTasksCount > 0) {
    metaRow.innerHTML += `<span style="color:var(--color-danger);font-weight:700;">⏰ ${item.overdueTasksCount} vencida(s)</span>`;
  } else if (item.nearestDueDate) {
    metaRow.innerHTML += `<span>📅 ${formatLocalDueDate(item.nearestDueDate)}</span>`;
  }

  // Controles acessíveis sem necessidade de arrastar (Botões ◀ ▶ + Select "Mover para")
  const moveRow = document.createElement('div');
  moveRow.className = 'kanban-card-controls';

  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.className = 'btn btn-ghost btn-sm kanban-step-btn';
  prevBtn.disabled = currentIdx <= 0;
  prevBtn.title = currentIdx > 0 ? `Mover para ${STATUS_ORDER[currentIdx - 1]}` : '';
  prevBtn.setAttribute('aria-label', `Mover ${item.name} para coluna anterior`);
  prevBtn.textContent = '◀';
  prevBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (currentIdx > 0) _moveProjectToStatus(item.repoId, item.name, STATUS_ORDER[currentIdx - 1]);
  });

  const moveSelect = document.createElement('select');
  moveSelect.className = 'select kanban-move-select';
  moveSelect.setAttribute('aria-label', `Mover projeto ${item.name} para coluna`);
  STATUS_ORDER.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s;
    opt.textContent = `→ ${s}`;
    opt.selected = s === item.status;
    moveSelect.appendChild(opt);
  });
  moveSelect.addEventListener('change', (e) => {
    e.stopPropagation();
    _moveProjectToStatus(item.repoId, item.name, moveSelect.value);
  });

  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'btn btn-ghost btn-sm kanban-step-btn';
  nextBtn.disabled = currentIdx >= STATUS_ORDER.length - 1;
  nextBtn.title = currentIdx < STATUS_ORDER.length - 1 ? `Mover para ${STATUS_ORDER[currentIdx + 1]}` : '';
  nextBtn.setAttribute('aria-label', `Mover ${item.name} para próxima coluna`);
  nextBtn.textContent = '▶';
  nextBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (currentIdx < STATUS_ORDER.length - 1) _moveProjectToStatus(item.repoId, item.name, STATUS_ORDER[currentIdx + 1]);
  });

  moveRow.appendChild(prevBtn);
  moveRow.appendChild(moveSelect);
  moveRow.appendChild(nextBtn);

  card.appendChild(topRow);
  card.appendChild(metaRow);
  card.appendChild(moveRow);

  return card;
}

function _moveProjectToStatus(repoId, projectName, newStatus) {
  const current = getState().projects[String(repoId)]?.status || 'ideia';
  if (current === newStatus) return;

  dispatch({ type: 'PROJECT_UPDATE_STATUS', payload: { repoId, status: newStatus } });
  showToast(`"${projectName}" movido para "${newStatus}"`, {
    type: 'success',
    duration: 4500,
    action: {
      label: 'Desfazer',
      fn: () => { if (canUndo()) undo(); }
    }
  });
}

// ─────────────────────────────────────────────
// DRAG-AND-DROP ENTRE COLUNAS COM POINTER EVENTS
// (Cancela em pointercancel ou Escape; persiste apenas no drop válido)
// ─────────────────────────────────────────────
function _enableKanbanPointerDrag(boardEl) {
  let draggingCard = null;
  let draggedRepoId = null;
  let originStatus = null;
  let hoveredColumnStatus = null;

  function onPointerDown(e) {
    // Só inicia drag se clicar na alça .kanban-drag-handle (evita conflito com scroll touch e selects)
    const handle = e.target.closest('.kanban-drag-handle');
    if (!handle) return;

    const card = handle.closest('.kanban-card');
    if (!card) return;

    e.preventDefault();
    draggingCard = card;
    draggedRepoId = card.getAttribute('data-repo-id');
    originStatus = card.getAttribute('data-current-status');
    hoveredColumnStatus = null;

    draggingCard.classList.add('is-dragging');
    handle.setPointerCapture?.(e.pointerId);

    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointercancel', onCancel);
    document.addEventListener('keydown', onKeyDown);
  }

  function onPointerMove(e) {
    if (!draggingCard) return;
    const elemBelow = document.elementFromPoint(e.clientX, e.clientY);
    const col = elemBelow?.closest?.('.kanban-column');

    boardEl.querySelectorAll('.kanban-column').forEach(c => c.classList.remove('is-drop-target'));
    if (col && boardEl.contains(col)) {
      col.classList.add('is-drop-target');
      hoveredColumnStatus = col.getAttribute('data-status-col');
    } else {
      hoveredColumnStatus = null;
    }
  }

  function cleanup() {
    if (draggingCard) draggingCard.classList.remove('is-dragging');
    boardEl.querySelectorAll('.kanban-column').forEach(c => c.classList.remove('is-drop-target'));
    draggingCard = null;
    draggedRepoId = null;
    originStatus = null;
    hoveredColumnStatus = null;
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
    document.removeEventListener('pointercancel', onCancel);
    document.removeEventListener('keydown', onKeyDown);
  }

  function onPointerUp() {
    if (!draggingCard) return;
    const repoId = draggedRepoId;
    const fromStatus = originStatus;
    const toStatus = hoveredColumnStatus;
    const titleEl = draggingCard.querySelector('.kanban-card-title');
    const name = titleEl ? titleEl.textContent : repoId;
    cleanup();

    if (repoId && toStatus && toStatus !== fromStatus) {
      _moveProjectToStatus(repoId, name, toStatus);
    }
  }

  function onCancel() {
    cleanup();
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      cleanup();
    }
  }

  boardEl.addEventListener('pointerdown', onPointerDown);
  return () => {
    cleanup();
    boardEl.removeEventListener('pointerdown', onPointerDown);
  };
}
