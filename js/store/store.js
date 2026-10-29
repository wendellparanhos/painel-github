/**
 * Store reativo — única fonte da verdade para dados pessoais do painel.
 *
 * API pública:
 *   getState()        → cópia congelada do estado atual
 *   dispatch(action)  → aplica uma ação pura e notifica os assinantes
 *   subscribe(fn)     → registra listener; retorna função unsubscribe()
 *   undo()            → reverte a última ação reversível dentro da janela de tempo
 *   canUndo()         → boolean
 */

import { loadState, saveState, saveStateImmediate, CURRENT_VERSION } from './storage.js';
import { generateUUID } from '../utils/uuid.js';
import { invalidateCoverCache } from '../utils/cover.js';
import { buildNextRecurringTask } from '../utils/domain.js';

// ─────────────────────────────────────────────
// ESTADO INTERNO
// ─────────────────────────────────────────────
let _state = null;
const _listeners = new Set();

// Pilha de undo leve (armazena apenas deltas/entidades afetadas, sem copiar githubCache)
// Formato: { label, timestamp, patches: { projects?: { [id]: prevProj | null }, inbox?: prevInbox } }
const _undoStack = [];
const MAX_UNDO = 25;
const UNDO_WINDOW_MS = 15 * 60 * 1000; // Janela de 15 minutos
const MAX_STATUS_HISTORY = 50;

// ─────────────────────────────────────────────
// INICIALIZAÇÃO
// ─────────────────────────────────────────────
export function initStore() {
  const { state, corrupted, migrated } = loadState();
  _state = state;
  _undoStack.length = 0;
  return { corrupted, migrated };
}

// ─────────────────────────────────────────────
// GETTERS
// ─────────────────────────────────────────────
export function getState() {
  return Object.freeze({ ..._state });
}

export function getProjectData(repoId) {
  const id = String(repoId);
  return _state.projects[id] || null;
}

function _pruneExpiredUndo() {
  const cutoff = Date.now() - UNDO_WINDOW_MS;
  while (_undoStack.length > 0 && _undoStack[0].timestamp < cutoff) {
    _undoStack.shift();
  }
}

export function canUndo() {
  _pruneExpiredUndo();
  return _undoStack.length > 0;
}

export function getLastUndoLabel() {
  _pruneExpiredUndo();
  return _undoStack.length > 0 ? _undoStack[_undoStack.length - 1].label : null;
}

// ─────────────────────────────────────────────
// SUBSCRIBE
// ─────────────────────────────────────────────
export function subscribe(listener) {
  _listeners.add(listener);
  return () => _listeners.delete(listener);
}

function _notify() {
  const frozen = Object.freeze({ ..._state });
  for (const listener of _listeners) {
    try { listener(frozen); } catch (e) { console.error('[Store] Listener error:', e); }
  }
}

// ─────────────────────────────────────────────
// DISPATCH
// ─────────────────────────────────────────────
export function dispatch(action) {
  if (!action || typeof action.type !== 'string') {
    console.warn('[Store] Ação inválida:', action);
    return;
  }

  const prevState = _state;

  try {
    _state = reducer(_state, action);
  } catch (err) {
    console.error('[Store] Erro no reducer:', err, action);
    _state = prevState;
    return;
  }

  if (_state === prevState) return;

  // Persiste (com debounce interno no saveState)
  saveState(_state);

  // Notifica assinantes
  _notify();
}

// ─────────────────────────────────────────────
// UNDO PARCIAL E LEVE (Sem clonar o state inteiro)
// ─────────────────────────────────────────────
export function undo() {
  _pruneExpiredUndo();
  if (_undoStack.length === 0) return false;

  const entry = _undoStack.pop();
  const nextProjects = { ..._state.projects };

  if (entry.patches.projects) {
    for (const [id, prevProj] of Object.entries(entry.patches.projects)) {
      if (prevProj === null) {
        delete nextProjects[id];
      } else {
        nextProjects[id] = JSON.parse(JSON.stringify(prevProj));
      }
    }
  }

  const nextInbox = entry.patches.inbox
    ? JSON.parse(JSON.stringify(entry.patches.inbox))
    : _state.inbox;

  _state = {
    ..._state,
    projects: nextProjects,
    inbox: nextInbox
  };

  saveStateImmediate(_state);
  _notify();
  return true;
}

function _pushProjectUndo(state, repoId, label = 'Ação') {
  _pruneExpiredUndo();
  const id = String(repoId);
  const prevProj = state.projects[id] ? JSON.parse(JSON.stringify(state.projects[id])) : null;
  _undoStack.push({
    label,
    timestamp: Date.now(),
    patches: { projects: { [id]: prevProj } }
  });
  if (_undoStack.length > MAX_UNDO) _undoStack.shift();
}

function _pushInboxUndo(state, label = 'Ação na Inbox', extraProjectId = null) {
  _pruneExpiredUndo();
  const patches = {
    inbox: JSON.parse(JSON.stringify(state.inbox || []))
  };
  if (extraProjectId) {
    const id = String(extraProjectId);
    patches.projects = {
      [id]: state.projects[id] ? JSON.parse(JSON.stringify(state.projects[id])) : null
    };
  }
  _undoStack.push({
    label,
    timestamp: Date.now(),
    patches
  });
  if (_undoStack.length > MAX_UNDO) _undoStack.shift();
}

// ─────────────────────────────────────────────
// HELPERS de projeto
// ─────────────────────────────────────────────
function _createDefaultProject(id, name = '') {
  return {
    id: String(id),
    name: name || '',
    status: 'ideia',
    statusHistory: [{ status: 'ideia', timestamp: new Date().toISOString() }],
    coverSeed: Math.floor(Math.random() * 9999),
    pinned: false,
    hidden: false,
    customIcon: '',
    customColor: '',
    lastOpenedAt: null,
    isLocalOnly: false,
    tasks: [],
    note: { content: '', updatedAt: null },
    customLinks: [],
    milestones: []
  };
}

function _cloneProject(state, repoId) {
  const id = String(repoId);
  const existing = state.projects[id];
  return existing ? JSON.parse(JSON.stringify(existing)) : _createDefaultProject(id);
}

// ─────────────────────────────────────────────
// REDUCER PURO (Clona apenas os ramos alterados)
// ─────────────────────────────────────────────
function reducer(state, action) {
  switch (action.type) {

    // ── Config ──────────────────────────────
    case 'CONFIG_UPDATE': {
      return {
        ...state,
        config: { ...state.config, ...action.payload }
      };
    }

    // ── Projetos ────────────────────────────
    case 'PROJECT_ENSURE': {
      const id = String(action.payload.repoId);
      if (state.projects[id]) return state;
      const proj = _createDefaultProject(id);
      if (action.payload.coverSeed !== undefined) {
        proj.coverSeed = action.payload.coverSeed;
      }
      return {
        ...state,
        projects: { ...state.projects, [id]: proj }
      };
    }

    case 'PROJECT_TOUCH': {
      const id = String(action.payload.repoId);
      const proj = _cloneProject(state, id);
      proj.lastOpenedAt = new Date().toISOString();
      return {
        ...state,
        lastVisitedProjectId: id,
        projects: { ...state.projects, [id]: proj }
      };
    }

    case 'PROJECT_TOGGLE_PIN': {
      const id = String(action.payload.repoId);
      const proj = _cloneProject(state, id);
      proj.pinned = !proj.pinned;
      return {
        ...state,
        projects: { ...state.projects, [id]: proj }
      };
    }

    case 'PROJECT_TOGGLE_HIDDEN': {
      const id = String(action.payload.repoId);
      const proj = _cloneProject(state, id);
      proj.hidden = !proj.hidden;
      return {
        ...state,
        projects: { ...state.projects, [id]: proj }
      };
    }

    case 'PROJECT_CUSTOMIZE': {
      const { repoId, customIcon, customColor, customName, description } = action.payload;
      const id = String(repoId);
      const proj = _cloneProject(state, id);
      if (customIcon !== undefined) proj.customIcon = customIcon;
      if (customColor !== undefined) proj.customColor = customColor;
      if (customName !== undefined) proj.customName = customName;
      if (description !== undefined) proj.description = description;
      return {
        ...state,
        projects: { ...state.projects, [id]: proj }
      };
    }

    case 'PROJECT_CREATE_LOCAL': {
      const { name, description = '', customIcon = '💡' } = action.payload;
      const id = `local_${Date.now()}`;
      _pushProjectUndo(state, id, 'Criar projeto local');
      const now = new Date().toISOString();
      const proj = {
        ..._createDefaultProject(id, name.trim()),
        description: description.trim(),
        customIcon,
        isLocalOnly: true,
        createdAt: now,
        updatedAt: now
      };
      return {
        ...state,
        projects: { ...state.projects, [id]: proj }
      };
    }

    case 'PROJECT_UPDATE_STATUS': {
      const { repoId, status } = action.payload;
      const id = String(repoId);
      const proj = _cloneProject(state, id);

      if (proj.status === status) return state;

      _pushProjectUndo(state, id, `Mudar status para ${status}`);
      proj.status = status;
      proj.statusHistory = [
        ...(proj.statusHistory || []),
        { status, timestamp: new Date().toISOString() }
      ].slice(-MAX_STATUS_HISTORY);

      return {
        ...state,
        projects: { ...state.projects, [id]: proj }
      };
    }

    case 'PROJECT_UPDATE_COVER_SEED': {
      const { repoId, newSeed, oldSeed } = action.payload;
      const id = String(repoId);
      const proj = _cloneProject(state, id);

      if (oldSeed !== undefined) {
        invalidateCoverCache(id, oldSeed);
      }
      proj.coverSeed = newSeed;
      return {
        ...state,
        projects: { ...state.projects, [id]: proj }
      };
    }

    case 'PROJECT_UPDATE_LINKS': {
      const { repoId, customLinks } = action.payload;
      const id = String(repoId);
      const proj = _cloneProject(state, id);
      proj.customLinks = customLinks;
      return {
        ...state,
        projects: { ...state.projects, [id]: proj }
      };
    }

    case 'PROJECT_MARK_UNAVAILABLE': {
      const id = String(action.payload.repoId);
      if (!state.projects[id]) return state;
      const proj = _cloneProject(state, id);
      proj.unavailable = true;
      return {
        ...state,
        projects: { ...state.projects, [id]: proj }
      };
    }

    case 'PROJECTS_SYNC_GITHUB': {
      const { repos } = action.payload;
      const nextProjects = { ...state.projects };
      const seenIds = new Set();

      for (const repo of repos) {
        const id = String(repo.id);
        seenIds.add(id);
        if (!nextProjects[id]) {
          nextProjects[id] = {
            ..._createDefaultProject(id, repo.name),
            coverSeed: (repo.id * 7 + repo.name.charCodeAt(0)) % 9999,
            unavailable: false
          };
        } else {
          nextProjects[id] = {
            ...nextProjects[id],
            name: repo.name,
            unavailable: false
          };
        }
      }

      for (const [id, proj] of Object.entries(nextProjects)) {
        if (!seenIds.has(id) && !proj.isLocalOnly) {
          nextProjects[id] = { ...proj, unavailable: true };
        }
      }

      return {
        ...state,
        projects: nextProjects
      };
    }

    // ── Marcos Pessoais (Timeline) ──────────
    case 'MILESTONE_ADD': {
      const { repoId, title, date } = action.payload;
      const id = String(repoId);
      const proj = _cloneProject(state, id);
      proj.milestones = [
        ...(proj.milestones || []),
        {
          id: generateUUID(),
          title: title.trim(),
          timestamp: date ? new Date(date).toISOString() : new Date().toISOString()
        }
      ];
      return {
        ...state,
        projects: { ...state.projects, [id]: proj }
      };
    }

    case 'MILESTONE_DELETE': {
      const { repoId, milestoneId } = action.payload;
      const id = String(repoId);
      const proj = _cloneProject(state, id);
      _pushProjectUndo(state, id, 'Excluir marco');
      proj.milestones = (proj.milestones || []).filter(m => m.id !== milestoneId);
      return {
        ...state,
        projects: { ...state.projects, [id]: proj }
      };
    }

    // ── GitHub Cache ────────────────────────
    case 'GITHUB_CACHE_UPDATE': {
      return {
        ...state,
        githubCache: {
          repos: action.payload.repos,
          fetchedAt: action.payload.fetchedAt,
          rateLimit: action.payload.rateLimit || null
        }
      };
    }

    case 'GITHUB_RATE_LIMIT_UPDATE': {
      return {
        ...state,
        githubCache: {
          ...state.githubCache,
          rateLimit: action.payload.rateLimit
        }
      };
    }

    // ── Tarefas ─────────────────────────────
    case 'TASK_ADD': {
      const { repoId, title, priority = 'normal', dueDate = null, recurrence = null, subtasks = [] } = action.payload;
      const id = String(repoId);
      const proj = _cloneProject(state, id);
      const taskId = generateUUID();

      const newTask = {
        id: taskId,
        seriesId: recurrence ? taskId : null,
        title: title.trim(),
        completed: false,
        priority,
        dueDate: dueDate || null,
        recurrence: recurrence || null,
        subtasks: Array.isArray(subtasks) ? subtasks : [],
        createdAt: new Date().toISOString()
      };
      proj.tasks.push(newTask);

      return {
        ...state,
        projects: { ...state.projects, [id]: proj }
      };
    }

    case 'TASK_TOGGLE': {
      const { repoId, taskId } = action.payload;
      const id = String(repoId);
      if (!state.projects[id]) return state;

      const proj = _cloneProject(state, id);
      const task = proj.tasks.find(t => t.id === taskId);
      if (!task) return state;

      _pushProjectUndo(state, id, task.completed ? 'Reabrir tarefa' : 'Concluir tarefa');

      task.completed = !task.completed;
      if (task.completed) {
        task.completedAt = new Date().toISOString();
        // Se for recorrente, gera próxima instância de forma idempotente (sem duplicar)
        if (task.recurrence) {
          const nextInstance = buildNextRecurringTask(task, proj.tasks);
          if (nextInstance) {
            proj.tasks.push(nextInstance);
          }
        }
      } else {
        delete task.completedAt;
      }

      return {
        ...state,
        projects: { ...state.projects, [id]: proj }
      };
    }

    case 'TASK_UPDATE': {
      const { repoId, taskId, changes } = action.payload;
      const id = String(repoId);
      if (!state.projects[id]) return state;

      const proj = _cloneProject(state, id);
      const idx = proj.tasks.findIndex(t => t.id === taskId);
      if (idx === -1) return state;

      const allowed = ['title', 'priority', 'dueDate', 'recurrence'];
      for (const key of allowed) {
        if (changes[key] !== undefined) proj.tasks[idx][key] = changes[key];
      }
      if (proj.tasks[idx].recurrence && !proj.tasks[idx].seriesId) {
        proj.tasks[idx].seriesId = proj.tasks[idx].id;
      }

      return {
        ...state,
        projects: { ...state.projects, [id]: proj }
      };
    }

    case 'TASK_DELETE': {
      const { repoId, taskId } = action.payload;
      const id = String(repoId);
      if (!state.projects[id]) return state;

      _pushProjectUndo(state, id, 'Excluir tarefa');
      const proj = _cloneProject(state, id);
      proj.tasks = proj.tasks.filter(t => t.id !== taskId);

      return {
        ...state,
        projects: { ...state.projects, [id]: proj }
      };
    }

    case 'TASK_REORDER': {
      const { repoId, taskId, direction } = action.payload;
      const id = String(repoId);
      if (!state.projects[id]) return state;

      const proj = _cloneProject(state, id);
      const tasks = proj.tasks;
      const idx = tasks.findIndex(t => t.id === taskId);
      if (idx === -1) return state;

      const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= tasks.length) return state;

      [tasks[idx], tasks[targetIdx]] = [tasks[targetIdx], tasks[idx]];
      return {
        ...state,
        projects: { ...state.projects, [id]: proj }
      };
    }

    case 'TASK_MOVE_INDEX': {
      const { repoId, fromIndex, toIndex } = action.payload;
      const id = String(repoId);
      if (!state.projects[id]) return state;

      const proj = _cloneProject(state, id);
      const tasks = proj.tasks;
      if (fromIndex < 0 || fromIndex >= tasks.length || toIndex < 0 || toIndex >= tasks.length || fromIndex === toIndex) {
        return state;
      }

      const [moved] = tasks.splice(fromIndex, 1);
      tasks.splice(toIndex, 0, moved);
      return {
        ...state,
        projects: { ...state.projects, [id]: proj }
      };
    }

    // ── Subtarefas ──────────────────────────
    case 'SUBTASK_ADD': {
      const { repoId, taskId, title } = action.payload;
      const id = String(repoId);
      if (!state.projects[id]) return state;

      const proj = _cloneProject(state, id);
      const task = proj.tasks.find(t => t.id === taskId);
      if (!task) return state;

      if (!Array.isArray(task.subtasks)) task.subtasks = [];
      task.subtasks.push({
        id: generateUUID(),
        title: title.trim(),
        completed: false
      });

      return {
        ...state,
        projects: { ...state.projects, [id]: proj }
      };
    }

    case 'SUBTASK_TOGGLE': {
      const { repoId, taskId, subtaskId } = action.payload;
      const id = String(repoId);
      if (!state.projects[id]) return state;

      const proj = _cloneProject(state, id);
      const task = proj.tasks.find(t => t.id === taskId);
      const sub = task?.subtasks?.find(s => s.id === subtaskId);
      if (!sub) return state;

      sub.completed = !sub.completed;
      return {
        ...state,
        projects: { ...state.projects, [id]: proj }
      };
    }

    case 'SUBTASK_DELETE': {
      const { repoId, taskId, subtaskId } = action.payload;
      const id = String(repoId);
      if (!state.projects[id]) return state;

      _pushProjectUndo(state, id, 'Excluir subtarefa');
      const proj = _cloneProject(state, id);
      const task = proj.tasks.find(t => t.id === taskId);
      if (!task || !Array.isArray(task.subtasks)) return state;

      task.subtasks = task.subtasks.filter(s => s.id !== subtaskId);
      return {
        ...state,
        projects: { ...state.projects, [id]: proj }
      };
    }

    // ── Notas ───────────────────────────────
    case 'NOTE_UPDATE': {
      const { repoId, content } = action.payload;
      const id = String(repoId);
      const proj = _cloneProject(state, id);

      proj.note = {
        content,
        updatedAt: new Date().toISOString()
      };
      return {
        ...state,
        projects: { ...state.projects, [id]: proj }
      };
    }

    // ── Inbox Rápida ────────────────────────
    case 'INBOX_ADD': {
      const { text } = action.payload;
      if (!text || !text.trim()) return state;
      const newItem = {
        id: generateUUID(),
        text: text.trim(),
        completed: false,
        createdAt: new Date().toISOString()
      };
      return {
        ...state,
        inbox: [newItem, ...(state.inbox || [])]
      };
    }

    case 'INBOX_TOGGLE': {
      const { itemId } = action.payload;
      _pushInboxUndo(state, 'Alternar item da Inbox');
      const nextInbox = (state.inbox || []).map(item =>
        item.id === itemId ? { ...item, completed: !item.completed } : item
      );
      return {
        ...state,
        inbox: nextInbox
      };
    }

    case 'INBOX_UPDATE': {
      const { itemId, text } = action.payload;
      if (!text || !text.trim()) return state;
      const nextInbox = (state.inbox || []).map(item =>
        item.id === itemId ? { ...item, text: text.trim() } : item
      );
      return {
        ...state,
        inbox: nextInbox
      };
    }

    case 'INBOX_DELETE': {
      const { itemId } = action.payload;
      _pushInboxUndo(state, 'Excluir item da Inbox');
      return {
        ...state,
        inbox: (state.inbox || []).filter(item => item.id !== itemId)
      };
    }

    case 'INBOX_CONVERT_TO_TASK': {
      const { itemId, repoId, priority = 'normal', dueDate = null } = action.payload;
      const item = (state.inbox || []).find(i => i.id === itemId);
      if (!item) return state;

      const id = String(repoId);
      _pushInboxUndo(state, 'Converter item em tarefa', id);

      const proj = _cloneProject(state, id);
      proj.tasks.push({
        id: generateUUID(),
        seriesId: null,
        title: item.text,
        completed: false,
        priority,
        dueDate: dueDate || null,
        recurrence: null,
        subtasks: [],
        createdAt: new Date().toISOString()
      });

      return {
        ...state,
        projects: { ...state.projects, [id]: proj },
        inbox: (state.inbox || []).filter(i => i.id !== itemId)
      };
    }

    case 'INBOX_CONVERT_TO_PROJECT': {
      const { itemId, customIcon = '💡' } = action.payload;
      const item = (state.inbox || []).find(i => i.id === itemId);
      if (!item) return state;

      const newId = `local_${Date.now()}`;
      _pushInboxUndo(state, 'Converter item em projeto', newId);

      const now = new Date().toISOString();
      const newProj = {
        ..._createDefaultProject(newId, item.text),
        customIcon,
        isLocalOnly: true,
        createdAt: now,
        updatedAt: now
      };

      return {
        ...state,
        projects: { ...state.projects, [newId]: newProj },
        inbox: (state.inbox || []).filter(i => i.id !== itemId)
      };
    }

    // ── Import / Reset ──────────────────────
    case '_IMPORT_STATE': {
      return {
        ...state,
        config: action.payload.config || state.config,
        projects: action.payload.projects || {},
        inbox: action.payload.inbox || [],
        lastVisitedProjectId: action.payload.lastVisitedProjectId || null
      };
    }

    case '_RESET_ALL': {
      _undoStack.length = 0;
      return {
        version: CURRENT_VERSION,
        config: state.config,
        projects: {},
        inbox: [],
        lastVisitedProjectId: null,
        githubCache: { repos: [], fetchedAt: null, rateLimit: null }
      };
    }

    default:
      console.warn('[Store] Ação desconhecida:', action.type);
      return state;
  }
}
