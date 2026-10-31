/**
 * View Modo Foco / Pomodoro (#/focus) — Fase 4
 *
 * Funcionalidades:
 *   - Escolha de Projeto e Tarefa (com suporte a pré-seleção vinda da Home ou Projeto).
 *   - Timer circular animado configurável (Foco / Pausa Curta / Pausa Longa) com controles
 *     baseados na máquina de estados explícita: `idle`, `running`, `paused`, `completed`, `interrupted`.
 *   - Precisão por relógio de parede (`expectedEndAt - Date.now()`), nunca confiando em contagem de `setInterval`.
 *   - Tratamento de reload, aba em segundo plano (`visibilitychange`), suspensão do aparelho e
 *     mudança de horário/fuso do sistema (`clock_inconsistency` / `timezone_changed` / `expired_while_away`),
 *     exigindo confirmação explícita antes de registrar sessão interrompida ou ambígua.
 *   - Modo Cinema: esconde o restante da interface e deixa apenas a tarefa, o timer e fundo animado leve,
 *     com saída por `Esc` e por botão visível.
 *   - Controles de som ambiente (Web Audio API, desligado por padrão, somente após gesto),
 *     haptics opt-in e notificações locais contextuais.
 *   - Estatísticas de foco por tarefa e por projeto + histórico de sessões idempotentes.
 */

import { getState, dispatch, subscribe } from '../store/store.js';
import { getMergedProjects, computeFocusStats, formatLocalDueDate } from '../utils/domain.js';
import { registerViewEffect } from '../fx/effects.js';
import {
  playTimerEndSound,
  triggerHaptic,
  setAmbientSound,
  stopAmbientSound,
  getActiveAmbientSound
} from '../services/feedback.js';
import {
  getNotificationCapability,
  requestContextualNotificationPermission,
  notifyFocusTimerEnd
} from '../services/notifications.js';
import { showToast } from '../components/toast.js';

let _container = null;
let _unsubscribe = null;
let _tickInterval = null;
let _isCinemaMode = false;
let _initialReloadChecked = false;

export const FocusView = {
  mount(container) {
    _container = container;
    _isCinemaMode = false;
    document.body.classList.remove('is-cinema-mode');

    // Verifica se veio com projeto/tarefa pré-selecionado de outra tela
    const preTargetRaw = sessionStorage.getItem('panel_focus_target');
    if (preTargetRaw) {
      sessionStorage.removeItem('panel_focus_target');
      try {
        const parsed = JSON.parse(preTargetRaw);
        const curr = getState().focus?.timer;
        if (curr && curr.status !== 'running') {
          dispatch({
            type: 'FOCUS_SET_TARGET',
            payload: { repoId: parsed.repoId || null, taskId: parsed.taskId || null }
          });
        }
      } catch {
        // Silencioso
      }
    }

    // Se havia sessão 'running' persistida antes de um reload, sincroniza com flag isReload: true
    if (!_initialReloadChecked) {
      _initialReloadChecked = true;
      const st = getState();
      if (st.focus?.timer?.status === 'running') {
        dispatch({
          type: 'FOCUS_SYNC_CLOCK',
          payload: { nowMs: Date.now(), isReload: true }
        });
      }
    }

    _render();
    _syncTickLoop();

    _unsubscribe = subscribe(() => {
      if (_container) {
        _render();
        _syncTickLoop();
      }
    });

    // Listener de visibilitychange para recalcular imediatamente ao voltar para a aba
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const st = getState();
        if (st.focus?.timer?.status === 'running') {
          dispatch({
            type: 'FOCUS_SYNC_CLOCK',
            payload: { nowMs: Date.now(), isReload: false }
          });
        }
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    registerViewEffect(() => document.removeEventListener('visibilitychange', onVisibilityChange));

    // Listener de Escape para sair do Modo Cinema
    const onKeyDown = (e) => {
      if (e.key === 'Escape' && _isCinemaMode) {
        e.preventDefault();
        _setCinemaMode(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    registerViewEffect(() => document.removeEventListener('keydown', onKeyDown));
  },

  unmount() {
    if (_unsubscribe) {
      _unsubscribe();
      _unsubscribe = null;
    }
    _stopTickLoop();
    stopAmbientSound();
    _setCinemaMode(false);
    _container = null;
  }
};

function _setCinemaMode(active) {
  _isCinemaMode = Boolean(active);
  document.body.classList.toggle('is-cinema-mode', _isCinemaMode);
  if (_container) _render();
}

function _syncTickLoop() {
  const st = getState();
  const status = st.focus?.timer?.status;

  if (status === 'running') {
    if (!_tickInterval) {
      _tickInterval = setInterval(_onWallClockTick, 250);
    }
  } else {
    _stopTickLoop();
  }
}

function _stopTickLoop() {
  if (_tickInterval) {
    clearInterval(_tickInterval);
    _tickInterval = null;
  }
}

function _onWallClockTick() {
  const st = getState();
  const timer = st.focus?.timer;
  if (!timer || timer.status !== 'running') {
    _stopTickLoop();
    return;
  }

  const nowMs = Date.now();
  const nowTz = new Date(nowMs).getTimezoneOffset();
  const lastCheck = timer.lastClockCheckAt || timer.startedAt || nowMs;
  const delta = nowMs - lastCheck;

  // Se o relógio do sistema sofreu alteração brusca ou mudança de fuso, delega ao FOCUS_SYNC_CLOCK
  if (delta < -5000 || delta > 6 * 3600 * 1000 || (typeof timer.timezoneOffset === 'number' && nowTz !== timer.timezoneOffset)) {
    dispatch({ type: 'FOCUS_SYNC_CLOCK', payload: { nowMs, timezoneOffset: nowTz } });
    return;
  }

  const remainingMs = Math.max(0, (timer.expectedEndAt || nowMs) - nowMs);

  // Atualiza display em tempo real sem re-renderizar o DOM inteiro a cada 250ms
  _updateLiveTimerDOM(remainingMs, timer.durationMs || 1);

  if (remainingMs <= 0) {
    // Se ficou oculto por muito tempo (> 2 min além do fim esperado), pede confirmação
    const overdueMs = nowMs - (timer.expectedEndAt || nowMs);
    if (overdueMs > 120 * 1000) {
      dispatch({ type: 'FOCUS_SYNC_CLOCK', payload: { nowMs, isReload: true } });
      return;
    }

    // Conclusão legítima com aba ativa ou recém-concluída
    const sessionId = timer.sessionId;
    const mode = timer.mode || 'focus';
    const durationMinutes = Math.max(1, Math.round((timer.durationMs || 1500000) / 60000));
    const { projectName, taskTitle } = _resolveTargetNames(st, timer.repoId, timer.taskId);

    dispatch({
      type: 'FOCUS_COMPLETE_SESSION',
      payload: { sessionId, nowMs }
    });

    playTimerEndSound();
    triggerHaptic([60, 80, 120]);
    notifyFocusTimerEnd({ mode, taskTitle, projectName, durationMinutes });

    showToast(
      mode === 'focus'
        ? `🍅 Sessão de foco concluída (${durationMinutes} min)!`
        : '☕ Pausa concluída! Pronto para o próximo ciclo.',
      { type: 'success', duration: 4500 }
    );
  }
}

function _updateLiveTimerDOM(remainingMs, durationMs) {
  if (!_container) return;
  const digitsEl = _container.querySelector('#focus-clock-digits');
  if (digitsEl) {
    digitsEl.textContent = _formatMsToClock(remainingMs);
  }
  const circleEl = _container.querySelector('#focus-ring-progress-circle');
  if (circleEl) {
    const r = 112;
    const c = 2 * Math.PI * r;
    const frac = Math.max(0, Math.min(1, remainingMs / Math.max(1, durationMs)));
    const offset = +(c * (1 - frac)).toFixed(2);
    circleEl.setAttribute('stroke-dashoffset', String(offset));
  }
}

function _resolveTargetNames(state, repoId, taskId) {
  const projects = getMergedProjects(state);
  const proj = repoId ? projects.find(p => String(p.repoId) === String(repoId)) : null;
  const task = proj && taskId ? proj.tasks.find(t => t.id === taskId) : null;
  return {
    projectName: proj ? proj.name : null,
    taskTitle: task ? task.title : null
  };
}

function _formatMsToClock(ms) {
  const totalSec = Math.max(0, Math.ceil((ms || 0) / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function _render() {
  if (!_container) return;
  const state = getState();
  const timer = state.focus?.timer || { status: 'idle', mode: 'focus', durationMs: 25 * 60 * 1000, remainingMs: 25 * 60 * 1000 };
  const projects = getMergedProjects(state).filter(p => !p.hidden);
  const stats = computeFocusStats(state);
  const notifCap = getNotificationCapability();

  const liveRemainingMs = timer.status === 'running' && timer.expectedEndAt
    ? Math.max(0, timer.expectedEndAt - Date.now())
    : Math.max(0, timer.remainingMs ?? timer.durationMs ?? 1500000);

  const durationMs = Math.max(1000, timer.durationMs || 1500000);
  const frac = Math.max(0, Math.min(1, liveRemainingMs / durationMs));
  const radius = 112;
  const circumference = +(2 * Math.PI * radius).toFixed(2);
  const dashOffset = +(circumference * (1 - frac)).toFixed(2);

  const selectedProj = timer.repoId ? projects.find(p => String(p.repoId) === String(timer.repoId)) : null;
  const openTasks = selectedProj ? selectedProj.tasks.filter(t => !t.completed) : [];
  const selectedTask = selectedProj && timer.taskId ? selectedProj.tasks.find(t => t.id === timer.taskId) : null;

  const statusLabels = {
    idle: 'Pronto para Iniciar',
    running: timer.mode === 'focus' ? '🔥 Em Foco Profundo' : '☕ Em Pausa Restauradora',
    paused: '⏸ Sessão Pausada',
    completed: '✅ Ciclo Concluído',
    interrupted: '⚠️ Sessão Interrompida / Aguardando Confirmação'
  };

  const modeColors = {
    focus: 'var(--accent-primary)',
    shortBreak: '#10b981',
    longBreak: '#06b6d4'
  };
  const ringColor = modeColors[timer.mode] || 'var(--accent-primary)';

  _container.innerHTML = '';

  const page = document.createElement('div');
  page.className = `container view-enter focus-page${_isCinemaMode ? ' is-cinema' : ''}`;

  // ── BARRA SUPERIOR DO MODO CINEMA (Sempre visível quando em Modo Cinema) ──
  if (_isCinemaMode) {
    const cinemaBar = document.createElement('div');
    cinemaBar.className = 'cinema-top-bar';
    cinemaBar.innerHTML = `
      <div class="cinema-badge">
        <span>🎬 Modo Cinema Ativo</span>
        <small style="color:var(--text-muted);">(Pressione Esc para sair)</small>
      </div>
      <button type="button" class="btn btn-secondary btn-sm" id="exit-cinema-btn" aria-label="Sair do Modo Cinema">
        ✕ Sair do Modo Cinema
      </button>
    `;
    cinemaBar.querySelector('#exit-cinema-btn').addEventListener('click', () => _setCinemaMode(false));
    page.appendChild(cinemaBar);
  }

  // ── CABEÇALHO DA PÁGINA (Oculto no Modo Cinema) ──
  if (!_isCinemaMode) {
    const header = document.createElement('div');
    header.className = 'section-header';
    header.style.marginBottom = 'var(--space-6)';
    header.innerHTML = `
      <div>
        <div class="section-eyebrow">🍅 Foco & Produtividade</div>
        <h1 class="section-title" style="font-size:var(--text-2xl);">Modo Foco (Pomodoro)</h1>
        <p style="font-size:var(--text-sm);color:var(--text-secondary);margin-top:4px;">
          Timer preciso baseado no relógio do sistema, com proteção contra suspensão/reload e modo cinema imersivo.
        </p>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
        <button type="button" class="btn btn-secondary btn-sm" id="enter-cinema-btn" title="Esconder toda a interface exceto o timer e a tarefa">
          🎬 Modo Cinema
        </button>
        ${state.config?.gamificationEnabled !== false ? `
          <a href="#/achievements" class="btn btn-ghost btn-sm">🏅 Conquistas & Streak</a>
        ` : ''}
      </div>
    `;
    header.querySelector('#enter-cinema-btn')?.addEventListener('click', () => _setCinemaMode(true));
    page.appendChild(header);
  }

  // ── LAYOUT PRINCIPAL (Timer Central + Painel Lateral de Seleção/Estatísticas) ──
  const layout = document.createElement('div');
  layout.className = 'focus-main-grid';

  // 1. CARD DO TIMER CIRCULAR
  const timerCard = document.createElement('section');
  timerCard.className = 'card focus-timer-card';
  timerCard.setAttribute('aria-label', 'Temporizador Pomodoro');

  // Seletor de Modo (Foco / Pausa Curta / Pausa Longa)
  const modeTabs = document.createElement('div');
  modeTabs.className = 'focus-mode-tabs';
  const modes = [
    { id: 'focus', label: `🍅 Foco (${state.config?.focusDurationMinutes || 25}m)` },
    { id: 'shortBreak', label: `☕ Pausa Curta (${state.config?.shortBreakMinutes || 5}m)` },
    { id: 'longBreak', label: `🌿 Pausa Longa (${state.config?.longBreakMinutes || 15}m)` }
  ];

  for (const m of modes) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `focus-mode-tab${timer.mode === m.id ? ' is-active' : ''}`;
    btn.textContent = m.label;
    btn.disabled = timer.status === 'running';
    btn.addEventListener('click', () => {
      dispatch({ type: 'FOCUS_CONFIGURE_MODE', payload: { mode: m.id } });
    });
    modeTabs.appendChild(btn);
  }
  timerCard.appendChild(modeTabs);

  // Alvo atual (Projeto + Tarefa) visível tanto no modo normal quanto no Modo Cinema
  const targetBanner = document.createElement('div');
  targetBanner.className = 'focus-active-target';
  targetBanner.innerHTML = `
    <div class="focus-target-project">
      <span>${selectedProj ? `${selectedProj.customIcon || '📁'} ${_escape(selectedProj.name)}` : '🎯 Foco Livre (Sem projeto específico)'}</span>
    </div>
    <div class="focus-target-task">
      ${selectedTask
        ? `<strong>Tarefa:</strong> ${_escape(selectedTask.title)}`
        : '<span style="color:var(--text-muted);">Nenhuma tarefa específica selecionada</span>'}
    </div>
  `;
  timerCard.appendChild(targetBanner);

  // SVG Circular do Timer
  const clockWrap = document.createElement('div');
  clockWrap.className = `focus-clock-wrap status-${timer.status}`;
  clockWrap.innerHTML = `
    <svg width="260" height="260" viewBox="0 0 260 260" role="timer" aria-label="Tempo restante no timer">
      <circle
        cx="130" cy="130" r="${radius}"
        fill="none"
        stroke="var(--border-subtle)"
        stroke-width="10"
      />
      <circle
        id="focus-ring-progress-circle"
        cx="130" cy="130" r="${radius}"
        fill="none"
        stroke="${ringColor}"
        stroke-width="10"
        stroke-linecap="round"
        stroke-dasharray="${circumference}"
        stroke-dashoffset="${dashOffset}"
        transform="rotate(-90 130 130)"
        style="transition: stroke-dashoffset 250ms linear;"
      />
    </svg>
    <div class="focus-clock-center">
      <span class="focus-status-pill status-${timer.status}">${statusLabels[timer.status] || timer.status}</span>
      <div id="focus-clock-digits" class="focus-clock-digits tabular">${_formatMsToClock(liveRemainingMs)}</div>
      <span class="focus-clock-sub tabular">Duração total: ${Math.round(durationMs / 60000)} min</span>
    </div>
  `;
  timerCard.appendChild(clockWrap);

  // BANNER DE CONFIRMAÇÃO PARA SESSÃO INTERROMPIDA / AMBÍGUA (Nunca registra automaticamente!)
  if (timer.status === 'interrupted') {
    const elapsedMins = Math.max(1, Math.round((durationMs - liveRemainingMs) / 60000));
    const reasonMessages = {
      expired_while_away: 'O tempo previsto da sessão terminou enquanto o painel estava fechado, recarregado ou suspenso em segundo plano. Para garantir precisão, confirme como deseja tratar esta sessão:',
      timezone_changed: 'Detectamos uma mudança de fuso horário no sistema durante a sessão em andamento. Confirme o que deseja fazer com o tempo decorrido:',
      clock_inconsistency: 'Detectamos uma alteração inesperada no relógio do sistema. Para não registrar dados imprecisos, escolha uma opção abaixo:',
      manual_interrupt: `Você interrompeu a sessão antes do término (${elapsedMins} min decorridos). Sessões interrompidas não são registradas como concluídas sem sua confirmação.`
    };

    const confirmBox = document.createElement('div');
    confirmBox.className = 'focus-interrupted-box';
    confirmBox.setAttribute('role', 'alert');
    confirmBox.innerHTML = `
      <div class="focus-interrupted-title">⚠️ Confirmação Necessária para Sessão Interrompida</div>
      <p class="focus-interrupted-desc">
        ${reasonMessages[timer.ambiguousReason] || reasonMessages.manual_interrupt}
      </p>
      <div class="focus-interrupted-actions">
        ${liveRemainingMs > 0 ? `
          <button type="button" class="btn btn-primary btn-sm" id="btn-resume-interrupted">
            ▶ Retomar (${_formatMsToClock(liveRemainingMs)} restantes)
          </button>
        ` : ''}
        <button type="button" class="btn btn-secondary btn-sm" id="btn-confirm-partial">
          ✅ Registrar ${liveRemainingMs === 0 ? 'Sessão Concluída' : `Tempo Parcial (${elapsedMins} min)`}
        </button>
        <button type="button" class="btn btn-ghost btn-sm" id="btn-discard-interrupted" style="color:var(--status-danger);">
          🗑️ Descartar Sessão
        </button>
      </div>
    `;

    confirmBox.querySelector('#btn-resume-interrupted')?.addEventListener('click', () => {
      dispatch({ type: 'FOCUS_RESUME', payload: { nowMs: Date.now() } });
    });

    confirmBox.querySelector('#btn-confirm-partial')?.addEventListener('click', () => {
      const isPartial = liveRemainingMs > 0;
      dispatch({
        type: 'FOCUS_COMPLETE_SESSION',
        payload: {
          sessionId: timer.sessionId,
          partial: isPartial,
          nowMs: Date.now()
        }
      });
      playTimerEndSound();
      showToast(`✅ Sessão registrada (${isPartial ? `${elapsedMins} min parciais` : 'completa'})!`, {
        type: 'success',
        duration: 3500
      });
    });

    confirmBox.querySelector('#btn-discard-interrupted')?.addEventListener('click', () => {
      dispatch({ type: 'FOCUS_DISCARD' });
      showToast('Sessão descartada sem alterar estatísticas.', { type: 'info', duration: 2500 });
    });

    timerCard.appendChild(confirmBox);
  }

  // CONTROLES PRINCIPAIS DO TIMER (Iniciar, Pausar, Retomar, Pular, Encerrar)
  const controls = document.createElement('div');
  controls.className = 'focus-controls-row';

  if (timer.status === 'idle' || timer.status === 'completed') {
    const startBtn = document.createElement('button');
    startBtn.type = 'button';
    startBtn.className = 'btn btn-primary focus-main-btn';
    startBtn.id = 'focus-start-btn';
    startBtn.innerHTML = `▶ ${timer.status === 'completed' ? 'Iniciar Novo Ciclo' : 'Iniciar Foco'}`;
    startBtn.addEventListener('click', () => {
      dispatch({
        type: 'FOCUS_START',
        payload: {
          nowMs: Date.now(),
          mode: timer.mode || 'focus',
          durationMs: timer.durationMs || (state.config?.focusDurationMinutes || 25) * 60000
        }
      });
      triggerHaptic([20]);
    });
    controls.appendChild(startBtn);
  } else if (timer.status === 'running') {
    const pauseBtn = document.createElement('button');
    pauseBtn.type = 'button';
    pauseBtn.className = 'btn btn-primary focus-main-btn';
    pauseBtn.id = 'focus-pause-btn';
    pauseBtn.textContent = '⏸ Pausar';
    pauseBtn.addEventListener('click', () => {
      dispatch({ type: 'FOCUS_PAUSE', payload: { nowMs: Date.now() } });
    });

    const skipBtn = document.createElement('button');
    skipBtn.type = 'button';
    skipBtn.className = 'btn btn-secondary';
    skipBtn.id = 'focus-skip-btn';
    skipBtn.textContent = '⏭ Pular';
    skipBtn.title = 'Pular para o próximo modo sem registrar sessão';
    skipBtn.addEventListener('click', () => {
      const nextMode = timer.mode === 'focus' ? 'shortBreak' : 'focus';
      dispatch({ type: 'FOCUS_SKIP', payload: { nextMode } });
      showToast(`Ciclo pulado. Modo alterado para ${nextMode === 'focus' ? 'Foco' : 'Pausa Curta'}.`, {
        type: 'info',
        duration: 2500
      });
    });

    const stopBtn = document.createElement('button');
    stopBtn.type = 'button';
    stopBtn.className = 'btn btn-ghost';
    stopBtn.id = 'focus-stop-btn';
    stopBtn.textContent = '⏹ Encerrar';
    stopBtn.addEventListener('click', () => {
      dispatch({
        type: 'FOCUS_INTERRUPT',
        payload: { nowMs: Date.now(), reason: 'manual_interrupt' }
      });
    });

    controls.appendChild(pauseBtn);
    controls.appendChild(skipBtn);
    controls.appendChild(stopBtn);
  } else if (timer.status === 'paused') {
    const resumeBtn = document.createElement('button');
    resumeBtn.type = 'button';
    resumeBtn.className = 'btn btn-primary focus-main-btn';
    resumeBtn.id = 'focus-resume-btn';
    resumeBtn.textContent = '▶ Retomar';
    resumeBtn.addEventListener('click', () => {
      dispatch({ type: 'FOCUS_RESUME', payload: { nowMs: Date.now() } });
    });

    const skipBtn = document.createElement('button');
    skipBtn.type = 'button';
    skipBtn.className = 'btn btn-secondary';
    skipBtn.textContent = '⏭ Pular';
    skipBtn.addEventListener('click', () => {
      const nextMode = timer.mode === 'focus' ? 'shortBreak' : 'focus';
      dispatch({ type: 'FOCUS_SKIP', payload: { nextMode } });
    });

    const stopBtn = document.createElement('button');
    stopBtn.type = 'button';
    stopBtn.className = 'btn btn-ghost';
    stopBtn.textContent = '⏹ Encerrar';
    stopBtn.addEventListener('click', () => {
      dispatch({
        type: 'FOCUS_INTERRUPT',
        payload: { nowMs: Date.now(), reason: 'manual_interrupt' }
      });
    });

    controls.appendChild(resumeBtn);
    controls.appendChild(skipBtn);
    controls.appendChild(stopBtn);
  }

  timerCard.appendChild(controls);

  // BARRA DE ÁUDIO AMBIENTE, SONS E NOTIFICAÇÕES (Sempre disponível)
  const sensoryBar = document.createElement('div');
  sensoryBar.className = 'focus-sensory-bar';
  const activeAmbient = getActiveAmbientSound();

  sensoryBar.innerHTML = `
    <div class="sensory-group">
      <label class="sensory-label" for="ambient-sound-select">🎧 Som Ambiente:</label>
      <select id="ambient-sound-select" class="select select-sm" style="width:auto;min-width:155px;">
        <option value="off" ${activeAmbient === 'off' ? 'selected' : ''}>🔇 Desligado (Padrão)</option>
        <option value="rain" ${activeAmbient === 'rain' ? 'selected' : ''}>🌧️ Chuva Suave</option>
        <option value="brown" ${activeAmbient === 'brown' ? 'selected' : ''}>🌊 Ruído Marrom (Foco)</option>
        <option value="pink" ${activeAmbient === 'pink' ? 'selected' : ''}>🍃 Brisa Rosa</option>
      </select>
    </div>
    <div class="sensory-group">
      <button type="button" class="btn btn-ghost btn-sm" id="toggle-sound-fx-btn" aria-pressed="${Boolean(state.config?.soundEnabled)}">
        ${state.config?.soundEnabled ? '🔊 Efeitos Sonoros: ON' : '🔈 Efeitos Sonoros: OFF'}
      </button>
      <button type="button" class="btn btn-ghost btn-sm" id="toggle-notif-btn">
        ${state.config?.notificationsEnabled && notifCap.permission === 'granted'
          ? '🔔 Notificações: Ativas'
          : '🔕 Avisar no Fim do Foco'}
      </button>
    </div>
  `;

  sensoryBar.querySelector('#ambient-sound-select')?.addEventListener('change', (e) => {
    const val = e.target.value;
    setAmbientSound(val);
    dispatch({ type: 'CONFIG_UPDATE', payload: { ambientSound: val } });
  });

  sensoryBar.querySelector('#toggle-sound-fx-btn')?.addEventListener('click', () => {
    const next = !state.config?.soundEnabled;
    dispatch({ type: 'CONFIG_UPDATE', payload: { soundEnabled: next } });
    if (next) playTimerEndSound(true);
    showToast(next ? '🔊 Efeitos sonoros via Web Audio API ativados.' : '🔈 Efeitos sonoros desligados.', {
      type: 'info',
      duration: 2200
    });
  });

  sensoryBar.querySelector('#toggle-notif-btn')?.addEventListener('click', () => {
    if (state.config?.notificationsEnabled && notifCap.permission === 'granted') {
      dispatch({ type: 'CONFIG_UPDATE', payload: { notificationsEnabled: false } });
      showToast('🔕 Notificações locais desativadas.', { type: 'info', duration: 2200 });
    } else {
      requestContextualNotificationPermission();
    }
  });

  timerCard.appendChild(sensoryBar);
  layout.appendChild(timerCard);

  // 2. COLUNA LATERAL (Oculta em Modo Cinema para imersão total)
  if (!_isCinemaMode) {
    const sideCol = document.createElement('div');
    sideCol.className = 'focus-side-col';

    // Card 2A: Escolher Projeto, Tarefa e Duração Personalizada
    const targetCard = document.createElement('section');
    targetCard.className = 'card';
    targetCard.style.padding = 'var(--space-5)';
    targetCard.innerHTML = `
      <div class="section-eyebrow">🎯 Direcionar Sessão</div>
      <h3 style="font-size:var(--text-base);font-weight:700;margin-bottom:12px;">Projeto, Tarefa & Tempos</h3>
      <div class="input-group" style="margin-bottom:12px;">
        <label class="input-label" for="focus-project-select">Projeto</label>
        <select id="focus-project-select" class="select">
          <option value="">🌐 Foco Livre (Sem projeto específico)</option>
          ${projects.map(p => `
            <option value="${_escape(p.repoId)}" ${String(timer.repoId) === String(p.repoId) ? 'selected' : ''}>
              ${p.customIcon || '📁'} ${_escape(p.name)} (${p.openTasksCount} aberta${p.openTasksCount === 1 ? '' : 's'})
            </option>
          `).join('')}
        </select>
      </div>
      <div class="input-group" style="margin-bottom:12px;">
        <label class="input-label" for="focus-task-select">Tarefa em Foco</label>
        <select id="focus-task-select" class="select" ${!selectedProj ? 'disabled' : ''}>
          <option value="">— Qualquer tarefa do projeto —</option>
          ${openTasks.map(t => `
            <option value="${_escape(t.id)}" ${timer.taskId === t.id ? 'selected' : ''}>
              [${t.priority.toUpperCase()}] ${_escape(t.title)}${t.dueDate ? ` (${formatLocalDueDate(t.dueDate)})` : ''}
            </option>
          `).join('')}
        </select>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:8px;margin-top:14px;">
        <div class="input-group" style="margin-bottom:0;">
          <label class="input-label" for="cfg-focus-min">Foco (min)</label>
          <input id="cfg-focus-min" type="number" min="1" max="180" class="input tabular" value="${state.config?.focusDurationMinutes || 25}" ${timer.status === 'running' ? 'disabled' : ''}/>
        </div>
        <div class="input-group" style="margin-bottom:0;">
          <label class="input-label" for="cfg-short-min">Pausa C. (min)</label>
          <input id="cfg-short-min" type="number" min="1" max="60" class="input tabular" value="${state.config?.shortBreakMinutes || 5}" ${timer.status === 'running' ? 'disabled' : ''}/>
        </div>
        <div class="input-group" style="margin-bottom:0;">
          <label class="input-label" for="cfg-long-min">Pausa L. (min)</label>
          <input id="cfg-long-min" type="number" min="1" max="90" class="input tabular" value="${state.config?.longBreakMinutes || 15}" ${timer.status === 'running' ? 'disabled' : ''}/>
        </div>
      </div>
    `;

    targetCard.querySelector('#focus-project-select')?.addEventListener('change', (e) => {
      const repoId = e.target.value || null;
      dispatch({ type: 'FOCUS_SET_TARGET', payload: { repoId, taskId: null } });
    });

    targetCard.querySelector('#focus-task-select')?.addEventListener('change', (e) => {
      const taskId = e.target.value || null;
      dispatch({ type: 'FOCUS_SET_TARGET', payload: { repoId: timer.repoId, taskId } });
    });

    const bindDurationInput = (sel, configKey, modeName) => {
      targetCard.querySelector(sel)?.addEventListener('change', (e) => {
        const val = Math.max(1, Math.min(180, Number(e.target.value) || 25));
        dispatch({ type: 'CONFIG_UPDATE', payload: { [configKey]: val } });
        if (timer.mode === modeName && timer.status !== 'running') {
          dispatch({ type: 'FOCUS_CONFIGURE_MODE', payload: { mode: modeName, customMinutes: val } });
        }
      });
    };
    bindDurationInput('#cfg-focus-min', 'focusDurationMinutes', 'focus');
    bindDurationInput('#cfg-short-min', 'shortBreakMinutes', 'shortBreak');
    bindDurationInput('#cfg-long-min', 'longBreakMinutes', 'longBreak');

    sideCol.appendChild(targetCard);

    // Card 2B: Resumo de Estatísticas de Foco
    const statsCard = document.createElement('section');
    statsCard.className = 'card';
    statsCard.style.padding = 'var(--space-5)';
    statsCard.innerHTML = `
      <div class="section-eyebrow">📊 Estatísticas Reais</div>
      <h3 style="font-size:var(--text-base);font-weight:700;margin-bottom:12px;">Tempo de Foco Registrado</h3>
      <div class="focus-kpi-grid">
        <div class="focus-kpi-box">
          <span class="focus-kpi-val tabular">${stats.minutesToday} min</span>
          <span class="focus-kpi-lbl">Hoje (${stats.sessionsTodayCount} sess.)</span>
        </div>
        <div class="focus-kpi-box">
          <span class="focus-kpi-val tabular">${stats.minutesThisWeek} min</span>
          <span class="focus-kpi-lbl">Últimos 7 dias</span>
        </div>
        <div class="focus-kpi-box">
          <span class="focus-kpi-val tabular">${stats.totalFocusMinutes} min</span>
          <span class="focus-kpi-lbl">Total (${stats.totalSessionsCount} sess.)</span>
        </div>
      </div>

      <h4 style="font-size:var(--text-xs);text-transform:uppercase;letter-spacing:0.06em;color:var(--text-muted);margin:16px 0 8px;">
        Tempo por Projeto
      </h4>
      ${stats.byProject.length === 0 ? `
        <p style="font-size:var(--text-xs);color:var(--text-muted);">Nenhuma sessão concluída ainda. Inicie um ciclo acima!</p>
      ` : `
        <ul class="focus-breakdown-list">
          ${stats.byProject.slice(0, 5).map(p => `
            <li class="focus-breakdown-item">
              <span>${_escape(p.projectName)}</span>
              <strong class="tabular">${p.minutes} min <small style="color:var(--text-muted);">(${p.sessionsCount}x)</small></strong>
            </li>
          `).join('')}
        </ul>
      `}

      ${stats.byTask.length > 0 ? `
        <h4 style="font-size:var(--text-xs);text-transform:uppercase;letter-spacing:0.06em;color:var(--text-muted);margin:16px 0 8px;">
          Tempo por Tarefa
        </h4>
        <ul class="focus-breakdown-list">
          ${stats.byTask.slice(0, 5).map(t => `
            <li class="focus-breakdown-item">
              <span title="${_escape(t.projectName)}">${_escape(t.taskTitle)} <small style="color:var(--text-muted);">· ${_escape(t.projectName)}</small></span>
              <strong class="tabular">${t.minutes} min</strong>
            </li>
          `).join('')}
        </ul>
      ` : ''}
    `;

    sideCol.appendChild(statsCard);
    layout.appendChild(sideCol);
  }

  page.appendChild(layout);
  _container.appendChild(page);
}

function _escape(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export default FocusView;
