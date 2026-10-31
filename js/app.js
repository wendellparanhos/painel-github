/**
 * Bootstrap da aplicação — Fase 3.
 * Ponto de entrada único — responsável por:
 *   1. Inicializar o store (carrega dados persistidos e migrações)
 *   2. Aplicar configurações salvas (tema, acento, nível de efeitos)
 *   3. Inicializar o motor de efeitos adaptativos e monitor de FPS com histerese
 *   4. Renderizar a navegação + botão da Command Palette + FAB da Inbox
 *   5. Iniciar o router (Home, Project, Kanban, Inbox, Settings + Galáxia, Grafo e Bolhas via import() dinâmico)
 *   6. Inicializar atalhos de teclado globais
 *   7. Monitorar eventos do sistema (storage, fx auto-downgrade com opção Reverter, quota)
 */

import { initStore, getState, dispatch } from './store/store.js';
import { initRouter } from './router.js';
import { initEffects, applyFxLevel, setFxLevel } from './fx/effects.js';
import { renderNav } from './components/nav.js';
import { showToast } from './components/toast.js';
import { initShortcuts } from './utils/shortcuts.js';
import { initFeedbackListeners } from './services/feedback.js';
import { checkDailyNotificationsAndReminders } from './services/notifications.js';

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

  // 3. Inicializa motor de efeitos (respeita prefers-reduced-motion, hardware e monitor de FPS)
  initEffects(fxLevel || 'completo');

  // 4. Obtém o shell do app
  const appRoot = document.getElementById('app-root');
  if (!appRoot) {
    console.error('[App] #app-root não encontrado no DOM.');
    return;
  }

  // 5. Renderiza a navegação (header + dock desktop animada + dock mobile + palette + FAB Inbox)
  try {
    renderNav(appRoot);
  } catch (err) {
    console.error('[App] Erro ao renderizar navegação:', err);
  }

  // 6. Cria o container principal das views
  const mainContent = document.createElement('main');
  mainContent.className = 'main-content';
  mainContent.id = 'main-content';
  mainContent.setAttribute('role', 'main');
  appRoot.appendChild(mainContent);

  // 7. Define as rotas (visualizações especiais carregadas sob demanda via import() dinâmico)
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
      pattern: '#/focus',
      loader: () => import('./views/focus.js')
    },
    {
      pattern: '#/achievements',
      loader: () => import('./views/achievements.js')
    },
    {
      pattern: '#/galaxy',
      loader: () => import('./views/galaxy.js')
    },
    {
      pattern: '#/graph',
      loader: () => import('./views/graph.js')
    },
    {
      pattern: '#/bubbles',
      loader: () => import('./views/bubbles.js')
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

  // 10. Inicializa listeners de feedback (gamificação, sons opt-in, level up, celebração épica) e notificações locais
  try {
    initFeedbackListeners();
    setTimeout(() => checkDailyNotificationsAndReminders(), 1500);
  } catch (err) {
    console.warn('[App] Aviso ao inicializar feedback/notificações:', err);
  }

  // 11. Monitora eventos do sistema
  _setupSystemListeners();

  // Remove loader inicial imediatamente após montar a view
  const loader = document.getElementById('initial-loader');
  if (loader) {
    loader.classList.add('is-hidden');
    setTimeout(() => loader.remove(), 350);
  }

  console.info('[App] Painel inicializado com sucesso.');
}

// ─────────────────────────────────────────────
// EVENTOS DO SISTEMA
// ─────────────────────────────────────────────
function _setupSystemListeners() {
  document.addEventListener('fx:level-changed', (e) => {
    const level = e.detail.level;
    applyFxLevel(level);
    dispatch({ type: 'CONFIG_UPDATE', payload: { fxLevel: level } });
  });

  // Quando o monitor de FPS detecta queda sustentada (< 45 fps em 2+ janelas consecutivas)
  document.addEventListener('fx:auto-downgraded', (e) => {
    const { from, to, fps } = e.detail;
    showToast(`⚡ Efeitos ajustados de "${from}" para "${to}" (${fps} fps medidos) para manter a fluidez.`, {
      type: 'info',
      duration: 8000,
      action: {
        label: 'Reverter',
        fn: () => {
          setFxLevel(from, true, true);
          showToast(`Nível visual revertido para "${from}".`, { type: 'info', duration: 3000 });
        }
      }
    });
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
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
