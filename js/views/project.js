/**
 * View: Project Detail (#/project/:id) — Fase 2
 *
 * Entregas contempladas:
 *   1. Abas com indicador deslizante: Visão geral, Tarefas, Atividade, Notas, Timeline
 *   2. Atividade: Commits, PRs e Issues abertos com erro isolado e estado "indisponível"
 *   3. Tarefas avançadas: subtarefas (confirmação ao excluir grupo), recorrência idempotente,
 *      datas no fuso local, drag-and-drop com Pointer Events + botões acessíveis, filtro (todas/abertas/feitas)
 *   4. Histórico de status visível e Undo completo
 *   5. Personalização: fixar (pin), ocultar, ícone/emoji e cor personalizados, trocar semente da capa
 */

import { getState, dispatch, subscribe, undo, canUndo } from '../store/store.js';
import { fetchUserRepos, fetchRepoCommits, fetchRepoPulls, fetchRepoIssues } from '../services/github.js';
import { applyCover, invalidateCoverCache } from '../utils/cover.js';
import { formatRelativeTime, formatDateTime } from '../utils/formatters.js';
import {
  formatLocalDueDate,
  isTaskOverdue,
  isTaskDueSoon,
  paginateItems
} from '../utils/domain.js';
import { renderMarkdown } from '../utils/markdown.js';
import { showToast } from '../components/toast.js';
import { openModal } from '../components/modal.js';
import { burstParticles } from '../fx/effects.js';
import { navigate } from '../router.js';

const STATUS_LIST = ['ideia', 'em andamento', 'pausado', 'concluído', 'arquivado'];
const PRIORITY_LIST = ['baixa', 'normal', 'alta', 'urgente'];
const RECURRENCE_OPTIONS = [
  { value: '', label: 'Sem recorrência' },
  { value: 'daily', label: '↻ Diária' },
  { value: 'weekly', label: '↻ Semanal' },
  { value: 'monthly', label: '↻ Mensal' }
];
const RECURRENCE_LABELS = {
  daily: 'Diária',
  weekly: 'Semanal',
  monthly: 'Mensal'
};

const TABS = [
  { id: 'overview', label: 'Visão geral' },
  { id: 'tasks',    label: 'Tarefas' },
  { id: 'activity', label: 'Atividade' },
  { id: 'notes',    label: 'Notas' },
  { id: 'timeline', label: 'Timeline' }
];

const PRESET_EMOJIS = ['🚀', '💡', '⚡', '🛠️', '📦', '🌐', '🤖', '📱', '🎮', '🔒', '📊', '🎨'];
const PRESET_COLORS = ['', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#f43f5e', '#3b82f6', '#ec4899'];

let _container = null;
let _repoId = null;
let _abortController = null;
let _unsubscribeStore = null;
let _noteDebounceTimer = null;
let _activeTab = 'overview';
let _taskFilter = 'all'; // 'all' | 'open' | 'done'
let _taskPage = 1;
let _expandedSubtasks = new Set();

// Cache em memória da view para alimentar a Timeline com dados remotos carregados
let _remoteActivity = {
  commits: { loading: true, data: null, error: null },
  pulls:   { loading: true, data: null, error: null },
  issues:  { loading: true, data: null, error: null }
};

// Cleanup de drag-and-drop ativo
let _cleanupTaskDrag = null;

export const ProjectView = {
  mount(container, params) {
    _container = container;
    _repoId = params?.id ? String(params.id) : null;
    _abortController = new AbortController();
    _taskPage = 1;

    if (!_repoId) {
      navigate('#/home');
      return;
    }

    // Permite abrir direto em uma aba específica via sessionStorage (ex.: vindo da Command Palette)
    const requestedTab = sessionStorage.getItem('panel_open_project_tab');
    if (requestedTab && TABS.some(t => t.id === requestedTab)) {
      _activeTab = requestedTab;
      sessionStorage.removeItem('panel_open_project_tab');
    } else {
      _activeTab = 'overview';
    }

    dispatch({ type: 'PROJECT_ENSURE', payload: { repoId: _repoId } });
    dispatch({ type: 'PROJECT_TOUCH', payload: { repoId: _repoId } });

    _remoteActivity = {
      commits: { loading: true, data: null, error: null },
      pulls:   { loading: true, data: null, error: null },
      issues:  { loading: true, data: null, error: null }
    };

    _render();
    _loadAllRemoteActivity();

    _unsubscribeStore = subscribe(() => {
      _refreshDynamicParts();
    });
  },

  unmount() {
    _abortController?.abort();
    _abortController = null;
    _unsubscribeStore?.();
    _unsubscribeStore = null;
    _cleanupTaskDrag?.();
    _cleanupTaskDrag = null;
    if (_noteDebounceTimer) clearTimeout(_noteDebounceTimer);
    _noteDebounceTimer = null;
    _container = null;
    _repoId = null;
  }
};

// ─────────────────────────────────────────────
// RENDER PRINCIPAL
// ─────────────────────────────────────────────
function _render() {
  if (!_container || !_repoId) return;
  _container.innerHTML = '';

  const state = getState();
  const repoData = _getGitHubRepoData(state);
  const local = state.projects[_repoId] || {};

  const view = document.createElement('div');
  view.className = 'project-view';

  // Barra superior: Voltar + ações rápidas
  const topBar = document.createElement('div');
  topBar.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;';

  const backNav = document.createElement('a');
  backNav.href = '#/home';
  backNav.className = 'project-back-nav btn btn-ghost btn-sm';
  backNav.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg> Projetos`;

  const topActions = document.createElement('div');
  topActions.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;';

  const kanbanLink = document.createElement('a');
  kanbanLink.href = '#/kanban';
  kanbanLink.className = 'btn btn-ghost btn-sm';
  kanbanLink.textContent = '📋 Ver no Kanban';

  topActions.appendChild(kanbanLink);
  topBar.appendChild(backNav);
  topBar.appendChild(topActions);

  // Hero / Cabeçalho
  const hero = _renderHero(repoData, local);

  // Barra de Abas com Indicador Deslizante
  const tabsBar = _renderTabsBar(local);

  // Container do conteúdo da aba ativa
  const tabContent = document.createElement('div');
  tabContent.id = 'project-tab-content';
  tabContent.className = 'project-tab-content';
  tabContent.setAttribute('role', 'tabpanel');

  view.appendChild(topBar);
  view.appendChild(hero);
  view.appendChild(tabsBar);
  view.appendChild(tabContent);

  _container.appendChild(view);

  _renderActiveTabContent();
  requestAnimationFrame(() => _updateTabIndicator());
}

function _refreshDynamicParts() {
  if (!_container || !_repoId) return;
  const state = getState();
  const local = state.projects[_repoId] || {};

  // Atualiza select de status e botões do hero
  const select = document.getElementById('project-status-select');
  if (select && select.value !== (local.status || 'ideia')) {
    select.value = local.status || 'ideia';
  }

  const pinBtn = document.getElementById('project-pin-btn');
  if (pinBtn) {
    pinBtn.textContent = local.pinned ? '📌 Fixado' : '📍 Fixar';
    pinBtn.classList.toggle('is-active-chip', Boolean(local.pinned));
  }

  const hideBtn = document.getElementById('project-hide-btn');
  if (hideBtn) {
    hideBtn.textContent = local.hidden ? '👁️ Oculto' : '👁️ Ocultar';
    hideBtn.classList.toggle('is-active-chip', Boolean(local.hidden));
  }

  // Atualiza contador na aba de Tarefas
  const tasksTabBtn = _container.querySelector('[data-tab-id="tasks"] .tab-badge');
  if (tasksTabBtn) {
    const openCount = (local.tasks || []).filter(t => !t.completed).length;
    tasksTabBtn.textContent = String(openCount);
  }

  // Se estiver em overview, tasks ou timeline, re-renderiza a aba ativa
  if (_activeTab === 'overview' || _activeTab === 'tasks' || _activeTab === 'timeline') {
    _renderActiveTabContent();
  }
}

// ─────────────────────────────────────────────
// HERO / CABEÇALHO DO PROJETO
// ─────────────────────────────────────────────
function _renderHero(repoData, local) {
  const hero = document.createElement('div');
  hero.className = 'project-hero';
  if (local.customColor) {
    hero.style.borderColor = local.customColor;
    hero.style.boxShadow = `0 8px 28px -6px ${local.customColor}44`;
  }

  // Capa
  const coverEl = document.createElement('div');
  coverEl.className = 'project-hero-cover';
  applyCover(coverEl, _repoId, local.coverSeed || 0);
  if (local.customColor) {
    coverEl.style.borderBottom = `2px solid ${local.customColor}`;
  }

  // Ações sobre a capa (Fixar, Ocultar, Personalizar, Nova capa)
  const coverActions = document.createElement('div');
  coverActions.style.cssText = 'position:absolute;bottom:10px;right:10px;display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;';

  const pinBtn = document.createElement('button');
  pinBtn.id = 'project-pin-btn';
  pinBtn.className = `btn btn-ghost btn-sm hero-overlay-btn${local.pinned ? ' is-active-chip' : ''}`;
  pinBtn.textContent = local.pinned ? '📌 Fixado' : '📍 Fixar';
  pinBtn.setAttribute('aria-label', 'Fixar projeto no topo');
  pinBtn.addEventListener('click', () => {
    dispatch({ type: 'PROJECT_TOGGLE_PIN', payload: { repoId: _repoId } });
    const nextPinned = !local.pinned;
    local.pinned = nextPinned;
    showToast(nextPinned ? 'Projeto fixado no topo!' : 'Projeto desafixado.', { type: 'info', duration: 2000 });
  });

  const hideBtn = document.createElement('button');
  hideBtn.id = 'project-hide-btn';
  hideBtn.className = `btn btn-ghost btn-sm hero-overlay-btn${local.hidden ? ' is-active-chip' : ''}`;
  hideBtn.textContent = local.hidden ? '👁️ Oculto' : '👁️ Ocultar';
  hideBtn.setAttribute('aria-label', 'Ocultar ou exibir projeto na listagem padrão');
  hideBtn.addEventListener('click', () => {
    dispatch({ type: 'PROJECT_TOGGLE_HIDDEN', payload: { repoId: _repoId } });
    const nextHidden = !local.hidden;
    local.hidden = nextHidden;
    showToast(nextHidden ? 'Projeto ocultado da listagem principal.' : 'Projeto visível novamente.', { type: 'info', duration: 2500 });
  });

  const customBtn = document.createElement('button');
  customBtn.className = 'btn btn-ghost btn-sm hero-overlay-btn';
  customBtn.textContent = '✨ Ícone e Cor';
  customBtn.addEventListener('click', () => _openCustomizeModal());

  const regenBtn = document.createElement('button');
  regenBtn.className = 'btn btn-ghost btn-sm hero-overlay-btn';
  regenBtn.textContent = '🎨 Nova capa';
  regenBtn.addEventListener('click', () => {
    const oldSeed = local.coverSeed || 0;
    const newSeed = Math.floor(Math.random() * 9999);
    invalidateCoverCache(_repoId, oldSeed);
    dispatch({ type: 'PROJECT_UPDATE_COVER_SEED', payload: { repoId: _repoId, newSeed, oldSeed } });
    applyCover(coverEl, _repoId, newSeed);
    local.coverSeed = newSeed;
  });

  coverActions.appendChild(pinBtn);
  coverActions.appendChild(hideBtn);
  coverActions.appendChild(customBtn);
  coverActions.appendChild(regenBtn);
  coverEl.style.position = 'relative';
  coverEl.appendChild(coverActions);

  // Conteúdo do hero
  const content = document.createElement('div');
  content.className = 'project-hero-content';

  const header = document.createElement('div');
  header.className = 'project-hero-header';

  const titleGroup = document.createElement('div');
  titleGroup.className = 'project-title-group';

  const displayName = local.customName || repoData?.name || local.name || `Projeto ${_repoId}`;
  const iconPrefix = local.customIcon ? `${local.customIcon} ` : '';

  const name = document.createElement('h1');
  name.style.fontSize = 'var(--text-xl)';
  name.style.display = 'flex';
  name.style.alignItems = 'center';
  name.style.gap = '8px';
  name.textContent = `${iconPrefix}${displayName}`;

  if (local.customColor) {
    const colorDot = document.createElement('span');
    colorDot.style.cssText = `width:10px;height:10px;border-radius:50%;background:${local.customColor};box-shadow:0 0 8px ${local.customColor};display:inline-block;`;
    colorDot.title = `Cor personalizada: ${local.customColor}`;
    name.appendChild(colorDot);
  }

  const desc = document.createElement('p');
  desc.style.color = 'var(--text-secondary)';
  desc.textContent = repoData?.description || local.description || (local.unavailable ? 'Repositório indisponível no GitHub.' : 'Sem descrição.');

  titleGroup.appendChild(name);
  titleGroup.appendChild(desc);

  // Controle de Status
  const statusControl = _renderStatusControl(local);

  header.appendChild(titleGroup);
  header.appendChild(statusControl);

  // Links e Metadados
  const linksEl = document.createElement('div');
  linksEl.className = 'project-links';

  if (repoData?.htmlUrl) {
    const ghLink = document.createElement('a');
    ghLink.href = repoData.htmlUrl;
    ghLink.target = '_blank';
    ghLink.rel = 'noopener noreferrer';
    ghLink.className = 'btn btn-secondary btn-sm';
    ghLink.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg> GitHub`;
    linksEl.appendChild(ghLink);
  }

  if (repoData?.homepage) {
    const siteLink = document.createElement('a');
    siteLink.href = repoData.homepage;
    siteLink.target = '_blank';
    siteLink.rel = 'noopener noreferrer';
    siteLink.className = 'btn btn-secondary btn-sm';
    siteLink.innerHTML = `🌐 Site`;
    linksEl.appendChild(siteLink);
  }

  if (repoData) {
    const meta = document.createElement('div');
    meta.style.cssText = 'display:flex;gap:12px;align-items:center;font-size:var(--text-sm);color:var(--text-secondary);flex-wrap:wrap;';
    if (repoData.language) {
      meta.innerHTML += `<span>💬 ${repoData.language}</span>`;
    }
    meta.innerHTML += `<span>⭐ ${repoData.stars || 0}</span>`;
    meta.innerHTML += `<span>🍴 ${repoData.forks || 0}</span>`;
    if (repoData.pushedAt) {
      meta.innerHTML += `<span>🕐 ${formatRelativeTime(repoData.pushedAt)}</span>`;
    }
    linksEl.appendChild(meta);
  } else if (local.isLocalOnly) {
    const localBadge = document.createElement('span');
    localBadge.className = 'badge badge-neutral';
    localBadge.textContent = '🏠 Projeto Local';
    linksEl.appendChild(localBadge);
  }

  const historyBtn = document.createElement('button');
  historyBtn.className = 'btn btn-ghost btn-sm';
  historyBtn.textContent = `📋 Histórico (${(local.statusHistory || []).length})`;
  historyBtn.addEventListener('click', () => {
    const currentLocal = getState().projects[_repoId] || {};
    _showStatusHistory(currentLocal.statusHistory || []);
  });
  linksEl.appendChild(historyBtn);

  content.appendChild(header);
  content.appendChild(linksEl);
  hero.appendChild(coverEl);
  hero.appendChild(content);
  return hero;
}

// ─────────────────────────────────────────────
// MODAL DE PERSONALIZAÇÃO (Ícone/Emoji e Cor)
// ─────────────────────────────────────────────
function _openCustomizeModal() {
  const state = getState();
  const local = state.projects[_repoId] || {};

  let selectedIcon = local.customIcon || '';
  let selectedColor = local.customColor || '';

  const body = document.createElement('div');
  body.style.cssText = 'display:flex;flex-direction:column;gap:16px;';

  // Emoji / Ícone
  const iconGroup = document.createElement('div');
  iconGroup.className = 'input-group';
  iconGroup.style.marginBottom = '0';
  iconGroup.innerHTML = `<label class="input-label">Ícone ou Emoji do Projeto</label>`;

  const iconInput = document.createElement('input');
  iconInput.type = 'text';
  iconInput.className = 'input';
  iconInput.maxLength = 4;
  iconInput.placeholder = 'Ex.: 🚀 (ou deixe vazio)';
  iconInput.value = selectedIcon;

  const emojiBar = document.createElement('div');
  emojiBar.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;';
  PRESET_EMOJIS.forEach(em => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn btn-secondary btn-sm';
    b.textContent = em;
    b.addEventListener('click', () => { iconInput.value = em; });
    emojiBar.appendChild(b);
  });
  const clearEmojiBtn = document.createElement('button');
  clearEmojiBtn.type = 'button';
  clearEmojiBtn.className = 'btn btn-ghost btn-sm';
  clearEmojiBtn.textContent = 'Limpar';
  clearEmojiBtn.addEventListener('click', () => { iconInput.value = ''; });
  emojiBar.appendChild(clearEmojiBtn);

  iconGroup.appendChild(iconInput);
  iconGroup.appendChild(emojiBar);

  // Cor personalizada
  const colorGroup = document.createElement('div');
  colorGroup.className = 'input-group';
  colorGroup.style.marginBottom = '0';
  colorGroup.innerHTML = `<label class="input-label">Cor Personalizada do Card</label>`;

  const colorRow = document.createElement('div');
  colorRow.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;align-items:center;';

  PRESET_COLORS.forEach(c => {
    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.style.cssText = `width:32px;height:32px;border-radius:50%;cursor:pointer;border:2px solid ${selectedColor === c ? 'var(--text-main)' : 'var(--border-card)'};background:${c || 'var(--bg-surface)'};display:flex;align-items:center;justify-content:center;font-size:11px;color:var(--text-muted);`;
    if (!c) swatch.textContent = '∅';
    swatch.title = c || 'Padrão do tema';
    swatch.addEventListener('click', () => {
      selectedColor = c;
      colorRow.querySelectorAll('button').forEach(btn => btn.style.borderColor = 'var(--border-card)');
      swatch.style.borderColor = 'var(--text-main)';
    });
    colorRow.appendChild(swatch);
  });

  colorGroup.appendChild(colorRow);

  body.appendChild(iconGroup);
  body.appendChild(colorGroup);

  openModal({
    title: 'Personalizar Projeto',
    body,
    confirmLabel: 'Salvar',
    cancelLabel: 'Cancelar',
    onConfirm: () => {
      dispatch({
        type: 'PROJECT_CUSTOMIZE',
        payload: {
          repoId: _repoId,
          customIcon: iconInput.value.trim(),
          customColor: selectedColor
        }
      });
      showToast('Personalização salva!', { type: 'success', duration: 2500 });
      _render();
    }
  });
}

// ─────────────────────────────────────────────
// CONTROLE DE STATUS + HISTÓRICO
// ─────────────────────────────────────────────
function _renderStatusControl(local) {
  const wrap = document.createElement('div');
  wrap.className = 'project-status-control';

  const label = document.createElement('span');
  label.style.cssText = 'font-size:var(--text-xs);font-weight:600;color:var(--text-muted);white-space:nowrap;';
  label.textContent = 'Status:';

  const select = document.createElement('select');
  select.id = 'project-status-select';
  select.className = 'select';
  select.style.width = 'auto';
  select.setAttribute('aria-label', 'Status do projeto');

  STATUS_LIST.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s;
    opt.textContent = s.charAt(0).toUpperCase() + s.slice(1);
    opt.selected = s === (local.status || 'ideia');
    select.appendChild(opt);
  });

  select.addEventListener('change', () => {
    dispatch({ type: 'PROJECT_UPDATE_STATUS', payload: { repoId: _repoId, status: select.value } });
    showToast(`Status alterado para "${select.value}"`, {
      type: 'success',
      duration: 4500,
      action: {
        label: 'Desfazer',
        fn: () => { if (canUndo()) undo(); }
      }
    });
  });

  wrap.appendChild(label);
  wrap.appendChild(select);
  return wrap;
}

function _showStatusHistory(history) {
  const body = document.createElement('div');
  body.style.cssText = 'display:flex;flex-direction:column;gap:8px;';

  if (!history || history.length === 0) {
    body.textContent = 'Nenhuma transição registrada ainda.';
  } else {
    const sorted = [...history].reverse();
    sorted.forEach((entry, i) => {
      const item = document.createElement('div');
      item.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:var(--bg-surface);border-radius:var(--radius-sm);border:1px solid var(--border-subtle);';

      const badgeEl = document.createElement('span');
      const cls = (entry.status || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, '-');
      badgeEl.innerHTML = `<span class="badge badge-${cls}"><span class="badge-dot"></span>${entry.status || '?'}</span>${i === 0 ? ' <small style="color:var(--text-muted);margin-left:6px;">(atual)</small>' : ''}`;

      const dateEl = document.createElement('span');
      dateEl.style.cssText = 'font-size:var(--text-xs);color:var(--text-muted);font-family:var(--font-mono);';
      dateEl.textContent = formatDateTime(entry.timestamp);

      item.appendChild(badgeEl);
      item.appendChild(dateEl);
      body.appendChild(item);
    });
  }

  openModal({
    title: 'Histórico de Status',
    body,
    hideCancel: !canUndo(),
    cancelLabel: 'Desfazer última ação',
    confirmLabel: 'Fechar',
    onCancel: () => {
      if (canUndo()) {
        undo();
        showToast('Ação desfeita.', { type: 'info', duration: 2500 });
      }
    },
    onConfirm: () => {}
  });
}

// ─────────────────────────────────────────────
// BARRA DE ABAS COM INDICADOR DESLIZANTE
// ─────────────────────────────────────────────
function _renderTabsBar(local) {
  const nav = document.createElement('div');
  nav.className = 'project-tabs-bar';
  nav.setAttribute('role', 'tablist');
  nav.setAttribute('aria-label', 'Seções do projeto');

  const openTasksCount = (local.tasks || []).filter(t => !t.completed).length;

  for (const tab of TABS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `project-tab-btn${_activeTab === tab.id ? ' is-active' : ''}`;
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', _activeTab === tab.id ? 'true' : 'false');
    btn.setAttribute('data-tab-id', tab.id);

    const labelSpan = document.createElement('span');
    labelSpan.textContent = tab.label;
    btn.appendChild(labelSpan);

    if (tab.id === 'tasks') {
      const badge = document.createElement('span');
      badge.className = 'tab-badge tabular';
      badge.textContent = String(openTasksCount);
      btn.appendChild(badge);
    }

    btn.addEventListener('click', () => {
      if (_activeTab === tab.id) return;
      _activeTab = tab.id;
      nav.querySelectorAll('.project-tab-btn').forEach(b => {
        const active = b.getAttribute('data-tab-id') === _activeTab;
        b.classList.toggle('is-active', active);
        b.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      _updateTabIndicator();
      _renderActiveTabContent();
    });

    nav.appendChild(btn);
  }

  const indicator = document.createElement('div');
  indicator.className = 'project-tab-indicator';
  indicator.id = 'project-tab-indicator';
  nav.appendChild(indicator);

  return nav;
}

function _updateTabIndicator() {
  const nav = _container?.querySelector('.project-tabs-bar');
  const indicator = document.getElementById('project-tab-indicator');
  if (!nav || !indicator) return;

  const activeBtn = nav.querySelector(`.project-tab-btn[data-tab-id="${_activeTab}"]`);
  if (!activeBtn) return;

  indicator.style.width = `${activeBtn.offsetWidth}px`;
  indicator.style.transform = `translateX(${activeBtn.offsetLeft}px)`;
}

// ─────────────────────────────────────────────
// RENDERIZAÇÃO DA ABA ATIVA
// ─────────────────────────────────────────────
function _renderActiveTabContent() {
  const wrap = document.getElementById('project-tab-content');
  if (!wrap || !_repoId) return;

  _cleanupTaskDrag?.();
  _cleanupTaskDrag = null;
  wrap.innerHTML = '';

  const state = getState();
  const local = state.projects[_repoId] || {};
  const repoData = _getGitHubRepoData(state);

  if (_activeTab === 'overview') {
    wrap.appendChild(_buildOverviewTab(local, repoData));
  } else if (_activeTab === 'tasks') {
    wrap.appendChild(_buildTasksTab(local));
  } else if (_activeTab === 'activity') {
    wrap.appendChild(_buildActivityTab(repoData));
  } else if (_activeTab === 'notes') {
    wrap.appendChild(_buildNotesTab(local));
  } else if (_activeTab === 'timeline') {
    wrap.appendChild(_buildTimelineTab(local, repoData));
  }
}

// ─────────────────────────────────────────────
// ABA 1: VISÃO GERAL
// ─────────────────────────────────────────────
function _buildOverviewTab(local, repoData) {
  const grid = document.createElement('div');
  grid.className = 'project-split';

  // Coluna esquerda: Resumo de Tarefas + Próximas Ações
  const leftCol = document.createElement('div');
  leftCol.style.cssText = 'display:flex;flex-direction:column;gap:16px;';

  const tasks = local.tasks || [];
  const totalTasks = tasks.length;
  const doneTasks = tasks.filter(t => t.completed).length;
  const openTasks = tasks.filter(t => !t.completed);
  const overdueCount = openTasks.filter(isTaskOverdue).length;
  const pct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  const progressCard = document.createElement('div');
  progressCard.className = 'card';
  progressCard.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
      <h3 style="font-size:var(--text-base);">Progresso das Tarefas</h3>
      <span class="tabular" style="font-size:var(--text-sm);font-weight:700;color:var(--accent-primary);">${doneTasks}/${totalTasks} (${pct}%)</span>
    </div>
    <div class="progress-bar" style="height:8px;margin-bottom:12px;">
      <div class="progress-fill" style="width:${pct}%;"></div>
    </div>
    <div style="display:flex;gap:16px;font-size:var(--text-xs);color:var(--text-secondary);flex-wrap:wrap;">
      <span>📂 Abertas: <strong>${openTasks.length}</strong></span>
      <span>✅ Concluídas: <strong>${doneTasks}</strong></span>
      ${overdueCount > 0 ? `<span style="color:var(--color-danger);font-weight:700;">⏰ Vencidas: ${overdueCount}</span>` : ''}
    </div>
  `;

  // Próximas tarefas abertas (até 4)
  const quickTasksCard = document.createElement('div');
  quickTasksCard.className = 'card';
  const qtHeader = document.createElement('div');
  qtHeader.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;';
  qtHeader.innerHTML = `<h3 style="font-size:var(--text-base);">Próximas Tarefas</h3>`;

  const goTasksBtn = document.createElement('button');
  goTasksBtn.className = 'btn btn-ghost btn-sm';
  goTasksBtn.textContent = 'Gerenciar todas →';
  goTasksBtn.addEventListener('click', () => {
    _container?.querySelector('[data-tab-id="tasks"]')?.click();
  });
  qtHeader.appendChild(goTasksBtn);
  quickTasksCard.appendChild(qtHeader);

  if (openTasks.length === 0) {
    const emptyP = document.createElement('p');
    emptyP.style.cssText = 'font-size:var(--text-sm);color:var(--text-muted);';
    emptyP.textContent = 'Nenhuma tarefa aberta neste projeto.';
    quickTasksCard.appendChild(emptyP);
  } else {
    const ul = document.createElement('ul');
    ul.className = 'tasks-list';
    openTasks.slice(0, 4).forEach((t, idx) => {
      ul.appendChild(_buildTaskItem(t, idx, openTasks.length, false));
    });
    quickTasksCard.appendChild(ul);
  }

  leftCol.appendChild(progressCard);
  leftCol.appendChild(quickTasksCard);

  // Coluna direita: Histórico de Status + Resumo de Notas
  const rightCol = document.createElement('div');
  rightCol.style.cssText = 'display:flex;flex-direction:column;gap:16px;';

  // Card de Histórico Recente de Status
  const statusCard = document.createElement('div');
  statusCard.className = 'card';
  const stHeader = document.createElement('div');
  stHeader.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;';
  stHeader.innerHTML = `<h3 style="font-size:var(--text-base);">Histórico de Status</h3>`;

  if (canUndo()) {
    const undoBtn = document.createElement('button');
    undoBtn.className = 'btn btn-secondary btn-sm';
    undoBtn.textContent = '↩ Desfazer';
    undoBtn.addEventListener('click', () => {
      undo();
      showToast('Última alteração desfeita.', { type: 'info', duration: 2500 });
    });
    stHeader.appendChild(undoBtn);
  }
  statusCard.appendChild(stHeader);

  const histList = document.createElement('div');
  histList.style.cssText = 'display:flex;flex-direction:column;gap:6px;';
  const recentHist = [...(local.statusHistory || [])].reverse().slice(0, 4);
  recentHist.forEach((h, idx) => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;font-size:var(--text-xs);padding:6px 10px;background:var(--bg-surface);border-radius:var(--radius-sm);';
    const cls = (h.status || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-');
    row.innerHTML = `
      <span class="badge badge-${cls}"><span class="badge-dot"></span>${h.status}</span>
      <span class="tabular" style="color:var(--text-muted);">${formatDateTime(h.timestamp)}${idx === 0 ? ' · atual' : ''}</span>
    `;
    histList.appendChild(row);
  });
  statusCard.appendChild(histList);

  // Card de Preview das Notas
  const notesPreviewCard = document.createElement('div');
  notesPreviewCard.className = 'card';
  const npHeader = document.createElement('div');
  npHeader.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;';
  npHeader.innerHTML = `<h3 style="font-size:var(--text-base);">Notas do Projeto</h3>`;

  const editNoteBtn = document.createElement('button');
  editNoteBtn.className = 'btn btn-ghost btn-sm';
  editNoteBtn.textContent = 'Editar notas →';
  editNoteBtn.addEventListener('click', () => {
    _container?.querySelector('[data-tab-id="notes"]')?.click();
  });
  npHeader.appendChild(editNoteBtn);
  notesPreviewCard.appendChild(npHeader);

  const mdBox = document.createElement('div');
  mdBox.className = 'markdown-preview';
  mdBox.style.minHeight = '100px';
  mdBox.style.maxHeight = '220px';
  renderMarkdown(local.note?.content || '', mdBox);
  notesPreviewCard.appendChild(mdBox);

  rightCol.appendChild(statusCard);
  rightCol.appendChild(notesPreviewCard);

  grid.appendChild(leftCol);
  grid.appendChild(rightCol);
  return grid;
}

// ─────────────────────────────────────────────
// ABA 2: TAREFAS AVANÇADAS
// ─────────────────────────────────────────────
function _buildTasksTab(local) {
  const panel = document.createElement('div');
  panel.className = 'tasks-panel';

  // Formulário de criação de tarefa (Título + Prioridade + Prazo + Recorrência)
  const createCard = document.createElement('div');
  createCard.className = 'card';
  createCard.style.padding = 'var(--space-4)';

  const inputRow = document.createElement('div');
  inputRow.className = 'task-input-bar';
  inputRow.style.flexWrap = 'wrap';

  const taskInput = document.createElement('input');
  taskInput.type = 'text';
  taskInput.id = 'new-task-title-input';
  taskInput.className = 'input';
  taskInput.style.flex = '2 1 220px';
  taskInput.placeholder = 'Nova tarefa… (Enter para adicionar)';
  taskInput.setAttribute('aria-label', 'Título da nova tarefa');

  const prioSelect = document.createElement('select');
  prioSelect.className = 'select';
  prioSelect.style.flex = '0 1 130px';
  prioSelect.setAttribute('aria-label', 'Prioridade da nova tarefa');
  PRIORITY_LIST.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p;
    opt.textContent = `Prioridade: ${p}`;
    opt.selected = p === 'normal';
    prioSelect.appendChild(opt);
  });

  const dueInput = document.createElement('input');
  dueInput.type = 'date';
  dueInput.className = 'input';
  dueInput.style.flex = '0 1 155px';
  dueInput.setAttribute('aria-label', 'Prazo da tarefa');

  const recSelect = document.createElement('select');
  recSelect.className = 'select';
  recSelect.style.flex = '0 1 160px';
  recSelect.setAttribute('aria-label', 'Recorrência da tarefa');
  RECURRENCE_OPTIONS.forEach(({ value, label }) => {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    recSelect.appendChild(opt);
  });

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'btn btn-primary';
  addBtn.textContent = '+ Adicionar';

  function addTask() {
    const title = taskInput.value.trim();
    if (!title) return;
    dispatch({
      type: 'TASK_ADD',
      payload: {
        repoId: _repoId,
        title,
        priority: prioSelect.value,
        dueDate: dueInput.value || null,
        recurrence: recSelect.value || null
      }
    });
    taskInput.value = '';
    taskInput.focus();
  }

  taskInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); addTask(); }
  });
  addBtn.addEventListener('click', addTask);

  inputRow.appendChild(taskInput);
  inputRow.appendChild(prioSelect);
  inputRow.appendChild(dueInput);
  inputRow.appendChild(recSelect);
  inputRow.appendChild(addBtn);
  createCard.appendChild(inputRow);
  panel.appendChild(createCard);

  // Barra de Filtro (Todas / Abertas / Feitas) + Dica de Drag/Teclado
  const filterBar = document.createElement('div');
  filterBar.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;';

  const allTasks = local.tasks || [];
  const openCount = allTasks.filter(t => !t.completed).length;
  const doneCount = allTasks.filter(t => t.completed).length;

  const filterChips = document.createElement('div');
  filterChips.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;';

  const filters = [
    { id: 'all',  label: `Todas (${allTasks.length})` },
    { id: 'open', label: `Abertas (${openCount})` },
    { id: 'done', label: `Feitas (${doneCount})` }
  ];

  filters.forEach(f => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `btn btn-sm ${_taskFilter === f.id ? 'btn-primary' : 'btn-secondary'}`;
    btn.textContent = f.label;
    btn.addEventListener('click', () => {
      _taskFilter = f.id;
      _taskPage = 1;
      _renderActiveTabContent();
    });
    filterChips.appendChild(btn);
  });

  const hint = document.createElement('span');
  hint.style.cssText = 'font-size:var(--text-xs);color:var(--text-muted);';
  hint.textContent = 'Arraste pelo ícone ⠿ ou use os botões ▲▼ para reordenar';

  filterBar.appendChild(filterChips);
  filterBar.appendChild(hint);
  panel.appendChild(filterBar);

  // Lista filtrada
  let filteredTasks = allTasks;
  if (_taskFilter === 'open') filteredTasks = allTasks.filter(t => !t.completed);
  else if (_taskFilter === 'done') filteredTasks = allTasks.filter(t => t.completed);

  const listContainer = document.createElement('div');
  listContainer.id = 'tasks-list-container';

  if (filteredTasks.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'card';
    empty.style.cssText = 'color:var(--text-muted);font-size:var(--text-sm);text-align:center;padding:32px 16px;';
    empty.textContent = _taskFilter === 'all'
      ? 'Nenhuma tarefa ainda. Crie a primeira acima!'
      : 'Nenhuma tarefa corresponde a este filtro.';
    listContainer.appendChild(empty);
  } else {
    const { visibleItems, hasMore, remaining } = paginateItems(filteredTasks, _taskPage);
    const list = document.createElement('ul');
    list.className = 'tasks-list';
    list.setAttribute('aria-label', 'Lista de tarefas');

    visibleItems.forEach((task) => {
      const realIdx = allTasks.findIndex(t => t.id === task.id);
      const item = _buildTaskItem(task, realIdx, allTasks.length, _taskFilter === 'all');
      list.appendChild(item);
    });

    listContainer.appendChild(list);

    if (_taskFilter === 'all') {
      _cleanupTaskDrag = _enableTaskPointerSort(list);
    }

    if (hasMore) {
      const moreBtn = document.createElement('button');
      moreBtn.type = 'button';
      moreBtn.className = 'btn btn-secondary';
      moreBtn.style.cssText = 'margin:12px auto 0;display:flex;';
      moreBtn.textContent = `Carregar mais (${remaining} restantes)`;
      moreBtn.addEventListener('click', () => {
        _taskPage++;
        _renderActiveTabContent();
      });
      listContainer.appendChild(moreBtn);
    }
  }

  panel.appendChild(listContainer);
  return panel;
}

function _buildTaskItem(task, idx, total, allowDrag = true) {
  const item = document.createElement('li');
  item.className = `task-item-wrapper${task.completed ? ' is-completed' : ''}`;
  item.setAttribute('data-task-id', task.id);
  item.setAttribute('data-task-index', String(idx));

  const mainRow = document.createElement('div');
  mainRow.className = 'task-item';

  // Alça de Drag-and-Drop (Pointer Events)
  if (allowDrag) {
    const handle = document.createElement('button');
    handle.type = 'button';
    handle.className = 'task-drag-handle';
    handle.setAttribute('aria-label', 'Arrastar para reordenar tarefa');
    handle.title = 'Arrastar para reordenar';
    handle.textContent = '⠿';
    mainRow.appendChild(handle);
  }

  // Checkbox principal
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'task-checkbox';
  checkbox.checked = task.completed;
  checkbox.setAttribute('aria-label', `Marcar "${task.title}" como ${task.completed ? 'pendente' : 'concluída'}`);
  checkbox.addEventListener('change', () => {
    const wasCompleted = task.completed;
    dispatch({ type: 'TASK_TOGGLE', payload: { repoId: _repoId, taskId: task.id } });
    if (!wasCompleted) {
      burstParticles(checkbox);
      if (task.recurrence) {
        showToast('Tarefa concluída! Próxima ocorrência recorrente agendada.', { type: 'success', duration: 3500 });
      }
    }
  });

  // Título e metadados (prioridade, prazo local, recorrência, subtarefas)
  const titleWrap = document.createElement('div');
  titleWrap.className = 'task-title-wrap';

  const titleEl = document.createElement('span');
  titleEl.className = 'task-title';
  titleEl.textContent = task.title;
  titleEl.title = 'Duplo clique para editar título';
  titleEl.addEventListener('dblclick', () => _startInlineEdit(titleEl, task));

  const metaEl = document.createElement('div');
  metaEl.className = 'task-meta';

  const priorityPill = document.createElement('span');
  priorityPill.className = `task-priority-pill priority-${task.priority}`;
  priorityPill.textContent = task.priority;
  metaEl.appendChild(priorityPill);

  if (task.dueDate) {
    const overdue = isTaskOverdue(task);
    const dueSoon = isTaskDueSoon(task, 3);
    const dueSpan = document.createElement('span');
    dueSpan.className = `task-due-badge${overdue ? ' is-overdue' : dueSoon ? ' is-due-soon' : ''}`;
    dueSpan.textContent = `${overdue ? '⚠️ Vencida: ' : '📅 '}${formatLocalDueDate(task.dueDate)}`;
    metaEl.appendChild(dueSpan);
  }

  if (task.recurrence) {
    const recSpan = document.createElement('span');
    recSpan.className = 'task-recurrence-badge';
    recSpan.textContent = `↻ ${RECURRENCE_LABELS[task.recurrence] || task.recurrence}`;
    metaEl.appendChild(recSpan);
  }

  const subtasks = Array.isArray(task.subtasks) ? task.subtasks : [];
  const subDone = subtasks.filter(s => s.completed).length;

  const subToggleBtn = document.createElement('button');
  subToggleBtn.type = 'button';
  subToggleBtn.className = 'task-subtasks-toggle';
  subToggleBtn.textContent = subtasks.length > 0
    ? `☑️ ${subDone}/${subtasks.length} subtarefas`
    : '+ Subtarefas';
  subToggleBtn.addEventListener('click', () => {
    if (_expandedSubtasks.has(task.id)) _expandedSubtasks.delete(task.id);
    else _expandedSubtasks.add(task.id);
    _renderActiveTabContent();
  });
  metaEl.appendChild(subToggleBtn);

  titleWrap.appendChild(titleEl);
  titleWrap.appendChild(metaEl);

  // Botões de ação (Subir, Descer, Editar, Excluir)
  const actions = document.createElement('div');
  actions.className = 'task-actions';

  const upBtn = document.createElement('button');
  upBtn.type = 'button';
  upBtn.className = 'btn btn-ghost btn-icon btn-sm';
  upBtn.setAttribute('aria-label', 'Mover tarefa para cima');
  upBtn.disabled = idx <= 0;
  upBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>`;
  upBtn.addEventListener('click', () => dispatch({ type: 'TASK_REORDER', payload: { repoId: _repoId, taskId: task.id, direction: 'up' } }));

  const downBtn = document.createElement('button');
  downBtn.type = 'button';
  downBtn.className = 'btn btn-ghost btn-icon btn-sm';
  downBtn.setAttribute('aria-label', 'Mover tarefa para baixo');
  downBtn.disabled = idx >= total - 1;
  downBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`;
  downBtn.addEventListener('click', () => dispatch({ type: 'TASK_REORDER', payload: { repoId: _repoId, taskId: task.id, direction: 'down' } }));

  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'btn btn-ghost btn-icon btn-sm';
  editBtn.setAttribute('aria-label', 'Editar tarefa');
  editBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
  editBtn.addEventListener('click', () => _openTaskEditModal(task));

  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'btn btn-ghost btn-icon btn-sm';
  deleteBtn.setAttribute('aria-label', 'Excluir tarefa');
  deleteBtn.style.color = 'var(--color-danger)';
  deleteBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`;
  deleteBtn.addEventListener('click', () => _handleDeleteTask(task));

  actions.appendChild(upBtn);
  actions.appendChild(downBtn);
  actions.appendChild(editBtn);
  actions.appendChild(deleteBtn);

  mainRow.appendChild(checkbox);
  mainRow.appendChild(titleWrap);
  mainRow.appendChild(actions);
  item.appendChild(mainRow);

  // Painel de Subtarefas (quando expandido ou quando possui subtarefas abertas)
  if (_expandedSubtasks.has(task.id) || subtasks.length > 0) {
    const subPanel = _buildSubtasksPanel(task, subtasks);
    item.appendChild(subPanel);
  }

  return item;
}

function _buildSubtasksPanel(task, subtasks) {
  const wrap = document.createElement('div');
  wrap.className = 'subtasks-panel';

  if (subtasks.length > 0) {
    const list = document.createElement('ul');
    list.className = 'subtasks-list';

    for (const sub of subtasks) {
      const li = document.createElement('li');
      li.className = `subtask-item${sub.completed ? ' is-completed' : ''}`;

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = sub.completed;
      cb.setAttribute('aria-label', `Subtarefa ${sub.title}`);
      cb.addEventListener('change', () => {
        dispatch({
          type: 'SUBTASK_TOGGLE',
          payload: { repoId: _repoId, taskId: task.id, subtaskId: sub.id }
        });
      });

      const span = document.createElement('span');
      span.className = 'subtask-title';
      span.textContent = sub.title;

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'btn btn-ghost btn-icon btn-sm';
      delBtn.style.cssText = 'width:26px;height:26px;min-height:26px;color:var(--text-muted);';
      delBtn.setAttribute('aria-label', `Excluir subtarefa ${sub.title}`);
      delBtn.textContent = '×';
      delBtn.addEventListener('click', () => {
        dispatch({
          type: 'SUBTASK_DELETE',
          payload: { repoId: _repoId, taskId: task.id, subtaskId: sub.id }
        });
      });

      li.appendChild(cb);
      li.appendChild(span);
      li.appendChild(delBtn);
      list.appendChild(li);
    }
    wrap.appendChild(list);
  }

  if (_expandedSubtasks.has(task.id)) {
    const addRow = document.createElement('div');
    addRow.style.cssText = 'display:flex;gap:6px;margin-top:6px;';

    const subInput = document.createElement('input');
    subInput.type = 'text';
    subInput.className = 'input';
    subInput.style.minHeight = '34px';
    subInput.style.fontSize = 'var(--text-xs)';
    subInput.placeholder = 'Adicionar subtarefa… (Enter)';

    const subAddBtn = document.createElement('button');
    subAddBtn.type = 'button';
    subAddBtn.className = 'btn btn-secondary btn-sm';
    subAddBtn.textContent = '+ Subtarefa';

    function addSub() {
      const val = subInput.value.trim();
      if (!val) return;
      dispatch({
        type: 'SUBTASK_ADD',
        payload: { repoId: _repoId, taskId: task.id, title: val }
      });
      subInput.value = '';
    }

    subInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); addSub(); }
    });
    subAddBtn.addEventListener('click', addSub);

    addRow.appendChild(subInput);
    addRow.appendChild(subAddBtn);
    wrap.appendChild(addRow);
  }

  return wrap;
}

/**
 * Exclui tarefa — se possuir subtarefas, exige confirmação de exclusão do grupo
 */
function _handleDeleteTask(task) {
  const subCount = Array.isArray(task.subtasks) ? task.subtasks.length : 0;

  function executeDelete() {
    dispatch({ type: 'TASK_DELETE', payload: { repoId: _repoId, taskId: task.id } });
    showToast('Tarefa excluída', {
      type: 'default',
      duration: 5000,
      action: {
        label: 'Desfazer',
        fn: () => { if (canUndo()) undo(); }
      }
    });
  }

  if (subCount > 0) {
    openModal({
      title: 'Excluir grupo de tarefas?',
      body: `A tarefa "${task.title}" possui ${subCount} subtarefa(s). Deseja excluir a tarefa principal e todas as suas subtarefas?`,
      confirmLabel: 'Excluir grupo',
      cancelLabel: 'Cancelar',
      confirmVariant: 'danger',
      onConfirm: executeDelete
    });
  } else {
    executeDelete();
  }
}

// ─────────────────────────────────────────────
// DRAG-AND-DROP DE TAREFAS COM POINTER EVENTS
// (Cancela em pointercancel/Escape; persiste só no drop válido)
// ─────────────────────────────────────────────
function _enableTaskPointerSort(listEl) {
  let draggingEl = null;
  let fromIndex = -1;
  let targetIndex = -1;

  function onPointerDown(e) {
    const handle = e.target.closest('.task-drag-handle');
    if (!handle) return;

    const item = handle.closest('.task-item-wrapper');
    if (!item) return;

    e.preventDefault();
    draggingEl = item;
    fromIndex = parseInt(item.getAttribute('data-task-index'), 10);
    targetIndex = fromIndex;

    draggingEl.classList.add('is-dragging');
    handle.setPointerCapture?.(e.pointerId);

    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointercancel', onCancel);
    document.addEventListener('keydown', onKeyDown);
  }

  function onPointerMove(e) {
    if (!draggingEl) return;
    const elemBelow = document.elementFromPoint(e.clientX, e.clientY);
    const overItem = elemBelow?.closest?.('.task-item-wrapper');

    listEl.querySelectorAll('.task-item-wrapper').forEach(el => el.classList.remove('drag-over'));
    if (overItem && overItem !== draggingEl && listEl.contains(overItem)) {
      overItem.classList.add('drag-over');
      targetIndex = parseInt(overItem.getAttribute('data-task-index'), 10);
    }
  }

  function cleanup() {
    if (draggingEl) draggingEl.classList.remove('is-dragging');
    listEl.querySelectorAll('.task-item-wrapper').forEach(el => el.classList.remove('drag-over'));
    draggingEl = null;
    fromIndex = -1;
    targetIndex = -1;
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
    document.removeEventListener('pointercancel', onCancel);
    document.removeEventListener('keydown', onKeyDown);
  }

  function onPointerUp() {
    if (!draggingEl) return;
    const f = fromIndex;
    const t = targetIndex;
    cleanup();
    if (f !== -1 && t !== -1 && f !== t) {
      dispatch({ type: 'TASK_MOVE_INDEX', payload: { repoId: _repoId, fromIndex: f, toIndex: t } });
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

  listEl.addEventListener('pointerdown', onPointerDown);
  return () => {
    cleanup();
    listEl.removeEventListener('pointerdown', onPointerDown);
  };
}

function _startInlineEdit(titleEl, task) {
  const currentTitle = task.title;
  const input = document.createElement('input');
  input.type = 'text';
  input.value = currentTitle;
  input.style.cssText = 'width:100%;background:var(--bg-input);border:1px solid var(--accent-primary);border-radius:var(--radius-xs);padding:2px 6px;color:var(--text-main);font-size:var(--text-sm);outline:none;';

  titleEl.replaceWith(input);
  input.focus();
  input.select();

  let finished = false;
  function commit() {
    if (finished) return;
    finished = true;
    const newTitle = input.value.trim();
    if (newTitle && newTitle !== currentTitle) {
      dispatch({ type: 'TASK_UPDATE', payload: { repoId: _repoId, taskId: task.id, changes: { title: newTitle } } });
    } else if (input.parentNode) {
      input.replaceWith(titleEl);
    }
  }

  input.addEventListener('blur', commit);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    if (e.key === 'Escape') {
      e.preventDefault();
      finished = true;
      if (input.parentNode) input.replaceWith(titleEl);
    }
  });
}

function _openTaskEditModal(task) {
  const body = document.createElement('div');
  body.style.cssText = 'display:flex;flex-direction:column;gap:14px;';

  const titleGroup = document.createElement('div');
  titleGroup.className = 'input-group';
  titleGroup.style.marginBottom = '0';
  titleGroup.innerHTML = '<label class="input-label">Título</label>';
  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.className = 'input';
  titleInput.value = task.title;
  titleGroup.appendChild(titleInput);

  const priorityGroup = document.createElement('div');
  priorityGroup.className = 'input-group';
  priorityGroup.style.marginBottom = '0';
  priorityGroup.innerHTML = '<label class="input-label">Prioridade</label>';
  const prioritySelect = document.createElement('select');
  prioritySelect.className = 'select';
  PRIORITY_LIST.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p;
    opt.textContent = p.charAt(0).toUpperCase() + p.slice(1);
    opt.selected = p === task.priority;
    prioritySelect.appendChild(opt);
  });
  priorityGroup.appendChild(prioritySelect);

  const dueDateGroup = document.createElement('div');
  dueDateGroup.className = 'input-group';
  dueDateGroup.style.marginBottom = '0';
  dueDateGroup.innerHTML = '<label class="input-label">Prazo (fuso local)</label>';
  const dueDateInput = document.createElement('input');
  dueDateInput.type = 'date';
  dueDateInput.className = 'input';
  dueDateInput.value = task.dueDate || '';
  dueDateGroup.appendChild(dueDateInput);

  const recGroup = document.createElement('div');
  recGroup.className = 'input-group';
  recGroup.style.marginBottom = '0';
  recGroup.innerHTML = '<label class="input-label">Recorrência</label>';
  const recSelect = document.createElement('select');
  recSelect.className = 'select';
  RECURRENCE_OPTIONS.forEach(({ value, label }) => {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    opt.selected = (task.recurrence || '') === value;
    recSelect.appendChild(opt);
  });
  recGroup.appendChild(recSelect);

  body.appendChild(titleGroup);
  body.appendChild(priorityGroup);
  body.appendChild(dueDateGroup);
  body.appendChild(recGroup);

  openModal({
    title: 'Editar Tarefa',
    body,
    confirmLabel: 'Salvar',
    cancelLabel: 'Cancelar',
    onConfirm: () => {
      const changes = {
        title: titleInput.value.trim() || task.title,
        priority: prioritySelect.value,
        dueDate: dueDateInput.value || null,
        recurrence: recSelect.value || null
      };
      dispatch({ type: 'TASK_UPDATE', payload: { repoId: _repoId, taskId: task.id, changes } });
      showToast('Tarefa atualizada', { type: 'success', duration: 2500 });
    }
  });
}

// ─────────────────────────────────────────────
// ABA 3: ATIVIDADE (Commits, PRs e Issues com erro isolado)
// ─────────────────────────────────────────────
function _buildActivityTab(repoData) {
  const wrap = document.createElement('div');
  wrap.className = 'activity-grid';

  if (!repoData?.fullName) {
    const unav = document.createElement('div');
    unav.className = 'card';
    unav.style.gridColumn = '1 / -1';
    unav.innerHTML = `
      <h3 style="font-size:var(--text-base);margin-bottom:6px;">Atividade Remota Indisponível</h3>
      <p style="font-size:var(--text-sm);color:var(--text-muted);">Este projeto não está vinculado a um repositório público ativo no GitHub.</p>
    `;
    wrap.appendChild(unav);
    return wrap;
  }

  // Widget 1: Commits
  wrap.appendChild(_buildActivityWidget({
    title: 'Commits Recentes',
    stateObj: _remoteActivity.commits,
    onRetry: () => _loadCommitsWidget(repoData.fullName, true),
    renderItem: (c) => {
      const div = document.createElement('div');
      div.className = 'commit-item';
      div.innerHTML = `
        <span class="commit-sha">${(c.sha || '').slice(0, 7)}</span>
        <span class="commit-msg">${_escape(c.commit?.message?.split('\n')[0] || 'Sem mensagem')}</span>
        <span class="commit-date">${formatRelativeTime(c.commit?.author?.date)}</span>
      `;
      return div;
    },
    emptyText: 'Nenhum commit encontrado neste repositório.'
  }));

  // Widget 2: Pull Requests Abertos
  wrap.appendChild(_buildActivityWidget({
    title: 'Pull Requests Abertos',
    stateObj: _remoteActivity.pulls,
    onRetry: () => _loadPullsWidget(repoData.fullName, true),
    renderItem: (pr) => {
      const a = document.createElement('a');
      a.className = 'commit-item';
      a.href = pr.html_url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.style.textDecoration = 'none';
      a.innerHTML = `
        <span class="commit-sha" style="color:#10b981;background:rgba(16,185,129,0.12);">#${pr.number}</span>
        <span class="commit-msg">${_escape(pr.title)}</span>
        <span class="commit-date">${formatRelativeTime(pr.created_at)}</span>
      `;
      return a;
    },
    emptyText: 'Nenhum Pull Request aberto.'
  }));

  // Widget 3: Issues Abertas
  wrap.appendChild(_buildActivityWidget({
    title: 'Issues Abertas',
    stateObj: _remoteActivity.issues,
    onRetry: () => _loadIssuesWidget(repoData.fullName, true),
    renderItem: (issue) => {
      const a = document.createElement('a');
      a.className = 'commit-item';
      a.href = issue.html_url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.style.textDecoration = 'none';
      a.innerHTML = `
        <span class="commit-sha" style="color:#f59e0b;background:rgba(245,158,11,0.12);">#${issue.number}</span>
        <span class="commit-msg">${_escape(issue.title)}</span>
        <span class="commit-date">${formatRelativeTime(issue.created_at)}</span>
      `;
      return a;
    },
    emptyText: 'Nenhuma issue aberta.'
  }));

  return wrap;
}

function _buildActivityWidget({ title, stateObj, onRetry, renderItem, emptyText }) {
  const card = document.createElement('div');
  card.className = 'card activity-widget';

  const header = document.createElement('div');
  header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;';

  const h3 = document.createElement('h3');
  h3.style.fontSize = 'var(--text-base)';
  h3.textContent = title;

  const refreshBtn = document.createElement('button');
  refreshBtn.type = 'button';
  refreshBtn.className = 'btn btn-ghost btn-sm';
  refreshBtn.textContent = '↻';
  refreshBtn.title = 'Atualizar widget';
  refreshBtn.addEventListener('click', onRetry);

  header.appendChild(h3);
  header.appendChild(refreshBtn);
  card.appendChild(header);

  if (stateObj.loading) {
    const skel = document.createElement('div');
    skel.style.cssText = 'display:flex;flex-direction:column;gap:8px;';
    skel.innerHTML = `
      <div class="skeleton" style="height:28px;width:100%;"></div>
      <div class="skeleton" style="height:28px;width:85%;"></div>
      <div class="skeleton" style="height:28px;width:70%;"></div>
    `;
    card.appendChild(skel);
    return card;
  }

  if (stateObj.error) {
    const errBox = document.createElement('div');
    errBox.style.cssText = 'padding:12px;border-radius:var(--radius-sm);background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.25);font-size:var(--text-xs);color:var(--color-warning);display:flex;flex-direction:column;gap:8px;';
    errBox.innerHTML = `
      <div><strong>Estado: Indisponível</strong></div>
      <div>${_escape(stateObj.error)}</div>
    `;
    const retryBtn = document.createElement('button');
    retryBtn.type = 'button';
    retryBtn.className = 'btn btn-secondary btn-sm';
    retryBtn.style.width = 'fit-content';
    retryBtn.textContent = 'Tentar novamente';
    retryBtn.addEventListener('click', onRetry);
    errBox.appendChild(retryBtn);
    card.appendChild(errBox);
    return card;
  }

  const items = stateObj.data || [];
  if (items.length === 0) {
    const empty = document.createElement('p');
    empty.style.cssText = 'font-size:var(--text-sm);color:var(--text-muted);padding:12px 0;';
    empty.textContent = emptyText;
    card.appendChild(empty);
    return card;
  }

  const list = document.createElement('div');
  list.style.cssText = 'display:flex;flex-direction:column;gap:8px;';
  items.forEach(item => list.appendChild(renderItem(item)));
  card.appendChild(list);
  return card;
}

async function _loadAllRemoteActivity() {
  let state = getState();
  let repoData = _getGitHubRepoData(state);

  if (!repoData && (!state.githubCache?.repos || state.githubCache.repos.length === 0)) {
    const reposResult = await fetchUserRepos(state.githubCache, false, _abortController?.signal);
    if (_abortController?.signal.aborted) return;
    if (reposResult.data) {
      dispatch({
        type: 'GITHUB_CACHE_UPDATE',
        payload: { repos: reposResult.data, fetchedAt: reposResult.fetchedAt, rateLimit: reposResult.rateLimit }
      });
      dispatch({ type: 'PROJECTS_SYNC_GITHUB', payload: { repos: reposResult.data } });
      state = getState();
      repoData = _getGitHubRepoData(state);
      if (repoData) _render();
    }
  }

  if (!repoData?.fullName) {
    _remoteActivity.commits = { loading: false, data: null, error: 'Indisponível (repositório local ou ausente).' };
    _remoteActivity.pulls   = { loading: false, data: null, error: 'Indisponível (repositório local ou ausente).' };
    _remoteActivity.issues  = { loading: false, data: null, error: 'Indisponível (repositório local ou ausente).' };
    if (_activeTab === 'activity' || _activeTab === 'timeline') _renderActiveTabContent();
    return;
  }

  await Promise.allSettled([
    _loadCommitsWidget(repoData.fullName, false),
    _loadPullsWidget(repoData.fullName, false),
    _loadIssuesWidget(repoData.fullName, false)
  ]);
}

async function _loadCommitsWidget(fullName, force = false) {
  _remoteActivity.commits.loading = true;
  if (_activeTab === 'activity') _renderActiveTabContent();

  const res = await fetchRepoCommits(fullName, _abortController?.signal, force);
  if (_abortController?.signal.aborted) return;

  _remoteActivity.commits = { loading: false, data: res.data, error: res.error };
  if (_activeTab === 'activity' || _activeTab === 'timeline') _renderActiveTabContent();
}

async function _loadPullsWidget(fullName, force = false) {
  _remoteActivity.pulls.loading = true;
  if (_activeTab === 'activity') _renderActiveTabContent();

  const res = await fetchRepoPulls(fullName, _abortController?.signal, force);
  if (_abortController?.signal.aborted) return;

  _remoteActivity.pulls = { loading: false, data: res.data, error: res.error };
  if (_activeTab === 'activity' || _activeTab === 'timeline') _renderActiveTabContent();
}

async function _loadIssuesWidget(fullName, force = false) {
  _remoteActivity.issues.loading = true;
  if (_activeTab === 'activity') _renderActiveTabContent();

  const res = await fetchRepoIssues(fullName, _abortController?.signal, force);
  if (_abortController?.signal.aborted) return;

  _remoteActivity.issues = { loading: false, data: res.data, error: res.error };
  if (_activeTab === 'activity' || _activeTab === 'timeline') _renderActiveTabContent();
}

// ─────────────────────────────────────────────
// ABA 4: NOTAS (MARKDOWN SEGURO)
// ─────────────────────────────────────────────
function _buildNotesTab(local) {
  const panel = document.createElement('div');
  panel.className = 'notes-panel card';

  const header = document.createElement('div');
  header.className = 'notes-header';

  const title = document.createElement('h2');
  title.style.fontSize = 'var(--text-md)';
  title.style.fontWeight = '700';
  title.textContent = 'Notas em Markdown';

  const statusIndicator = document.createElement('span');
  statusIndicator.id = 'notes-save-status';
  statusIndicator.className = 'notes-status-indicator';
  statusIndicator.textContent = '✓ Salvo';

  header.appendChild(title);
  header.appendChild(statusIndicator);

  const tabs = document.createElement('div');
  tabs.className = 'notes-editor-tabs';

  const editTab = document.createElement('button');
  editTab.type = 'button';
  editTab.className = 'notes-tab-btn is-active';
  editTab.textContent = 'Editar';
  editTab.setAttribute('aria-pressed', 'true');

  const previewTab = document.createElement('button');
  previewTab.type = 'button';
  previewTab.className = 'notes-tab-btn';
  previewTab.textContent = 'Preview Seguro';
  previewTab.setAttribute('aria-pressed', 'false');

  const textarea = document.createElement('textarea');
  textarea.className = 'textarea';
  textarea.id = 'notes-textarea';
  textarea.style.minHeight = '320px';
  textarea.setAttribute('aria-label', 'Editor de notas em Markdown');
  textarea.placeholder = '# Notas do projeto\n\nEscreva em Markdown…\n\n- **negrito**, *itálico*, `código`\n- [link](https://exemplo.com)';
  textarea.value = local?.note?.content || '';

  const previewEl = document.createElement('div');
  previewEl.className = 'markdown-preview';
  previewEl.id = 'notes-preview';
  previewEl.style.display = 'none';
  previewEl.style.minHeight = '320px';

  editTab.addEventListener('click', () => {
    editTab.classList.add('is-active');
    editTab.setAttribute('aria-pressed', 'true');
    previewTab.classList.remove('is-active');
    previewTab.setAttribute('aria-pressed', 'false');
    textarea.style.display = 'block';
    previewEl.style.display = 'none';
    textarea.focus();
  });

  previewTab.addEventListener('click', () => {
    previewTab.classList.add('is-active');
    previewTab.setAttribute('aria-pressed', 'true');
    editTab.classList.remove('is-active');
    editTab.setAttribute('aria-pressed', 'false');
    textarea.style.display = 'none';
    previewEl.style.display = 'block';
    renderMarkdown(textarea.value, previewEl);
  });

  textarea.addEventListener('input', () => {
    const el = document.getElementById('notes-save-status');
    if (el) el.textContent = '💾 Salvando…';
    if (_noteDebounceTimer) clearTimeout(_noteDebounceTimer);
    _noteDebounceTimer = setTimeout(() => {
      try {
        dispatch({ type: 'NOTE_UPDATE', payload: { repoId: _repoId, content: textarea.value } });
        const ind = document.getElementById('notes-save-status');
        if (ind) ind.textContent = '✓ Salvo';
      } catch {
        const ind = document.getElementById('notes-save-status');
        if (ind) ind.textContent = '✕ Erro ao salvar';
      }
    }, 600);
  });

  tabs.appendChild(editTab);
  tabs.appendChild(previewTab);

  panel.appendChild(header);
  panel.appendChild(tabs);
  panel.appendChild(textarea);
  panel.appendChild(previewEl);

  return panel;
}

// ─────────────────────────────────────────────
// ABA 5: TIMELINE (Eventos Remotos + Marcos Pessoais com Origem Identificada)
// ─────────────────────────────────────────────
function _buildTimelineTab(local, repoData) {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;flex-direction:column;gap:16px;';

  // Formulário para adicionar marco pessoal
  const addCard = document.createElement('div');
  addCard.className = 'card';
  addCard.style.padding = 'var(--space-4)';

  const formRow = document.createElement('div');
  formRow.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;align-items:center;';

  const mInput = document.createElement('input');
  mInput.type = 'text';
  mInput.className = 'input';
  mInput.style.flex = '1 1 240px';
  mInput.placeholder = 'Registrar novo marco pessoal na timeline… (ex.: Deploy v1.0)';
  mInput.setAttribute('aria-label', 'Título do marco pessoal');

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'btn btn-primary';
  addBtn.textContent = '+ Registrar Marco';

  function addMilestone() {
    const val = mInput.value.trim();
    if (!val) return;
    dispatch({ type: 'MILESTONE_ADD', payload: { repoId: _repoId, title: val } });
    mInput.value = '';
    showToast('Marco pessoal registrado na Timeline!', { type: 'success', duration: 2500 });
  }

  mInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); addMilestone(); }
  });
  addBtn.addEventListener('click', addMilestone);

  formRow.appendChild(mInput);
  formRow.appendChild(addBtn);
  addCard.appendChild(formRow);
  wrap.appendChild(addCard);

  // Coleta eventos de ambas as origens
  const events = [];

  // 1. Marcos Pessoais Manuais (Origem: Pessoal · Local)
  for (const m of (local.milestones || [])) {
    events.push({
      origin: 'local',
      originLabel: 'Pessoal · Marco',
      icon: '🏁',
      title: m.title,
      timestamp: m.timestamp,
      milestoneId: m.id
    });
  }

  // 2. Histórico de Status (Origem: Pessoal · Local)
  for (const sh of (local.statusHistory || [])) {
    events.push({
      origin: 'local',
      originLabel: 'Pessoal · Status',
      icon: '🔄',
      title: `Status definido como "${sh.status}"`,
      timestamp: sh.timestamp
    });
  }

  // 3. Tarefas concluídas (Origem: Pessoal · Local)
  for (const t of (local.tasks || [])) {
    if (t.completed && t.completedAt) {
      events.push({
        origin: 'local',
        originLabel: 'Pessoal · Tarefa',
        icon: '✅',
        title: `Tarefa concluída: "${t.title}"`,
        timestamp: t.completedAt
      });
    }
  }

  // 4. Eventos Remotos do GitHub (Origem: Remoto · GitHub)
  if (repoData?.createdAt) {
    events.push({
      origin: 'remote',
      originLabel: 'Remoto · GitHub',
      icon: '🌟',
      title: `Repositório "${repoData.name}" criado no GitHub`,
      timestamp: repoData.createdAt
    });
  }

  if (Array.isArray(_remoteActivity.commits.data)) {
    for (const c of _remoteActivity.commits.data) {
      const date = c.commit?.author?.date;
      if (date) {
        events.push({
          origin: 'remote',
          originLabel: 'Remoto · Commit GitHub',
          icon: '🔨',
          title: `${(c.sha || '').slice(0, 7)} — ${c.commit?.message?.split('\n')[0] || 'Commit'}`,
          timestamp: date
        });
      }
    }
  }

  if (Array.isArray(_remoteActivity.pulls.data)) {
    for (const pr of _remoteActivity.pulls.data) {
      events.push({
        origin: 'remote',
        originLabel: 'Remoto · PR GitHub',
        icon: '🔀',
        title: `PR #${pr.number} aberto: ${pr.title}`,
        timestamp: pr.created_at
      });
    }
  }

  if (Array.isArray(_remoteActivity.issues.data)) {
    for (const iss of _remoteActivity.issues.data) {
      events.push({
        origin: 'remote',
        originLabel: 'Remoto · Issue GitHub',
        icon: '🐞',
        title: `Issue #${iss.number} aberta: ${iss.title}`,
        timestamp: iss.created_at
      });
    }
  }

  // Ordena cronologicamente (mais recente primeiro)
  events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const timelineList = document.createElement('div');
  timelineList.className = 'timeline-list';

  if (events.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'card';
    empty.textContent = 'Nenhum evento registrado na timeline.';
    timelineList.appendChild(empty);
  } else {
    for (const ev of events) {
      const item = document.createElement('div');
      item.className = `timeline-item origin-${ev.origin}`;

      const badgeClass = ev.origin === 'remote' ? 'timeline-origin-remote' : 'timeline-origin-local';

      item.innerHTML = `
        <div class="timeline-icon" aria-hidden="true">${ev.icon}</div>
        <div class="timeline-body">
          <div class="timeline-header">
            <span class="timeline-origin-badge ${badgeClass}">${ev.originLabel}</span>
            <time class="timeline-time tabular">${formatDateTime(ev.timestamp)}</time>
          </div>
          <div class="timeline-title">${_escape(ev.title)}</div>
        </div>
      `;

      if (ev.milestoneId) {
        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'btn btn-ghost btn-icon btn-sm';
        delBtn.setAttribute('aria-label', 'Excluir marco pessoal');
        delBtn.textContent = '×';
        delBtn.addEventListener('click', () => {
          dispatch({ type: 'MILESTONE_DELETE', payload: { repoId: _repoId, milestoneId: ev.milestoneId } });
          showToast('Marco removido', {
            type: 'default',
            action: { label: 'Desfazer', fn: () => { if (canUndo()) undo(); } }
          });
        });
        item.appendChild(delBtn);
      }

      timelineList.appendChild(item);
    }
  }

  wrap.appendChild(timelineList);
  return wrap;
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
function _getGitHubRepoData(state) {
  const repos = state.githubCache?.repos || [];
  const found = repos.find(r => String(r.id) === _repoId);
  if (!found) return null;
  return {
    name: found.name,
    description: found.description,
    language: found.language,
    stars: found.stargazers_count,
    forks: found.forks_count,
    pushedAt: found.pushed_at,
    createdAt: found.created_at,
    htmlUrl: found.html_url,
    homepage: found.homepage,
    fullName: found.full_name
  };
}

function _escape(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
