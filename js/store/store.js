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

import { loadState, saveState, saveStateImmediate, createInitialState, CURRENT_VERSION } from './storage.js';
import { generateUUID } from '../utils/uuid.js';
import { invalidateCoverCache } from '../utils/cover.js';
import {
  buildNextRecurringTask,
  getTodayLocalISO,
  XP_REWARDS,
  computeLevelInfo,
  evaluateStreakOnActivity,
  evaluateAchievements,
  ACHIEVEMENTS_CATALOG
} from '../utils/domain.js';

// ─────────────────────────────────────────────
// MÁQUINA DE ESTADOS EXPLÍCITA DO TIMER DE FOCO (FASE 4)
// Estados: 'idle' | 'running' | 'paused' | 'completed' | 'interrupted'
// ─────────────────────────────────────────────
export const FOCUS_ALLOWED_TRANSITIONS = Object.freeze({
  idle: ['running'],
  running: ['paused', 'completed', 'interrupted', 'idle'],
  paused: ['running', 'interrupted', 'idle'],
  interrupted: ['running', 'completed', 'idle'],
  completed: ['idle', 'running']
});

export function canTransitionFocusTimer(fromStatus, toStatus) {
  const allowed = FOCUS_ALLOWED_TRANSITIONS[fromStatus];
  return Array.isArray(allowed) && allowed.includes(toStatus);
}

function _emitSafeEvent(name, detail) {
  if (typeof document !== 'undefined' && typeof CustomEvent === 'function') {
    setTimeout(() => {
      try {
        document.dispatchEvent(new CustomEvent(name, { detail, bubbles: true }));
      } catch {
        // Silencioso em ambientes de teste sem DOM completo
      }
    }, 0);
  }
}

/**
 * Concede XP, atualiza streak e desbloqueia conquistas de forma 100% IDEMPOTENTE.
 * Se `grantKey` já estiver registrado em `state.gamification.xpGrants`, não concede XP novamente.
 */
function _applyGamificationGrant(state, { grantKey, xpAmount, reason, activityDateISO }) {
  const gamification = state.gamification || createInitialState().gamification;
  const xpGrants = { ...(gamification.xpGrants || {}) };
  const dateISO = activityDateISO || getTodayLocalISO();

  const alreadyGranted = Boolean(xpGrants[grantKey]);
  const prevXp = Math.max(0, Number(gamification.xp) || 0);
  const prevLevelInfo = computeLevelInfo(prevXp);

  let nextXp = prevXp;
  if (!alreadyGranted && xpAmount > 0) {
    nextXp = prevXp + xpAmount;
    xpGrants[grantKey] = {
      xp: xpAmount,
      reason,
      timestamp: new Date().toISOString()
    };
  }

  const nextLevelInfo = computeLevelInfo(nextXp);
  const nextStreak = evaluateStreakOnActivity(gamification.streak, dateISO);

  const tempState = {
    ...state,
    gamification: {
      ...gamification,
      xp: nextXp,
      level: nextLevelInfo.level,
      xpGrants,
      streak: nextStreak
    }
  };

  const achResult = evaluateAchievements(tempState);
  const unlockedAchievements = { ...(gamification.unlockedAchievements || {}) };
  const nowISO = new Date().toISOString();
  const newlyUnlockedObjects = [];

  for (const badgeId of achResult.newlyUnlockedIds) {
    unlockedAchievements[badgeId] = nowISO;
    const found = ACHIEVEMENTS_CATALOG.find(b => b.id === badgeId);
    if (found) newlyUnlockedObjects.push(found);
  }

  const nextState = {
    ...tempState,
    gamification: {
      ...tempState.gamification,
      unlockedAchievements
    }
  };

  if (state.config?.gamificationEnabled !== false) {
    if (!alreadyGranted && xpAmount > 0) {
      _emitSafeEvent('gamification:xp-gained', {
        xpAdded: xpAmount,
        totalXp: nextXp,
        level: nextLevelInfo.level,
        reason,
        grantKey
      });
      if (nextLevelInfo.level > prevLevelInfo.level) {
        _emitSafeEvent('gamification:level-up', {
          oldLevel: prevLevelInfo.level,
          newLevel: nextLevelInfo.level,
          levelInfo: nextLevelInfo
        });
      }
    }
    if (newlyUnlockedObjects.length > 0) {
      _emitSafeEvent('gamification:achievement-unlocked', {
        achievements: newlyUnlockedObjects
      });
    }
  }

  return nextState;
}

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

      let nextState = {
        ...state,
        projects: { ...state.projects, [id]: proj }
      };

      if (status === 'concluído') {
        const grantKey = `project:${id}`;
        const firstTime = !state.gamification?.xpGrants?.[grantKey];
        nextState = _applyGamificationGrant(nextState, {
          grantKey,
          xpAmount: XP_REWARDS.PROJECT_COMPLETE,
          reason: `Projeto concluído: ${proj.customName || proj.name || id}`
        });
        if (state.config?.gamificationEnabled !== false) {
          _emitSafeEvent('project:completed-celebration', {
            repoId: id,
            projectName: proj.customName || proj.name || `Projeto #${id}`,
            firstTime
          });
        }
      }

      return nextState;
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
          ...state.githubCache,
          repos: action.payload.repos ?? state.githubCache.repos ?? [],
          fetchedAt: action.payload.fetchedAt ?? state.githubCache.fetchedAt ?? null,
          rateLimit: action.payload.rateLimit || state.githubCache.rateLimit || null
        }
      };
    }

    case 'GITHUB_EVENTS_CACHE_UPDATE': {
      return {
        ...state,
        githubCache: {
          ...state.githubCache,
          events: Array.isArray(action.payload.events) ? action.payload.events : (state.githubCache.events || []),
          eventsFetchedAt: action.payload.fetchedAt ?? state.githubCache.eventsFetchedAt ?? null,
          rateLimit: action.payload.rateLimit || state.githubCache.rateLimit || null
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

      let nextState = {
        ...state,
        projects: { ...state.projects, [id]: proj }
      };

      if (task.completed) {
        nextState = _applyGamificationGrant(nextState, {
          grantKey: `task:${task.id}`,
          xpAmount: XP_REWARDS.TASK_COMPLETE,
          reason: `Tarefa concluída: ${task.title}`
        });
      }

      return nextState;
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

    // ── Modo Foco / Pomodoro (Máquina de Estados Explícita) ──
    case 'FOCUS_SET_TARGET': {
      const { repoId = null, taskId = null } = action.payload || {};
      const focus = state.focus || createInitialState().focus;
      return {
        ...state,
        focus: {
          ...focus,
          timer: {
            ...focus.timer,
            repoId: repoId ? String(repoId) : null,
            taskId: taskId ? String(taskId) : null
          }
        }
      };
    }

    case 'FOCUS_CONFIGURE_MODE': {
      const { mode = 'focus', customMinutes } = action.payload || {};
      const focus = state.focus || createInitialState().focus;
      const timer = focus.timer || {};
      // Só permite reconfigurar modo quando não está running
      if (timer.status === 'running') return state;

      const defaultMins = mode === 'shortBreak'
        ? (state.config?.shortBreakMinutes || 5)
        : mode === 'longBreak'
          ? (state.config?.longBreakMinutes || 15)
          : (state.config?.focusDurationMinutes || 25);

      const mins = Math.max(1, Math.min(180, Number(customMinutes) || defaultMins));
      const durationMs = mins * 60 * 1000;

      return {
        ...state,
        focus: {
          ...focus,
          timer: {
            ...timer,
            status: 'idle',
            mode,
            durationMs,
            startedAt: null,
            expectedEndAt: null,
            remainingMs: durationMs,
            lastClockCheckAt: null,
            sessionId: null,
            ambiguousReason: null
          }
        }
      };
    }

    case 'FOCUS_START': {
      const focus = state.focus || createInitialState().focus;
      const timer = focus.timer || createInitialState().focus.timer;

      if (!canTransitionFocusTimer(timer.status, 'running')) {
        return state;
      }

      const nowMs = action.payload?.nowMs ?? Date.now();
      const tzOffset = action.payload?.timezoneOffset ?? new Date(nowMs).getTimezoneOffset();
      const mode = action.payload?.mode || timer.mode || 'focus';
      const durationMs = action.payload?.durationMs
        ? Math.max(1000, Number(action.payload.durationMs))
        : (timer.durationMs || 25 * 60 * 1000);

      const sessionId = action.payload?.sessionId || `sess_${nowMs}_${generateUUID().slice(0, 8)}`;

      return {
        ...state,
        focus: {
          ...focus,
          timer: {
            ...timer,
            status: 'running',
            mode,
            repoId: action.payload?.repoId !== undefined ? action.payload.repoId : timer.repoId,
            taskId: action.payload?.taskId !== undefined ? action.payload.taskId : timer.taskId,
            durationMs,
            startedAt: nowMs,
            expectedEndAt: nowMs + durationMs,
            remainingMs: durationMs,
            lastClockCheckAt: nowMs,
            timezoneOffset: tzOffset,
            sessionId,
            ambiguousReason: null
          }
        }
      };
    }

    case 'FOCUS_PAUSE': {
      const focus = state.focus || createInitialState().focus;
      const timer = focus.timer || {};
      if (!canTransitionFocusTimer(timer.status, 'paused')) {
        return state;
      }

      const nowMs = action.payload?.nowMs ?? Date.now();
      const remainingMs = timer.expectedEndAt
        ? Math.max(0, timer.expectedEndAt - nowMs)
        : Math.max(0, timer.remainingMs || 0);

      return {
        ...state,
        focus: {
          ...focus,
          timer: {
            ...timer,
            status: 'paused',
            expectedEndAt: null,
            remainingMs,
            lastClockCheckAt: nowMs
          }
        }
      };
    }

    case 'FOCUS_RESUME': {
      const focus = state.focus || createInitialState().focus;
      const timer = focus.timer || {};
      if (timer.status !== 'paused' && timer.status !== 'interrupted') {
        return state;
      }

      const nowMs = action.payload?.nowMs ?? Date.now();
      const tzOffset = action.payload?.timezoneOffset ?? new Date(nowMs).getTimezoneOffset();
      const remainingMs = Math.max(1000, timer.remainingMs || timer.durationMs || 60000);

      return {
        ...state,
        focus: {
          ...focus,
          timer: {
            ...timer,
            status: 'running',
            expectedEndAt: nowMs + remainingMs,
            remainingMs,
            lastClockCheckAt: nowMs,
            timezoneOffset: tzOffset,
            ambiguousReason: null
          }
        }
      };
    }

    case 'FOCUS_INTERRUPT': {
      const focus = state.focus || createInitialState().focus;
      const timer = focus.timer || {};
      if (!canTransitionFocusTimer(timer.status, 'interrupted')) {
        return state;
      }

      const nowMs = action.payload?.nowMs ?? Date.now();
      const remainingMs = timer.status === 'running' && timer.expectedEndAt
        ? Math.max(0, timer.expectedEndAt - nowMs)
        : Math.max(0, timer.remainingMs || 0);

      return {
        ...state,
        focus: {
          ...focus,
          timer: {
            ...timer,
            status: 'interrupted',
            expectedEndAt: null,
            remainingMs,
            lastClockCheckAt: nowMs,
            ambiguousReason: action.payload?.reason || 'manual_interrupt'
          }
        }
      };
    }

    case 'FOCUS_SKIP':
    case 'FOCUS_DISCARD': {
      const focus = state.focus || createInitialState().focus;
      const timer = focus.timer || {};
      const nextMode = action.payload?.nextMode || timer.mode || 'focus';
      const defaultMins = nextMode === 'shortBreak'
        ? (state.config?.shortBreakMinutes || 5)
        : nextMode === 'longBreak'
          ? (state.config?.longBreakMinutes || 15)
          : (state.config?.focusDurationMinutes || 25);
      const durationMs = defaultMins * 60 * 1000;

      return {
        ...state,
        focus: {
          ...focus,
          timer: {
            ...timer,
            status: 'idle',
            mode: nextMode,
            durationMs,
            startedAt: null,
            expectedEndAt: null,
            remainingMs: durationMs,
            lastClockCheckAt: null,
            sessionId: null,
            ambiguousReason: null
          }
        }
      };
    }

    case 'FOCUS_SYNC_CLOCK': {
      const focus = state.focus || createInitialState().focus;
      const timer = focus.timer || {};
      if (timer.status !== 'running') return state;

      const nowMs = action.payload?.nowMs ?? Date.now();
      const nowTz = action.payload?.timezoneOffset ?? new Date(nowMs).getTimezoneOffset();
      const lastCheck = timer.lastClockCheckAt || timer.startedAt || nowMs;
      const deltaMs = nowMs - lastCheck;

      // 1. Detecta inconsistência de relógio (relógio voltou > 5s, saltou > 6h de uma vez ou fuso horário mudou)
      const clockMovedBackwards = deltaMs < -5000;
      const timezoneChanged = typeof timer.timezoneOffset === 'number' && nowTz !== timer.timezoneOffset;
      const hugeUnexpectedJump = deltaMs > 6 * 3600 * 1000;

      if (clockMovedBackwards || timezoneChanged || hugeUnexpectedJump) {
        return {
          ...state,
          focus: {
            ...focus,
            timer: {
              ...timer,
              status: 'interrupted',
              expectedEndAt: null,
              remainingMs: Math.max(60000, Math.min(timer.durationMs, timer.remainingMs || timer.durationMs)),
              lastClockCheckAt: nowMs,
              timezoneOffset: nowTz,
              ambiguousReason: timezoneChanged ? 'timezone_changed' : 'clock_inconsistency'
            }
          }
        };
      }

      // 2. Se ocorreu reload ou retorno após longo período e o timer já havia expirado:
      // NÃO registra automaticamente sem confirmação! Pede confirmação explícita ao usuário.
      const remainingMs = Math.max(0, (timer.expectedEndAt || nowMs) - nowMs);
      const overdueMs = nowMs - (timer.expectedEndAt || nowMs);

      if (remainingMs === 0 && (action.payload?.isReload || overdueMs > 120 * 1000)) {
        return {
          ...state,
          focus: {
            ...focus,
            timer: {
              ...timer,
              status: 'interrupted',
              expectedEndAt: null,
              remainingMs: 0,
              lastClockCheckAt: nowMs,
              ambiguousReason: 'expired_while_away'
            }
          }
        };
      }

      return {
        ...state,
        focus: {
          ...focus,
          timer: {
            ...timer,
            remainingMs,
            lastClockCheckAt: nowMs
          }
        }
      };
    }

    case 'FOCUS_COMPLETE_SESSION': {
      const focus = state.focus || createInitialState().focus;
      const timer = focus.timer || {};

      if (!canTransitionFocusTimer(timer.status, 'completed')) {
        return state;
      }

      const nowMs = action.payload?.nowMs ?? Date.now();
      const nowISO = new Date(nowMs).toISOString();
      const sessionId = action.payload?.sessionId || timer.sessionId || `sess_${nowMs}`;
      const isPartial = Boolean(action.payload?.partial);

      // Idempotência estrita por sessionId: nunca duplica sessão por duplo clique ou corrida
      const existingSessions = Array.isArray(focus.sessions) ? focus.sessions : [];
      const alreadyRecorded = existingSessions.some(s => s.id === sessionId);

      const elapsedMs = isPartial
        ? Math.max(60000, (timer.durationMs || 0) - (timer.remainingMs || 0))
        : (timer.durationMs || 25 * 60 * 1000);
      const durationMinutes = Math.max(1, Math.round(elapsedMs / 60000));

      let taskTitle = null;
      if (timer.repoId && timer.taskId && state.projects?.[String(timer.repoId)]) {
        const foundTask = state.projects[String(timer.repoId)].tasks?.find(t => t.id === timer.taskId);
        if (foundTask) taskTitle = foundTask.title;
      }

      const nextSessions = alreadyRecorded
        ? existingSessions
        : [
            {
              id: sessionId,
              repoId: timer.repoId || null,
              taskId: timer.taskId || null,
              taskTitle,
              mode: timer.mode || 'focus',
              durationMinutes,
              startedAt: timer.startedAt ? new Date(timer.startedAt).toISOString() : nowISO,
              completedAt: nowISO,
              partial: isPartial,
              dateKey: action.payload?.dateKey || getTodayLocalISO()
            },
            ...existingSessions
          ];

      let nextState = {
        ...state,
        focus: {
          ...focus,
          timer: {
            ...timer,
            status: 'completed',
            expectedEndAt: null,
            remainingMs: 0,
            lastClockCheckAt: nowMs,
            sessionId,
            ambiguousReason: null
          },
          sessions: nextSessions
        }
      };

      // Concede XP idempotente apenas para sessões de foco
      if ((timer.mode || 'focus') === 'focus' && !alreadyRecorded) {
        nextState = _applyGamificationGrant(nextState, {
          grantKey: `focus:${sessionId}`,
          xpAmount: XP_REWARDS.FOCUS_COMPLETE,
          reason: `Sessão de foco concluída (${durationMinutes} min)`,
          activityDateISO: action.payload?.dateKey || getTodayLocalISO()
        });
      }

      return nextState;
    }

    // ── Notificações Locais (Controle de Resumo Diário e Prazos) ──
    case 'NOTIFICATION_MARK_DAILY_SUMMARY': {
      const gamification = state.gamification || createInitialState().gamification;
      return {
        ...state,
        gamification: {
          ...gamification,
          lastDailySummaryDate: action.payload?.dateISO || getTodayLocalISO()
        }
      };
    }

    case 'NOTIFICATION_MARK_TASK_NOTIFIED': {
      const gamification = state.gamification || createInitialState().gamification;
      const key = action.payload?.key;
      if (!key) return state;
      return {
        ...state,
        gamification: {
          ...gamification,
          notifiedDueTaskIds: {
            ...(gamification.notifiedDueTaskIds || {}),
            [key]: true
          }
        }
      };
    }

    // ── Import / Reset ──────────────────────
    case '_IMPORT_STATE': {
      return {
        ...state,
        config: action.payload.config || state.config,
        projects: action.payload.projects || {},
        inbox: action.payload.inbox || [],
        lastVisitedProjectId: action.payload.lastVisitedProjectId || null,
        focus: action.payload.focus || state.focus,
        gamification: action.payload.gamification || state.gamification
      };
    }

    case '_RESET_ALL': {
      _undoStack.length = 0;
      const fresh = createInitialState();
      return {
        ...fresh,
        config: state.config,
        githubCache: { repos: [], fetchedAt: null, events: [], eventsFetchedAt: null, rateLimit: null }
      };
    }

    default:
      console.warn('[Store] Ação desconhecida:', action.type);
      return state;
  }
}
