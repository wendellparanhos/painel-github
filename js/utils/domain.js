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
    language: repo?.language || local.language || null,
    topics: Array.isArray(repo?.topics) ? repo.topics : (Array.isArray(local.topics) ? local.topics : []),
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


