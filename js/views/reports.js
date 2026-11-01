/**
 * View de Relatório Semanal e Análises Técnicas (#/reports) — Fase 5
 *
 * Entregas contempladas:
 *   - Relatório semanal consolidado: tarefas concluídas, tempo de foco, atividade pública
 *     disponível do GitHub e conquistas desbloqueadas (comparando últimos 7 dias vs 7 dias anteriores)
 *   - Resumo textual + gráfico diário (7 dias) + distribuição de foco/tarefas por projeto
 *   - Análise de linguagens ao longo do tempo (somente quando há amostra suficiente)
 *   - Radar de distribuição de linguagens (somente quando há amostra suficiente, sem inferir proficiência)
 *   - Declaração explícita de lacunas de dados e limites da API pública do GitHub
 *   - Panorama de Saúde Heurística (0–100) dos projetos com acesso à fórmula pública v1.0.0
 */

import { getState, subscribe } from '../store/store.js';
import {
  getMergedProjects,
  computeWeeklyReportData,
  computeLanguageTimelineAnalysis,
  computeSkillsRadarAnalysis,
  computeAbandonedProjects,
  HEALTH_FORMULA_VERSION
} from '../utils/domain.js';
import {
  renderWeeklyReportChart,
  renderLanguageTimelineChart,
  renderSkillsRadarChart,
  renderHealthRingBadge,
  renderBuildStatusBadge,
  openHealthFormulaModal
} from '../components/charts.js';
import { navigate } from '../router.js';
import { downloadWeeklyReportMarkdown } from '../services/portfolio.js';
import { openShareCardModal, openPortfolioExportModal } from '../components/share-modals.js';

let _unsub = null;

export function mount(container) {
  _render(container);
  _unsub = subscribe(() => _render(container));
}

export function unmount() {
  if (_unsub) {
    _unsub();
    _unsub = null;
  }
}

export const ReportsView = { mount, unmount };
export default ReportsView;

function _render(container) {
  const state = getState();
  const weekly = computeWeeklyReportData(state);
  const timeline = computeLanguageTimelineAnalysis(state);
  const radar = computeSkillsRadarAnalysis(state);
  const abandoned = computeAbandonedProjects(state);
  const allProjects = getMergedProjects(state).filter(p => !p.hidden);

  container.innerHTML = '';

  const page = document.createElement('div');
  page.className = 'view-page reports-view';

  // 1. Cabeçalho
  const header = document.createElement('header');
  header.className = 'section-header';
  header.style.cssText = 'display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:var(--space-3);margin-bottom:var(--space-5);';
  header.innerHTML = `
    <div>
      <div class="section-eyebrow">📊 Inteligência & Métricas · Fase 5</div>
      <h1 class="section-title">Relatório Semanal & Análises</h1>
      <p class="section-subtitle">
        Janela analisada: <strong class="tabular">${_escapeHtml(weekly.windowLabel)}</strong> · Comparação com os 7 dias anteriores
      </p>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <button type="button" class="btn btn-secondary btn-sm" id="btn-open-health-spec">
        📐 Fórmula de Saúde (v${_escapeHtml(HEALTH_FORMULA_VERSION)})
      </button>
      <button type="button" class="btn btn-secondary btn-sm" id="btn-go-focus">
        ⏱️ Modo Foco
      </button>
      <button type="button" class="btn btn-secondary btn-sm" id="btn-share-weekly-card" title="Gerar imagem PNG do resumo semanal para compartilhar">
        🖼️ Cartão da Semana
      </button>
      <button type="button" class="btn btn-secondary btn-sm" id="btn-export-markdown" title="Baixar relatório em arquivo Markdown">
        📄 Markdown
      </button>
      <button type="button" class="btn btn-secondary btn-sm" id="btn-print-report" title="Imprimir ou salvar em PDF">
        🖨️ Imprimir / PDF
      </button>
      <button type="button" class="btn btn-primary btn-sm" id="btn-export-portfolio" title="Exportar página HTML de portfólio público">
        🚀 Exportar Portfólio
      </button>
    </div>
  `;
  header.querySelector('#btn-open-health-spec')?.addEventListener('click', () => {
    openHealthFormulaModal(null, null);
  });
  header.querySelector('#btn-go-focus')?.addEventListener('click', () => {
    navigate('focus');
  });
  header.querySelector('#btn-share-weekly-card')?.addEventListener('click', () => {
    openShareCardModal({ type: 'weekly', weeklyData: weekly, state });
  });
  header.querySelector('#btn-export-markdown')?.addEventListener('click', () => {
    downloadWeeklyReportMarkdown(weekly);
  });
  header.querySelector('#btn-print-report')?.addEventListener('click', () => {
    window.print();
  });
  header.querySelector('#btn-export-portfolio')?.addEventListener('click', () => {
    openPortfolioExportModal(allProjects);
  });
  page.appendChild(header);

  // 2. Banner de transparência sobre fontes e lacunas da API
  const notice = document.createElement('div');
  notice.className = 'card reports-methodology-banner';
  notice.style.cssText = 'padding:var(--space-3) var(--space-4);margin-bottom:var(--space-5);border-left:3px solid var(--accent-primary);background:rgba(139,92,246,0.06);';
  notice.innerHTML = `
    <div style="display:flex;align-items:flex-start;gap:10px;">
      <span style="font-size:1.2rem;" aria-hidden="true">🔬</span>
      <div style="font-size:var(--text-xs);color:var(--text-secondary);line-height:1.5;">
        <strong style="color:var(--text-main);">Transparência de Fontes e Limites da API:</strong>
        <span>${_escapeHtml(weekly.githubActivity.apiLimitationNote)}</span>
        <span> Dado não consultado ou sem permissão é exibido como <em>Indisponível</em> e nunca conta como zero ou falha.</span>
      </div>
    </div>
  `;
  page.appendChild(notice);

  // 3. Resumo Textual Consolidado da Semana
  const summaryCard = document.createElement('section');
  summaryCard.className = 'card';
  summaryCard.style.cssText = 'padding:var(--space-4) var(--space-5);margin-bottom:var(--space-5);';
  summaryCard.innerHTML = `
    <div class="section-eyebrow" style="margin-bottom:4px;">📝 Síntese Executiva (7 dias)</div>
    <p style="font-size:var(--text-sm);color:var(--text-main);line-height:1.6;margin:0;">
      ${_escapeHtml(weekly.textualSummary)}
    </p>
  `;
  page.appendChild(summaryCard);

  // 4. Cards de Indicadores Semanais (KPIs com delta vs semana anterior)
  const kpiGrid = document.createElement('div');
  kpiGrid.className = 'reports-kpi-grid';
  kpiGrid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(215px,1fr));gap:var(--space-4);margin-bottom:var(--space-5);';

  kpiGrid.appendChild(_buildKpiCard({
    eyebrow: '✅ Tarefas Concluídas (7d)',
    value: `${weekly.tasks.completedCount}`,
    delta: weekly.tasks.delta,
    unit: 'tarefa(s)',
    subtitle: `Semana anterior: ${weekly.tasks.prevCount} concluída(s)`
  }));

  kpiGrid.appendChild(_buildKpiCard({
    eyebrow: '⏱️ Tempo de Foco (7d)',
    value: `${weekly.focus.minutes} min`,
    delta: weekly.focus.deltaMinutes,
    unit: 'min',
    subtitle: `${weekly.focus.sessionsCount} sessão(ões) · Anterior: ${weekly.focus.prevMinutes} min`
  }));

  kpiGrid.appendChild(_buildKpiCard({
    eyebrow: '🐙 Atividade GitHub (7d)',
    value: weekly.githubActivity.available ? `${weekly.githubActivity.commits7d} commits` : 'Indisponível',
    delta: null,
    unit: '',
    subtitle: weekly.githubActivity.available
      ? `${weekly.githubActivity.events7d} evento(s) público(s) na janela`
      : 'Eventos públicos não carregados ou offline'
  }));

  kpiGrid.appendChild(_buildKpiCard({
    eyebrow: '🏆 Conquistas & Insígnias',
    value: `${Array.isArray(weekly.achievements.unlockedThisWeek) ? weekly.achievements.unlockedThisWeek.length : (weekly.achievements.unlockedThisWeek || 0)} na sem.`,
    delta: null,
    unit: '',
    subtitle: `Total acumulado: ${weekly.achievements.totalUnlocked}/${weekly.achievements.totalCatalog} desbloqueadas`
  }));

  page.appendChild(kpiGrid);

  // 5. Grade Principal: Gráfico Diário (7d) + Detalhamento por Projeto
  const mainGrid = document.createElement('div');
  mainGrid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:var(--space-4);margin-bottom:var(--space-5);';

  mainGrid.appendChild(renderWeeklyReportChart(weekly));

  // Card de detalhamento da semana (projetos mais focados + conquistas recentes)
  const breakdownCard = document.createElement('section');
  breakdownCard.className = 'card bento-widget';
  breakdownCard.innerHTML = `
    <div class="widget-header">
      <div>
        <div class="section-eyebrow">🎯 Onde o Tempo Foi Investido</div>
        <h3 class="widget-title">Foco & Entregas na Semana</h3>
      </div>
      <span class="widget-origin-tag">Domínio Local</span>
    </div>
  `;

  const breakdownBody = document.createElement('div');
  breakdownBody.style.cssText = 'display:flex;flex-direction:column;gap:12px;margin-top:8px;';

  if (weekly.focus.byProject.length === 0 && weekly.tasks.completedItems.length === 0) {
    breakdownBody.innerHTML = `
      <p class="widget-empty-msg">
        Nenhuma tarefa concluída ou sessão de foco registrada nos últimos 7 dias. Inicie um ciclo em <strong>#/focus</strong> ou conclua itens no Kanban!
      </p>
    `;
  } else {
    if (weekly.focus.byProject.length > 0) {
      const focusList = document.createElement('div');
      focusList.innerHTML = `<div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;margin-bottom:6px;">Top Projetos por Tempo de Foco (7d)</div>`;
      const ul = document.createElement('ul');
      ul.style.cssText = 'list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:6px;';
      weekly.focus.byProject.slice(0, 5).forEach(fp => {
        const li = document.createElement('li');
        li.style.cssText = 'display:flex;justify-content:space-between;align-items:center;font-size:var(--text-xs);padding:6px 10px;background:var(--bg-elevated);border-radius:var(--radius-sm);';
        li.innerHTML = `
          <span><strong>${_escapeHtml(fp.projectName)}</strong> <small style="color:var(--text-muted);">(${fp.sessions} ciclo(s))</small></span>
          <strong class="tabular" style="color:var(--accent-primary);">${fp.minutes} min</strong>
        `;
        ul.appendChild(li);
      });
      focusList.appendChild(ul);
      breakdownBody.appendChild(focusList);
    }

    if (weekly.tasks.completedItems.length > 0) {
      const taskList = document.createElement('div');
      taskList.innerHTML = `<div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;margin-bottom:6px;">Últimas Tarefas Concluídas (7d)</div>`;
      const ul = document.createElement('ul');
      ul.style.cssText = 'list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:5px;';
      weekly.tasks.completedItems.slice(0, 5).forEach(t => {
        const li = document.createElement('li');
        li.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:var(--text-xs);color:var(--text-secondary);';
        li.innerHTML = `
          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">✅ ${_escapeHtml(t.title)}</span>
          <small style="color:var(--text-muted);flex-shrink:0;">${_escapeHtml(t.projectName)}</small>
        `;
        ul.appendChild(li);
      });
      taskList.appendChild(ul);
      breakdownBody.appendChild(taskList);
    }
  }

  breakdownCard.appendChild(breakdownBody);
  mainGrid.appendChild(breakdownCard);
  page.appendChild(mainGrid);

  // 6. Análises de Linguagens ao Longo do Tempo e Radar de Linguagens
  const chartsGrid = document.createElement('div');
  chartsGrid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:var(--space-4);margin-bottom:var(--space-5);';
  chartsGrid.appendChild(renderLanguageTimelineChart(timeline));
  chartsGrid.appendChild(renderSkillsRadarChart(radar));
  page.appendChild(chartsGrid);

  // 7. Panorama de Saúde Heurística dos Projetos e Detector de Abandono
  const healthSection = document.createElement('section');
  healthSection.className = 'card';
  healthSection.style.cssText = 'padding:var(--space-4) var(--space-5);';

  const healthHeader = document.createElement('div');
  healthHeader.style.cssText = 'display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:var(--space-4);';
  healthHeader.innerHTML = `
    <div>
      <div class="section-eyebrow">🩺 Saúde Heurística & Abandono</div>
      <h3 class="widget-title" style="margin:2px 0;">Panorama de Saúde dos Projetos (${allProjects.length})</h3>
      <p style="font-size:var(--text-xs);color:var(--text-muted);margin:0;">
        Indicador heurístico (0–100) calculado apenas com fatores disponíveis. Clique no anel de qualquer projeto para inspecionar os pesos e a fórmula.
      </p>
    </div>
    ${abandoned.length > 0 ? `
      <span class="badge" style="background:rgba(245,158,11,0.16);color:#fbbf24;border:1px solid rgba(245,158,11,0.35);">
        ⚠️ ${abandoned.length} projeto(s) sem atividade recente
      </span>
    ` : `
      <span class="badge" style="background:rgba(16,185,129,0.14);color:#34d399;border:1px solid rgba(16,185,129,0.3);">
        ✨ Nenhum alerta de abandono pendente
      </span>
    `}
  `;
  healthSection.appendChild(healthHeader);

  if (allProjects.length === 0) {
    const emptyP = document.createElement('p');
    emptyP.className = 'widget-empty-msg';
    emptyP.textContent = 'Nenhum projeto cadastrado ou sincronizado para calcular a saúde.';
    healthSection.appendChild(emptyP);
  } else {
    const listWrap = document.createElement('div');
    listWrap.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px;';

    const sortedByHealth = [...allProjects].sort((a, b) => {
      const sa = a.health?.isComparable ? a.health.score : -1;
      const sb = b.health?.isComparable ? b.health.score : -1;
      return sb - sa;
    });

    sortedByHealth.slice(0, 12).forEach(proj => {
      const itemRow = document.createElement('div');
      itemRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--radius-md);';

      const left = document.createElement('div');
      left.style.cssText = 'min-width:0;flex:1;';
      const titleBtn = document.createElement('button');
      titleBtn.type = 'button';
      titleBtn.style.cssText = 'background:none;border:none;padding:0;color:var(--text-main);font-weight:700;font-size:var(--text-sm);cursor:pointer;text-align:left;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;width:100%;';
      titleBtn.textContent = proj.name;
      titleBtn.addEventListener('click', () => navigate(`project/${proj.repoId}`));

      const subMeta = document.createElement('div');
      subMeta.style.cssText = 'display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:4px;font-size:11px;color:var(--text-muted);';
      subMeta.innerHTML = `<span style="text-transform:capitalize;">${_escapeHtml(proj.status)}</span> · <span>Conf. ${_escapeHtml(proj.health?.confidence || 'baixa')} (${proj.health?.coveragePct || 0}%)</span>`;

      const buildBadge = renderBuildStatusBadge(proj.tech?.actions, { compact: true });
      if (buildBadge) subMeta.appendChild(buildBadge);

      left.appendChild(titleBtn);
      left.appendChild(subMeta);

      const ringBtn = renderHealthRingBadge(proj.health, { size: 38, project: proj });
      itemRow.appendChild(left);
      itemRow.appendChild(ringBtn);
      listWrap.appendChild(itemRow);
    });

    healthSection.appendChild(listWrap);
  }

  page.appendChild(healthSection);
  container.appendChild(page);
}

function _buildKpiCard({ eyebrow, value, delta, unit, subtitle }) {
  const card = document.createElement('div');
  card.className = 'card';
  card.style.cssText = 'padding:var(--space-4);display:flex;flex-direction:column;gap:6px;';

  let deltaHtml = '';
  if (typeof delta === 'number') {
    const sign = delta > 0 ? '+' : '';
    const color = delta > 0 ? '#10b981' : delta < 0 ? '#f59e0b' : 'var(--text-muted)';
    deltaHtml = `<span class="tabular" style="font-size:var(--text-xs);font-weight:700;color:${color};">${sign}${delta} ${unit} vs 7d ant.</span>`;
  }

  card.innerHTML = `
    <div class="section-eyebrow">${_escapeHtml(eyebrow)}</div>
    <div style="display:flex;align-items:baseline;justify-content:space-between;gap:8px;flex-wrap:wrap;">
      <strong class="tabular" style="font-size:1.5rem;color:var(--text-main);">${_escapeHtml(value)}</strong>
      ${deltaHtml}
    </div>
    <div style="font-size:var(--text-xs);color:var(--text-muted);">${_escapeHtml(subtitle)}</div>
  `;
  return card;
}

function _escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
