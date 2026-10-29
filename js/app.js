/**
 * Bootstrap da aplicação.
 * Ponto de entrada único — responsável por:
 *   1. Inicializar o store (carrega dados persistidos e migrações)
 *   2. Aplicar configurações salvas (tema, acento, nível de efeitos)
 *   3. Inicializar o motor de efeitos adaptativos
 *   4. Renderizar a navegação + botão da Command Palette + FAB da Inbox
 *   5. Iniciar o router (Home, Project, Kanban, Inbox, Settings)
 *   6. Inicializar atalhos de teclado globais
 *   7. Monitorar eventos do sistema (storage, fx, quota)
 */

import { initStore, getState } from './store/store.js';
import { initRouter } from './router.js';
import { initEffects, applyFxLevel } from './fx/effects.js';
import { renderNav } from './components/nav.js';
import { showToast } from './components/toast.js';
import { initShortcuts } from './utils/shortcuts.js';

import { HomeView } from './views/home.js';
import { ProjectView } from './views/project.js';
import { KanbanView } from './views/kanban.js';
import { InboxView } from './views/inbox.js';
import { SettingsView } from './views/settings.js';

// ─────────────────────────────────────────────
// BOOTSTRAP
// ─────────────────────────────────────────────
async function boot() {
  // 1. Inicializa o store (carrega localStorage, aplica migrações)
  const { corrupted, migrated } = initStore();

  if (corrupted) {
    showToast('⚠ Dados locais corrompidos detectados. Usando estado inicial. Um backup foi salvo.', {
      type: 'warning',
      duration: 8000
    });
  } else if (migrated) {
    showToast('ℹ Dados migrados para a versão mais recente com sucesso.', {
      type: 'info',
      duration: 4000
    });
  }

  // 2. Aplica configurações visuais salvas ao <html>
  const state = getState();
  const { theme, accent, fxLevel } = state.config;

  const root = document.documentElement;
  root.setAttribute('data-theme', theme || 'dark');
  root.setAttribute('data-accent', accent || 'violet');

  // 3. Inicializa motor de efeitos (respeita prefers-reduced-motion e hardware)
  initEffects(fxLevel || 'completo');

  // 4. Obtém o shell do app
  const appRoot = document.getElementById('app-root');
  if (!appRoot) {
    console.error('[App] #app-root não encontrado no DOM.');
    return;
  }

  // 5. Renderiza a navegação (header + dock mobile + botão palette + FAB Inbox)
  renderNav(appRoot);

  // 6. Cria o container principal das views
  const mainContent = document.createElement('main');
  mainContent.className = 'main-content';
  mainContent.id = 'main-content';
  mainContent.setAttribute('role', 'main');
  appRoot.appendChild(mainContent);

  // 7. Define as rotas
  const routes = [
    {
      pattern: '#/home',
      view: HomeView
    },
    {
      pattern: /^#\/project\/([a-zA-Z0-9_-]+)$/,
      view: ProjectView
    },
    {
      pattern: '#/kanban',
      view: KanbanView
    },
    {
      pattern: '#/inbox',
      view: InboxView
    },
    {
      pattern: '#/settings',
      view: SettingsView
    }
  ];

  // 8. Inicia o router (lê o hash atual e monta a view correspondente)
  initRouter(mainContent, routes);

  // 9. Inicializa atalhos de teclado globais
  initShortcuts();

  // 10. Monitora eventos do sistema
  _setupSystemListeners();

  console.info('[App] Painel inicializado com sucesso.');
}

// ─────────────────────────────────────────────
// EVENTOS DO SISTEMA
// ─────────────────────────────────────────────
function _setupSystemListeners() {
  document.addEventListener('fx:level-changed', (e) => {
    applyFxLevel(e.detail.level);
  });

  document.addEventListener('storage:quota-exceeded', () => {
    showToast('⚠ Espaço de armazenamento local quase cheio. Cache do GitHub foi removido para liberar espaço.', {
      type: 'warning',
      duration: 8000
    });
  });

  document.addEventListener('storage:critical-error', () => {
    showToast('❌ Erro crítico: não foi possível salvar os dados. Verifique o espaço disponível no seu navegador.', {
      type: 'error',
      duration: 0
    });
  });

  document.addEventListener('store:config-changed', (e) => {
    const { theme, accent } = e.detail;
    if (theme) document.documentElement.setAttribute('data-theme', theme);
    if (accent) document.documentElement.setAttribute('data-accent', accent);
  });
}

// ─────────────────────────────────────────────
// INICIALIZAÇÃO
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', boot);
