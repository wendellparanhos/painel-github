/**
 * Mascote SVG Reativo Opcional (CodeBuddy) — Fase 4
 *
 * Regras de produto (fase-4-foco.md):
 *   - Puramente cosmético e 100% desligável (`config.gamificationEnabled === false` ou `config.mascotEnabled === false`).
 *   - Reage ao dia:
 *       1. Em Foco (`timer.status === 'running'`): usa visor de concentração.
 *       2. Comemorando (`activeToday === true`): celebra tarefas/sessões concluídas hoje.
 *       3. Cochilando (`daysSinceLastActive >= 2` ou sem atividade recente): tira um cochilo tranquilo
 *          ("Zzz..."), SEM gerar culpa ou pressão por inatividade.
 *       4. Pronto (`ready`): estado amigável aguardando o início do dia.
 */

import { computeStreakStatus, computeFocusStats, computeDailyRingsData } from '../utils/domain.js';

export function computeMascotMood(state) {
  if (state?.config?.gamificationEnabled === false || state?.config?.mascotEnabled === false) {
    return { visible: false };
  }

  const timerStatus = state?.focus?.timer?.status;
  const streak = computeStreakStatus(state);
  const focusStats = computeFocusStats(state);
  const rings = computeDailyRingsData(state);
  const tasksToday = rings?.tasksRing?.value || 0;

  if (timerStatus === 'running') {
    return {
      visible: true,
      mood: 'focus',
      badge: '🎯 Modo Foco',
      title: 'Concentração máxima!',
      message: 'Silenciando distrações enquanto seu cronômetro está rodando.'
    };
  }

  if (streak.activeToday || tasksToday > 0 || focusStats.minutesToday > 0) {
    return {
      visible: true,
      mood: 'celebrating',
      badge: '✨ Dia Produtivo',
      title: 'Mandou muito bem hoje!',
      message: `${tasksToday} tarefa(s) e ${focusStats.minutesToday} min de foco registrados hoje.`
    };
  }

  if (streak.daysSinceLastActive !== null && streak.daysSinceLastActive >= 2) {
    return {
      visible: true,
      mood: 'sleeping',
      badge: '💤 Descansando',
      title: 'Cochilando tranquilo…',
      message: 'Descansar também faz parte do processo criativo. Quando quiser retomar, é só escolher uma tarefa!'
    };
  }

  return {
    visible: true,
    mood: 'ready',
    badge: '🐾 Companheiro',
    title: 'Pronto para começar!',
    message: 'Que tal escolher uma pequena tarefa ou iniciar 25 min de foco?'
  };
}

export function renderMascotWidget(state) {
  const info = computeMascotMood(state);
  if (!info.visible) return null;

  const el = document.createElement('div');
  el.className = `mascot-widget mood-${info.mood}`;
  el.setAttribute('aria-label', `Mascote do painel: ${info.title}`);

  el.innerHTML = `
    <div class="mascot-svg-box" aria-hidden="true">
      ${_getMascotSVG(info.mood)}
    </div>
    <div class="mascot-text-box">
      <div class="mascot-top-row">
        <span class="mascot-mood-badge">${info.badge}</span>
        <strong class="mascot-title">${info.title}</strong>
      </div>
      <p class="mascot-msg">${info.message}</p>
    </div>
  `;

  return el;
}

function _getMascotSVG(mood) {
  if (mood === 'sleeping') {
    return `
      <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
        <circle cx="32" cy="34" r="22" fill="var(--bg-surface)" stroke="var(--border-highlight)" stroke-width="2"/>
        <!-- Orelhas/Antenas -->
        <path d="M18 18 L14 8 L24 14" fill="var(--accent-primary)" opacity="0.7"/>
        <path d="M46 18 L50 8 L40 14" fill="var(--accent-primary)" opacity="0.7"/>
        <!-- Olhos fechados tranquilos -->
        <path d="M21 33 Q25 37 29 33" stroke="var(--text-secondary)" stroke-width="2.5" stroke-linecap="round" fill="none"/>
        <path d="M35 33 Q39 37 43 33" stroke="var(--text-secondary)" stroke-width="2.5" stroke-linecap="round" fill="none"/>
        <!-- Boca serena -->
        <path d="M29 42 Q32 44 35 42" stroke="var(--text-muted)" stroke-width="2" stroke-linecap="round" fill="none"/>
        <!-- Zzz -->
        <text x="45" y="18" fill="var(--accent-secondary)" font-size="10" font-weight="800" font-family="var(--font-mono)">Zzz</text>
      </svg>
    `;
  }

  if (mood === 'focus') {
    return `
      <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
        <circle cx="32" cy="34" r="22" fill="var(--bg-surface)" stroke="var(--accent-primary)" stroke-width="2.5"/>
        <path d="M18 18 L14 8 L24 14" fill="var(--accent-primary)"/>
        <path d="M46 18 L50 8 L40 14" fill="var(--accent-primary)"/>
        <!-- Visor Cyber de Foco -->
        <rect x="16" y="26" width="32" height="11" rx="5.5" fill="var(--accent-primary)" opacity="0.9"/>
        <line x1="20" y1="31.5" x2="44" y2="31.5" stroke="#ffffff" stroke-width="2" stroke-linecap="round"/>
        <!-- Expressão determinada -->
        <path d="M28 43 L36 43" stroke="var(--text-main)" stroke-width="2.2" stroke-linecap="round"/>
      </svg>
    `;
  }

  if (mood === 'celebrating') {
    return `
      <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
        <circle cx="32" cy="34" r="22" fill="var(--bg-surface)" stroke="#10b981" stroke-width="2.5"/>
        <path d="M18 18 L14 8 L24 14" fill="#10b981"/>
        <path d="M46 18 L50 8 L40 14" fill="#10b981"/>
        <!-- Olhos felizes em arco -->
        <path d="M21 32 Q25 27 29 32" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" fill="none"/>
        <path d="M35 32 Q39 27 43 32" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" fill="none"/>
        <!-- Sorriso aberto -->
        <path d="M25 40 Q32 47 39 40" stroke="var(--text-main)" stroke-width="2.5" stroke-linecap="round" fill="none"/>
        <circle cx="14" cy="24" r="2" fill="#f59e0b"/>
        <circle cx="51" cy="22" r="2.5" fill="#a855f7"/>
      </svg>
    `;
  }

  // Default: 'ready'
  return `
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
      <circle cx="32" cy="34" r="22" fill="var(--bg-surface)" stroke="var(--border-highlight)" stroke-width="2"/>
      <path d="M18 18 L14 8 L24 14" fill="var(--accent-primary)"/>
      <path d="M46 18 L50 8 L40 14" fill="var(--accent-primary)"/>
      <circle cx="25" cy="32" r="3" fill="var(--text-main)"/>
      <circle cx="39" cy="32" r="3" fill="var(--text-main)"/>
      <path d="M27 41 Q32 45 37 41" stroke="var(--text-main)" stroke-width="2.2" stroke-linecap="round" fill="none"/>
    </svg>
  `;
}
