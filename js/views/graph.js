/**
 * View Especial (Carregada sob demanda): Grafo de Conexões (#/graph) — Fase 3
 *
 * Especificação atendida:
 *   - Ligações por linguagem/topics em comum com legenda explícita do critério
 *   - Aviso claro: compartilhar linguagem/tópico indica agrupamento técnico, não dependência real de código
 *   - Nós arrastáveis, pan/zoom e destaque de vizinhança
 *   - Simulação de forças própria com amortecimento que PARA completamente ao estabilizar (zero CPU ociosa)
 *   - Filtros para evitar excesso de arestas (critério + linguagem + limite máximo de arestas)
 *   - Lista alternativa acessível para teclado e leitor de tela
 */

import { getState, subscribe } from '../store/store.js';
import { getMergedProjects, filterAndSortProjects } from '../utils/domain.js';
import { getLangColor } from '../services/github.js';
import {
  setupAdaptiveCanvas,
  addFrameListener,
  getFxLevel,
  isReducedMotion,
  getObjectLimits
} from '../fx/effects.js';
import { navigate } from '../router.js';

let _container = null;
let _unsubscribeStore = null;
let _canvasHandle = null;
let _removeSimFrame = null;
let _cleanupEvents = [];

let _viewMode = 'canvas'; // 'canvas' | 'list'
let _edgeCriterion = 'topics_or_lang'; // 'topics_or_lang' | 'topics_only' | 'lang_only'
let _langFilter = 'todas';
let _selectedNodeId = null;

// Câmera e Canvas
let _cam = { x: 0, y: 0, zoom: 1 };
let _canvasWidth = 800;
let _canvasHeight = 520;
let _ctx = null;

// Grafo e Simulação
let _nodes = [];
let _edges = [];
let _neighborsMap = new Map();
let _simTicks = 0;
let _simSettled = false;
const MAX_SIM_TICKS = 160;

export const GraphView = {
  mount(container) {
    _container = container;
    _viewMode = (getFxLevel() === 'minimo' || isReducedMotion()) ? 'list' : 'canvas';
    _edgeCriterion = 'topics_or_lang';
    _langFilter = 'todas';
    _selectedNodeId = null;
    _cam = { x: 0, y: 0, zoom: 1 };

    _render();

    _unsubscribeStore = subscribe(() => {
      _buildGraphData();
      _updateNeighborPanel();
      if (_viewMode === 'list') {
        _renderAccessibleList();
      } else {
        _restartSimulation();
      }
    });
  },

  unmount() {
    _stopSimLoop();
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

export default GraphView;

function _stopSimLoop() {
  if (_removeSimFrame) {
    _removeSimFrame();
    _removeSimFrame = null;
  }
}

function _render() {
  if (!_container) return;
  _stopSimLoop();
  _canvasHandle?.destroy();
  _canvasHandle = null;
  _cleanupEvents.forEach(fn => { try { fn(); } catch { /* silencioso */ } });
  _cleanupEvents = [];

  _container.innerHTML = '';
  const root = document.createElement('div');
  root.className = 'graph-view special-viz-view';

  const header = document.createElement('div');
  header.className = 'viz-header';
  header.innerHTML = `
    <div>
      <div class="section-eyebrow">🕸️ Topologia por Afinidade · Simulação Auto-Estabilizante</div>
      <h1 class="home-title" style="font-size:var(--text-2xl);">Grafo de Conexões</h1>
      <p class="home-subtitle" style="font-size:var(--text-sm);">
        Agrupamento visual por tópicos e linguagem principal compartilhada. <em>Nota: arestas indicam afinidade técnica/catálogo, não dependência real entre repositórios.</em>
      </p>
    </div>
  `;

  // Coleta linguagens existentes para o filtro
  const allProjects = getMergedProjects(getState()).filter(p => !p.hidden);
  const allLangs = Array.from(new Set(allProjects.map(p => p.language).filter(Boolean))).sort();

  const toolbar = document.createElement('div');
  toolbar.className = 'viz-toolbar card';

  const filtersWrap = document.createElement('div');
  filtersWrap.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;align-items:center;';

  const criterionSelect = document.createElement('select');
  criterionSelect.className = 'select';
  criterionSelect.setAttribute('aria-label', 'Critério de ligação entre nós');
  [
    { value: 'topics_or_lang', label: 'Critério: Tópicos ou Linguagem' },
    { value: 'topics_only',    label: 'Critério: Apenas Tópicos em comum' },
    { value: 'lang_only',      label: 'Critério: Apenas Mesma Linguagem' }
  ].forEach(optData => {
    const opt = document.createElement('option');
    opt.value = optData.value;
    opt.textContent = optData.label;
    opt.selected = optData.value === _edgeCriterion;
    criterionSelect.appendChild(opt);
  });
  criterionSelect.addEventListener('change', () => {
    _edgeCriterion = criterionSelect.value;
    _buildGraphData();
    _updateNeighborPanel();
    if (_viewMode === 'list') _renderAccessibleList();
    else _restartSimulation();
  });

  const langSelect = document.createElement('select');
  langSelect.className = 'select';
  langSelect.setAttribute('aria-label', 'Filtrar nós por linguagem');
  const allOpt = document.createElement('option');
  allOpt.value = 'todas';
  allOpt.textContent = 'Linguagem: Todas';
  langSelect.appendChild(allOpt);
  for (const l of allLangs) {
    const opt = document.createElement('option');
    opt.value = l;
    opt.textContent = `Linguagem: ${l}`;
    opt.selected = l === _langFilter;
    langSelect.appendChild(opt);
  }
  langSelect.addEventListener('change', () => {
    _langFilter = langSelect.value;
    _buildGraphData();
    _updateNeighborPanel();
    if (_viewMode === 'list') _renderAccessibleList();
    else _restartSimulation();
  });

  filtersWrap.appendChild(criterionSelect);
  filtersWrap.appendChild(langSelect);

  const actionsWrap = document.createElement('div');
  actionsWrap.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;align-items:center;';

  const simStatusBadge = document.createElement('span');
  simStatusBadge.id = 'graph-sim-status';
  simStatusBadge.className = 'widget-origin-tag tabular';
  simStatusBadge.textContent = 'Simulação pronta';

  const reorgBtn = document.createElement('button');
  reorgBtn.type = 'button';
  reorgBtn.className = 'btn btn-secondary btn-sm';
  reorgBtn.textContent = '🔄 Reorganizar';
  reorgBtn.addEventListener('click', () => {
    _cam = { x: 0, y: 0, zoom: 1 };
    _restartSimulation(true);
  });

  const toggleModeBtn = document.createElement('button');
  toggleModeBtn.type = 'button';
  toggleModeBtn.className = 'btn btn-primary btn-sm';
  toggleModeBtn.textContent = _viewMode === 'canvas' ? '📋 Lista Acessível (Teclado)' : '🕸️ Voltar ao Grafo Canvas';
  toggleModeBtn.addEventListener('click', () => {
    _viewMode = _viewMode === 'canvas' ? 'list' : 'canvas';
    _render();
  });

  if (_viewMode === 'canvas') {
    actionsWrap.appendChild(simStatusBadge);
    actionsWrap.appendChild(reorgBtn);
  }
  actionsWrap.appendChild(toggleModeBtn);

  toolbar.appendChild(filtersWrap);
  toolbar.appendChild(actionsWrap);

  // Legenda explícita do critério de arestas
  const legendBar = document.createElement('div');
  legendBar.className = 'viz-legend-bar card';
  legendBar.innerHTML = `
    <div class="viz-legend-group">
      <span><strong>Aresta contínua violeta:</strong> Tópico(s) em comum no GitHub</span>
      <span>·</span>
      <span><strong>Aresta tracejada suave:</strong> Mesma linguagem principal (limitada aos pares mais próximos para evitar poluição visual)</span>
    </div>
    <div class="viz-legend-group">
      <span>💡 Arraste qualquer nó para reposicionar; clique para destacar sua vizinhança.</span>
    </div>
  `;

  const stageGrid = document.createElement('div');
  stageGrid.className = 'viz-stage-grid';

  const mainStage = document.createElement('div');
  mainStage.className = 'viz-main-stage card';
  mainStage.id = 'graph-main-stage';

  const detailPanel = document.createElement('aside');
  detailPanel.className = 'viz-detail-panel card';
  detailPanel.id = 'graph-detail-panel';
  detailPanel.setAttribute('aria-live', 'polite');

  stageGrid.appendChild(mainStage);
  stageGrid.appendChild(detailPanel);

  root.appendChild(header);
  root.appendChild(toolbar);
  root.appendChild(legendBar);
  root.appendChild(stageGrid);
  _container.appendChild(root);

  _buildGraphData();
  if (!_selectedNodeId && _nodes.length > 0) {
    _selectedNodeId = _nodes[0].id;
  }
  _updateNeighborPanel();

  if (_viewMode === 'list') {
    _renderAccessibleList();
  } else {
    _mountCanvas(mainStage);
  }
}

// ─────────────────────────────────────────────
// CONSTRUÇÃO DE NÓS E ARESTAS (COM ORÇAMENTO ESTRITO)
// ─────────────────────────────────────────────
function _buildGraphData() {
  const state = getState();
  const limits = getObjectLimits();
  let projects = filterAndSortProjects(getMergedProjects(state), { special: 'ativos', sort: 'updated' });

  if (_langFilter !== 'todas') {
    projects = projects.filter(p => p.language === _langFilter);
  }

  projects = projects.slice(0, limits.maxGraphNodes || 110);

  // Posição inicial em espiral determinística
  _nodes = projects.map((proj, idx) => {
    const angle = idx * 0.85;
    const radius = 35 + Math.sqrt(idx) * 34;
    return {
      id: proj.repoId,
      project: proj,
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
      vx: 0,
      vy: 0,
      r: 8 + Math.min(6, Math.log2((proj.stars || 0) + 1) + proj.openTasksCount * 0.6),
      color: proj.language ? getLangColor(proj.language) : '#8b5cf6',
      pinnedByDrag: false
    };
  });

  _edges = [];
  _neighborsMap = new Map();
  for (const n of _nodes) _neighborsMap.set(n.id, new Set());

  const maxEdges = limits.maxGraphEdges || 180;
  // Limita conexões de mesma linguagem por nó (evita clique completo K_n ilegível)
  const langDegreeCount = new Map();

  for (let i = 0; i < _nodes.length; i++) {
    for (let j = i + 1; j < _nodes.length; j++) {
      if (_edges.length >= maxEdges) break;

      const a = _nodes[i].project;
      const b = _nodes[j].project;

      const sharedTopics = (a.topics || []).filter(t => (b.topics || []).includes(t));
      const sameLang = Boolean(a.language && b.language && a.language === b.language);

      let type = null;
      let reason = '';

      if (_edgeCriterion !== 'lang_only' && sharedTopics.length > 0) {
        type = 'topic';
        reason = `Tópico(s): ${sharedTopics.slice(0, 2).join(', ')}`;
      } else if (_edgeCriterion !== 'topics_only' && sameLang) {
        const degA = langDegreeCount.get(a.repoId) || 0;
        const degB = langDegreeCount.get(b.repoId) || 0;
        if (degA < 3 && degB < 3) {
          type = 'language';
          reason = `Linguagem: ${a.language}`;
          langDegreeCount.set(a.repoId, degA + 1);
          langDegreeCount.set(b.repoId, degB + 1);
        }
      }

      if (type) {
        _edges.push({
          source: _nodes[i],
          target: _nodes[j],
          type,
          reason
        });
        _neighborsMap.get(_nodes[i].id)?.add(_nodes[j].id);
        _neighborsMap.get(_nodes[j].id)?.add(_nodes[i].id);
      }
    }
  }
}

// ─────────────────────────────────────────────
// SIMULAÇÃO FÍSICA QUE PARA AO ESTABILIZAR
// ─────────────────────────────────────────────
function _restartSimulation(randomize = false) {
  _stopSimLoop();
  _simTicks = 0;
  _simSettled = false;

  if (randomize) {
    _nodes.forEach((n, idx) => {
      const angle = idx * 1.1 + (idx % 3) * 0.4;
      const r = 40 + Math.sqrt(idx) * 32;
      n.x = Math.cos(angle) * r;
      n.y = Math.sin(angle) * r;
      n.vx = 0;
      n.vy = 0;
    });
  }

  // Em nível mínimo ou reduced motion, executa 45 passos síncronos leves e desenha 1 vez (sem loop de rAF)
  if (getFxLevel() === 'minimo' || isReducedMotion()) {
    for (let i = 0; i < 45; i++) _stepPhysics();
    _simSettled = true;
    _updateSimBadge('Estabilizado (instantâneo)');
    _drawGraph();
    return;
  }

  _updateSimBadge('Estabilizando forças…');

  _removeSimFrame = addFrameListener(() => {
    const kineticEnergy = _stepPhysics();
    _simTicks++;
    _drawGraph();

    if (kineticEnergy < 0.08 || _simTicks >= MAX_SIM_TICKS) {
      _simSettled = true;
      _stopSimLoop();
      _updateSimBadge('Estabilizado (0% CPU)');
    }
  });
}

function _stepPhysics() {
  const repulsion = 2200;
  const springLength = 95;
  const springK = 0.035;
  const centerPull = 0.012;
  const damping = 0.80;

  // 1. Repulsão entre todos os pares de nós
  for (let i = 0; i < _nodes.length; i++) {
    const a = _nodes[i];
    for (let j = i + 1; j < _nodes.length; j++) {
      const b = _nodes[j];
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let distSq = dx * dx + dy * dy;
      if (distSq < 25) distSq = 25;
      const dist = Math.sqrt(distSq);
      const force = repulsion / distSq;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;

      if (!a.pinnedByDrag) { a.vx -= fx; a.vy -= fy; }
      if (!b.pinnedByDrag) { b.vx += fx; b.vy += fy; }
    }
  }

  // 2. Atração de mola nas arestas
  for (const edge of _edges) {
    const a = edge.source;
    const b = edge.target;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.max(1, Math.hypot(dx, dy));
    const displacement = dist - springLength;
    const force = displacement * springK;
    const fx = (dx / dist) * force;
    const fy = (dy / dist) * force;

    if (!a.pinnedByDrag) { a.vx += fx; a.vy += fy; }
    if (!b.pinnedByDrag) { b.vx -= fx; b.vy -= fy; }
  }

  // 3. Gravidade central suave + integração com amortecimento
  let totalEnergy = 0;
  for (const n of _nodes) {
    if (n.pinnedByDrag) continue;
    n.vx = (n.vx - n.x * centerPull) * damping;
    n.vy = (n.vy - n.y * centerPull) * damping;

    // Limita velocidade máxima por passo
    const speed = Math.hypot(n.vx, n.vy);
    if (speed > 12) {
      n.vx = (n.vx / speed) * 12;
      n.vy = (n.vy / speed) * 12;
    }

    n.x += n.vx;
    n.y += n.vy;
    totalEnergy += n.vx * n.vx + n.vy * n.vy;
  }

  return totalEnergy / Math.max(1, _nodes.length);
}

function _updateSimBadge(text) {
  const el = document.getElementById('graph-sim-status');
  if (el) el.textContent = text;
}

// ─────────────────────────────────────────────
// CANVAS 2D E ARRASTO DE NÓS / PAN / ZOOM
// ─────────────────────────────────────────────
function _mountCanvas(stageEl) {
  stageEl.innerHTML = '';
  const canvas = document.createElement('canvas');
  canvas.className = 'viz-canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Grafo interativo de conexões entre projetos. Use o botão Lista Acessível para navegar via teclado.');
  stageEl.appendChild(canvas);

  _canvasHandle = setupAdaptiveCanvas(canvas, ({ width, height, ctx }) => {
    _canvasWidth = width;
    _canvasHeight = height;
    _ctx = ctx;
    _drawGraph();
  });

  let draggedNode = null;
  let isPanning = false;
  let panStartX = 0;
  let panStartY = 0;

  const toWorld = (clientX, clientY) => {
    const rect = canvas.getBoundingClientRect();
    const cx = clientX - rect.left - (_canvasWidth / 2 + _cam.x);
    const cy = clientY - rect.top - (_canvasHeight / 2 + _cam.y);
    return { x: cx / _cam.zoom, y: cy / _cam.zoom };
  };

  const onPointerDown = (e) => {
    const wPos = toWorld(e.clientX, e.clientY);
    let hit = null;
    for (const n of _nodes) {
      if (Math.hypot(wPos.x - n.x, wPos.y - n.y) <= Math.max(14, n.r + 5)) {
        hit = n;
        break;
      }
    }

    if (hit) {
      draggedNode = hit;
      draggedNode.pinnedByDrag = true;
      _selectedNodeId = hit.id;
      _updateNeighborPanel();
      _drawGraph();
    } else {
      isPanning = true;
      panStartX = e.clientX - _cam.x;
      panStartY = e.clientY - _cam.y;
    }
  };

  const onPointerMove = (e) => {
    if (draggedNode) {
      const wPos = toWorld(e.clientX, e.clientY);
      draggedNode.x = wPos.x;
      draggedNode.y = wPos.y;
      if (_simSettled) {
        // Reativa brevemente a física para acomodar os vizinhos e para novamente ao estabilizar
        _restartSimulation(false);
      } else {
        _drawGraph();
      }
    } else if (isPanning) {
      _cam.x = e.clientX - panStartX;
      _cam.y = e.clientY - panStartY;
      _drawGraph();
    }
  };

  const onPointerUp = () => {
    if (draggedNode) {
      draggedNode.pinnedByDrag = false;
      draggedNode = null;
    }
    isPanning = false;
  };

  const onWheel = (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    _cam.zoom = Math.max(0.4, Math.min(2.8, _cam.zoom * factor));
    _drawGraph();
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

  _restartSimulation(false);
}

function _drawGraph() {
  if (!_ctx) return;
  const ctx = _ctx;
  const w = _canvasWidth;
  const h = _canvasHeight;

  ctx.clearRect(0, 0, w, h);

  const centerX = w / 2 + _cam.x;
  const centerY = h / 2 + _cam.y;
  const activeNeighbors = _selectedNodeId ? (_neighborsMap.get(_selectedNodeId) || new Set()) : new Set();

  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.scale(_cam.zoom, _cam.zoom);

  // 1. Desenha arestas
  for (const edge of _edges) {
    const isIncident = _selectedNodeId &&
      (edge.source.id === _selectedNodeId || edge.target.id === _selectedNodeId);

    ctx.globalAlpha = _selectedNodeId ? (isIncident ? 0.92 : 0.14) : 0.45;
    ctx.strokeStyle = edge.type === 'topic' ? '#8b5cf6' : 'rgba(148, 163, 184, 0.55)';
    ctx.lineWidth = (isIncident ? 2 : 1.1) / _cam.zoom;

    if (edge.type === 'language') {
      ctx.setLineDash([4 / _cam.zoom, 4 / _cam.zoom]);
    } else {
      ctx.setLineDash([]);
    }

    ctx.beginPath();
    ctx.moveTo(edge.source.x, edge.source.y);
    ctx.lineTo(edge.target.x, edge.target.y);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // 2. Desenha nós
  for (const n of _nodes) {
    const isSelected = n.id === _selectedNodeId;
    const isNeighbor = activeNeighbors.has(n.id);
    const dim = _selectedNodeId && !isSelected && !isNeighbor;

    ctx.globalAlpha = dim ? 0.25 : 1;

    if (isSelected || isNeighbor) {
      ctx.fillStyle = isSelected ? 'rgba(139, 92, 246, 0.32)' : 'rgba(6, 182, 212, 0.22)';
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r + 5 / _cam.zoom, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = n.color;
    ctx.beginPath();
    ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
    ctx.fill();

    if (isSelected) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2 / _cam.zoom;
      ctx.stroke();
    }

    ctx.fillStyle = isSelected ? '#ffffff' : 'rgba(248, 250, 252, 0.88)';
    ctx.font = `${isSelected ? '700' : '500'} ${Math.max(10, Math.round(11 / _cam.zoom))}px Inter, sans-serif`;
    ctx.fillText(n.project.name, n.x + n.r + 5, n.y + 3);
  }

  ctx.globalAlpha = 1;
  ctx.restore();
}

// ─────────────────────────────────────────────
// PAINEL LATERAL DE VIZINHANÇA
// ─────────────────────────────────────────────
function _updateNeighborPanel() {
  const panel = document.getElementById('graph-detail-panel');
  if (!panel) return;

  const node = _nodes.find(n => n.id === _selectedNodeId) || _nodes[0];
  if (!node) {
    panel.innerHTML = `<p style="color:var(--text-muted);font-size:var(--text-sm);">Nenhum nó para os filtros atuais.</p>`;
    return;
  }

  const p = node.project;
  const incidentEdges = _edges.filter(e => e.source.id === node.id || e.target.id === node.id);

  panel.innerHTML = `
    <div class="section-eyebrow">🔗 Nó Selecionado & Vizinhança</div>
    <h2 style="font-size:var(--text-lg);font-weight:700;margin:4px 0 8px;">${_escape(p.name)}</h2>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;">
      <span class="widget-origin-tag">${_escape(p.language || 'Sem linguagem')}</span>
      ${(p.topics || []).map(t => `<span class="widget-origin-tag">#${_escape(t)}</span>`).join('')}
    </div>
    <p style="font-size:var(--text-xs);color:var(--text-secondary);margin-bottom:10px;">
      Conectado a <strong class="tabular">${incidentEdges.length}</strong> projeto(s) pelo critério selecionado:
    </p>
  `;

  const list = document.createElement('div');
  list.className = 'viz-accessible-list';
  list.style.maxHeight = '240px';
  list.style.overflowY = 'auto';

  if (incidentEdges.length === 0) {
    const empty = document.createElement('p');
    empty.style.cssText = 'font-size:var(--text-xs);color:var(--text-muted);';
    empty.textContent = 'Sem arestas para este projeto no critério atual.';
    list.appendChild(empty);
  } else {
    for (const edge of incidentEdges) {
      const other = edge.source.id === node.id ? edge.target : edge.source;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'viz-accessible-row';
      btn.innerHTML = `
        <strong>${_escape(other.project.name)}</strong>
        <span style="font-size:var(--text-xs);color:var(--text-muted);">${_escape(edge.reason)}</span>
      `;
      btn.addEventListener('click', () => {
        _selectedNodeId = other.id;
        _updateNeighborPanel();
        if (_viewMode === 'list') _renderAccessibleList();
        else _drawGraph();
      });
      list.appendChild(btn);
    }
  }

  const openBtn = document.createElement('button');
  openBtn.type = 'button';
  openBtn.className = 'btn btn-primary btn-sm';
  openBtn.style.marginTop = '12px';
  openBtn.textContent = 'Abrir Projeto →';
  openBtn.addEventListener('click', () => navigate(`#/project/${p.repoId}`));

  panel.appendChild(list);
  panel.appendChild(openBtn);
}

// ─────────────────────────────────────────────
// LISTA ALTERNATIVA ACESSÍVEL (TECLADO E LEITOR DE TELA)
// ─────────────────────────────────────────────
function _renderAccessibleList() {
  const stageEl = document.getElementById('graph-main-stage');
  if (!stageEl) return;
  _stopSimLoop();
  stageEl.innerHTML = '';

  const wrap = document.createElement('div');
  wrap.style.cssText = 'padding:16px;overflow-y:auto;max-height:520px;';

  const intro = document.createElement('p');
  intro.style.cssText = 'font-size:var(--text-sm);color:var(--text-secondary);margin-bottom:12px;';
  intro.textContent = `Lista acessível de nós e conexões (${_nodes.length} nós, ${_edges.length} arestas). Selecione um projeto para inspecionar sua vizinhança.`;
  wrap.appendChild(intro);

  const list = document.createElement('div');
  list.className = 'viz-accessible-list';
  list.setAttribute('role', 'list');

  for (const n of _nodes) {
    const deg = (_neighborsMap.get(n.id) || new Set()).size;
    const row = document.createElement('button');
    row.type = 'button';
    row.className = `viz-accessible-row${n.id === _selectedNodeId ? ' is-selected' : ''}`;
    row.setAttribute('role', 'listitem');
    row.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;">
        <span class="ring-dot" style="background:${n.color};"></span>
        <strong>${_escape(n.project.name)}</strong>
        <span class="widget-origin-tag">${_escape(n.project.language || '—')}</span>
      </div>
      <div style="font-size:var(--text-xs);color:var(--text-secondary);">
        ${deg} conexão(ões) · Tópicos: ${(n.project.topics || []).join(', ') || 'nenhum'}
      </div>
    `;
    row.addEventListener('click', () => {
      _selectedNodeId = n.id;
      _updateNeighborPanel();
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
