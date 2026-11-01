/**
 * Serviço de Resumo Opcional com IA — Fase 5.
 *
 * Regras rígidas de privacidade, segurança e honestidade:
 *   1. Desligado por padrão (`aiEnabled: false`, `aiConsentGiven: false`).
 *   2. Sem consentimento explícito ativo, NENHUM dado sai do aparelho (bloqueio antes de qualquer chamada de rede).
 *   3. Allowlist estrita de campos no payload: envia apenas contexto público/técnico necessário
 *      (nome, descrição curta, linguagem, commits recentes, PRs abertos, issues abertas, releases e status do último build).
 *   4. NUNCA envia notas privadas (`note`), tarefas pessoais (`tasks`), tokens, segredos ou arquivos completos.
 *   5. Chave de API armazenada apenas no `localStorage` do aparelho (separada do backup JSON exportável),
 *      com aviso explícito de que é extraível no navegador e recomendação de backend/proxy para uso frequente.
 *   6. Exibe prévia exata do payload JSON e do provedor/endpoint de destino antes de enviar.
 *   7. Trata timeout, quota/rate-limit (429/403), JSON inválido, falta de chave e falta de evidência (não inventa fatos).
 *   8. Toda resposta da IA é tratada como TEXTO NÃO CONFIÁVEL (sanitizada/escapada, nunca HTML executável).
 */

import { getState, dispatch } from '../store/store.js';

export const AI_API_KEY_STORAGE = 'panel_ai_api_key_v1';
export const MAX_AI_PAYLOAD_BYTES = 10240; // 10 KB máximo
export const AI_REQUEST_TIMEOUT_MS = 15000;

export const AI_PROVIDERS = Object.freeze({
  gemini: {
    id: 'gemini',
    label: 'Google Gemini API',
    defaultModel: 'gemini-2.5-flash',
    endpointHost: 'https://generativelanguage.googleapis.com',
    buildUrl: (model) => `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model || 'gemini-2.5-flash')}:generateContent`
  },
  openai: {
    id: 'openai',
    label: 'OpenAI Chat Completions',
    defaultModel: 'gpt-4o-mini',
    endpointHost: 'https://api.openai.com/v1/chat/completions',
    buildUrl: () => 'https://api.openai.com/v1/chat/completions'
  },
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic Messages API',
    defaultModel: 'claude-3-5-haiku-latest',
    endpointHost: 'https://api.anthropic.com/v1/messages',
    buildUrl: () => 'https://api.anthropic.com/v1/messages'
  },
  custom_proxy: {
    id: 'custom_proxy',
    label: 'Backend / Proxy Próprio (Recomendado para uso frequente)',
    defaultModel: 'proxy-default',
    endpointHost: 'Endpoint configurado pelo usuário',
    buildUrl: (_model, customUrl) => customUrl || ''
  }
});

// Allowlist explícita de chaves permitidas na raiz do contexto enviado à IA
export const AI_CONTEXT_ALLOWLIST = Object.freeze([
  'projectName',
  'description',
  'language',
  'status',
  'pushedAt',
  'recentCommits',
  'openPullRequests',
  'openIssues',
  'recentReleases',
  'lastBuild'
]);

// Chaves estritamente proibidas em qualquer nível do payload
const FORBIDDEN_KEYS = new Set([
  'note',
  'notes',
  'content',
  'tasks',
  'subtasks',
  'milestones',
  'inbox',
  'token',
  'apikey',
  'api_key',
  'secret',
  'password',
  'authorization',
  'files',
  'sourcecode',
  'rawfile'
]);

// Regex para redigir potenciais tokens ou segredos acidentais em mensagens de commit/PR
const SECRET_PATTERNS = [
  /\bgh[pousr]_[A-Za-z0-9_]{16,255}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{16,255}\b/g,
  /\bsk-[A-Za-z0-9_-]{16,255}\b/g,
  /\bAIza[A-Za-z0-9_-]{20,120}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+/-]+=*\b/gi
];

export function redactSecretsFromText(text) {
  if (!text || typeof text !== 'string') return '';
  let cleaned = text;
  for (const regex of SECRET_PATTERNS) {
    cleaned = cleaned.replace(regex, '[SEGREDO_REDIGIDO]');
  }
  return cleaned;
}

// ─────────────────────────────────────────────
// GESTÃO LOCAL DA CHAVE DE API E DO CONSENTIMENTO
// ─────────────────────────────────────────────
export function getStoredAiApiKey() {
  try {
    return localStorage.getItem(AI_API_KEY_STORAGE) || '';
  } catch {
    return '';
  }
}

export function setStoredAiApiKey(apiKey) {
  try {
    const trimmed = String(apiKey || '').trim();
    if (!trimmed) {
      localStorage.removeItem(AI_API_KEY_STORAGE);
      return false;
    }
    localStorage.setItem(AI_API_KEY_STORAGE, trimmed);
    return true;
  } catch {
    return false;
  }
}

export function clearStoredAiApiKey() {
  try {
    localStorage.removeItem(AI_API_KEY_STORAGE);
    return true;
  } catch {
    return false;
  }
}

/**
 * Revoga o consentimento de uso da IA e, se solicitado pelo usuário, apaga imediatamente a chave salva.
 */
export function revokeAiConsent({ deleteKey = true } = {}) {
  if (deleteKey) {
    clearStoredAiApiKey();
  }
  dispatch({
    type: 'CONFIG_UPDATE',
    payload: {
      aiEnabled: false,
      aiConsentGiven: false,
      aiConsentAt: null
    }
  });
}

// ─────────────────────────────────────────────
// CONSTRUÇÃO DO PAYLOAD COM ALLOWLIST ESTRITA E AUDITORIA DE SEGURANÇA
// ─────────────────────────────────────────────

/**
 * Constrói o payload estritamente filtrado por allowlist a partir dos dados do projeto e atividade remota.
 * NUNCA lê notas privadas (`project.note`), tarefas pessoais (`project.tasks`), tokens ou arquivos completos.
 */
export function buildSanitizedAiPayload(project = {}, remoteActivity = {}, config = {}) {
  const commitsRaw = Array.isArray(remoteActivity?.commits?.data) ? remoteActivity.commits.data : [];
  const pullsRaw = Array.isArray(remoteActivity?.pulls?.data) ? remoteActivity.pulls.data : [];
  const issuesRaw = Array.isArray(remoteActivity?.issues?.data) ? remoteActivity.issues.data : [];
  const releasesRaw = Array.isArray(remoteActivity?.releases?.data) ? remoteActivity.releases.data : [];
  const actionsObj = remoteActivity?.actions || project?.tech?.actions || null;

  const recentCommits = commitsRaw.slice(0, 8).map(c => ({
    sha7: redactSecretsFromText(String(c?.sha || '').slice(0, 7)),
    title: redactSecretsFromText(String(c?.commit?.message || '').split('\n')[0].slice(0, 140)),
    date: c?.commit?.author?.date || null
  })).filter(c => c.title);

  const openPullRequests = pullsRaw.slice(0, 5).map(pr => ({
    number: Number(pr?.number) || 0,
    title: redactSecretsFromText(String(pr?.title || '').slice(0, 140)),
    createdAt: pr?.created_at || null
  })).filter(pr => pr.title);

  const openIssues = issuesRaw.slice(0, 5).map(iss => ({
    number: Number(iss?.number) || 0,
    title: redactSecretsFromText(String(iss?.title || '').slice(0, 140)),
    createdAt: iss?.created_at || null
  })).filter(iss => iss.title);

  const recentReleases = releasesRaw.slice(0, 3).map(rel => ({
    tagName: redactSecretsFromText(String(rel?.tag_name || '').slice(0, 60)),
    name: redactSecretsFromText(String(rel?.name || rel?.tag_name || '').slice(0, 100)),
    publishedAt: rel?.published_at || null
  })).filter(rel => rel.tagName || rel.name);

  let lastBuild = null;
  if (actionsObj && actionsObj.availability === 'available' && actionsObj.buildStatus && actionsObj.buildStatus !== 'none' && actionsObj.buildStatus !== 'unavailable') {
    lastBuild = {
      status: String(actionsObj.buildStatus),
      workflow: redactSecretsFromText(String(actionsObj.latestRun?.name || 'CI').slice(0, 80)),
      updatedAt: actionsObj.latestRun?.updatedAt || actionsObj.fetchedAt || null
    };
  }

  // Monta objeto bruto e aplica filtro de allowlist explícita
  const rawContext = {
    projectName: redactSecretsFromText(String(project?.name || '').slice(0, 100)),
    description: redactSecretsFromText(String(project?.description || '').slice(0, 260)),
    language: project?.language ? String(project.language).slice(0, 40) : null,
    status: String(project?.status || 'ideia'),
    pushedAt: project?.pushedAt || null,
    recentCommits,
    openPullRequests,
    openIssues,
    recentReleases,
    lastBuild
  };

  const allowedContext = {};
  for (const key of AI_CONTEXT_ALLOWLIST) {
    if (Object.prototype.hasOwnProperty.call(rawContext, key)) {
      allowedContext[key] = rawContext[key];
    }
  }

  // Lista transparente de fontes efetivamente presentes
  const sources = [];
  if (recentCommits.length > 0) sources.push(`${recentCommits.length} commit(s) recente(s)`);
  if (openPullRequests.length > 0) sources.push(`${openPullRequests.length} PR(s) aberto(s)`);
  if (openIssues.length > 0) sources.push(`${openIssues.length} issue(s) aberta(s)`);
  if (recentReleases.length > 0) sources.push(`${recentReleases.length} release(s)`);
  if (lastBuild) sources.push(`Status do último build (${lastBuild.status})`);
  if (allowedContext.description) sources.push('Descrição pública do repositório');

  const hasMinimumEvidence =
    recentCommits.length > 0 ||
    openPullRequests.length > 0 ||
    openIssues.length > 0 ||
    recentReleases.length > 0 ||
    Boolean(allowedContext.description && allowedContext.description.trim().length >= 10);

  const providerId = config?.aiProvider || 'gemini';
  const providerSpec = AI_PROVIDERS[providerId] || AI_PROVIDERS.gemini;
  const model = config?.aiModel || providerSpec.defaultModel;
  const destinationUrl = providerSpec.buildUrl(model, config?.aiCustomEndpoint);

  let serializedContext = JSON.stringify(allowedContext, null, 2);
  let payloadBytes = new TextEncoder().encode(serializedContext).length;

  // Se ultrapassar o orçamento de tamanho, trunca commits/issues até caber em MAX_AI_PAYLOAD_BYTES
  if (payloadBytes > MAX_AI_PAYLOAD_BYTES) {
    allowedContext.recentCommits = allowedContext.recentCommits.slice(0, 3);
    allowedContext.openPullRequests = allowedContext.openPullRequests.slice(0, 2);
    allowedContext.openIssues = allowedContext.openIssues.slice(0, 2);
    serializedContext = JSON.stringify(allowedContext, null, 2);
    payloadBytes = new TextEncoder().encode(serializedContext).length;
  }

  const safetyAudit = auditAiPayloadSafety(allowedContext);

  return {
    providerId: providerSpec.id,
    providerLabel: providerSpec.label,
    model,
    destinationUrl,
    destinationHost: providerSpec.endpointHost,
    context: allowedContext,
    serializedContext,
    payloadBytes,
    maxBytes: MAX_AI_PAYLOAD_BYTES,
    sources,
    hasMinimumEvidence,
    safetyAudit
  };
}

/**
 * Audita recursivamente um objeto de payload para garantir que:
 *   1. Apenas chaves na allowlist estão na raiz.
 *   2. Nenhuma chave proibida (`note`, `tasks`, `token`, `apiKey`, `secret`, `files`) existe em qualquer nível.
 *   3. Nenhum padrão de token/segredo está presente no JSON serializado.
 *   4. O tamanho em bytes respeita `MAX_AI_PAYLOAD_BYTES`.
 */
export function auditAiPayloadSafety(contextObj) {
  const violations = [];

  if (!contextObj || typeof contextObj !== 'object') {
    return { safe: false, violations: ['Payload vazio ou inválido.'] };
  }

  // 1. Verifica chaves da raiz contra allowlist
  for (const rootKey of Object.keys(contextObj)) {
    if (!AI_CONTEXT_ALLOWLIST.includes(rootKey)) {
      violations.push(`Chave fora da allowlist na raiz: "${rootKey}"`);
    }
  }

  // 2. Verifica recursivamente chaves proibidas
  function walk(node, path = '') {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach((item, idx) => walk(item, `${path}[${idx}]`));
      return;
    }
    for (const [k, v] of Object.entries(node)) {
      const lower = k.toLowerCase();
      if (FORBIDDEN_KEYS.has(lower)) {
        violations.push(`Campo proibido detectado no payload: "${path ? path + '.' : ''}${k}"`);
      }
      walk(v, path ? `${path}.${k}` : k);
    }
  }
  walk(contextObj);

  // 3. Verifica padrões de segredos e tamanho
  const jsonStr = JSON.stringify(contextObj);
  const byteLen = new TextEncoder().encode(jsonStr).length;
  if (byteLen > MAX_AI_PAYLOAD_BYTES) {
    violations.push(`Payload excede o limite máximo de ${MAX_AI_PAYLOAD_BYTES} bytes (${byteLen} bytes).`);
  }

  for (const regex of SECRET_PATTERNS) {
    regex.lastIndex = 0;
    if (regex.test(jsonStr)) {
      violations.push('Padrão de token ou segredo detectado no texto do payload.');
      break;
    }
  }

  return {
    safe: violations.length === 0,
    violations,
    byteLength: byteLen
  };
}

/**
 * Sanitiza a resposta textual da IA tratando-a estritamente como TEXTO NÃO CONFIÁVEL.
 * Remove tags HTML/scripts e limita tamanho para exibição segura via `textContent`.
 */
export function sanitizeUntrustedAiResponse(rawText) {
  if (typeof rawText !== 'string') return '';
  return rawText
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<\/?[a-z][^>]*>/gi, '')
    .trim()
    .slice(0, 3000);
}

// ─────────────────────────────────────────────
// EXECUÇÃO DA CHAMADA DE IA (COM PORTÕES DE CONSENTIMENTO, EVIDÊNCIA E ERROS)
// ─────────────────────────────────────────────

/**
 * Solicita o resumo do projeto ao provedor configurado.
 *
 * @param {object} params
 * @param {object} params.project
 * @param {object} params.remoteActivity
 * @param {object} [params.stateOverride] — opcional para testes
 * @param {string} [params.apiKeyOverride] — opcional para testes
 * @param {Function} [params.fetchFn] — opcional para injeção em testes de falha/timeout/quota
 * @param {number} [params.timeoutMs]
 */
export async function requestProjectAiSummary({
  project,
  remoteActivity = {},
  stateOverride = null,
  apiKeyOverride = null,
  fetchFn = globalThis.fetch,
  timeoutMs = AI_REQUEST_TIMEOUT_MS
} = {}) {
  const state = stateOverride || getState();
  const config = state?.config || {};

  // PORTÃO 1: Consentimento explícito obrigatório — sem consentimento, NENHUM dado sai do aparelho
  if (!config.aiEnabled || !config.aiConsentGiven) {
    return {
      ok: false,
      errorCode: 'consent_required',
      error: 'O Resumo com IA está desligado ou sem consentimento ativo. Nenhum dado foi enviado.'
    };
  }

  // PORTÃO 2: Chave de API obrigatória (exceto se custom_proxy não exigir, mas validamos chave ou endpoint)
  const apiKey = apiKeyOverride !== null ? apiKeyOverride : getStoredAiApiKey();
  const providerId = config.aiProvider || 'gemini';
  if (providerId !== 'custom_proxy' && (!apiKey || !String(apiKey).trim())) {
    return {
      ok: false,
      errorCode: 'missing_api_key',
      error: 'Chave de API não configurada neste aparelho. Configure sua chave nas Configurações antes de gerar um resumo.'
    };
  }

  if (providerId === 'custom_proxy' && (!config.aiCustomEndpoint || !config.aiCustomEndpoint.trim())) {
    return {
      ok: false,
      errorCode: 'missing_endpoint',
      error: 'URL do endpoint proxy não configurada.'
    };
  }

  // PORTÃO 3: Construção com Allowlist e Auditoria Anti-Vazamento
  const built = buildSanitizedAiPayload(project, remoteActivity, config);
  if (!built.safetyAudit.safe) {
    return {
      ok: false,
      errorCode: 'unsafe_payload_blocked',
      error: `Envio bloqueado pela auditoria de privacidade: ${built.safetyAudit.violations.join('; ')}`
    };
  }

  // PORTÃO 4: Não inventar fatos quando faltar dado (evidência mínima obrigatória)
  if (!built.hasMinimumEvidence || built.sources.length === 0) {
    return {
      ok: false,
      errorCode: 'insufficient_evidence',
      error: 'Dados insuficientes para gerar resumo com evidência (sem commits, PRs, issues, releases ou descrição carregada). A IA não é chamada para evitar invenção de fatos.'
    };
  }

  const systemInstruction = [
    'Você é um assistente técnico objetivo analisando apenas os metadados públicos fornecidos em JSON.',
    'Regras obrigatórias:',
    '1. Responda em português brasileiro claro e conciso (máximo de 4 tópicos curtos).',
    '2. Baseie-se EXCLUSIVAMENTE nos dados presentes no JSON enviado (commits, PRs, issues, releases e build).',
    '3. NUNCA invente fatos, datas, funcionalidades ou métricas que não estejam explícitas no JSON.',
    '4. Se algum dado (como PRs ou builds) estiver vazio no JSON, diga explicitamente que não há registros na amostra considerada.',
    '5. Retorne apenas texto puro, sem blocos HTML.'
  ].join('\n');

  const userPrompt = `Gere um resumo executivo técnico e honesto deste projeto com base apenas nestes dados:\n${built.serializedContext}`;

  // Prepara requisição conforme provedor
  let url = built.destinationUrl;
  let headers = { 'Content-Type': 'application/json' };
  let bodyObj = {};

  if (providerId === 'gemini') {
    url = `${built.destinationUrl}?key=${encodeURIComponent(apiKey.trim())}`;
    bodyObj = {
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 450 }
    };
  } else if (providerId === 'openai') {
    headers['Authorization'] = `Bearer ${apiKey.trim()}`;
    bodyObj = {
      model: built.model || 'gpt-4o-mini',
      temperature: 0.2,
      max_tokens: 450,
      messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: userPrompt }
      ]
    };
  } else if (providerId === 'anthropic') {
    headers['x-api-key'] = apiKey.trim();
    headers['anthropic-version'] = '2023-06-01';
    bodyObj = {
      model: built.model || 'claude-3-5-haiku-latest',
      max_tokens: 450,
      system: systemInstruction,
      messages: [{ role: 'user', content: userPrompt }]
    };
  } else {
    // custom_proxy
    if (apiKey && apiKey.trim()) {
      headers['Authorization'] = `Bearer ${apiKey.trim()}`;
    }
    bodyObj = {
      provider: 'custom_proxy',
      model: built.model,
      system: systemInstruction,
      context: built.context,
      sources: built.sources
    };
  }

  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchFn(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(bodyObj),
      signal: controller.signal
    });
    clearTimeout(timerId);

    if (response.status === 429 || response.status === 402 || response.status === 403) {
      return {
        ok: false,
        errorCode: 'quota_exceeded',
        error: `Limite de uso, quota esgotada ou chave sem permissão no provedor (${built.providerLabel} — HTTP ${response.status}).`
      };
    }

    if (response.status === 401) {
      return {
        ok: false,
        errorCode: 'invalid_api_key',
        error: `Chave de API rejeitada pelo provedor (${built.providerLabel} — HTTP 401). Verifique sua chave nas Configurações.`
      };
    }

    if (!response.ok) {
      return {
        ok: false,
        errorCode: 'provider_error',
        error: `O provedor de IA retornou erro HTTP ${response.status}.`
      };
    }

    let json;
    try {
      json = await response.json();
    } catch {
      return {
        ok: false,
        errorCode: 'invalid_json',
        error: 'O provedor de IA retornou uma resposta com JSON inválido ou corrompido.'
      };
    }

    const extractedText = _extractTextFromProviderJson(providerId, json);
    const cleanText = sanitizeUntrustedAiResponse(extractedText);

    if (!cleanText || cleanText.length < 12) {
      return {
        ok: false,
        errorCode: 'empty_or_ungrounded_response',
        error: 'O provedor retornou uma resposta vazia ou sem conteúdo válido.'
      };
    }

    const summaryRecord = {
      text: cleanText,
      generatedAt: new Date().toISOString(),
      provider: built.providerLabel,
      model: built.model,
      sources: built.sources,
      payloadBytes: built.payloadBytes
    };

    return {
      ok: true,
      summary: summaryRecord,
      previewUsed: built
    };

  } catch (err) {
    clearTimeout(timerId);
    if (err && err.name === 'AbortError') {
      return {
        ok: false,
        errorCode: 'timeout',
        error: `Tempo limite esgotado (${Math.round(timeoutMs / 1000)}s) ao aguardar resposta do provedor de IA.`
      };
    }
    return {
      ok: false,
      errorCode: 'network_error',
      error: `Falha de conexão ao contatar o provedor de IA: ${err?.message || 'erro de rede'}.`
    };
  }
}

function _extractTextFromProviderJson(providerId, json) {
  if (!json || typeof json !== 'object') return '';
  if (providerId === 'gemini') {
    const parts = json?.candidates?.[0]?.content?.parts;
    if (Array.isArray(parts)) {
      return parts.map(p => p?.text || '').join('\n');
    }
  }
  if (providerId === 'openai') {
    return json?.choices?.[0]?.message?.content || '';
  }
  if (providerId === 'anthropic') {
    const content = json?.content;
    if (Array.isArray(content)) {
      return content.map(c => c?.text || '').join('\n');
    }
  }
  if (typeof json.summary === 'string') return json.summary;
  if (typeof json.text === 'string') return json.text;
  return '';
}
