/**
 * Serviço de Notificações Locais (`Notification` API) — Fase 4
 *
 * Regras de arquitetura e privacidade:
 *   1. NUNCA solicita permissão automaticamente no carregamento da página.
 *   2. Solicita permissão SOMENTE após uma ação contextual do usuário, exibindo
 *      primeiro a explicação clara do benefício.
 *   3. Degrada graciosamente quando `Notification` não existir no navegador ou
 *      quando a permissão for `denied` / `default`, sem nunca bloquear o timer.
 *   4. Documenta de forma transparente que notificações locais dependem de o navegador
 *      ou aba estar ativo (sem prometer confiabilidade quando o SO suspende o app; push remoto fora do escopo).
 */

import { getState, dispatch } from '../store/store.js';
import { getTodayLocalISO, getMergedProjects, isTaskOverdue, computeFocusStats } from '../utils/domain.js';
import { openModal } from '../components/modal.js';
import { showToast } from '../components/toast.js';

export function getNotificationCapability() {
  if (typeof window === 'undefined' || typeof window.Notification === 'undefined') {
    return {
      supported: false,
      permission: 'unsupported'
    };
  }
  return {
    supported: true,
    permission: window.Notification.permission // 'default' | 'granted' | 'denied'
  };
}

/**
 * Abre explicação contextual antes de acionar `Notification.requestPermission()`.
 */
export function requestContextualNotificationPermission(onResult) {
  const cap = getNotificationCapability();
  if (!cap.supported) {
    showToast('ℹ Seu navegador não suporta a API de Notificações Locais. Os alertas continuarão funcionando dentro do painel.', {
      type: 'info',
      duration: 5000
    });
    if (onResult) onResult({ granted: false, reason: 'unsupported' });
    return;
  }

  if (cap.permission === 'granted') {
    dispatch({ type: 'CONFIG_UPDATE', payload: { notificationsEnabled: true } });
    showToast('🔔 Notificações locais ativadas!', { type: 'success', duration: 3000 });
    if (onResult) onResult({ granted: true, reason: 'already_granted' });
    return;
  }

  if (cap.permission === 'denied') {
    dispatch({ type: 'CONFIG_UPDATE', payload: { notificationsEnabled: false } });
    showToast('⚠ A permissão de notificações foi negada nas configurações do navegador. O timer e os avisos visuais no painel continuam funcionando normalmente.', {
      type: 'warning',
      duration: 6000
    });
    if (onResult) onResult({ granted: false, reason: 'denied' });
    return;
  }

  // Explicação contextual antes de pedir permissão ao navegador
  const body = document.createElement('div');
  body.style.cssText = 'display:flex;flex-direction:column;gap:12px;';
  body.innerHTML = `
    <p style="color:var(--text-secondary);font-size:var(--text-sm);line-height:1.6;">
      Ativar as <strong>Notificações Locais</strong> permite que o painel avise você quando:
    </p>
    <ul style="color:var(--text-secondary);font-size:var(--text-sm);padding-left:20px;line-height:1.6;">
      <li>🍅 Uma sessão de <strong>Foco (Pomodoro)</strong> ou pausa chegar ao fim enquanto você estiver em outra janela ou aba;</li>
      <li>📅 Houver <strong>tarefas vencendo hoje ou atrasadas</strong> nos seus projetos;</li>
      <li>☀️ O <strong>Resumo Diário opcional</strong> estiver ativo ao abrir ou usar o painel.</li>
    </ul>
    <div style="padding:10px 12px;border-radius:var(--radius-sm);background:var(--bg-surface);border:1px solid var(--border-subtle);font-size:var(--text-xs);color:var(--text-muted);">
      ℹ️ <strong>Nota de transparência:</strong> Como este painel é 100% local (sem servidores de push remoto), as notificações dependem de o navegador/aba estar aberto e ativo no sistema operacional.
    </div>
  `;

  openModal({
    title: '🔔 Ativar Notificações Locais?',
    body,
    confirmLabel: 'Continuar e Permitir no Navegador',
    cancelLabel: 'Agora não',
    onConfirm: async () => {
      try {
        const result = await window.Notification.requestPermission();
        if (result === 'granted') {
          dispatch({ type: 'CONFIG_UPDATE', payload: { notificationsEnabled: true } });
          showToast('🔔 Permissão concedida! Notificações locais ativadas.', { type: 'success', duration: 3500 });
          sendLocalNotification('Painel GitHub · Notificações Ativas', {
            body: 'Você receberá avisos locais ao concluir sessões de foco e lembretes de prazos.'
          });
          if (onResult) onResult({ granted: true, reason: 'granted' });
        } else {
          dispatch({ type: 'CONFIG_UPDATE', payload: { notificationsEnabled: false } });
          showToast('Permissão não concedida. O timer continuará funcionando com alertas na própria tela.', {
            type: 'info',
            duration: 4500
          });
          if (onResult) onResult({ granted: false, reason: result });
        }
      } catch {
        if (onResult) onResult({ granted: false, reason: 'error' });
      }
    }
  });
}

/**
 * Envia uma notificação local de forma segura (nunca lança exceção nem bloqueia o fluxo).
 */
export function sendLocalNotification(title, options = {}) {
  const state = getState();
  if (!state?.config?.notificationsEnabled) return false;

  const cap = getNotificationCapability();
  if (!cap.supported || cap.permission !== 'granted') return false;

  try {
    const n = new window.Notification(title, {
      silent: false,
      ...options
    });
    n.onclick = () => {
      try {
        window.focus();
        n.close();
      } catch {
        // Silencioso
      }
    };
    return true;
  } catch {
    return false;
  }
}

export function notifyFocusTimerEnd({ mode = 'focus', taskTitle = null, projectName = null, durationMinutes = 25 }) {
  const isBreak = mode !== 'focus';
  const title = isBreak
    ? '☕ Pausa concluída! Pronto para voltar ao foco?'
    : `🍅 Sessão de Foco concluída (${durationMinutes} min)!`;

  const body = isBreak
    ? 'Sua pausa terminou. Inicie um novo ciclo de foco quando estiver pronto.'
    : taskTitle
      ? `Tarefa: "${taskTitle}"${projectName ? ` (${projectName})` : ''}`
      : projectName
        ? `Projeto: ${projectName}`
        : 'Excelente trabalho! Faça uma pausa rápida para descansar.';

  return sendLocalNotification(title, {
    body,
    tag: 'painel-focus-timer'
  });
}

/**
 * Verifica tarefas vencidas ou que vencem hoje e envia no máximo 1 lembrete diário por lote,
 * além de disparar o Resumo Diário opcional quando configurado.
 */
export function checkDailyNotificationsAndReminders() {
  const state = getState();
  if (!state?.config?.notificationsEnabled) return;

  const cap = getNotificationCapability();
  if (!cap.supported || cap.permission !== 'granted') return;

  const todayISO = getTodayLocalISO();
  const merged = getMergedProjects(state).filter(p => !p.hidden);

  let overdueCount = 0;
  let dueTodayCount = 0;
  let firstDueTaskTitle = null;

  for (const proj of merged) {
    for (const t of proj.tasks) {
      if (t.completed || !t.dueDate) continue;
      if (isTaskOverdue(t)) {
        overdueCount++;
        if (!firstDueTaskTitle) firstDueTaskTitle = `${t.title} (${proj.name})`;
      } else if (t.dueDate === todayISO) {
        dueTodayCount++;
        if (!firstDueTaskTitle) firstDueTaskTitle = `${t.title} (${proj.name})`;
      }
    }
  }

  // 1. Lembrete de prazos do dia (uma vez por dia)
  const dueKey = `due_check_${todayISO}`;
  if ((overdueCount > 0 || dueTodayCount > 0) && !state.gamification?.notifiedDueTaskIds?.[dueKey]) {
    dispatch({ type: 'NOTIFICATION_MARK_TASK_NOTIFIED', payload: { key: dueKey } });
    sendLocalNotification('📅 Lembrete de Prazos de Hoje', {
      body: `${dueTodayCount} tarefa(s) vencem hoje e ${overdueCount} estão vencidas. Destaque: ${firstDueTaskTitle}`,
      tag: 'painel-due-reminder'
    });
  }

  // 2. Resumo diário opcional (uma vez por dia local enquanto a aba estiver ativa)
  if (state.config?.dailySummaryEnabled && state.gamification?.lastDailySummaryDate !== todayISO) {
    dispatch({ type: 'NOTIFICATION_MARK_DAILY_SUMMARY', payload: { dateISO: todayISO } });
    const focusStats = computeFocusStats(state);
    const openTotal = merged.reduce((acc, p) => acc + p.openTasksCount, 0);
    sendLocalNotification('☀️ Resumo Diário do Painel', {
      body: `${openTotal} tarefa(s) aberta(s) · ${focusStats.minutesToday} min de foco hoje. Escolha uma tarefa prioritária para começar!`,
      tag: 'painel-daily-summary'
    });
  }
}
