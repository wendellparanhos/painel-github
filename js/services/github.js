/**
 * Serviço de integração com a GitHub API — Fase 5.
 *
 * Regras rígidas:
 *   - Orçamento de requests: a Home SOMENTE chama fetchUserRepos() + fetchUserPublicEvents(). Zero requisições por repo na Home.
 *   - Requests de Actions, Releases, README, Commits, PRs e Issues são feitos SOMENTE sob demanda
 *     (ao abrir o projeto ou por ação explícita do usuário), em fila com limite de concorrência (nunca em lote para todos os repositórios).
 *   - Identificação pelo ID numérico (string) do repositório.
 *   - Nunca inventar dados: se a API falhar, sem permissão ou rate limit → retorna disponibilidade explícita ('unavailable' | 'permission_denied' | 'rate-limit' | 'offline'), nunca zero falso nem "build quebrado".
 *   - Rate limit lido dos headers em cada resposta.
 *   - Deduplicação de requests simultâneos via Map de Promises em curso.
 *   - Abort via AbortController para requisições canceláveis.
 */

const GITHUB_API = 'https://api.github.com';
const GITHUB_USER = 'wendellparanhos';

// TTL do cache em ms (10 minutos)
const CACHE_TTL_MS = 10 * 60 * 1000;

// Requests em andamento (deduplicação)
const _inflight = new Map();

// ─────────────────────────────────────────────
// FILA COM LIMITE DE CONCORRÊNCIA (SOB DEMANDA)
// Garante que chamadas de sub-recursos nunca disparem rajadas descontroladas
// ─────────────────────────────────────────────
const MAX_CONCURRENT_SUBREQUESTS = 2;
let _activeSubrequests = 0;
const _subrequestQueue = [];

function _enqueueSubrequest(taskFn, signal = null) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      const err = new Error('Requisição cancelada.');
      err.name = 'AbortError';
      reject(err);
      return;
    }

    const item = { taskFn, signal, resolve, reject };
    _subrequestQueue.push(item);
    _drainSubrequestQueue();
  });
}

function _drainSubrequestQueue() {
  while (_activeSubrequests < MAX_CONCURRENT_SUBREQUESTS && _subrequestQueue.length > 0) {
    const item = _subrequestQueue.shift();
    if (!item) break;

    if (item.signal?.aborted) {
      const err = new Error('Requisição cancelada.');
      err.name = 'AbortError';
      item.reject(err);
      continue;
    }

    _activeSubrequests++;
    Promise.resolve()
      .then(() => item.taskFn())
      .then(res => item.resolve(res))
      .catch(err => item.reject(err))
      .finally(() => {
        _activeSubrequests = Math.max(0, _activeSubrequests - 1);
        _drainSubrequestQueue();
      });
  }
}

export function getSubrequestQueueStats() {
  return {
    active: _activeSubrequests,
    queued: _subrequestQueue.length,
    maxConcurrent: MAX_CONCURRENT_SUBREQUESTS
  };
}

// ─────────────────────────────────────────────
// LEITURA DE HEADERS DE RATE LIMIT
// ─────────────────────────────────────────────
function parseRateLimit(response) {
  const limit = parseInt(response.headers.get('X-RateLimit-Limit') || '60', 10);
  const remaining = parseInt(response.headers.get('X-RateLimit-Remaining') || '0', 10);
  const reset = parseInt(response.headers.get('X-RateLimit-Reset') || '0', 10);

  return {
    limit,
    remaining,
    resetAt: reset ? new Date(reset * 1000).toISOString() : null,
    resetTimestamp: reset
  };
}

function isRateLimited(rateLimit) {
  if (!rateLimit) return false;
  return rateLimit.remaining <= 0 && rateLimit.resetTimestamp > Date.now() / 1000;
}

// ─────────────────────────────────────────────
// FETCH COM TIMEOUT E ABORT
// ─────────────────────────────────────────────
async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let onExternalAbort = null;
  if (options.signal) {
    if (options.signal.aborted) {
      clearTimeout(timeoutId);
      const err = new Error('Requisição cancelada.');
      err.name = 'AbortError';
      throw err;
    }
    onExternalAbort = () => controller.abort();
    options.signal.addEventListener('abort', onExternalAbort, { once: true });
  }

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return response;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  } finally {
    if (options.signal && onExternalAbort) {
      options.signal.removeEventListener('abort', onExternalAbort);
    }
  }
}

// ─────────────────────────────────────────────
// LISTA DE REPOSITÓRIOS DO USUÁRIO
// (Home somente chama este endpoint + eventos públicos — zero requests por repo)
// ─────────────────────────────────────────────
export async function fetchUserRepos(githubCache, forceRefresh = false, signal = null) {
  const cacheKey = `repos:${GITHUB_USER}`;

  // 1. Verifica cache local antes de ir à rede
  if (!forceRefresh && githubCache?.fetchedAt) {
    const age = Date.now() - new Date(githubCache.fetchedAt).getTime();
    if (age < CACHE_TTL_MS && Array.isArray(githubCache.repos) && githubCache.repos.length > 0) {
      return {
        data: githubCache.repos,
        source: 'cache',
        fetchedAt: githubCache.fetchedAt,
        rateLimit: githubCache.rateLimit,
        error: null,
        rateLimitResetAt: null
      };
    }
  }

  // 2. Verifica se há rate limit esgotado registrado
  if (!forceRefresh && githubCache?.rateLimit && isRateLimited(githubCache.rateLimit)) {
    return {
      data: githubCache.repos?.length > 0 ? githubCache.repos : null,
      source: 'rate-limit',
      fetchedAt: githubCache.fetchedAt,
      rateLimit: githubCache.rateLimit,
      error: null,
      rateLimitResetAt: githubCache.rateLimit.resetAt
    };
  }

  // 3. Deduplicação: se já há request em andamento para esta chave, retorna a mesma Promise
  if (_inflight.has(cacheKey)) {
    return _inflight.get(cacheKey);
  }

  // 4. Busca na rede (paginação automática)
  const fetchPromise = _fetchAllPages(signal);
  _inflight.set(cacheKey, fetchPromise);

  try {
    const result = await fetchPromise;
    return result;
  } finally {
    _inflight.delete(cacheKey);
  }
}

async function _fetchAllPages(signal) {
  const allRepos = [];
  let page = 1;
  let rateLimit = null;

  try {
    while (true) {
      const url = `${GITHUB_API}/users/${GITHUB_USER}/repos?per_page=100&sort=updated&type=public&page=${page}`;

      let response;
      try {
        response = await fetchWithTimeout(url, { signal }, 10000);
      } catch (err) {
        if (err.name === 'AbortError') {
          return { data: null, source: 'offline', fetchedAt: null, rateLimit, error: 'Requisição cancelada.', rateLimitResetAt: null };
        }
        return { data: null, source: 'offline', fetchedAt: null, rateLimit, error: 'Sem conexão com a internet ou servidor inacessível.', rateLimitResetAt: null };
      }

      rateLimit = parseRateLimit(response);

      if (response.status === 403 || response.status === 429) {
        return {
          data: null,
          source: 'rate-limit',
          fetchedAt: null,
          rateLimit,
          error: null,
          rateLimitResetAt: rateLimit.resetAt
        };
      }

      if (response.status === 404) {
        return { data: null, source: 'error', fetchedAt: null, rateLimit, error: `Usuário "${GITHUB_USER}" não encontrado no GitHub.`, rateLimitResetAt: null };
      }

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        return { data: null, source: 'error', fetchedAt: null, rateLimit, error: `Erro ${response.status} da API do GitHub: ${errorText.slice(0, 120)}`, rateLimitResetAt: null };
      }

      let pageData;
      try {
        pageData = await response.json();
      } catch {
        return { data: null, source: 'error', fetchedAt: null, rateLimit, error: 'Resposta inválida da API do GitHub.', rateLimitResetAt: null };
      }

      if (!Array.isArray(pageData)) {
        return { data: null, source: 'error', fetchedAt: null, rateLimit, error: 'Formato inesperado retornado pela API do GitHub.', rateLimitResetAt: null };
      }

      allRepos.push(...pageData);

      if (pageData.length < 100) break;
      page++;
    }

    const fetchedAt = new Date().toISOString();
    return {
      data: allRepos,
      source: 'network',
      fetchedAt,
      rateLimit,
      error: null,
      rateLimitResetAt: null
    };

  } catch (err) {
    return {
      data: null,
      source: 'error',
      fetchedAt: null,
      rateLimit,
      error: `Erro inesperado: ${err.message}`,
      rateLimitResetAt: null
    };
  }
}

// ─────────────────────────────────────────────
// EVENTOS PÚBLICOS DO USUÁRIO (Fase 3: Heatmap 2D, Sparklines e Anel de Commits)
// Regra de orçamento: 1 única chamada pública, cacheada em `githubCache.events`.
// ZERO chamadas por card!
// ─────────────────────────────────────────────
export async function fetchUserPublicEvents(githubCache, forceRefresh = false, signal = null) {
  const cacheKey = `events:${GITHUB_USER}`;

  if (!forceRefresh && githubCache?.eventsFetchedAt && Array.isArray(githubCache?.events)) {
    const age = Date.now() - new Date(githubCache.eventsFetchedAt).getTime();
    if (age < CACHE_TTL_MS) {
      return {
        data: githubCache.events,
        source: 'cache',
        fetchedAt: githubCache.eventsFetchedAt,
        rateLimit: githubCache.rateLimit || null,
        error: null
      };
    }
  }

  if (!forceRefresh && githubCache?.rateLimit && isRateLimited(githubCache.rateLimit)) {
    return {
      data: Array.isArray(githubCache.events) ? githubCache.events : null,
      source: 'rate-limit',
      fetchedAt: githubCache.eventsFetchedAt || null,
      rateLimit: githubCache.rateLimit,
      error: 'Limite da API do GitHub atingido.'
    };
  }

  if (_inflight.has(cacheKey)) {
    return _inflight.get(cacheKey);
  }

  const fetchPromise = (async () => {
    const url = `${GITHUB_API}/users/${GITHUB_USER}/events/public?per_page=100`;
    try {
      const response = await fetchWithTimeout(url, { signal }, 9000);
      const rateLimit = parseRateLimit(response);

      if (response.status === 403 || response.status === 429) {
        return {
          data: Array.isArray(githubCache?.events) ? githubCache.events : null,
          source: 'rate-limit',
          fetchedAt: githubCache?.eventsFetchedAt || null,
          rateLimit,
          error: 'Limite da API do GitHub atingido.'
        };
      }

      if (!response.ok) {
        return {
          data: null,
          source: 'error',
          fetchedAt: null,
          rateLimit,
          error: `Eventos públicos indisponíveis (HTTP ${response.status}).`
        };
      }

      const events = await response.json();
      if (!Array.isArray(events)) {
        return {
          data: null,
          source: 'error',
          fetchedAt: null,
          rateLimit,
          error: 'Formato inesperado de eventos públicos.'
        };
      }

      const compactEvents = events.map(ev => ({
        id: ev.id,
        type: ev.type,
        created_at: ev.created_at,
        repo: ev.repo ? { id: ev.repo.id, name: ev.repo.name } : null,
        commitsCount: ev.type === 'PushEvent'
          ? (ev.payload?.size || ev.payload?.distinct_size || (Array.isArray(ev.payload?.commits) ? ev.payload.commits.length : 1))
          : 0
      }));

      return {
        data: compactEvents,
        source: 'network',
        fetchedAt: new Date().toISOString(),
        rateLimit,
        error: null
      };
    } catch (err) {
      if (err.name === 'AbortError') {
        return { data: null, source: 'aborted', fetchedAt: null, rateLimit: null, error: 'Cancelado.' };
      }
      return {
        data: Array.isArray(githubCache?.events) ? githubCache.events : null,
        source: 'offline',
        fetchedAt: githubCache?.eventsFetchedAt || null,
        rateLimit: null,
        error: 'Eventos públicos indisponíveis offline.'
      };
    }
  })();

  _inflight.set(cacheKey, fetchPromise);
  try {
    return await fetchPromise;
  } finally {
    _inflight.delete(cacheKey);
  }
}

// ─────────────────────────────────────────────
// SUB-RECURSOS DE UM REPOSITÓRIO SOB DEMANDA (FASE 2 & FASE 5)
// Cada endpoint tem cache próprio, fila com limite e erro isolado.
// Indisponível NUNCA é tratado como zero ou falha de build!
// ─────────────────────────────────────────────
const _activityCache = new Map();
const ACTIVITY_CACHE_TTL = 10 * 60 * 1000;

export function clearRepoActivityMemoryCache() {
  _activityCache.clear();
}

/**
 * Classifica o status HTTP de erro em disponibilidade semântica explícita.
 */
function _classifyHttpNonOk(response) {
  const rlRemaining = response.headers?.get?.('X-RateLimit-Remaining');
  if (response.status === 429 || (response.status === 403 && rlRemaining === '0')) {
    return {
      availability: 'rate_limit',
      source: 'rate-limit',
      error: 'Indisponível (limite de requisições da API do GitHub atingido).'
    };
  }
  if (response.status === 401 || response.status === 403) {
    return {
      availability: 'permission_denied',
      source: 'permission-denied',
      error: 'Sem permissão ou recurso restrito para acesso público não autenticado.'
    };
  }
  if (response.status === 404 || response.status === 410) {
    return {
      availability: 'unavailable',
      source: 'unavailable',
      error: 'Recurso indisponível ou desativado neste repositório.'
    };
  }
  return {
    availability: 'unavailable',
    source: 'error',
    error: `Indisponível no momento (HTTP ${response.status}).`
  };
}

/**
 * Busca genérica de sub-recurso em array (commits, pulls, issues, releases) na fila limitada.
 */
async function _fetchRepoSubresource(cacheKey, url, signal = null, forceRefresh = false, transformFn = null) {
  if (!forceRefresh && _activityCache.has(cacheKey)) {
    const cached = _activityCache.get(cacheKey);
    if (Date.now() - cached.ts < ACTIVITY_CACHE_TTL) {
      return {
        data: cached.data,
        availability: 'available',
        source: 'cache',
        fetchedAt: cached.fetchedAt,
        error: null
      };
    }
  }

  if (_inflight.has(cacheKey)) {
    return _inflight.get(cacheKey);
  }

  const fetchPromise = _enqueueSubrequest(async () => {
    const nowISO = new Date().toISOString();
    try {
      const response = await fetchWithTimeout(url, { signal }, 8000);

      if (response.status === 409) {
        // Repositório vazio (ex.: sem commits)
        _activityCache.set(cacheKey, { data: [], ts: Date.now(), fetchedAt: nowISO });
        return { data: [], availability: 'available', source: 'network', fetchedAt: nowISO, error: null };
      }

      if (!response.ok) {
        const classified = _classifyHttpNonOk(response);
        return {
          data: null,
          availability: classified.availability,
          source: classified.source,
          fetchedAt: nowISO,
          error: classified.error
        };
      }

      const rawData = await response.json();
      if (!Array.isArray(rawData)) {
        return {
          data: null,
          availability: 'unavailable',
          source: 'error',
          fetchedAt: nowISO,
          error: 'Resposta inesperada da API.'
        };
      }

      const data = transformFn ? transformFn(rawData) : rawData;
      _activityCache.set(cacheKey, { data, ts: Date.now(), fetchedAt: nowISO });
      return {
        data,
        availability: 'available',
        source: 'network',
        fetchedAt: nowISO,
        error: null
      };

    } catch (err) {
      if (err.name === 'AbortError') {
        return { data: null, availability: 'aborted', source: 'aborted', fetchedAt: null, error: 'Requisição cancelada.' };
      }
      return {
        data: null,
        availability: 'offline',
        source: 'offline',
        fetchedAt: new Date().toISOString(),
        error: 'Indisponível offline ou sem conexão.'
      };
    }
  }, signal);

  _inflight.set(cacheKey, fetchPromise);
  try {
    return await fetchPromise;
  } finally {
    _inflight.delete(cacheKey);
  }
}

/**
 * Commits recentes do repositório
 */
export async function fetchRepoCommits(fullName, signal = null, forceRefresh = false) {
  const url = `${GITHUB_API}/repos/${fullName}/commits?per_page=8`;
  return _fetchRepoSubresource(`commits:${fullName}`, url, signal, forceRefresh);
}

/**
 * Pull Requests abertos do repositório
 */
export async function fetchRepoPulls(fullName, signal = null, forceRefresh = false) {
  const url = `${GITHUB_API}/repos/${fullName}/pulls?state=open&per_page=10`;
  return _fetchRepoSubresource(`pulls:${fullName}`, url, signal, forceRefresh);
}

/**
 * Issues abertas do repositório (filtra PRs que a API de issues do GitHub inclui por padrão)
 */
export async function fetchRepoIssues(fullName, signal = null, forceRefresh = false) {
  const url = `${GITHUB_API}/repos/${fullName}/issues?state=open&per_page=15`;
  return _fetchRepoSubresource(
    `issues:${fullName}`,
    url,
    signal,
    forceRefresh,
    (items) => items.filter(item => !item.pull_request)
  );
}

/**
 * Releases publicadas do repositório (Fase 5 — sob demanda, com cache próprio e erro isolado)
 */
export async function fetchRepoReleases(fullName, signal = null, forceRefresh = false) {
  const url = `${GITHUB_API}/repos/${fullName}/releases?per_page=8`;
  return _fetchRepoSubresource(
    `releases:${fullName}`,
    url,
    signal,
    forceRefresh,
    (items) => items.map(rel => ({
      id: rel.id,
      tag_name: rel.tag_name || '',
      name: rel.name || rel.tag_name || 'Release',
      published_at: rel.published_at || rel.created_at || null,
      prerelease: Boolean(rel.prerelease),
      draft: Boolean(rel.draft),
      html_url: rel.html_url || null
    }))
  );
}

/**
 * GitHub Actions — Status das últimas execuções de workflow (Fase 5 — sob demanda, erro isolado).
 * Regra Crítica:
 *   - Distingue execução falha confirmada ('failure'), execução em andamento ('in_progress'),
 *     cancelada/neutra ('cancelled'), inexistente ('none') e não consultável ('unavailable' / 'permission_denied' / 'rate_limit' / 'offline').
 *   - Falha de request NUNCA vira build vermelho!
 */
export async function fetchRepoActions(fullName, signal = null, forceRefresh = false) {
  const cacheKey = `actions:${fullName}`;

  if (!forceRefresh && _activityCache.has(cacheKey)) {
    const cached = _activityCache.get(cacheKey);
    if (Date.now() - cached.ts < ACTIVITY_CACHE_TTL) {
      return {
        ...cached.payload,
        source: 'cache'
      };
    }
  }

  if (_inflight.has(cacheKey)) {
    return _inflight.get(cacheKey);
  }

  const fetchPromise = _enqueueSubrequest(async () => {
    const nowISO = new Date().toISOString();
    const url = `${GITHUB_API}/repos/${fullName}/actions/runs?per_page=6`;

    try {
      const response = await fetchWithTimeout(url, { signal }, 8500);

      if (!response.ok) {
        const classified = _classifyHttpNonOk(response);
        return {
          data: null,
          runs: [],
          totalCount: null,
          availability: classified.availability, // 'permission_denied' | 'rate_limit' | 'unavailable'
          buildStatus: 'unavailable',
          isConfirmedFailure: false,
          source: classified.source,
          fetchedAt: nowISO,
          error: classified.error
        };
      }

      const raw = await response.json();
      if (!raw || !Array.isArray(raw.workflow_runs)) {
        return {
          data: null,
          runs: [],
          totalCount: null,
          availability: 'unavailable',
          buildStatus: 'unavailable',
          isConfirmedFailure: false,
          source: 'error',
          fetchedAt: nowISO,
          error: 'Formato inesperado de GitHub Actions.'
        };
      }

      const runs = raw.workflow_runs.map(r => ({
        id: r.id,
        name: r.name || r.display_title || 'Workflow',
        displayTitle: r.display_title || r.name || 'Execução',
        status: r.status || 'completed',        // 'completed' | 'in_progress' | 'queued' | 'waiting' | 'pending'
        conclusion: r.conclusion || null,       // 'success' | 'failure' | 'cancelled' | 'skipped' | 'timed_out' | 'neutral'
        headBranch: r.head_branch || '',
        headSha: (r.head_sha || '').slice(0, 7),
        event: r.event || '',
        createdAt: r.created_at || null,
        updatedAt: r.updated_at || r.created_at || null,
        htmlUrl: r.html_url || null
      }));

      const summary = classifyActionsRuns(runs, 'available', nowISO, null);
      const payload = {
        data: runs,
        runs,
        totalCount: typeof raw.total_count === 'number' ? raw.total_count : runs.length,
        availability: 'available',
        buildStatus: summary.buildStatus,
        isConfirmedFailure: summary.isConfirmedFailure,
        latestRun: runs[0] || null,
        source: 'network',
        fetchedAt: nowISO,
        error: null
      };

      _activityCache.set(cacheKey, { payload, ts: Date.now(), fetchedAt: nowISO });
      return payload;

    } catch (err) {
      if (err.name === 'AbortError') {
        return {
          data: null,
          runs: [],
          totalCount: null,
          availability: 'aborted',
          buildStatus: 'unavailable',
          isConfirmedFailure: false,
          source: 'aborted',
          fetchedAt: null,
          error: 'Requisição cancelada.'
        };
      }
      return {
        data: null,
        runs: [],
        totalCount: null,
        availability: 'offline',
        buildStatus: 'unavailable',
        isConfirmedFailure: false,
        source: 'offline',
        fetchedAt: nowISO,
        error: 'Indisponível offline ou falha de rede.'
      };
    }
  }, signal);

  _inflight.set(cacheKey, fetchPromise);
  try {
    return await fetchPromise;
  } finally {
    _inflight.delete(cacheKey);
  }
}

/**
 * Classifica de forma pura uma lista de execuções de Actions ou estado de disponibilidade.
 * Garante que falha de rede/permissão NUNCA vire build vermelho.
 */
export function classifyActionsRuns(runs = [], availability = 'not_fetched', fetchedAt = null, error = null) {
  if (availability !== 'available') {
    const isPerm = availability === 'permission_denied';
    const isRate = availability === 'rate_limit';
    const isNotFetched = availability === 'not_fetched' || !availability;
    return {
      availability: availability || 'unavailable',
      buildStatus: 'unavailable',
      color: 'unavailable',
      icon: isPerm ? '🔒' : '⚪',
      label: isNotFetched
        ? 'Build: Não consultado'
        : isPerm
          ? 'Build: Sem permissão'
          : isRate
            ? 'Build: Indisponível (Rate limit)'
            : 'Build: Indisponível',
      shortLabel: isNotFetched ? 'CI —' : isPerm ? 'Sem permissão' : 'Indisponível',
      detail: error || (isNotFetched ? 'Abra o projeto para consultar o GitHub Actions sob demanda.' : 'Não foi possível consultar o GitHub Actions.'),
      isConfirmedFailure: false,
      isUnavailable: true,
      fetchedAt
    };
  }

  if (!Array.isArray(runs) || runs.length === 0) {
    return {
      availability: 'available',
      buildStatus: 'none',
      color: 'neutral',
      icon: '⚪',
      label: 'Sem workflows / Sem builds',
      shortLabel: 'Sem Actions',
      detail: 'Nenhuma execução de GitHub Actions registrada neste repositório.',
      isConfirmedFailure: false,
      isUnavailable: false,
      fetchedAt
    };
  }

  const latest = runs[0];
  const st = (latest.status || '').toLowerCase();
  const conc = (latest.conclusion || '').toLowerCase();

  if (st !== 'completed') {
    return {
      availability: 'available',
      buildStatus: 'in_progress',
      color: 'yellow',
      icon: '🟡',
      label: 'Build em andamento',
      shortLabel: 'Em andamento',
      detail: `Workflow "${latest.name || 'CI'}" em execução (${st}).`,
      isConfirmedFailure: false,
      isUnavailable: false,
      latestRun: latest,
      fetchedAt
    };
  }

  if (conc === 'success') {
    return {
      availability: 'available',
      buildStatus: 'success',
      color: 'green',
      icon: '🟢',
      label: 'Build: Sucesso',
      shortLabel: 'Build OK',
      detail: `Último workflow "${latest.name || 'CI'}" passou com sucesso.`,
      isConfirmedFailure: false,
      isUnavailable: false,
      latestRun: latest,
      fetchedAt
    };
  }

  if (conc === 'failure' || conc === 'timed_out' || conc === 'startup_failure') {
    return {
      availability: 'available',
      buildStatus: 'failure',
      color: 'red',
      icon: '🔴',
      label: 'Build: Falhou',
      shortLabel: 'Build falhou',
      detail: `Último workflow "${latest.name || 'CI'}" falhou (${conc}).`,
      isConfirmedFailure: true,
      isUnavailable: false,
      latestRun: latest,
      fetchedAt
    };
  }

  // cancelled, skipped, neutral, action_required, stale
  return {
    availability: 'available',
    buildStatus: 'cancelled',
    color: 'yellow',
    icon: '🟡',
    label: conc === 'cancelled' ? 'Build: Cancelado' : 'Build: Neutro / Pulado',
    shortLabel: conc === 'cancelled' ? 'Cancelado' : 'Neutro',
    detail: `Último workflow "${latest.name || 'CI'}" terminou com estado "${conc || 'neutro'}".`,
    isConfirmedFailure: false,
    isUnavailable: false,
    latestRun: latest,
    fetchedAt
  };
}

/**
 * Verifica presença de README no repositório sob demanda (Fase 5).
 * Distingue 404 confirmado (sem README) de falha de rede/rate-limit (indisponível).
 */
export async function fetchRepoReadme(fullName, signal = null, forceRefresh = false) {
  const cacheKey = `readme:${fullName}`;

  if (!forceRefresh && _activityCache.has(cacheKey)) {
    const cached = _activityCache.get(cacheKey);
    if (Date.now() - cached.ts < ACTIVITY_CACHE_TTL) {
      return { ...cached.payload, source: 'cache' };
    }
  }

  if (_inflight.has(cacheKey)) {
    return _inflight.get(cacheKey);
  }

  const fetchPromise = _enqueueSubrequest(async () => {
    const nowISO = new Date().toISOString();
    const url = `${GITHUB_API}/repos/${fullName}/readme`;

    try {
      const response = await fetchWithTimeout(url, { signal }, 8000);

      if (response.status === 404) {
        const payload = {
          availability: 'available',
          present: false,
          size: 0,
          htmlUrl: null,
          source: 'network',
          fetchedAt: nowISO,
          error: null
        };
        _activityCache.set(cacheKey, { payload, ts: Date.now(), fetchedAt: nowISO });
        return payload;
      }

      if (!response.ok) {
        const classified = _classifyHttpNonOk(response);
        return {
          availability: classified.availability,
          present: null,
          size: null,
          htmlUrl: null,
          source: classified.source,
          fetchedAt: nowISO,
          error: classified.error
        };
      }

      const data = await response.json();
      const payload = {
        availability: 'available',
        present: true,
        name: data.name || 'README.md',
        size: Number(data.size) || 0,
        htmlUrl: data.html_url || null,
        source: 'network',
        fetchedAt: nowISO,
        error: null
      };
      _activityCache.set(cacheKey, { payload, ts: Date.now(), fetchedAt: nowISO });
      return payload;
    } catch (err) {
      if (err.name === 'AbortError') {
        return { availability: 'aborted', present: null, size: null, htmlUrl: null, source: 'aborted', fetchedAt: null, error: 'Cancelado.' };
      }
      return {
        availability: 'offline',
        present: null,
        size: null,
        htmlUrl: null,
        source: 'offline',
        fetchedAt: nowISO,
        error: 'Indisponível offline.'
      };
    }
  }, signal);

  _inflight.set(cacheKey, fetchPromise);
  try {
    return await fetchPromise;
  } finally {
    _inflight.delete(cacheKey);
  }
}

// ─────────────────────────────────────────────
// MAPEAMENTO DE LINGUAGENS → CORES
// ─────────────────────────────────────────────
const LANG_COLORS = {
  JavaScript: '#f1e05a',
  TypeScript: '#3178c6',
  Python: '#3572A5',
  Java: '#b07219',
  'C#': '#178600',
  'C++': '#f34b7d',
  C: '#555555',
  Go: '#00ADD8',
  Rust: '#dea584',
  PHP: '#4F5D95',
  Ruby: '#701516',
  Swift: '#FA7343',
  Kotlin: '#A97BFF',
  Dart: '#00B4AB',
  HTML: '#e34c26',
  CSS: '#563d7c',
  Shell: '#89e051',
  Vue: '#41b883',
  SCSS: '#c6538c',
  Dockerfile: '#384d54'
};

export function getLangColor(language) {
  return LANG_COLORS[language] || '#6e7681';
}
