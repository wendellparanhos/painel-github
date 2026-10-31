/**
 * Serviço de integração com a GitHub API.
 *
 * Regras rígidas:
 *   - Orçamento de requests: a Home SOMENTE chama listUserRepos(). Zero requisições por repo na home.
 *   - Identificação pelo ID numérico (string) do repositório.
 *   - Nunca inventar dados. Se a API falhar → retorna cache, offline ou erro específico.
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

  try {
    const response = await fetch(url, {
      ...options,
      signal: options.signal || controller.signal
    });
    clearTimeout(timeoutId);
    return response;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

// ─────────────────────────────────────────────
// LISTA DE REPOSITÓRIOS DO USUÁRIO
// (Home somente chama este endpoint — zero requests por repo)
// ─────────────────────────────────────────────

/**
 * Carrega a lista de repositórios públicos do usuário.
 * Usa o cache do estado global passado como parâmetro.
 *
 * @param {object} githubCache — state.githubCache do store
 * @param {boolean} forceRefresh — ignora cache mesmo se ainda válido
 * @param {AbortSignal|null} signal — para cancelamento externo
 * @returns {Promise<{
 *   data: Array|null,
 *   source: 'network'|'cache'|'offline'|'rate-limit'|'error',
 *   fetchedAt: string|null,
 *   rateLimit: object|null,
 *   error: string|null,
 *   rateLimitResetAt: string|null
 * }>}
 */
export async function fetchUserRepos(githubCache, forceRefresh = false, signal = null) {
  const cacheKey = `repos:${GITHUB_USER}`;

  // 1. Verifica cache local antes de ir à rede
  if (!forceRefresh && githubCache.fetchedAt) {
    const age = Date.now() - new Date(githubCache.fetchedAt).getTime();
    if (age < CACHE_TTL_MS && githubCache.repos.length > 0) {
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
  if (!forceRefresh && githubCache.rateLimit && isRateLimited(githubCache.rateLimit)) {
    return {
      data: githubCache.repos.length > 0 ? githubCache.repos : null,
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
        // Erro de rede (offline, DNS, etc.)
        return { data: null, source: 'offline', fetchedAt: null, rateLimit, error: 'Sem conexão com a internet ou servidor inacessível.', rateLimitResetAt: null };
      }

      rateLimit = parseRateLimit(response);

      if (response.status === 403 || response.status === 429) {
        // Rate limit atingido
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

      // GitHub retorna menos de per_page itens na última página
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

      // Reduz tamanho do payload antes de persistir no localStorage (mantém só campos necessários)
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
// ATIVIDADE DE UM REPOSITÓRIO: COMMITS, PRS E ISSUES
// (Chamados sob demanda dentro da tela de projeto, com cache próprio e erro isolado)
// ─────────────────────────────────────────────
const _activityCache = new Map();
const ACTIVITY_CACHE_TTL = 10 * 60 * 1000;

/**
 * Busca genérica de sub-recurso de repositório com isolamento de falha e cache de 10 min.
 */
async function _fetchRepoSubresource(cacheKey, url, signal = null, forceRefresh = false, transformFn = null) {
  if (!forceRefresh && _activityCache.has(cacheKey)) {
    const cached = _activityCache.get(cacheKey);
    if (Date.now() - cached.fetchedAt < ACTIVITY_CACHE_TTL) {
      return { data: cached.data, source: 'cache', error: null };
    }
  }

  if (_inflight.has(cacheKey)) {
    return _inflight.get(cacheKey);
  }

  const fetchPromise = (async () => {
    try {
      const response = await fetchWithTimeout(url, { signal }, 8000);

      if (response.status === 409) {
        // Repositório vazio (ex.: sem commits)
        return { data: [], source: 'network', error: null };
      }

      if (response.status === 403 || response.status === 429) {
        return { data: null, source: 'rate-limit', error: 'Indisponível (limite da API GitHub atingido).' };
      }

      if (response.status === 404 || response.status === 410) {
        return { data: null, source: 'unavailable', error: 'Recurso indisponível ou desativado neste repositório.' };
      }

      if (!response.ok) {
        return { data: null, source: 'error', error: `Indisponível no momento (HTTP ${response.status}).` };
      }

      const rawData = await response.json();
      if (!Array.isArray(rawData)) {
        return { data: null, source: 'error', error: 'Resposta inesperada da API.' };
      }

      const data = transformFn ? transformFn(rawData) : rawData;
      _activityCache.set(cacheKey, { data, fetchedAt: Date.now() });
      return { data, source: 'network', error: null };

    } catch (err) {
      if (err.name === 'AbortError') {
        return { data: null, source: 'aborted', error: 'Requisição cancelada.' };
      }
      return { data: null, source: 'offline', error: 'Indisponível offline ou sem conexão.' };
    }
  })();

  _inflight.set(cacheKey, fetchPromise);
  try {
    return await fetchPromise;
  } finally {
    _inflight.delete(cacheKey);
  }
}

/**
 * Commits recentes do repositório
 * @param {string} fullName — ex.: "wendellparanhos/meu-projeto"
 * @param {AbortSignal|null} signal
 * @param {boolean} forceRefresh
 */
export async function fetchRepoCommits(fullName, signal = null, forceRefresh = false) {
  const url = `${GITHUB_API}/repos/${fullName}/commits?per_page=8`;
  return _fetchRepoSubresource(`commits:${fullName}`, url, signal, forceRefresh);
}

/**
 * Pull Requests abertos do repositório
 * @param {string} fullName
 * @param {AbortSignal|null} signal
 * @param {boolean} forceRefresh
 */
export async function fetchRepoPulls(fullName, signal = null, forceRefresh = false) {
  const url = `${GITHUB_API}/repos/${fullName}/pulls?state=open&per_page=10`;
  return _fetchRepoSubresource(`pulls:${fullName}`, url, signal, forceRefresh);
}

/**
 * Issues abertas do repositório (filtra PRs que a API de issues do GitHub inclui por padrão)
 * @param {string} fullName
 * @param {AbortSignal|null} signal
 * @param {boolean} forceRefresh
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

// ─────────────────────────────────────────────
// MAPEAMENTO DE LINGUAGENS → CORES
// (Subconjunto das principais linguagens do GitHub)
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
