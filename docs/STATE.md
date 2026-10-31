# Estado do Projeto — Painel de Projetos

## Fase Atual: Fase 4 — Foco, gamificação e notificações (Concluída ✅)

### Histórico de Fases:
- [x] **Fase 1**: Núcleo funcional + base visual (`#/home`, `#/project/:id`, `#/settings`, GitHub API + cache resiliente, status com histórico, tarefas básicas, notas Markdown seguras, temas/acentos/efeitos, import/export JSON v1).
- [x] **Fase 2**: Gestão completa (Abas na página do projeto com indicador deslizante, Atividade com commits/PRs/issues isolados, Timeline híbrida Remoto/Local, Kanban `#/kanban`, Tarefas avançadas com subtarefas e recorrência idempotente, Inbox rápida `#/inbox` + FAB + conversões, Command Palette `Ctrl/Cmd+K`, Atalhos de teclado globais, Pin/Ocultar/Personalizar projetos, Home com "Continue de onde parou", "Em foco", alertas de atraso e alternância Grid/Lista/Kanban).
- [x] **Fase 3**: Visual de impacto e visualizações (Monitor de FPS com histerese e toast Reverter, loop compartilhado + limpeza por view `cleanupViewEffects`, resolução adaptativa de Canvas `DPR ≤ 2`, perfis mobile/desktop, Sparklines nos cards apenas com amostra suficiente, Anéis Apple Watch com foco vazio até Fase 4, Donut de status, Commits por semana, Barra de linguagens empilhada SVG, Heatmap 2D com estado Indisponível honesto, Bento Grid consolidada na Home, Aurora reativa + horário do dia, Borda giratória `@property`, Flip 3D acessível nos cards, Dock desktop em onda, Partículas/Grade 3D opcionais, e visualizações carregadas sob demanda via `import()`: Galáxia `#/galaxy`, Grafo `#/graph` e Modo Bolhas `#/bubbles`).
- [x] **Fase 4**: Foco, gamificação e notificações (Modo Foco/Pomodoro `#/focus` com máquina de estados explícita `idle`/`running`/`paused`/`completed`/`interrupted`, cálculo por relógio de parede `expectedEndAt - Date.now()`, proteção contra reload/aba oculta/mudança de fuso sem auto-concluir sessão ambígua, sessões com ID idempotente, Modo Cinema com saída por `Esc` e botão visível, Web Audio API e haptics opt-in desligados por padrão, Anel de Foco da Home ligado aos dados reais, Gamificação desligável por completo com XP idempotente `xpGrants`, Níveis + Level Up, Streak com regra documentada de fuso local e metas semanais, Galeria de Conquistas `#/achievements`, Celebração épica com fogos em tela cheia ao concluir projeto, Mascote SVG reativo opcional sem culpa por inatividade, e Notificações Locais `Notification` API com pedido contextual e degradação graciosa, migração `v2 -> v3`).

### Decisões Arquiteturais (Fases 1 a 4):
1. **Máquina de Estados Explícita do Timer e Precisão por Relógio (`js/store/store.js` & `js/views/focus.js`)**:
   - Estados válidos: `idle`, `running`, `paused`, `completed`, `interrupted`, com transições validadas por `canTransitionFocusTimer(from, to)`.
   - O tempo restante é sempre recalculado por `expectedEndAt - Date.now()`, nunca confiando em contagem de ticks de `setInterval`.
   - Em caso de reload com sessão expirada (`expired_while_away`), suspensão prolongada ou mudança de relógio/fuso (`clock_inconsistency` / `timezone_changed`), o timer transiciona para `interrupted` e solicita confirmação explícita do usuário (retomar, registrar tempo parcial/concluído ou descartar), sem nunca registrar sessões ambíguas silenciosamente.
2. **Idempotência Estrita de Sessões e de XP (`js/store/store.js` & `js/utils/domain.js`)**:
   - Cada sessão de foco possui um `sessionId` único; chamadas repetidas a `FOCUS_COMPLETE_SESSION` (duplo clique ou corrida com reload) nunca duplicam a sessão no histórico nem o XP concedido.
   - Toda concessão de XP é indexada em `state.gamification.xpGrants` por chave determinística (`task:<taskId>`, `focus:<sessionId>`, `project:<repoId>`). Reabrir e concluir novamente uma tarefa ou alternar o status de um projeto entre `em andamento` e `concluído` nunca concede XP duas vezes.
3. **Streak com Chave Única de Dia Civil Local e Proteção de Fuso (`evaluateStreakOnActivity`)**:
   - Usa `getTodayLocalISO()` (`YYYY-MM-DD` no fuso local declarado) como chave única diária.
   - Se o usuário viajar e mudar de fuso horário (`timezoneOffset`), preserva o histórico passado sem recalculá-lo silenciosamente e tolera a transição de fuso sem quebrar a sequência.
4. **Gamificação 100% Desligável, Áudio/Haptics Opt-In e Notificações Contextuais (`js/services/feedback.js` & `js/services/notifications.js`)**:
   - Desativar `gamificationEnabled` oculta imediatamente o pill de XP/streak no header, a rota de Conquistas na navegação, o mascote SVG, toasts de XP e modais de Level Up/Celebração.
   - `AudioContext` (Web Audio API) só é instanciado após gesto explícito do usuário e vem desligado por padrão (`soundEnabled: false`, `ambientSound: 'off'`), assim como `hapticsEnabled: false`.
   - Notificações locais (`Notification` API) só pedem permissão após clique contextual que explica o benefício em modal, degradam sem erro quando negadas/inexistentes e documentam na UI a dependência de navegador/aba ativa.

### Como Executar Localmente:
Qualquer servidor HTTP estático na raiz do projeto.
Exemplo:
```bash
python -m http.server 8080
```
Abrir `http://localhost:8080` no navegador.
