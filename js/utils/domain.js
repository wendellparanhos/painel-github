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
  const repoTechMap = state?.githubCache?.repoTech || {};
  const localProjects = state?.projects || {};
  const items = [];
  const seenIds = new Set();

  for (const repo of githubRepos) {
    const id = String(repo.id);
    seenIds.add(id);
    const local = localProjects[id] || {};
    items.push(_buildMergedItem(id, repo, local, false, repoTechMap[id] || null));
  }

  // Inclui projetos locais que não estão na lista do GitHub (criados localmente ou indisponíveis)
  for (const [id, local] of Object.entries(localProjects)) {
    if (!seenIds.has(id)) {
      items.push(_buildMergedItem(id, null, local, Boolean(local.unavailable && !local.isLocalOnly), repoTechMap[id] || null));
    }
  }

  return items;
}

function _buildMergedItem(id, repo, local, unavailable, techEntry = null) {
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

  const licenseName = repo?.license
    ? (repo.license.spdx_id && repo.license.spdx_id !== 'NOASSERTION'
        ? repo.license.spdx_id
        : (repo.license.name || repo.license.key || 'Licença declarada'))
    : (local.license || null);
  const hasLicenseKnown = Boolean(repo && !local.isLocalOnly && !unavailable);

  // Calcula a última atividade conhecida (push remoto ou ação significativa local)
  const candidateDates = [
    repo?.pushed_at,
    local.updatedAt,
    local.note?.updatedAt,
    ...(Array.isArray(local.statusHistory) ? local.statusHistory.map(s => s.timestamp) : []),
    ...tasks.map(t => t.completedAt || t.createdAt)
  ].filter(Boolean);

  let lastActivityAt = repo?.pushed_at || local.updatedAt || null;
  let maxActivityMs = 0;
  for (const dStr of candidateDates) {
    const ms = new Date(dStr).getTime();
    if (!isNaN(ms) && ms > maxActivityMs) {
      maxActivityMs = ms;
      lastActivityAt = dStr;
    }
  }

  const baseItem = {
    repoId: id,
    name: local.customName || repo?.name || local.name || `projeto-${id}`,
    description: repo?.description || local.description || '',
    language: repo?.language || local.language || null,
    topics: Array.isArray(repo?.topics) ? repo.topics : (Array.isArray(local.topics) ? local.topics : []),
    stars: repo?.stargazers_count || 0,
    forks: repo?.forks_count || 0,
    pushedAt: repo?.pushed_at || local.updatedAt || null,
    lastActivityAt,
    createdAt: repo?.created_at || local.createdAt || null,
    htmlUrl: repo?.html_url || null,
    homepage: repo?.homepage || null,
    fullName: repo?.full_name || null,
    license: licenseName,
    hasLicenseKnown,
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
    exemptFromAbandonment: Boolean(local.exemptFromAbandonment),
    abandonmentIgnored: Boolean(local.abandonmentIgnored),
    abandonmentSnoozedUntil: local.abandonmentSnoozedUntil || null,
    aiSummary: local.aiSummary || null,
    tech: techEntry || null,
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

  baseItem.health = computeProjectHealth(baseItem, techEntry);
  return baseItem;
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
    if (sort === 'health') {
      const ha = a.health?.isComparable ? (a.health.score ?? -1) : -1;
      const hb = b.health?.isComparable ? (b.health.score ?? -1) : -1;
      if (hb !== ha) return hb - ha;
    }
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

// ─────────────────────────────────────────────
// FASE 3: ANALÍTICOS E DADOS PARA GRÁFICOS, ANÉIS, AURORA E HEATMAP
// ─────────────────────────────────────────────

/**
 * Calcula o status dominante entre os projetos visíveis (para Aurora Reativa).
 */
export function computeDominantStatus(state) {
  const merged = getMergedProjects(state).filter(p => !p.hidden);
  if (merged.length === 0) return 'em andamento';

  const counts = {};
  for (const st of STATUS_ORDER) counts[st] = 0;
  for (const p of merged) {
    counts[p.status] = (counts[p.status] || 0) + 1;
  }

  // Prioriza status ativos em caso de empate
  let bestStatus = 'em andamento';
  let bestCount = -1;
  for (const st of ['em andamento', 'ideia', 'concluído', 'pausado', 'arquivado']) {
    if ((counts[st] || 0) > bestCount) {
      bestCount = counts[st] || 0;
      bestStatus = st;
    }
  }
  return bestStatus;
}

/**
 * Distribuição de projetos por status (Donut Chart + legenda acessível).
 */
export function computeStatusDistribution(state) {
  const merged = getMergedProjects(state).filter(p => !p.hidden);
  const total = merged.length;
  const map = new Map();
  for (const st of STATUS_ORDER) map.set(st, 0);

  for (const p of merged) {
    map.set(p.status, (map.get(p.status) || 0) + 1);
  }

  const slices = STATUS_ORDER.map(st => {
    const count = map.get(st) || 0;
    return {
      status: st,
      count,
      percentage: total > 0 ? Math.round((count / total) * 100) : 0
    };
  });

  return { total, slices };
}

/**
 * Distribuição de linguagens principais (Barra de Linguagens Empilhada SVG).
 */
export function computeLanguageDistribution(state) {
  const merged = getMergedProjects(state).filter(p => !p.hidden && p.language);
  const total = merged.length;
  const counts = new Map();

  for (const p of merged) {
    counts.set(p.language, (counts.get(p.language) || 0) + 1);
  }

  const items = Array.from(counts.entries())
    .map(([language, count]) => ({
      language,
      count,
      percentage: total > 0 ? +((count / total) * 100).toFixed(1) : 0
    }))
    .sort((a, b) => b.count - a.count);

  return { totalWithLang: total, items };
}

/**
 * Processa os eventos públicos cacheados do GitHub para gerar:
 *   - Heatmap 2D (últimas 16 semanas = 112 dias no fuso local)
 *   - Commits por semana (últimas 8 semanas)
 *   - Sparklines por repositório (somente quando há amostra suficiente: >= 2 semanas ativas ou >= 2 pushes)
 *   - Commits registrados hoje
 * Regra crítica: se não houver eventos carregados (`!eventsFetchedAt`), retorna `available: false`
 * para que a UI exiba estado `"Indisponível"` e NUNCA zeros falsos.
 */
export function computePublicEventsAnalytics(githubCache) {
  const hasEventsCache = Boolean(githubCache?.eventsFetchedAt && Array.isArray(githubCache?.events));
  const events = hasEventsCache ? githubCache.events : [];

  const todayISO = getTodayLocalISO();
  const todayDate = parseLocalYMD(todayISO);

  // Gera grade dos últimos 112 dias (16 semanas) no fuso local
  const totalDays = 112;
  const dayMap = new Map();
  const heatmapDays = [];

  for (let i = totalDays - 1; i >= 0; i--) {
    const d = new Date(todayDate.getTime());
    d.setDate(d.getDate() - i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const ymd = `${y}-${m}-${day}`;
    const cell = {
      date: ymd,
      dayOfWeek: d.getDay(),
      count: hasEventsCache ? 0 : null, // null quando indisponível (nunca zero falso!)
      commits: hasEventsCache ? 0 : null,
      available: hasEventsCache
    };
    dayMap.set(ymd, cell);
    heatmapDays.push(cell);
  }

  // Últimas 8 semanas para o gráfico de commits por semana e sparklines por repo
  const weekBuckets = Array.from({ length: 8 }, (_, idx) => {
    const endOffset = (7 - idx) * 7;
    const startOffset = endOffset + 6;
    const startD = new Date(todayDate.getTime());
    startD.setDate(startD.getDate() - startOffset);
    const endD = new Date(todayDate.getTime());
    endD.setDate(endD.getDate() - endOffset);
    const label = `${String(startD.getDate()).padStart(2, '0')}/${String(startD.getMonth() + 1).padStart(2, '0')}`;
    return {
      index: idx,
      label,
      commits: hasEventsCache ? 0 : null,
      events: hasEventsCache ? 0 : null
    };
  });

  // Mapa repoId / repoName -> array de 8 semanas
  const repoWeeksMap = new Map();
  let commitsToday = hasEventsCache ? 0 : null;
  let totalEventsInWindow = 0;
  let totalCommitsInWindow = 0;

  if (hasEventsCache) {
    for (const ev of events) {
      if (!ev?.created_at) continue;
      const evDate = new Date(ev.created_at);
      if (isNaN(evDate.getTime())) continue;

      const y = evDate.getFullYear();
      const m = String(evDate.getMonth() + 1).padStart(2, '0');
      const d = String(evDate.getDate()).padStart(2, '0');
      const ymd = `${y}-${m}-${d}`;

      const commitWeight = ev.type === 'PushEvent' ? Math.max(1, Number(ev.commitsCount) || 1) : 0;

      if (ymd === todayISO) {
        commitsToday += commitWeight;
      }

      if (dayMap.has(ymd)) {
        const cell = dayMap.get(ymd);
        cell.count += 1;
        cell.commits += commitWeight;
        totalEventsInWindow += 1;
        totalCommitsInWindow += commitWeight;
      }

      // Calcula qual das 8 semanas (0..7)
      const localDay = parseLocalYMD(ymd);
      if (localDay) {
        const diffDays = Math.floor((todayDate.getTime() - localDay.getTime()) / 86400000);
        if (diffDays >= 0 && diffDays < 56) {
          const weekIdx = 7 - Math.floor(diffDays / 7);
          if (weekIdx >= 0 && weekIdx < 8) {
            weekBuckets[weekIdx].events += 1;
            weekBuckets[weekIdx].commits += commitWeight;

            if (ev.repo) {
              const keys = [String(ev.repo.id || ''), String(ev.repo.name || '')].filter(Boolean);
              for (const k of keys) {
                if (!repoWeeksMap.has(k)) {
                  repoWeeksMap.set(k, { weeks: [0, 0, 0, 0, 0, 0, 0, 0], totalPushes: 0 });
                }
                const entry = repoWeeksMap.get(k);
                entry.weeks[weekIdx] += commitWeight > 0 ? commitWeight : 1;
                if (ev.type === 'PushEvent') entry.totalPushes += 1;
              }
            }
          }
        }
      }
    }
  }

  // Converte repoWeeksMap avaliando critério de amostra suficiente
  const repoSparklines = {};
  for (const [k, val] of repoWeeksMap.entries()) {
    const activeWeeksCount = val.weeks.filter(v => v > 0).length;
    const totalActivity = val.weeks.reduce((a, b) => a + b, 0);
    // Exige amostra suficiente: pelo menos 2 semanas distintas com atividade ou >= 2 pushes registrados
    const hasSufficientSample = activeWeeksCount >= 2 || val.totalPushes >= 2 || totalActivity >= 3;
    repoSparklines[k] = {
      weeks: val.weeks,
      activeWeeksCount,
      totalActivity,
      hasSufficientSample
    };
  }

  return {
    available: hasEventsCache,
    fetchedAt: githubCache?.eventsFetchedAt || null,
    commitsToday,
    totalEventsInWindow,
    totalCommitsInWindow,
    heatmapDays,
    weeklyCommits: weekBuckets,
    repoSparklines
  };
}

/**
 * Calcula os dados dos 3 Anéis estilo Apple Watch:
 *   1. Tarefas do dia (concluídas hoje vs meta/planejadas para hoje)
 *   2. Commits do dia (via eventos públicos do GitHub em cache; estado indisponível se não consultado)
 *   3. Foco (aparece explicitamente vazio até a Fase 4, sem inventar valores)
 */
export function computeDailyRingsData(state) {
  const merged = getMergedProjects(state).filter(p => !p.hidden);
  const todayISO = getTodayLocalISO();

  let completedToday = 0;
  let dueTodayOpen = 0;

  for (const proj of merged) {
    for (const t of proj.tasks) {
      if (t.completed && t.completedAt) {
        const compDate = new Date(t.completedAt);
        if (!isNaN(compDate.getTime())) {
          const y = compDate.getFullYear();
          const m = String(compDate.getMonth() + 1).padStart(2, '0');
          const d = String(compDate.getDate()).padStart(2, '0');
          if (`${y}-${m}-${d}` === todayISO) {
            completedToday++;
          }
        }
      } else if (!t.completed && t.dueDate === todayISO) {
        dueTodayOpen++;
      }
    }
  }

  // Também contabiliza itens da Inbox concluídos hoje
  for (const item of (state?.inbox || [])) {
    if (item.completed) {
      completedToday += 0; // Mantém anel focado em tarefas de projetos
    }
  }

  const tasksGoal = Math.max(3, completedToday + dueTodayOpen);
  const eventsStats = computePublicEventsAnalytics(state?.githubCache);
  const commitsAvailable = eventsStats.available;
  const commitsToday = commitsAvailable ? (eventsStats.commitsToday || 0) : null;
  const commitsGoal = 5;

  const focusStats = computeFocusStats(state);
  const focusGoal = Math.max(10, Number(state?.config?.dailyFocusGoalMinutes) || 50);
  const focusMinutesToday = focusStats.minutesToday;

  return {
    tasksRing: {
      label: 'Tarefas do dia',
      value: completedToday,
      goal: tasksGoal,
      progress: Math.min(1, completedToday / tasksGoal),
      available: true,
      summary: `${completedToday} de ${tasksGoal} tarefas hoje`
    },
    commitsRing: {
      label: 'Commits do dia',
      value: commitsToday,
      goal: commitsGoal,
      progress: commitsAvailable ? Math.min(1, commitsToday / commitsGoal) : 0,
      available: commitsAvailable,
      summary: commitsAvailable ? `${commitsToday} commit(s) público(s) hoje` : 'Indisponível (sem cache de eventos)'
    },
    focusRing: {
      label: 'Foco (Pomodoro)',
      value: focusMinutesToday,
      goal: focusGoal,
      progress: Math.min(1, focusMinutesToday / focusGoal),
      available: true,
      phase4Placeholder: false,
      summary: `${focusMinutesToday} de ${focusGoal} min de foco hoje`
    }
  };
}

// ─────────────────────────────────────────────
// FASE 4: FOCO (POMODORO), ESTATÍSTICAS E GAMIFICAÇÃO
// ─────────────────────────────────────────────

export const XP_REWARDS = {
  TASK_COMPLETE: 15,
  FOCUS_COMPLETE: 25,
  PROJECT_COMPLETE: 100
};

export const XP_PER_LEVEL = 100;

/**
 * Calcula estatísticas reais de sessões de foco por dia, semana, projeto e tarefa.
 */
export function computeFocusStats(state) {
  const sessions = Array.isArray(state?.focus?.sessions) ? state.focus.sessions : [];
  const projects = getMergedProjects(state);
  const projectMap = new Map(projects.map(p => [String(p.repoId), p]));

  const todayISO = getTodayLocalISO();
  const todayDate = parseLocalYMD(todayISO);

  let minutesToday = 0;
  let sessionsTodayCount = 0;
  let minutesThisWeek = 0;
  let sessionsThisWeekCount = 0;
  let totalFocusMinutes = 0;
  let totalSessionsCount = 0;

  const byProjectMap = new Map();
  const byTaskMap = new Map();

  for (const s of sessions) {
    if (!s || (s.mode && s.mode !== 'focus')) continue;
    const mins = Math.max(0, Number(s.durationMinutes) || 0);
    if (mins <= 0) continue;

    const dateKey = s.dateKey || (s.completedAt ? _isoToLocalYMD(s.completedAt) : todayISO);
    totalFocusMinutes += mins;
    totalSessionsCount += 1;

    if (dateKey === todayISO) {
      minutesToday += mins;
      sessionsTodayCount += 1;
    }

    const sDate = parseLocalYMD(dateKey);
    if (sDate && todayDate) {
      const diffDays = Math.round((todayDate.getTime() - sDate.getTime()) / 86400000);
      if (diffDays >= 0 && diffDays < 7) {
        minutesThisWeek += mins;
        sessionsThisWeekCount += 1;
      }
    }

    const repoId = s.repoId ? String(s.repoId) : 'geral';
    const proj = projectMap.get(repoId);
    const projectName = proj ? proj.name : (repoId === 'geral' ? 'Foco Livre (Sem projeto)' : `Projeto #${repoId}`);

    if (!byProjectMap.has(repoId)) {
      byProjectMap.set(repoId, { repoId, projectName, minutes: 0, sessionsCount: 0 });
    }
    const pEntry = byProjectMap.get(repoId);
    pEntry.minutes += mins;
    pEntry.sessionsCount += 1;

    if (s.taskId) {
      const taskKey = `${repoId}:${s.taskId}`;
      const taskObj = proj?.tasks?.find(t => t.id === s.taskId);
      const taskTitle = s.taskTitle || taskObj?.title || 'Tarefa';
      if (!byTaskMap.has(taskKey)) {
        byTaskMap.set(taskKey, {
          taskId: s.taskId,
          repoId,
          taskTitle,
          projectName,
          minutes: 0,
          sessionsCount: 0
        });
      }
      const tEntry = byTaskMap.get(taskKey);
      tEntry.minutes += mins;
      tEntry.sessionsCount += 1;
    }
  }

  return {
    minutesToday,
    sessionsTodayCount,
    minutesThisWeek,
    sessionsThisWeekCount,
    totalFocusMinutes,
    totalSessionsCount,
    byProject: Array.from(byProjectMap.values()).sort((a, b) => b.minutes - a.minutes),
    byTask: Array.from(byTaskMap.values()).sort((a, b) => b.minutes - a.minutes)
  };
}

function _isoToLocalYMD(isoString) {
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return getTodayLocalISO();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Calcula nível, título e progresso da barra de XP a partir do XP total.
 */
export function computeLevelInfo(xp = 0) {
  const safeXp = Math.max(0, Math.floor(Number(xp) || 0));
  const level = Math.floor(safeXp / XP_PER_LEVEL) + 1;
  const currentLevelXp = safeXp % XP_PER_LEVEL;
  const nextLevelXp = XP_PER_LEVEL;
  const progress = Math.min(1, currentLevelXp / nextLevelXp);

  const titles = [
    'Explorador de Código',
    'Construtor Consistente',
    'Artesão de Projetos',
    'Guardião do Foco',
    'Arquiteto de Sistemas',
    'Mestre de Entregas',
    'Lenda do GitHub'
  ];
  const title = titles[Math.min(titles.length - 1, level - 1)];

  return {
    xp: safeXp,
    level,
    title,
    currentLevelXp,
    nextLevelXp,
    progress,
    xpToNextLevel: nextLevelXp - currentLevelXp
  };
}

/**
 * Retorna informações do fuso horário local declarado para documentação transparente do streak.
 */
export function getDeclaredTimezoneInfo() {
  let tzName = 'Local';
  try {
    tzName = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local';
  } catch {
    tzName = 'Local';
  }
  const offsetMin = new Date().getTimezoneOffset();
  const sign = offsetMin <= 0 ? '+' : '-';
  const absMin = Math.abs(offsetMin);
  const hh = String(Math.floor(absMin / 60)).padStart(2, '0');
  const mm = String(absMin % 60).padStart(2, '0');
  return {
    timeZone: tzName,
    offsetMinutes: offsetMin,
    utcLabel: `UTC${sign}${hh}:${mm}`
  };
}

/**
 * Atualiza o estado de streak ao registrar uma ação significativa no dia local `activityDateISO`.
 * Regra documentada:
 *   - Chave única de dia local: YYYY-MM-DD (`getTodayLocalISO()`).
 *   - Nunca recalcula silenciosamente o histórico passado se o usuário mudar de fuso horário.
 *   - Se o fuso mudou (`timezoneOffset !== prevOffset`), tolera diferença de até 2 dias sem quebrar o streak.
 */
export function evaluateStreakOnActivity(streakState = {}, activityDateISO = getTodayLocalISO(), currentOffsetMin = new Date().getTimezoneOffset()) {
  const prevCurrent = Math.max(0, Number(streakState.current) || 0);
  const prevLongest = Math.max(0, Number(streakState.longest) || 0);
  const lastActiveDate = streakState.lastActiveDate || null;
  const prevOffset = typeof streakState.timezoneOffset === 'number' ? streakState.timezoneOffset : currentOffsetMin;
  const activeDatesSet = new Set(Array.isArray(streakState.activeDates) ? streakState.activeDates : []);

  activeDatesSet.add(activityDateISO);
  const activeDates = Array.from(activeDatesSet).sort().slice(-365);

  const tzChanged = prevOffset !== currentOffsetMin;
  let nextCurrent = prevCurrent;

  if (!lastActiveDate) {
    nextCurrent = 1;
  } else if (lastActiveDate === activityDateISO) {
    nextCurrent = Math.max(1, prevCurrent);
  } else {
    const lastD = parseLocalYMD(lastActiveDate);
    const currD = parseLocalYMD(activityDateISO);
    if (!lastD || !currD) {
      nextCurrent = 1;
    } else {
      const diffDays = Math.round((currD.getTime() - lastD.getTime()) / 86400000);
      if (diffDays === 1) {
        nextCurrent = prevCurrent + 1;
      } else if (diffDays <= 0) {
        // Mudança de fuso/horário para trás: preserva o streak atual sem recalcular histórico
        nextCurrent = Math.max(1, prevCurrent);
      } else if (tzChanged && diffDays <= 2) {
        // Mudança de fuso em viagem (até 2 dias de diferença nominal): preserva e incrementa
        nextCurrent = prevCurrent + 1;
      } else {
        nextCurrent = 1;
      }
    }
  }

  const nextLongest = Math.max(prevLongest, nextCurrent);

  return {
    current: nextCurrent,
    longest: nextLongest,
    lastActiveDate: activityDateISO,
    timezoneOffset: currentOffsetMin,
    lastTimezoneShiftAt: tzChanged ? new Date().toISOString() : (streakState.lastTimezoneShiftAt || null),
    activeDates
  };
}

/**
 * Lê o status atual do streak para exibição na UI e reação do mascote (sem mutar histórico).
 */
export function computeStreakStatus(state) {
  const streak = state?.gamification?.streak || {};
  const todayISO = getTodayLocalISO();
  const lastActiveDate = streak.lastActiveDate || null;
  const rawCurrent = Math.max(0, Number(streak.current) || 0);
  const longest = Math.max(0, Number(streak.longest) || 0);
  const activeDates = Array.isArray(streak.activeDates) ? streak.activeDates : [];

  let daysSinceLastActive = null;
  let activeToday = false;
  let effectiveCurrent = 0;

  if (lastActiveDate) {
    const lastD = parseLocalYMD(lastActiveDate);
    const todayD = parseLocalYMD(todayISO);
    if (lastD && todayD) {
      daysSinceLastActive = Math.max(0, Math.round((todayD.getTime() - lastD.getTime()) / 86400000));
      activeToday = daysSinceLastActive === 0;
      effectiveCurrent = daysSinceLastActive <= 1 ? rawCurrent : 0;
    }
  }

  return {
    current: effectiveCurrent,
    storedCurrent: rawCurrent,
    longest,
    lastActiveDate,
    activeToday,
    daysSinceLastActive,
    activeDates,
    timezone: getDeclaredTimezoneInfo()
  };
}

/**
 * Calcula progresso das metas semanais configuráveis (últimos 7 dias locais incluindo hoje).
 */
export function computeWeeklyGoalsProgress(state) {
  const todayISO = getTodayLocalISO();
  const todayDate = parseLocalYMD(todayISO);
  const merged = getMergedProjects(state);

  let tasksCompletedWeek = 0;
  const tasksPerDayMap = new Map();

  for (const proj of merged) {
    for (const t of proj.tasks) {
      if (t.completed && t.completedAt) {
        const ymd = _isoToLocalYMD(t.completedAt);
        tasksPerDayMap.set(ymd, (tasksPerDayMap.get(ymd) || 0) + 1);
        const d = parseLocalYMD(ymd);
        if (d && todayDate) {
          const diff = Math.round((todayDate.getTime() - d.getTime()) / 86400000);
          if (diff >= 0 && diff < 7) {
            tasksCompletedWeek += 1;
          }
        }
      }
    }
  }

  const maxTasksInSingleDay = tasksPerDayMap.size > 0
    ? Math.max(...Array.from(tasksPerDayMap.values()))
    : 0;

  const focusStats = computeFocusStats(state);
  const weeklyTasksGoal = Math.max(1, Number(state?.config?.weeklyTasksGoal) || 10);
  const weeklyFocusGoalMinutes = Math.max(15, Number(state?.config?.weeklyFocusGoalMinutes) || 120);

  return {
    tasksCompletedWeek,
    weeklyTasksGoal,
    tasksProgress: Math.min(1, tasksCompletedWeek / weeklyTasksGoal),
    focusMinutesWeek: focusStats.minutesThisWeek,
    weeklyFocusGoalMinutes,
    focusProgress: Math.min(1, focusStats.minutesThisWeek / weeklyFocusGoalMinutes),
    maxTasksInSingleDay,
    tasksToday: tasksPerDayMap.get(todayISO) || 0
  };
}

/**
 * Catálogo de Conquistas (Badges) da Fase 4.
 */
export const ACHIEVEMENTS_CATALOG = [
  {
    id: 'first_task',
    title: 'Primeira Entrega',
    description: 'Conclua sua primeira tarefa em qualquer projeto.',
    icon: '✅',
    category: 'Tarefas'
  },
  {
    id: 'ten_tasks_day',
    title: 'Imparável (10 no Dia)',
    description: 'Conclua 10 tarefas em um único dia local.',
    icon: '⚡',
    category: 'Tarefas'
  },
  {
    id: 'first_focus',
    title: 'Foco Iniciado',
    description: 'Complete sua primeira sessão de foco Pomodoro.',
    icon: '🍅',
    category: 'Foco'
  },
  {
    id: 'focus_marathon',
    title: 'Maratona de Foco (120 min)',
    description: 'Acumule 120 minutos de sessões de foco concluídas.',
    icon: '🧘',
    category: 'Foco'
  },
  {
    id: 'streak_3',
    title: 'Ritmo Constante (3 Dias)',
    description: 'Mantenha 3 dias seguidos de atividade significativa.',
    icon: '🔥',
    category: 'Consistência'
  },
  {
    id: 'streak_7',
    title: 'Semana Imbatível (7 Dias)',
    description: 'Alcançe uma sequência de 7 dias seguidos de atividade.',
    icon: '👑',
    category: 'Consistência'
  },
  {
    id: 'first_project_done',
    title: 'Projeto Concluído!',
    description: 'Mude o status de um projeto para "concluído" pela primeira vez.',
    icon: '🚀',
    category: 'Projetos'
  },
  {
    id: 'three_projects_done',
    title: 'Portfólio de Elite',
    description: 'Tenha 3 projetos com status "concluído".',
    icon: '🏆',
    category: 'Projetos'
  }
];

/**
 * Avalia todas as conquistas com base no estado atual e retorna lista detalhada + novas desbloqueadas.
 */
export function evaluateAchievements(state) {
  const unlockedMap = state?.gamification?.unlockedAchievements || {};
  const merged = getMergedProjects(state);
  const totalDoneTasks = merged.reduce((acc, p) => acc + p.doneTasksCount, 0);
  const completedProjectsCount = merged.filter(p => p.status === 'concluído').length;
  const focusStats = computeFocusStats(state);
  const weeklyStats = computeWeeklyGoalsProgress(state);
  const streakStatus = computeStreakStatus(state);
  const bestStreak = Math.max(streakStatus.current, streakStatus.longest);

  const progressByBadge = {
    first_task: { current: Math.min(1, totalDoneTasks), target: 1 },
    ten_tasks_day: { current: Math.min(10, weeklyStats.maxTasksInSingleDay), target: 10 },
    first_focus: { current: Math.min(1, focusStats.totalSessionsCount), target: 1 },
    focus_marathon: { current: Math.min(120, focusStats.totalFocusMinutes), target: 120 },
    streak_3: { current: Math.min(3, bestStreak), target: 3 },
    streak_7: { current: Math.min(7, bestStreak), target: 7 },
    first_project_done: { current: Math.min(1, completedProjectsCount), target: 1 },
    three_projects_done: { current: Math.min(3, completedProjectsCount), target: 3 }
  };

  const newlyUnlockedIds = [];
  const items = ACHIEVEMENTS_CATALOG.map(badge => {
    const prog = progressByBadge[badge.id] || { current: 0, target: 1 };
    const meetsCriteria = prog.current >= prog.target;
    const alreadyUnlockedAt = unlockedMap[badge.id] || null;
    if (meetsCriteria && !alreadyUnlockedAt) {
      newlyUnlockedIds.push(badge.id);
    }
    return {
      ...badge,
      unlocked: Boolean(alreadyUnlockedAt || meetsCriteria),
      unlockedAt: alreadyUnlockedAt,
      current: prog.current,
      target: prog.target,
      progress: Math.min(1, prog.current / prog.target)
    };
  });

  return {
    items,
    newlyUnlockedIds,
    unlockedCount: items.filter(i => i.unlocked).length,
    totalCount: items.length
  };
}

// ─────────────────────────────────────────────
// FASE 5: SAÚDE HEURÍSTICA DO PROJETO (PURA, VERSIONADA E DOCUMENTADA)
// ─────────────────────────────────────────────

export const HEALTH_FORMULA_VERSION = '1.0.0';

export const HEALTH_FORMULA_SPEC = Object.freeze({
  version: HEALTH_FORMULA_VERSION,
  scale: '0 a 100 (inteiro arredondado por Math.round)',
  disclaimer: 'Indicador heurístico interno do painel para organização pessoal — não é medida objetiva de qualidade de código, arquitetura ou maturidade de software.',
  missingDataRule: 'Dado ausente, endpoint não consultado ou requisição com falha nunca equivale a zero, sucesso ou falha: o fator é marcado como indisponível (available: false) e seu peso é redistribuído proporcionalmente apenas entre os fatores disponíveis.',
  comparabilityRule: 'Se a cobertura de pesos disponíveis for inferior a 50% (ou menos de 2 fatores disponíveis), a confiança é classificada como Baixa e a nota é marcada como não comparável (isComparable: false).',
  factors: [
    {
      id: 'recentActivity',
      label: 'Atividade Recente',
      weight: 25,
      criteria: '≤7d: 100 | ≤14d: 85 | ≤30d: 70 | ≤60d: 45 | ≤90d: 25 | >90d: 10 (Projetos concluídos ou marcados como estáveis recebem 100).'
    },
    {
      id: 'overdueTasks',
      label: 'Tarefas Atrasadas (Local)',
      weight: 25,
      criteria: '0 vencidas: 100 | 1 vencida: 65 | 2 vencidas: 35 | ≥3 vencidas: 0.'
    },
    {
      id: 'openIssues',
      label: 'Issues Abertas (GitHub)',
      weight: 15,
      criteria: 'Somente se consultadas com sucesso: 0–2 issues: 100 | 3–5: 80 | 6–10: 55 | >10: 30.'
    },
    {
      id: 'readme',
      label: 'Documentação (README)',
      weight: 8,
      criteria: 'Somente se consultado: README presente (200 OK): 100 | Ausente confirmado (404): 20 | Não consultado/erro: neutro.'
    },
    {
      id: 'license',
      label: 'Licença Declarada',
      weight: 7,
      criteria: 'Repositório GitHub com licença declarada: 100 | Sem licença: 35 | Local/desconhecido: neutro.'
    },
    {
      id: 'recentBuilds',
      label: 'Builds Recentes (GitHub Actions)',
      weight: 12,
      criteria: 'Somente quando Actions está disponível e há workflows: Sucesso: 100 | Em andamento: 75 | Cancelado/Neutro: 60 | Falha confirmada: 15. Sem workflows ou erro de rede: neutro.'
    },
    {
      id: 'releases',
      label: 'Releases Publicadas',
      weight: 8,
      criteria: 'Quando relevante (repositório com releases ou status concluído): ≥1 release: 100 | Concluído sem release: 50 | Demais casos/não consultado: neutro.'
    }
  ]
});

/**
 * Calcula a Saúde Heurística de um projeto de forma 100% pura e determinística.
 *
 * @param {object} project — Objeto de projeto mesclado ou bruto
 * @param {object|null} techEntry — Dados técnicos consultados sob demanda (`state.githubCache.repoTech[repoId]`)
 * @param {number} [nowMs=Date.now()] — Timestamp de referência para cálculo determinístico
 */
export function computeProjectHealth(project = {}, techEntry = null, nowMs = Date.now()) {
  const factors = [];
  const status = project.status || 'ideia';
  const isExempt = Boolean(project.exemptFromAbandonment);

  // 1. Atividade Recente (peso 25)
  const actDateStr = project.lastActivityAt || project.pushedAt || project.updatedAt || null;
  const actMs = actDateStr ? new Date(actDateStr).getTime() : NaN;
  const hasValidActDate = !isNaN(actMs) && actMs > 0;

  if (status === 'concluído' || isExempt) {
    factors.push({
      id: 'recentActivity',
      label: 'Atividade Recente',
      weight: 25,
      available: true,
      availability: 'available',
      score: 100,
      value: 0,
      valueLabel: status === 'concluído' ? 'Projeto concluído' : 'Estável (isento de cobrança de atividade)',
      source: 'Domínio Local',
      fetchedAt: actDateStr || null
    });
  } else if (hasValidActDate) {
    const days = Math.max(0, Math.floor((nowMs - actMs) / 86400000));
    const actScore = days <= 7 ? 100 : days <= 14 ? 85 : days <= 30 ? 70 : days <= 60 ? 45 : days <= 90 ? 25 : 10;
    factors.push({
      id: 'recentActivity',
      label: 'Atividade Recente',
      weight: 25,
      available: true,
      availability: 'available',
      score: actScore,
      value: days,
      valueLabel: days === 0 ? 'Hoje (< 24h)' : `Há ${days} dia(s)`,
      source: project.pushedAt ? 'GitHub + Local' : 'Domínio Local',
      fetchedAt: actDateStr
    });
  } else {
    factors.push({
      id: 'recentActivity',
      label: 'Atividade Recente',
      weight: 25,
      available: false,
      availability: 'unavailable',
      score: null,
      value: null,
      valueLabel: 'Sem data de atividade registrada (não penaliza)',
      source: 'Indisponível',
      fetchedAt: null
    });
  }

  // 2. Tarefas Atrasadas (peso 25)
  const tasksAvailable = project.tasksAvailable !== false;
  if (tasksAvailable) {
    const overdueCount = typeof project.overdueTasksCount === 'number'
      ? project.overdueTasksCount
      : (Array.isArray(project.tasks) ? project.tasks.filter(isTaskOverdue).length : 0);
    const taskScore = overdueCount === 0 ? 100 : overdueCount === 1 ? 65 : overdueCount === 2 ? 35 : 0;
    factors.push({
      id: 'overdueTasks',
      label: 'Tarefas Atrasadas',
      weight: 25,
      available: true,
      availability: 'available',
      score: taskScore,
      value: overdueCount,
      valueLabel: overdueCount === 0 ? 'Em dia (0 vencidas)' : `${overdueCount} tarefa(s) vencida(s)`,
      source: 'Domínio Local',
      fetchedAt: null
    });
  } else {
    factors.push({
      id: 'overdueTasks',
      label: 'Tarefas Atrasadas',
      weight: 25,
      available: false,
      availability: 'unavailable',
      score: null,
      value: null,
      valueLabel: 'Dados de tarefas não informados',
      source: 'Indisponível',
      fetchedAt: null
    });
  }

  // 3. Issues Abertas (peso 15 — somente se consultadas com sucesso)
  const issuesTech = techEntry?.issues || null;
  if (issuesTech && issuesTech.availability === 'available') {
    const count = typeof issuesTech.count === 'number'
      ? issuesTech.count
      : (Array.isArray(issuesTech.data) ? issuesTech.data.length : 0);
    const issScore = count <= 2 ? 100 : count <= 5 ? 80 : count <= 10 ? 55 : 30;
    factors.push({
      id: 'openIssues',
      label: 'Issues Abertas (GitHub)',
      weight: 15,
      available: true,
      availability: 'available',
      score: issScore,
      value: count,
      valueLabel: `${count} issue(s) aberta(s)`,
      source: 'GitHub Issues API',
      fetchedAt: issuesTech.fetchedAt || null
    });
  } else {
    const reason = issuesTech?.availability === 'rate_limit'
      ? 'Indisponível (Rate limit)'
      : issuesTech?.availability === 'permission_denied'
        ? 'Sem permissão'
        : issuesTech?.availability === 'offline' || issuesTech?.availability === 'unavailable'
          ? 'Falha/Indisponível na API (não penaliza)'
          : 'Não consultado sob demanda (neutro)';
    factors.push({
      id: 'openIssues',
      label: 'Issues Abertas (GitHub)',
      weight: 15,
      available: false,
      availability: issuesTech?.availability || 'not_fetched',
      score: null,
      value: null,
      valueLabel: reason,
      source: 'GitHub Issues API',
      fetchedAt: issuesTech?.fetchedAt || null
    });
  }

  // 4. README (peso 8 — somente se consultado com sucesso)
  const readmeTech = techEntry?.readme || null;
  if (readmeTech && readmeTech.availability === 'available' && typeof readmeTech.present === 'boolean') {
    factors.push({
      id: 'readme',
      label: 'Documentação (README)',
      weight: 8,
      available: true,
      availability: 'available',
      score: readmeTech.present ? 100 : 20,
      value: readmeTech.present,
      valueLabel: readmeTech.present ? 'README presente' : 'Sem README (confirmado)',
      source: 'GitHub Contents API',
      fetchedAt: readmeTech.fetchedAt || null
    });
  } else {
    factors.push({
      id: 'readme',
      label: 'Documentação (README)',
      weight: 8,
      available: false,
      availability: readmeTech?.availability || 'not_fetched',
      score: null,
      value: null,
      valueLabel: readmeTech?.availability && readmeTech.availability !== 'not_fetched'
        ? 'Indisponível na consulta (não penaliza)'
        : 'Não consultado sob demanda (neutro)',
      source: 'GitHub Contents API',
      fetchedAt: readmeTech?.fetchedAt || null
    });
  }

  // 5. Licença Declarada (peso 7)
  const licenseKnown = Boolean(project.hasLicenseKnown || (techEntry?.license && techEntry.license.availability === 'available'));
  if (licenseKnown) {
    const hasLic = Boolean(project.license || techEntry?.license?.present);
    factors.push({
      id: 'license',
      label: 'Licença Declarada',
      weight: 7,
      available: true,
      availability: 'available',
      score: hasLic ? 100 : 35,
      value: project.license || (hasLic ? 'Presente' : null),
      valueLabel: hasLic ? `Licença: ${project.license || 'Declarada'}` : 'Sem licença declarada no GitHub',
      source: 'GitHub Repo Metadata',
      fetchedAt: techEntry?.updatedAt || null
    });
  } else {
    factors.push({
      id: 'license',
      label: 'Licença Declarada',
      weight: 7,
      available: false,
      availability: 'not_fetched',
      score: null,
      value: null,
      valueLabel: project.isLocalOnly ? 'Projeto local (não aplicável)' : 'Metadado indisponível (neutro)',
      source: 'GitHub Repo Metadata',
      fetchedAt: null
    });
  }

  // 6. Builds Recentes / GitHub Actions (peso 12 — somente se disponível e com workflows)
  const actionsTech = techEntry?.actions || null;
  const buildStatus = actionsTech?.buildStatus || 'unavailable';
  if (actionsTech && actionsTech.availability === 'available' && !['none', 'unavailable'].includes(buildStatus)) {
    const buildScore = buildStatus === 'success'
      ? 100
      : buildStatus === 'in_progress'
        ? 75
        : buildStatus === 'cancelled'
          ? 60
          : buildStatus === 'failure'
            ? 15
            : 50;
    const labelMap = {
      success: 'Último build: Sucesso (verde)',
      in_progress: 'Build em andamento (amarelo)',
      cancelled: 'Último build: Cancelado/Neutro (amarelo)',
      failure: 'Último build: Falha confirmada (vermelho)'
    };
    factors.push({
      id: 'recentBuilds',
      label: 'Builds Recentes (Actions)',
      weight: 12,
      available: true,
      availability: 'available',
      score: buildScore,
      value: buildStatus,
      valueLabel: labelMap[buildStatus] || `Build: ${buildStatus}`,
      source: 'GitHub Actions API',
      fetchedAt: actionsTech.fetchedAt || null
    });
  } else {
    let reason = 'Não consultado sob demanda (neutro)';
    if (actionsTech?.availability === 'available' && buildStatus === 'none') {
      reason = 'Repositório sem workflows Actions (não aplicável)';
    } else if (actionsTech?.availability === 'permission_denied') {
      reason = 'Sem permissão para Actions (não conta como falha)';
    } else if (actionsTech?.availability === 'rate_limit') {
      reason = 'Indisponível por rate limit (não conta como falha)';
    } else if (actionsTech?.availability === 'unavailable' || actionsTech?.availability === 'offline') {
      reason = 'Indisponível na rede/API (nunca vira build vermelho)';
    }
    factors.push({
      id: 'recentBuilds',
      label: 'Builds Recentes (Actions)',
      weight: 12,
      available: false,
      availability: actionsTech?.availability || 'not_fetched',
      score: null,
      value: buildStatus,
      valueLabel: reason,
      source: 'GitHub Actions API',
      fetchedAt: actionsTech?.fetchedAt || null
    });
  }

  // 7. Releases Publicadas (peso 8 — relevante quando há releases ou projeto está concluído)
  const releasesTech = techEntry?.releases || null;
  const relCount = releasesTech?.availability === 'available'
    ? (typeof releasesTech.count === 'number' ? releasesTech.count : (Array.isArray(releasesTech.data) ? releasesTech.data.length : 0))
    : null;
  const isReleasesRelevant = releasesTech?.availability === 'available' && (relCount > 0 || status === 'concluído');

  if (isReleasesRelevant) {
    factors.push({
      id: 'releases',
      label: 'Releases Publicadas',
      weight: 8,
      available: true,
      availability: 'available',
      score: relCount > 0 ? 100 : 50,
      value: relCount,
      valueLabel: relCount > 0 ? `${relCount} release(s) publicada(s)` : 'Concluído sem release formal',
      source: 'GitHub Releases API',
      fetchedAt: releasesTech.fetchedAt || null
    });
  } else {
    factors.push({
      id: 'releases',
      label: 'Releases Publicadas',
      weight: 8,
      available: false,
      availability: releasesTech?.availability || 'not_fetched',
      score: null,
      value: relCount,
      valueLabel: releasesTech?.availability === 'available'
        ? 'Sem releases (opcional para projetos não concluídos)'
        : releasesTech?.availability && releasesTech.availability !== 'not_fetched'
          ? 'Indisponível na API (não penaliza)'
          : 'Não consultado sob demanda (neutro)',
      source: 'GitHub Releases API',
      fetchedAt: releasesTech?.fetchedAt || null
    });
  }

  // Normalização estrita apenas entre os fatores disponíveis
  const totalPossibleWeight = factors.reduce((acc, f) => acc + f.weight, 0); // 100
  const availableFactors = factors.filter(f => f.available && typeof f.score === 'number');
  const availableWeight = availableFactors.reduce((acc, f) => acc + f.weight, 0);
  const coverageRatio = totalPossibleWeight > 0 ? availableWeight / totalPossibleWeight : 0;
  const coveragePct = Math.round(coverageRatio * 100);

  const normalizedFactors = factors.map(f => {
    const normWeight = f.available && availableWeight > 0 ? (f.weight / availableWeight) : 0;
    const weightedContribution = f.available && availableWeight > 0 ? +(f.score * normWeight).toFixed(2) : null;
    return {
      ...f,
      normalizedWeightPct: +(normWeight * 100).toFixed(1),
      weightedContribution
    };
  });

  const rawScore = availableWeight > 0
    ? availableFactors.reduce((acc, f) => acc + f.score * (f.weight / availableWeight), 0)
    : null;
  const score = rawScore !== null ? Math.max(0, Math.min(100, Math.round(rawScore))) : null;

  // Confiança e comparabilidade (Portão: se a cobertura for baixa, reduzir confiança e não apresentar como comparável)
  let confidence = 'baixa';
  let confidenceLabel = 'Baixa (cobertura reduzida)';
  if (coveragePct >= 75 && availableFactors.length >= 4) {
    confidence = 'alta';
    confidenceLabel = 'Alta';
  } else if (coveragePct >= 50 && availableFactors.length >= 2) {
    confidence = 'media';
    confidenceLabel = 'Média';
  }

  const isComparable = coveragePct >= 50 && availableFactors.length >= 2 && score !== null;

  let band = 'insuficiente';
  let bandLabel = 'Cobertura baixa (não comparável)';
  let color = '#64748b';

  if (isComparable && score !== null) {
    if (score >= 80) {
      band = 'otima';
      bandLabel = 'Saudável';
      color = '#10b981';
    } else if (score >= 60) {
      band = 'boa';
      bandLabel = 'Boa';
      color = '#06b6d4';
    } else if (score >= 40) {
      band = 'atencao';
      bandLabel = 'Atenção';
      color = '#f59e0b';
    } else {
      band = 'critica';
      bandLabel = 'Crítica';
      color = '#f43f5e';
    }
  }

  return {
    version: HEALTH_FORMULA_VERSION,
    score,
    rawScore: rawScore !== null ? +rawScore.toFixed(2) : null,
    band,
    bandLabel,
    color,
    confidence,
    confidenceLabel,
    coveragePct,
    availableWeight,
    totalPossibleWeight,
    isComparable,
    availableFactorsCount: availableFactors.length,
    totalFactorsCount: factors.length,
    factors: normalizedFactors,
    disclaimer: HEALTH_FORMULA_SPEC.disclaimer
  };
}

/**
 * Tabela oficial de casos de teste da função pura de saúde (incluindo dados ausentes, falha de API e baixa cobertura).
 */
export const HEALTH_TEST_CASES = [
  {
    id: 'full_healthy',
    description: 'Projeto ativo (<7d), 0 atrasos, 1 issue, README + MIT, build verde e 2 releases (100% cobertura)',
    input: {
      project: {
        status: 'em andamento',
        pushedAt: '2026-10-29T12:00:00Z',
        overdueTasksCount: 0,
        hasLicenseKnown: true,
        license: 'MIT'
      },
      tech: {
        issues: { availability: 'available', count: 1 },
        readme: { availability: 'available', present: true },
        actions: { availability: 'available', buildStatus: 'success' },
        releases: { availability: 'available', count: 2 }
      },
      nowMs: new Date('2026-10-31T12:00:00Z').getTime()
    },
    expected: { score: 100, confidence: 'alta', isComparable: true, coveragePct: 100 }
  },
  {
    id: 'missing_endpoints_no_penalty',
    description: 'Endpoints de Actions/Releases/README/Issues falharam ou deram rate-limit: dado ausente não vira zero nem falha',
    input: {
      project: {
        status: 'em andamento',
        pushedAt: '2026-10-30T12:00:00Z',
        overdueTasksCount: 0,
        hasLicenseKnown: true,
        license: 'MIT'
      },
      tech: {
        issues: { availability: 'rate_limit', data: null },
        readme: { availability: 'offline', present: null },
        actions: { availability: 'permission_denied', buildStatus: 'unavailable' },
        releases: { availability: 'unavailable', data: null }
      },
      nowMs: new Date('2026-10-31T12:00:00Z').getTime()
    },
    expected: { score: 100, confidence: 'media', isComparable: true, coveragePct: 57 }
  },
  {
    id: 'confirmed_build_failure_and_overdue',
    description: 'Build com falha confirmada (conclusion: failure) e 2 tarefas atrasadas reduzem a nota proporcionalmente',
    input: {
      project: {
        status: 'em andamento',
        pushedAt: '2026-10-28T12:00:00Z', // 3d -> 100 (w=25)
        overdueTasksCount: 2,              // 2 atrasadas -> 35 (w=25)
        hasLicenseKnown: true,
        license: 'MIT'                     // MIT -> 100 (w=7)
      },
      tech: {
        actions: { availability: 'available', buildStatus: 'failure' } // failure -> 15 (w=12)
      },
      nowMs: new Date('2026-10-31T12:00:00Z').getTime()
    },
    // Pesos disponíveis: 25 + 25 + 7 + 12 = 69. Soma ponderada: (25*100 + 25*35 + 7*100 + 12*15) / 69 = 4255 / 69 = 61.666 -> 62
    expected: { score: 62, confidence: 'media', isComparable: true, coveragePct: 69 }
  },
  {
    id: 'low_coverage_not_comparable',
    description: 'Baixa cobertura (<50% dos pesos, apenas tarefas disponíveis sem data e sem GitHub): reduz confiança e marca isComparable = false',
    input: {
      project: {
        status: 'ideia',
        pushedAt: null,
        lastActivityAt: null,
        overdueTasksCount: 0,
        hasLicenseKnown: false,
        isLocalOnly: true
      },
      tech: null,
      nowMs: new Date('2026-10-31T12:00:00Z').getTime()
    },
    expected: { score: 100, confidence: 'baixa', isComparable: false, coveragePct: 25 }
  },
  {
    id: 'abandoned_inactive',
    description: 'Projeto sem atividade há ~200 dias, sem atrasos e com licença MIT: atividade recente puxa a nota para baixo',
    input: {
      project: {
        status: 'em andamento',
        pushedAt: '2026-04-14T12:00:00Z', // ~200d -> 10 (w=25)
        overdueTasksCount: 0,             // 0 atrasadas -> 100 (w=25)
        hasLicenseKnown: true,
        license: 'MIT'                    // MIT -> 100 (w=7)
      },
      tech: null,
      nowMs: new Date('2026-10-31T12:00:00Z').getTime()
    },
    // Pesos disponíveis: 25 + 25 + 7 = 57. Soma: (25*10 + 25*100 + 7*100) / 57 = 3450 / 57 = 60.53 -> 61
    expected: { score: 61, confidence: 'media', isComparable: true, coveragePct: 57 }
  }
];

export function verifyHealthFormulaTestCases() {
  const results = [];
  for (const tc of HEALTH_TEST_CASES) {
    const out = computeProjectHealth(tc.input.project, tc.input.tech, tc.input.nowMs);
    const passed =
      out.score === tc.expected.score &&
      out.confidence === tc.expected.confidence &&
      out.isComparable === tc.expected.isComparable &&
      out.coveragePct === tc.expected.coveragePct;
    results.push({ id: tc.id, description: tc.description, passed, actual: out, expected: tc.expected });
  }
  return {
    allPassed: results.every(r => r.passed),
    results
  };
}

// ─────────────────────────────────────────────
// FASE 5: DETECTOR DE ABANDONO (NUNCA ALTERA STATUS SOZINHO)
// ─────────────────────────────────────────────

/**
 * Avalia se um projeto ativo está sem atividade acima do limite configurado.
 * Respeita exclusões (`exemptFromAbandonment`), ignorados (`abandonmentIgnored`)
 * e janela de cooldown (`abandonmentSnoozedUntil`).
 * NUNCA altera o status do projeto sozinho.
 */
export function evaluateProjectAbandonment(project, config = {}, nowMs = Date.now()) {
  const thresholdDays = Math.max(7, Number(config?.abandonmentThresholdDays) || 45);
  const cooldownDays = Math.max(1, Number(config?.abandonmentCooldownDays) || 14);

  if (!project || project.hidden) {
    return { isAbandonedCandidate: false, reason: 'hidden_or_null', daysInactive: 0, thresholdDays };
  }

  // Só avalia projetos em status ativo ('em andamento' ou 'ideia')
  if (project.status !== 'em andamento' && project.status !== 'ideia') {
    return { isAbandonedCandidate: false, reason: 'status_not_active', daysInactive: 0, thresholdDays };
  }

  if (project.exemptFromAbandonment) {
    return { isAbandonedCandidate: false, reason: 'exempt_constant_activity', daysInactive: 0, thresholdDays };
  }

  if (project.abandonmentIgnored) {
    return { isAbandonedCandidate: false, reason: 'ignored_by_user', daysInactive: 0, thresholdDays };
  }

  if (project.abandonmentSnoozedUntil) {
    const snoozeMs = new Date(project.abandonmentSnoozedUntil).getTime();
    if (!isNaN(snoozeMs) && snoozeMs > nowMs) {
      return {
        isAbandonedCandidate: false,
        reason: 'snoozed_cooldown',
        snoozedUntil: project.abandonmentSnoozedUntil,
        daysInactive: 0,
        thresholdDays
      };
    }
  }

  const refDateStr = project.lastActivityAt || project.pushedAt || project.createdAt || null;
  if (!refDateStr) {
    return { isAbandonedCandidate: false, reason: 'no_activity_date', daysInactive: null, thresholdDays };
  }

  const refMs = new Date(refDateStr).getTime();
  if (isNaN(refMs)) {
    return { isAbandonedCandidate: false, reason: 'invalid_date', daysInactive: null, thresholdDays };
  }

  const daysInactive = Math.max(0, Math.floor((nowMs - refMs) / 86400000));
  if (daysInactive < thresholdDays) {
    return { isAbandonedCandidate: false, reason: 'recently_active', daysInactive, thresholdDays };
  }

  return {
    isAbandonedCandidate: true,
    reason: 'inactive_threshold_exceeded',
    daysInactive,
    thresholdDays,
    cooldownDays,
    lastActivityAt: refDateStr,
    suggestedActions: [
      { id: 'resume', label: 'Retomar projeto', description: 'Abrir projeto e focar na próxima entrega' },
      { id: 'pause', label: 'Pausar', description: 'Mudar status manualmente para "pausado"' },
      { id: 'archive', label: 'Arquivar', description: 'Mudar status manualmente para "arquivado"' },
      { id: 'snooze', label: `Adiar (${cooldownDays}d)`, description: `Silenciar alerta por ${cooldownDays} dias (cooldown)` },
      { id: 'exempt', label: 'Não precisa de atividade constante', description: 'Marcar como projeto estável/concluído funcionalmente' },
      { id: 'ignore', label: 'Ignorar alerta', description: 'Não sugerir ações de inatividade para este projeto' }
    ]
  };
}

export function computeAbandonedProjects(state, nowMs = Date.now()) {
  const merged = getMergedProjects(state).filter(p => !p.hidden);
  const config = state?.config || {};
  const candidates = [];

  for (const proj of merged) {
    const evalResult = evaluateProjectAbandonment(proj, config, nowMs);
    if (evalResult.isAbandonedCandidate) {
      candidates.push({
        project: proj,
        ...evalResult
      });
    }
  }

  candidates.sort((a, b) => (b.daysInactive || 0) - (a.daysInactive || 0));
  return candidates;
}

// ─────────────────────────────────────────────
// FASE 5: ALERTAS CONSOLIDADOS NA HOME
// (Projetos parados, Builds com falha SOMENTE quando confirmado, Tarefas vencidas)
// ─────────────────────────────────────────────

export function computeConsolidatedHomeAlerts(state, nowMs = Date.now()) {
  const merged = getMergedProjects(state).filter(p => !p.hidden);
  const abandoned = computeAbandonedProjects(state, nowMs);

  // Builds com falha CONFIRMADA (somente quando availability === 'available' && buildStatus === 'failure')
  // Erro de request, rate limit ou sem permissão NUNCA entram aqui!
  const confirmedFailingBuilds = [];
  const projectsWithOverdue = [];
  let totalOverdueTasks = 0;

  for (const proj of merged) {
    if (proj.overdueTasksCount > 0) {
      totalOverdueTasks += proj.overdueTasksCount;
      projectsWithOverdue.push({
        repoId: proj.repoId,
        name: proj.name,
        customIcon: proj.customIcon,
        overdueCount: proj.overdueTasksCount
      });
    }

    const actions = proj.tech?.actions;
    if (actions && actions.availability === 'available' && actions.buildStatus === 'failure') {
      confirmedFailingBuilds.push({
        repoId: proj.repoId,
        name: proj.name,
        customIcon: proj.customIcon,
        workflowName: actions.latestRun?.name || 'Workflow CI',
        branch: actions.latestRun?.headBranch || '',
        updatedAt: actions.latestRun?.updatedAt || actions.fetchedAt || null,
        htmlUrl: actions.latestRun?.htmlUrl || null
      });
    }
  }

  return {
    totalAlertsCount:
      (totalOverdueTasks > 0 ? 1 : 0) +
      confirmedFailingBuilds.length +
      abandoned.length,
    overdue: {
      totalTasks: totalOverdueTasks,
      projectsCount: projectsWithOverdue.length,
      projects: projectsWithOverdue
    },
    failingBuilds: {
      count: confirmedFailingBuilds.length,
      items: confirmedFailingBuilds
    },
    abandonedProjects: {
      count: abandoned.length,
      thresholdDays: Math.max(7, Number(state?.config?.abandonmentThresholdDays) || 45),
      cooldownDays: Math.max(1, Number(state?.config?.abandonmentCooldownDays) || 14),
      items: abandoned
    }
  };
}

// ─────────────────────────────────────────────
// FASE 5: RELATÓRIO SEMANAL (#/reports) E ANÁLISES TEMPORAIS / RADAR
// ─────────────────────────────────────────────

/**
 * Calcula o Relatório Semanal comparando a janela atual de 7 dias locais (hoje - 6d .. hoje)
 * com a janela imediatamente anterior de 7 dias (hoje - 13d .. hoje - 7d).
 */
export function computeWeeklyReportData(state, nowMs = Date.now()) {
  const merged = getMergedProjects(state).filter(p => !p.hidden);
  const nowDate = new Date(nowMs);
  const todayYMD = `${nowDate.getFullYear()}-${String(nowDate.getMonth() + 1).padStart(2, '0')}-${String(nowDate.getDate()).padStart(2, '0')}`;
  const todayLocal = parseLocalYMD(todayYMD);

  // Constrói os 7 dias da semana atual (0 = 6 dias atrás ... 6 = hoje)
  const dailyBreakdown = [];
  const dayIndexByYMD = new Map();

  for (let i = 6; i >= 0; i--) {
    const d = new Date(todayLocal.getTime());
    d.setDate(d.getDate() - i);
    const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const shortLabel = d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
    const entry = {
      date: ymd,
      label: shortLabel,
      tasksDone: 0,
      focusMinutes: 0,
      focusSessions: 0,
      commits: state?.githubCache?.eventsFetchedAt ? 0 : null
    };
    dayIndexByYMD.set(ymd, dailyBreakdown.length);
    dailyBreakdown.push(entry);
  }

  let currentWeekTasks = 0;
  let prevWeekTasks = 0;
  const completedTasksList = [];

  for (const proj of merged) {
    for (const t of proj.tasks) {
      if (t.completed && t.completedAt) {
        const ymd = _isoToLocalYMD(t.completedAt);
        const tDate = parseLocalYMD(ymd);
        if (!tDate) continue;
        const diffDays = Math.round((todayLocal.getTime() - tDate.getTime()) / 86400000);
        if (diffDays >= 0 && diffDays < 7) {
          currentWeekTasks++;
          completedTasksList.push({
            taskId: t.id,
            title: t.title,
            priority: t.priority,
            completedAt: t.completedAt,
            dateYMD: ymd,
            repoId: proj.repoId,
            projectName: proj.name,
            projectIcon: proj.customIcon
          });
          if (dayIndexByYMD.has(ymd)) {
            dailyBreakdown[dayIndexByYMD.get(ymd)].tasksDone += 1;
          }
        } else if (diffDays >= 7 && diffDays < 14) {
          prevWeekTasks++;
        }
      }
    }
  }

  completedTasksList.sort((a, b) => String(b.completedAt).localeCompare(String(a.completedAt)));

  // Sessões de foco na semana atual vs semana anterior
  const sessions = Array.isArray(state?.focus?.sessions) ? state.focus.sessions : [];
  let currentWeekFocusMinutes = 0;
  let currentWeekFocusSessions = 0;
  let prevWeekFocusMinutes = 0;
  const focusByProjectMap = new Map();

  for (const s of sessions) {
    if (!s || (s.mode && s.mode !== 'focus')) continue;
    const mins = Math.max(0, Number(s.durationMinutes) || 0);
    if (mins <= 0) continue;
    const ymd = s.dateKey || (s.completedAt ? _isoToLocalYMD(s.completedAt) : null);
    const sDate = parseLocalYMD(ymd);
    if (!sDate) continue;
    const diffDays = Math.round((todayLocal.getTime() - sDate.getTime()) / 86400000);

    if (diffDays >= 0 && diffDays < 7) {
      currentWeekFocusMinutes += mins;
      currentWeekFocusSessions += 1;
      if (dayIndexByYMD.has(ymd)) {
        dailyBreakdown[dayIndexByYMD.get(ymd)].focusMinutes += mins;
        dailyBreakdown[dayIndexByYMD.get(ymd)].focusSessions += 1;
      }
      const rId = s.repoId ? String(s.repoId) : 'geral';
      const projObj = merged.find(p => p.repoId === rId);
      const pName = projObj ? projObj.name : (rId === 'geral' ? 'Foco Livre' : `Projeto #${rId}`);
      if (!focusByProjectMap.has(rId)) {
        focusByProjectMap.set(rId, { repoId: rId, projectName: pName, minutes: 0, sessions: 0 });
      }
      const fp = focusByProjectMap.get(rId);
      fp.minutes += mins;
      fp.sessions += 1;
    } else if (diffDays >= 7 && diffDays < 14) {
      prevWeekFocusMinutes += mins;
    }
  }

  // Atividade pública do GitHub na semana atual vs semana anterior
  const hasEventsCache = Boolean(state?.githubCache?.eventsFetchedAt && Array.isArray(state?.githubCache?.events));
  let currentWeekCommits = hasEventsCache ? 0 : null;
  let prevWeekCommits = hasEventsCache ? 0 : null;
  let currentWeekEvents = hasEventsCache ? 0 : null;

  if (hasEventsCache) {
    for (const ev of state.githubCache.events) {
      if (!ev?.created_at) continue;
      const ymd = _isoToLocalYMD(ev.created_at);
      const evDate = parseLocalYMD(ymd);
      if (!evDate) continue;
      const diffDays = Math.round((todayLocal.getTime() - evDate.getTime()) / 86400000);
      const cWeight = ev.type === 'PushEvent' ? Math.max(1, Number(ev.commitsCount) || 1) : 0;

      if (diffDays >= 0 && diffDays < 7) {
        currentWeekEvents += 1;
        currentWeekCommits += cWeight;
        if (dayIndexByYMD.has(ymd)) {
          dailyBreakdown[dayIndexByYMD.get(ymd)].commits += cWeight;
        }
      } else if (diffDays >= 7 && diffDays < 14) {
        prevWeekCommits += cWeight;
      }
    }
  }

  // Conquistas desbloqueadas na semana
  const achievementsEval = evaluateAchievements(state);
  const unlockedThisWeek = achievementsEval.items.filter(item => {
    if (!item.unlocked || !item.unlockedAt) return false;
    const ymd = _isoToLocalYMD(item.unlockedAt);
    const d = parseLocalYMD(ymd);
    if (!d) return false;
    const diff = Math.round((todayLocal.getTime() - d.getTime()) / 86400000);
    return diff >= 0 && diff < 7;
  });

  // Aliases por dia consumidos pelo gráfico semanal (tasksCompleted / publicEvents)
  for (const day of dailyBreakdown) {
    day.tasksCompleted = day.tasksDone;
    day.publicEvents = day.commits;
  }

  // Resumo textual honesto (sem inventar dados ausentes)
  const _cmp = (cur, prev) => cur > prev ? `acima da semana anterior (${prev})` : cur < prev ? `abaixo da semana anterior (${prev})` : `igual à semana anterior`;
  const summaryParts = [];
  summaryParts.push(`Nos últimos 7 dias você concluiu ${currentWeekTasks} tarefa(s), ${_cmp(currentWeekTasks, prevWeekTasks)}.`);
  summaryParts.push(`Registrou ${currentWeekFocusMinutes} min de foco em ${currentWeekFocusSessions} sessão(ões), ${_cmp(currentWeekFocusMinutes, prevWeekFocusMinutes)}.`);
  if (hasEventsCache) {
    summaryParts.push(`No GitHub público foram ${currentWeekCommits} commit(s) em ${currentWeekEvents} evento(s) (amostra limitada pela Events API).`);
  } else {
    summaryParts.push('A atividade do GitHub está indisponível (eventos não carregados) e não foi contabilizada.');
  }
  summaryParts.push(unlockedThisWeek.length > 0
    ? `Desbloqueou ${unlockedThisWeek.length} conquista(s) nesta semana.`
    : 'Nenhuma conquista nova nesta semana.');
  const textualSummary = summaryParts.join(' ');

  const startRangeYMD = dailyBreakdown[0]?.date || todayYMD;
  const endRangeYMD = dailyBreakdown[dailyBreakdown.length - 1]?.date || todayYMD;

  return {
    period: {
      startYMD: startRangeYMD,
      endYMD: endRangeYMD,
      label: `${formatLocalDueDate(startRangeYMD)} a ${formatLocalDueDate(endRangeYMD)} (7 dias locais)`
    },
    textualSummary,
    tasks: {
      currentWeek: currentWeekTasks,
      previousWeek: prevWeekTasks,
      delta: currentWeekTasks - prevWeekTasks,
      goal: Math.max(1, Number(state?.config?.weeklyTasksGoal) || 10),
      completedList: completedTasksList,
      // Aliases consumidos pela view #/reports
      completedCount: currentWeekTasks,
      prevCount: prevWeekTasks,
      completedItems: completedTasksList
    },
    focus: {
      currentWeekMinutes: currentWeekFocusMinutes,
      currentWeekSessions: currentWeekFocusSessions,
      previousWeekMinutes: prevWeekFocusMinutes,
      deltaMinutes: currentWeekFocusMinutes - prevWeekFocusMinutes,
      goalMinutes: Math.max(15, Number(state?.config?.weeklyFocusGoalMinutes) || 120),
      byProject: Array.from(focusByProjectMap.values()).sort((a, b) => b.minutes - a.minutes),
      // Aliases consumidos pela view #/reports
      minutes: currentWeekFocusMinutes,
      prevMinutes: prevWeekFocusMinutes,
      sessionsCount: currentWeekFocusSessions
    },
    githubActivity: {
      available: hasEventsCache,
      fetchedAt: state?.githubCache?.eventsFetchedAt || null,
      currentWeekCommits,
      previousWeekCommits: prevWeekCommits,
      deltaCommits: hasEventsCache ? (currentWeekCommits - prevWeekCommits) : null,
      currentWeekEvents,
      commits7d: currentWeekCommits,
      events7d: currentWeekEvents,
      apiLimitationNote: 'Baseado nos últimos 100 eventos públicos retornados pela GitHub Events API (janela máxima de 90 dias).'
    },
    achievements: {
      unlockedThisWeek,
      totalUnlocked: achievementsEval.unlockedCount,
      totalCatalog: achievementsEval.totalCount
    },
    dailyBreakdown
  };
}

/**
 * Análise de Linguagens ao Longo do Tempo (Fase 5 — Item 10).
 * Portão de qualidade: só gera série temporal quando houver amostra suficiente
 * (pelo menos 3 repositórios com linguagem identificada em pelo menos 2 períodos distintos).
 */
export function computeLanguageTimelineAnalysis(state) {
  const merged = getMergedProjects(state).filter(p => !p.hidden && p.language && (p.createdAt || p.pushedAt));
  const periodMap = new Map();
  const langTotals = new Map();

  for (const proj of merged) {
    const refDate = new Date(proj.createdAt || proj.pushedAt);
    if (isNaN(refDate.getTime())) continue;
    const year = refDate.getFullYear();
    const semester = refDate.getMonth() < 6 ? 'S1' : 'S2';
    const periodKey = `${year}-${semester}`;

    if (!periodMap.has(periodKey)) {
      periodMap.set(periodKey, { period: periodKey, total: 0, byLang: {} });
    }
    const bucket = periodMap.get(periodKey);
    bucket.total += 1;
    bucket.byLang[proj.language] = (bucket.byLang[proj.language] || 0) + 1;
    langTotals.set(proj.language, (langTotals.get(proj.language) || 0) + 1);
  }

  const periods = Array.from(periodMap.values()).sort((a, b) => a.period.localeCompare(b.period));
  const topLanguages = Array.from(langTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([lang, count]) => ({ language: lang, count }));

  const hasSufficientSample = merged.length >= 3 && periods.length >= 2 && topLanguages.length >= 2;
  const apiDisclaimer = 'Agrupado por semestre de criação do repositório e linguagem principal reportada pela API pública do GitHub. Não representa linhas de código escritas por mês nem repositórios privados.';
  const chartLanguages = topLanguages.map(t => t.language);

  return {
    hasSufficientSample,
    sampleRepoCount: merged.length,
    periodsCount: periods.length,
    distinctLanguagesCount: langTotals.size,
    insufficientReason: hasSufficientSample
      ? null
      : `Amostra insuficiente para série temporal comparável: são necessários pelo menos 3 repositórios com linguagem e data em ≥ 2 semestres distintos (atual: ${merged.length} repositório(s) em ${periods.length} período(s)).`,
    apiDisclaimer,
    topLanguages,
    periods,
    // Formato consumido por renderLanguageTimelineChart
    buckets: periods.map(p => ({ quarter: p.period, total: p.total, counts: p.byLang })),
    languages: chartLanguages,
    limitationNote: apiDisclaimer
  };
}

/**
 * Radar de Habilidades / Distribuição de Atividade por Linguagem (Fase 5 — Item 10).
 * Portões de qualidade:
 *   1. Só renderiza o radar quando houver dados suficientes (≥ 3 linguagens distintas nos repositórios).
 *   2. Nunca infere proficiência técnica real ou senioridade por contagem de linguagens:
 *      rotula explicitamente como "Índice Relativo de Presença no Painel (Repositórios + Tarefas + Foco)".
 */
export function computeSkillsRadarAnalysis(state) {
  const merged = getMergedProjects(state).filter(p => !p.hidden && p.language);
  const focusSessions = Array.isArray(state?.focus?.sessions) ? state.focus.sessions : [];

  const focusByRepo = new Map();
  for (const s of focusSessions) {
    if (s?.repoId && (!s.mode || s.mode === 'focus')) {
      const k = String(s.repoId);
      focusByRepo.set(k, (focusByRepo.get(k) || 0) + (Number(s.durationMinutes) || 0));
    }
  }

  const langMap = new Map();
  for (const proj of merged) {
    const lang = proj.language;
    if (!langMap.has(lang)) {
      langMap.set(lang, {
        language: lang,
        reposCount: 0,
        activeReposCount: 0,
        tasksDoneCount: 0,
        focusMinutes: 0,
        starsCount: 0
      });
    }
    const entry = langMap.get(lang);
    entry.reposCount += 1;
    if (proj.status === 'em andamento' || proj.status === 'concluído') {
      entry.activeReposCount += 1;
    }
    entry.tasksDoneCount += proj.doneTasksCount || 0;
    entry.focusMinutes += focusByRepo.get(String(proj.repoId)) || 0;
    entry.starsCount += proj.stars || 0;
  }

  const rawAxes = Array.from(langMap.values());
  const hasSufficientSample = rawAxes.length >= 3 && merged.length >= 3;

  if (!hasSufficientSample) {
    return {
      hasSufficientSample: false,
      distinctLanguagesCount: rawAxes.length,
      totalReposWithLang: merged.length,
      axes: [],
      insufficientReason: `Amostra insuficiente para o Radar: são necessárias pelo menos 3 linguagens principais distintas nos repositórios visíveis para formar um polígono comparável (atual: ${rawAxes.length} linguagem(ns) em ${merged.length} repositório(s)).`,
      honestyDisclaimer: 'Este gráfico representa apenas a distribuição relativa de repositórios, tarefas e sessões de foco no painel — não mede proficiência real na linguagem.'
    };
  }

  // Seleciona até 6 eixos principais e normaliza de 15 a 100 em relação ao maior eixo da amostra
  rawAxes.sort((a, b) => {
    const rawA = a.reposCount * 10 + a.tasksDoneCount * 3 + Math.min(20, Math.floor(a.focusMinutes / 15));
    const rawB = b.reposCount * 10 + b.tasksDoneCount * 3 + Math.min(20, Math.floor(b.focusMinutes / 15));
    return rawB - rawA;
  });

  const selected = rawAxes.slice(0, 6);
  const rawScores = selected.map(a => a.reposCount * 10 + a.tasksDoneCount * 3 + Math.min(20, Math.floor(a.focusMinutes / 15)));
  const maxRaw = Math.max(1, ...rawScores);

  const axes = selected.map((axis, idx) => {
    const relativeValue = Math.max(18, Math.min(100, Math.round((rawScores[idx] / maxRaw) * 100)));
    return {
      ...axis,
      rawActivityWeight: rawScores[idx],
      relativeValue, // 0..100 relativo ao próprio portfólio
      // Aliases consumidos por renderSkillsRadarChart
      projectCount: axis.reposCount,
      activeCount: axis.activeReposCount,
      tasksDone: axis.tasksDoneCount,
      normalizedScore: relativeValue,
      summary: `${axis.reposCount} repo(s), ${axis.tasksDoneCount} tarefa(s) concluída(s), ${axis.focusMinutes} min de foco`
    };
  });

  const honestyDisclaimer = 'Índice relativo de presença no seu painel (repositórios públicos + tarefas locais + tempo de foco). Não infere nem mede proficiência técnica real.';
  return {
    hasSufficientSample: true,
    distinctLanguagesCount: rawAxes.length,
    totalReposWithLang: merged.length,
    axes,
    insufficientReason: null,
    honestyDisclaimer,
    disclaimer: honestyDisclaimer
  };
}



