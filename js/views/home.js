/**
 * View: Home (#/home) — Fase 2
 *
 * Entregas contempladas:
 *   - Indicadores rápidos unificados (via domain.js)
 *   - Alerta simples de tarefas vencidas
 *   - Seção "Continue de onde parou" (último projeto acessado)
 *   - Seção "Em foco" (tarefas prioritárias, vencidas e prazos próximos, marcáveis ali mesmo na Home)
 *   - Filtros e ordenação ampliados (status, prioridade, prazo, atrasadas, fixados, ocultos)
 *   - Alternância de visualização: Grid / Lista / Kanban
 *   - Cards com suporte a fixar (pin), ícone/emoji e cor personalizada
 */

import { getState, dispatch, subscribe, undo, canUndo } from '../store/store.js';
import { fetchUserRepos, getLangColor } from '../services/github.js';
import { applyCover } from '../utils/cover.js';
import { formatRelativeTime, formatNumber } from '../utils/formatters.js';
import {
  STATUS_ORDER,
  getMergedProjects,
  filterAndSortProjects,
  computeGlobalMetrics,
  getContinueProject,
  getFocusTasks,
  formatLocalDueDate,
  paginateItems
} from '../utils/domain.js';
import { animateStaggerIn, animateCounter, enableSpotlightOnCards, burstParticles } from '../fx/effects.js';
import { updateRateLimitIndicator } from '../components/nav.js';
import { showToast } from '../components/toast.js';
import { navigate } from '../router.js';

const STATUS_OPTIONS = ['todos', ...STATUS_ORDER];
const SPECIAL_OPTIONS = [
  { value: 'ativos',  label: 'Projetos visíveis' },
  { value: 'pinned',  label: '📌 Fixados' },
  { value: 'overdue', label: '⏰ Com tarefas atrasadas' },
  { value: 'hidden',  label: '👁️ Ocultos' },
  { value: 'todos',   label: 'Todos (incl. ocultos)' }
];
const PRIORITY_OPTIONS = [
  { value: 'todas',   label: 'Prioridade: Todas' },
  { value: 'urgente', label: '🔥 Urgente' },
  { value: 'alta',    label: '⚡ Alta' },
  { value: 'normal',  label: 'Normal' },
  { value: 'baixa',   label: 'Baixa' }
];
const DUE_OPTIONS = [
  { value: 'todos',    label: 'Prazo: Todos' },
  { value: 'overdue',  label: '⏰ Tarefas atrasadas' },
  { value: 'due-soon', label: '📅 Prazo próximo (3d)' },
  { value: 'with-due', label: '📆 Com qualquer prazo' }
];
const SORT_OPTIONS = [
  { value: 'updated',  label: 'Ordenar: Atividade recente' },
  { value: 'priority', label: 'Ordenar: Prioridade' },
  { value: 'due',      label: 'Ordenar: Prazo mais próximo' },
  { value: 'name',     label: 'Ordenar: Nome (A–Z)' },
  { value: 'status',   label: 'Ordenar: Status' },
  { value: 'stars',    label: 'Ordenar: Estrelas' }
];

let _container = null;
let _abortController = null;
let _unsubscribeStore = null;
let _removeSpotlight = null;
let _page = 1;

let _filterState = {
  search: '',
  status: 'todos',
  special: 'ativos',
  priority: 'todas',
  dueFilter: 'todos',
  sort: 'updated'
};

export const HomeView = {
  mount(container) {
    _container = container;
    _abortController = new AbortController();
    _page = 1;

    _render();
    _loadRepos(false);

    _unsubscribeStore = subscribe(() => {
      _updateStats();
      _renderHighlightsSection();
      _renderGrid();
    });
  },

  unmount() {
    _abortController?.abort();
    _abortController = null;
    _unsubscribeStore?.();
    _unsubscribeStore = null;
    _removeSpotlight?.();
    _removeSpotlight = null;
    _container = null;
  }
};

// ─────────────────────────────────────────────
// RENDER PRINCIPAL
// ─────────────────────────────────────────────
function _render() {
  if (!_container) return;
  _container.innerHTML = '';
  _container.className = '';

  const view = document.createElement('div');
  view.className = 'home-view';

  // Hero / Saudação
  const hero = document.createElement('div');
  hero.className = 'home-hero';

  const greeting = _getGreeting();
  const titleEl = document.createElement('h1');
  titleEl.className = 'home-title';
  titleEl.textContent = `${greeting}, Wendell`;

  const subtitle = document.createElement('p');
  subtitle.className = 'home-subtitle';
  subtitle.textContent = 'Seus repositórios, tarefas prioritárias e fluxo de trabalho em um só lugar.';

  hero.appendChild(titleEl);
  hero.appendChild(subtitle);

  // Stats Bento
  const stats = _renderStats();

  // Banner de status (GitHub)
  const statusBanner = document.createElement('div');
  statusBanner.id = 'github-status-banner';

  // Seção de Destaques: Alerta de Vencidas + "Continue de onde parou" + "Em foco"
  const highlightsWrap = document.createElement('div');
  highlightsWrap.id = 'home-highlights-wrap';
  _renderHighlightsInto(highlightsWrap);

  // Toolbar de Filtros Ampliados + Alternância Grid / Lista / Kanban
  const toolbar = _renderToolbar();

  // Grid / Lista / Kanban de Projetos
  const gridWrap = document.createElement('div');
  gridWrap.id = 'projects-grid-wrap';
  _renderGridInto(gridWrap);

  view.appendChild(hero);
  view.appendChild(stats);
  view.appendChild(statusBanner);
  view.appendChild(highlightsWrap);
  view.appendChild(toolbar);
  view.appendChild(gridWrap);

  _container.appendChild(view);

  _removeSpotlight?.();
  _removeSpotlight = enableSpotlightOnCards(gridWrap);
}

// ─────────────────────────────────────────────
// ESTATÍSTICAS RÁPIDAS (via domain.js)
// ─────────────────────────────────────────────
function _renderStats() {
  const bento = document.createElement('div');
  bento.className = 'bento-stats';
  bento.id = 'bento-stats-wrap';
  _populateStats(bento, true);
  return bento;
}

function _updateStats() {
  const bento = document.getElementById('bento-stats-wrap');
  if (!bento) return;
  _populateStats(bento, false);
}

function _populateStats(bento, animate = false) {
  const state = getState();
  const metrics = computeGlobalMetrics(state);

  const statsData = [
    { label: 'Repositórios', value: metrics.totalProjects },
    { label: 'Em andamento', value: metrics.inProgress },
    { label: 'Tarefas abertas', value: metrics.openTasks },
    { label: 'Concluídos', value: metrics.completed }
  ];

  bento.innerHTML = '';

  for (const { label, value } of statsData) {
    const card = document.createElement('div');
    card.className = 'card stat-card';

    const labelEl = document.createElement('div');
    labelEl.className = 'stat-label';
    labelEl.textContent = label;

    const valueEl = document.createElement('div');
    valueEl.className = 'stat-value tabular';
    valueEl.textContent = animate ? '0' : String(value);

    card.appendChild(labelEl);
    card.appendChild(valueEl);
    bento.appendChild(card);

    if (animate) {
      setTimeout(() => animateCounter(valueEl, 0, value, 700), 150);
    }
  }
}

// ─────────────────────────────────────────────
// SEÇÃO DE DESTAQUES: ALERTA VENCIDAS + CONTINUE DE ONDE PAROU + EM FOCO
// ─────────────────────────────────────────────
function _renderHighlightsSection() {
  const wrap = document.getElementById('home-highlights-wrap');
  if (!wrap) return;
  wrap.innerHTML = '';
  _renderHighlightsInto(wrap);
}

function _renderHighlightsInto(wrap) {
  const state = getState();
  const metrics = computeGlobalMetrics(state);
  const continueProj = getContinueProject(state);
  const focusTasks = getFocusTasks(state, 6);

  const container = document.createElement('div');
  container.className = 'home-highlights';

  // 1. Alerta simples de tarefas vencidas
  if (metrics.overdueTasks > 0) {
    const alertBar = document.createElement('div');
    alertBar.className = 'overdue-alert-banner';
    alertBar.innerHTML = `
      <span>⏰ <strong>Atenção:</strong> você tem <strong>${metrics.overdueTasks}</strong> tarefa(s) com prazo vencido.</span>
    `;
    const filterOverdueBtn = document.createElement('button');
    filterOverdueBtn.type = 'button';
    filterOverdueBtn.className = 'btn btn-secondary btn-sm';
    filterOverdueBtn.textContent = 'Filtrar projetos com atraso';
    filterOverdueBtn.addEventListener('click', () => {
      _filterState.dueFilter = 'overdue';
      _render();
    });
    alertBar.appendChild(filterOverdueBtn);
    container.appendChild(alertBar);
  }

  // Grid de 2 colunas: "Continue de onde parou" + "Em foco"
  if (continueProj || focusTasks.length > 0) {
    const split = document.createElement('div');
    split.className = 'home-focus-split';

    // Card: Continue de onde parou
    if (continueProj) {
      const contCard = document.createElement('div');
      contCard.className = 'card continue-card';

      const cls = continueProj.status.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-');
      const totalT = continueProj.tasks.length;
      const doneT = continueProj.doneTasksCount;
      const pct = totalT > 0 ? Math.round((doneT / totalT) * 100) : 0;

      contCard.innerHTML = `
        <div class="section-eyebrow">⚡ Continue de onde parou</div>
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-top:6px;">
          <h2 style="font-size:var(--text-lg);font-weight:700;">${continueProj.customIcon ? continueProj.customIcon + ' ' : ''}${_escape(continueProj.name)}</h2>
          <span class="badge badge-${cls}"><span class="badge-dot"></span>${continueProj.status}</span>
        </div>
        <p style="font-size:var(--text-sm);color:var(--text-secondary);margin:6px 0 12px;">${_escape(continueProj.description || 'Sem descrição.')}</p>
        ${totalT > 0 ? `
          <div style="margin-bottom:12px;">
            <div class="progress-info" style="margin-bottom:4px;"><span>Progresso</span><span class="tabular">${doneT}/${totalT} (${pct}%)</span></div>
            <div class="progress-bar"><div class="progress-fill" style="width:${pct}%;"></div></div>
          </div>
        ` : ''}
      `;

      const btnRow = document.createElement('div');
      btnRow.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-top:auto;';

      const openBtn = document.createElement('button');
      openBtn.type = 'button';
      openBtn.className = 'btn btn-primary btn-sm';
      openBtn.textContent = 'Abrir projeto →';
      openBtn.addEventListener('click', () => navigate(`#/project/${continueProj.repoId}`));

      const tasksBtn = document.createElement('button');
      tasksBtn.type = 'button';
      tasksBtn.className = 'btn btn-secondary btn-sm';
      tasksBtn.textContent = `Tarefas (${continueProj.openTasksCount})`;
      tasksBtn.addEventListener('click', () => {
        sessionStorage.setItem('panel_open_project_tab', 'tasks');
        navigate(`#/project/${continueProj.repoId}`);
      });

      const notesBtn = document.createElement('button');
      notesBtn.type = 'button';
      notesBtn.className = 'btn btn-ghost btn-sm';
      notesBtn.textContent = 'Notas';
      notesBtn.addEventListener('click', () => {
        sessionStorage.setItem('panel_open_project_tab', 'notes');
        navigate(`#/project/${continueProj.repoId}`);
      });

      btnRow.appendChild(openBtn);
      btnRow.appendChild(tasksBtn);
      btnRow.appendChild(notesBtn);
      contCard.appendChild(btnRow);
      split.appendChild(contCard);
    }

    // Card: Em foco (tarefas prioritárias e prazos próximos, marcáveis ali mesmo)
    const focusCard = document.createElement('div');
    focusCard.className = 'card focus-tasks-card';
    focusCard.innerHTML = `
      <div class="section-eyebrow">🎯 Em foco — Prioritárias e prazos próximos</div>
    `;

    if (focusTasks.length === 0) {
      const emptyP = document.createElement('p');
      emptyP.style.cssText = 'font-size:var(--text-sm);color:var(--text-muted);margin-top:10px;';
      emptyP.textContent = 'Nenhuma tarefa urgente ou com prazo próximo pendente. Bom trabalho!';
      focusCard.appendChild(emptyP);
    } else {
      const list = document.createElement('ul');
      list.className = 'focus-tasks-list';

      for (const item of focusTasks) {
        const li = document.createElement('li');
        li.className = 'focus-task-row';

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = 'task-checkbox';
        cb.checked = false;
        cb.setAttribute('aria-label', `Concluir tarefa "${item.task.title}" do projeto ${item.projectName}`);
        cb.addEventListener('change', () => {
          burstParticles(cb);
          dispatch({
            type: 'TASK_TOGGLE',
            payload: { repoId: item.repoId, taskId: item.task.id }
          });
          showToast(`Tarefa "${item.task.title}" concluída!`, {
            type: 'success',
            duration: 4000,
            action: {
              label: 'Desfazer',
              fn: () => { if (canUndo()) undo(); }
            }
          });
        });

        const info = document.createElement('div');
        info.style.cssText = 'flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;';

        const titleRow = document.createElement('div');
        titleRow.style.cssText = 'font-size:var(--text-sm);font-weight:500;color:var(--text-main);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
        titleRow.textContent = item.task.title;

        const subRow = document.createElement('div');
        subRow.style.cssText = 'display:flex;gap:8px;align-items:center;font-size:var(--text-xs);color:var(--text-muted);flex-wrap:wrap;';

        const projLink = document.createElement('a');
        projLink.href = `#/project/${item.repoId}`;
        projLink.textContent = `${item.projectIcon ? item.projectIcon + ' ' : ''}${item.projectName}`;
        subRow.appendChild(projLink);

        const prioPill = document.createElement('span');
        prioPill.className = `task-priority-pill priority-${item.task.priority}`;
        prioPill.textContent = item.task.priority;
        subRow.appendChild(prioPill);

        if (item.task.dueDate) {
          const dueSpan = document.createElement('span');
          dueSpan.className = `task-due-badge${item.overdue ? ' is-overdue' : ' is-due-soon'}`;
          dueSpan.textContent = `${item.overdue ? '⚠️ Vencida: ' : '📅 '}${formatLocalDueDate(item.task.dueDate)}`;
          subRow.appendChild(dueSpan);
        }

        info.appendChild(titleRow);
        info.appendChild(subRow);

        li.appendChild(cb);
        li.appendChild(info);
        list.appendChild(li);
      }
      focusCard.appendChild(list);
    }

    split.appendChild(focusCard);
    container.appendChild(split);
  }

  wrap.appendChild(container);
}

// ─────────────────────────────────────────────
// TOOLBAR AMPLIADA + ALTERNÂNCIA GRID / LISTA / KANBAN
// ─────────────────────────────────────────────
function _renderToolbar() {
  const state = getState();
  const currentViewMode = state.config.homeViewMode || 'grid';

  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar home-toolbar-expanded';

  // Linha superior: Busca + Alternador de Visualização (Grid / Lista / Kanban)
  const topRow = document.createElement('div');
  topRow.style.cssText = 'display:flex;gap:10px;align-items:center;justify-content:space-between;width:100%;flex-wrap:wrap;';

  const searchBox = document.createElement('div');
  searchBox.className = 'search-box';
  searchBox.style.minWidth = '220px';

  const searchIcon = document.createElement('span');
  searchIcon.className = 'search-icon';
  searchIcon.setAttribute('aria-hidden', 'true');
  searchIcon.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`;

  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.id = 'global-search-input';
  searchInput.className = 'input search-input';
  searchInput.placeholder = 'Buscar repositório, descrição ou tarefa… ( / )';
  searchInput.setAttribute('aria-label', 'Buscar repositório');
  searchInput.value = _filterState.search;

  let searchTimeout;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      _filterState.search = searchInput.value;
      _page = 1;
      _renderGrid();
    }, 180);
  });

  searchBox.appendChild(searchIcon);
  searchBox.appendChild(searchInput);

  // Alternador Grid / Lista / Kanban
  const viewSwitch = document.createElement('div');
  viewSwitch.className = 'view-mode-switch';
  viewSwitch.setAttribute('role', 'group');
  viewSwitch.setAttribute('aria-label', 'Modo de exibição');

  [
    { id: 'grid',   label: '⊞ Grid' },
    { id: 'list',   label: '☰ Lista' },
    { id: 'kanban', label: '📋 Kanban' }
  ].forEach(mode => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `view-mode-btn${currentViewMode === mode.id ? ' is-active' : ''}`;
    btn.textContent = mode.label;
    btn.setAttribute('aria-pressed', currentViewMode === mode.id ? 'true' : 'false');
    btn.addEventListener('click', () => {
      dispatch({ type: 'CONFIG_UPDATE', payload: { homeViewMode: mode.id } });
      viewSwitch.querySelectorAll('.view-mode-btn').forEach(b => {
        b.classList.remove('is-active');
        b.setAttribute('aria-pressed', 'false');
      });
      btn.classList.add('is-active');
      btn.setAttribute('aria-pressed', 'true');
      _renderGrid();
    });
    viewSwitch.appendChild(btn);
  });

  topRow.appendChild(searchBox);
  topRow.appendChild(viewSwitch);

  // Linha inferior: Filtros (Visibilidade/Fixados, Status, Prioridade, Prazo, Ordenação)
  const filtersGroup = document.createElement('div');
  filtersGroup.className = 'filters-group';
  filtersGroup.style.width = '100%';

  // 1. Filtro Especial (Fixados, Atrasados, Ocultos)
  const specialSelect = _buildSelect('Filtrar exibição', SPECIAL_OPTIONS, _filterState.special, (val) => {
    _filterState.special = val;
    _page = 1;
    _renderGrid();
  });

  // 2. Filtro de Status
  const statusSelect = _buildSelect(
    'Filtrar por status',
    STATUS_OPTIONS.map(s => ({ value: s, label: `Status: ${s.charAt(0).toUpperCase() + s.slice(1)}` })),
    _filterState.status,
    (val) => {
      _filterState.status = val;
      _page = 1;
      _renderGrid();
    }
  );

  // 3. Filtro de Prioridade
  const prioSelect = _buildSelect('Filtrar por prioridade', PRIORITY_OPTIONS, _filterState.priority, (val) => {
    _filterState.priority = val;
    _page = 1;
    _renderGrid();
  });

  // 4. Filtro de Prazo
  const dueSelect = _buildSelect('Filtrar por prazo', DUE_OPTIONS, _filterState.dueFilter, (val) => {
    _filterState.dueFilter = val;
    _page = 1;
    _renderGrid();
  });

  // 5. Ordenação
  const sortSelect = _buildSelect('Ordenar por', SORT_OPTIONS, _filterState.sort, (val) => {
    _filterState.sort = val;
    _page = 1;
    _renderGrid();
  });

  filtersGroup.appendChild(specialSelect);
  filtersGroup.appendChild(statusSelect);
  filtersGroup.appendChild(prioSelect);
  filtersGroup.appendChild(dueSelect);
  filtersGroup.appendChild(sortSelect);

  toolbar.appendChild(topRow);
  toolbar.appendChild(filtersGroup);
  return toolbar;
}

function _buildSelect(ariaLabel, options, selectedVal, onChange) {
  const select = document.createElement('select');
  select.className = 'select';
  select.setAttribute('aria-label', ariaLabel);
  options.forEach(({ value, label }) => {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    opt.selected = value === selectedVal;
    select.appendChild(opt);
  });
  select.addEventListener('change', () => onChange(select.value));
  return select;
}

// ─────────────────────────────────────────────
// GRID / LISTA / KANBAN DE PROJETOS
// ─────────────────────────────────────────────
function _renderGrid() {
  const wrap = document.getElementById('projects-grid-wrap');
  if (!wrap) return;
  wrap.innerHTML = '';
  _renderGridInto(wrap);
}

function _renderGridInto(wrap) {
  const state = getState();
  const viewMode = state.config.homeViewMode || 'grid';
  const merged = getMergedProjects(state);
  const items = filterAndSortProjects(merged, _filterState);

  if (items.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'card';
    empty.style.cssText = 'text-align:center;padding:3rem 1rem;color:var(--text-muted);';
    empty.innerHTML = `
      <div style="font-size:2.5rem;margin-bottom:0.5rem;">📭</div>
      <p style="font-size:var(--text-base);">Nenhum repositório encontrado para os filtros selecionados.</p>
    `;
    wrap.appendChild(empty);
    return;
  }

  // Modo Kanban inline na Home
  if (viewMode === 'kanban') {
    const kanbanHeader = document.createElement('div');
    kanbanHeader.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;';
    kanbanHeader.innerHTML = `
      <span style="font-size:var(--text-xs);color:var(--text-muted);">Exibindo visão rápida em colunas. Para arrastar e usar todos os recursos do quadro, abra a tela dedicada.</span>
      <a href="#/kanban" class="btn btn-secondary btn-sm">Abrir Kanban Completo →</a>
    `;
    wrap.appendChild(kanbanHeader);

    const board = document.createElement('div');
    board.className = 'kanban-board';
    for (const st of STATUS_ORDER) {
      const colItems = items.filter(i => i.status === st);
      const col = document.createElement('div');
      col.className = 'kanban-column';
      const cls = st.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-');
      col.innerHTML = `
        <div class="kanban-column-header">
          <span class="badge badge-${cls}"><span class="badge-dot"></span>${st}</span>
          <span class="kanban-col-count tabular">${colItems.length}</span>
        </div>
      `;
      const body = document.createElement('div');
      body.className = 'kanban-column-body';
      colItems.forEach(item => {
        const mini = document.createElement('div');
        mini.className = 'card kanban-card';
        mini.style.cursor = 'pointer';
        if (item.customColor) mini.style.borderLeft = `3px solid ${item.customColor}`;
        mini.innerHTML = `
          <div style="font-weight:700;font-size:var(--text-sm);">${item.pinned ? '📌 ' : ''}${item.customIcon ? item.customIcon + ' ' : ''}${_escape(item.name)}</div>
          <div style="font-size:var(--text-xs);color:var(--text-muted);">Tarefas: ${item.doneTasksCount}/${item.tasks.length}</div>
        `;
        mini.addEventListener('click', () => navigate(`#/project/${item.repoId}`));
        body.appendChild(mini);
      });
      col.appendChild(body);
      board.appendChild(col);
    }
    wrap.appendChild(board);
    return;
  }

  // Paginação segura (> 150 itens)
  const { visibleItems, hasMore, remaining } = paginateItems(items, _page);

  const containerEl = document.createElement('div');
  containerEl.className = viewMode === 'list' ? 'projects-list-view' : 'projects-grid';

  const cards = visibleItems.map(item =>
    viewMode === 'list' ? _buildProjectListRow(item) : _buildProjectCard(item)
  );
  cards.forEach(card => containerEl.appendChild(card));
  wrap.appendChild(containerEl);

  if (hasMore) {
    const moreBtn = document.createElement('button');
    moreBtn.type = 'button';
    moreBtn.className = 'btn btn-secondary';
    moreBtn.style.cssText = 'margin:16px auto 0;display:flex;';
    moreBtn.textContent = `Carregar mais (${remaining} restantes)`;
    moreBtn.addEventListener('click', () => {
      _page++;
      _renderGrid();
    });
    wrap.appendChild(moreBtn);
  }

  animateStaggerIn(cards, 0, 40);
}

// ─────────────────────────────────────────────
// CARD DE PROJETO (MODO GRID)
// ─────────────────────────────────────────────
function _buildProjectCard(item) {
  const card = document.createElement('div');
  card.className = 'card card-spotlight project-card';
  card.setAttribute('tabindex', '0');
  card.setAttribute('role', 'button');
  card.setAttribute('aria-label', `Abrir projeto ${item.name}`);

  if (item.customColor) {
    card.style.borderColor = `${item.customColor}66`;
  }

  function openProject() {
    navigate(`#/project/${item.repoId}`);
  }
  card.addEventListener('click', openProject);
  card.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openProject(); }
  });

  // Capa Generativa
  const cover = document.createElement('div');
  cover.className = 'project-cover-canvas';
  applyCover(cover, item.repoId, item.coverSeed);
  if (item.customColor) {
    cover.style.borderBottom = `2px solid ${item.customColor}`;
  }

  // Botão rápido de Pin sobre a capa
  const pinQuickBtn = document.createElement('button');
  pinQuickBtn.type = 'button';
  pinQuickBtn.className = `card-pin-btn${item.pinned ? ' is-pinned' : ''}`;
  pinQuickBtn.setAttribute('aria-label', item.pinned ? `Desafixar ${item.name}` : `Fixar ${item.name}`);
  pinQuickBtn.title = item.pinned ? 'Fixado no topo (clique para desafixar)' : 'Fixar no topo';
  pinQuickBtn.textContent = item.pinned ? '📌' : '📍';
  pinQuickBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    dispatch({ type: 'PROJECT_TOGGLE_PIN', payload: { repoId: item.repoId } });
  });
  cover.appendChild(pinQuickBtn);

  if (item.unavailable) {
    const unavBadge = document.createElement('div');
    unavBadge.className = 'project-cover-badge';
    unavBadge.innerHTML = _buildBadge('indisponível', 'arquivado');
    cover.appendChild(unavBadge);
  } else if (item.hidden) {
    const hidBadge = document.createElement('div');
    hidBadge.className = 'project-cover-badge';
    hidBadge.innerHTML = _buildBadge('oculto', 'arquivado');
    cover.appendChild(hidBadge);
  }

  // Corpo do Card
  const body = document.createElement('div');
  body.className = 'project-card-body';

  const header = document.createElement('div');
  header.style.cssText = 'display:flex;align-items:flex-start;justify-content:space-between;gap:8px;';

  const nameEl = document.createElement('div');
  nameEl.className = 'project-card-title';
  nameEl.textContent = `${item.customIcon ? item.customIcon + ' ' : ''}${item.name}`;

  const badgeEl = document.createElement('div');
  badgeEl.innerHTML = _buildBadge(item.status, item.status);
  badgeEl.style.flexShrink = '0';

  header.appendChild(nameEl);
  header.appendChild(badgeEl);

  const descEl = document.createElement('p');
  descEl.className = 'project-card-desc';
  descEl.textContent = item.description || 'Sem descrição.';

  // Barra de progresso de tarefas + alertas de prazo
  const totalTasks = item.tasks.length;
  const doneTasks = item.doneTasksCount;
  const pct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  let progressEl = null;
  if (totalTasks > 0) {
    progressEl = document.createElement('div');
    progressEl.className = 'project-card-progress';

    const progressInfo = document.createElement('div');
    progressInfo.className = 'progress-info';
    progressInfo.innerHTML = `
      <span>Tarefas ${item.overdueTasksCount > 0 ? `<strong style="color:var(--color-danger);">(${item.overdueTasksCount} atrasada)</strong>` : ''}</span>
      <span class="tabular">${doneTasks}/${totalTasks}</span>
    `;

    const bar = document.createElement('div');
    bar.className = 'progress-bar';
    const fill = document.createElement('div');
    fill.className = 'progress-fill';
    fill.style.width = `${pct}%`;
    bar.appendChild(fill);

    progressEl.appendChild(progressInfo);
    progressEl.appendChild(bar);
  }

  // Meta: linguagem + estrelas + último push
  const meta = document.createElement('div');
  meta.className = 'project-card-meta';

  const langEl = document.createElement('span');
  langEl.className = 'meta-lang';
  if (item.language) {
    langEl.innerHTML = `
      <span class="meta-lang-dot" style="background-color:${getLangColor(item.language)};"></span>
      ${item.language}
    `;
  } else {
    langEl.textContent = item.isLocalOnly ? 'Local' : '—';
    langEl.style.color = 'var(--text-muted)';
  }

  const metaStats = document.createElement('span');
  metaStats.className = 'meta-stats';
  metaStats.innerHTML = `
    <span title="Estrelas">⭐ ${formatNumber(item.stars)}</span>
    ${item.pushedAt ? `<span title="Última atividade">${formatRelativeTime(item.pushedAt)}</span>` : ''}
  `;

  meta.appendChild(langEl);
  meta.appendChild(metaStats);

  body.appendChild(header);
  body.appendChild(descEl);
  if (progressEl) body.appendChild(progressEl);
  body.appendChild(meta);

  card.appendChild(cover);
  card.appendChild(body);

  return card;
}

// ─────────────────────────────────────────────
// LINHA DE PROJETO (MODO LISTA)
// ─────────────────────────────────────────────
function _buildProjectListRow(item) {
  const row = document.createElement('div');
  row.className = 'card project-list-row';
  row.setAttribute('tabindex', '0');
  row.setAttribute('role', 'button');
  if (item.customColor) {
    row.style.borderLeft = `4px solid ${item.customColor}`;
  }

  function openProject() {
    navigate(`#/project/${item.repoId}`);
  }
  row.addEventListener('click', openProject);
  row.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openProject(); }
  });

  const left = document.createElement('div');
  left.style.cssText = 'display:flex;flex-direction:column;gap:4px;flex:1;min-width:200px;';
  left.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;font-weight:700;font-size:var(--text-base);">
      ${item.pinned ? '<span>📌</span>' : ''}
      <span>${item.customIcon ? item.customIcon + ' ' : ''}${_escape(item.name)}</span>
    </div>
    <div style="font-size:var(--text-xs);color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
      ${_escape(item.description || 'Sem descrição.')}
    </div>
  `;

  const right = document.createElement('div');
  right.style.cssText = 'display:flex;align-items:center;gap:12px;flex-wrap:wrap;';
  right.innerHTML = `
    ${item.overdueTasksCount > 0 ? `<span style="font-size:var(--text-xs);color:var(--color-danger);font-weight:700;">⏰ ${item.overdueTasksCount} vencida</span>` : ''}
    <span class="tabular" style="font-size:var(--text-xs);color:var(--text-muted);">☑️ ${item.doneTasksCount}/${item.tasks.length}</span>
    ${_buildBadge(item.status, item.status)}
  `;

  row.appendChild(left);
  row.appendChild(right);
  return row;
}

// ─────────────────────────────────────────────
// BUSCA DE REPOS NO GITHUB
// ─────────────────────────────────────────────
async function _loadRepos(forceRefresh = false) {
  const state = getState();
  const signal = _abortController?.signal;

  _showBanner('loading');

  const result = await fetchUserRepos(state.githubCache, forceRefresh, signal);

  if (signal?.aborted) return;

  updateRateLimitIndicator(result.rateLimit);

  if (result.source === 'network' && result.data) {
    dispatch({ type: 'GITHUB_CACHE_UPDATE', payload: { repos: result.data, fetchedAt: result.fetchedAt, rateLimit: result.rateLimit } });
    dispatch({ type: 'PROJECTS_SYNC_GITHUB', payload: { repos: result.data } });
    _showBanner('hidden');

  } else if (result.source === 'cache') {
    _showBanner('cache', { fetchedAt: result.fetchedAt });

  } else if (result.source === 'rate-limit') {
    _showBanner('rate-limit', { resetAt: result.rateLimitResetAt });
    if (result.rateLimit) {
      dispatch({ type: 'GITHUB_RATE_LIMIT_UPDATE', payload: { rateLimit: result.rateLimit } });
    }

  } else if (result.source === 'offline') {
    _showBanner('offline');

  } else if (result.source === 'error') {
    _showBanner('error', { message: result.error });
  }

  _renderGrid();
}

function _showBanner(type, data = {}) {
  const banner = document.getElementById('github-status-banner');
  if (!banner) return;

  banner.innerHTML = '';
  banner.style.cssText = '';

  if (type === 'hidden' || type === 'loading') {
    if (type === 'loading') {
      banner.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;color:var(--text-muted);font-size:var(--text-sm);padding:8px 0;">
          <div class="skeleton" style="width:16px;height:16px;border-radius:50%;flex-shrink:0;"></div>
          Sincronizando repositórios do GitHub…
        </div>
      `;
    }
    return;
  }

  const bannerEl = document.createElement('div');
  bannerEl.style.cssText = `
    display:flex;align-items:center;gap:10px;
    padding:10px 14px;border-radius:var(--radius-md);
    font-size:var(--text-sm);border:1px solid;
  `;

  if (type === 'cache') {
    const age = data.fetchedAt ? formatRelativeTime(data.fetchedAt) : 'antes';
    bannerEl.style.background = 'rgba(59,130,246,0.1)';
    bannerEl.style.borderColor = 'rgba(59,130,246,0.25)';
    bannerEl.style.color = 'var(--color-info)';
    bannerEl.innerHTML = `<span>ℹ</span><span>Exibindo dados do cache (atualizado ${age}).</span>`;

    const refreshBtn = document.createElement('button');
    refreshBtn.className = 'btn btn-ghost btn-sm';
    refreshBtn.textContent = 'Atualizar';
    refreshBtn.style.marginLeft = 'auto';
    refreshBtn.addEventListener('click', () => _loadRepos(true));
    bannerEl.appendChild(refreshBtn);

  } else if (type === 'rate-limit') {
    const resetTime = data.resetAt ? new Date(data.resetAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—';
    bannerEl.style.background = 'rgba(245,158,11,0.1)';
    bannerEl.style.borderColor = 'rgba(245,158,11,0.3)';
    bannerEl.style.color = 'var(--color-warning)';
    bannerEl.innerHTML = `<span>⚠</span><span>Limite de requisições da GitHub API atingido. Disponível novamente às <strong>${resetTime}</strong>.</span>`;

  } else if (type === 'offline') {
    bannerEl.style.background = 'rgba(100,116,139,0.1)';
    bannerEl.style.borderColor = 'rgba(100,116,139,0.25)';
    bannerEl.style.color = 'var(--text-muted)';
    bannerEl.innerHTML = `<span>📡</span><span>Sem conexão. Exibindo dados salvos localmente.</span>`;

  } else if (type === 'error') {
    bannerEl.style.background = 'rgba(239,68,68,0.1)';
    bannerEl.style.borderColor = 'rgba(239,68,68,0.3)';
    bannerEl.style.color = 'var(--color-danger)';
    bannerEl.innerHTML = `<span>✕</span><span>${data.message || 'Erro ao buscar repositórios.'}</span>`;
  }

  banner.appendChild(bannerEl);
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
function _getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

function _buildBadge(label, statusClass) {
  const raw = statusClass || label;
  const cls = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-');
  return `<span class="badge badge-${cls}"><span class="badge-dot"></span>${label}</span>`;
}

function _escape(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
