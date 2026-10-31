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

---

## 9. Fase 3 — Performance Adaptativa, Gráficos e Efeitos de Interface
- [x] Monitor de FPS com histerese: exige queda sustentada (< 45 fps em ≥ 2 janelas consecutivas) e cooldown de 15s antes de rebaixar nível (`completo` → `reduzido` → `mínimo`), exibindo toast com botão `"Reverter"` e sem subir sozinho em loop
- [x] `prefers-reduced-motion: reduce` força nível `mínimo`, desliga movimento contínuo não essencial e não pode ser sobreposto por auto-detecção ou preferência salva
- [x] Loop de animação compartilhado pausa com aba oculta (`visibilitychange`) e libera todos os RAFs, `ResizeObserver`s e listeners ao sair da view (`cleanupViewEffects`)
- [x] Perfis `mobile` vs `desktop` (`data-device`) e `devicePixelRatio` limitado (`≤ 2`) em todos os Canvas
- [x] Anéis estilo Apple Watch: Tarefas do dia, Commits do dia e Foco (anel de foco explicitamente vazio até a Fase 4, sem valores fictícios)
- [x] Sparklines nos cards renderizadas somente quando há amostra suficiente em cache (zero requisições por card); Donut de status, Commits por semana e Barra de linguagens empilhada SVG que desenha ao entrar
- [x] Heatmap 2D de atividade pública do GitHub com tooltip, legenda, resumo textual acessível e estado `"Indisponível"` honesto (nunca exibido como zero falso)
- [x] Home em Bento Grid consolidada priorizando no celular: tarefa em foco, projeto recente (`Continue de onde parou`) e ações rápidas acima; gráficos secundários abaixo
- [x] Aurora reativa (gradiente CSS leve sincronizado ao status dominante + horário do dia), borda giratória (`@property` com fallback), Flip 3D opcional e acessível nos cards (frente: resumo; verso: tarefas rápidas), Dock desktop em onda e Partículas/Grade 3D desligadas em `reduzido`/`mínimo`

---

## 10. Fase 3 — Visualizações Especiais (Carregadas sob Demanda via `import()`)
- [x] Galáxia de projetos (`#/galaxy`, Canvas 2D): carregada sob demanda via `import()`; tamanho por atividade/estrelas, cor por status, brilho por saúde simples com legenda, órbitas por linguagem, pan/zoom/pinch-to-zoom, busca com destaque, botão recentralizar, resumo acessível ao tocar e lista alternativa completa para teclado/leitor de tela
- [x] Grafo de conexões (`#/graph`): carregado sob demanda via `import()`; arestas por linguagem/tópicos em comum com legenda explícita do critério (sem sugerir dependência real), nós arrastáveis, destaque de vizinhança, filtros contra excesso de arestas, lista alternativa e simulação física que **para completamente ao estabilizar** (0% CPU)
- [x] Modo Bolhas experimental (`#/bubbles` e seletor na Home): carregado sob demanda via `import()`; elementos flutuantes arrastáveis com limite de objetos, botão reorganizar, fallback imediato para Grid e física que para ao estabilizar (0% CPU)


---

## 11. Fase 4 — Modo Foco / Pomodoro (`#/focus`) e Precisão do Timer
- [x] Seleção de projeto e tarefa (com suporte a pré-seleção direta a partir da Home) e timer circular animado configurável (`Foco`, `Pausa Curta`, `Pausa Longa`) com botões contextuais de iniciar, pausar, retomar, pular e encerrar
- [x] Máquina de estados explícita (`idle`, `running`, `paused`, `completed`, `interrupted`) com validação de transições permitidas vs. proibidas (`canTransitionFocusTimer`)
- [x] Precisão pelo relógio de parede (`expectedEndAt - Date.now()`), nunca confiando em contagem de `setInterval`; recálculo imediato ao voltar de aba em segundo plano (`visibilitychange`)
- [x] Detecção de reload com sessão expirada (`expired_while_away`), suspensão prolongada ou mudança de horário/fuso do sistema (`clock_inconsistency` / `timezone_changed`): transiciona para `interrupted` e **exige confirmação explícita** (retomar, registrar tempo parcial/concluído ou descartar), sem nunca registrar sessão interrompida/ambígua automaticamente
- [x] Registro de sessões por tarefa e por projeto com **ID idempotente por sessão** (`sessionId`), evitando duplicação por duplo clique ou corrida entre reload e finalização
- [x] Anel de Foco nos Anéis estilo Apple Watch da Home conectado aos minutos reais de foco concluídos no dia (`computeDailyRingsData`)
- [x] **Modo Cinema**: esconde header, dock, FAB e painéis secundários, deixando apenas a tarefa ativa, o timer circular e fundo leve; saída garantida por tecla `Escape` e por botão visível (`✕ Sair do Modo Cinema`)
- [x] Sons ambiente procedurais (`Chuva Suave`, `Ruído Marrom`, `Brisa Rosa`) e efeitos sonoros simples via Web Audio API **desligados por padrão** (`AudioContext` instanciado somente após gesto do usuário); haptics (`navigator.vibrate`) estritamente opt-in

---

## 12. Fase 4 — Gamificação Idempotente, Conquistas (`#/achievements`) e Notificações Locais
- [x] Concessão de XP por ações significativas (`+15 XP` tarefa concluída, `+25 XP` sessão de foco concluída, `+100 XP` projeto concluído) usando **chave idempotente** (`xpGrants`: `task:<id>`, `focus:<sessionId>`, `project:<repoId>`) para que reabrir/concluir tarefa ou alternar status de projeto **nunca conceda XP duas vezes**
- [x] Níveis com barra de progresso de XP e modal de **Level Up**
- [x] Streak diário com regra documentada na UI: chave única de dia civil local (`YYYY-MM-DD`), fuso horário declarado e proteção contra mudança de fuso em viagem sem recalcular silenciosamente o histórico passado, além de metas semanais configuráveis
- [x] Galeria de Conquistas (`#/achievements`) com progresso individual (Primeira Entrega, 10 Tarefas no Dia, Foco Iniciado, Maratona de Foco 120m, Streak 3 e 7 dias, Primeiro Projeto Concluído, Portfólio de Elite)
- [x] Celebração épica ao concluir um projeto (`status: concluído`): fogos em tela cheia em Canvas adaptativo (respeitando `getFxLevel()` e `prefers-reduced-motion`), mensagem e som/vibração opcionais
- [x] Mascote SVG opcional (`CodeBuddy`) que reage ao dia (visor em foco, comemoração em dia ativo, ou cochilo tranquilo quando ausente por dias **sem gerar culpa por inatividade**), puramente cosmético e desligável
- [x] Desligar a gamificação nas Configurações (`gamificationEnabled: false`) oculta 100% da interface de gamificação (pill de XP/streak no header, link de Conquistas, mascote, toasts de XP e celebrações) sem afetar o restante do app
- [x] Notificações locais (`Notification` API) para fim de foco, prazos do dia e resumo diário opcional: permissão solicitada **somente após ação contextual** com modal explicando o benefício; degradação graciosa quando `Notification` não existir ou permissão for negada, sem bloquear o timer; documentação explícita de que notificações locais dependem do navegador/aba estar ativo
