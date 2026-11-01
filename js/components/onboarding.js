/**
 * Guia de Boas-Vindas / Onboarding de 3 Passos — Fase 6.
 *
 * Apresenta a filosofia do painel para novos usuários:
 *   Passo 1: Centro de Comando dos Repositórios & Conexão GitHub
 *   Passo 2: Gestão Visual (Kanban), Atalhos e Modo Foco (Pomodoro)
 *   Passo 3: Privacidade 100% Local, PWA Offline e Backup
 */

import { getState, dispatch } from '../store/store.js';
import { openModal, closeModal } from './modal.js';

export function startOnboardingTour(force = false) {
  const state = getState();
  if (state?.config?.onboardingCompleted && !force) return;

  let currentStep = 1;
  const totalSteps = 3;

  const body = document.createElement('div');
  body.style.cssText = 'display:flex;flex-direction:column;gap:14px;min-height:280px;';

  function renderStep() {
    body.innerHTML = '';

    // Indicador de progresso (pontos)
    const progressRow = document.createElement('div');
    progressRow.style.cssText = 'display:flex;justify-content:center;gap:8px;margin-bottom:8px;';
    for (let i = 1; i <= totalSteps; i++) {
      const dot = document.createElement('div');
      dot.style.cssText = `width:${i === currentStep ? '24px' : '8px'};height:8px;border-radius:4px;background:${i === currentStep ? 'var(--accent-primary)' : 'var(--border-subtle)'};transition:all 0.25s ease;`;
      progressRow.appendChild(dot);
    }
    body.appendChild(progressRow);

    const stepContent = document.createElement('div');
    stepContent.style.cssText = 'text-align:center;padding:0 8px;';

    if (currentStep === 1) {
      stepContent.innerHTML = `
        <div style="font-size:3rem;margin-bottom:8px;" aria-hidden="true">🚀</div>
        <h3 style="font-size:var(--text-lg);font-weight:800;color:var(--text-main);margin-bottom:6px;">
          Seu Centro de Comando no GitHub
        </h3>
        <p style="font-size:var(--text-sm);color:var(--text-secondary);line-height:1.6;margin-bottom:12px;">
          Todos os seus repositórios sincronizados em uma interface rápida, com status personalizados
          (<em>ideia</em>, <em>em andamento</em>, <em>concluído</em>), tarefas com prazos e notas em Markdown.
        </p>
        <div style="background:var(--bg-elevated);padding:10px 14px;border-radius:var(--radius-sm);border:1px solid var(--border-subtle);display:inline-block;font-size:var(--text-xs);color:var(--text-muted);">
          👤 Conectado como <strong>${state?.config?.githubUsername || 'wendellparanhos'}</strong> (dados públicos sincronizados via cache local).
        </div>
      `;
    } else if (currentStep === 2) {
      stepContent.innerHTML = `
        <div style="font-size:3rem;margin-bottom:8px;" aria-hidden="true">⏱️</div>
        <h3 style="font-size:var(--text-lg);font-weight:800;color:var(--text-main);margin-bottom:6px;">
          Produtividade, Kanban & Modo Foco
        </h3>
        <p style="font-size:var(--text-sm);color:var(--text-secondary);line-height:1.6;margin-bottom:12px;">
          Gerencie entregas arrastando cartões no <strong>Quadro Kanban</strong> (<code>#/kanban</code>) e mantenha
          a atenção com o <strong>Modo Foco Pomodoro</strong> (<code>#/focus</code>), completo com Modo Cinema e áudio ambiente procedural.
        </p>
        <div style="background:rgba(139,92,246,0.08);padding:10px 14px;border-radius:var(--radius-sm);border:1px solid rgba(139,92,246,0.25);font-size:var(--text-xs);color:var(--text-main);line-height:1.5;">
          💡 <strong>Dica Ninja:</strong> Pressione <kbd style="background:var(--bg-card);padding:2px 6px;border-radius:4px;border:1px solid var(--border);">⌘K</kbd> ou <kbd style="background:var(--bg-card);padding:2px 6px;border-radius:4px;border:1px solid var(--border);">Ctrl+K</kbd> a qualquer momento para abrir a Paleta de Comandos.
        </div>
      `;
    } else {
      stepContent.innerHTML = `
        <div style="font-size:3rem;margin-bottom:8px;" aria-hidden="true">🛡️</div>
        <h3 style="font-size:var(--text-lg);font-weight:800;color:var(--text-main);margin-bottom:6px;">
          Privacidade Total & Modo Offline
        </h3>
        <p style="font-size:var(--text-sm);color:var(--text-secondary);line-height:1.6;margin-bottom:12px;">
          Seus dados pessoais, tarefas e notas vivem <strong>exclusivamente no seu aparelho</strong>.
          O aplicativo é um <strong>PWA instalável</strong> que continua funcionando mesmo sem internet.
        </p>
        <div style="background:rgba(16,185,129,0.08);padding:10px 14px;border-radius:var(--radius-sm);border:1px solid rgba(16,185,129,0.25);font-size:var(--text-xs);color:#34d399;line-height:1.5;">
          📦 Você pode exportar backup em JSON a qualquer momento nas Configurações ou sincronizar via Gist privado opcional.
        </div>
      `;
    }

    body.appendChild(stepContent);

    // Barra de navegação dos passos
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-top:auto;padding-top:10px;border-top:1px solid var(--border-subtle);';

    const prevBtn = document.createElement('button');
    prevBtn.type = 'button';
    prevBtn.className = 'btn btn-ghost btn-sm';
    prevBtn.textContent = '◀ Voltar';
    prevBtn.disabled = currentStep === 1;
    prevBtn.addEventListener('click', () => {
      if (currentStep > 1) {
        currentStep--;
        renderStep();
      }
    });
    btnRow.appendChild(prevBtn);

    const nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = 'btn btn-primary btn-sm';
    nextBtn.textContent = currentStep === totalSteps ? 'Concluir Tour ✨' : 'Próximo ▶';
    nextBtn.addEventListener('click', () => {
      if (currentStep < totalSteps) {
        currentStep++;
        renderStep();
      } else {
        dispatch({ type: 'CONFIG_UPDATE', payload: { onboardingCompleted: true } });
        closeModal();
      }
    });
    btnRow.appendChild(nextBtn);

    body.appendChild(btnRow);
  }

  renderStep();

  openModal({
    title: 'Tour de Apresentação · Painel GitHub',
    body,
    confirmLabel: 'Pular',
    confirmVariant: 'secondary',
    hideCancel: true,
    onConfirm: () => {
      dispatch({ type: 'CONFIG_UPDATE', payload: { onboardingCompleted: true } });
      closeModal();
    }
  });
}
