# Checklist de Smoke Tests — Painel de Projetos

Este documento lista os testes essenciais que devem ser executados ao final de cada fase e mantidos sem regressão.

---

## 1. Fundação e Navegação
- [x] Carregamento inicial direto em `#/home`
- [x] Abertura direta de rota de projeto `#/project/<id>`
- [x] Abertura direta de rota de configurações `#/settings`
- [x] Navegação via botões Voltar / Avançar do navegador
- [x] Redirecionamento seguro de rota inexistente para `#/home`
- [x] Ausência de listeners duplicados ao navegar repetidamente entre telas
- [x] Cancelamento de requisições pendentes ao sair de uma view

---

## 2. GitHub Service e Resiliência
- [x] Listagem de repositórios públicos de `wendellparanhos` funcionando online
- [x] Comportamento offline (desconectar rede e recarregar): exibe cache anterior com aviso claro
- [x] Comportamento com rate limit esgotado: exibe mensagem com horário de liberação sem travar a UI
- [x] Detecção de repositório inexistente ou sem commits com mensagem amigável sem quebrar a tela de projeto
- [x] Atualização manual dos repositórios preserva 100% dos status, tarefas e notas locais

---

## 3. Gestão Local de Projetos
- [x] Mudança de status do projeto (`ideia`, `em andamento`, `pausado`, `concluído`, `arquivado`) com persistência após refresh
- [x] Histórico de status registrado com data/hora em ISO 8601
- [x] Criação rápida de tarefa via Enter
- [x] Edição de título, prazo e prioridade da tarefa
- [x] Conclusão de tarefa com disparo de partículas em canvas (respeitando `prefers-reduced-motion`)
- [x] Exclusão de tarefa com toast de Undo funcional
- [x] Reordenação de tarefas via botões acessíveis de subir/descer
- [x] Edição de notas em Markdown com autosave debounce e indicador salvando/salvo
- [x] Renderização segura do Markdown (sem injeção de `<script>` ou HTML arbitrário)

---

## 4. Configurações, Persistência e Backup
- [x] Troca de tema (escuro, claro, sistema) com persistência
- [x] Troca entre as 6 paletas de acento
- [x] Troca de nível de efeitos (`completo`, `reduzido`, `mínimo`)
- [x] Exportação de JSON gerando arquivo íntegro
- [x] Importação de JSON validado com restauração completa e backup automático prévio
- [x] Rejeição de JSON inválido ou corrompido sem perda de dados existentes
- [x] Limpeza de cache sem apagar dados pessoais de projetos

---

## 5. Responsividade e Acessibilidade
- [x] Viewport mobile de ~380 px (e 360 px / 390 px) sem overflow horizontal indesejado
- [x] Alvos de toque com tamanho mínimo de 44x44 px
- [x] Navegação por teclado (Tab, Shift+Tab, Enter, Espaço, Escape)
- [x] Foco visível em todos os elementos interativos
- [x] Modais prendem o foco (focus trap) e fecham com tecla `Escape`
- [x] Contraste visual adequado segundo padrões WCAG AA
- [x] Desativação de animações e partículas com `prefers-reduced-motion: reduce`

---

## 6. Fase 2 — Gestão Completa (Abas, Atividade, Timeline e Projetos)
- [x] Abas na página do projeto (`Visão geral`, `Tarefas`, `Atividade`, `Notas`, `Timeline`) com indicador deslizante e navegação por teclado (Setas Esquerda/Direita)
- [x] Aba `Atividade`: widgets independentes de Commits, Pull Requests e Issues abertos (filtrando PRs do endpoint `/issues`), cada um com erro isolado e estado `"Indisponível"` sem travar os demais
- [x] Aba `Timeline`: eventos remotos e marcos pessoais ordenados cronologicamente, com selos explícitos de origem (`Remoto · GitHub` vs `Pessoal · Local`) e criação/exclusão de marcos locais
- [x] Projetos: fixar (`pin`), ocultar (`hidden`), personalizar ícone/emoji e cor de destaque, e trocar semente da capa
- [x] Histórico de status visível na página do projeto e reversão por Undo parcial com janela de tempo (15 min) e limite de pilha (25 entradas), sem clonar o estado inteiro

---

## 7. Fase 2 — Kanban, Tarefas Avançadas e Domínio Unificado
- [x] Kanban (`#/kanban`) com 5 colunas por status, filtros por busca, prioridade, prazo e projeto, mantendo contagens idênticas à Home (`domain.js`)
- [x] Arrastar cartões no Kanban com Pointer Events muda o status, persiste apenas em drop válido, cancela com `Escape`/`pointercancel` e registra no histórico com Undo
- [x] Alternativa acessível no Kanban para teclado e toque: botões `◀`/`▶`, seletor `<select>` `"→ status"` em cada cartão, atalho `Alt + Setas` e barra de chips de coluna no mobile (sem exigir precisão de arrasto)
- [x] Tarefas avançadas: subtarefas com barra de progresso e confirmação obrigatória ao excluir tarefa que possui subtarefas
- [x] Recorrência previsível e idempotente (`diária`, `semanal`, `mensal`) com ID determinístico (`rec_<seriesId>_<YYYY-MM-DD>`), sem duplicar ao recarregar ou alternar conclusão
- [x] Datas de prazo interpretadas e exibidas consistentemente no fuso horário local (`parseLocalYMD`)
- [x] Reordenação de tarefas por drag-and-drop (Pointer Events) e alternativa acessível por botões `↑`/`↓`, além de filtro (`todas`/`abertas`/`feitas`)
- [x] Paginação de segurança (`SAFE_RENDER_LIMIT = 150` com botão `"Carregar mais"`) para listas com mais de ~200 itens

---

## 8. Fase 2 — Inbox Rápida, Command Palette, Atalhos e Home Ampliada
- [x] Inbox rápida (`#/inbox`), botão flutuante global (FAB) visível e atalho `c` (fora de campos de texto)
- [x] Conversão de item da Inbox em tarefa de projeto existente ou em novo projeto local (`status: ideia`), além de editar, concluir e excluir com Undo
- [x] Command Palette (`Ctrl/Cmd + K` e botão visível na barra superior no mobile): busca difusa em projetos, tarefas e notas; ações rápidas (nova tarefa, capturar na Inbox, mudar status, trocar tema/acento, exportar JSON e sincronizar cache da API do GitHub); foco controlado e restauração de foco ao fechar com `Escape`
- [x] Atalhos globais de teclado (`/`, `n`, `c`, `g h`, `g k`, `g i`, `?`) ignorados quando o foco está em `input`, `textarea`, `select`, `contenteditable`, com modal/palette abertos ou com teclas modificadoras
- [x] Home ampliada: filtros por prioridade, prazo, tarefas atrasadas e fixados; alternância `Grid` / `Lista` / `Kanban`; seções `"Continue de onde parou"`, `"Em foco"` (com conclusão direta da tarefa) e alerta de tarefas vencidas
- [x] Migração automática de esquema `v1 -> v2` com backup prévio em `localStorage`
