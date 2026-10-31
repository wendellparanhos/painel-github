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
  formatLocalDueDate
} from '../utils/domain.js';
import { getLangColor } from '../services/github.js';
import { getFxLevel, isReducedMotion } from '../fx/effects.js';

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
