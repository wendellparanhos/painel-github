/**
 * View: Home (#/home) — Fase 3
 *
 * Entregas contempladas (Fases 1 + 2 + 3):
 *   - Home em Bento Grid consolidada (priorizando no celular: tarefa em foco, projetos recentes e ações rápidas; gráficos secundários abaixo)
 *   - Aurora Reativa sincronizada ao status dominante dos projetos visíveis
 *   - Sparklines de commits nos cards (apenas quando há amostra suficiente em cache — zero requests por card)
 *   - Flip 3D opcional e acessível nos cards (frente: resumo; verso: tarefas rápidas concluíveis e criáveis ali mesmo)
 *   - Seção Analítica Bento: Anéis estilo Apple Watch (Tarefas, Commits, Foco vazio até Fase 4), Donut de Status, Commits por Semana, Barra de Linguagens Empilhada e Heatmap 2D de Atividade Pública
 *   - Alternância Grid / Lista / Kanban / 🫧 Bolhas (carregado sob demanda via import())
 */

import { getState, dispatch, subscribe, undo, canUndo } from '../store/store.js';
import { fetchUserRepos, fetchUserPublicEvents, getLangColor } from '../services/github.js';
import { applyCover } from '../utils/cover.js';
import { formatRelativeTime, formatNumber } from '../utils/formatters.js';
import {
  STATUS_ORDER,
  getMergedProjects,
  filterAndSortProjects,
  computeGlobalMetrics,
  computeDominantStatus,
  computePublicEventsAnalytics,
  getContinueProject,
  getFocusTasks,
  formatLocalDueDate,
  paginateItems
} from '../utils/domain.js';
import {
  animateStaggerIn,
  animateCounter,
  enableSpotlightOnCards,
  enableMagneticButtons,
  updateReactiveAurora,
  burstParticles
} from '../fx/effects.js';
import {
  renderAppleWatchRings,
  renderStatusDonutChart,
  renderWeeklyCommitsChart,
  renderLanguageStackedBar,
  renderActivityHeatmap2D,
  buildCardSparklineElement
} from '../components/charts.js';
import { updateRateLimitIndicator } from '../components/nav.js';
import { renderMascotWidget } from '../components/mascot.js';
import { showToast } from '../components/toast.js';
import { openQuickInboxCaptureModal } from './inbox.js';
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
let _removeMagnetic = null;
let _bubblesHandle = null;
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

    _syncAurora();
    _render();
    _loadRemoteData(false);

    _unsubscribeStore = subscribe(() => {
      _syncAurora();
      _updateStats();
      _renderHighlightsSection();
      _renderGrid();
      _renderAnalyticsSection();
    });
  },

  unmount() {
    _abortController?.abort();
    _abortController = null;
    _unsubscribeStore?.();
    _unsubscribeStore = null;
    _removeSpotlight?.();
    _removeSpotlight = null;
    _removeMagnetic?.();
    _removeMagnetic = null;
    _bubblesHandle?.destroy();
    _bubblesHandle = null;
    _container = null;
  }
};

function _syncAurora() {
  const state = getState();
  const dominant = computeDominantStatus(state);
  updateReactiveAurora(dominant);
}

// ─────────────────────────────────────────────
// RENDER PRINCIPAL (BENTO GRID CONSOLIDADA)
// Ordem pensada para priorizar no celular:
//   1. Saudação + Indicadores rápidos
//   2. Destaques Prioritários (Alerta vencidas, Em Foco, Continue de onde parou, Ações rápidas)
//   3. Toolbar + Projetos (Grid / Lista / Kanban / Bolhas)
//   4. Gráficos e Visualizações Analíticas (Anéis, Donut, Commits/sem, Linguagens, Heatmap 2D)
// ─────────────────────────────────────────────
function _render() {
  if (!_container) return;
  _container.innerHTML = '';
  _container.className = '';

  const view = document.createElement('div');
  view.className = 'home-view';
  _container.appendChild(view);

  // Hero / Saudação com Texto Gradiente Revelado (um efeito dominante no Hero)
  const hero = document.createElement('div');
  hero.className = 'home-hero';

  const greeting = _getGreeting();
  const titleEl = document.createElement('h1');
  titleEl.className = 'home-title text-gradient-reveal';
  titleEl.textContent = `${greeting}, Wendell`;

  const subtitle = document.createElement('p');
  subtitle.className = 'home-subtitle';
  subtitle.textContent = 'Seus repositórios, tarefas prioritárias e telemetria visual em um só lugar.';

  hero.appendChild(titleEl);
  hero.appendChild(subtitle);

  // Stats Bento
  const stats = _renderStats();

  // Banner de status (GitHub)
  const statusBanner = document.createElement('div');
  statusBanner.id = 'github-status-banner';

  // 1. Seção Prioritária (Mobile First): Em Foco + Continue de onde parou + Ações Rápidas
  const highlightsWrap = document.createElement('div');
  highlightsWrap.id = 'home-highlights-wrap';
  try {
    _renderHighlightsInto(highlightsWrap);
  } catch (err) {
    console.error('[Home] Erro ao renderizar destaques:', err);
  }

  // 2. Toolbar de Filtros Ampliados + Alternância Grid / Lista / Kanban / Bolhas
  const toolbar = _renderToolbar();

  // 3. Grid / Lista / Kanban / Bolhas de Projetos
  const gridWrap = document.createElement('div');
  gridWrap.id = 'projects-grid-wrap';
  try {
    _renderGridInto(gridWrap);
  } catch (err) {
    console.error('[Home] Erro ao renderizar projetos:', err);
  }

  // 4. Painel Bento de Gráficos e Visualizações Secundárias (abaixo no celular)
  const analyticsWrap = document.createElement('section');
  analyticsWrap.id = 'home-analytics-bento-wrap';
  analyticsWrap.className = 'home-analytics-section';
  analyticsWrap.setAttribute('aria-label', 'Gráficos e indicadores visuais');
  try {
    _renderAnalyticsInto(analyticsWrap);
  } catch (err) {
    console.error('[Home] Erro ao renderizar gráficos analíticos:', err);
  }

  view.appendChild(hero);
  view.appendChild(stats);
  view.appendChild(statusBanner);
  view.appendChild(highlightsWrap);
  view.appendChild(toolbar);
  view.appendChild(gridWrap);
  view.appendChild(analyticsWrap);

  _removeSpotlight?.();
  _removeSpotlight = enableSpotlightOnCards(gridWrap);
  _removeMagnetic?.();
  _removeMagnetic = enableMagneticButtons(view);
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
// SEÇÃO DE DESTAQUES (BENTO PRIORITÁRIA NO CELULAR):
// Alerta Vencidas + Em Foco + Continue de onde parou + Ações Rápidas
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

  // Bento Grid Prioritária: 1) Em Foco, 2) Continue de onde parou (com borda animada @property), 3) Ações Rápidas
  const split = document.createElement('div');
  split.className = 'home-priority-bento';

  // Card 1: Em foco (prioridade #1 no mobile)
  const focusCard = document.createElement('div');
  focusCard.className = 'card focus-tasks-card bento-priority-focus';
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

      const startFocusBtn = document.createElement('button');
      startFocusBtn.type = 'button';
      startFocusBtn.className = 'btn btn-ghost btn-icon btn-sm';
      startFocusBtn.title = 'Focar nesta tarefa (Pomodoro)';
      startFocusBtn.setAttribute('aria-label', `Iniciar Pomodoro na tarefa ${item.task.title}`);
      startFocusBtn.textContent = '🍅';
      startFocusBtn.addEventListener('click', () => {
        sessionStorage.setItem('panel_focus_target', JSON.stringify({
          repoId: item.repoId,
          taskId: item.task.id
        }));
        navigate('#/focus');
      });

      li.appendChild(cb);
      li.appendChild(info);
      li.appendChild(startFocusBtn);
      list.appendChild(li);
    }
    focusCard.appendChild(list);
  }
  split.appendChild(focusCard);

  // Card 2: Continue de onde parou (com borda giratória sutil `.animated-border-card`)
  if (continueProj) {
    const contCard = document.createElement('div');
    contCard.className = 'card continue-card animated-border-card bento-priority-continue';

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
    openBtn.className = 'btn btn-primary btn-sm btn-magnetic';
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

  // Card 3: Ações Rápidas e Explorador Visual (Foco, Galáxia, Grafo, Inbox, Kanban) + Mascote opcional
  const quickActionsCard = document.createElement('div');
  quickActionsCard.className = 'card quick-actions-bento-card bento-priority-actions';
  quickActionsCard.innerHTML = `
    <div class="section-eyebrow">🚀 Ações Rápidas & Foco</div>
    <div class="quick-actions-grid">
      <a href="#/focus" class="btn btn-secondary btn-sm quick-action-tile">
        <span>🍅</span>
        <span>Modo Foco</span>
      </a>
      <button type="button" class="btn btn-secondary btn-sm quick-action-tile" data-act="inbox">
        <span>📥</span>
        <span>Capturar Ideia</span>
      </button>
      <a href="#/galaxy" class="btn btn-secondary btn-sm quick-action-tile">
        <span>🌌</span>
        <span>Galáxia 2D</span>
      </a>
      <a href="#/graph" class="btn btn-secondary btn-sm quick-action-tile">
        <span>🕸️</span>
        <span>Grafo de Conexões</span>
      </a>
    </div>
  `;
  quickActionsCard.querySelector('[data-act="inbox"]')?.addEventListener('click', () => openQuickInboxCaptureModal());
  const mascotWidget = renderMascotWidget(state);
  if (mascotWidget) {
    mascotWidget.style.marginTop = '12px';
    quickActionsCard.appendChild(mascotWidget);
  }
  split.appendChild(quickActionsCard);

  container.appendChild(split);
  wrap.appendChild(container);
}

// ─────────────────────────────────────────────
// SEÇÃO ANALÍTICA BENTO (ANÉIS, DONUT, COMMITS/SEM, LINGUAGENS, HEATMAP 2D)
// ─────────────────────────────────────────────
function _renderAnalyticsSection() {
  const wrap = document.getElementById('home-analytics-bento-wrap');
  if (!wrap) return;
  wrap.innerHTML = '';
  _renderAnalyticsInto(wrap);
}

function _renderAnalyticsInto(wrap) {
  const state = getState();
  const eventsAnalytics = computePublicEventsAnalytics(state.githubCache);

  const sectionHeader = document.createElement('div');
  sectionHeader.className = 'analytics-section-header';
  sectionHeader.innerHTML = `
    <div>
      <div class="section-eyebrow">📡 Telemetria & Visualizações</div>
      <h2 style="font-size:var(--text-lg);font-weight:700;">Panorama de Atividade e Stack</h2>
    </div>
  `;

  const bentoGrid = document.createElement('div');
  bentoGrid.className = 'analytics-bento-grid';

  bentoGrid.appendChild(renderAppleWatchRings(state));
  bentoGrid.appendChild(renderStatusDonutChart(state));
  bentoGrid.appendChild(renderWeeklyCommitsChart(eventsAnalytics));
  bentoGrid.appendChild(renderLanguageStackedBar(state));
  bentoGrid.appendChild(renderActivityHeatmap2D(eventsAnalytics));

  wrap.appendChild(sectionHeader);
  wrap.appendChild(bentoGrid);
}

// ─────────────────────────────────────────────
// TOOLBAR AMPLIADA + ALTERNÂNCIA GRID / LISTA / KANBAN / BOLHAS
// ─────────────────────────────────────────────
function _renderToolbar() {
  const state = getState();
  const currentViewMode = state.config.homeViewMode || 'grid';

  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar home-toolbar-expanded';

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

  // Alternador Grid / Lista / Kanban / Bolhas
  const viewSwitch = document.createElement('div');
  viewSwitch.className = 'view-mode-switch';
  viewSwitch.setAttribute('role', 'group');
  viewSwitch.setAttribute('aria-label', 'Modo de exibição');

  [
    { id: 'grid',    label: '⊞ Grid' },
    { id: 'list',    label: '☰ Lista' },
    { id: 'kanban',  label: '📋 Kanban' },
    { id: 'bubbles', label: '🫧 Bolhas' }
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

  const filtersGroup = document.createElement('div');
  filtersGroup.className = 'filters-group';
  filtersGroup.style.width = '100%';

  const specialSelect = _buildSelect('Filtrar exibição', SPECIAL_OPTIONS, _filterState.special, (val) => {
    _filterState.special = val;
    _page = 1;
    _renderGrid();
  });

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

  const prioSelect = _buildSelect('Filtrar por prioridade', PRIORITY_OPTIONS, _filterState.priority, (val) => {
    _filterState.priority = val;
    _page = 1;
    _renderGrid();
  });

  const dueSelect = _buildSelect('Filtrar por prazo', DUE_OPTIONS, _filterState.dueFilter, (val) => {
    _filterState.dueFilter = val;
    _page = 1;
    _renderGrid();
  });

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
// GRID / LISTA / KANBAN / BOLHAS DE PROJETOS
// ─────────────────────────────────────────────
function _renderGrid() {
  const wrap = document.getElementById('projects-grid-wrap');
  if (!wrap) return;
  _bubblesHandle?.destroy();
  _bubblesHandle = null;
  wrap.innerHTML = '';
  _renderGridInto(wrap);
}

function _renderGridInto(wrap) {
  const state = getState();
  const viewMode = state.config.homeViewMode || 'grid';
  const merged = getMergedProjects(state);
  const items = filterAndSortProjects(merged, _filterState);
  const eventsAnalytics = computePublicEventsAnalytics(state.githubCache);
  const sparklinesMap = eventsAnalytics.repoSparklines || {};

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

  // Modo Bolhas (Experimental — Carregado sob demanda via import() dinâmico)
  if (viewMode === 'bubbles') {
    const loadingBox = document.createElement('div');
    loadingBox.className = 'card';
    loadingBox.style.cssText = 'padding:2rem;text-align:center;color:var(--text-muted);';
    loadingBox.textContent = 'Carregando Modo Bolhas…';
    wrap.appendChild(loadingBox);

    import('./bubbles.js')
      .then(mod => {
        if (!wrap.isConnected) return;
        _bubblesHandle = mod.mountBubblesStage(wrap, items, () => {
          dispatch({ type: 'CONFIG_UPDATE', payload: { homeViewMode: 'grid' } });
          _render();
        });
      })
      .catch(err => {
        console.warn('[Home] Falha ao carregar Modo Bolhas sob demanda, voltando para Grid:', err);
        dispatch({ type: 'CONFIG_UPDATE', payload: { homeViewMode: 'grid' } });
        _renderGrid();
      });
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

  const cards = visibleItems.map(item => {
    const sparkData = sparklinesMap[item.repoId] || (item.fullName ? sparklinesMap[item.fullName] : null);
    return viewMode === 'list' ? _buildProjectListRow(item) : _buildProjectCard(item, sparkData);
  });
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
// CARD DE PROJETO (MODO GRID COM FLIP 3D ACESSÍVEL + SPARKLINE)
// ─────────────────────────────────────────────
function _buildProjectCard(item, sparklineData = null) {
  const card = document.createElement('div');
  card.className = 'card card-spotlight project-card flip-card-container';
  card.setAttribute('tabindex', '0');
  card.setAttribute('role', 'group');
  card.setAttribute('aria-label', `Projeto ${item.name}`);

  if (item.customColor) {
    card.style.borderColor = `${item.customColor}66`;
  }

  function openProject() {
    if (card.classList.contains('is-flipped')) return;
    navigate(`#/project/${item.repoId}`);
  }

  card.addEventListener('click', (e) => {
    if (e.target.closest('button, input, a, select, .project-card-back')) return;
    openProject();
  });

  card.addEventListener('keydown', e => {
    if (e.target !== card) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openProject();
    }
  });

  const flipper = document.createElement('div');
  flipper.className = 'project-card-flipper';

  // ── FACE FRONTAL (RESUMO DO PROJETO) ───────
  const front = document.createElement('div');
  front.className = 'project-card-front';

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

  // Botão acessível de Flip 3D (Tarefas rápidas no verso)
  const flipToBackBtn = document.createElement('button');
  flipToBackBtn.type = 'button';
  flipToBackBtn.className = 'card-flip-btn';
  flipToBackBtn.setAttribute('aria-label', `Ver tarefas rápidas de ${item.name}`);
  flipToBackBtn.setAttribute('aria-expanded', 'false');
  flipToBackBtn.title = 'Virar cartão: tarefas rápidas';
  flipToBackBtn.innerHTML = `🔄 <span class="tabular">${item.openTasksCount}</span>`;
  cover.appendChild(flipToBackBtn);

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

  // Corpo Frontal
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

  // Sparkline de commits (SOMENTE se houver amostra suficiente em cache)
  const sparklineEl = buildCardSparklineElement(sparklineData);

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

  // Meta: linguagem + sparkline + estrelas + último push
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
  if (sparklineEl) meta.appendChild(sparklineEl);
  meta.appendChild(metaStats);

  body.appendChild(header);
  body.appendChild(descEl);
  if (progressEl) body.appendChild(progressEl);
  body.appendChild(meta);

  front.appendChild(cover);
  front.appendChild(body);

  // ── FACE TRASEIRA (TAREFAS RÁPIDAS DO PROJETO) ──
  const back = document.createElement('div');
  back.className = 'project-card-back';
  back.setAttribute('aria-hidden', 'true');

  const backHeader = document.createElement('div');
  backHeader.className = 'card-back-header';
  backHeader.innerHTML = `
    <strong style="font-size:var(--text-sm);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
      ☑️ ${_escape(item.name)}
    </strong>
  `;

  const flipToFrontBtn = document.createElement('button');
  flipToFrontBtn.type = 'button';
  flipToFrontBtn.className = 'btn btn-ghost btn-sm';
  flipToFrontBtn.textContent = '↩ Resumo';
  flipToFrontBtn.setAttribute('aria-label', `Voltar ao resumo de ${item.name}`);
  backHeader.appendChild(flipToFrontBtn);

  const backTasksList = document.createElement('div');
  backTasksList.className = 'card-back-tasks';

  const openTasks = item.tasks.filter(t => !t.completed).slice(0, 4);
  if (openTasks.length === 0) {
    const emptyMsg = document.createElement('p');
    emptyMsg.style.cssText = 'font-size:var(--text-xs);color:var(--text-muted);margin:auto 0;text-align:center;';
    emptyMsg.textContent = 'Nenhuma tarefa aberta neste projeto.';
    backTasksList.appendChild(emptyMsg);
  } else {
    for (const t of openTasks) {
      const row = document.createElement('label');
      row.className = 'card-back-task-row';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'task-checkbox';
      cb.addEventListener('change', (e) => {
        e.stopPropagation();
        burstParticles(cb);
        dispatch({ type: 'TASK_TOGGLE', payload: { repoId: item.repoId, taskId: t.id } });
      });
      const span = document.createElement('span');
      span.textContent = t.title;
      row.appendChild(cb);
      row.appendChild(span);
      backTasksList.appendChild(row);
    }
  }

  // Input rápido para adicionar tarefa direto no verso do card
  const quickInput = document.createElement('input');
  quickInput.type = 'text';
  quickInput.className = 'input';
  quickInput.style.cssText = 'min-height:34px;font-size:var(--text-xs);padding:4px 8px;';
  quickInput.placeholder = '＋ Nova tarefa rápida… (Enter)';
  quickInput.setAttribute('aria-label', `Nova tarefa rápida em ${item.name}`);
  quickInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && quickInput.value.trim()) {
      e.preventDefault();
      e.stopPropagation();
      dispatch({
        type: 'TASK_ADD',
        payload: { repoId: item.repoId, title: quickInput.value.trim(), priority: 'normal' }
      });
      quickInput.value = '';
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      setFlipped(false);
    }
  });

  const backFooter = document.createElement('div');
  backFooter.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:6px;';
  const openFullLink = document.createElement('a');
  openFullLink.href = `#/project/${item.repoId}`;
  openFullLink.style.cssText = 'font-size:var(--text-xs);font-weight:600;';
  openFullLink.textContent = 'Abrir projeto completo →';
  backFooter.appendChild(openFullLink);

  back.appendChild(backHeader);
  back.appendChild(backTasksList);
  back.appendChild(quickInput);
  back.appendChild(backFooter);

  function setFlipped(flipped) {
    card.classList.toggle('is-flipped', flipped);
    flipToBackBtn.setAttribute('aria-expanded', flipped ? 'true' : 'false');
    front.setAttribute('aria-hidden', flipped ? 'true' : 'false');
    back.setAttribute('aria-hidden', flipped ? 'false' : 'true');
    if (flipped) {
      card.style.setProperty('--tilt-x', '0deg');
      card.style.setProperty('--tilt-y', '0deg');
      quickInput.focus();
    } else {
      flipToBackBtn.focus();
    }
  }

  flipToBackBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    setFlipped(true);
  });

  flipToFrontBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    setFlipped(false);
  });

  back.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      setFlipped(false);
    }
  });

  flipper.appendChild(front);
  flipper.appendChild(back);
  card.appendChild(flipper);

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
// BUSCA DE REPOS + EVENTOS PÚBLICOS NO GITHUB
// (Orçamento respeitado: apenas listUserRepos + 1 chamada de eventos públicos cacheada)
// ─────────────────────────────────────────────
async function _loadRemoteData(forceRefresh = false) {
  const state = getState();
  const signal = _abortController?.signal;

  _showBanner('loading');

  const [reposResult, eventsResult] = await Promise.all([
    fetchUserRepos(state.githubCache, forceRefresh, signal),
    fetchUserPublicEvents(state.githubCache, forceRefresh, signal)
  ]);

  if (signal?.aborted) return;

  updateRateLimitIndicator(reposResult.rateLimit || eventsResult.rateLimit);

  if (eventsResult.source === 'network' && Array.isArray(eventsResult.data)) {
    dispatch({
      type: 'GITHUB_EVENTS_CACHE_UPDATE',
      payload: {
        events: eventsResult.data,
        fetchedAt: eventsResult.fetchedAt,
        rateLimit: eventsResult.rateLimit
      }
    });
  }

  if (reposResult.source === 'network' && reposResult.data) {
    dispatch({
      type: 'GITHUB_CACHE_UPDATE',
      payload: {
        repos: reposResult.data,
        fetchedAt: reposResult.fetchedAt,
        rateLimit: reposResult.rateLimit
      }
    });
    dispatch({ type: 'PROJECTS_SYNC_GITHUB', payload: { repos: reposResult.data } });
    _showBanner('hidden');

  } else if (reposResult.source === 'cache') {
    _showBanner('cache', { fetchedAt: reposResult.fetchedAt });

  } else if (reposResult.source === 'rate-limit') {
    _showBanner('rate-limit', { resetAt: reposResult.rateLimitResetAt });
    if (reposResult.rateLimit) {
      dispatch({ type: 'GITHUB_RATE_LIMIT_UPDATE', payload: { rateLimit: reposResult.rateLimit } });
    }

  } else if (reposResult.source === 'offline') {
    _showBanner('offline');

  } else if (reposResult.source === 'error') {
    _showBanner('error', { message: reposResult.error });
  }

  _renderGrid();
  _renderAnalyticsSection();
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
          Sincronizando repositórios e telemetria do GitHub…
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
    refreshBtn.addEventListener('click', () => _loadRemoteData(true));
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
