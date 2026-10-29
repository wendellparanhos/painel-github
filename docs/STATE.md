# Estado do Projeto — Painel de Projetos

## Fase Atual: Fase 2 — Gestão completa (Concluída ✅)

### Histórico de Fases:
- [x] **Fase 1**: Núcleo funcional + base visual (`#/home`, `#/project/:id`, `#/settings`, GitHub API + cache resiliente, status com histórico, tarefas básicas, notas Markdown seguras, temas/acentos/efeitos, import/export JSON v1).
- [x] **Fase 2**: Gestão completa (Abas na página do projeto com indicador deslizante, Atividade com commits/PRs/issues isolados, Timeline híbrida Remoto/Local, Kanban `#/kanban`, Tarefas avançadas com subtarefas e recorrência idempotente, Inbox rápida `#/inbox` + FAB + conversões, Command Palette `Ctrl/Cmd+K`, Atalhos de teclado globais, Pin/Ocultar/Personalizar projetos, Home com "Continue de onde parou", "Em foco", alertas de atraso e alternância Grid/Lista/Kanban).

### Decisões Arquiteturais (Fase 1 + Fase 2):
1. **Identidade do Repositório e Projetos Locais**: O ID numérico do GitHub é persistido como string; projetos criados localmente via Inbox recebem o prefixo `local_<timestamp>`, suportados pelo roteador (`#/project/:id`) e pelo mesclador de projetos sem exigir repositório remoto.
2. **Separação de Dados e Migração `v1 -> v2`**: O esquema foi atualizado para `CURRENT_VERSION = 2` em `js/store/storage.js`, com migração passo a passo (`1 -> 2`) e backup automático em `gh_project_manager_backup` antes de persistir a nova versão.
3. **Domínio Unificado (`js/utils/domain.js`)**: Uma única camada de domínio concentra a mesclagem de projetos (`getMergedProjects`), filtragem/ordenação (`filterAndSortProjects`), métricas globais (`computeGlobalMetrics`), seção `"Continue de onde parou"`, seção `"Em foco"`, datas locais (`parseLocalYMD`) e paginação (`SAFE_RENDER_LIMIT = 150`), eliminando divergências de contagem entre Home, Kanban, Inbox e Command Palette.
4. **Recorrência Previsível e Idempotente**: Ao concluir uma tarefa recorrente (`daily`, `weekly`, `monthly`), a próxima ocorrência recebe o ID determinístico `rec_${seriesId}_${nextDueDate}`. Se já existir uma tarefa com esse ID ou com a mesma série e data, nenhuma duplicata é criada.
5. **Pilha de Undo Parcial com Janela de Tempo**: O histórico de Undo em `js/store/store.js` armazena apenas snapshots parciais das entidades alteradas (`projects[id]` e/ou `inbox`), limitado a 25 entradas e janela de 15 minutos (`UNDO_WINDOW_MS`), evitando clonar `githubCache` ou crescer indefinidamente.
6. **Drag-and-Drop com Pointer Events + Alternativas Acessíveis**: Tanto o Kanban quanto a lista de tarefas usam Pointer Events com cancelamento limpo em `pointercancel`/`Escape` e persistência apenas em drop válido, acompanhados de botões acessíveis (`◀`/`▶`, `↑`/`↓`), seletor `<select>` de coluna e chips de seleção de coluna no mobile.
7. **Sincronização GitHub na Command Palette**: A ação `"Sincronizar GitHub"` atualiza exclusivamente o cache remoto da API (`fetchUserRepos(true)`), mantendo a separação estrita em relação à sincronização entre dispositivos (reservada para a Fase 6).

### Problemas Conhecidos e Riscos:
- Limite de 60 requisições/hora da GitHub API sem autenticação: mitigado com cache em `localStorage` (TTL 10 min), deduplicação de chamadas em voo e tratamento de erro isolado por widget na aba `Atividade`.
- Listas muito extensas (> 200 itens): mitigadas com paginação incremental (`SAFE_RENDER_LIMIT = 150` com botão `"Carregar mais"`).

### Como Executar Localmente:
Qualquer servidor HTTP estático na raiz do projeto.
Exemplo com Node ou Python:
```bash
python -m http.server 8080
```
Abrir `http://localhost:8080` no navegador.
