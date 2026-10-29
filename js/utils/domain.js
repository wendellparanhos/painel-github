/**
 * Domínio Unificado — Funções puras para datas no fuso local, recorrência idempotente,
 * mesclagem de projetos, filtros, ordenação, contagens e paginação.
 *
 * Regra de arquitetura: TODAS as views (Home, Kanban, Project, Inbox, Palette)
 * usam estas mesmas funções para evitar divergência de contagens e critérios.
 */

export const STATUS_ORDER = ['ideia', 'em andamento', 'pausado', 'concluído', 'arquivado'];
export const PRIORITY_WEIGHT = { urgente: 4, alta: 3, normal: 2, baixa: 1 };

// ─────────────────────────────────────────────
// DATAS NO FUSO LOCAL (YYYY-MM-DD)
// ─────────────────────────────────────────────

/**
 * Retorna a data de hoje no fuso local em formato YYYY-MM-DD
 */
export function getTodayLocalISO() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Converte string YYYY-MM-DD para objeto Date à meia-noite no fuso local
 * (evita o bug de new Date('YYYY-MM-DD') interpretar como UTC e voltar 1 dia no Brasil)
 */
export function parseLocalYMD(ymd) {
  if (!ymd || typeof ymd !== 'string') return null;
  const parts = ymd.split('T')[0].split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return null;
  const [y, m, d] = parts;
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

/**
 * Formata YYYY-MM-DD em formato amigável no fuso local (ex.: "Hoje", "Amanhã", "Ontem", "28/10/2026")
 */
export function formatLocalDueDate(ymd) {
  const date = parseLocalYMD(ymd);
  if (!date) return '';

  const today = parseLocalYMD(getTodayLocalISO());
  const diffDays = Math.round((date.getTime() - today.getTime()) / 86400000);

  if (diffDays === 0) return 'Hoje';
  if (diffDays === 1) return 'Amanhã';
  if (diffDays === -1) return 'Ontem';

  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

/**
 * Verifica se uma tarefa aberta está vencida (dueDate < hoje no fuso local)
 */
export function isTaskOverdue(task) {
  if (!task || task.completed || !task.dueDate) return false;
  const today = getTodayLocalISO();
  return task.dueDate < today;
}

/**
 * Verifica se uma tarefa aberta vence nos próximos `days` dias (incluindo hoje)
 */
export function isTaskDueSoon(task, days = 3) {
  if (!task || task.completed || !task.dueDate) return false;
  const due = parseLocalYMD(task.dueDate);
  const today = parseLocalYMD(getTodayLocalISO());
  if (!due || !today) return false;
  const diffDays = Math.round((due.getTime() - today.getTime()) / 86400000);
  return diffDays >= 0 && diffDays <= days;
}

// ─────────────────────────────────────────────
// RECORRÊNCIA PREVISÍVEL E IDEMPOTENTE
// ─────────────────────────────────────────────

/**
 * Calcula a próxima data YYYY-MM-DD para uma tarefa recorrente ('daily' | 'weekly' | 'monthly')
 */
export function computeNextDueDate(baseYMD, recurrence) {
  const baseDate = parseLocalYMD(baseYMD) || parseLocalYMD(getTodayLocalISO());
  const next = new Date(baseDate.getTime());

  if (recurrence === 'daily') {
    next.setDate(next.getDate() + 1);
  } else if (recurrence === 'weekly') {
    next.setDate(next.getDate() + 7);
  } else if (recurrence === 'monthly') {
    next.setMonth(next.getMonth() + 1);
  } else {
    return null;
  }

  const y = next.getFullYear();
  const m = String(next.getMonth() + 1).padStart(2, '0');
  const d = String(next.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Gera a próxima instância de uma tarefa recorrente com ID determinístico (`rec_${seriesId}_${nextDueDate}`).
 * Se já existir na lista `existingTasks`, retorna null (garantindo idempotência total ao recarregar/alternar).
 */
export function buildNextRecurringTask(completedTask, existingTasks = []) {
  if (!completedTask || !completedTask.recurrence) return null;

  const seriesId = completedTask.seriesId || completedTask.id;
  const baseYMD = completedTask.dueDate || getTodayLocalISO();
  const nextDueDate = computeNextDueDate(baseYMD, completedTask.recurrence);
  if (!nextDueDate) return null;

  const deterministicId = `rec_${seriesId}_${nextDueDate}`;

  // Verifica se já existe pela chave determinística ou mesma série + data
  const alreadyExists = existingTasks.some(
    t => t.id === deterministicId || (t.seriesId === seriesId && t.dueDate === nextDueDate && !t.completed)
  );
  if (alreadyExists) return null;

  // Clona subtarefas resetadas para a nova ocorrência
  const resetSubtasks = Array.isArray(completedTask.subtasks)
    ? completedTask.subtasks.map((st, idx) => ({
        id: `${deterministicId}_sub_${idx}`,
        title: st.title,
        completed: false
      }))
    : [];

  return {
    id: deterministicId,
    seriesId,
    title: completedTask.title,
    completed: false,
    priority: completedTask.priority || 'normal',
    dueDate: nextDueDate,
    recurrence: completedTask.recurrence,
    subtasks: resetSubtasks,
    createdAt: new Date().toISOString()
  };
}

// ─────────────────────────────────────────────
// MESCLAGEM UNIFICADA DE PROJETOS (GitHub + Local)
// ─────────────────────────────────────────────

/**
 * Retorna a lista completa de projetos mesclando dados remotos do GitHub e dados pessoais locais.
 */
export function getMergedProjects(state) {
  const githubRepos = state?.githubCache?.repos || [];
  const localProjects = state?.projects || {};
  const items = [];
  const seenIds = new Set();

  for (const repo of githubRepos) {
    const id = String(repo.id);
    seenIds.add(id);
    const local = localProjects[id] || {};
    items.push(_buildMergedItem(id, repo, local, false));
  }

  // Inclui projetos locais que não estão na lista do GitHub (criados localmente ou indisponíveis)
  for (const [id, local] of Object.entries(localProjects)) {
    if (!seenIds.has(id)) {
      items.push(_buildMergedItem(id, null, local, Boolean(local.unavailable && !local.isLocalOnly)));
    }
  }

  return items;
}

function _buildMergedItem(id, repo, local, unavailable) {
  const tasks = Array.isArray(local.tasks) ? local.tasks : [];
  const openTasks = tasks.filter(t => !t.completed);
  const doneTasks = tasks.filter(t => t.completed);
  const overdueTasks = openTasks.filter(isTaskOverdue);
  const dueSoonTasks = openTasks.filter(t => isTaskDueSoon(t, 3));

  // Maior prioridade entre tarefas abertas
  let maxPriorityWeight = 0;
  let nearestDueDate = null;

  for (const t of openTasks) {
    const w = PRIORITY_WEIGHT[t.priority] || 0;
    if (w > maxPriorityWeight) maxPriorityWeight = w;
    if (t.dueDate && (!nearestDueDate || t.dueDate < nearestDueDate)) {
      nearestDueDate = t.dueDate;
    }
  }

  return {
    repoId: id,
    name: local.customName || repo?.name || local.name || `projeto-${id}`,
    description: repo?.description || local.description || '',
    language: repo?.language || null,
    stars: repo?.stargazers_count || 0,
    forks: repo?.forks_count || 0,
    pushedAt: repo?.pushed_at || local.updatedAt || null,
    createdAt: repo?.created_at || local.createdAt || null,
    htmlUrl: repo?.html_url || null,
    homepage: repo?.homepage || null,
    fullName: repo?.full_name || null,
    // Dados pessoais
    status: local.status || 'ideia',
    statusHistory: Array.isArray(local.statusHistory) ? local.statusHistory : [],
    coverSeed: local.coverSeed || 0,
    pinned: Boolean(local.pinned),
    hidden: Boolean(local.hidden),
    customIcon: local.customIcon || '',
    customColor: local.customColor || '',
    lastOpenedAt: local.lastOpenedAt || null,
    isLocalOnly: Boolean(local.isLocalOnly),
    unavailable: unavailable,
    tasks,
    openTasksCount: openTasks.length,
    doneTasksCount: doneTasks.length,
    overdueTasksCount: overdueTasks.length,
    dueSoonTasksCount: dueSoonTasks.length,
    maxPriorityWeight,
    nearestDueDate,
    note: local.note || { content: '', updatedAt: null },
    milestones: Array.isArray(local.milestones) ? local.milestones : []
  };
}

// ─────────────────────────────────────────────
// FILTRAGEM E ORDENAÇÃO UNIFICADA DE PROJETOS
// ─────────────────────────────────────────────

/**
 * Filtra e ordena projetos usando critérios consistentes em todas as telas.
 * @param {Array} projects — saída de getMergedProjects(state)
 * @param {object} filters
 * @param {string} [filters.search='']
 * @param {string} [filters.status='todos']
 * @param {string} [filters.priority='todas'] — 'todas' | 'urgente' | 'alta' | 'normal' | 'baixa'
 * @param {string} [filters.dueFilter='todos'] — 'todos' | 'overdue' | 'due-soon' | 'with-due'
 * @param {string} [filters.special='ativos'] — 'ativos' | 'pinned' | 'overdue' | 'hidden' | 'todos'
 * @param {string} [filters.repoId='todos']
 * @param {string} [filters.sort='updated'] — 'updated' | 'name' | 'status' | 'stars' | 'priority' | 'due'
 */
export function filterAndSortProjects(projects, filters = {}) {
  const {
    search = '',
    status = 'todos',
    priority = 'todas',
    dueFilter = 'todos',
    special = 'ativos',
    repoId = 'todos',
    sort = 'updated'
  } = filters;

  let result = projects.filter(item => {
    // Ocultos só aparecem se special === 'hidden' ou 'todos'
    if (special === 'hidden') {
      if (!item.hidden) return false;
    } else if (special !== 'todos') {
      if (item.hidden) return false;
    }

    if (special === 'pinned' && !item.pinned) return false;
    if (special === 'overdue' && item.overdueTasksCount === 0) return false;

    if (repoId !== 'todos' && item.repoId !== String(repoId)) return false;

    if (status !== 'todos' && item.status !== status) return false;

    if (priority !== 'todas') {
      const hasPriority = item.tasks.some(t => !t.completed && t.priority === priority);
      if (!hasPriority) return false;
    }

    if (dueFilter === 'overdue' && item.overdueTasksCount === 0) return false;
    if (dueFilter === 'due-soon' && item.dueSoonTasksCount === 0 && item.overdueTasksCount === 0) return false;
    if (dueFilter === 'with-due' && !item.nearestDueDate) return false;

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const matchName = item.name.toLowerCase().includes(q);
      const matchDesc = item.description.toLowerCase().includes(q);
      const matchLang = (item.language || '').toLowerCase().includes(q);
      const matchTask = item.tasks.some(t => t.title.toLowerCase().includes(q));
      if (!matchName && !matchDesc && !matchLang && !matchTask) return false;
    }

    return true;
  });

  // Ordenação: projetos fixados (pinned) sempre têm prioridade no topo, seguidos pelo critério escolhido
  result.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;

    if (sort === 'name') return a.name.localeCompare(b.name, 'pt-BR');
    if (sort === 'status') {
      return STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status);
    }
    if (sort === 'stars') return b.stars - a.stars;
    if (sort === 'priority') {
      if (b.maxPriorityWeight !== a.maxPriorityWeight) {
        return b.maxPriorityWeight - a.maxPriorityWeight;
      }
    }
    if (sort === 'due') {
      if (a.nearestDueDate && b.nearestDueDate) return a.nearestDueDate.localeCompare(b.nearestDueDate);
      if (a.nearestDueDate) return -1;
      if (b.nearestDueDate) return 1;
    }

    const da = a.pushedAt ? new Date(a.pushedAt).getTime() : 0;
    const db = b.pushedAt ? new Date(b.pushedAt).getTime() : 0;
    return db - da;
  });

  return result;
}

// ─────────────────────────────────────────────
// MÉTRICAS GLOBAIS E SEÇÕES DA HOME
// ─────────────────────────────────────────────

export function computeGlobalMetrics(state) {
  const merged = getMergedProjects(state).filter(p => !p.hidden);
  const totalProjects = merged.length;
  const inProgress = merged.filter(p => p.status === 'em andamento').length;
  const completed = merged.filter(p => p.status === 'concluído').length;
  const openTasks = merged.reduce((acc, p) => acc + p.openTasksCount, 0);
  const overdueTasks = merged.reduce((acc, p) => acc + p.overdueTasksCount, 0);
  const inboxPending = (state?.inbox || []).filter(i => !i.completed).length;

  return {
    totalProjects,
    inProgress,
    completed,
    openTasks,
    overdueTasks,
    inboxPending
  };
}

/**
 * Retorna o projeto para a seção "Continue de onde parou"
 */
export function getContinueProject(state) {
  const merged = getMergedProjects(state).filter(p => !p.hidden);
  if (merged.length === 0) return null;

  if (state?.lastVisitedProjectId) {
    const found = merged.find(p => p.repoId === String(state.lastVisitedProjectId));
    if (found) return found;
  }

  // Fallback: projeto com lastOpenedAt mais recente ou em andamento com tarefa aberta
  const withOpened = merged.filter(p => p.lastOpenedAt).sort((a, b) => b.lastOpenedAt.localeCompare(a.lastOpenedAt));
  if (withOpened.length > 0) return withOpened[0];

  const active = merged.find(p => p.status === 'em andamento');
  return active || null;
}

/**
 * Retorna tarefas "Em foco" (vencidas, com prazo próximo ou prioridade alta/urgente)
 */
export function getFocusTasks(state, limit = 8) {
  const merged = getMergedProjects(state).filter(p => !p.hidden);
  const focusList = [];

  for (const proj of merged) {
    for (const task of proj.tasks) {
      if (task.completed) continue;
      const overdue = isTaskOverdue(task);
      const dueSoon = isTaskDueSoon(task, 3);
      const highPrio = task.priority === 'urgente' || task.priority === 'alta';

      if (overdue || dueSoon || highPrio) {
        focusList.push({
          task,
          repoId: proj.repoId,
          projectName: proj.name,
          projectIcon: proj.customIcon,
          overdue,
          dueSoon,
          priorityWeight: PRIORITY_WEIGHT[task.priority] || 1
        });
      }
    }
  }

  // Ordena: vencidas primeiro -> prazo mais próximo -> maior prioridade
  focusList.sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    if (a.task.dueDate && b.task.dueDate && a.task.dueDate !== b.task.dueDate) {
      return a.task.dueDate.localeCompare(b.task.dueDate);
    }
    if (a.task.dueDate && !b.task.dueDate) return -1;
    if (!a.task.dueDate && b.task.dueDate) return 1;
    return b.priorityWeight - a.priorityWeight;
  });

  return focusList.slice(0, limit);
}

// ─────────────────────────────────────────────
// PAGINAÇÃO LEVE PARA GRANDES LISTAS (>200 ITENS)
// ─────────────────────────────────────────────

export const SAFE_RENDER_LIMIT = 150;

export function paginateItems(items, page = 1, pageSize = SAFE_RENDER_LIMIT) {
  const total = items.length;
  const visibleCount = page * pageSize;
  return {
    visibleItems: items.slice(0, visibleCount),
    hasMore: total > visibleCount,
    remaining: Math.max(0, total - visibleCount),
    total
  };
}
