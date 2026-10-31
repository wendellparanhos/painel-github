/**
 * Motor de Efeitos e Performance Adaptativa — Fase 3
 *
 * Responsabilidades:
 *   1. Monitor de FPS contínuo e leve com histerese (exige queda sustentada < 45 fps
 *      em pelo menos 2 janelas consecutivas + cooldown de 15s antes de descer nível).
 *   2. Respeito absoluto a `prefers-reduced-motion: reduce` (força `minimo`, nunca sobreposto).
 *   3. Loop de animação `requestAnimationFrame` compartilhado, pausado com aba oculta
 *      e limpo a cada troca de view (`cleanupViewEffects`).
 *   4. Resolução de Canvas adaptativa (`devicePixelRatio` limitado ≤ 2 + `ResizeObserver`).
 *   5. Perfis `mobile` vs `desktop` com orçamento estrito de partículas, nós e arestas.
 *   6. Efeitos de interface (Aurora Reativa por status dominante + horário do dia,
 *      Spotlight, Tilt 3D, Magnetic Buttons, Dock Wave e Partículas/Grade 3D opcionais).
 */

// ─────────────────────────────────────────────
// ESTADO INTERNO DO MOTOR
// ─────────────────────────────────────────────
let _fxLevel = 'completo'; // 'completo' | 'reduzido' | 'minimo'
let _userPreferredLevel = 'completo';
let _reducedMotion = false;
let _isHidden = false;
let _deviceProfile = 'desktop'; // 'desktop' | 'mobile'

const _frameListeners = new Set();
const _viewEffects = new Set(); // Contratos { start?, stop?, destroy } da view ativa
let _rafId = null;

// Monitor de FPS com histerese
const FPS_THRESHOLD = 45;
const FPS_WINDOW_MS = 1800;
const FPS_MIN_FRAMES = 30;
const DOWNGRADE_COOLDOWN_MS = 15000;

let _fpsWindowStart = 0;
let _fpsFrameCount = 0;
let _currentFps = 60;
let _avgFps = 60;
let _consecutiveLowWindows = 0;
let _lastDowngradeAt = 0;
let _downgradeCount = 0;
let _bootProbeActive = false;
let _bootProbeTimer = null;

// Camada ambiente (Aurora + Grade 3D + Partículas de fundo)
let _ambientLayer = null;
let _ambientCanvas = null;
let _ambientResizeCleanup = null;
let _ambientFrameUnsub = null;
let _ambientMouseCleanup = null;

// ─────────────────────────────────────────────
// INICIALIZAÇÃO
// ─────────────────────────────────────────────
export function initEffects(userPreference = 'completo') {
  _userPreferredLevel = userPreference || 'completo';
  _reducedMotion = Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
  _deviceProfile = _detectDeviceProfile();

  const isWeakDevice = detectWeakDevice();

  // Regra estrita: prefers-reduced-motion SEMPRE força 'minimo' e não pode ser sobreposto
  if (_reducedMotion) {
    _fxLevel = 'minimo';
  } else if (isWeakDevice && _userPreferredLevel === 'completo') {
    _fxLevel = 'reduzido';
  } else {
    _fxLevel = _userPreferredLevel;
  }

  applyFxLevel(_fxLevel);
  _applyDaytimeTint();
  _initAmbientBackground();

  // Escuta mudanças em prefers-reduced-motion em tempo real
  const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  if (mq?.addEventListener) {
    mq.addEventListener('change', (e) => {
      _reducedMotion = e.matches;
      if (_reducedMotion) {
        _forceMinimoForReducedMotion();
      } else {
        setFxLevel(_userPreferredLevel, false);
      }
    });
  }

  // Escuta resize para atualizar perfil mobile/desktop
  window.addEventListener('resize', _handleViewportProfileChange, { passive: true });

  // Suspende loops quando a aba fica oculta
  document.addEventListener('visibilitychange', _handleVisibilityChange);

  // Sonda inicial de FPS nos primeiros 4 segundos (se não estiver em mínimo)
  if (_fxLevel !== 'minimo' && !_reducedMotion) {
    _startBootFpsProbe();
  }
}

function _forceMinimoForReducedMotion() {
  _fxLevel = 'minimo';
  applyFxLevel('minimo');
  _stopFrameLoop();
  _syncAmbientState();
}

function _handleVisibilityChange() {
  _isHidden = document.visibilityState === 'hidden';
  if (_isHidden) {
    _stopFrameLoop();
    for (const eff of _viewEffects) {
      try { eff.stop?.(); } catch { /* silencioso */ }
    }
  } else {
    // Reinicia janela de FPS para não contar o tempo oculto como queda de frame
    _fpsWindowStart = 0;
    _fpsFrameCount = 0;
    for (const eff of _viewEffects) {
      try { if (_fxLevel !== 'minimo') eff.start?.(); } catch { /* silencioso */ }
    }
    if ((_frameListeners.size > 0 || _bootProbeActive) && _fxLevel !== 'minimo' && !_reducedMotion) {
      _startFrameLoop();
    }
  }
}

function _handleViewportProfileChange() {
  const nextProfile = _detectDeviceProfile();
  if (nextProfile !== _deviceProfile) {
    _deviceProfile = nextProfile;
    document.documentElement?.setAttribute?.('data-device', _deviceProfile);
  }
}

// ─────────────────────────────────────────────
// PERFIS DE DISPOSITIVO E ORÇAMENTO DE OBJETOS
// ─────────────────────────────────────────────
function _detectDeviceProfile() {
  const width = window.innerWidth || window.screen?.width || 1024;
  const coarse = Boolean(window.matchMedia?.('(pointer: coarse)')?.matches);
  const profile = (width < 768 || coarse) ? 'mobile' : 'desktop';
  document.documentElement?.setAttribute?.('data-device', profile);
  return profile;
}

export function detectWeakDevice() {
  const cores = typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency || 4) : 4;
  const memory = typeof navigator !== 'undefined' ? (navigator.deviceMemory || 4) : 4;
  if (cores <= 2 || memory <= 2) return true;
  if ((window.devicePixelRatio || 1) >= 3 && (window.screen?.width || 1024) <= 400) return true;
  return false;
}

export function getDeviceProfile() {
  return _deviceProfile;
}

/**
 * Retorna os limites máximos de objetos e resolução de acordo com o perfil e nível atual.
 */
export function getObjectLimits() {
  const isMobile = _deviceProfile === 'mobile';
  if (_fxLevel === 'minimo' || _reducedMotion) {
    return {
      maxAmbientParticles: 0,
      maxBurstParticles: 0,
      maxGalaxyStars: isMobile ? 80 : 140,
      maxGraphNodes: isMobile ? 60 : 110,
      maxGraphEdges: isMobile ? 90 : 180,
      maxBubbles: isMobile ? 18 : 28,
      maxDPR: 1
    };
  }
  if (_fxLevel === 'reduzido') {
    return {
      maxAmbientParticles: 0,
      maxBurstParticles: isMobile ? 12 : 18,
      maxGalaxyStars: isMobile ? 100 : 160,
      maxGraphNodes: isMobile ? 80 : 130,
      maxGraphEdges: isMobile ? 120 : 200,
      maxBubbles: isMobile ? 22 : 32,
      maxDPR: isMobile ? 1.25 : 1.5
    };
  }
  // Nível completo
  return {
    maxAmbientParticles: isMobile ? 10 : 24,
    maxBurstParticles: isMobile ? 20 : 34,
    maxGalaxyStars: isMobile ? 120 : 200,
    maxGraphNodes: isMobile ? 90 : 150,
    maxGraphEdges: isMobile ? 140 : 240,
    maxBubbles: isMobile ? 24 : 40,
    maxDPR: isMobile ? 1.5 : 2
  };
}

export function getAdaptiveDPR() {
  const raw = window.devicePixelRatio || 1;
  return Math.min(raw, getObjectLimits().maxDPR);
}

// ─────────────────────────────────────────────
// GERENCIAMENTO DE NÍVEL (COMPLETO / REDUZIDO / MÍNIMO)
// ─────────────────────────────────────────────
export function applyFxLevel(level) {
  const effective = _reducedMotion ? 'minimo' : (level === 'minimo' ? 'minimo' : level === 'reduzido' ? 'reduzido' : 'completo');
  const root = document.documentElement;
  root?.setAttribute?.('data-fx', effective);
  root?.setAttribute?.('data-device', _deviceProfile);
}

/**
 * Define o nível de efeitos.
 * Regra de portão de qualidade: `prefers-reduced-motion: reduce` nunca pode ser sobreposto.
 */
export function setFxLevel(level, persist = false, isUserAction = true) {
  if (isUserAction) {
    _userPreferredLevel = level;
    _consecutiveLowWindows = 0;
  }

  if (_reducedMotion) {
    _fxLevel = 'minimo';
  } else {
    _fxLevel = level === 'minimo' ? 'minimo' : level === 'reduzido' ? 'reduzido' : 'completo';
  }

  applyFxLevel(_fxLevel);
  _syncAmbientState();

  if (_fxLevel === 'minimo') {
    _stopFrameLoop();
  } else if (_frameListeners.size > 0 && !_isHidden) {
    _startFrameLoop();
  }

  if (persist) {
    document.dispatchEvent?.(new CustomEvent('fx:level-changed', {
      detail: { level: _fxLevel },
      bubbles: true
    }));
  }
}

export function getFxLevel() {
  return _reducedMotion ? 'minimo' : _fxLevel;
}

export function isReducedMotion() {
  return _reducedMotion;
}

export function getPerfMetrics() {
  return {
    currentFps: Math.round(_currentFps),
    avgFps: Math.round(_avgFps),
    level: getFxLevel(),
    reducedMotion: _reducedMotion,
    deviceProfile: _deviceProfile,
    activeFrameListeners: _frameListeners.size,
    activeViewEffects: _viewEffects.size,
    downgradeCount: _downgradeCount
  };
}

// ─────────────────────────────────────────────
// LOOP DE ANIMAÇÃO COMPARTILHADO + MONITOR DE FPS COM HISTERESE
// ─────────────────────────────────────────────
function _startBootFpsProbe() {
  _bootProbeActive = true;
  if (!_isHidden && !_rafId) _startFrameLoop();
  clearTimeout(_bootProbeTimer);
  _bootProbeTimer = setTimeout(() => {
    _bootProbeActive = false;
    if (_frameListeners.size === 0) _stopFrameLoop();
  }, 4200);
}

function _startFrameLoop() {
  if (_rafId || _isHidden || _fxLevel === 'minimo' || _reducedMotion) return;
  if (typeof requestAnimationFrame !== 'function') return;

  _fpsWindowStart = 0;
  _fpsFrameCount = 0;

  function loop(timestamp) {
    if (_isHidden || _fxLevel === 'minimo' || _reducedMotion) {
      _rafId = null;
      return;
    }

    _sampleFps(timestamp);

    for (const fn of _frameListeners) {
      try {
        fn(timestamp);
      } catch (e) {
        console.error('[Effects] Frame listener error:', e);
      }
    }

    if (_frameListeners.size > 0 || _bootProbeActive) {
      _rafId = requestAnimationFrame(loop);
    } else {
      _rafId = null;
    }
  }

  _rafId = requestAnimationFrame(loop);
}

function _stopFrameLoop() {
  if (_rafId) {
    if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(_rafId);
    _rafId = null;
  }
  _fpsWindowStart = 0;
  _fpsFrameCount = 0;
}

function _sampleFps(now) {
  if (!_fpsWindowStart) {
    _fpsWindowStart = now;
    _fpsFrameCount = 0;
    return;
  }

  _fpsFrameCount++;
  const elapsed = now - _fpsWindowStart;

  if (elapsed >= FPS_WINDOW_MS) {
    if (_fpsFrameCount >= FPS_MIN_FRAMES) {
      const windowFps = (_fpsFrameCount * 1000) / elapsed;
      _currentFps = windowFps;
      _avgFps = _avgFps * 0.6 + windowFps * 0.4;

      const inCooldown = _lastDowngradeAt > 0 && (now - _lastDowngradeAt) < DOWNGRADE_COOLDOWN_MS;
      if (inCooldown) {
        _consecutiveLowWindows = 0;
      } else if (windowFps < FPS_THRESHOLD) {
        _consecutiveLowWindows++;
      } else {
        _consecutiveLowWindows = 0;
      }

      // Exige queda sustentada em pelo menos 2 janelas consecutivas fora do cooldown
      if (_consecutiveLowWindows >= 2 && _fxLevel !== 'minimo') {
        _triggerAutoDowngrade(Math.round(windowFps));
        _lastDowngradeAt = now;
        _consecutiveLowWindows = 0;
      }
    }

    _fpsWindowStart = now;
    _fpsFrameCount = 0;
  }
}

function _triggerAutoDowngrade(measuredFps) {
  const prevLevel = _fxLevel;
  const nextLevel = prevLevel === 'completo' ? 'reduzido' : 'minimo';
  if (prevLevel === nextLevel) return;

  _downgradeCount++;
  setFxLevel(nextLevel, true, false);

  document.dispatchEvent?.(new CustomEvent('fx:auto-downgraded', {
    detail: {
      from: prevLevel,
      to: nextLevel,
      fps: measuredFps
    },
    bubbles: true
  }));
}

/**
 * Permite testar/simular janelas de FPS em suítes automatizadas de smoke test.
 */
export function simulateFpsWindowForTest(windowFps, timestampMs) {
  _currentFps = windowFps;
  _avgFps = (_avgFps + windowFps) / 2;
  const inCooldown = _lastDowngradeAt > 0 && (timestampMs - _lastDowngradeAt) < DOWNGRADE_COOLDOWN_MS;
  if (inCooldown) {
    _consecutiveLowWindows = 0;
    return false;
  }
  if (windowFps < FPS_THRESHOLD) {
    _consecutiveLowWindows++;
  } else {
    _consecutiveLowWindows = 0;
  }
  if (_consecutiveLowWindows >= 2 && _fxLevel !== 'minimo' && !_reducedMotion) {
    _triggerAutoDowngrade(Math.round(windowFps));
    _lastDowngradeAt = timestampMs;
    _consecutiveLowWindows = 0;
    return true;
  }
  return false;
}

/**
 * Registra um callback que roda a cada frame (quando visível e fx ≠ mínimo).
 * @param {Function} fn
 * @returns {Function} — função para cancelar o registro
 */
export function addFrameListener(fn) {
  if (_fxLevel === 'minimo' || _reducedMotion) return () => {};

  _frameListeners.add(fn);
  if (!_isHidden && !_rafId) _startFrameLoop();

  return () => {
    _frameListeners.delete(fn);
    if (_frameListeners.size === 0 && !_bootProbeActive) _stopFrameLoop();
  };
}

// ─────────────────────────────────────────────
// CICLO DE VIDA DE EFEITOS POR VIEW (START / STOP / DESTROY)
// ─────────────────────────────────────────────
/**
 * Registra um efeito pertencente à view atual.
 * Ao trocar de rota, `cleanupViewEffects()` destrói todos automaticamente.
 * @param {{ start?: Function, stop?: Function, destroy: Function } | Function} effect
 */
export function registerViewEffect(effect) {
  if (!effect) return () => {};
  const normalized = typeof effect === 'function' ? { destroy: effect } : effect;
  _viewEffects.add(normalized);
  return () => {
    try { normalized.destroy?.(); } catch { /* silencioso */ }
    _viewEffects.delete(normalized);
  };
}

/**
 * Limpa todos os efeitos registrados pela view anterior ao trocar de rota.
 */
export function cleanupViewEffects() {
  for (const eff of _viewEffects) {
    try {
      eff.stop?.();
      eff.destroy?.();
    } catch (e) {
      console.warn('[Effects] Erro ao limpar efeito de view:', e);
    }
  }
  _viewEffects.clear();
}

// ─────────────────────────────────────────────
// CANVAS ADAPTATIVO COM RESIZE OBSERVER E DPR LIMITADO (≤ 2)
// ─────────────────────────────────────────────
/**
 * Configura um elemento `<canvas>` com `devicePixelRatio` adaptativo (≤ 2) e `ResizeObserver`.
 * @param {HTMLCanvasElement} canvas
 * @param {(info: { width: number, height: number, dpr: number, ctx: CanvasRenderingContext2D }) => void} onResize
 * @returns {{ resize: Function, destroy: Function }}
 */
export function setupAdaptiveCanvas(canvas, onResize) {
  const ctx = canvas.getContext?.('2d');
  let destroyed = false;

  function resize() {
    if (destroyed || !canvas.isConnected) return;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width || canvas.clientWidth || 300));
    const height = Math.max(1, Math.floor(rect.height || canvas.clientHeight || 200));
    const dpr = getAdaptiveDPR();

    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    onResize?.({ width, height, dpr, ctx });
  }

  let ro = null;
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => resize());
    if (canvas.parentElement) {
      ro.observe(canvas.parentElement);
    } else {
      ro.observe(canvas);
    }
  } else {
    window.addEventListener('resize', resize, { passive: true });
  }

  // Executa medição inicial
  requestAnimationFrame?.(() => resize()) || resize();

  const handle = {
    resize,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (ro) {
        ro.disconnect();
        ro = null;
      } else {
        window.removeEventListener('resize', resize);
      }
    }
  };

  registerViewEffect(handle);
  return handle;
}

// ─────────────────────────────────────────────
// AURORA REATIVA + GRADIENTE POR HORÁRIO DO DIA
// ─────────────────────────────────────────────
const STATUS_AURORA_MAP = {
  'em andamento': {
    c1: 'rgba(6, 182, 212, 0.16)',
    c2: 'rgba(59, 130, 246, 0.13)',
    c3: 'rgba(139, 92, 246, 0.10)'
  },
  'ideia': {
    c1: 'rgba(168, 85, 247, 0.16)',
    c2: 'rgba(236, 72, 153, 0.11)',
    c3: 'rgba(99, 102, 241, 0.10)'
  },
  'concluído': {
    c1: 'rgba(16, 185, 129, 0.15)',
    c2: 'rgba(6, 182, 212, 0.12)',
    c3: 'rgba(59, 130, 246, 0.08)'
  },
  'pausado': {
    c1: 'rgba(245, 158, 11, 0.14)',
    c2: 'rgba(139, 92, 246, 0.11)',
    c3: 'rgba(59, 130, 246, 0.08)'
  },
  'arquivado': {
    c1: 'rgba(100, 116, 139, 0.12)',
    c2: 'rgba(71, 85, 105, 0.10)',
    c3: 'rgba(59, 130, 246, 0.06)'
  }
};

/**
 * Atualiza as cores da Aurora Reativa conforme o status dominante dos projetos visíveis.
 * Usa variáveis CSS baratas (transição suave via CSS, sem Canvas pesado).
 * @param {string} dominantStatus
 */
export function updateReactiveAurora(dominantStatus = 'em andamento') {
  const root = document.documentElement;
  if (!root?.style) return;

  const palette = STATUS_AURORA_MAP[dominantStatus] || STATUS_AURORA_MAP['em andamento'];
  root.style.setProperty('--aurora-1', palette.c1);
  root.style.setProperty('--aurora-2', palette.c2);
  root.style.setProperty('--aurora-3', palette.c3);
  root.setAttribute?.('data-aurora-status', dominantStatus);
}

function _applyDaytimeTint() {
  const hour = new Date().getHours();
  let period = 'night';
  if (hour >= 6 && hour < 12) period = 'morning';
  else if (hour >= 12 && hour < 18) period = 'afternoon';
  else if (hour >= 18 && hour < 22) period = 'evening';
  document.documentElement?.setAttribute?.('data-daytime', period);
}

// ─────────────────────────────────────────────
// CAMADA AMBIENTE OPCIONAL: AURORA CSS + GRADE 3D + PARTÍCULAS DE FUNDO
// (Desligada automaticamente em `reduzido` e `minimo`)
// ─────────────────────────────────────────────
function _initAmbientBackground() {
  if (typeof document === 'undefined' || !document.body) return;
  if (_ambientLayer) return;

  _ambientLayer = document.createElement('div');
  _ambientLayer.id = 'ambient-fx-layer';
  _ambientLayer.className = 'ambient-fx-layer';
  _ambientLayer.setAttribute('aria-hidden', 'true');

  const auroraEl = document.createElement('div');
  auroraEl.className = 'ambient-aurora';

  const gridEl = document.createElement('div');
  gridEl.className = 'ambient-3d-grid';

  _ambientCanvas = document.createElement('canvas');
  _ambientCanvas.className = 'ambient-particles-canvas';

  _ambientLayer.appendChild(auroraEl);
  _ambientLayer.appendChild(gridEl);
  _ambientLayer.appendChild(_ambientCanvas);
  document.body.appendChild(_ambientLayer);

  _syncAmbientState();
}

function _syncAmbientState() {
  if (!_ambientLayer || !_ambientCanvas) return;

  // Limpa loop anterior de partículas de fundo
  _ambientFrameUnsub?.();
  _ambientFrameUnsub = null;
  _ambientResizeCleanup?.();
  _ambientResizeCleanup = null;
  _ambientMouseCleanup?.();
  _ambientMouseCleanup = null;

  // Partículas e parallax 3D só rodam em nível `completo` e sem `prefers-reduced-motion`
  if (_fxLevel !== 'completo' || _reducedMotion) {
    const ctx = _ambientCanvas.getContext?.('2d');
    if (ctx) ctx.clearRect(0, 0, _ambientCanvas.width || 0, _ambientCanvas.height || 0);
    return;
  }

  const limits = getObjectLimits();
  const count = limits.maxAmbientParticles;
  if (count <= 0) return;

  let width = window.innerWidth || 1200;
  let height = window.innerHeight || 800;
  const ctx = _ambientCanvas.getContext?.('2d');
  if (!ctx) return;

  function resizeAmbient() {
    width = window.innerWidth || 1200;
    height = window.innerHeight || 800;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    _ambientCanvas.width = Math.floor(width * dpr);
    _ambientCanvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resizeAmbient();
  window.addEventListener('resize', resizeAmbient, { passive: true });
  _ambientResizeCleanup = () => window.removeEventListener('resize', resizeAmbient);

  const particles = Array.from({ length: count }, (_, i) => ({
    x: ((i * 137.5) % 100) * (width / 100),
    y: ((i * 73.1) % 100) * (height / 100),
    vx: ((i % 2 === 0 ? 1 : -1) * (0.12 + (i % 5) * 0.04)),
    vy: -0.08 - (i % 4) * 0.03,
    r: 1.2 + (i % 3) * 0.7,
    alpha: 0.14 + (i % 4) * 0.06
  }));

  let pointerX = width * 0.5;
  let pointerY = height * 0.3;

  if (window.matchMedia?.('(hover: hover) and (pointer: fine)')?.matches) {
    const onMove = (e) => {
      pointerX = e.clientX;
      pointerY = e.clientY;
      // Parallax sutil para a grade 3D
      const offsetX = ((e.clientX / width) - 0.5) * 14;
      const offsetY = ((e.clientY / height) - 0.5) * 10;
      _ambientLayer.style.setProperty('--parallax-x', `${offsetX.toFixed(1)}px`);
      _ambientLayer.style.setProperty('--parallax-y', `${offsetY.toFixed(1)}px`);
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    _ambientMouseCleanup = () => window.removeEventListener('mousemove', onMove);
  }

  _ambientFrameUnsub = addFrameListener(() => {
    ctx.clearRect(0, 0, width, height);
    const accent = getComputedStyle(document.documentElement)
      .getPropertyValue('--accent-primary').trim() || '#8b5cf6';

    ctx.fillStyle = accent;
    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;

      // Leve repulsão suave do ponteiro
      const dx = p.x - pointerX;
      const dy = p.y - pointerY;
      const distSq = dx * dx + dy * dy;
      if (distSq > 0 && distSq < 14400) {
        const dist = Math.sqrt(distSq);
        p.x += (dx / dist) * 0.35;
        p.y += (dy / dist) * 0.35;
      }

      if (p.x < 0) p.x = width;
      if (p.x > width) p.x = 0;
      if (p.y < 0) p.y = height;
      if (p.y > height) p.y = 0;

      ctx.globalAlpha = p.alpha;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  });
}

// ─────────────────────────────────────────────
// EFEITOS INTERATIVOS DE CARDS, BOTÕES E DOCK (DESKTOP)
// ─────────────────────────────────────────────

/**
 * Spotlight + Tilt 3D suave nos cards (apenas desktop com ponteiro fino).
 */
export function enableSpotlightOnCards(container) {
  if (_fxLevel === 'minimo' || _reducedMotion || !container) return () => {};
  if (!window.matchMedia?.('(hover: hover) and (pointer: fine)')?.matches) return () => {};

  function handleMouseMove(e) {
    const card = e.target.closest?.('.card-spotlight');
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / Math.max(1, rect.width);
    const relY = (e.clientY - rect.top) / Math.max(1, rect.height);
    card.style.setProperty('--mouse-x', `${(relX * 100).toFixed(1)}%`);
    card.style.setProperty('--mouse-y', `${(relY * 100).toFixed(1)}%`);

    // Tilt 3D apenas em nível completo e se o card não estiver virado (flip)
    if (_fxLevel === 'completo' && card.classList.contains('project-card') && !card.classList.contains('is-flipped')) {
      const tiltX = ((0.5 - relY) * 5).toFixed(2);
      const tiltY = ((relX - 0.5) * 6).toFixed(2);
      card.style.setProperty('--tilt-x', `${tiltX}deg`);
      card.style.setProperty('--tilt-y', `${tiltY}deg`);
    }
  }

  function handleMouseLeave(e) {
    const card = e.target.closest?.('.project-card');
    if (!card) return;
    card.style.setProperty('--tilt-x', '0deg');
    card.style.setProperty('--tilt-y', '0deg');
  }

  container.addEventListener('mousemove', handleMouseMove, { passive: true });
  container.addEventListener('mouseout', handleMouseLeave, { passive: true });

  const cleanup = () => {
    container.removeEventListener('mousemove', handleMouseMove);
    container.removeEventListener('mouseout', handleMouseLeave);
  };
  registerViewEffect(cleanup);
  return cleanup;
}

/**
 * Botões magnéticos sutis no desktop (`(hover: hover) and (pointer: fine)`).
 */
export function enableMagneticButtons(root = document) {
  if (_fxLevel !== 'completo' || _reducedMotion || !root) return () => {};
  if (!window.matchMedia?.('(hover: hover) and (pointer: fine)')?.matches) return () => {};

  const buttons = root.querySelectorAll?.('.btn-magnetic, .inbox-fab') || [];
  const cleanups = [];

  buttons.forEach(btn => {
    const onMove = (e) => {
      if (_fxLevel !== 'completo' || _reducedMotion) return;
      const rect = btn.getBoundingClientRect();
      const dx = (e.clientX - (rect.left + rect.width / 2)) * 0.18;
      const dy = (e.clientY - (rect.top + rect.height / 2)) * 0.18;
      btn.style.setProperty('--mag-x', `${dx.toFixed(1)}px`);
      btn.style.setProperty('--mag-y', `${dy.toFixed(1)}px`);
    };
    const onLeave = () => {
      btn.style.setProperty('--mag-x', '0px');
      btn.style.setProperty('--mag-y', '0px');
    };
    btn.addEventListener('mousemove', onMove, { passive: true });
    btn.addEventListener('mouseleave', onLeave, { passive: true });
    cleanups.push(() => {
      btn.removeEventListener('mousemove', onMove);
      btn.removeEventListener('mouseleave', onLeave);
    });
  });

  return () => cleanups.forEach(fn => fn());
}

/**
 * Dock animada com efeito de crescimento em onda (desktop).
 */
export function enableDockWave(navContainer) {
  if (!navContainer) return () => {};
  if (!window.matchMedia?.('(hover: hover) and (pointer: fine)')?.matches) return () => {};

  const items = Array.from(navContainer.querySelectorAll('.nav-link'));
  if (items.length === 0) return () => {};

  function onMouseMove(e) {
    if (_fxLevel === 'minimo' || _reducedMotion) return;
    for (const item of items) {
      const rect = item.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const dist = Math.abs(e.clientX - centerX);
      const factor = Math.max(0, 1 - dist / 130);
      const scale = 1 + factor * 0.11;
      const lift = -factor * 3;
      item.style.transform = `translateY(${lift.toFixed(1)}px) scale(${scale.toFixed(3)})`;
    }
  }

  function onMouseLeave() {
    for (const item of items) {
      item.style.transform = '';
    }
  }

  navContainer.addEventListener('mousemove', onMouseMove, { passive: true });
  navContainer.addEventListener('mouseleave', onMouseLeave, { passive: true });

  return () => {
    navContainer.removeEventListener('mousemove', onMouseMove);
    navContainer.removeEventListener('mouseleave', onMouseLeave);
  };
}

// ─────────────────────────────────────────────
// ANIMAÇÃO DE STAGGER DE ENTRADA E CONTADOR
// ─────────────────────────────────────────────
export function animateStaggerIn(elements, baseDelay = 0, step = 45) {
  if (_fxLevel === 'minimo' || _reducedMotion) {
    for (const el of elements) {
      el.style.opacity = '1';
      el.style.transform = 'none';
    }
    return;
  }

  elements.forEach((el, i) => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(14px)';
    el.style.transition = `opacity 280ms ease, transform 280ms cubic-bezier(0.16,1,0.3,1)`;

    setTimeout(() => {
      el.style.opacity = '1';
      el.style.transform = 'translateY(0)';
    }, baseDelay + Math.min(i, 12) * step);
  });
}

export function animateCounter(element, from, to, duration = 700) {
  if (_fxLevel === 'minimo' || _reducedMotion) {
    element.textContent = String(to);
    return;
  }

  const start = performance.now();
  const diff = to - from;

  function tick(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    element.textContent = String(Math.round(from + diff * eased));

    if (progress < 1) {
      requestAnimationFrame(tick);
    }
  }

  requestAnimationFrame(tick);
}

// ─────────────────────────────────────────────
// VIEW TRANSITIONS (com fallback seguro)
// ─────────────────────────────────────────────
export async function transitionView(updateFn) {
  let executed = false;
  const runOnce = async () => {
    if (executed) return;
    executed = true;
    await updateFn();
  };

  if (_fxLevel === 'minimo' || _reducedMotion || !document.startViewTransition) {
    await runOnce();
    return;
  }

  try {
    const transition = document.startViewTransition(runOnce);
    await transition.ready;
  } catch {
    await runOnce();
  }
}

// ─────────────────────────────────────────────
// PARTÍCULAS DE CONCLUSÃO DE TAREFA (Canvas leve)
// ─────────────────────────────────────────────
export function burstParticles(originElement) {
  if (_fxLevel === 'minimo' || _reducedMotion || !originElement) return;

  const count = getObjectLimits().maxBurstParticles;
  if (count <= 0) return;

  const rect = originElement.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;

  const canvas = document.createElement('canvas');
  canvas.style.cssText = `
    position: fixed;
    top: 0; left: 0;
    width: 100%; height: 100%;
    pointer-events: none;
    z-index: 9999;
  `;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  const accentColor = getComputedStyle(document.documentElement)
    .getPropertyValue('--accent-primary').trim() || '#8b5cf6';

  const particles = Array.from({ length: count }, () => {
    const angle = Math.random() * Math.PI * 2;
    const speed = 2 + Math.random() * 4;
    return {
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 2,
      alpha: 1,
      size: 3 + Math.random() * 4,
      color: Math.random() > 0.5 ? accentColor : '#10b981'
    };
  });

  let raf;
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let alive = false;

    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.15;
      p.alpha -= 0.028;

      if (p.alpha <= 0) continue;
      alive = true;

      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1;

    if (alive) {
      raf = requestAnimationFrame(draw);
    } else {
      canvas.remove();
    }
  }

  raf = requestAnimationFrame(draw);

  setTimeout(() => {
    cancelAnimationFrame(raf);
    canvas.remove();
  }, 2800);
}

// ─────────────────────────────────────────────
// CLEANUP GLOBAL
// ─────────────────────────────────────────────
export function destroyEffects() {
  cleanupViewEffects();
  _stopFrameLoop();
  _frameListeners.clear();
  _ambientFrameUnsub?.();
  _ambientResizeCleanup?.();
  _ambientMouseCleanup?.();
  _ambientLayer?.remove?.();
  _ambientLayer = null;
  _ambientCanvas = null;
  clearTimeout(_bootProbeTimer);
  document.removeEventListener('visibilitychange', _handleVisibilityChange);
  window.removeEventListener('resize', _handleViewportProfileChange);
}
