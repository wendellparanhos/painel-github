/**
 * Serviço de Feedback Sensorial e Celebrações — Fase 4
 *
 * Responsabilidades:
 *   1. Web Audio API (efeitos sonoros simples e som ambiente procedural):
 *      - Desligado por padrão (`config.soundEnabled === false`, `config.ambientSound === 'off'`).
 *      - `AudioContext` NUNCA é instanciado no boot; somente após gesto explícito do usuário.
 *   2. Haptics (`navigator.vibrate`):
 *      - Opt-in estrito (`config.hapticsEnabled === true`).
 *      - Degrada silenciosamente quando o navegador/dispositivo não suporta.
 *   3. Celebração Épica ao concluir projeto + Modal de Level Up:
 *      - Fogos em tela cheia (Canvas) respeitando `getFxLevel()` e `prefers-reduced-motion`.
 */

import { getState, dispatch } from '../store/store.js';
import { getFxLevel, isReducedMotion, setupAdaptiveCanvas } from '../fx/effects.js';
import { openModal } from '../components/modal.js';
import { showToast } from '../components/toast.js';

let _audioCtx = null;
let _ambientNodes = null;
let _currentAmbientType = 'off';
let _userGestureConfirmed = false;

// Registra primeiro gesto do usuário para liberar criação preguiçosa do AudioContext quando solicitado
if (typeof window !== 'undefined') {
  const unlock = () => { _userGestureConfirmed = true; };
  window.addEventListener('pointerdown', unlock, { once: true, passive: true });
  window.addEventListener('keydown', unlock, { once: true, passive: true });
}

function _getOrCreateAudioContext() {
  if (!_userGestureConfirmed) return null;
  if (typeof window === 'undefined') return null;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;

  if (!_audioCtx) {
    try {
      _audioCtx = new AudioCtx();
    } catch {
      return null;
    }
  }
  if (_audioCtx.state === 'suspended') {
    _audioCtx.resume().catch(() => {});
  }
  return _audioCtx;
}

// ─────────────────────────────────────────────
// EFEITOS SONOROS VIA WEB AUDIO API (OFF POR PADRÃO)
// ─────────────────────────────────────────────

export function playToneSequence(notes = [], forcePreview = false) {
  const state = getState();
  if (!forcePreview && !state?.config?.soundEnabled) return false;

  _userGestureConfirmed = true;
  const ctx = _getOrCreateAudioContext();
  if (!ctx) return false;

  const now = ctx.currentTime;
  for (const note of notes) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = note.type || 'sine';
    osc.frequency.setValueAtTime(note.freq || 440, now + (note.delay || 0));

    const vol = Math.min(0.25, note.volume ?? 0.08);
    gain.gain.setValueAtTime(0.0001, now + (note.delay || 0));
    gain.gain.exponentialRampToValueAtTime(vol, now + (note.delay || 0) + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + (note.delay || 0) + (note.duration || 0.18));

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now + (note.delay || 0));
    osc.stop(now + (note.delay || 0) + (note.duration || 0.18) + 0.02);
  }
  return true;
}

export function playTaskDoneSound(forcePreview = false) {
  return playToneSequence([
    { freq: 523.25, delay: 0, duration: 0.11, type: 'triangle', volume: 0.07 },
    { freq: 659.25, delay: 0.09, duration: 0.16, type: 'triangle', volume: 0.09 }
  ], forcePreview);
}

export function playTimerEndSound(forcePreview = false) {
  return playToneSequence([
    { freq: 587.33, delay: 0, duration: 0.16, type: 'sine', volume: 0.1 },
    { freq: 783.99, delay: 0.15, duration: 0.18, type: 'sine', volume: 0.1 },
    { freq: 1046.5, delay: 0.32, duration: 0.32, type: 'sine', volume: 0.12 }
  ], forcePreview);
}

export function playLevelUpSound(forcePreview = false) {
  return playToneSequence([
    { freq: 440, delay: 0, duration: 0.12, type: 'triangle', volume: 0.09 },
    { freq: 554.37, delay: 0.1, duration: 0.12, type: 'triangle', volume: 0.09 },
    { freq: 659.25, delay: 0.2, duration: 0.14, type: 'triangle', volume: 0.1 },
    { freq: 880, delay: 0.32, duration: 0.35, type: 'triangle', volume: 0.12 }
  ], forcePreview);
}

export function playEpicFanfare(forcePreview = false) {
  return playToneSequence([
    { freq: 523.25, delay: 0, duration: 0.14, type: 'triangle', volume: 0.1 },
    { freq: 659.25, delay: 0.12, duration: 0.14, type: 'triangle', volume: 0.1 },
    { freq: 783.99, delay: 0.24, duration: 0.16, type: 'triangle', volume: 0.11 },
    { freq: 1046.5, delay: 0.38, duration: 0.48, type: 'triangle', volume: 0.13 }
  ], forcePreview);
}

// ─────────────────────────────────────────────
// SOM AMBIENTE PROCEDURAL (CHUVA SUAVE / RUÍDO MARROM / ROSA)
// ─────────────────────────────────────────────

export function setAmbientSound(type = 'off') {
  stopAmbientSound();
  _currentAmbientType = type;

  if (!type || type === 'off') return false;

  _userGestureConfirmed = true;
  const ctx = _getOrCreateAudioContext();
  if (!ctx) return false;

  try {
    const bufferSize = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = buffer.getChannelData(0);

    let lastOut = 0.0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      if (type === 'brown') {
        output[i] = (lastOut + (0.02 * white)) / 1.02;
        lastOut = output[i];
        output[i] *= 3.2;
      } else {
        // 'rain' ou 'pink'
        output[i] = (lastOut + (0.08 * white)) / 1.08;
        lastOut = output[i];
        output[i] *= 1.8;
      }
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(type === 'brown' ? 420 : type === 'rain' ? 950 : 1300, ctx.currentTime);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.035, ctx.currentTime);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(0);

    _ambientNodes = { noise, filter, gain };
    return true;
  } catch {
    return false;
  }
}

export function stopAmbientSound() {
  if (_ambientNodes) {
    try {
      _ambientNodes.noise.stop();
      _ambientNodes.noise.disconnect();
      _ambientNodes.gain.disconnect();
    } catch {
      // Silencioso
    }
    _ambientNodes = null;
  }
  _currentAmbientType = 'off';
}

export function getActiveAmbientSound() {
  return _ambientNodes ? _currentAmbientType : 'off';
}

// ─────────────────────────────────────────────
// HAPTICS OPT-IN (navigator.vibrate)
// ─────────────────────────────────────────────

export function triggerHaptic(pattern = [35], forcePreview = false) {
  const state = getState();
  if (!forcePreview && !state?.config?.hapticsEnabled) return false;
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return false;

  try {
    return navigator.vibrate(pattern);
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────
// MODAL DE LEVEL UP E CELEBRAÇÃO ÉPICA DE PROJETO CONCLUÍDO
// ─────────────────────────────────────────────

export function showLevelUpModal(levelInfo) {
  const state = getState();
  if (state?.config?.gamificationEnabled === false) return;

  playLevelUpSound();
  triggerHaptic([40, 60, 80]);

  const body = document.createElement('div');
  body.className = 'level-up-modal-body';
  body.innerHTML = `
    <div class="level-up-badge-circle" aria-hidden="true">
      <span class="level-up-number">${levelInfo.level}</span>
    </div>
    <h4 class="level-up-rank-title">${levelInfo.title}</h4>
    <p class="level-up-desc">
      Você alcançou o <strong>Nível ${levelInfo.level}</strong> com <strong class="tabular">${levelInfo.xp} XP</strong> acumulados em entregas reais!
    </p>
  `;

  openModal({
    title: '🎉 Subiu de Nível! Novo Patamar Alcançado',
    body,
    hideCancel: true,
    confirmLabel: 'Continuar Construindo',
    onConfirm: () => {}
  });
}

export function triggerEpicProjectCelebration({ projectName, firstTime = true }) {
  const state = getState();
  if (state?.config?.gamificationEnabled === false) return;

  playEpicFanfare();
  triggerHaptic([60, 50, 100, 50, 140]);

  const fxLevel = getFxLevel();
  const reduced = isReducedMotion();

  // Lança fogos em Canvas tela cheia se o nível de efeitos permitir movimento
  if (fxLevel !== 'minimo' && !reduced && typeof document !== 'undefined') {
    _launchFullscreenFireworks(fxLevel === 'completo' ? 95 : 42);
  }

  const overlay = document.createElement('div');
  overlay.className = 'epic-celebration-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', `Projeto ${projectName} concluído`);

  overlay.innerHTML = `
    <div class="epic-celebration-card">
      <div class="epic-trophy-icon" aria-hidden="true">🏆</div>
      <div class="section-eyebrow" style="justify-content:center;">Marco Épico Alcançado</div>
      <h2 class="epic-celebration-title">Projeto Concluído!</h2>
      <p class="epic-celebration-project">${_escape(projectName)}</p>
      <p class="epic-celebration-msg">
        Mais um projeto levado até a linha de chegada. Cada entrega concluída fortalece seu portfólio e sua consistência!
      </p>
      ${firstTime ? `<div class="epic-xp-pill">+100 XP Concedidos · Conquista Registrada</div>` : `<div class="epic-xp-pill" style="opacity:0.8;">Status atualizado para Concluído</div>`}
      <div style="margin-top:20px;">
        <button type="button" class="btn btn-primary epic-close-btn">Celebrar e Continuar 🚀</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  const closeBtn = overlay.querySelector('.epic-close-btn');
  closeBtn?.focus();

  const close = () => {
    overlay.remove();
  };
  closeBtn?.addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  const onKey = (e) => {
    if (e.key === 'Escape') {
      close();
      document.removeEventListener('keydown', onKey);
    }
  };
  document.addEventListener('keydown', onKey);
}

function _launchFullscreenFireworks(particleCount = 80) {
  const canvas = document.createElement('canvas');
  canvas.className = 'epic-fireworks-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.appendChild(canvas);

  const w = window.innerWidth || 1024;
  const h = window.innerHeight || 768;
  const ctx = canvas.getContext('2d');
  const canvasHandle = setupAdaptiveCanvas(canvas);
  if (!ctx) {
    canvas.remove();
    return () => {};
  }

  const colors = ['#a855f7', '#06b6d4', '#10b981', '#f59e0b', '#f43f5e', '#3b82f6'];
  const bursts = [
    { cx: w * 0.25, cy: h * 0.35 },
    { cx: w * 0.75, cy: h * 0.32 },
    { cx: w * 0.5, cy: h * 0.25 }
  ];

  const particles = [];
  for (const b of bursts) {
    const count = Math.round(particleCount / bursts.length);
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.25;
      const speed = 2.2 + Math.random() * 5.5;
      particles.push({
        x: b.cx,
        y: b.cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1.2,
        alpha: 1,
        decay: 0.012 + Math.random() * 0.012,
        radius: 2 + Math.random() * 2.5,
        color: colors[i % colors.length]
      });
    }
  }

  let rafId = null;
  const start = performance.now();

  function frame(now) {
    if (now - start > 4200) {
      canvas.remove();
      return;
    }

    ctx.clearRect(0, 0, w, h);
    let alive = 0;

    for (const p of particles) {
      if (p.alpha <= 0.02) continue;
      alive++;
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.06; // gravidade leve
      p.vx *= 0.985;
      p.alpha -= p.decay;

      ctx.save();
      ctx.globalAlpha = Math.max(0, p.alpha);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    if (alive > 0) {
      rafId = requestAnimationFrame(frame);
    } else {
      canvas.remove();
    }
  }

  rafId = requestAnimationFrame(frame);
  return () => {
    if (rafId) cancelAnimationFrame(rafId);
    canvas.remove();
  };
}

// ─────────────────────────────────────────────
// LISTENERS GLOBAIS DE EVENTOS DE GAMIFICAÇÃO
// ─────────────────────────────────────────────

let _listenersBound = false;

export function initFeedbackListeners() {
  if (_listenersBound || typeof document === 'undefined') return;
  _listenersBound = true;

  document.addEventListener('gamification:xp-gained', (e) => {
    const state = getState();
    if (state?.config?.gamificationEnabled === false) return;
    const { xpAdded, reason } = e.detail || {};
    playTaskDoneSound();
    triggerHaptic([25]);
    showToast(`✨ +${xpAdded} XP · ${reason}`, { type: 'success', duration: 2800 });
  });

  document.addEventListener('gamification:level-up', (e) => {
    const state = getState();
    if (state?.config?.gamificationEnabled === false) return;
    if (e.detail?.levelInfo) {
      setTimeout(() => showLevelUpModal(e.detail.levelInfo), 350);
    }
  });

  document.addEventListener('gamification:achievement-unlocked', (e) => {
    const state = getState();
    if (state?.config?.gamificationEnabled === false) return;
    const list = e.detail?.achievements || [];
    for (const badge of list) {
      showToast(`🏅 Conquista Desbloqueada: ${badge.icon} ${badge.title}!`, {
        type: 'info',
        duration: 5000
      });
    }
  });

  document.addEventListener('project:completed-celebration', (e) => {
    const state = getState();
    if (state?.config?.gamificationEnabled === false) return;
    if (e.detail) {
      triggerEpicProjectCelebration(e.detail);
    }
  });
}

function _escape(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
