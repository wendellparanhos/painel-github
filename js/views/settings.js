/**
 * View: Settings (#/settings)
 *
 * Opções de tema, acento, nível de efeitos,
 * exportar/importar JSON com validação e backup,
 * limpeza de cache e de dados pessoais.
 */

import { getState, dispatch } from '../store/store.js';
import { exportJSON, importJSON, triggerDownload, backup, clearGitHubCache } from '../store/storage.js';
import { setFxLevel } from '../fx/effects.js';
import { showToast } from '../components/toast.js';
import { openModal } from '../components/modal.js';

let _container = null;

const ACCENTS = [
  { id: 'violet', label: 'Violeta', color: '#8b5cf6' },
  { id: 'cyan',   label: 'Ciano',   color: '#06b6d4' },
  { id: 'emerald',label: 'Esmeralda',color: '#10b981' },
  { id: 'amber',  label: 'Âmbar',   color: '#f59e0b' },
  { id: 'rose',   label: 'Rosa',    color: '#f43f5e' },
  { id: 'blue',   label: 'Azul',    color: '#3b82f6' }
];

const THEMES = [
  { id: 'dark',   label: '🌙 Escuro' },
  { id: 'light',  label: '☀️ Claro' },
  { id: 'system', label: '⚙️ Sistema' }
];

const FX_LEVELS = [
  { id: 'completo',  label: 'Completo',  desc: 'Todos os efeitos visuais ativos' },
  { id: 'reduzido',  label: 'Reduzido',  desc: 'Animações básicas, menos blur' },
  { id: 'minimo',    label: 'Mínimo',    desc: 'Sem animações — acessibilidade e performance' }
];

export const SettingsView = {
  mount(container, _params) {
    _container = container;
    _render();
  },

  unmount() {
    _container = null;
  }
};

// ─────────────────────────────────────────────
// RENDER PRINCIPAL
// ─────────────────────────────────────────────
function _render() {
  if (!_container) return;
  _container.innerHTML = '';

  const view = document.createElement('div');
  view.className = 'settings-view';

  const pageTitle = document.createElement('h1');
  pageTitle.textContent = 'Configurações';
  view.appendChild(pageTitle);

  view.appendChild(_buildThemeSection());
  view.appendChild(_buildAccentSection());
  view.appendChild(_buildFxSection());
  view.appendChild(_buildDataSection());
  view.appendChild(_buildDangerSection());

  _container.appendChild(view);
}

// ─────────────────────────────────────────────
// SEÇÃO: TEMA
// ─────────────────────────────────────────────
function _buildThemeSection() {
  const section = _buildSection('Aparência', 'Tema de cores da interface.');
  const state = getState();
  const currentTheme = state.config.theme;

  const btnGroup = document.createElement('div');
  btnGroup.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;';

  for (const { id, label } of THEMES) {
    const btn = document.createElement('button');
    btn.className = `btn ${id === currentTheme ? 'btn-primary' : 'btn-secondary'}`;
    btn.textContent = label;
    btn.addEventListener('click', () => {
      dispatch({ type: 'CONFIG_UPDATE', payload: { theme: id } });
      document.documentElement.setAttribute('data-theme', id);
      // Re-renderiza apenas os botões de tema
      btnGroup.querySelectorAll('.btn').forEach(b => b.className = 'btn btn-secondary');
      btn.className = 'btn btn-primary';
      showToast(`Tema alterado para "${label}"`, { type: 'success', duration: 2500 });
    });
    btnGroup.appendChild(btn);
  }

  section.appendChild(btnGroup);
  return section;
}

// ─────────────────────────────────────────────
// SEÇÃO: ACENTO
// ─────────────────────────────────────────────
function _buildAccentSection() {
  const section = _buildSection('Cor de Destaque', '6 paletas disponíveis.');
  const state = getState();
  const currentAccent = state.config.accent;

  const grid = document.createElement('div');
  grid.className = 'palette-grid';

  for (const { id, label, color } of ACCENTS) {
    const btn = document.createElement('button');
    btn.className = `palette-btn${id === currentAccent ? ' is-active' : ''}`;
    btn.setAttribute('aria-label', `Acento ${label}`);
    btn.innerHTML = `
      <div class="palette-swatch" style="background:${color};box-shadow:0 0 12px ${color}55;"></div>
      <span>${label}</span>
    `;
    btn.addEventListener('click', () => {
      dispatch({ type: 'CONFIG_UPDATE', payload: { accent: id } });
      document.documentElement.setAttribute('data-accent', id);
      grid.querySelectorAll('.palette-btn').forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      showToast(`Acento alterado para "${label}"`, { type: 'success', duration: 2000 });
    });
    grid.appendChild(btn);
  }

  section.appendChild(grid);
  return section;
}

// ─────────────────────────────────────────────
// SEÇÃO: NÍVEL DE EFEITOS
// ─────────────────────────────────────────────
function _buildFxSection() {
  const section = _buildSection('Nível de Efeitos', 'Controla animações, blur e partículas. O sistema ajusta automaticamente com base no dispositivo e em prefers-reduced-motion.');
  const state = getState();
  const currentFx = state.config.fxLevel;

  const btnGroup = document.createElement('div');
  btnGroup.style.cssText = 'display:flex;flex-direction:column;gap:8px;';

  for (const { id, label, desc } of FX_LEVELS) {
    const btn = document.createElement('button');
    btn.className = `btn ${id === currentFx ? 'btn-primary' : 'btn-secondary'}`;
    btn.style.justifyContent = 'flex-start';
    btn.innerHTML = `<strong>${label}</strong>&nbsp;— <span style="font-weight:400;opacity:0.7;">${desc}</span>`;
    btn.addEventListener('click', () => {
      dispatch({ type: 'CONFIG_UPDATE', payload: { fxLevel: id } });
      setFxLevel(id);
      btnGroup.querySelectorAll('.btn').forEach(b => b.className = 'btn btn-secondary');
      btn.className = 'btn btn-primary';
      showToast(`Efeitos definidos para "${label}"`, { type: 'success', duration: 2500 });
    });
    btnGroup.appendChild(btn);
  }

  section.appendChild(btnGroup);
  return section;
}

// ─────────────────────────────────────────────
// SEÇÃO: EXPORTAR / IMPORTAR
// ─────────────────────────────────────────────
function _buildDataSection() {
  const section = _buildSection('Dados Pessoais', 'Exporte seus projetos, tarefas, notas e status para um arquivo JSON. Importe para restaurar ou migrar dados entre dispositivos.');

  const btnGroup = document.createElement('div');
  btnGroup.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;';

  // Exportar
  const exportBtn = document.createElement('button');
  exportBtn.className = 'btn btn-secondary';
  exportBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Exportar JSON`;
  exportBtn.addEventListener('click', () => {
    const state = getState();
    const json = exportJSON(state);
    triggerDownload(json, `painel-backup-${new Date().toISOString().split('T')[0]}.json`);
    showToast('Backup exportado com sucesso!', { type: 'success', duration: 3000 });
  });

  // Importar
  const importBtn = document.createElement('button');
  importBtn.className = 'btn btn-secondary';
  importBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> Importar JSON`;

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.json,application/json';
  fileInput.style.display = 'none';

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const jsonString = e.target.result;
      const currentState = getState();
      const result = importJSON(jsonString, currentState);

      if (!result.success) {
        openModal({
          title: 'Falha na Importação',
          body: `❌ ${result.error}`,
          confirmLabel: 'Entendi',
          hideCancel: true,
          onConfirm: () => {}
        });
        fileInput.value = '';
        return;
      }

      // Exibe preview e pede confirmação
      const preview = result.preview;
      const bodyEl = document.createElement('div');
      bodyEl.style.cssText = 'display:flex;flex-direction:column;gap:12px;color:var(--text-secondary);font-size:var(--text-sm);';
      bodyEl.innerHTML = `
        <p>Arquivo válido. Detalhes do backup:</p>
        <ul style="margin-left:20px;display:flex;flex-direction:column;gap:6px;">
          <li><strong>Projetos:</strong> ${preview.projectCount}</li>
          <li><strong>Versão:</strong> ${preview.version}</li>
          ${preview.exportedAt ? `<li><strong>Exportado em:</strong> ${new Date(preview.exportedAt).toLocaleString('pt-BR')}</li>` : ''}
        </ul>
        <p style="color:var(--color-warning);font-weight:600;">⚠ Isso substituirá todos os seus dados locais atuais. Um backup automático será criado antes.</p>
      `;

      openModal({
        title: 'Confirmar Importação',
        body: bodyEl,
        confirmLabel: 'Importar e Substituir',
        cancelLabel: 'Cancelar',
        confirmVariant: 'danger',
        onConfirm: () => {
          // Cria backup do estado atual antes de sobrescrever
          backup();
          // Substitui projetos e config via action dedicada
          dispatch({ type: '_IMPORT_STATE', payload: result.state });
          if (result.state.config) {
            document.dispatchEvent(new CustomEvent('store:config-changed', { detail: result.state.config }));
            if (result.state.config.fxLevel) {
              setFxLevel(result.state.config.fxLevel);
            }
          }
          showToast('Dados importados com sucesso! Um backup foi salvo antes.', { type: 'success', duration: 5000 });
          // Re-renderiza configurações para refletir novo config
          _render();
        }
      });
    };

    reader.onerror = () => {
      showToast('Erro ao ler o arquivo.', { type: 'error' });
    };

    reader.readAsText(file);
    fileInput.value = '';
  });

  importBtn.addEventListener('click', () => fileInput.click());

  btnGroup.appendChild(exportBtn);
  btnGroup.appendChild(importBtn);
  btnGroup.appendChild(fileInput);
  section.appendChild(btnGroup);

  // Limpar cache do GitHub
  const cacheLine = document.createElement('div');
  cacheLine.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-top:12px;padding:12px 14px;background:var(--bg-surface);border-radius:var(--radius-md);border:1px solid var(--border-subtle);';
  cacheLine.innerHTML = `
    <div>
      <div style="font-size:var(--text-sm);font-weight:600;color:var(--text-main);">Limpar cache do GitHub</div>
      <div style="font-size:var(--text-xs);color:var(--text-muted);margin-top:2px;">Remove apenas os dados temporários da API. Seus projetos, tarefas e notas não são afetados.</div>
    </div>
  `;

  const clearCacheBtn = document.createElement('button');
  clearCacheBtn.className = 'btn btn-secondary btn-sm';
  clearCacheBtn.textContent = 'Limpar cache';
  clearCacheBtn.style.flexShrink = '0';
  clearCacheBtn.addEventListener('click', () => {
    const currentState = getState();
    const clearedState = clearGitHubCache(currentState);
    dispatch({ type: 'GITHUB_CACHE_UPDATE', payload: { repos: [], fetchedAt: null, rateLimit: null } });
    showToast('Cache do GitHub limpo. Recarregue a Home para buscar novamente.', { type: 'success', duration: 4000 });
  });

  cacheLine.appendChild(clearCacheBtn);
  section.appendChild(cacheLine);

  return section;
}

// ─────────────────────────────────────────────
// SEÇÃO: ZONA DE PERIGO (apagar dados)
// ─────────────────────────────────────────────
function _buildDangerSection() {
  const section = _buildSection('Zona de Perigo', '');

  const dangerCard = document.createElement('div');
  dangerCard.style.cssText = 'padding:16px;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.25);border-radius:var(--radius-md);display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;';

  const info = document.createElement('div');
  info.innerHTML = `
    <div style="font-size:var(--text-sm);font-weight:700;color:#f87171;margin-bottom:4px;">Apagar todos os dados pessoais</div>
    <div style="font-size:var(--text-xs);color:var(--text-muted);">Remove todos os seus projetos locais, status, tarefas e notas. O cache do GitHub também é limpo. <strong>Esta ação não pode ser desfeita.</strong> Exporte primeiro para garantir um backup.</div>
  `;

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'btn btn-danger';
  deleteBtn.style.flexShrink = '0';
  deleteBtn.textContent = '🗑 Apagar tudo';

  deleteBtn.addEventListener('click', () => {
    const bodyEl = document.createElement('div');
    bodyEl.style.cssText = 'display:flex;flex-direction:column;gap:12px;color:var(--text-secondary);';
    bodyEl.innerHTML = `
      <p>Esta ação apagará permanentemente:</p>
      <ul style="margin-left:20px;display:flex;flex-direction:column;gap:6px;">
        <li>Status pessoal de todos os projetos</li>
        <li>Todas as tarefas e notas</li>
        <li>Histórico de status</li>
        <li>Capas customizadas e seeds</li>
        <li>Cache do GitHub</li>
      </ul>
      <p style="color:var(--color-danger);font-weight:700;">Recomendamos exportar um backup antes de continuar.</p>
    `;

    openModal({
      title: '⚠ Confirmar Exclusão Total',
      body: bodyEl,
      confirmLabel: 'Sim, apagar tudo',
      cancelLabel: 'Cancelar',
      confirmVariant: 'danger',
      onConfirm: () => {
        // Exporta backup antes de apagar
        const state = getState();
        const json = exportJSON(state);
        triggerDownload(json, `painel-backup-antes-de-apagar-${Date.now()}.json`);

        dispatch({ type: '_RESET_ALL' });
        showToast('Todos os dados foram apagados. Um backup foi baixado automaticamente.', { type: 'warning', duration: 6000 });
        _render();
      }
    });
  });

  dangerCard.appendChild(info);
  dangerCard.appendChild(deleteBtn);
  section.appendChild(dangerCard);
  return section;
}

// ─────────────────────────────────────────────
// HELPER: constrói uma seção com título + descrição
// ─────────────────────────────────────────────
function _buildSection(title, desc) {
  const section = document.createElement('section');
  section.className = 'card';
  section.style.cssText = 'display:flex;flex-direction:column;gap:16px;';

  const header = document.createElement('div');

  const titleEl = document.createElement('h2');
  titleEl.style.fontSize = 'var(--text-md)';
  titleEl.style.fontWeight = '700';
  titleEl.style.marginBottom = '4px';
  titleEl.textContent = title;

  header.appendChild(titleEl);

  if (desc) {
    const descEl = document.createElement('p');
    descEl.style.fontSize = 'var(--text-sm)';
    descEl.style.color = 'var(--text-muted)';
    descEl.textContent = desc;
    header.appendChild(descEl);
  }

  section.appendChild(header);
  return section;
}
