/**
 * Modais de Compartilhamento, Cartão Canvas e Portfólio Estático — Fase 6.
 */

import { openModal, closeModal } from './modal.js';
import { showToast } from './toast.js';
import {
  renderWeeklySummaryCardToCanvas,
  renderProjectHighlightCardToCanvas,
  downloadCanvasAsPng,
  copyCanvasImageToClipboard
} from '../services/share-card.js';
import {
  filterProjectsForPortfolio,
  auditPortfolioPayloadForSecrets,
  generateStandalonePortfolioHtml,
  downloadPortfolioHtml
} from '../services/portfolio.js';

/**
 * Abre modal com pré-visualização de Cartão em Canvas 2D e opções de download/cópia.
 */
export function openShareCardModal({ type = 'weekly', weeklyData = null, project = null, state = null } = {}) {
  const isWeekly = type === 'weekly';
  const title = isWeekly ? '🖼️ Cartão da Semana (Canvas 2D)' : `🖼️ Cartão de Destaque · ${project?.name || 'Projeto'}`;

  const body = document.createElement('div');
  body.style.cssText = 'display:flex;flex-direction:column;gap:14px;';

  const desc = document.createElement('p');
  desc.style.cssText = 'font-size:var(--text-xs);color:var(--text-muted);margin:0;line-height:1.5;';
  desc.textContent = isWeekly
    ? 'Imagem de alta resolução (1200×630px) com o ritmo de trabalho e foco dos últimos 7 dias. Pronta para redes sociais ou arquivo pessoal.'
    : 'Imagem de alta resolução (1200×630px) destacando as métricas, stack e nota de saúde heurística deste repositório.';
  body.appendChild(desc);

  // Canvas
  const canvasWrap = document.createElement('div');
  canvasWrap.style.cssText = 'background:#000;border-radius:var(--radius-md);overflow:hidden;border:1px solid var(--border-subtle);display:flex;justify-content:center;box-shadow:var(--shadow-md);';

  const canvas = isWeekly
    ? renderWeeklySummaryCardToCanvas(weeklyData, state)
    : renderProjectHighlightCardToCanvas(project);

  canvas.style.cssText = 'width:100%;max-width:560px;height:auto;display:block;';
  canvasWrap.appendChild(canvas);
  body.appendChild(canvasWrap);

  // Ações
  const actionsRow = document.createElement('div');
  actionsRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px;justify-content:flex-end;margin-top:6px;';

  const btnCopy = document.createElement('button');
  btnCopy.type = 'button';
  btnCopy.className = 'btn btn-secondary btn-sm';
  btnCopy.innerHTML = '📋 Copiar Imagem';
  btnCopy.addEventListener('click', async () => {
    btnCopy.disabled = true;
    btnCopy.textContent = 'Copiando...';
    try {
      await copyCanvasImageToClipboard(canvas);
      showToast('Imagem copiada para a área de transferência!', { variant: 'success' });
    } catch {
      showToast('Não foi possível copiar direto. Use o botão Baixar PNG.', { variant: 'neutral' });
    } finally {
      btnCopy.disabled = false;
      btnCopy.innerHTML = '📋 Copiar Imagem';
    }
  });
  actionsRow.appendChild(btnCopy);

  const btnDownload = document.createElement('button');
  btnDownload.type = 'button';
  btnDownload.className = 'btn btn-primary btn-sm';
  btnDownload.innerHTML = '📥 Baixar PNG (1200×630)';
  btnDownload.addEventListener('click', () => {
    const filename = isWeekly
      ? `painel-resumo-semanal-${new Date().toISOString().slice(0, 10)}.png`
      : `destaque-${project?.name || 'projeto'}.png`;
    downloadCanvasAsPng(canvas, filename);
    showToast('Download do cartão PNG iniciado!', { variant: 'success' });
  });
  actionsRow.appendChild(btnDownload);

  body.appendChild(actionsRow);

  openModal({
    title,
    body,
    confirmLabel: 'Fechar',
    confirmVariant: 'secondary',
    hideCancel: true,
    onConfirm: () => closeModal()
  });
}

/**
 * Abre modal interativo para personalizar e exportar Portfólio Estático HTML.
 */
export function openPortfolioExportModal(allProjects = []) {
  const validProjects = (allProjects || []).filter(p => !p.hidden);

  const body = document.createElement('div');
  body.style.cssText = 'display:flex;flex-direction:column;gap:16px;max-height:68vh;overflow-y:auto;padding-right:4px;';

  // Explicação
  const intro = document.createElement('div');
  intro.style.cssText = 'font-size:var(--text-xs);color:var(--text-secondary);line-height:1.5;background:rgba(139,92,246,0.08);padding:10px 12px;border-radius:var(--radius-sm);border:1px solid rgba(139,92,246,0.2);';
  intro.innerHTML = `
    <strong>🛡️ Exportação com Privacidade Garantida:</strong>
    Gera um arquivo HTML autônomo e estilizado pronto para publicação estática ou visualização offline.
    <strong>Notas privadas, tarefas pessoais, tokens e segredos NUNCA são incluídos.</strong>
  `;
  body.appendChild(intro);

  // Campos de personalização
  const formGroupTitle = document.createElement('div');
  formGroupTitle.innerHTML = `
    <label style="display:block;font-size:var(--text-xs);font-weight:700;margin-bottom:4px;color:var(--text-main);">
      Título do Portfólio:
    </label>
    <input type="text" id="port-title-input" class="search-input" style="width:100%;font-size:var(--text-sm);" value="Wendell Paranhos · Portfólio de Projetos">
  `;
  body.appendChild(formGroupTitle);

  const formGroupBio = document.createElement('div');
  formGroupBio.innerHTML = `
    <label style="display:block;font-size:var(--text-xs);font-weight:700;margin-bottom:4px;color:var(--text-main);">
      Bio Pública Curta:
    </label>
    <textarea id="port-bio-input" class="search-input" style="width:100%;height:60px;font-size:var(--text-xs);resize:none;">Desenvolvedor de software focado em interfaces fluidas, arquitetura resiliente e ferramentas centradas no usuário.</textarea>
  `;
  body.appendChild(formGroupBio);

  // Seleção de Projetos
  const listHeader = document.createElement('div');
  listHeader.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-top:4px;';
  listHeader.innerHTML = `
    <strong style="font-size:var(--text-xs);color:var(--text-main);">Selecione os projetos para incluir (${validProjects.length}):</strong>
    <button type="button" id="port-toggle-all" class="btn btn-ghost btn-sm" style="font-size:11px;padding:2px 6px;">
      Desmarcar todos
    </button>
  `;
  body.appendChild(listHeader);

  const projectListWrap = document.createElement('div');
  projectListWrap.style.cssText = 'display:flex;flex-direction:column;gap:6px;max-height:190px;overflow-y:auto;background:var(--bg-elevated);padding:8px;border-radius:var(--radius-sm);border:1px solid var(--border-subtle);';

  validProjects.forEach(proj => {
    const item = document.createElement('label');
    item.style.cssText = 'display:flex;align-items:center;gap:8px;font-size:var(--text-xs);color:var(--text-main);cursor:pointer;padding:4px 6px;border-radius:4px;';
    item.innerHTML = `
      <input type="checkbox" class="port-project-cb" value="${proj.repoId || proj.id}" checked>
      <span>${proj.customIcon || '📦'} <strong>${proj.name}</strong> <small style="color:var(--text-muted);">(${proj.language || 'Sem linguagem'})</small></span>
    `;
    projectListWrap.appendChild(item);
  });
  body.appendChild(projectListWrap);

  // Toggle de seleção
  let allSelected = true;
  body.querySelector('#port-toggle-all')?.addEventListener('click', (e) => {
    allSelected = !allSelected;
    e.target.textContent = allSelected ? 'Desmarcar todos' : 'Marcar todos';
    body.querySelectorAll('.port-project-cb').forEach(cb => { cb.checked = allSelected; });
  });

  // Ações de exportação
  const exportActions = document.createElement('div');
  exportActions.style.cssText = 'display:flex;justify-content:space-between;gap:10px;margin-top:10px;flex-wrap:wrap;';

  const btnPreview = document.createElement('button');
  btnPreview.type = 'button';
  btnPreview.className = 'btn btn-secondary btn-sm';
  btnPreview.innerHTML = '👁️ Abrir Prévia em Nova Aba';
  btnPreview.addEventListener('click', () => {
    const html = _buildPortfolioHtmlFromModal(body, validProjects);
    if (!html) return;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const previewUrl = URL.createObjectURL(blob);
    window.open(previewUrl, '_blank');
  });
  exportActions.appendChild(btnPreview);

  const btnDownload = document.createElement('button');
  btnDownload.type = 'button';
  btnDownload.className = 'btn btn-primary btn-sm';
  btnDownload.innerHTML = '📥 Baixar Portfólio (HTML)';
  btnDownload.addEventListener('click', () => {
    const html = _buildPortfolioHtmlFromModal(body, validProjects);
    if (!html) return;
    downloadPortfolioHtml(html, 'portfolio-wendell.html');
    showToast('Download do portfólio estático concluído!', { variant: 'success' });
    closeModal();
  });
  exportActions.appendChild(btnDownload);

  body.appendChild(exportActions);

  openModal({
    title: '🚀 Exportar Portfólio Estático',
    body,
    confirmLabel: 'Fechar',
    confirmVariant: 'secondary',
    hideCancel: true,
    onConfirm: () => closeModal()
  });
}

function _buildPortfolioHtmlFromModal(modalBody, validProjects) {
  const title = modalBody.querySelector('#port-title-input')?.value || 'Portfólio de Projetos';
  const bio = modalBody.querySelector('#port-bio-input')?.value || '';
  const selectedCbs = Array.from(modalBody.querySelectorAll('.port-project-cb:checked'));

  if (selectedCbs.length === 0) {
    showToast('Selecione pelo menos 1 projeto para o portfólio.', { variant: 'warning' });
    return null;
  }

  const selectedIds = selectedCbs.map(cb => cb.value);
  const sanitizedProjects = filterProjectsForPortfolio(validProjects, selectedIds);
  const audit = auditPortfolioPayloadForSecrets(sanitizedProjects);

  if (!audit.safe) {
    showToast(`Exportação bloqueada: ${audit.violations.join('; ')}`, { variant: 'danger' });
    return null;
  }

  return generateStandalonePortfolioHtml({
    title,
    bio,
    githubUsername: 'wendellparanhos',
    projects: sanitizedProjects
  });
}
