/**
 * Router SPA baseado em hash — Fase 3 (com suporte a lazy loading via `import()` dinâmico
 * e limpeza automática de efeitos/loops por view).
 *
 * Ciclo de vida estrito:
 *   1. Ao navegar, chama `unmount()` na view anterior e `cleanupViewEffects()` no motor de efeitos
 *   2. Suporta `view` síncrona ou `loader: () => import(...)` assíncrono com fallback seguro
 *   3. Protege contra corridas de navegação assíncrona (`_routeSeq`)
 */

import { transitionView, cleanupViewEffects } from './fx/effects.js';

let _routes = [];
let _currentView = null;
let _viewContainer = null;
let _routeSeq = 0;

/**
 * @param {HTMLElement} container — onde as views são montadas
 * @param {Array<{ pattern: RegExp|string, view?: Object, loader?: Function, fallback?: Function }>} routes
 */
export function initRouter(container, routes) {
  _viewContainer = container;
  _routes = routes;

  window.addEventListener('hashchange', _handleRoute);
  _handleRoute();
}

async function _handleRoute() {
  const hash = window.location.hash || '#/home';
  const matched = _matchRoute(hash);

  if (!matched) {
    window.location.hash = '#/home';
    return;
  }

  const seq = ++_routeSeq;
  const { route, params } = matched;

  // Resolve view (síncrona ou carregada sob demanda via import() dinâmico)
  let resolvedView = route.view || null;
  if (!resolvedView && typeof route.loader === 'function') {
    try {
      const mod = await route.loader();
      resolvedView = mod.default || Object.values(mod)[0];
    } catch (err) {
      console.error('[Router] Falha ao carregar módulo sob demanda:', err);
      if (typeof route.fallback === 'function') {
        resolvedView = route.fallback(err);
      } else {
        resolvedView = _createDefaultFallbackView(err);
      }
    }
  }

  // Se outra navegação ocorreu enquanto o módulo carregava, aborta esta montagem
  if (seq !== _routeSeq || !resolvedView) return;

  const prevView = _currentView;

  const performMount = () => {
    if (prevView && typeof prevView.unmount === 'function') {
      try {
        prevView.unmount();
      } catch (e) {
        console.warn('[Router] Erro ao desmontar view anterior:', e);
      }
    }

    // Garante liberação de todos os RAFs, ResizeObservers e listeners registrados na view anterior
    cleanupViewEffects();

    while (_viewContainer.firstChild) {
      _viewContainer.removeChild(_viewContainer.firstChild);
    }

    _viewContainer.scrollTo?.({ top: 0 });
    window.scrollTo?.({ top: 0, behavior: 'instant' });

    _currentView = resolvedView;
    try {
      resolvedView.mount(_viewContainer, params);
    } catch (err) {
      console.error('[Router] Erro ao montar view:', err);
      _createDefaultFallbackView(err).mount(_viewContainer);
    }
  };

  // Na primeira montagem do boot (!prevView), monta sincronicamente sem ViewTransition
  if (!prevView) {
    performMount();
  } else {
    await transitionView(performMount);
  }
}

function _matchRoute(hash) {
  for (const route of _routes) {
    if (typeof route.pattern === 'string') {
      if (hash === route.pattern) {
        return { route, params: {} };
      }
    } else if (route.pattern instanceof RegExp) {
      const match = hash.match(route.pattern);
      if (match) {
        return { route, params: { id: match[1] } };
      }
    }
  }
  return null;
}

function _createDefaultFallbackView(err) {
  return {
    mount(container) {
      const box = document.createElement('div');
      box.className = 'card';
      box.style.cssText = 'padding:2rem;text-align:center;';
      box.innerHTML = `
        <h2 style="font-size:var(--text-lg);margin-bottom:8px;">Visualização indisponível no momento</h2>
        <p style="color:var(--text-secondary);font-size:var(--text-sm);margin-bottom:16px;">
          Não foi possível carregar o módulo visual (${err?.message || 'erro de rede'}). Você pode acessar todos os projetos na lista principal.
        </p>
        <a href="#/home" class="btn btn-primary btn-sm">Voltar para Projetos</a>
      `;
      container.appendChild(box);
    },
    unmount() {}
  };
}

/**
 * Navega programaticamente para um hash
 * @param {string} hash — ex.: '#/home', '#/project/123', '#/galaxy', '#/graph'
 */
export function navigate(hash) {
  if (window.location.hash === hash) {
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
  cleanupViewEffects();
  _currentView = null;
}
