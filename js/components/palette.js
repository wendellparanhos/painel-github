/**
 * Command Palette (Ctrl/Cmd + K e botão visível no header mobile/desktop) — Fase 2
 *
 * Funcionalidades:
 *   - Busca difusa (fuzzy match) em projetos, tarefas de projetos e notas
 *   - Ações rápidas:
 *       • Nova tarefa (abre modal de criação rápida)
 *       • Capturar na Inbox
 *       • Mudar status de projeto
 *       • Trocar tema (Escuro, Claro, Sistema)
 *       • Trocar cor de destaque (6 paletas)
 *       • Exportar backup JSON
 *       • Sincronizar GitHub (atualizar cache/dados remotos da API GitHub)
 *   - Navegação completa por teclado (ArrowUp, ArrowDown, Enter, Escape)
 *   - Focus trap e restauração estrita de foco ao elemento de origem ao fechar
 */

import { getState, dispatch } from '../store/store.js';
import { exportJSON, triggerDownload } from '../store/storage.js';
import { fetchUserRepos } from '../services/github.js';
import { getMergedProjects, STATUS_ORDER } from '../utils/domain.js';
import { trapFocus } from '../utils/dom.js';
import { openModal } from './modal.js';
import { showToast } from './toast.js';
import { openQuickInboxCaptureModal } from '../views/inbox.js';
import { updateRateLimitIndicator } from './nav.js';
import { navigate } from '../router.js';

let _backdrop = null;
let _releaseFocus = null;
let _originFocus = null;
let _selectedIndex = 0;
let _currentResults = [];

export function isPaletteOpen() {
  return Boolean(_backdrop);
}

/**
 * Busca difusa simples e rápida (subsequência ou substring ponderada)
 */
function fuzzyScore(query, target) {
  if (!query) return 1;
  if (!target) return 0;
  const q = query.toLowerCase().trim();
  const t = target.toLowerCase();

  if (t === q) return 100;
  if (t.startsWith(q)) return 85;
  const idx = t.indexOf(q);
  if (idx !== -1) return 70 - Math.min(idx, 20);

  // Subsequence match
  let qi = 0;
  let consecutive = 0;
  let score = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      qi++;
      consecutive++;
      score += 5 + consecutive * 2;
    } else {
      consecutive = 0;
    }
  }
  return qi === q.length ? score : 0;
}

export function openCommandPalette() {
  if (_backdrop) {
    closeCommandPalette();
    return;
  }

  _originFocus = document.activeElement;
  _selectedIndex = 0;

  _backdrop = document.createElement('div');
  _backdrop.className = 'palette-backdrop is-open';
  _backdrop.setAttribute('role', 'dialog');
  _backdrop.setAttribute('aria-modal', 'true');
  _backdrop.setAttribute('aria-label', 'Paleta de Comandos e Busca');

  const dialog = document.createElement('div');
  dialog.className = 'palette-dialog';

  const searchBar = document.createElement('div');
  searchBar.className = 'palette-search-bar';

  const searchIcon = document.createElement('span');
  searchIcon.className = 'palette-search-icon';
  searchIcon.setAttribute('aria-hidden', 'true');
  searchIcon.textContent = '⌘';

  const input = document.createElement('input');
  input.type = 'search';
  input.className = 'palette-input';
  input.placeholder = 'Buscar projetos, tarefas, notas ou executar ação…';
  input.setAttribute('aria-label', 'Digite um comando ou termo de busca');
  input.setAttribute('autocomplete', 'off');

  const escHint = document.createElement('button');
  escHint.type = 'button';
  escHint.className = 'palette-esc-btn';
  escHint.textContent = 'ESC';
  escHint.setAttribute('aria-label', 'Fechar paleta de comandos');
  escHint.addEventListener('click', closeCommandPalette);

  searchBar.appendChild(searchIcon);
  searchBar.appendChild(input);
  searchBar.appendChild(escHint);

  const listEl = document.createElement('div');
  listEl.className = 'palette-list';
  listEl.setAttribute('role', 'listbox');

  const footer = document.createElement('div');
  footer.className = 'palette-footer';
  footer.innerHTML = `
    <span><kbd>↑</kbd><kbd>↓</kbd> navegar</span>
    <span><kbd>Enter</kbd> executar</span>
    <span><kbd>Esc</kbd> fechar</span>
  `;

  dialog.appendChild(searchBar);
  dialog.appendChild(listEl);
  dialog.appendChild(footer);
  _backdrop.appendChild(dialog);
  document.body.appendChild(_backdrop);

  function renderResults() {
    const query = input.value.trim();
    _currentResults = _buildCatalogAndSearch(query);
    if (_selectedIndex >= _currentResults.length) _selectedIndex = 0;

    listEl.innerHTML = '';

    if (_currentResults.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'palette-empty';
      empty.textContent = 'Nenhum projeto, tarefa, nota ou comando encontrado.';
      listEl.appendChild(empty);
      return;
    }

    _currentResults.forEach((item, idx) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = `palette-item${idx === _selectedIndex ? ' is-selected' : ''}`;
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', idx === _selectedIndex ? 'true' : 'false');

      row.innerHTML = `
        <span class="palette-item-icon" aria-hidden="true">${item.icon}</span>
        <div class="palette-item-body">
          <div class="palette-item-title">${_escape(item.title)}</div>
          ${item.subtitle ? `<div class="palette-item-sub">${_escape(item.subtitle)}</div>` : ''}
        </div>
        <span class="palette-item-cat">${item.category}</span>
      `;

      row.addEventListener('mouseenter', () => {
        _selectedIndex = idx;
        _updateSelectionHighlight(listEl);
      });

      row.addEventListener('click', () => {
        const actionFn = item.run;
        closeCommandPalette();
        actionFn();
      });

      listEl.appendChild(row);
    });
  }

  input.addEventListener('input', () => {
    _selectedIndex = 0;
    renderResults();
  });

  dialog.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (_currentResults.length > 0) {
        _selectedIndex = (_selectedIndex + 1) % _currentResults.length;
        _updateSelectionHighlight(listEl);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (_currentResults.length > 0) {
        _selectedIndex = (_selectedIndex - 1 + _currentResults.length) % _currentResults.length;
        _updateSelectionHighlight(listEl);
      }
    } else if (e.key === 'Enter') {
      if (_currentResults[_selectedIndex]) {
        e.preventDefault();
        const fn = _currentResults[_selectedIndex].run;
        closeCommandPalette();
        fn();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeCommandPalette();
    }
  });

  _backdrop.addEventListener('click', (e) => {
    if (e.target === _backdrop) closeCommandPalette();
  });

  renderResults();
  _releaseFocus = trapFocus(dialog);
  input.focus();
}

function _updateSelectionHighlight(listEl) {
  const rows = listEl.querySelectorAll('.palette-item');
  rows.forEach((r, i) => {
    const sel = i === _selectedIndex;
    r.classList.toggle('is-selected', sel);
    r.setAttribute('aria-selected', sel ? 'true' : 'false');
    if (sel) r.scrollIntoView({ block: 'nearest' });
  });
}

export function closeCommandPalette() {
  if (!_backdrop) return;
  if (_releaseFocus) {
    _releaseFocus();
    _releaseFocus = null;
  }
  _backdrop.remove();
  _backdrop = null;

  if (_originFocus && typeof _originFocus.focus === 'function') {
    try { _originFocus.focus(); } catch { /* silencioso */ }
  }
  _originFocus = null;
}

// ─────────────────────────────────────────────
// CATÁLOGO DE AÇÕES + BUSCA DIFUSA EM PROJETOS, TAREFAS E NOTAS
// ─────────────────────────────────────────────
function _buildCatalogAndSearch(query) {
  const state = getState();
  const projects = getMergedProjects(state);
  const candidates = [];

  // 1. Ações do Sistema
  const actions = [
    {
      icon: '➕',
      title: 'Nova tarefa em um projeto…',
      subtitle: 'Criar tarefa rapidamente (Atalho: N)',
      category: 'Ação',
      run: () => openQuickTaskModal()
    },
    {
      icon: '📥',
      title: 'Capturar item na Inbox…',
      subtitle: 'Anotar ideia rápida (Atalho: C)',
      category: 'Ação',
      run: () => openQuickInboxCaptureModal()
    },
    {
      icon: '🔄',
      title: 'Sincronizar GitHub (atualizar cache da API)',
      subtitle: 'Busca dados remotos atualizados dos repositórios públicos',
      category: 'GitHub API',
      run: () => _syncGitHubRemoteCache()
    },
    {
      icon: '🏷️',
      title: 'Mudar status de um projeto…',
      subtitle: 'Alterar status e registrar no histórico',
      category: 'Ação',
      run: () => _openChangeProjectStatusModal()
    },
    {
      icon: '📋',
      title: 'Ir para o Quadro Kanban',
      subtitle: 'Navegar para #/kanban (Atalho: G K)',
      category: 'Navegação',
      run: () => navigate('#/kanban')
    },
    {
      icon: '🏠',
      title: 'Ir para a Home (Projetos)',
      subtitle: 'Navegar para #/home (Atalho: G H)',
      category: 'Navegação',
      run: () => navigate('#/home')
    },
    {
      icon: '📥',
      title: 'Abrir Inbox Rápida',
      subtitle: 'Navegar para #/inbox (Atalho: G I)',
      category: 'Navegação',
      run: () => navigate('#/inbox')
    },
    {
      icon: '🌙',
      title: 'Tema: Alternar Escuro / Claro / Sistema',
      subtitle: `Atual: ${state.config.theme}`,
      category: 'Aparência',
      run: () => {
        const order = ['dark', 'light', 'system'];
        const next = order[(order.indexOf(state.config.theme) + 1) % order.length];
        dispatch({ type: 'CONFIG_UPDATE', payload: { theme: next } });
        document.documentElement.setAttribute('data-theme', next);
        showToast(`Tema alterado para "${next}"`, { type: 'success', duration: 2000 });
      }
    },
    {
      icon: '🎨',
      title: 'Acento: Alternar Cor de Destaque',
      subtitle: `Atual: ${state.config.accent}`,
      category: 'Aparência',
      run: () => {
        const accents = ['violet', 'cyan', 'emerald', 'amber', 'rose', 'blue'];
        const next = accents[(accents.indexOf(state.config.accent) + 1) % accents.length];
        dispatch({ type: 'CONFIG_UPDATE', payload: { accent: next } });
        document.documentElement.setAttribute('data-accent', next);
        showToast(`Cor de destaque alterada para "${next}"`, { type: 'success', duration: 2000 });
      }
    },
    {
      icon: '💾',
      title: 'Exportar backup JSON',
      subtitle: 'Baixar cópia completa dos dados pessoais',
      category: 'Dados',
      run: () => {
        const json = exportJSON(getState());
        triggerDownload(json);
        showToast('Backup JSON exportado!', { type: 'success', duration: 2500 });
      }
    }
  ];

  for (const act of actions) {
    const score = Math.max(
      fuzzyScore(query, act.title),
      fuzzyScore(query, act.subtitle),
      fuzzyScore(query, act.category)
    );
    if (score > 0) candidates.push({ ...act, score: query ? score : score + 10 });
  }

  // 2. Projetos
  for (const proj of projects) {
    const score = Math.max(
      fuzzyScore(query, proj.name) * 1.2,
      fuzzyScore(query, proj.description),
      fuzzyScore(query, proj.status),
      fuzzyScore(query, proj.language || '')
    );
    if (score > 0) {
      candidates.push({
        icon: proj.customIcon || '📁',
        title: proj.name,
        subtitle: `Status: ${proj.status} · ${proj.openTasksCount} tarefa(s) aberta(s)`,
        category: 'Projeto',
        score,
        run: () => navigate(`#/project/${proj.repoId}`)
      });
    }

    // 3. Tarefas do Projeto
    for (const task of proj.tasks) {
      const tScore = fuzzyScore(query, task.title);
      if (tScore > 0 && (query.length > 0 || !task.completed)) {
        candidates.push({
          icon: task.completed ? '✅' : '☑️',
          title: task.title,
          subtitle: `Em ${proj.name} · Prioridade ${task.priority}`,
          category: 'Tarefa',
          score: tScore,
          run: () => {
            sessionStorage.setItem('panel_open_project_tab', 'tasks');
            navigate(`#/project/${proj.repoId}`);
          }
        });
      }
    }

    // 4. Notas do Projeto
    const noteContent = proj.note?.content || '';
    if (noteContent.trim() && query.length > 0) {
      const nScore = fuzzyScore(query, noteContent);
      if (nScore > 0) {
        const snippet = noteContent.replace(/\s+/g, ' ').slice(0, 70);
        candidates.push({
          icon: '📝',
          title: `Nota em ${proj.name}`,
          subtitle: snippet,
          category: 'Nota',
          score: nScore,
          run: () => {
            sessionStorage.setItem('panel_open_project_tab', 'notes');
            navigate(`#/project/${proj.repoId}`);
          }
        });
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, 30);
}

// ─────────────────────────────────────────────
// AÇÕES AUXILIARES DA COMMAND PALETTE E ATALHOS
// ─────────────────────────────────────────────

/**
 * Sincroniza dados remotos/cache da API do GitHub (Portão de Qualidade da Fase 2)
 */
export async function _syncGitHubRemoteCache() {
  showToast('Sincronizando repositórios com a API do GitHub…', { type: 'info', duration: 2000 });
  const state = getState();
  const result = await fetchUserRepos(state.githubCache, true);

  if (result.rateLimit) {
    updateRateLimitIndicator(result.rateLimit);
  }

  if (result.source === 'network' && result.data) {
    dispatch({
      type: 'GITHUB_CACHE_UPDATE',
      payload: { repos: result.data, fetchedAt: result.fetchedAt, rateLimit: result.rateLimit }
    });
    dispatch({ type: 'PROJECTS_SYNC_GITHUB', payload: { repos: result.data } });
    showToast(`Cache do GitHub atualizado (${result.data.length} repositórios)!`, { type: 'success', duration: 3500 });
  } else if (result.source === 'rate-limit') {
    showToast('Limite da API do GitHub atingido. Tente novamente mais tarde.', { type: 'warning', duration: 4000 });
  } else {
    showToast(result.error || 'Não foi possível atualizar o cache do GitHub.', { type: 'error', duration: 4000 });
  }
}

/**
 * Modal global de criação rápida de tarefa (usado pela Palette e pelo atalho `n`)
 */
export function openQuickTaskModal(defaultRepoId = null) {
  const state = getState();
  const projects = getMergedProjects(state).filter(p => !p.hidden);

  if (projects.length === 0) {
    showToast('Sincronize ou crie um projeto antes de adicionar uma tarefa.', { type: 'warning' });
    return;
  }

  const body = document.createElement('div');
  body.style.cssText = 'display:flex;flex-direction:column;gap:12px;';

  const projGroup = document.createElement('div');
  projGroup.className = 'input-group';
  projGroup.style.marginBottom = '0';
  projGroup.innerHTML = `<label class="input-label">Projeto</label>`;
  const projSelect = document.createElement('select');
  projSelect.className = 'select';

  const preferredId = defaultRepoId || state.lastVisitedProjectId || projects[0].repoId;
  projects.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.repoId;
    opt.textContent = p.name;
    opt.selected = p.repoId === String(preferredId);
    projSelect.appendChild(opt);
  });
  projGroup.appendChild(projSelect);

  const titleGroup = document.createElement('div');
  titleGroup.className = 'input-group';
  titleGroup.style.marginBottom = '0';
  titleGroup.innerHTML = `<label class="input-label">Título da Tarefa</label>`;
  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.className = 'input';
  titleInput.placeholder = 'Ex.: Implementar autenticação OAuth';
  titleGroup.appendChild(titleInput);

  const row = document.createElement('div');
  row.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:10px;';

  const prioGroup = document.createElement('div');
  prioGroup.className = 'input-group';
  prioGroup.style.marginBottom = '0';
  prioGroup.innerHTML = `<label class="input-label">Prioridade</label>`;
  const prioSelect = document.createElement('select');
  prioSelect.className = 'select';
  ['baixa', 'normal', 'alta', 'urgente'].forEach(p => {
    const opt = document.createElement('option');
    opt.value = p;
    opt.textContent = p.charAt(0).toUpperCase() + p.slice(1);
    opt.selected = p === 'normal';
    prioSelect.appendChild(opt);
  });
  prioGroup.appendChild(prioSelect);

  const dueGroup = document.createElement('div');
  dueGroup.className = 'input-group';
  dueGroup.style.marginBottom = '0';
  dueGroup.innerHTML = `<label class="input-label">Prazo</label>`;
  const dueInput = document.createElement('input');
  dueInput.type = 'date';
  dueInput.className = 'input';
  dueGroup.appendChild(dueInput);

  row.appendChild(prioGroup);
  row.appendChild(dueGroup);

  body.appendChild(projGroup);
  body.appendChild(titleGroup);
  body.appendChild(row);

  openModal({
    title: '➕ Nova Tarefa Rápida',
    body,
    confirmLabel: 'Criar Tarefa',
    cancelLabel: 'Cancelar',
    onConfirm: () => {
      const title = titleInput.value.trim();
      if (!title) return;
      const targetId = projSelect.value;
      dispatch({
        type: 'TASK_ADD',
        payload: {
          repoId: targetId,
          title,
          priority: prioSelect.value,
          dueDate: dueInput.value || null
        }
      });
      showToast('Tarefa adicionada com sucesso!', {
        type: 'success',
        duration: 3500,
        action: {
          label: 'Abrir Projeto',
          fn: () => {
            sessionStorage.setItem('panel_open_project_tab', 'tasks');
            navigate(`#/project/${targetId}`);
          }
        }
      });
    }
  });

  setTimeout(() => titleInput.focus(), 60);
}

function _openChangeProjectStatusModal() {
  const state = getState();
  const projects = getMergedProjects(state).filter(p => !p.hidden);
  if (projects.length === 0) return;

  const body = document.createElement('div');
  body.style.cssText = 'display:flex;flex-direction:column;gap:12px;';

  const projGroup = document.createElement('div');
  projGroup.className = 'input-group';
  projGroup.style.marginBottom = '0';
  projGroup.innerHTML = `<label class="input-label">Projeto</label>`;
  const projSelect = document.createElement('select');
  projSelect.className = 'select';
  projects.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.repoId;
    opt.textContent = `${p.name} (${p.status})`;
    projSelect.appendChild(opt);
  });
  projGroup.appendChild(projSelect);

  const statusGroup = document.createElement('div');
  statusGroup.className = 'input-group';
  statusGroup.style.marginBottom = '0';
  statusGroup.innerHTML = `<label class="input-label">Novo Status</label>`;
  const statusSelect = document.createElement('select');
  statusSelect.className = 'select';
  STATUS_ORDER.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s;
    opt.textContent = s.charAt(0).toUpperCase() + s.slice(1);
    statusSelect.appendChild(opt);
  });
  statusGroup.appendChild(statusSelect);

  body.appendChild(projGroup);
  body.appendChild(statusGroup);

  openModal({
    title: '🏷️ Mudar Status de Projeto',
    body,
    confirmLabel: 'Atualizar Status',
    cancelLabel: 'Cancelar',
    onConfirm: () => {
      dispatch({
        type: 'PROJECT_UPDATE_STATUS',
        payload: { repoId: projSelect.value, status: statusSelect.value }
      });
      showToast(`Status alterado para "${statusSelect.value}"!`, { type: 'success', duration: 3000 });
    }
  });
}

function _escape(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
