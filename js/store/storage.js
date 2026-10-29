/**
 * Persistência em localStorage com migrações versionadas,
 * validação de esquema, backup preventivo e tratamento de QuotaExceededError.
 *
 * CHAVES USADAS:
 *   panel_state_v1  — estado principal do painel
 *   panel_backup    — snapshot de segurança pré-sobrescrita
 */

export const STORAGE_KEY = 'panel_state_v1';
export const BACKUP_KEY = 'panel_backup';
export const CURRENT_VERSION = 2;

// ─────────────────────────────────────────────
// ESTADO INICIAL (fallback caso não exista dado)
// ─────────────────────────────────────────────
export function createInitialState() {
  return {
    version: CURRENT_VERSION,
    config: {
      theme: 'dark',           // 'dark' | 'light' | 'system'
      accent: 'violet',        // 'violet' | 'cyan' | 'emerald' | 'amber' | 'rose' | 'blue'
      fxLevel: 'completo',     // 'completo' | 'reduzido' | 'minimo'
      homeViewMode: 'grid'     // 'grid' | 'list' | 'kanban'
    },
    projects: {},
    inbox: [],
    lastVisitedProjectId: null,
    githubCache: {
      repos: [],
      fetchedAt: null,
      rateLimit: null
    }
  };
}

// ─────────────────────────────────────────────
// VALIDAÇÃO DE ESQUEMA
// ─────────────────────────────────────────────
function isValidState(data) {
  if (typeof data !== 'object' || data === null) return false;
  if (typeof data.version !== 'number') return false;
  if (typeof data.config !== 'object' || data.config === null) return false;
  if (typeof data.projects !== 'object' || data.projects === null) return false;
  return true;
}

function isValidTask(task) {
  return (
    task &&
    typeof task.id === 'string' &&
    typeof task.title === 'string' &&
    typeof task.completed === 'boolean'
  );
}

function isValidInboxItem(item) {
  return (
    item &&
    typeof item.id === 'string' &&
    typeof item.text === 'string' &&
    typeof item.completed === 'boolean'
  );
}

// ─────────────────────────────────────────────
// MIGRAÇÕES VERSIONADAS (passo a passo)
// ─────────────────────────────────────────────
const migrations = {
  2: (state) => {
    state.version = 2;
    state.config = {
      homeViewMode: 'grid',
      ...state.config
    };
    if (!Array.isArray(state.inbox)) {
      state.inbox = [];
    }
    if (state.lastVisitedProjectId === undefined) {
      state.lastVisitedProjectId = null;
    }
    if (state.projects && typeof state.projects === 'object') {
      for (const proj of Object.values(state.projects)) {
        proj.pinned = Boolean(proj.pinned);
        proj.hidden = Boolean(proj.hidden);
        proj.customIcon = proj.customIcon || '';
        proj.customColor = proj.customColor || '';
        proj.lastOpenedAt = proj.lastOpenedAt || null;
        proj.milestones = Array.isArray(proj.milestones) ? proj.milestones : [];
        if (Array.isArray(proj.tasks)) {
          proj.tasks = proj.tasks.map(t => ({
            ...t,
            subtasks: Array.isArray(t.subtasks) ? t.subtasks : [],
            recurrence: t.recurrence || null,
            seriesId: t.seriesId || (t.recurrence ? t.id : null)
          }));
        }
      }
    }
    return state;
  }
};

function migrateState(raw) {
  let state = raw;

  // Executa migrações em sequência, do version atual até o mais recente
  let version = state.version || 0;
  while (version < CURRENT_VERSION) {
    const nextVersion = version + 1;
    if (migrations[nextVersion]) {
      state = migrations[nextVersion](state);
    } else {
      state.version = nextVersion;
    }
    version = state.version;
  }

  return state;
}

// ─────────────────────────────────────────────
// PREENCHIMENTO DE CAMPOS FALTANTES (merge seguro)
// ─────────────────────────────────────────────
function mergeWithDefaults(state) {
  const defaults = createInitialState();

  // Config
  state.config = { ...defaults.config, ...state.config };

  // Inbox
  state.inbox = Array.isArray(state.inbox)
    ? state.inbox.filter(isValidInboxItem)
    : [];

  if (state.lastVisitedProjectId === undefined) {
    state.lastVisitedProjectId = null;
  }

  // Projetos: validar cada um
  if (typeof state.projects !== 'object' || state.projects === null) {
    state.projects = {};
  }
  for (const [id, proj] of Object.entries(state.projects)) {
    const rawTasks = Array.isArray(proj.tasks) ? proj.tasks.filter(isValidTask) : [];
    const normalizedTasks = rawTasks.map(t => ({
      priority: 'normal',
      dueDate: null,
      recurrence: null,
      seriesId: null,
      ...t,
      subtasks: Array.isArray(t.subtasks)
        ? t.subtasks.filter(st => st && typeof st.id === 'string' && typeof st.title === 'string')
        : []
    }));

    state.projects[id] = {
      id: String(id),
      status: 'ideia',
      statusHistory: [],
      coverSeed: 0,
      pinned: false,
      hidden: false,
      customIcon: '',
      customColor: '',
      lastOpenedAt: null,
      isLocalOnly: false,
      note: { content: '', updatedAt: null },
      customLinks: [],
      milestones: [],
      ...proj,
      tasks: normalizedTasks
    };
  }

  // Cache do GitHub
  if (typeof state.githubCache !== 'object' || state.githubCache === null) {
    state.githubCache = defaults.githubCache;
  }

  return state;
}

// ─────────────────────────────────────────────
// LOAD
// ─────────────────────────────────────────────
export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { state: createInitialState(), corrupted: false, migrated: false };
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.warn('[Storage] JSON corrompido detectado — usando estado inicial e fazendo backup do corrompido.');
      backupRaw(raw);
      return { state: createInitialState(), corrupted: true, migrated: false };
    }

    if (!isValidState(parsed)) {
      console.warn('[Storage] Esquema inválido detectado — usando estado inicial.');
      backupRaw(raw);
      return { state: createInitialState(), corrupted: true, migrated: false };
    }

    const wasOlderVersion = parsed.version < CURRENT_VERSION;
    if (wasOlderVersion) {
      backup(); // Backup antes de migrar
    }

    const migrated = migrateState(parsed);
    const merged = mergeWithDefaults(migrated);

    return { state: merged, corrupted: false, migrated: wasOlderVersion };

  } catch (err) {
    console.error('[Storage] Erro inesperado ao carregar estado:', err);
    return { state: createInitialState(), corrupted: false, migrated: false };
  }
}

// ─────────────────────────────────────────────
// SAVE (com debounce e tratamento de quota)
// ─────────────────────────────────────────────
let saveTimer = null;

export function saveState(state) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    _persistState(state);
  }, 300);
}

export function saveStateImmediate(state) {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  _persistState(state);
}

function _persistState(state) {
  try {
    const serialized = JSON.stringify(state);
    localStorage.setItem(STORAGE_KEY, serialized);
  } catch (err) {
    if (err.name === 'QuotaExceededError' || (err.code && err.code === 22)) {
      console.error('[Storage] Quota do localStorage excedida! Tentando liberar espaço do cache do GitHub...');

      // Tenta remover o cache do GitHub primeiro (dados recuperáveis) para liberar espaço
      try {
        const fallbackState = { ...state, githubCache: { repos: [], fetchedAt: null, rateLimit: null } };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(fallbackState));
        console.warn('[Storage] Cache do GitHub removido para liberar quota. Dados pessoais preservados.');

        // Notifica a UI sobre o problema
        document.dispatchEvent(new CustomEvent('storage:quota-exceeded', { bubbles: true }));
      } catch (innerErr) {
        console.error('[Storage] Falha crítica: não foi possível persistir nem com cache removido.', innerErr);
        document.dispatchEvent(new CustomEvent('storage:critical-error', { bubbles: true }));
      }
    } else {
      console.error('[Storage] Erro ao salvar estado:', err);
    }
  }
}

// ─────────────────────────────────────────────
// BACKUP
// ─────────────────────────────────────────────
export function backup() {
  try {
    const current = localStorage.getItem(STORAGE_KEY);
    if (current) {
      localStorage.setItem(BACKUP_KEY, current);
    }
  } catch (err) {
    console.warn('[Storage] Não foi possível criar backup:', err);
  }
}

function backupRaw(rawString) {
  try {
    localStorage.setItem(BACKUP_KEY, rawString);
  } catch {
    // Silencioso
  }
}

// ─────────────────────────────────────────────
// EXPORT / IMPORT JSON
// ─────────────────────────────────────────────
export function exportJSON(state) {
  // Exporta apenas dados pessoais (sem o cache do GitHub)
  const exportData = {
    version: state.version,
    exportedAt: new Date().toISOString(),
    config: state.config,
    projects: state.projects,
    inbox: state.inbox || [],
    lastVisitedProjectId: state.lastVisitedProjectId || null
  };
  return JSON.stringify(exportData, null, 2);
}

export function triggerDownload(jsonString, filename) {
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `painel-backup-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/**
 * Valida e importa um JSON.
 * @param {string} jsonString
 * @param {object} currentState — estado atual (para mesclar projetos)
 * @returns {{ success: boolean, state?: object, error?: string, preview?: object }}
 */
export function importJSON(jsonString, currentState) {
  let parsed;
  try {
    parsed = JSON.parse(jsonString);
  } catch {
    return { success: false, error: 'JSON inválido ou corrompido. Verifique o arquivo.' };
  }

  // Validação básica de esquema
  if (typeof parsed !== 'object' || parsed === null) {
    return { success: false, error: 'Formato do arquivo não reconhecido.' };
  }

  if (typeof parsed.version !== 'number') {
    return { success: false, error: 'Versão do arquivo não reconhecida ou ausente.' };
  }

  if (parsed.version > CURRENT_VERSION) {
    return {
      success: false,
      error: `Arquivo exportado de uma versão mais nova do painel (v${parsed.version}). Atualize o painel para importar.`
    };
  }

  if (typeof parsed.projects !== 'object' || parsed.projects === null) {
    return { success: false, error: 'Estrutura de projetos ausente no arquivo.' };
  }

  // Aplica migrações se necessário
  let migrated;
  try {
    migrated = migrateState({ ...parsed });
  } catch (err) {
    return { success: false, error: `Erro durante a migração do arquivo: ${err.message}` };
  }

  const merged = mergeWithDefaults(migrated);

  // Mescla com estado atual — mantém githubCache atual
  const newState = {
    ...merged,
    githubCache: currentState?.githubCache ?? merged.githubCache // Preserva o cache do GitHub atual
  };

  // Retorna preview antes de confirmar
  const preview = {
    projectCount: Object.keys(merged.projects).length,
    inboxCount: (merged.inbox || []).length,
    exportedAt: parsed.exportedAt || null,
    version: parsed.version
  };

  return { success: true, state: newState, preview };
}

// ─────────────────────────────────────────────
// LIMPEZA
// ─────────────────────────────────────────────
export function clearGitHubCache(currentState) {
  return {
    ...currentState,
    githubCache: {
      repos: [],
      fetchedAt: null,
      rateLimit: null
    }
  };
}
