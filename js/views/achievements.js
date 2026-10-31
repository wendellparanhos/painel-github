/**
 * View Conquistas, Níveis, Streak & Metas Semanais (#/achievements) — Fase 4
 *
 * Funcionalidades:
 *   - Barra de XP, Nível atual e título, com explicação transparente das recompensas
 *     idempotentes (+15 XP tarefa, +25 XP foco, +100 XP projeto concluído).
 *   - Streak com regra documentada (chave única de dia local YYYY-MM-DD, fuso horário
 *     declarado e proteção contra virada de data/fuso sem recalcular histórico silenciosamente).
 *   - Metas semanais e diárias configuráveis com barras de progresso.
 *   - Galeria de Conquistas (Badges) com progresso individual e data de desbloqueio.
 *   - Mascote SVG opcional reativo ao dia.
 *   - Se a gamificação estiver desligada nas Configurações, exibe aviso limpo sem elementos de jogo.
 */

import { getState, dispatch, subscribe } from '../store/store.js';
import {
  computeLevelInfo,
  computeStreakStatus,
  computeWeeklyGoalsProgress,
  evaluateAchievements,
  XP_REWARDS
} from '../utils/domain.js';
import { renderMascotWidget } from '../components/mascot.js';
import { showToast } from '../components/toast.js';

let _container = null;
let _unsubscribe = null;

export const AchievementsView = {
  mount(container) {
    _container = container;
    _render();
    _unsubscribe = subscribe(() => {
      if (_container) _render();
    });
  },

  unmount() {
    if (_unsubscribe) {
      _unsubscribe();
      _unsubscribe = null;
    }
    _container = null;
  }
};

function _render() {
  if (!_container) return;
  const state = getState();
  _container.innerHTML = '';

  const page = document.createElement('div');
  page.className = 'container view-enter';

  // Se a gamificação estiver completamente desligada, respeita a escolha e mostra apenas opção de reativar
  if (state.config?.gamificationEnabled === false) {
    page.innerHTML = `
      <div class="card" style="padding:var(--space-8);text-align:center;max-width:520px;margin:var(--space-8) auto;">
        <div style="font-size:2.5rem;margin-bottom:12px;">🛑</div>
        <h1 style="font-size:var(--text-xl);font-weight:700;margin-bottom:8px;">Gamificação Desativada</h1>
        <p style="font-size:var(--text-sm);color:var(--text-secondary);margin-bottom:20px;">
          Conforme sua preferência nas Configurações, toda a interface de XP, níveis, streak, mascote e conquistas está oculta.
        </p>
        <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
          <button type="button" class="btn btn-primary" id="reenable-gamification-btn">Reativar Gamificação</button>
          <a href="#/home" class="btn btn-secondary">Voltar aos Projetos</a>
        </div>
      </div>
    `;
    page.querySelector('#reenable-gamification-btn')?.addEventListener('click', () => {
      dispatch({ type: 'CONFIG_UPDATE', payload: { gamificationEnabled: true } });
      showToast('Gamificação reativada!', { type: 'success', duration: 2500 });
    });
    _container.appendChild(page);
    return;
  }

  const xp = state.gamification?.xp || 0;
  const levelInfo = computeLevelInfo(xp);
  const streak = computeStreakStatus(state);
  const weekly = computeWeeklyGoalsProgress(state);
  const ach = evaluateAchievements(state);

  // Cabeçalho
  const header = document.createElement('div');
  header.className = 'section-header';
  header.style.marginBottom = 'var(--space-6)';
  header.innerHTML = `
    <div>
      <div class="section-eyebrow">🏅 Progresso & Consistência</div>
      <h1 class="section-title" style="font-size:var(--text-2xl);">Conquistas, Nível & Streak</h1>
      <p style="font-size:var(--text-sm);color:var(--text-secondary);margin-top:4px;">
        Recompensas idempotentes por entregas reais (sem inflar pontos por reabrir tarefas ou alternar status).
      </p>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <a href="#/focus" class="btn btn-primary btn-sm">🍅 Ir para Modo Foco</a>
      <a href="#/settings" class="btn btn-ghost btn-sm">⚙️ Configurar Gamificação</a>
    </div>
  `;
  page.appendChild(header);

  // Mascote SVG Opcional (se habilitado)
  const mascotEl = renderMascotWidget(state);
  if (mascotEl) {
    mascotEl.style.marginBottom = 'var(--space-6)';
    page.appendChild(mascotEl);
  }

  // Grade Superior: Nível/XP + Streak + Metas Semanais
  const topGrid = document.createElement('div');
  topGrid.className = 'achievements-top-grid';

  // 1. Card de Nível e Barra de XP
  const levelCard = document.createElement('section');
  levelCard.className = 'card';
  levelCard.style.padding = 'var(--space-5)';
  levelCard.innerHTML = `
    <div class="section-eyebrow">⚡ Experiência (XP)</div>
    <div style="display:flex;align-items:center;gap:14px;margin:10px 0 14px;">
      <div class="level-badge-hex" aria-hidden="true">${levelInfo.level}</div>
      <div>
        <div style="font-size:var(--text-lg);font-weight:800;">Nível ${levelInfo.level} · ${levelInfo.title}</div>
        <div class="tabular" style="font-size:var(--text-xs);color:var(--text-secondary);">
          ${levelInfo.xp} XP total · Faltam ${levelInfo.xpToNextLevel} XP para o Nível ${levelInfo.level + 1}
        </div>
      </div>
    </div>
    <div class="xp-bar-track" role="progressbar" aria-valuenow="${levelInfo.currentLevelXp}" aria-valuemin="0" aria-valuemax="${levelInfo.nextLevelXp}">
      <div class="xp-bar-fill" style="width:${Math.round(levelInfo.progress * 100)}%;"></div>
    </div>
    <div style="display:flex;justify-content:space-between;font-size:var(--text-xs);color:var(--text-muted);margin-top:6px;" class="tabular">
      <span>${levelInfo.currentLevelXp} / ${levelInfo.nextLevelXp} XP no nível</span>
      <span>${Math.round(levelInfo.progress * 100)}%</span>
    </div>
    <div class="xp-rules-pills">
      <span class="xp-rule-pill">+${XP_REWARDS.TASK_COMPLETE} XP / tarefa</span>
      <span class="xp-rule-pill">+${XP_REWARDS.FOCUS_COMPLETE} XP / sessão foco</span>
      <span class="xp-rule-pill">+${XP_REWARDS.PROJECT_COMPLETE} XP / projeto concluído</span>
    </div>
  `;
  topGrid.appendChild(levelCard);

  // 2. Card de Streak (com Regra Documentada de Fuso Local)
  const streakCard = document.createElement('section');
  streakCard.className = 'card';
  streakCard.style.padding = 'var(--space-5)';
  streakCard.innerHTML = `
    <div class="section-eyebrow">🔥 Sequência Diária (Streak)</div>
    <div style="display:flex;align-items:baseline;justify-content:space-between;margin:10px 0;">
      <div>
        <span class="tabular" style="font-size:2.2rem;font-weight:800;color:var(--accent-primary);">${streak.current}</span>
        <span style="font-size:var(--text-sm);color:var(--text-secondary);font-weight:600;"> dia(s) seguido(s)</span>
      </div>
      <div style="text-align:right;">
        <div style="font-size:var(--text-xs);color:var(--text-muted);">Recorde Pessoal</div>
        <strong class="tabular" style="font-size:var(--text-base);">${streak.longest} dia(s)</strong>
      </div>
    </div>
    <p style="font-size:var(--text-xs);color:var(--text-secondary);margin-bottom:10px;">
      ${streak.activeToday
        ? '✅ Atividade significativa registrada hoje! Seu streak está garantido.'
        : '⏳ Conclua 1 tarefa, 1 sessão de foco ou 1 projeto hoje para avançar sua sequência.'}
    </p>
    <div class="streak-rule-doc">
      <strong>📏 Regra Documentada de Dia & Fuso:</strong>
      <div>• Fuso declarado: <code class="tabular">${streak.timezone.timeZone} (${streak.timezone.utcLabel})</code></div>
      <div>• Chave única: dia civil local (<code class="tabular">YYYY-MM-DD</code> à meia-noite local).</div>
      <div>• Mudanças de fuso em viagem preservam o histórico sem recalcular datas passadas.</div>
    </div>
  `;
  topGrid.appendChild(streakCard);

  // 3. Card de Metas Semanais Configuráveis
  const goalsCard = document.createElement('section');
  goalsCard.className = 'card';
  goalsCard.style.padding = 'var(--space-5)';
  goalsCard.innerHTML = `
    <div class="section-eyebrow">🎯 Metas da Semana (7 dias)</div>
    <h3 style="font-size:var(--text-base);font-weight:700;margin:6px 0 12px;">Progresso & Ajuste Rápido</h3>

    <div style="margin-bottom:12px;">
      <div style="display:flex;justify-content:space-between;font-size:var(--text-xs);margin-bottom:4px;">
        <span>Tarefas Concluídas (7d)</span>
        <strong class="tabular">${weekly.tasksCompletedWeek} / ${weekly.weeklyTasksGoal}</strong>
      </div>
      <div class="xp-bar-track">
        <div class="xp-bar-fill" style="width:${Math.round(weekly.tasksProgress * 100)}%;background:#10b981;"></div>
      </div>
    </div>

    <div style="margin-bottom:14px;">
      <div style="display:flex;justify-content:space-between;font-size:var(--text-xs);margin-bottom:4px;">
        <span>Minutos de Foco (7d)</span>
        <strong class="tabular">${weekly.focusMinutesWeek} / ${weekly.weeklyFocusGoalMinutes} min</strong>
      </div>
      <div class="xp-bar-track">
        <div class="xp-bar-fill" style="width:${Math.round(weekly.focusProgress * 100)}%;background:#06b6d4;"></div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
      <div class="input-group" style="margin-bottom:0;">
        <label class="input-label" for="goal-weekly-tasks">Meta Tarefas/Sem.</label>
        <input id="goal-weekly-tasks" type="number" min="1" max="200" class="input tabular" value="${weekly.weeklyTasksGoal}" />
      </div>
      <div class="input-group" style="margin-bottom:0;">
        <label class="input-label" for="goal-weekly-focus">Meta Foco/Sem. (min)</label>
        <input id="goal-weekly-focus" type="number" min="15" max="3000" step="15" class="input tabular" value="${weekly.weeklyFocusGoalMinutes}" />
      </div>
    </div>
  `;

  goalsCard.querySelector('#goal-weekly-tasks')?.addEventListener('change', (e) => {
    const val = Math.max(1, Math.min(200, Number(e.target.value) || 10));
    dispatch({ type: 'CONFIG_UPDATE', payload: { weeklyTasksGoal: val } });
    showToast(`Meta semanal de tarefas ajustada para ${val}.`, { type: 'success', duration: 2000 });
  });

  goalsCard.querySelector('#goal-weekly-focus')?.addEventListener('change', (e) => {
    const val = Math.max(15, Math.min(3000, Number(e.target.value) || 120));
    dispatch({ type: 'CONFIG_UPDATE', payload: { weeklyFocusGoalMinutes: val } });
    showToast(`Meta semanal de foco ajustada para ${val} min.`, { type: 'success', duration: 2000 });
  });

  topGrid.appendChild(goalsCard);
  page.appendChild(topGrid);

  // Galeria de Conquistas (Badges)
  const gallerySection = document.createElement('section');
  gallerySection.style.marginTop = 'var(--space-8)';
  gallerySection.innerHTML = `
    <div class="section-header" style="margin-bottom:var(--space-4);">
      <div>
        <div class="section-eyebrow">🏆 Galeria de Medalhas</div>
        <h2 class="section-title">Conquistas Desbloqueadas (${ach.unlockedCount}/${ach.totalCount})</h2>
      </div>
    </div>
  `;

  const badgeGrid = document.createElement('div');
  badgeGrid.className = 'achievements-badge-grid';

  for (const badge of ach.items) {
    const card = document.createElement('article');
    card.className = `card achievement-badge-card${badge.unlocked ? ' is-unlocked' : ' is-locked'}`;
    card.innerHTML = `
      <div class="achievement-badge-top">
        <span class="achievement-icon" aria-hidden="true">${badge.icon}</span>
        <span class="achievement-cat-tag">${badge.category}</span>
      </div>
      <h3 class="achievement-title">${badge.title}</h3>
      <p class="achievement-desc">${badge.description}</p>
      <div style="margin-top:auto;padding-top:12px;">
        <div style="display:flex;justify-content:space-between;font-size:var(--text-xs);margin-bottom:4px;" class="tabular">
          <span>${badge.unlocked ? '✅ Desbloqueada' : 'Progresso'}</span>
          <strong>${badge.current} / ${badge.target}</strong>
        </div>
        <div class="xp-bar-track" style="height:6px;">
          <div class="xp-bar-fill" style="width:${Math.round(badge.progress * 100)}%;"></div>
        </div>
      </div>
    `;
    badgeGrid.appendChild(card);
  }

  gallerySection.appendChild(badgeGrid);
  page.appendChild(gallerySection);
  _container.appendChild(page);
}

export default AchievementsView;
