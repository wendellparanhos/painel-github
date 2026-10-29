/**
 * View: Inbox Rápida (#/inbox) + Modal Global de Captura Rápida (FAB / tecla `c`) — Fase 2
 *
 * Entregas contempladas:
 *   - Botão flutuante visível e atalho `c` (fora de campos de texto)
 *   - Converter item em tarefa de um projeto existente
 *   - Converter item em projeto novo com status `ideia`
 *   - Editar, concluir e excluir com Undo
 */

import { getState, dispatch, subscribe, undo, canUndo } from '../store/store.js';
import { getMergedProjects, paginateItems } from '../utils/domain.js';
import { formatRelativeTime } from '../utils/formatters.js';
import { openModal } from '../components/modal.js';
import { showToast } from '../components/toast.js';
import { burstParticles } from '../fx/effects.js';
import { navigate } from '../router.js';

let _container = null;
let _unsubscribeStore = null;
let _filter = 'all'; // 'all' | 'open' | 'done'
let _search = '';
let _page = 1;

export const InboxView = {
  mount(container) {
    _container = container;
    _page = 1;
    _render();

    _unsubscribeStore = subscribe(() => {
      _renderListOnly();
    });
  },

  unmount() {
    _unsubscribeStore?.();
    _unsubscribeStore = null;
    _container = null;
  }
};

// ─────────────────────────────────────────────
// CAPTURA RÁPIDA GLOBAL (Acionada pelo FAB ou tecla `c`)
// ─────────────────────────────────────────────
export function openQuickInboxCaptureModal() {
  const body = document.createElement('div');
  body.style.cssText = 'display:flex;flex-direction:column;gap:12px;';

  const label = document.createElement('p');
  label.style.cssText = 'font-size:var(--text-sm);color:var(--text-secondary);';
  label.textContent = 'Anote uma ideia, lembrete ou pendência rápida. Depois você pode convertê-la em tarefa de um projeto ou em um novo projeto.';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'input';
  input.placeholder = 'O que está na sua mente? (Enter para salvar)';
  input.setAttribute('aria-label', 'Texto do item da Inbox');

  body.appendChild(label);
  body.appendChild(input);

  function saveItem() {
    const val = input.value.trim();
    if (!val) return;
    dispatch({ type: 'INBOX_ADD', payload: { text: val } });
    showToast('Salvo na Inbox!', {
      type: 'success',
      duration: 3500,
      action: {
        label: 'Abrir Inbox',
        fn: () => navigate('#/inbox')
      }
    });
  }

  openModal({
    title: '📥 Captura Rápida — Inbox',
    body,
    confirmLabel: 'Adicionar à Inbox',
    cancelLabel: 'Cancelar',
    onConfirm: saveItem
  });

  setTimeout(() => input.focus(), 60);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      // Clica no botão confirmar do modal
      const confirmBtn = document.querySelector('.modal-footer .btn-primary');
      if (confirmBtn) confirmBtn.click();
    }
  });
}

// ─────────────────────────────────────────────
// RENDER PRINCIPAL DA VIEW #/inbox
// ─────────────────────────────────────────────
function _render() {
  if (!_container) return;
  _container.innerHTML = '';

  const view = document.createElement('div');
  view.className = 'inbox-view';
  view.style.cssText = 'display:flex;flex-direction:column;gap:var(--space-5);max-width:860px;margin:0 auto;';

  // Cabeçalho
  const header = document.createElement('div');
  header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;';
  header.innerHTML = `
    <div>
      <h1 class="home-title" style="font-size:var(--text-xl);">📥 Inbox Rápida</h1>
      <p style="font-size:var(--text-sm);color:var(--text-secondary);">Capture ideias rapidamente e transforme em tarefas de projetos ou novos projetos.</p>
    </div>
  `;

  // Barra de criação direta
  const captureCard = document.createElement('div');
  captureCard.className = 'card';
  captureCard.style.padding = 'var(--space-4)';

  const captureRow = document.createElement('div');
  captureRow.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;';

  const captureInput = document.createElement('input');
  captureInput.type = 'text';
  captureInput.className = 'input';
  captureInput.style.flex = '1 1 240px';
  captureInput.placeholder = 'Capturar novo item na Inbox… (Enter para adicionar)';
  captureInput.setAttribute('aria-label', 'Novo item na Inbox');

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'btn btn-primary';
  addBtn.textContent = '+ Capturar';

  function handleAdd() {
    const val = captureInput.value.trim();
    if (!val) return;
    dispatch({ type: 'INBOX_ADD', payload: { text: val } });
    captureInput.value = '';
    captureInput.focus();
    showToast('Item adicionado à Inbox', { type: 'success', duration: 2000 });
  }

  captureInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); handleAdd(); }
  });
  addBtn.addEventListener('click', handleAdd);

  captureRow.appendChild(captureInput);
  captureRow.appendChild(addBtn);
  captureCard.appendChild(captureRow);

  // Barra de busca e filtros
  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar';

  const searchBox = document.createElement('div');
  searchBox.className = 'search-box';
  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.id = 'global-search-input';
  searchInput.className = 'input';
  searchInput.placeholder = 'Buscar na Inbox… ( / )';
  searchInput.value = _search;
  searchInput.addEventListener('input', () => {
    _search = searchInput.value;
    _renderListOnly();
  });
  searchBox.appendChild(searchInput);

  const filterChips = document.createElement('div');
  filterChips.id = 'inbox-filter-chips';
  filterChips.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;';

  toolbar.appendChild(searchBox);
  toolbar.appendChild(filterChips);

  const listWrap = document.createElement('div');
  listWrap.id = 'inbox-list-wrap';

  view.appendChild(header);
  view.appendChild(captureCard);
  view.appendChild(toolbar);
  view.appendChild(listWrap);

  _container.appendChild(view);
  _renderListOnly();
}

function _renderListOnly() {
  const listWrap = document.getElementById('inbox-list-wrap');
  const filterChips = document.getElementById('inbox-filter-chips');
  if (!listWrap) return;

  const state = getState();
  const allItems = state.inbox || [];
  const openCount = allItems.filter(i => !i.completed).length;
  const doneCount = allItems.filter(i => i.completed).length;

  if (filterChips) {
    filterChips.innerHTML = '';
    [
      { id: 'all', label: `Todos (${allItems.length})` },
      { id: 'open', label: `Pendentes (${openCount})` },
      { id: 'done', label: `Concluídos (${doneCount})` }
    ].forEach(f => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `btn btn-sm ${_filter === f.id ? 'btn-primary' : 'btn-secondary'}`;
      btn.textContent = f.label;
      btn.addEventListener('click', () => {
        _filter = f.id;
        _page = 1;
        _renderListOnly();
      });
      filterChips.appendChild(btn);
    });
  }

  let filtered = allItems;
  if (_filter === 'open') filtered = filtered.filter(i => !i.completed);
  else if (_filter === 'done') filtered = filtered.filter(i => i.completed);

  if (_search.trim()) {
    const q = _search.trim().toLowerCase();
    filtered = filtered.filter(i => i.text.toLowerCase().includes(q));
  }

  listWrap.innerHTML = '';

  if (filtered.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'card';
    empty.style.cssText = 'text-align:center;padding:3rem 1rem;color:var(--text-muted);';
    empty.innerHTML = `
      <div style="font-size:2.2rem;margin-bottom:0.5rem;">✨</div>
      <p>Sua Inbox está limpa para este filtro.</p>
    `;
    listWrap.appendChild(empty);
    return;
  }

  const { visibleItems, hasMore, remaining } = paginateItems(filtered, _page);

  const list = document.createElement('ul');
  list.className = 'tasks-list';
  list.setAttribute('aria-label', 'Itens da Inbox');

  visibleItems.forEach(item => {
    list.appendChild(_buildInboxItem(item));
  });

  listWrap.appendChild(list);

  if (hasMore) {
    const moreBtn = document.createElement('button');
    moreBtn.type = 'button';
    moreBtn.className = 'btn btn-secondary';
    moreBtn.style.cssText = 'margin:12px auto 0;display:flex;';
    moreBtn.textContent = `Carregar mais (${remaining} restantes)`;
    moreBtn.addEventListener('click', () => {
      _page++;
      _renderListOnly();
    });
    listWrap.appendChild(moreBtn);
  }
}

function _buildInboxItem(item) {
  const li = document.createElement('li');
  li.className = `task-item${item.completed ? ' is-completed' : ''}`;
  li.style.flexWrap = 'wrap';

  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.className = 'task-checkbox';
  cb.checked = item.completed;
  cb.setAttribute('aria-label', `Marcar "${item.text}" como ${item.completed ? 'pendente' : 'concluído'}`);
  cb.addEventListener('change', () => {
    const wasDone = item.completed;
    dispatch({ type: 'INBOX_TOGGLE', payload: { itemId: item.id } });
    if (!wasDone) burstParticles(cb);
  });

  const titleWrap = document.createElement('div');
  titleWrap.className = 'task-title-wrap';
  titleWrap.style.minWidth = '180px';

  const textEl = document.createElement('span');
  textEl.className = 'task-title';
  textEl.textContent = item.text;

  const metaEl = document.createElement('div');
  metaEl.className = 'task-meta';
  metaEl.textContent = `Capturado ${formatRelativeTime(item.createdAt)}`;

  titleWrap.appendChild(textEl);
  titleWrap.appendChild(metaEl);

  const actions = document.createElement('div');
  actions.className = 'task-actions';
  actions.style.flexWrap = 'wrap';

  // Converter em Tarefa de um Projeto
  const toTaskBtn = document.createElement('button');
  toTaskBtn.type = 'button';
  toTaskBtn.className = 'btn btn-secondary btn-sm';
  toTaskBtn.textContent = '→ Tarefa';
  toTaskBtn.title = 'Converter em tarefa de um projeto';
  toTaskBtn.addEventListener('click', () => _openConvertToTaskModal(item));

  // Converter em Novo Projeto (status: ideia)
  const toProjBtn = document.createElement('button');
  toProjBtn.type = 'button';
  toProjBtn.className = 'btn btn-secondary btn-sm';
  toProjBtn.textContent = '→ Projeto (Ideia)';
  toProjBtn.title = 'Converter em novo projeto com status ideia';
  toProjBtn.addEventListener('click', () => {
    dispatch({ type: 'INBOX_CONVERT_TO_PROJECT', payload: { itemId: item.id } });
    showToast(`Convertido em novo projeto ("${item.text}") com status Ideia!`, {
      type: 'success',
      duration: 5000,
      action: {
        label: 'Desfazer',
        fn: () => { if (canUndo()) undo(); }
      }
    });
  });

  // Editar
  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'btn btn-ghost btn-icon btn-sm';
  editBtn.setAttribute('aria-label', 'Editar item da Inbox');
  editBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
  editBtn.addEventListener('click', () => _openEditInboxModal(item));

  // Excluir com Undo
  const delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.className = 'btn btn-ghost btn-icon btn-sm';
  delBtn.style.color = 'var(--color-danger)';
  delBtn.setAttribute('aria-label', 'Excluir item da Inbox');
  delBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`;
  delBtn.addEventListener('click', () => {
    dispatch({ type: 'INBOX_DELETE', payload: { itemId: item.id } });
    showToast('Item removido da Inbox', {
      type: 'default',
      duration: 5000,
      action: {
        label: 'Desfazer',
        fn: () => { if (canUndo()) undo(); }
      }
    });
  });

  actions.appendChild(toTaskBtn);
  actions.appendChild(toProjBtn);
  actions.appendChild(editBtn);
  actions.appendChild(delBtn);

  li.appendChild(cb);
  li.appendChild(titleWrap);
  li.appendChild(actions);
  return li;
}

function _openEditInboxModal(item) {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'input';
  input.value = item.text;

  openModal({
    title: 'Editar Item da Inbox',
    body: input,
    confirmLabel: 'Salvar',
    cancelLabel: 'Cancelar',
    onConfirm: () => {
      const val = input.value.trim();
      if (val && val !== item.text) {
        dispatch({ type: 'INBOX_UPDATE', payload: { itemId: item.id, text: val } });
        showToast('Item atualizado!', { type: 'success', duration: 2000 });
      }
    }
  });
}

function _openConvertToTaskModal(item) {
  const state = getState();
  const projects = getMergedProjects(state).filter(p => !p.hidden);

  if (projects.length === 0) {
    showToast('Nenhum projeto disponível. Crie ou sincronize um projeto primeiro.', { type: 'warning' });
    return;
  }

  const body = document.createElement('div');
  body.style.cssText = 'display:flex;flex-direction:column;gap:12px;';

  const projGroup = document.createElement('div');
  projGroup.className = 'input-group';
  projGroup.style.marginBottom = '0';
  projGroup.innerHTML = `<label class="input-label">Projeto de destino</label>`;

  const projSelect = document.createElement('select');
  projSelect.className = 'select';
  projects.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.repoId;
    opt.textContent = p.name;
    projSelect.appendChild(opt);
  });
  projGroup.appendChild(projSelect);

  const prioGroup = document.createElement('div');
  prioGroup.className = 'input-group';
  prioGroup.style.marginBottom = '0';
  prioGroup.innerHTML = `<label class="input-label">Prioridade</label>`;

  const prioSelect = document.createElement('select');
  prioSelect.className = 'select';
  ['baixa', 'normal', 'alta', 'urgente'].forEach(p => {
    const opt = document.createElement('option');
    opt.value = p;
    opt.textContent = p.charAt(0).toUpperCase() + p.slice(1);
    opt.selected = p === 'normal';
    prioSelect.appendChild(opt);
  });
  prioGroup.appendChild(prioSelect);

  const dueGroup = document.createElement('div');
  dueGroup.className = 'input-group';
  dueGroup.style.marginBottom = '0';
  dueGroup.innerHTML = `<label class="input-label">Prazo (opcional)</label>`;
  const dueInput = document.createElement('input');
  dueInput.type = 'date';
  dueInput.className = 'input';
  dueGroup.appendChild(dueInput);

  body.appendChild(projGroup);
  body.appendChild(prioGroup);
  body.appendChild(dueGroup);

  openModal({
    title: 'Converter em Tarefa de Projeto',
    body,
    confirmLabel: 'Converter',
    cancelLabel: 'Cancelar',
    onConfirm: () => {
      const targetRepoId = projSelect.value;
      dispatch({
        type: 'INBOX_CONVERT_TO_TASK',
        payload: {
          itemId: item.id,
          repoId: targetRepoId,
          priority: prioSelect.value,
          dueDate: dueInput.value || null
        }
      });
      showToast('Item convertido em tarefa do projeto!', {
        type: 'success',
        duration: 5000,
        action: {
          label: 'Desfazer',
          fn: () => { if (canUndo()) undo(); }
        }
      });
    }
  });
}
