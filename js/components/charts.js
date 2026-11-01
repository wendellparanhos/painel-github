/**
 * Componentes de Gráficos e Visualizações Analíticas — Fase 3
 *
 * Entregas contempladas:
 *   - Anéis estilo Apple Watch (Tarefas do dia, Commits do dia, Foco [vazio até a Fase 4])
 *   - Donut de Status dos projetos (SVG + legenda acessível)
 *   - Gráfico de Commits por Semana (SVG + estado Indisponível quando sem dados)
 *   - Barra de Linguagens Empilhada (SVG que "desenha" ao entrar)
 *   - Heatmap 2D de atividade pública do GitHub (com tooltip, legenda, resumo textual acessível
 *     e distinção estrita entre zero real e dado indisponível)
 *   - Sparkline SVG para os cards (renderizada somente quando há amostra suficiente)
 */

import {
  computeStatusDistribution,
  computeLanguageDistribution,
  computeDailyRingsData,
  formatLocalDueDate,
  HEALTH_FORMULA_SPEC,
  HEALTH_FORMULA_VERSION
} from '../utils/domain.js';
import { getLangColor, classifyActionsRuns } from '../services/github.js';
import { getFxLevel, isReducedMotion } from '../fx/effects.js';
import { openModal } from './modal.js';

const STATUS_COLORS = {
  'ideia': '#a855f7',
  'em andamento': '#06b6d4',
  'pausado': '#f59e0b',
  'concluído': '#10b981',
  'arquivado': '#64748b'
};

// ─────────────────────────────────────────────
// 1. ANÉIS ESTILO APPLE WATCH (TAREFAS, COMMITS, FOCO)
// ─────────────────────────────────────────────
export function renderAppleWatchRings(state) {
  const data = computeDailyRingsData(state);
  const animate = getFxLevel() !== 'minimo' && !isReducedMotion();

  const card = document.createElement('section');
  card.className = 'card bento-widget rings-widget';
  card.setAttribute('aria-label', 'Anéis de progresso diário');

  const header = document.createElement('div');
  header.className = 'widget-header';
  header.innerHTML = `
    <div>
      <div class="section-eyebrow">⌚ Ritmo Diário</div>
      <h3 class="widget-title">Anéis de Atividade</h3>
    </div>
    <span class="widget-origin-tag" title="Tarefas locais + Eventos públicos do GitHub">Local + GitHub</span>
  `;

  const content = document.createElement('div');
  content.className = 'rings-widget-body';

  // Raios concêntricos: externo (48), médio (35), interno (22)
  const ringsConfig = [
    { ...data.tasksRing, r: 48, color: '#10b981', track: 'rgba(16, 185, 129, 0.16)' },
    { ...data.commitsRing, r: 35, color: '#06b6d4', track: 'rgba(6, 182, 212, 0.16)' },
    { ...data.focusRing, r: 22, color: '#8b5cf6', track: 'rgba(139, 92, 246, 0.14)' }
  ];

  const svgCircles = ringsConfig.map((ring) => {
    const c = +(2 * Math.PI * ring.r).toFixed(2);
    const targetOffset = +(c * (1 - ring.progress)).toFixed(2);
    const initialOffset = animate ? c : targetOffset;
    const dashArray = ring.available === false && !ring.phase4Placeholder ? '4 4' : `${c}`;

    return `
      <circle
        cx="60" cy="60" r="${ring.r}"
        fill="none"
        stroke="${ring.track}"
        stroke-width="9"
        ${ring.available === false && !ring.phase4Placeholder ? 'stroke-dasharray="3 4"' : ''}
      />
      <circle
        class="watch-ring-progress"
        cx="60" cy="60" r="${ring.r}"
        fill="none"
        stroke="${ring.color}"
        stroke-width="9"
        stroke-linecap="round"
        stroke-dasharray="${dashArray}"
        stroke-dashoffset="${initialOffset}"
        data-target-offset="${targetOffset}"
        transform="rotate(-90 60 60)"
        style="transition: stroke-dashoffset ${animate ? '900ms cubic-bezier(0.16, 1, 0.3, 1)' : '0ms'};"
      />
    `;
  }).join('');

  const svgWrap = document.createElement('div');
  svgWrap.className = 'rings-svg-wrap';
  svgWrap.innerHTML = `
    <svg width="120" height="120" viewBox="0 0 120 120" role="img" aria-label="${_escapeAttr(
      `${data.tasksRing.summary}; ${data.commitsRing.summary}; ${data.focusRing.summary}`
    )}">
      ${svgCircles}
    </svg>
  `;

  const legend = document.createElement('ul');
  legend.className = 'rings-legend';
  legend.innerHTML = `
    <li class="ring-legend-item">
      <span class="ring-dot" style="background:#10b981;"></span>
      <div class="ring-legend-text">
        <span class="ring-legend-label">Tarefas do dia</span>
        <strong class="tabular">${data.tasksRing.value}/${data.tasksRing.goal} concluídas</strong>
      </div>
    </li>
    <li class="ring-legend-item">
      <span class="ring-dot" style="background:#06b6d4;"></span>
      <div class="ring-legend-text">
        <span class="ring-legend-label">Commits do dia</span>
        <strong class="tabular">${data.commitsRing.available ? `${data.commitsRing.value}/${data.commitsRing.goal} públicos` : 'Indisponível'}</strong>
      </div>
    </li>
    <li class="ring-legend-item">
      <span class="ring-dot" style="background:#8b5cf6;"></span>
      <div class="ring-legend-text">
        <span class="ring-legend-label">Foco (Pomodoro)</span>
        <strong class="tabular">${data.focusRing.value}/${data.focusRing.goal} min hoje</strong>
      </div>
    </li>
  `;

  content.appendChild(svgWrap);
  content.appendChild(legend);
  card.appendChild(header);
  card.appendChild(content);

  if (animate) {
    requestAnimationFrame(() => {
      card.querySelectorAll('.watch-ring-progress').forEach(el => {
        el.setAttribute('stroke-dashoffset', el.getAttribute('data-target-offset'));
      });
    });
  }

  return card;
}

// ─────────────────────────────────────────────
// 2. DONUT DE STATUS DOS PROJETOS
// ─────────────────────────────────────────────
export function renderStatusDonutChart(state) {
  const { total, slices } = computeStatusDistribution(state);
  const animate = getFxLevel() !== 'minimo' && !isReducedMotion();

  const card = document.createElement('section');
  card.className = 'card bento-widget donut-widget';
  card.setAttribute('aria-label', 'Distribuição de projetos por status');

  const header = document.createElement('div');
  header.className = 'widget-header';
  header.innerHTML = `
    <div>
      <div class="section-eyebrow">📊 Distribuição</div>
      <h3 class="widget-title">Projetos por Status</h3>
    </div>
    <span class="widget-origin-tag">Domínio Local</span>
  `;
  card.appendChild(header);

  if (total === 0) {
    const empty = document.createElement('p');
    empty.className = 'widget-empty-msg';
    empty.textContent = 'Nenhum projeto visível para calcular a distribuição de status.';
    card.appendChild(empty);
    return card;
  }

  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  let accumulatedPct = 0;

  const segmentsSvg = slices
    .filter(s => s.count > 0)
    .map(slice => {
      const frac = slice.count / total;
      const segLen = +(frac * circumference).toFixed(2);
      const offset = +(-accumulatedPct * circumference).toFixed(2);
      accumulatedPct += frac;
      const color = STATUS_COLORS[slice.status] || '#8b5cf6';

      return `
        <circle
          cx="55" cy="55" r="${radius}"
          fill="none"
          stroke="${color}"
          stroke-width="14"
          stroke-dasharray="${segLen} ${circumference}"
          stroke-dashoffset="${offset}"
          transform="rotate(-90 55 55)"
          style="${animate ? 'transition: stroke-dasharray 650ms ease;' : ''}"
        >
          <title>${slice.status}: ${slice.count} (${slice.percentage}%)</title>
        </circle>
      `;
    })
    .join('');

  const body = document.createElement('div');
  body.className = 'donut-widget-body';

  const summaryText = slices
    .filter(s => s.count > 0)
    .map(s => `${s.status}: ${s.count} (${s.percentage}%)`)
    .join(', ');

  const svgBox = document.createElement('div');
  svgBox.className = 'donut-svg-wrap';
  svgBox.innerHTML = `
    <svg width="110" height="110" viewBox="0 0 110 110" role="img" aria-label="Distribuição de status: ${_escapeAttr(summaryText)}">
      <circle cx="55" cy="55" r="${radius}" fill="none" stroke="var(--border-subtle)" stroke-width="14"/>
      ${segmentsSvg}
      <text x="55" y="52" text-anchor="middle" fill="var(--text-main)" font-size="18" font-weight="800" font-family="var(--font-mono)">${total}</text>
      <text x="55" y="67" text-anchor="middle" fill="var(--text-muted)" font-size="9" font-weight="600">PROJETOS</text>
    </svg>
  `;

  const legend = document.createElement('ul');
  legend.className = 'donut-legend';
  for (const s of slices) {
    const li = document.createElement('li');
    li.className = 'donut-legend-row';
    li.innerHTML = `
      <span class="donut-legend-left">
        <span class="ring-dot" style="background:${STATUS_COLORS[s.status] || '#8b5cf6'};"></span>
        <span style="text-transform:capitalize;">${s.status}</span>
      </span>
      <span class="tabular donut-legend-val">${s.count} <small style="color:var(--text-muted);">(${s.percentage}%)</small></span>
    `;
    legend.appendChild(li);
  }

  body.appendChild(svgBox);
  body.appendChild(legend);
  card.appendChild(body);
  return card;
}

// ─────────────────────────────────────────────
// 3. GRÁFICO DE COMMITS POR SEMANA (8 SEMANAS)
// ─────────────────────────────────────────────
export function renderWeeklyCommitsChart(eventsAnalytics) {
  const card = document.createElement('section');
  card.className = 'card bento-widget weekly-commits-widget';
  card.setAttribute('aria-label', 'Commits públicos por semana');

  const header = document.createElement('div');
  header.className = 'widget-header';
  header.innerHTML = `
    <div>
      <div class="section-eyebrow">📈 Ritmo de Código</div>
      <h3 class="widget-title">Commits por Semana (8 sem.)</h3>
    </div>
    <span class="widget-origin-tag">GitHub Events API</span>
  `;
  card.appendChild(header);

  if (!eventsAnalytics?.available) {
    const unav = document.createElement('div');
    unav.className = 'widget-unavailable-box';
    unav.innerHTML = `
      <span style="font-size:1.25rem;">📡</span>
      <div>
        <strong>Dado indisponível no momento</strong>
        <p style="font-size:var(--text-xs);color:var(--text-muted);margin-top:2px;">
          Eventos públicos do GitHub ainda não foram carregados ou estão inacessíveis offline. Nenhum valor fictício é exibido.
        </p>
      </div>
    `;
    card.appendChild(unav);
    return card;
  }

  const weeks = eventsAnalytics.weeklyCommits || [];
  const maxCommits = Math.max(1, ...weeks.map(w => w.commits || 0));
  const totalCommits8w = weeks.reduce((acc, w) => acc + (w.commits || 0), 0);

  const svgWidth = 320;
  const svgHeight = 110;
  const chartBottom = 86;
  const chartTop = 14;
  const usableHeight = chartBottom - chartTop;
  const barWidth = 22;
  const stepX = svgWidth / weeks.length;

  const barsSvg = weeks.map((w, idx) => {
    const val = w.commits || 0;
    const h = val > 0 ? Math.max(6, Math.round((val / maxCommits) * usableHeight)) : 3;
    const x = Math.round(idx * stepX + (stepX - barWidth) / 2);
    const y = chartBottom - h;
    const fill = val > 0 ? 'url(#commitBarGrad)' : 'var(--border-subtle)';

    return `
      <g>
        <title>Semana de ${w.label}: ${val} commit(s) em eventos públicos</title>
        <rect x="${x}" y="${y}" width="${barWidth}" height="${h}" rx="4" fill="${fill}" />
        ${val > 0 ? `<text x="${x + barWidth / 2}" y="${Math.max(10, y - 4)}" text-anchor="middle" fill="var(--text-secondary)" font-size="9" font-family="var(--font-mono)">${val}</text>` : ''}
        <text x="${x + barWidth / 2}" y="102" text-anchor="middle" fill="var(--text-muted)" font-size="9" font-family="var(--font-mono)">${w.label}</text>
      </g>
    `;
  }).join('');

  const wrap = document.createElement('div');
  wrap.className = 'weekly-chart-wrap';
  wrap.innerHTML = `
    <svg viewBox="0 0 ${svgWidth} ${svgHeight}" width="100%" height="115" role="img" aria-label="Commits nas últimas 8 semanas: total de ${totalCommits8w} commits públicos">
      <defs>
        <linearGradient id="commitBarGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--accent-primary)" />
          <stop offset="100%" stop-color="var(--accent-tertiary)" />
        </linearGradient>
      </defs>
      ${barsSvg}
    </svg>
    <div class="widget-footer-note">
      <span>Total na janela (8 sem.): <strong class="tabular">${totalCommits8w} commit(s)</strong></span>
      <span>Fonte: Eventos públicos recentes do GitHub</span>
    </div>
  `;

  card.appendChild(wrap);
  return card;
}

// ─────────────────────────────────────────────
// 4. BARRA DE LINGUAGENS EMPILHADA (SVG QUE "DESENHA" AO ENTRAR)
// ─────────────────────────────────────────────
export function renderLanguageStackedBar(state) {
  const { totalWithLang, items } = computeLanguageDistribution(state);
  const animate = getFxLevel() !== 'minimo' && !isReducedMotion();

  const card = document.createElement('section');
  card.className = 'card bento-widget lang-bar-widget';
  card.setAttribute('aria-label', 'Linguagens principais dos repositórios');

  const header = document.createElement('div');
  header.className = 'widget-header';
  header.innerHTML = `
    <div>
      <div class="section-eyebrow">🧬 Stack Técnica</div>
      <h3 class="widget-title">Linguagens nos Repositórios</h3>
    </div>
    <span class="widget-origin-tag">${totalWithLang} repo(s)</span>
  `;
  card.appendChild(header);

  if (totalWithLang === 0 || items.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'widget-empty-msg';
    empty.textContent = 'Nenhuma linguagem principal identificada nos repositórios carregados.';
    card.appendChild(empty);
    return card;
  }

  // Barra SVG horizontal empilhada que desenha da esquerda para a direita ao entrar
  let accX = 0;
  const rectsSvg = items.map(item => {
    const w = Math.max(1.5, item.percentage);
    const x = accX;
    accX += item.percentage;
    const color = getLangColor(item.language);
    return `
      <rect
        class="lang-svg-segment"
        x="${x.toFixed(2)}%"
        y="0"
        width="${animate ? '0%' : `${w.toFixed(2)}%`}"
        data-target-width="${w.toFixed(2)}%"
        height="14"
        fill="${color}"
        style="transition: width ${animate ? '750ms cubic-bezier(0.16, 1, 0.3, 1)' : '0ms'};"
      >
        <title>${item.language}: ${item.count} repositório(s) (${item.percentage}%)</title>
      </rect>
    `;
  }).join('');

  const svgBarWrap = document.createElement('div');
  svgBarWrap.className = 'lang-svg-bar-wrap';
  svgBarWrap.innerHTML = `
    <svg width="100%" height="14" viewBox="0 0 100 14" preserveAspectRatio="none" role="img" aria-label="Distribuição de linguagens: ${_escapeAttr(items.map(i => `${i.language} ${i.percentage}%`).join(', '))}" style="border-radius:999px;overflow:hidden;display:block;background:var(--bg-input);">
      ${rectsSvg}
    </svg>
  `;

  const legend = document.createElement('ul');
  legend.className = 'lang-legend-grid';
  for (const item of items.slice(0, 8)) {
    const li = document.createElement('li');
    li.className = 'lang-legend-chip';
    li.innerHTML = `
      <span class="meta-lang-dot" style="background:${getLangColor(item.language)};"></span>
      <span>${_escapeHtml(item.language)}</span>
      <strong class="tabular" style="color:var(--text-secondary);">${item.percentage}%</strong>
      <small class="tabular" style="color:var(--text-muted);">(${item.count})</small>
    `;
    legend.appendChild(li);
  }

  card.appendChild(svgBarWrap);
  card.appendChild(legend);

  if (animate) {
    requestAnimationFrame(() => {
      card.querySelectorAll('.lang-svg-segment').forEach(rect => {
        rect.setAttribute('width', rect.getAttribute('data-target-width'));
      });
    });
  }

  return card;
}

// ─────────────────────────────────────────────
// 5. HEATMAP 2D DE ATIVIDADE PÚBLICA DO GITHUB
// (Com tooltip, legenda, resumo textual acessível e estado "Indisponível" honesto)
// ─────────────────────────────────────────────
export function renderActivityHeatmap2D(eventsAnalytics) {
  const card = document.createElement('section');
  card.className = 'card bento-widget heatmap-widget';
  card.setAttribute('aria-label', 'Mapa de calor 2D de atividade pública no GitHub');

  const available = Boolean(eventsAnalytics?.available);
  const days = eventsAnalytics?.heatmapDays || [];
  const totalEvents = eventsAnalytics?.totalEventsInWindow || 0;
  const totalCommits = eventsAnalytics?.totalCommitsInWindow || 0;
  const activeDaysCount = available ? days.filter(d => (d.count || 0) > 0).length : 0;

  const header = document.createElement('div');
  header.className = 'widget-header';
  header.innerHTML = `
    <div>
      <div class="section-eyebrow">🗓️ Consistência (16 semanas)</div>
      <h3 class="widget-title">Heatmap 2D de Atividade Pública</h3>
    </div>
    <span class="widget-origin-tag">${available ? 'GitHub Events API' : 'Dado Indisponível'}</span>
  `;
  card.appendChild(header);

  // Resumo textual acessível (visível e lido por leitores de tela)
  const summaryEl = document.createElement('p');
  summaryEl.className = 'heatmap-accessible-summary';
  if (!available) {
    summaryEl.innerHTML = `
      📡 <strong>Estado Indisponível:</strong> os eventos públicos do GitHub não puderam ser consultados no momento. As células abaixo estão marcadas como <em>Indisponível</em> (não são exibidas como zero falso).
    `;
  } else {
    summaryEl.innerHTML = `
      Nos últimos 112 dias (eventos públicos retornados pela GitHub API): <strong class="tabular">${totalEvents}</strong> evento(s) e <strong class="tabular">${totalCommits}</strong> commit(s) distribuídos em <strong class="tabular">${activeDaysCount}</strong> dia(s) ativo(s).
    `;
  }
  card.appendChild(summaryEl);

  // Grade 2D (16 colunas × 7 dias)
  const gridScroll = document.createElement('div');
  gridScroll.className = 'heatmap-scroll-wrap';

  const grid = document.createElement('div');
  grid.className = `heatmap-2d-grid${!available ? ' is-unavailable' : ''}`;
  grid.setAttribute('role', 'grid');
  grid.setAttribute(
    'aria-label',
    available
      ? `Mapa de calor de 112 dias com ${totalEvents} eventos públicos em ${activeDaysCount} dias ativos`
      : 'Mapa de calor indisponível offline ou sem eventos carregados'
  );

  // Tooltip flutuante acessível dentro do widget
  const tooltipEl = document.createElement('div');
  tooltipEl.className = 'heatmap-tooltip';
  tooltipEl.setAttribute('role', 'status');
  tooltipEl.setAttribute('aria-live', 'polite');
  tooltipEl.textContent = available
    ? 'Passe o mouse ou foque em um dia para ver detalhes.'
    : 'Dados de eventos públicos indisponíveis no momento.';

  days.forEach(cell => {
    const cellEl = document.createElement('button');
    cellEl.type = 'button';

    let levelClass = 'level-unavailable';
    let labelText = `${formatLocalDueDate(cell.date)} (${cell.date}): Indisponível`;

    if (available) {
      const c = cell.count || 0;
      if (c === 0) levelClass = 'level-0';
      else if (c <= 2) levelClass = 'level-1';
      else if (c <= 5) levelClass = 'level-2';
      else levelClass = 'level-3';

      labelText = `${formatLocalDueDate(cell.date)} (${cell.date}): ${c} evento(s) público(s), ${cell.commits || 0} commit(s)`;
    }

    cellEl.className = `heatmap-cell ${levelClass}`;
    cellEl.setAttribute('aria-label', labelText);
    cellEl.title = labelText;

    const showTip = () => {
      tooltipEl.textContent = labelText;
    };
    cellEl.addEventListener('mouseenter', showTip);
    cellEl.addEventListener('focus', showTip);

    grid.appendChild(cellEl);
  });

  gridScroll.appendChild(grid);
  card.appendChild(gridScroll);

  // Rodapé: Tooltip + Legenda de intensidade (incluindo estado Indisponível)
  const footer = document.createElement('div');
  footer.className = 'heatmap-footer';
  footer.appendChild(tooltipEl);

  const legend = document.createElement('div');
  legend.className = 'heatmap-legend';
  legend.setAttribute('aria-label', 'Legenda de intensidade do mapa de calor');
  legend.innerHTML = `
    <span>Menos</span>
    <span class="heatmap-cell level-0" title="0 eventos registrados"></span>
    <span class="heatmap-cell level-1" title="1 a 2 eventos"></span>
    <span class="heatmap-cell level-2" title="3 a 5 eventos"></span>
    <span class="heatmap-cell level-3" title="6+ eventos"></span>
    <span>Mais</span>
    <span style="margin-left:8px;display:inline-flex;align-items:center;gap:4px;">
      <span class="heatmap-cell level-unavailable" title="Dado indisponível"></span>
      <span>Indisponível</span>
    </span>
  `;
  footer.appendChild(legend);
  card.appendChild(footer);

  return card;
}

// ─────────────────────────────────────────────
// 6. SPARKLINE DE COMMITS PARA OS CARDS DE PROJETO
// (Renderizada SOMENTE quando `hasSufficientSample === true`)
// ─────────────────────────────────────────────
export function buildCardSparklineElement(sparklineData) {
  if (!sparklineData || !sparklineData.hasSufficientSample || !Array.isArray(sparklineData.weeks)) {
    return null;
  }

  const weeks = sparklineData.weeks;
  const maxVal = Math.max(1, ...weeks);
  const w = 88;
  const h = 22;
  const pad = 3;

  const points = weeks.map((val, idx) => {
    const x = +(pad + (idx / (weeks.length - 1)) * (w - pad * 2)).toFixed(1);
    const y = +(h - pad - (val / maxVal) * (h - pad * 2)).toFixed(1);
    return `${x},${y}`;
  }).join(' ');

  const wrap = document.createElement('div');
  wrap.className = 'card-sparkline-wrap';
  wrap.title = `Atividade recente (8 sem.): ${sparklineData.totalActivity} evento(s) em ${sparklineData.activeWeeksCount} semana(s)`;
  wrap.setAttribute('aria-label', wrap.title);
  wrap.innerHTML = `
    <span class="card-sparkline-label">8s</span>
    <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">
      <polyline
        fill="none"
        stroke="var(--accent-primary)"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
        points="${points}"
      />
    </svg>
  `;
  return wrap;
}

function _escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _escapeAttr(str) {
  return _escapeHtml(str);
}

// ─────────────────────────────────────────────
// 7. ANEL DE SAÚDE DO PROJETO (FASE 5)
// ─────────────────────────────────────────────
export function getHealthVisualMeta(health) {
  if (!health || health.score === null || !health.isComparable) {
    return {
      color: '#64748b',
      track: 'rgba(100, 116, 139, 0.2)',
      label: health?.score !== null && health?.score !== undefined ? `${health.score}` : 'N/D',
      tierLabel: 'Cobertura baixa (não comparável)',
      confidenceLabel: `Confiança ${health?.confidence || 'baixa'}`,
      dashed: true
    };
  }
  const s = health.score;
  if (s >= 75) {
    return {
      color: '#10b981',
      track: 'rgba(16, 185, 129, 0.18)',
      label: `${s}`,
      tierLabel: 'Saúde alta',
      confidenceLabel: `Confiança ${health.confidence}`,
      dashed: false
    };
  }
  if (s >= 50) {
    return {
      color: '#06b6d4',
      track: 'rgba(6, 182, 212, 0.18)',
      label: `${s}`,
      tierLabel: 'Saúde moderada',
      confidenceLabel: `Confiança ${health.confidence}`,
      dashed: false
    };
  }
  if (s >= 25) {
    return {
      color: '#f59e0b',
      track: 'rgba(245, 158, 11, 0.18)',
      label: `${s}`,
      tierLabel: 'Atenção recomendada',
      confidenceLabel: `Confiança ${health.confidence}`,
      dashed: false
    };
  }
  return {
    color: '#ef4444',
    track: 'rgba(239, 68, 68, 0.18)',
    label: `${s}`,
    tierLabel: 'Saúde crítica',
    confidenceLabel: `Confiança ${health.confidence}`,
    dashed: false
  };
}

export function renderHealthRingBadge(health, options = {}) {
  const { size = 34, showLabel = false, project = null } = options;
  const meta = getHealthVisualMeta(health);
  const scoreVal = typeof health?.score === 'number' ? health.score : 0;
  const strokeWidth = size >= 48 ? 5 : 3.5;
  const r = +((size - strokeWidth * 2) / 2).toFixed(1);
  const c = +(2 * Math.PI * r).toFixed(2);
  const progress = Math.max(0, Math.min(1, scoreVal / 100));
  const offset = +(c * (1 - progress)).toFixed(2);
  const cx = +(size / 2).toFixed(1);

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `health-ring-badge${showLabel ? ' with-label' : ''}${meta.dashed ? ' is-low-coverage' : ''}`;
  const tooltip = `Saúde heurística: ${meta.label}/100 (${meta.tierLabel} · ${meta.confidenceLabel} · Cobertura ${health?.coveragePct || 0}%). Clique para ver a fórmula v${HEALTH_FORMULA_VERSION}.`;
  btn.title = tooltip;
  btn.setAttribute('aria-label', tooltip);

  const fontSize = size >= 48 ? 13 : 10;
  btn.innerHTML = `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true" class="health-ring-svg">
      <circle
        cx="${cx}" cy="${cx}" r="${r}"
        fill="none"
        stroke="${meta.track}"
        stroke-width="${strokeWidth}"
        ${meta.dashed ? 'stroke-dasharray="2 2"' : ''}
      />
      <circle
        cx="${cx}" cy="${cx}" r="${r}"
        fill="none"
        stroke="${meta.color}"
        stroke-width="${strokeWidth}"
        stroke-linecap="round"
        stroke-dasharray="${meta.dashed ? '3 2' : c}"
        stroke-dashoffset="${meta.dashed ? 0 : offset}"
        transform="rotate(-90 ${cx} ${cx})"
      />
      <text
        x="${cx}" y="${cx + fontSize * 0.35}"
        text-anchor="middle"
        fill="var(--text-main)"
        font-size="${fontSize}"
        font-weight="700"
        font-family="var(--font-mono)"
      >${meta.label}</text>
    </svg>
    ${showLabel ? `
      <span class="health-ring-text">
        <strong class="health-ring-tier" style="color:${meta.color};">${_escapeHtml(meta.tierLabel)}</strong>
        <small class="health-ring-conf">${_escapeHtml(meta.confidenceLabel)} (${health?.coveragePct || 0}%)</small>
      </span>
    ` : ''}
  `;

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    openHealthFormulaModal(project, health);
  });

  return btn;
}

// ─────────────────────────────────────────────
// 8. MODAL DE EXPLICAÇÃO DA FÓRMULA DE SAÚDE (FASE 5)
// ─────────────────────────────────────────────
export function openHealthFormulaModal(project, health) {
  const wrap = document.createElement('div');
  wrap.className = 'health-formula-modal';

  const meta = getHealthVisualMeta(health);
  const projectTitle = project?.name || 'Fórmula de Saúde do Projeto';

  const disclaimer = document.createElement('div');
  disclaimer.className = 'health-formula-disclaimer';
  disclaimer.innerHTML = `
    <strong>📐 Indicador Heurístico v${_escapeHtml(HEALTH_FORMULA_VERSION)}:</strong>
    <span>${_escapeHtml(HEALTH_FORMULA_SPEC.disclaimer)}</span>
  `;
  wrap.appendChild(disclaimer);

  if (health) {
    const summaryBox = document.createElement('div');
    summaryBox.className = 'health-formula-summary-box';
    summaryBox.innerHTML = `
      <div class="health-formula-score-big" style="border-color:${meta.color};color:${meta.color};">
        <span class="tabular">${health.score !== null ? health.score : 'N/D'}</span>
        <small>/ 100</small>
      </div>
      <div class="health-formula-summary-meta">
        <div><strong>Status heurístico:</strong> <span style="color:${meta.color};font-weight:700;">${_escapeHtml(meta.tierLabel)}</span></div>
        <div><strong>Cobertura de dados:</strong> <span class="tabular">${health.coveragePct}%</span> (${health.availableWeight}/${health.totalWeight} pontos de peso disponíveis)</div>
        <div><strong>Nível de confiança:</strong> <span style="text-transform:uppercase;font-weight:700;">${_escapeHtml(health.confidence)}</span> ${health.isComparable ? '· Comparável entre projetos' : '· ⚠️ Cobertura < 50% (não comparável diretamente)'}</div>
      </div>
    `;
    wrap.appendChild(summaryBox);

    if (Array.isArray(health.factors) && health.factors.length > 0) {
      const factorTitle = document.createElement('h4');
      factorTitle.style.cssText = 'font-size:var(--text-sm);margin:14px 0 8px 0;color:var(--text-main);';
      factorTitle.textContent = `Decomposição dos fatores em "${projectTitle}"`;
      wrap.appendChild(factorTitle);

      const tableWrap = document.createElement('div');
      tableWrap.className = 'health-factors-table-wrap';
      const rowsHtml = health.factors.map(f => {
        const statusBadge = f.available
          ? `<span class="badge" style="background:rgba(16,185,129,0.14);color:#34d399;border:1px solid rgba(16,185,129,0.3);">Disponível</span>`
          : `<span class="badge" style="background:rgba(100,116,139,0.16);color:var(--text-muted);border:1px solid var(--border-subtle);">Ausente / Não penaliza</span>`;
        return `
          <tr>
            <td>
              <strong>${_escapeHtml(f.label)}</strong>
              <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">${_escapeHtml(f.reason || '')}</div>
            </td>
            <td class="tabular">${f.weight}%</td>
            <td>${statusBadge}</td>
            <td class="tabular">${f.available ? `${f.normalizedWeight}%` : '—'}</td>
            <td class="tabular">${f.available && f.rawScore !== null ? `${f.rawScore}/100` : '—'}</td>
            <td class="tabular" style="font-weight:700;color:${f.available ? 'var(--text-main)' : 'var(--text-muted)'};">${f.available && f.contribution !== null ? `+${f.contribution}` : '—'}</td>
          </tr>
        `;
      }).join('');

      tableWrap.innerHTML = `
        <table class="health-factors-table">
          <thead>
            <tr>
              <th>Fator</th>
              <th>Peso Base</th>
              <th>Estado do Dado</th>
              <th>Peso Norm.</th>
              <th>Nota Fator</th>
              <th>Contribuição</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      `;
      wrap.appendChild(tableWrap);
    }
  }

  // Tabela da Especificação Pública
  const specDetails = document.createElement('details');
  specDetails.className = 'health-spec-details';
  if (!health) specDetails.open = true;
  specDetails.innerHTML = `
    <summary style="cursor:pointer;font-weight:600;font-size:var(--text-xs);color:var(--accent-primary);margin-top:12px;">
      📖 Ver especificação pública completa e regras de normalização (v${_escapeHtml(HEALTH_FORMULA_VERSION)})
    </summary>
    <div style="margin-top:8px;font-size:var(--text-xs);color:var(--text-secondary);display:flex;flex-direction:column;gap:6px;">
      <p><strong>Regra de Ouro (Dado ausente não é falha):</strong> Quando um dado ainda não foi consultado (ex.: GitHub Actions, Issues, README sob demanda) ou não se aplica (projeto puramente local), seu peso é redistribuído proporcionalmente entre os fatores disponíveis. Se menos de 50% do peso total estiver disponível, a confiança cai para <code>baixa</code> e o projeto é marcado como não comparável.</p>
      <ul style="padding-left:18px;display:flex;flex-direction:column;gap:4px;">
        ${HEALTH_FORMULA_SPEC.factors.map(f => `
          <li><strong>${_escapeHtml(f.label)} (${f.weight} pts):</strong> ${_escapeHtml(f.description)}</li>
        `).join('')}
      </ul>
    </div>
  `;
  wrap.appendChild(specDetails);

  openModal({
    title: `Saúde Heurística — ${projectTitle}`,
    content: wrap
  });
}

// ─────────────────────────────────────────────
// 9. BADGE DE STATUS DO BUILD / GITHUB ACTIONS (FASE 5)
// ─────────────────────────────────────────────
export function renderBuildStatusBadge(actionsTech, options = {}) {
  const { compact = false, showUnavailableOnCompact = false } = options;

  if (!actionsTech || actionsTech.availability === 'not_fetched') {
    if (compact && !showUnavailableOnCompact) return null;
    const span = document.createElement('span');
    span.className = 'build-status-badge status-unavailable';
    span.title = 'Status do GitHub Actions ainda não consultado (carregado sob demanda ao abrir o projeto).';
    span.innerHTML = `<span aria-hidden="true">⚪</span> <span>Build: Sob demanda</span>`;
    return span;
  }

  const info = classifyActionsRuns(actionsTech);

  // Estado cinza para indisponível / sem permissão / rate limit / sem workflows
  let badgeClass = 'status-unavailable';
  let icon = '📡';
  if (info.status === 'success') {
    badgeClass = 'status-success';
    icon = '🟢';
  } else if (info.status === 'failure' && info.isConfirmedFailure) {
    badgeClass = 'status-failure';
    icon = '🔴';
  } else if (info.status === 'warning') {
    badgeClass = 'status-warning';
    icon = '🟡';
  } else if (info.status === 'none') {
    badgeClass = 'status-none';
    icon = '⚪';
  } else if (actionsTech.availability === 'permission_denied') {
    badgeClass = 'status-unavailable';
    icon = '🔒';
  } else if (actionsTech.availability === 'rate_limit') {
    badgeClass = 'status-unavailable';
    icon = '⏳';
  }

  if (compact && info.status === 'none' && !showUnavailableOnCompact) {
    return null;
  }

  const el = document.createElement('span');
  el.className = `build-status-badge ${badgeClass}`;
  const fullTooltip = `${info.label}: ${info.detail}`;
  el.title = fullTooltip;
  el.setAttribute('aria-label', fullTooltip);

  const shortText = compact
    ? (info.status === 'success' ? 'Build OK'
      : (info.status === 'failure' && info.isConfirmedFailure) ? 'Build Falhou'
      : info.status === 'warning' ? 'Build Rodando'
      : actionsTech.availability === 'permission_denied' ? 'Build: Sem perm.'
      : 'Build: Indisp.')
    : info.label;

  el.innerHTML = `<span aria-hidden="true">${icon}</span> <span>${_escapeHtml(shortText)}</span>`;
  return el;
}

// ─────────────────────────────────────────────
// 10. GRÁFICOS DO RELATÓRIO SEMANAL E ANÁLISES (#/reports — FASE 5)
// ─────────────────────────────────────────────

/**
 * Gráfico SVG de ritmo diário nos últimos 7 dias (Tarefas concluídas + Minutos de foco).
 */
export function renderWeeklyReportChart(weeklyData) {
  const days = weeklyData?.dailyBreakdown || [];
  const card = document.createElement('section');
  card.className = 'card bento-widget weekly-report-chart-widget';
  card.setAttribute('aria-label', 'Ritmo diário nos últimos 7 dias');

  const header = document.createElement('div');
  header.className = 'widget-header';
  header.innerHTML = `
    <div>
      <div class="section-eyebrow">📅 Últimos 7 Dias</div>
      <h3 class="widget-title">Tarefas Concluídas & Foco Diário</h3>
    </div>
    <span class="widget-origin-tag">Domínio Local + GitHub</span>
  `;
  card.appendChild(header);

  const maxTasks = Math.max(1, ...days.map(d => d.tasksCompleted || 0));
  const maxFocus = Math.max(15, ...days.map(d => d.focusMinutes || 0));

  const svgWidth = 420;
  const svgHeight = 145;
  const chartBottom = 112;
  const chartTop = 18;
  const usableH = chartBottom - chartTop;
  const stepX = svgWidth / Math.max(1, days.length);

  const groupsSvg = days.map((d, idx) => {
    const cx = Math.round(idx * stepX + stepX / 2);
    const taskH = d.tasksCompleted > 0 ? Math.max(6, Math.round((d.tasksCompleted / maxTasks) * usableH)) : 3;
    const focusH = d.focusMinutes > 0 ? Math.max(6, Math.round((d.focusMinutes / maxFocus) * usableH)) : 3;

    const taskX = cx - 13;
    const focusX = cx + 2;
    const shortDate = d.date.slice(8, 10) + '/' + d.date.slice(5, 7);

    return `
      <g>
        <title>${d.date}: ${d.tasksCompleted} tarefa(s) concluída(s), ${d.focusMinutes} min de foco${d.publicEvents !== null ? `, ${d.publicEvents} evento(s) GitHub` : ''}</title>
        <rect x="${taskX}" y="${chartBottom - taskH}" width="11" height="${taskH}" rx="3" fill="${d.tasksCompleted > 0 ? '#10b981' : 'var(--border-subtle)'}" />
        <rect x="${focusX}" y="${chartBottom - focusH}" width="11" height="${focusH}" rx="3" fill="${d.focusMinutes > 0 ? '#8b5cf6' : 'var(--border-subtle)'}" />
        ${d.tasksCompleted > 0 ? `<text x="${taskX + 5.5}" y="${Math.max(11, chartBottom - taskH - 4)}" text-anchor="middle" fill="#34d399" font-size="8" font-family="var(--font-mono)">${d.tasksCompleted}</text>` : ''}
        ${d.focusMinutes > 0 ? `<text x="${focusX + 5.5}" y="${Math.max(11, chartBottom - focusH - 4)}" text-anchor="middle" fill="#c084fc" font-size="8" font-family="var(--font-mono)">${d.focusMinutes}m</text>` : ''}
        <text x="${cx}" y="128" text-anchor="middle" fill="var(--text-muted)" font-size="9" font-family="var(--font-mono)">${shortDate}</text>
      </g>
    `;
  }).join('');

  const wrap = document.createElement('div');
  wrap.className = 'weekly-chart-wrap';
  wrap.innerHTML = `
    <svg viewBox="0 0 ${svgWidth} ${svgHeight}" width="100%" height="150" role="img" aria-label="Gráfico de barras comparando tarefas concluídas e minutos de foco nos últimos 7 dias">
      ${groupsSvg}
    </svg>
    <div class="widget-footer-note">
      <span style="display:inline-flex;align-items:center;gap:12px;">
        <span><span class="ring-dot" style="background:#10b981;display:inline-block;width:8px;height:8px;border-radius:50%;"></span> Tarefas concluídas</span>
        <span><span class="ring-dot" style="background:#8b5cf6;display:inline-block;width:8px;height:8px;border-radius:50%;"></span> Minutos de foco</span>
      </span>
      <span>Janela: 7 dias recentes</span>
    </div>
  `;
  card.appendChild(wrap);
  return card;
}

/**
 * Gráfico de evolução de linguagens ao longo do tempo (somente quando há amostra suficiente).
 */
export function renderLanguageTimelineChart(timelineAnalysis) {
  const card = document.createElement('section');
  card.className = 'card bento-widget lang-timeline-widget';
  card.setAttribute('aria-label', 'Evolução de linguagens ao longo do tempo');

  const header = document.createElement('div');
  header.className = 'widget-header';
  header.innerHTML = `
    <div>
      <div class="section-eyebrow">⏳ Histórico de Stack</div>
      <h3 class="widget-title">Linguagens ao Longo do Tempo</h3>
    </div>
    <span class="widget-origin-tag">Por semestre de criação</span>
  `;
  card.appendChild(header);

  if (!timelineAnalysis?.hasSufficientSample) {
    const empty = document.createElement('div');
    empty.className = 'widget-unavailable-box';
    empty.innerHTML = `
      <span style="font-size:1.25rem;">📊</span>
      <div>
        <strong>Amostra insuficiente para linha do tempo</strong>
        <p style="font-size:var(--text-xs);color:var(--text-muted);margin-top:2px;">
          ${_escapeHtml(timelineAnalysis?.insufficientReason || 'São necessários pelo menos 3 projetos com linguagem em 2 períodos distintos.')}
        </p>
      </div>
    `;
    card.appendChild(empty);
    return card;
  }

  const buckets = timelineAnalysis.buckets || [];
  const langs = timelineAnalysis.languages || [];
  const maxTotal = Math.max(1, ...buckets.map(b => b.total || 0));

  const svgWidth = 420;
  const svgHeight = 150;
  const chartBottom = 115;
  const chartTop = 18;
  const usableH = chartBottom - chartTop;
  const barWidth = Math.min(34, Math.max(16, Math.floor((svgWidth / buckets.length) * 0.55)));
  const stepX = svgWidth / buckets.length;

  const barsSvg = buckets.map((b, idx) => {
    const x = Math.round(idx * stepX + (stepX - barWidth) / 2);
    let currentY = chartBottom;
    const segments = langs.map(lang => {
      const count = b.counts[lang] || 0;
      if (count <= 0) return '';
      const segH = Math.max(4, Math.round((count / maxTotal) * usableH));
      currentY -= segH;
      const color = getLangColor(lang);
      return `
        <rect x="${x}" y="${currentY}" width="${barWidth}" height="${segH}" rx="2" fill="${color}">
          <title>${b.quarter} · ${lang}: ${count} projeto(s)</title>
        </rect>
      `;
    }).join('');

    return `
      <g>
        ${segments}
        <text x="${x + barWidth / 2}" y="${Math.max(11, currentY - 4)}" text-anchor="middle" fill="var(--text-secondary)" font-size="8" font-family="var(--font-mono)">${b.total}</text>
        <text x="${x + barWidth / 2}" y="132" text-anchor="middle" fill="var(--text-muted)" font-size="8.5" font-family="var(--font-mono)">${_escapeHtml(b.quarter)}</text>
      </g>
    `;
  }).join('');

  const wrap = document.createElement('div');
  wrap.className = 'weekly-chart-wrap';
  wrap.innerHTML = `
    <svg viewBox="0 0 ${svgWidth} ${svgHeight}" width="100%" height="150" role="img" aria-label="Evolução de linguagens principais por semestre">
      ${barsSvg}
    </svg>
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:6px;">
      ${langs.map(l => `
        <span style="display:inline-flex;align-items:center;gap:5px;font-size:11px;color:var(--text-secondary);">
          <span class="meta-lang-dot" style="background:${getLangColor(l)};"></span>
          ${_escapeHtml(l)}
        </span>
      `).join('')}
    </div>
    <p style="font-size:11px;color:var(--text-muted);margin-top:8px;line-height:1.4;">
      ℹ️ ${_escapeHtml(timelineAnalysis.limitationNote)}
    </p>
  `;
  card.appendChild(wrap);
  return card;
}

/**
 * Radar de Atividade por Linguagem (somente quando há amostra suficiente; nunca infere proficiência real).
 */
export function renderSkillsRadarChart(radarAnalysis) {
  const card = document.createElement('section');
  card.className = 'card bento-widget skills-radar-widget';
  card.setAttribute('aria-label', 'Radar de distribuição de projetos e atividade por linguagem');

  const header = document.createElement('div');
  header.className = 'widget-header';
  header.innerHTML = `
    <div>
      <div class="section-eyebrow">🧭 Distribuição de Uso</div>
      <h3 class="widget-title">Radar de Linguagens no Painel</h3>
    </div>
    <span class="widget-origin-tag">Volume & Atividade</span>
  `;
  card.appendChild(header);

  if (!radarAnalysis?.hasSufficientSample) {
    const empty = document.createElement('div');
    empty.className = 'widget-unavailable-box';
    empty.innerHTML = `
      <span style="font-size:1.25rem;">🧭</span>
      <div>
        <strong>Amostra insuficiente para o radar</strong>
        <p style="font-size:var(--text-xs);color:var(--text-muted);margin-top:2px;">
          ${_escapeHtml(radarAnalysis?.insufficientReason || 'São necessárias pelo menos 3 linguagens em 3+ projetos.')}
        </p>
      </div>
    `;
    card.appendChild(empty);
    return card;
  }

  const axes = radarAnalysis.axes || [];
  const n = axes.length;
  const size = 230;
  const cx = size / 2;
  const cy = size / 2;
  const maxR = 76;

  const angleFor = (i) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const pointAt = (i, normFraction) => {
    const a = angleFor(i);
    const r = normFraction * maxR;
    return [+(cx + r * Math.cos(a)).toFixed(1), +(cy + r * Math.sin(a)).toFixed(1)];
  };

  // Polígonos de grade (33%, 66%, 100%)
  const gridPolygons = [0.33, 0.66, 1].map(level => {
    const pts = axes.map((_, i) => pointAt(i, level).join(',')).join(' ');
    return `<polygon points="${pts}" fill="none" stroke="var(--border-subtle)" stroke-width="1" />`;
  }).join('');

  // Eixos radiais e rótulos
  const axesLinesAndLabels = axes.map((ax, i) => {
    const [ex, ey] = pointAt(i, 1);
    const [lx, ly] = pointAt(i, 1.24);
    return `
      <line x1="${cx}" y1="${cy}" x2="${ex}" y2="${ey}" stroke="var(--border-subtle)" stroke-width="1" />
      <text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle" fill="var(--text-secondary)" font-size="9.5" font-weight="600">
        ${_escapeHtml(ax.language)} (${ax.projectCount})
      </text>
    `;
  }).join('');

  // Polígono de dados
  const dataPoints = axes.map((ax, i) => pointAt(i, Math.max(0.1, ax.normalizedScore / 100)).join(',')).join(' ');
  const dotsSvg = axes.map((ax, i) => {
    const [px, py] = pointAt(i, Math.max(0.1, ax.normalizedScore / 100));
    return `
      <circle cx="${px}" cy="${py}" r="3.5" fill="var(--accent-primary)" stroke="var(--bg-card)" stroke-width="1.5">
        <title>${ax.language}: ${ax.projectCount} projeto(s), ${ax.activeCount} ativo(s), ${ax.tasksDone} tarefa(s), ${ax.focusMinutes} min foco (índice relativo: ${ax.normalizedScore}/100)</title>
      </circle>
    `;
  }).join('');

  const body = document.createElement('div');
  body.className = 'radar-widget-body';
  body.innerHTML = `
    <div style="display:flex;justify-content:center;">
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="Radar de distribuição de uso entre ${axes.map(a => a.language).join(', ')}">
        ${gridPolygons}
        ${axesLinesAndLabels}
        <polygon points="${dataPoints}" fill="rgba(139, 92, 246, 0.24)" stroke="var(--accent-primary)" stroke-width="2" />
        ${dotsSvg}
      </svg>
    </div>
    <p style="font-size:11px;color:var(--text-muted);margin-top:6px;line-height:1.4;">
      ⚠️ <strong>Aviso metodológico:</strong> ${_escapeHtml(radarAnalysis.disclaimer)}
    </p>
  `;

  card.appendChild(body);
  return card;
}
