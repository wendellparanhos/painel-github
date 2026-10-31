/**
 * View Especial (Carregada sob demanda): Galáxia de Projetos (#/galaxy) — Fase 3
 *
 * Especificação atendida:
 *   - Canvas 2D adaptativo (devicePixelRatio ≤ 2, ResizeObserver, limpeza total no unmount)
 *   - Cada repositório é um astro:
 *       • Tamanho: atividade recente + tarefas + estrelas (métrica documentada na legenda)
 *       • Cor: status do projeto (ideia, em andamento, pausado, concluído, arquivado)
 *       • Brilho (halo): saúde simples (atividade nos últimos 30 dias e sem tarefas vencidas)
 *       • Órbitas/agrupamentos por linguagem principal
 *   - Interação: pan, zoom (wheel + botões), pinch-to-zoom, busca com destaque, botão recentralizar
 *   - Toque/clique abre resumo acessível com ações rápidas
 *   - Lista alternativa completa para teclado/leitor de tela e fallback automático em nível mínimo
 */

import { getState, dispatch, subscribe } from '../store/store.js';
import { getMergedProjects, filterAndSortProjects, STATUS_ORDER } from '../utils/domain.js';
import { getLangColor } from '../services/github.js';
import {
  setupAdaptiveCanvas,
  addFrameListener,
  getFxLevel,
  isReducedMotion,
  getObjectLimits
} from '../fx/effects.js';
import { formatRelativeTime } from '../utils/formatters.js';
import { navigate } from '../router.js';
import { showToast } from '../components/toast.js';

const STATUS_HEX = {
  'ideia': '#a855f7',
  'em andamento': '#06b6d4',
  'pausado': '#f59e0b',
  'concluído': '#10b981',
  'arquivado': '#64748b'
};

let _container = null;
let _unsubscribeStore = null;
let _canvasHandle = null;
let _removeFrame = null;
let _cleanupEvents = [];

let _viewMode = 'canvas'; // 'canvas' | 'list'
let _searchQuery = '';
let _selectedRepoId = null;

// Câmera (Pan + Zoom)
let _cam = { x: 0, y: 0, zoom: 1 };
let _canvasWidth = 800;
let _canvasHeight = 520;
let _ctx = null;

// Astros computados
let _stars = [];
let _orbits = [];

export const GalaxyView = {
  mount(container) {
    _container = container;
    // Fallback automático para lista se estiver em nível mínimo ou reduced motion
    _viewMode = (getFxLevel() === 'minimo' || isReducedMotion()) ? 'list' : 'canvas';
    _searchQuery = '';
    _selectedRepoId = null;
    _cam = { x: 0, y: 0, zoom: 1 };

    _render();

    _unsubscribeStore = subscribe(() => {
      _recomputeStars();
      _updateDetailPanel();
      if (_viewMode === 'list') {
        _renderAccessibleList();
      } else {
        _drawOnce();
      }
    });
  },

  unmount() {
    _stopLoop();
    _canvasHandle?.destroy();
    _canvasHandle = null;
    _cleanupEvents.forEach(fn => { try { fn(); } catch { /* silencioso */ } });
    _cleanupEvents = [];
    _unsubscribeStore?.();
    _unsubscribeStore = null;
    _ctx = null;
    _container = null;
  }
};

export default GalaxyView;

function _stopLoop() {
  if (_removeFrame) {
    _removeFrame();
    _removeFrame = null;
  }
}

function _render() {
  if (!_container) return;
  _stopLoop();
  _canvasHandle?.destroy();
  _canvasHandle = null;
  _cleanupEvents.forEach(fn => { try { fn(); } catch { /* silencioso */ } });
  _cleanupEvents = [];

  _container.innerHTML = '';
  const root = document.createElement('div');
  root.className = 'galaxy-view special-viz-view';

  // Cabeçalho + Controles + Alternador Lista Acessível
  const header = document.createElement('div');
  header.className = 'viz-header';
  header.innerHTML = `
    <div>
      <div class="section-eyebrow">🌌 Visualização Espacial · Canvas 2D</div>
      <h1 class="home-title" style="font-size:var(--text-2xl);">Galáxia de Projetos</h1>
      <p class="home-subtitle" style="font-size:var(--text-sm);">
        Cada repositório é um astro agrupado em órbitas por linguagem. Tamanho = atividade recente + estrelas; Cor = status; Brilho = saúde simples (atividade nos últimos 30d e tarefas em dia).
      </p>
    </div>
  `;

  const toolbar = document.createElement('div');
  toolbar.className = 'viz-toolbar card';

  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.className = 'input';
  searchInput.style.maxWidth = '260px';
  searchInput.placeholder = 'Buscar e destacar astro…';
  searchInput.setAttribute('aria-label', 'Buscar projeto na galáxia');
  searchInput.value = _searchQuery;
  searchInput.addEventListener('input', () => {
    _searchQuery = searchInput.value.trim().toLowerCase();
    if (_searchQuery) {
      const match = _stars.find(s => s.project.name.toLowerCase().includes(_searchQuery));
      if (match) {
        _selectedRepoId = match.project.repoId;
        _updateDetailPanel();
      }
    }
    if (_viewMode === 'list') _renderAccessibleList();
    else _drawOnce();
  });

  const btnGroup = document.createElement('div');
  btnGroup.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;align-items:center;';

  const zoomInBtn = document.createElement('button');
  zoomInBtn.type = 'button';
  zoomInBtn.className = 'btn btn-secondary btn-sm';
  zoomInBtn.textContent = '＋ Zoom';
  zoomInBtn.setAttribute('aria-label', 'Aumentar zoom');
  zoomInBtn.addEventListener('click', () => {
    _cam.zoom = Math.min(3, _cam.zoom * 1.25);
    _drawOnce();
  });

  const zoomOutBtn = document.createElement('button');
  zoomOutBtn.type = 'button';
  zoomOutBtn.className = 'btn btn-secondary btn-sm';
  zoomOutBtn.textContent = '－ Zoom';
  zoomOutBtn.setAttribute('aria-label', 'Reduzir zoom');
  zoomOutBtn.addEventListener('click', () => {
    _cam.zoom = Math.max(0.4, _cam.zoom / 1.25);
    _drawOnce();
  });

  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.className = 'btn btn-secondary btn-sm';
  resetBtn.textContent = '🎯 Recentralizar';
  resetBtn.addEventListener('click', () => {
    _cam = { x: 0, y: 0, zoom: 1 };
    _drawOnce();
  });

  const toggleModeBtn = document.createElement('button');
  toggleModeBtn.type = 'button';
  toggleModeBtn.className = 'btn btn-primary btn-sm';
  toggleModeBtn.textContent = _viewMode === 'canvas' ? '📋 Lista Acessível (Teclado)' : '🌌 Voltar ao Mapa Canvas';
  toggleModeBtn.setAttribute('aria-pressed', _viewMode === 'list' ? 'true' : 'false');
  toggleModeBtn.addEventListener('click', () => {
    _viewMode = _viewMode === 'canvas' ? 'list' : 'canvas';
    _render();
  });

  if (_viewMode === 'canvas') {
    btnGroup.appendChild(zoomInBtn);
    btnGroup.appendChild(zoomOutBtn);
    btnGroup.appendChild(resetBtn);
  }
  btnGroup.appendChild(toggleModeBtn);

  toolbar.appendChild(searchInput);
  toolbar.appendChild(btnGroup);

  // Legenda explícita de métricas (Cor, Tamanho, Brilho)
  const legendBar = document.createElement('div');
  legendBar.className = 'viz-legend-bar card';
  legendBar.innerHTML = `
    <div class="viz-legend-group">
      <strong>Status (Cor):</strong>
      ${STATUS_ORDER.map(st => `
        <span class="viz-legend-item">
          <span class="ring-dot" style="background:${STATUS_HEX[st]};"></span>
          <span style="text-transform:capitalize;">${st}</span>
        </span>
      `).join('')}
    </div>
    <div class="viz-legend-group">
      <span><strong>Tamanho:</strong> Atividade recente + tarefas + ⭐</span>
      <span>·</span>
      <span><strong>Halo brilhante:</strong> Ativo (&lt;30d) e sem tarefas atrasadas</span>
    </div>
  `;

  // Área principal: Canvas (ou Lista Acessível) + Painel de Resumo lateral
  const stageGrid = document.createElement('div');
  stageGrid.className = 'viz-stage-grid';

  const mainStage = document.createElement('div');
  mainStage.className = 'viz-main-stage card';
  mainStage.id = 'galaxy-main-stage';

  const detailPanel = document.createElement('aside');
  detailPanel.className = 'viz-detail-panel card';
  detailPanel.id = 'galaxy-detail-panel';
  detailPanel.setAttribute('aria-live', 'polite');

  stageGrid.appendChild(mainStage);
  stageGrid.appendChild(detailPanel);

  root.appendChild(header);
  root.appendChild(toolbar);
  root.appendChild(legendBar);
  root.appendChild(stageGrid);
  _container.appendChild(root);

  _recomputeStars();
  if (!_selectedRepoId && _stars.length > 0) {
    _selectedRepoId = _stars[0].project.repoId;
  }
  _updateDetailPanel();

  if (_viewMode === 'list') {
    _renderAccessibleList();
  } else {
    _mountCanvas(mainStage);
  }
}

// ─────────────────────────────────────────────
// CÁLCULO DAS ÓRBITAS E ASTROS (COM LIMITE DE OBJETOS)
// ─────────────────────────────────────────────
function _recomputeStars() {
  const state = getState();
  const merged = filterAndSortProjects(getMergedProjects(state), { special: 'ativos', sort: 'updated' });
  const maxStars = getObjectLimits().maxGalaxyStars || 160;
  const limited = merged.slice(0, maxStars);

  // Agrupa por linguagem para definir anéis orbitais
  const langGroups = new Map();
  for (const proj of limited) {
    const lang = proj.language || 'Outros';
    if (!langGroups.has(lang)) langGroups.set(lang, []);
    langGroups.get(lang).push(proj);
  }

  const languages = Array.from(langGroups.keys());
  _orbits = [];
  _stars = [];

  const now = Date.now();
  const baseRadius = 75;
  const radiusStep = Math.max(42, Math.min(72, 240 / Math.max(1, languages.length)));

  languages.forEach((lang, orbitIdx) => {
    const orbitRadius = baseRadius + orbitIdx * radiusStep;
    const group = langGroups.get(lang);
    const langColor = lang === 'Outros' ? '#64748b' : getLangColor(lang);

    _orbits.push({
      language: lang,
      radius: orbitRadius,
      color: langColor,
      count: group.length
    });

    group.forEach((proj, idx) => {
      const angle = (idx / group.length) * Math.PI * 2 + orbitIdx * 0.55;
      const daysSincePush = proj.pushedAt
        ? (now - new Date(proj.pushedAt).getTime()) / 86400000
        : 120;

      // Métrica clara de tamanho: atividade recente (até 6pt) + tarefas (até 4pt) + estrelas (até 4pt)
      const recencyScore = daysSincePush <= 7 ? 6 : daysSincePush <= 30 ? 4 : daysSincePush <= 90 ? 2 : 0;
      const tasksScore = Math.min(4, proj.tasks.length);
      const starsScore = Math.min(4, Math.log2((proj.stars || 0) + 1));
      const size = 6.5 + recencyScore + tasksScore * 0.7 + starsScore * 0.8;

      // Saúde simples para o brilho: ativo nos últimos 30 dias e sem tarefas atrasadas
      const isHealthyActive = daysSincePush <= 30 && proj.overdueTasksCount === 0;

      _stars.push({
        project: proj,
        orbitRadius,
        baseAngle: angle,
        speed: (0.00018 / (1 + orbitIdx * 0.35)) * (idx % 2 === 0 ? 1 : -1),
        x: Math.cos(angle) * orbitRadius,
        y: Math.sin(angle) * orbitRadius,
        size,
        color: STATUS_HEX[proj.status] || '#8b5cf6',
        langColor,
        isHealthyActive,
        daysSincePush: Math.round(daysSincePush)
      });
    });
  });
}

// ─────────────────────────────────────────────
// CANVAS 2D INTERATIVO (PAN, ZOOM, PINCH, HIT-TEST)
// ─────────────────────────────────────────────
function _mountCanvas(stageEl) {
  stageEl.innerHTML = '';
  const canvas = document.createElement('canvas');
  canvas.className = 'viz-canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Mapa interativo da Galáxia de Projetos. Use o botão Lista Acessível para navegar via teclado.');
  stageEl.appendChild(canvas);

  _canvasHandle = setupAdaptiveCanvas(canvas, ({ width, height, ctx }) => {
    _canvasWidth = width;
    _canvasHeight = height;
    _ctx = ctx;
    _drawOnce();
  });

  // Interações de ponteiro: Pan, Clique e Pinch-to-Zoom
  let isDragging = false;
  let dragMoved = false;
  let startX = 0;
  let startY = 0;
  const activePointers = new Map();
  let lastPinchDist = null;

  const onPointerDown = (e) => {
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (activePointers.size === 1) {
      isDragging = true;
      dragMoved = false;
      startX = e.clientX - _cam.x;
      startY = e.clientY - _cam.y;
    }
  };

  const onPointerMove = (e) => {
    if (activePointers.has(e.pointerId)) {
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    // Pinch-to-zoom com 2 ponteiros
    if (activePointers.size === 2) {
      const pts = Array.from(activePointers.values());
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (lastPinchDist !== null && dist > 10) {
        const scale = dist / lastPinchDist;
        _cam.zoom = Math.max(0.4, Math.min(3, _cam.zoom * scale));
        _drawOnce();
      }
      lastPinchDist = dist;
      return;
    }

    if (!isDragging) return;
    const nx = e.clientX - startX;
    const ny = e.clientY - startY;
    if (Math.hypot(nx - _cam.x, ny - _cam.y) > 4) {
      dragMoved = true;
    }
    _cam.x = nx;
    _cam.y = ny;
    _drawOnce();
  };

  const onPointerUp = (e) => {
    activePointers.delete(e.pointerId);
    if (activePointers.size < 2) lastPinchDist = null;

    if (isDragging && !dragMoved) {
      _handleCanvasTap(e, canvas);
    }
    isDragging = false;
  };

  const onWheel = (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    _cam.zoom = Math.max(0.4, Math.min(3, _cam.zoom * factor));
    _drawOnce();
  };

  canvas.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });

  _cleanupEvents.push(() => {
    canvas.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
    canvas.removeEventListener('wheel', onWheel);
  });

  // Se o nível de efeitos permitir movimento orbital suave, registra no rAF compartilhado
  if (getFxLevel() === 'completo' && !isReducedMotion()) {
    let lastTs = 0;
    _removeFrame = addFrameListener((ts) => {
      const dt = lastTs ? Math.min(50, ts - lastTs) : 16;
      lastTs = ts;
      for (const s of _stars) {
        s.baseAngle += s.speed * dt;
        s.x = Math.cos(s.baseAngle) * s.orbitRadius;
        s.y = Math.sin(s.baseAngle) * s.orbitRadius;
      }
      _drawOnce();
    });
  } else {
    _drawOnce();
  }
}

function _handleCanvasTap(e, canvas) {
  const rect = canvas.getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  const clickY = e.clientY - rect.top;

  const centerX = _canvasWidth / 2 + _cam.x;
  const centerY = _canvasHeight / 2 + _cam.y;
  const worldX = (clickX - centerX) / _cam.zoom;
  const worldY = (clickY - centerY) / _cam.zoom;

  let hit = null;
  let minDist = Infinity;

  for (const s of _stars) {
    const d = Math.hypot(worldX - s.x, worldY - s.y);
    const hitRadius = Math.max(14, s.size + 6);
    if (d <= hitRadius && d < minDist) {
      minDist = d;
      hit = s;
    }
  }

  if (hit) {
    _selectedRepoId = hit.project.repoId;
    _updateDetailPanel();
    _drawOnce();
  }
}

function _drawOnce() {
  if (!_ctx) return;
  const ctx = _ctx;
  const w = _canvasWidth;
  const h = _canvasHeight;

  ctx.clearRect(0, 0, w, h);

  const centerX = w / 2 + _cam.x;
  const centerY = h / 2 + _cam.y;

  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.scale(_cam.zoom, _cam.zoom);

  // Núcleo central da Galáxia
  const coreGrad = ctx.createRadialGradient(0, 0, 2, 0, 0, 38);
  coreGrad.addColorStop(0, 'rgba(139, 92, 246, 0.55)');
  coreGrad.addColorStop(1, 'rgba(139, 92, 246, 0)');
  ctx.fillStyle = coreGrad;
  ctx.beginPath();
  ctx.arc(0, 0, 38, 0, Math.PI * 2);
  ctx.fill();

  // Desenha anéis de órbita por linguagem
  for (const orb of _orbits) {
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.16)';
    ctx.lineWidth = 1 / _cam.zoom;
    ctx.setLineDash([4 / _cam.zoom, 6 / _cam.zoom]);
    ctx.beginPath();
    ctx.arc(0, 0, orb.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Rótulo da órbita
    ctx.fillStyle = 'rgba(148, 163, 184, 0.65)';
    ctx.font = `${Math.max(9, Math.round(10 / _cam.zoom))}px Inter, sans-serif`;
    ctx.fillText(`${orb.language} (${orb.count})`, 6, -orb.radius + 12 / _cam.zoom);
  }

  // Desenha cada astro (repositório)
  for (const s of _stars) {
    const isMatched = _searchQuery
      ? s.project.name.toLowerCase().includes(_searchQuery) || (s.project.language || '').toLowerCase().includes(_searchQuery)
      : true;
    const isSelected = s.project.repoId === _selectedRepoId;

    ctx.globalAlpha = isMatched ? 1 : 0.2;

    // Halo de brilho para projetos ativos e saudáveis ou selecionados
    if (s.isHealthyActive || isSelected) {
      const haloRadius = s.size * (isSelected ? 2.4 : 1.8);
      const halo = ctx.createRadialGradient(s.x, s.y, s.size * 0.3, s.x, s.y, haloRadius);
      halo.addColorStop(0, `${s.color}66`);
      halo.addColorStop(1, `${s.color}00`);
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(s.x, s.y, haloRadius, 0, Math.PI * 2);
      ctx.fill();
    }

    // Corpo do astro
    ctx.fillStyle = s.color;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
    ctx.fill();

    // Anel de seleção
    if (isSelected) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2 / _cam.zoom;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size + 4 / _cam.zoom, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Nome do repositório
    ctx.fillStyle = isSelected ? '#ffffff' : 'rgba(248, 250, 252, 0.85)';
    ctx.font = `${isSelected ? '700' : '500'} ${Math.max(10, Math.round(11 / _cam.zoom))}px Inter, sans-serif`;
    ctx.fillText(s.project.name, s.x + s.size + 5, s.y + 3);
  }

  ctx.globalAlpha = 1;
  ctx.restore();
}

// ─────────────────────────────────────────────
// PAINEL DE RESUMO ACESSÍVEL DO ASTRO SELECIONADO
// ─────────────────────────────────────────────
function _updateDetailPanel() {
  const panel = document.getElementById('galaxy-detail-panel');
  if (!panel) return;

  const star = _stars.find(s => s.project.repoId === _selectedRepoId) || _stars[0];
  if (!star) {
    panel.innerHTML = `<p style="color:var(--text-muted);font-size:var(--text-sm);">Nenhum projeto disponível na galáxia.</p>`;
    return;
  }

  const p = star.project;
  const cls = p.status.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-');

  panel.innerHTML = `
    <div class="section-eyebrow">🔭 Astro Selecionado</div>
    <h2 style="font-size:var(--text-lg);font-weight:700;margin:4px 0 8px;">
      ${p.customIcon ? p.customIcon + ' ' : ''}${_escape(p.name)}
    </h2>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px;">
      <span class="badge badge-${cls}"><span class="badge-dot"></span>${p.status}</span>
      <span class="widget-origin-tag">${_escape(p.language || 'Sem linguagem')}</span>
    </div>
    <p style="font-size:var(--text-sm);color:var(--text-secondary);margin-bottom:12px;">
      ${_escape(p.description || 'Sem descrição cadastrada.')}
    </p>
    <div class="viz-metrics-list">
      <div><span>Saúde simples:</span> <strong>${star.isHealthyActive ? '✨ Ativo e em dia' : '🌙 Estável / Sem push recente'}</strong></div>
      <div><span>Último push:</span> <strong>${p.pushedAt ? formatRelativeTime(p.pushedAt) : '—'}</strong></div>
      <div><span>Tarefas abertas:</span> <strong class="tabular">${p.openTasksCount} (${p.overdueTasksCount} atrasada)</strong></div>
      <div><span>Estrelas:</span> <strong class="tabular">⭐ ${p.stars}</strong></div>
    </div>
  `;

  // Seletor rápido de status + botão abrir
  const controls = document.createElement('div');
  controls.style.cssText = 'display:flex;flex-direction:column;gap:8px;margin-top:14px;';

  const statusSelect = document.createElement('select');
  statusSelect.className = 'select';
  statusSelect.setAttribute('aria-label', `Mudar status de ${p.name}`);
  for (const st of STATUS_ORDER) {
    const opt = document.createElement('option');
    opt.value = st;
    opt.textContent = `Status: ${st}`;
    opt.selected = st === p.status;
    statusSelect.appendChild(opt);
  }
  statusSelect.addEventListener('change', () => {
    dispatch({ type: 'PROJECT_UPDATE_STATUS', payload: { repoId: p.repoId, status: statusSelect.value } });
    showToast(`Status de "${p.name}" atualizado para "${statusSelect.value}".`, { type: 'success', duration: 3000 });
  });

  const openBtn = document.createElement('button');
  openBtn.type = 'button';
  openBtn.className = 'btn btn-primary btn-sm';
  openBtn.textContent = 'Abrir Página do Projeto →';
  openBtn.addEventListener('click', () => navigate(`#/project/${p.repoId}`));

  controls.appendChild(statusSelect);
  controls.appendChild(openBtn);
  panel.appendChild(controls);
}

// ─────────────────────────────────────────────
// LISTA ALTERNATIVA ACESSÍVEL (TECLADO E LEITOR DE TELA)
// ─────────────────────────────────────────────
function _renderAccessibleList() {
  const stageEl = document.getElementById('galaxy-main-stage');
  if (!stageEl) return;
  _stopLoop();
  stageEl.innerHTML = '';

  const wrap = document.createElement('div');
  wrap.style.cssText = 'padding:16px;overflow-y:auto;max-height:520px;';

  const filtered = _stars.filter(s =>
    !_searchQuery ||
    s.project.name.toLowerCase().includes(_searchQuery) ||
    (s.project.language || '').toLowerCase().includes(_searchQuery)
  );

  const intro = document.createElement('p');
  intro.style.cssText = 'font-size:var(--text-sm);color:var(--text-secondary);margin-bottom:12px;';
  intro.textContent = `Visão alternativa acessível da Galáxia (${filtered.length} astro(s)). Use Tab e Enter para inspecionar ou abrir qualquer projeto.`;
  wrap.appendChild(intro);

  const list = document.createElement('div');
  list.className = 'viz-accessible-list';
  list.setAttribute('role', 'list');

  for (const s of filtered) {
    const p = s.project;
    const row = document.createElement('button');
    row.type = 'button';
    row.className = `viz-accessible-row${p.repoId === _selectedRepoId ? ' is-selected' : ''}`;
    row.setAttribute('role', 'listitem');
    row.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;">
        <span class="ring-dot" style="background:${s.color};"></span>
        <strong>${_escape(p.name)}</strong>
        <span class="widget-origin-tag">${_escape(p.language || 'Outros')}</span>
      </div>
      <div style="font-size:var(--text-xs);color:var(--text-secondary);">
        Status: ${p.status} · Tarefas: ${p.doneTasksCount}/${p.tasks.length} · ${s.isHealthyActive ? '✨ Ativo (<30d)' : '🌙 Estável'}
      </div>
    `;
    row.addEventListener('click', () => {
      _selectedRepoId = p.repoId;
      _updateDetailPanel();
      _renderAccessibleList();
    });
    list.appendChild(row);
  }

  wrap.appendChild(list);
  stageEl.appendChild(wrap);
}

function _escape(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
