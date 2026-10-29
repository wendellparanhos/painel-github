/**
 * Motor de efeitos adaptativos.
 * Gerencia o nível de efeitos globalmente e suspende loops quando a aba fica oculta.
 */

// ─────────────────────────────────────────────
// NÍVEL ATUAL (computado na inicialização)
// ─────────────────────────────────────────────
let _fxLevel = 'completo'; // 'completo' | 'reduzido' | 'minimo'
let _reducedMotion = false;
let _isHidden = false;
const _frameListeners = new Set();
let _rafId = null;

// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────
export function initEffects(userPreference = 'completo') {
  // Verifica prefers-reduced-motion do sistema
  _reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Detecta hardware fraco de forma heurística
  const isWeakDevice = detectWeakDevice();

  // Determina o nível efetivo
  if (_reducedMotion) {
    _fxLevel = 'minimo';
  } else if (isWeakDevice) {
    _fxLevel = 'reduzido';
  } else {
    _fxLevel = userPreference || 'completo';
  }

  applyFxLevel(_fxLevel);

  // Escuta mudanças no sistema em tempo real
  window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (e) => {
    if (e.matches && _fxLevel !== 'minimo') {
      setFxLevel('minimo');
    }
  });

  // Suspende loops quando a aba fica oculta
  document.addEventListener('visibilitychange', _handleVisibilityChange);
}

function _handleVisibilityChange() {
  _isHidden = document.visibilityState === 'hidden';
  if (_isHidden) {
    _stopFrameLoop();
  } else if (_frameListeners.size > 0) {
    _startFrameLoop();
  }
}

// ─────────────────────────────────────────────
// DETECÇÃO DE HARDWARE FRACO
// ─────────────────────────────────────────────
function detectWeakDevice() {
  // Considera "fraco" se tiver ≤ 2 núcleos ou ≤ 2 GB de RAM
  const cores = navigator.hardwareConcurrency || 2;
  const memory = navigator.deviceMemory || 4; // GB (API disponível em alguns browsers)

  if (cores <= 2 || memory <= 2) return true;

  // Também considera dispositivos com tela pequena em alta DPR (possivelmente mobile de baixo custo)
  if (window.devicePixelRatio >= 3 && window.screen.width <= 400) return true;

  return false;
}

// ─────────────────────────────────────────────
// APLICAÇÃO DO NÍVEL
// ─────────────────────────────────────────────
export function applyFxLevel(level) {
  const root = document.documentElement;
  root.setAttribute('data-fx', level === 'minimo' ? 'minimo' : level === 'reduzido' ? 'reduzido' : 'completo');
}

export function setFxLevel(level, persist = false) {
  _fxLevel = level;
  applyFxLevel(level);
  if (persist) {
    // Dispatch para o store (importação circular evitada — usa evento)
    document.dispatchEvent(new CustomEvent('fx:level-changed', { detail: { level }, bubbles: true }));
  }
}

export function getFxLevel() {
  return _fxLevel;
}

export function isReducedMotion() {
  return _reducedMotion;
}

// ─────────────────────────────────────────────
// LOOP DE ANIMAÇÃO GLOBAL (rAF compartilhado)
// ─────────────────────────────────────────────
function _startFrameLoop() {
  if (_rafId) return;

  function loop(timestamp) {
    if (_isHidden) {
      _rafId = null;
      return;
    }
    for (const fn of _frameListeners) {
      try { fn(timestamp); } catch (e) { console.error('[Effects] Frame listener error:', e); }
    }
    _rafId = requestAnimationFrame(loop);
  }

  _rafId = requestAnimationFrame(loop);
}

function _stopFrameLoop() {
  if (_rafId) {
    cancelAnimationFrame(_rafId);
    _rafId = null;
  }
}

/**
 * Registra um callback que roda a cada frame (quando visível e fx ≠ mínimo).
 * @param {Function} fn
 * @returns {Function} — chame para cancelar o registro
 */
export function addFrameListener(fn) {
  if (_fxLevel === 'minimo' || _reducedMotion) return () => {};

  _frameListeners.add(fn);
  if (!_isHidden && !_rafId) _startFrameLoop();

  return () => {
    _frameListeners.delete(fn);
    if (_frameListeners.size === 0) _stopFrameLoop();
  };
}

// ─────────────────────────────────────────────
// EFEITO SPOTLIGHT NOS CARDS
// ─────────────────────────────────────────────
export function enableSpotlightOnCards(container) {
  if (_fxLevel === 'minimo' || _reducedMotion) return () => {};

  // Apenas dispositivos com ponteiro preciso (mouse)
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return () => {};

  function handleMouseMove(e) {
    const card = e.target.closest('.card-spotlight');
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    card.style.setProperty('--mouse-x', `${x}%`);
    card.style.setProperty('--mouse-y', `${y}%`);
  }

  container.addEventListener('mousemove', handleMouseMove, { passive: true });

  return () => {
    container.removeEventListener('mousemove', handleMouseMove);
  };
}

// ─────────────────────────────────────────────
// ANIMAÇÃO DE STAGGER DE ENTRADA
// ─────────────────────────────────────────────
export function animateStaggerIn(elements, baseDelay = 0, step = 60) {
  if (_fxLevel === 'minimo' || _reducedMotion) {
    // Sem animação: apenas torna visível
    for (const el of elements) {
      el.style.opacity = '1';
      el.style.transform = 'none';
    }
    return;
  }

  elements.forEach((el, i) => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(18px)';
    el.style.transition = `opacity 320ms ease, transform 320ms cubic-bezier(0.16,1,0.3,1)`;

    setTimeout(() => {
      el.style.opacity = '1';
      el.style.transform = 'translateY(0)';
    }, baseDelay + i * step);
  });
}

// ─────────────────────────────────────────────
// CONTADOR ANIMADO (numbers rolling up)
// ─────────────────────────────────────────────
export function animateCounter(element, from, to, duration = 800) {
  if (_fxLevel === 'minimo' || _reducedMotion) {
    element.textContent = String(to);
    return;
  }

  const start = performance.now();
  const diff = to - from;

  function tick(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    // Ease out cubic
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
  if (_fxLevel === 'minimo' || _reducedMotion || !document.startViewTransition) {
    updateFn();
    return;
  }

  try {
    const transition = document.startViewTransition(updateFn);
    await transition.ready;
  } catch {
    // Fallback silencioso: atualiza sem transição
    updateFn();
  }
}

// ─────────────────────────────────────────────
// PARTÍCULAS DE CONCLUSÃO DE TAREFA (Canvas leve)
// ─────────────────────────────────────────────
const MAX_PARTICLES = 40;

export function burstParticles(originElement) {
  if (_fxLevel === 'minimo' || _reducedMotion) return;

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

  // Cores com base no acento atual
  const accentColor = getComputedStyle(document.documentElement)
    .getPropertyValue('--accent-primary').trim() || '#8b5cf6';

  const count = _fxLevel === 'reduzido' ? 18 : Math.min(MAX_PARTICLES, 32);
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
      p.vy += 0.15; // gravidade
      p.alpha -= 0.025;

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
      // Autodestrói o canvas
      canvas.remove();
    }
  }

  raf = requestAnimationFrame(draw);

  // Segurança: garante remoção após 3 segundos
  setTimeout(() => {
    cancelAnimationFrame(raf);
    canvas.remove();
  }, 3000);
}

// ─────────────────────────────────────────────
// CLEANUP GLOBAL
// ─────────────────────────────────────────────
export function destroyEffects() {
  _stopFrameLoop();
  _frameListeners.clear();
  document.removeEventListener('visibilitychange', _handleVisibilityChange);
}
