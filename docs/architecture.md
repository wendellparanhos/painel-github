# Arquitetura do Sistema — Painel de Projetos (V6.2)

## 1. Visão Geral
Aplicação SPA sem framework, sem bundler e sem npm obrigatório. Utiliza HTML5 semântico, CSS3 moderno com tokens e variáveis customizadas, e JavaScript modular nativo (ES Modules).

Hospedada como arquivos estáticos no GitHub Pages com roteamento baseado em hash (`#/home`, `#/project/<id>`, `#/settings`).

---

## 2. Separação de Fontes da Verdade
- **GitHub API (Remoto)**:
  - Fonte de verdade para: nome, descrição, linguagem principal, contagem de estrelas, forks, data do último push, URL pública e commits recentes.
  - Tratamento: Cache local isolado com timestamp e TTL (10 minutos padrão). Identificado pelo ID numérico do repositório (armazenado como string para preservar integridade).
- **Painel Local (Cliente)**:
  - Fonte de verdade para: status pessoal (`ideia`, `em andamento`, `pausado`, `concluído`, `arquivado`), tarefas locais, notas em markdown, semente de capa (`coverSeed`), prioridades e histórico de status.
  - **Regra Fundamental**: A resposta da API do GitHub **nunca** sobrescreve ou apaga dados pessoais. Repositórios ausentes na API são sinalizados como indisponíveis, mantendo suas tarefas e notas intactas.

---

## 3. Orçamento de Requests GitHub e Rate Limit
- **Home (`#/home`)**: Executa exclusivamente a listagem paginada de repositórios do usuário (`/users/wendellparanhos/repos?per_page=100&sort=updated`). **Zero requisições individuais por repositório na Home.**
- **Página do Projeto (`#/project/:id`)**: Carrega commits recentes (`/repos/:owner/:repo/commits?per_page=5`) sob demanda com cache de 10 minutos. Falha no endpoint de commits não compromete a tela de projeto.
- **Tratamento de Rate Limit**: Leitura rigorosa dos headers `X-RateLimit-Limit`, `X-RateLimit-Remaining` e `X-RateLimit-Reset`. Estado visível para o usuário quando a cota estiver esgotada, informando o horário exato de renovação.

---

## 4. Contratos de Módulos

### 4.1 Store (`js/store/store.js`)
- `getState()`: Retorna cópia imutável ou congelada do estado atual.
- `dispatch(action)`: Despacha ações puras (`PROJECT_UPDATE_STATUS`, `TASK_ADD`, `TASK_TOGGLE`, `TASK_UPDATE`, `TASK_DELETE`, `TASK_REORDER`, `NOTE_UPDATE`, `CONFIG_UPDATE`, etc.).
- `subscribe(listener)`: Registra callback executado a cada transição de estado. Retorna função `unsubscribe()`.
- `undo()`: Reverte a última ação reversível registrada na pilha de undo (ex.: exclusão de tarefa, alteração de status).
- `canUndo()`: Booleano indicando disponibilidade de ações para reversão.

### 4.2 Storage / Persistência (`js/store/storage.js`)
- `loadState()`: Carrega dados do `localStorage` com validação de esquema e migração passo a passo. Retorna fallback seguro em caso de corrupção.
- `saveState(state)`: Salva com debounce de 300ms e tratamento de `QuotaExceededError`.
- `backup()`: Gera snapshot de backup no `localStorage` antes de operações de risco (importação, migração, limpeza).
- `exportJSON()`: Serializa estado limpo (sem dados sensíveis) para download.
- `importJSON(jsonString)`: Valida esquema, cria backup preventivo, aplica migrações e restaura o estado.

### 4.3 GitHub Service (`js/services/github.js`)
- `fetchUserRepos(username, forceRefresh)`: Retorna Promise com `{ data, source: 'network'|'cache', fetchedAt, rateLimit, error }`.
- `fetchRepoCommits(fullName, forceRefresh)`: Retorna Promise com commits ou status de repositório vazio/erro isolado.
- Deduplicação de requisições simultâneas via Promises ativas e cancelamento seguro via `AbortController`.

### 4.4 Roteador (`js/router.js`)
- `init(routes)`: Monitora evento `hashchange` e inicializa a rota correspondente.
- `navigate(hash)`: Atualiza a URL mantendo o histórico de navegação.
- `getCurrentRoute()`: Retorna rota ativa e parâmetros extraídos (ex.: `:id`).
- Ciclo de vida estrito: ao trocar de rota, chama `unmount()` na view anterior e `mount(container, params)` na view de destino.

### 4.5 Ciclo de Vida das Views (`js/views/*.js`)
- `mount(container, params)`: Renderiza conteúdo, associa listeners delegados e inicia sub-rotinas necessárias.
- `unmount()`: Cancela requisições em andamento (`AbortController.abort()`), remove listeners, para timers e libera referências.

### 4.6 Efeitos Adaptativos (`js/fx/effects.js`)
- Três níveis globais: `completo` (padrão), `reduzido` e `mínimo`.
- Respeito estrito a `prefers-reduced-motion` (ativa automaticamente `mínimo`).
- Detecção heurística de hardware (`navigator.hardwareConcurrency`, `navigator.deviceMemory`).
- Suspensão automática de loops e timers quando `document.visibilityState === 'hidden'`.

---

## 5. Esquema de Dados Local (Versão 1)

```json
{
  "version": 1,
  "config": {
    "theme": "dark",
    "accent": "violet",
    "fxLevel": "completo"
  },
  "projects": {
    "<repoId>": {
      "id": "<repoId>",
      "status": "ideia",
      "statusHistory": [
        { "status": "ideia", "timestamp": "2026-10-28T22:00:00.000Z" }
      ],
      "coverSeed": 12345,
      "tasks": [
        {
          "id": "uuid",
          "title": "Primeira tarefa",
          "completed": false,
          "priority": "normal",
          "dueDate": null,
          "createdAt": "2026-10-28T22:00:00.000Z"
        }
      ],
      "note": {
        "content": "# Notas do Projeto\n...",
        "updatedAt": "2026-10-28T22:00:00.000Z"
      },
      "customLinks": []
    }
  },
  "githubCache": {
    "repos": [],
    "fetchedAt": null,
    "rateLimit": null
  }
}
```
