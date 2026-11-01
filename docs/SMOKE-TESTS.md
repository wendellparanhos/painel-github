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

---

## 13. Fase 5 — Dados Técnicos GitHub, Fila Concorrente e Princípio "Indisponível Não É Falha"
- [x] Sub-requisições técnicas do GitHub (Releases, GitHub Actions, README e Licença) executadas **estritamente sob demanda** ao abrir a página do projeto ou por ação explícita do usuário, nunca disparadas em lote para todos os repositórios na inicialização
- [x] Fila interna com limite de concorrência (`MAX_CONCURRENT_SUBREQUESTS = 2`) para sub-requisições secundárias, evitando esgotamento de conexões ou rajadas de rate-limit
- [x] Cache em memória e persistência em `state.githubCache.repoTech[id]` com controle de erro isolado por endpoint: falha em um endpoint (ex.: releases 404) não impede o carregamento dos demais (Actions ou README)
- [x] **Princípio "Indisponível não é falha"**: se o GitHub Actions não foi consultado, se o token não possui permissão (`permission_denied`) ou se a API retornou rate limit (`rate_limit`) ou offline, o status do build é exibido como `Indisponível` (⚪) ou `Sem permissão` (🔒), **NUNCA como build quebrado ("falhou") nem zero falso**
- [x] Status do build de CI exibido no card do projeto e no cabeçalho da página de detalhe com ícone e texto acessível: Verde (sucesso), Vermelho (falha confirmada apenas quando `conclusion === 'failure'`), Amarelo (em andamento ou cancelado), Cinza/Neutro (sem workflows ou indisponível)
- [x] Timeline do projeto enriquecida com eventos remotos de Releases (`Remoto · Release GitHub`) e execuções de GitHub Actions (`Remoto · Build Actions`) mesclados aos marcos locais

---

## 14. Fase 5 — Saúde Heurística (v1.0.0), Detector de Abandono, Relatórios e IA Opcional
- [x] **Saúde do Projeto (`computeProjectHealth`)**: função pura, determinística e versionada (`HEALTH_FORMULA_VERSION = '1.0.0'`) calculando pontuação de 0 a 100 com fatores documentados (Atividade Recente 25, Tarefas Atrasadas 25, Issues 15, README 8, Licença 7, CI 12, Releases 8)
- [x] Descrita como indicador heurístico do painel (não medida de qualidade de código); normaliza pesos apenas entre fatores disponíveis quando endpoints falharem; se a cobertura for `< 50%`, confiança é reduzida para `baixa` e o projeto é marcado como não comparável (`isComparable: false`) com anel tracejado
- [x] Anel de saúde visual nos cartões da Home, badge na página do projeto, ordenação por saúde e auréola/brilho correspondente na Galáxia (`#/galaxy`), com modal interativo de explicação da fórmula acessível por clique no anel
- [x] **Detector de Abandono (`evaluateProjectAbandonment`)**: avalia projetos ativos sem atividade recente acima do limite configurado (padrão 45 dias, cooldown de 14 dias); **NUNCA altera o status sozinho** e oferece ações conscientes (retomar, pausar, arquivar, adiar 14 dias, isentar `exemptFromAbandonment` ou ignorar alerta)
- [x] Alertas consolidados na Home combinando tarefas vencidas, builds com falha confirmada (apenas `available` + `failure`) e projetos parados pelo detector de abandono
- [x] **Relatório Semanal (`#/reports`)**: KPIs comparando os últimos 7 dias com a janela anterior de 7 dias (tarefas concluídas, tempo de foco, commits públicos e conquistas), gráfico de ritmo diário e síntese executiva textual honesta
- [x] **Portões Estritos de Amostra**: Linha do tempo de linguagens (≥ 3 repositórios em ≥ 2 semestres) e Radar de habilidades (≥ 3 linguagens distintas); quando a amostra é insuficiente, exibe caixa explicativa sem quebrar o layout; o radar traz aviso metodológico explícito de que não mede proficiência técnica real
- [x] **Resumo com IA Opcional (`js/services/ai.js`)**: desligado por padrão (`aiEnabled: false`, `aiConsentGiven: false`); opt-in com pré-visualização completa do payload JSON e endpoint antes do envio
- [x] **Allowlist Estrita de Privacidade**: payload contém apenas metadados públicos e títulos curtos de commits/PRs/issues; notas privadas, tarefas pessoais e tokens são filtrados e auditados contra vazamento; chave de API mantida apenas no aparelho (`panel_ai_api_key_v1`) e excluída do backup JSON
- [x] Resposta da IA tratada como **texto não confiável** (sanitizada contra injeção de HTML e inserida estritamente via `textContent`); tratamento robusto de erros (sem consentimento, chave ausente, falta de evidência mínima para não alucinar, quota HTTP 429, timeout e JSON corrompido); botão para excluir o resumo gerado a qualquer momento
- [x] Migração automática de esquema de dados `v3 -> v4` executada com sucesso e com backup preventivo antes da alteração


---

## 15. Fase 6 — Modo Portfólio Estático, Cartões Canvas e Relatórios
- [x] **Exportação de Portfólio HTML Estático (`js/services/portfolio.js`)**: gera página autônoma e completa com CSS embutido, responsiva, com visual profissional e zero scripts maliciosos ou dependências externas
- [x] **Allowlist Estrita & Teste com Dados-Canário**: exportação inclui apenas metadados públicos permitidos (`PORTFOLIO_ALLOWLIST_FIELDS`) e campos selecionados pelo usuário; **zero vazamento** de notas privadas (`note`), tarefas pessoais (`tasks`), tokens (`ghp_*`) ou credenciais, auditado e validado por teste automatizado
- [x] **Seleção de Projetos e Metadados**: modal com checkboxes para escolher quais projetos exportar e quais informações exibir (linguagem, estrelas, forks, links do GitHub/demo e status)
- [x] **Pré-visualização e Download**: opção de pré-visualizar o portfólio em nova aba (`blob:text/html`) e fazer o download direto de `portfolio.html`
- [x] **Cartões Compartilháveis em Canvas 2D (`js/services/share-card.js`)**: renderização de imagens em 1200×630px para redes sociais com alta definição (2x scaling)
- [x] **Cartão Resumo da Semana**: 4 KPIs principais (tarefas concluídas, tempo de foco, commits públicos e conquistas da semana), indicador de ritmo e identidade visual elegante
- [x] **Cartão Destaque de Projeto**: capa personalizada, anel de saúde visual v1.0.0 com score e confiabilidade, métricas públicas e tópicos/linguagens
- [x] **Exportação de Imagens**: botões para download em formato PNG de alta resolução e cópia direta para o clipboard do sistema operacional via `navigator.clipboard.write` com feedback visual em toast
- [x] **Relatório em Markdown (`.md`)**: download do relatório semanal com métricas, resumo executivo, tabela de projetos ativos e tarefas da semana estruturadas
- [x] **Folha de Estilos para Impressão (`css/print.css`)**: `@media print` otimizado para formato A4 que oculta cabeçalho, dock, FAB, modais e botões interativos, quebra páginas de forma limpa (`break-inside: avoid;`) e converte o layout para contraste adequado em papel

---

## 16. Fase 6 — Sincronização Gist, PWA Offline, Temas e Deploy
- [x] **Sincronização em Nuvem Opcional via Gist (`js/services/sync.js`)**: 100% desligada por padrão, exige consentimento explícito e token pessoal do GitHub com escopo `gist`
- [x] **Segurança de Credenciais no Sync**: token mantido exclusivamente no dispositivo (`panel_gist_sync_token_v1`) e nunca trafegado nem gravado dentro do arquivo de sincronização `panel-sync-data.json`
- [x] **Reconciliação por Registro e Tombstones**: mesclagem inteligente baseada em timestamp (`updatedAt`) para cada projeto; exclusões propagadas com tombstones (`_deleted: true`), sem "última escrita vence" às cegas
- [x] **Detecção de Conflitos e Backup Preventivo**: backup automático salvo no `localStorage` antes de qualquer mesclagem remota; detecção de escritas simultâneas por múltiplos dispositivos
- [x] **PWA & Manifesto (`manifest.webmanifest`)**: configurado para modo `standalone`, nome e descrição em português, theme-color `#090d16`, atalhos de aplicativo e ícones maskable SVG
- [x] **Service Worker e Cache Versionado (`sw.js`)**: cache versionado (`panel-cache-v6.0`) com pré-cache dos 44 assets da aplicação e limpeza automática de versões obsoletas no `activate`
- [x] **Estratégia de Cache Diferenciada**: *Stale-While-Revalidate* para assets locais do painel (HTML/CSS/JS/SVG) e *Network-First / Network-Only* para requisições da API do GitHub, nunca mantendo dados do GitHub em cache-first cego
- [x] **Indicador de Conectividade em Tempo Real**: pill de status no cabeçalho com transição suave entre `Online` (verde) e `Offline` (âmbar), com toasts informativos em mudanças de estado
- [x] **Atualização Não Destrutiva**: notificação discreta quando uma nova versão do Service Worker estiver instalada aguardando ativação (`skipWaiting`)
- [x] **4 Novos Temas Acessíveis (`css/tokens.css`)**: `cyber` (cyberpunk neon), `aurora` (verde místico e ciano), `vaporwave` (pastéis roxo e rosa) e `mono` (minimalista preto e branco de alto contraste), todos em conformidade com critérios WCAG AA
- [x] **Onboarding Interativo (`js/components/onboarding.js`)**: tour guiado de 3 passos destacando a Bento Grid, a Paleta de Comandos (`Ctrl+K`) e a Inbox Rápida (`C`), com disparo inteligente na primeira visita e botão nas Configurações
- [x] **Empty States Ilustrados (`js/components/empty-state.js`)**: ilustrações temáticas em SVG com mensagem amigável e botão de ação primária para busca sem resultados, repositórios vazios e inbox limpa
- [x] **Compatibilidade com GitHub Pages e CSP Estrita**: `Content-Security-Policy` declarada no `<head>` sem diretivas inseguras e compatível com hospedagem estática em subdiretório (`https://wendellparanhos.github.io/painel-github/`)
