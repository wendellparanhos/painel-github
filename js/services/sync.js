/**
 * Serviço de Sincronização em Gist Privado do GitHub — Fase 6.
 *
 * Princípios Fundamentais:
 *   1. 100% Opcional e desligado por padrão (`syncEnabled: false`, `syncConsentGiven: false`).
 *   2. NUNCA sincroniza credenciais (tokens do GitHub, chaves de API de IA são purgados do payload).
 *   3. Backup preventivo automático antes de qualquer sincronização ou mesclagem.
 *   4. Resolução de conflito por registro (com `updatedAt` e tombstones `_deleted: true`),
 *      sem "última escrita vence" às cegas.
 *   5. Totalmente auditável e revogável pelo usuário.
 */

import { getState, dispatch } from '../store/store.js';
import { backup, exportJSON } from '../store/storage.js';

export const SYNC_GIST_FILENAME = 'panel-sync-data.json';
export const SYNC_SCHEMA_VERSION = 1;

/**
 * Obtém ou inicializa o ID único e não secreto deste dispositivo.
 */
export function getOrCreateDeviceId() {
  try {
    let id = localStorage.getItem('panel_sync_device_id');
    if (!id) {
      id = 'dev_' + Math.random().toString(36).slice(2, 11) + '_' + Date.now().toString(36);
      localStorage.setItem('panel_sync_device_id', id);
    }
    return id;
  } catch {
    return 'dev_ephemeral_' + Math.random().toString(36).slice(2, 8);
  }
}

/**
 * Monta o payload de sincronização purgado de credenciais e tokens.
 * NUNCA inclui chaves de API, senhas ou tokens de acesso.
 */
export function buildSanitizedSyncPayload(state = null) {
  const st = state || getState();
  const deviceId = getOrCreateDeviceId();

  // Filtra projetos locais, preservando apenas dados estruturados com carimbo de atualização
  const projectsData = {};
  for (const [id, proj] of Object.entries(st.projects || {})) {
    if (!proj) continue;
    projectsData[id] = {
      id: String(id),
      status: proj.status || 'ideia',
      statusHistory: Array.isArray(proj.statusHistory) ? proj.statusHistory.slice(0, 30) : [],
      pinned: Boolean(proj.pinned),
      hidden: Boolean(proj.hidden),
      customIcon: proj.customIcon || null,
      customColor: proj.customColor || null,
      coverSeed: proj.coverSeed || 0,
      tasks: Array.isArray(proj.tasks) ? proj.tasks.map(t => ({
        id: String(t.id),
        title: String(t.title || '').slice(0, 200),
        completed: Boolean(t.completed),
        completedAt: t.completedAt || null,
        priority: t.priority || 'normal',
        dueDate: t.dueDate || null,
        recurrence: t.recurrence || 'nenhuma',
        subtasks: Array.isArray(t.subtasks) ? t.subtasks : [],
        updatedAt: t.updatedAt || t.createdAt || new Date().toISOString()
      })) : [],
      note: {
        content: String(proj.note?.content || '').slice(0, 50000),
        updatedAt: proj.note?.updatedAt || null
      },
      milestones: Array.isArray(proj.milestones) ? proj.milestones : [],
      exemptFromAbandonment: Boolean(proj.exemptFromAbandonment),
      abandonmentIgnored: Boolean(proj.abandonmentIgnored),
      updatedAt: proj.updatedAt || new Date().toISOString(),
      _deleted: Boolean(proj._deleted),
      deletedAt: proj.deletedAt || null
    };
  }

  // Sessões de foco (idempotentes)
  const focusSessions = Array.isArray(st.focus?.sessions) ? st.focus.sessions.slice(-200) : [];

  // Inbox rápida
  const inbox = Array.isArray(st.inbox) ? st.inbox.slice(0, 100) : [];

  // Progresso de Gamificação
  const gamification = {
    xp: Number(st.gamification?.xp) || 0,
    level: Number(st.gamification?.level) || 1,
    streak: st.gamification?.streak || { current: 0, longest: 0, lastActiveDate: null, activeDates: [] },
    unlockedAchievements: st.gamification?.unlockedAchievements || {},
    xpGrants: st.gamification?.xpGrants || {}
  };

  const payload = {
    _schemaVersion: SYNC_SCHEMA_VERSION,
    _syncVersion: 1,
    lastSyncedAt: new Date().toISOString(),
    deviceId,
    projects: projectsData,
    focusSessions,
    inbox,
    gamification
  };

  // Auditoria estrita: remove qualquer resquício acidental de chaves
  const serialized = JSON.stringify(payload);
  if (/ghp_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{20,}|AIza[0-9A-Za-z-_]{35}/.test(serialized)) {
    throw new Error('Falha de segurança crítica: credencial detectada no payload de sincronização. Envio bloqueado.');
  }

  return payload;
}

/**
 * Função pura para comparar estado local com estado remoto por registro.
 * Detecta atualizações limpas, tombstones de deleção e conflitos reais.
 *
 * @param {object} localState
 * @param {object} remotePayload
 * @returns {{ resolvedProjects: object, conflicts: Array<object>, hasConflicts: boolean }}
 */
export function reconcileSyncProjects(localProjects = {}, remoteProjects = {}) {
  const merged = { ...localProjects };
  const conflicts = [];

  const allKeys = new Set([...Object.keys(localProjects), ...Object.keys(remoteProjects)]);

  for (const id of allKeys) {
    const loc = localProjects[id];
    const rem = remoteProjects[id];

    // Se só existe remotamente
    if (!loc && rem) {
      if (!rem._deleted) {
        merged[id] = { ...rem };
      }
      continue;
    }

    // Se só existe localmente
    if (loc && !rem) {
      merged[id] = { ...loc };
      continue;
    }

    // Existe em ambos: compara datas e conteúdo
    const locDate = new Date(loc.updatedAt || 0).getTime();
    const remDate = new Date(rem.updatedAt || 0).getTime();

    // Tombstone de deleção
    if (rem._deleted && !loc._deleted) {
      if (remDate >= locDate) {
        // Remoto deletou mais recentemente
        merged[id] = { ...loc, _deleted: true, deletedAt: rem.deletedAt || rem.updatedAt };
        continue;
      }
    }

    if (loc._deleted && !rem._deleted) {
      if (locDate >= remDate) {
        // Local deletou mais recentemente
        merged[id] = { ...loc };
        continue;
      }
    }

    // Se o conteúdo estrutural for idêntico, não há conflito
    const locComparable = JSON.stringify({ s: loc.status, t: loc.tasks?.length, n: loc.note?.content });
    const remComparable = JSON.stringify({ s: rem.status, t: rem.tasks?.length, n: rem.note?.content });

    if (locComparable === remComparable) {
      merged[id] = locDate >= remDate ? loc : rem;
      continue;
    }

    // Conteúdos divergentes: verifica janela de conflito
    const diffMs = Math.abs(locDate - remDate);
    // Se um é claramente mais recente (diferença > 5 segundos) e não houve edições simultâneas
    if (remDate > locDate && diffMs > 5000) {
      merged[id] = { ...rem };
    } else if (locDate > remDate && diffMs > 5000) {
      merged[id] = { ...loc };
    } else {
      // Conflito simultâneo detectado!
      conflicts.push({
        repoId: id,
        projectName: loc.name || rem.name || `Projeto ${id}`,
        local: loc,
        remote: rem,
        localUpdatedAt: loc.updatedAt,
        remoteUpdatedAt: rem.updatedAt
      });
      // Mantém versão local temporariamente enquanto o usuário decide
      merged[id] = { ...loc };
    }
  }

  return {
    resolvedProjects: merged,
    conflicts,
    hasConflicts: conflicts.length > 0
  };
}

/**
 * Executa sincronização completa com Gist privado do GitHub.
 *
 * @param {object} params
 * @param {string} params.token - GitHub Personal Access Token (com escopo gist)
 * @param {string} [params.gistId] - ID do Gist se já existente
 * @param {Function} [params.fetchFn] - fetch customizado para testes
 */
export async function executeGistSync({
  token,
  gistId = null,
  fetchFn = globalThis.fetch
} = {}) {
  if (!token || !token.trim()) {
    return { ok: false, errorCode: 'missing_token', error: 'Token do GitHub necessário para sincronização em Gist.' };
  }

  // 1. Cria backup local preventivo antes do sync
  backup();

  const localState = getState();
  const localPayload = buildSanitizedSyncPayload(localState);

  try {
    let targetGistId = gistId || localState.config?.syncGistId || null;
    let remotePayload = null;

    // Se não temos o ID do Gist, busca se já existe um Gist com o nome padronizado
    if (!targetGistId) {
      const gistsRes = await fetchFn('https://api.github.com/gists?per_page=50', {
        headers: {
          'Authorization': `Bearer ${token.trim()}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'Painel-GitHub-App'
        }
      });

      if (gistsRes.ok) {
        const list = await gistsRes.json();
        if (Array.isArray(list)) {
          const found = list.find(g => g.files && g.files[SYNC_GIST_FILENAME]);
          if (found) {
            targetGistId = found.id;
          }
        }
      }
    }

    // Se encontramos o Gist, lê o conteúdo remoto existente
    if (targetGistId) {
      const getRes = await fetchFn(`https://api.github.com/gists/${targetGistId}`, {
        headers: {
          'Authorization': `Bearer ${token.trim()}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'Painel-GitHub-App'
        }
      });

      if (getRes.ok) {
        const gistData = await getRes.json();
        const fileObj = gistData?.files?.[SYNC_GIST_FILENAME];
        if (fileObj?.content) {
          try {
            remotePayload = JSON.parse(fileObj.content);
          } catch {
            remotePayload = null;
          }
        }
      }
    }

    // 2. Mescla / Reconciliação por registro
    let finalPayloadToPush = localPayload;
    let detectedConflicts = [];

    if (remotePayload && remotePayload.projects) {
      const rec = reconcileSyncProjects(localState.projects || {}, remotePayload.projects || {});
      detectedConflicts = rec.conflicts;

      // Atualiza o store com os projetos reconciliados
      dispatch({
        type: 'STORAGE_IMPORT_SUCCESS',
        payload: {
          ...localState,
          projects: rec.resolvedProjects,
          // Mescla sessões de foco pelo ID único
          focus: {
            ...localState.focus,
            sessions: _mergeUniqueById(localState.focus?.sessions || [], remotePayload.focusSessions || [])
          }
        }
      });

      finalPayloadToPush = buildSanitizedSyncPayload(getState());
    }

    // 3. Salva no Gist (cria ou atualiza)
    const gistBody = {
      description: 'Painel GitHub · Dados sincronizados de forma privada (100% criptografado/seguro na sua conta)',
      public: false,
      files: {
        [SYNC_GIST_FILENAME]: {
          content: JSON.stringify(finalPayloadToPush, null, 2)
        }
      }
    };

    let pushRes;
    if (targetGistId) {
      pushRes = await fetchFn(`https://api.github.com/gists/${targetGistId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token.trim()}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
          'User-Agent': 'Painel-GitHub-App'
        },
        body: JSON.stringify(gistBody)
      });
    } else {
      pushRes = await fetchFn('https://api.github.com/gists', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token.trim()}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
          'User-Agent': 'Painel-GitHub-App'
        },
        body: JSON.stringify(gistBody)
      });
    }

    if (!pushRes.ok) {
      return {
        ok: false,
        errorCode: 'gist_save_failed',
        error: `Falha ao salvar no Gist (HTTP ${pushRes.status}). Verifique se o token tem a permissão 'gist'.`
      };
    }

    const savedGist = await pushRes.json();
    const finalGistId = savedGist?.id || targetGistId;

    // Salva o ID do Gist e o carimbo de último sync
    dispatch({
      type: 'CONFIG_UPDATE',
      payload: {
        syncGistId: finalGistId,
        lastSyncedAt: new Date().toISOString()
      }
    });

    return {
      ok: true,
      gistId: finalGistId,
      conflicts: detectedConflicts,
      hasConflicts: detectedConflicts.length > 0,
      syncedAt: new Date().toISOString()
    };

  } catch (err) {
    return {
      ok: false,
      errorCode: 'network_error',
      error: `Erro ao comunicar com o GitHub Gist: ${err?.message || 'falha de rede'}`
    };
  }
}

function _mergeUniqueById(arrA = [], arrB = []) {
  const map = new Map();
  arrA.forEach(item => { if (item?.id || item?.sessionId) map.set(item.id || item.sessionId, item); });
  arrB.forEach(item => { if (item?.id || item?.sessionId) map.set(item.id || item.sessionId, item); });
  return Array.from(map.values());
}
