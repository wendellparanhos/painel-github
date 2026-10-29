/**
 * Router SPA baseado em hash.
 *
 * Ciclo de vida estrito:
 *   1. Ao navegar, chama unmount() na view anterior (se existir)
 *   2. Chama mount(container, params) na nova view
 *   3. Cancela AbortControllers das views ao sair
 *
 * Rotas suportadas:
 *   #/home
 *   #/project/:id
 *   #/settings
 */

import { transitionView } from './fx/effects.js';

let _routes = [];
let _currentView = null;
let _viewContainer = null;

/**
 * @param {HTMLElement} container — onde as views são montadas
 * @param {Array<{ pattern: RegExp|string, view: Object }>} routes
 */
export function initRouter(container, routes) {
  _viewContainer = container;
  _routes = routes;

  window.addEventListener('hashchange', _handleRoute);
  _handleRoute(); // Carrega a rota atual na inicialização
}

function _handleRoute() {
  const hash = window.location.hash || '#/home';

  const matched = _matchRoute(hash);

  if (!matched) {
    // Rota não encontrada → redireciona para home
    window.location.hash = '#/home';
    return;
  }

  const { view, params } = matched;

  // Desmonta a view anterior antes de montar a nova
  const prevView = _currentView;

  transitionView(() => {
    if (prevView && typeof prevView.unmount === 'function') {
      try {
        prevView.unmount();
      } catch (e) {
        console.warn('[Router] Erro ao desmontar view anterior:', e);
      }
    }

    // Limpa o container
    while (_viewContainer.firstChild) {
      _viewContainer.removeChild(_viewContainer.firstChild);
    }

    // Rola para o topo
    _viewContainer.scrollTo?.({ top: 0 });
    window.scrollTo({ top: 0, behavior: 'instant' });

    _currentView = view;
    view.mount(_viewContainer, params);
  });
}

function _matchRoute(hash) {
  for (const route of _routes) {
    if (typeof route.pattern === 'string') {
      if (hash === route.pattern) {
        return { view: route.view, params: {} };
      }
    } else if (route.pattern instanceof RegExp) {
      const match = hash.match(route.pattern);
      if (match) {
        return { view: route.view, params: { id: match[1] } };
      }
    }
  }
  return null;
}

/**
 * Navega programaticamente para um hash
 * @param {string} hash — ex.: '#/home', '#/project/123'
 */
export function navigate(hash) {
  if (window.location.hash === hash) {
    // Já está na rota — força remontagem
    _handleRoute();
  } else {
    window.location.hash = hash;
  }
}

export function getCurrentHash() {
  return window.location.hash || '#/home';
}

export function destroyRouter() {
  window.removeEventListener('hashchange', _handleRoute);
  if (_currentView && typeof _currentView.unmount === 'function') {
    try { _currentView.unmount(); } catch { /* silencioso */ }
  }
  _currentView = null;
}
