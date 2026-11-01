# Estado do Projeto — Painel de Projetos

## Fase Atual: Fase 6 — Portfólio, sincronização, PWA e deploy (Concluída ✅)

### Histórico de Fases:
- [x] **Fase 1**: Núcleo funcional + base visual (`#/home`, `#/project/:id`, `#/settings`, GitHub API + cache resiliente, status com histórico, tarefas básicas, notas Markdown seguras, temas/acentos/efeitos, import/export JSON v1).
- [x] **Fase 2**: Gestão completa (Abas na página do projeto com indicador deslizante, Atividade com commits/PRs/issues isolados, Timeline híbrida Remoto/Local, Kanban `#/kanban`, Tarefas avançadas com subtarefas e recorrência idempotente, Inbox rápida `#/inbox` + FAB + conversões, Command Palette `Ctrl/Cmd+K`, Atalhos de teclado globais, Pin/Ocultar/Personalizar projetos, Home com "Continue de onde parou", "Em foco", alertas de atraso e alternância Grid/Lista/Kanban).
- [x] **Fase 3**: Visual de impacto e visualizações (Monitor de FPS com histerese e toast Reverter, loop compartilhado + limpeza por view `cleanupViewEffects`, resolução adaptativa de Canvas `DPR ≤ 2`, perfis mobile/desktop, Sparklines nos cards apenas com amostra suficiente, Anéis Apple Watch com foco vazio até Fase 4, Donut de status, Commits por semana, Barra de linguagens empilhada SVG, Heatmap 2D com estado Indisponível honesto, Bento Grid consolidada na Home, Aurora reativa + horário do dia, Borda giratória `@property`, Flip 3D acessível nos cards, Dock desktop em onda, Partículas/Grade 3D opcionais, e visualizações carregadas sob demanda via `import()`: Galáxia `#/galaxy`, Grafo `#/graph` e Modo Bolhas `#/bubbles`).
- [x] **Fase 4**: Foco, gamificação e notificações (Modo Foco/Pomodoro `#/focus` com máquina de estados explícita `idle`/`running`/`paused`/`completed`/`interrupted`, cálculo por relógio de parede `expectedEndAt - Date.now()`, proteção contra reload/aba oculta/mudança de fuso sem auto-concluir sessão ambígua, sessões com ID idempotente, Modo Cinema com saída por `Esc` e botão visível, Web Audio API e haptics opt-in desligados por padrão, Anel de Foco da Home ligado aos dados reais, Gamificação desligável por completo com XP idempotente `xpGrants`, Níveis + Level Up, Streak com regra documentada de fuso local e metas semanais, Galeria de Conquistas `#/achievements`, Celebração épica com fogos em tela cheia ao concluir projeto, Mascote SVG reativo opcional sem culpa por inatividade, e Notificações Locais `Notification` API com pedido contextual e degradação graciosa, migração `v2 -> v3`).
- [x] **Fase 5**: Inteligência e integrações (Sub-requisições técnicas do GitHub sob demanda com fila limitada a 2 concorrentes, Releases, GitHub Actions e README/Licença com isolamento de falha e princípio "Indisponível não é falha", Status de CI nos cards e detalhe do projeto, Timeline enriquecida com Releases e Builds, Fórmula pura de Saúde Heurística `v1.0.0` com pesos normalizados e teste de cobertura `< 50%`, Detector de Abandono não-destrutivo com sugestões conscientes, Alertas consolidados na Home, Relatório Semanal comparativo em `#/reports`, Linha do tempo e Radar de uso por linguagem com portões de amostra e aviso metodológico de não inferência de proficiência, Resumo com IA opcional desligado por padrão, opt-in com prévia transparente de JSON e allowlist estrita sem notas/tarefas/segredos, chave no navegador fora do backup JSON, resposta sanitizada como texto não confiável, migração de esquema `v3 -> v4`).
- [x] **Fase 6**: Portfólio, sincronização, PWA e deploy (Exportação de página HTML estática e autônoma de portfólio com allowlist estrita de metadados públicos e bloqueio garantido de notas/tarefas/tokens/segredos testado com dados-canário; Cartões compartilháveis em Canvas 2D em alta resolução de 1200×630px para Resumo da Semana e Destaque de Projeto com anel de saúde v1.0.0; Relatório semanal exportável em Markdown `.md` e folha de impressão `@media print` otimizada para A4; Sincronização em nuvem opcional via Gist privado `panel-sync-data.json` com consentimento explícito, reconciliação por registro, tombstones `_deleted: true` e detecção de conflitos simultâneos com backup preventivo; PWA com `manifest.webmanifest`, `sw.js` com cache versionado `panel-cache-v6.0` e estratégia diferenciada Stale-While-Revalidate para assets locais vs Network-First para a API do GitHub, indicador em tempo real de status online/offline no cabeçalho e notificação não destrutiva de atualização; 4 novos temas acessíveis `cyber`, `aurora`, `vaporwave` e `mono` com contraste WCAG AA verificado; Onboarding interativo de 3 passos e empty states ilustrados em SVG; CSP estrita compatível com GitHub Pages e deploy configurado em `wendellparanhos.github.io/painel-github`).

### Decisões Arquiteturais (Fases 1 a 6):
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
5. **Concorrência Bounded de Sub-requisições GitHub e Isolamento de Falhas (`js/services/github.js`)**:
   - Releases, GitHub Actions e README são buscados exclusivamente sob demanda quando o usuário abre o projeto.
   - Sub-requisições passam por fila interna com limite de concorrência (`MAX_CONCURRENT_SUBREQUESTS = 2`) para evitar esgotamento de conexões ou rajadas de rate-limit. Cada endpoint possui cache próprio em memória (`repoTechCache`) e persistência segura em `state.githubCache.repoTech[id]`.
6. **Princípio "Indisponível Não É Falha" (`classifyActionsRuns`)**:
   - Se o token não tiver escopo para Actions, se o endpoint falhar por timeout ou se o repositório não possuir workflows, o status NUNCA se torna vermelho ("falha") nem zero. É rotulado semanticamente como `Indisponível` (⚪) ou `Sem permissão` (🔒). Apenas builds com conclusão confirmada (`failure`, `timed_out`, `startup_failure`) geram status de falha.
7. **Fórmula Pura e Determinística de Saúde Heurística `v1.0.0` (`computeProjectHealth`)**:
   - Não consulta APIs ou estado global; recebe apenas `(project, techEntry, nowMs)`.
   - Normaliza pesos apenas sobre fatores conhecidos; dados ausentes não penalizam o score.
   - Cobertura `< 50%` reduz confiança para `baixa` e desativa comparabilidade (`isComparable = false`), com exibição de anel tracejado.
8. **Detector de Abandono Não-Destrutivo (`evaluateProjectAbandonment`)**:
   - Nunca altera o status do repositório; apenas sinaliza e oferece ações conscientes (retomar, pausar, arquivar, adiar com cooldown de 14 dias, isentar ou ignorar). Projetos marcados com `exemptFromAbandonment` ou arquivados/concluídos são ignorados pela avaliação.
9. **Portões Estatísticos nos Relatórios (`computeLanguageTimelineAnalysis` & `computeSkillsRadarAnalysis`)**:
   - Só renderizam polígonos e séries temporais quando a amostra é estatisticamente viável (≥ 3 projetos em 2 semestres; ≥ 3 linguagens distintas). Caso contrário, exibem caixa de aviso explicando os requisitos da amostra.
   - O radar rotula explicitamente os dados como "Índice Relativo de Presença no Painel", com aviso de que não mede proficiência técnica real.
10. **Resumo com IA Opcional, Chave Local e Allowlist Estrita (`js/services/ai.js`)**:
    - Opt-in obrigatório (`aiEnabled: false`, `aiConsentGiven: false`). Nenhuma requisição sai do aparelho sem consentimento.
    - Modal de pré-visualização exibe o JSON exato e o endpoint antes do envio.
    - Allowlist estrita proíbe notas privadas (`note`), tarefas pessoais (`tasks`), tokens (`ghp_*`, `sk-*`, `AIza*`) e arquivos completos.
    - Chave de API mantida em chave isolada do `localStorage` (`panel_ai_api_key_v1`), explicitamente excluída do backup exportável em JSON. Resposta sanitizada contra injeção de HTML/scripts e tratada como texto não confiável (`textContent`).
11. **Modo Portfólio Estático e Auditoria de Segredos (`js/services/portfolio.js`)**:
    - Gera um arquivo `portfolio.html` 100% autônomo com estilos CSS embutidos, responsivo e com zero dependências externas ou scripts inseguros.
    - Utiliza uma allowlist estrita de campos (`PORTFOLIO_ALLOWLIST_FIELDS`), permitindo apenas metadados públicos e escolhas do usuário.
    - Executa auditoria em tempo de execução com verificação por regex contra chaves, tokens e dados privados (`auditPortfolioPayloadForSecrets`), com cobertura de teste automatizado usando dados-canário.
12. **Cartões Compartilháveis em Canvas 2D (`js/services/share-card.js`)**:
    - Gera imagens estáticas em 1200×630px (proporção padrão Open Graph) renderizadas diretamente no navegador via Canvas 2D.
    - Duas opções de cartão: Resumo da Semana (4 KPIs, ritmo e branding) e Destaque de Projeto (com anel de saúde visual v1.0.0, tags e métricas públicas).
    - Suporte a download de arquivo PNG e cópia direta para o clipboard do sistema operacional via `navigator.clipboard.write([new ClipboardItem(...)])` com fallback gracioso.
13. **Relatório em Markdown e Folha de Impressão A4 (`css/print.css` & `js/services/portfolio.js`)**:
    - Exportação do relatório semanal em arquivo `.md` estruturado com tabelas, marcos e métricas semanais.
    - Estilo dedicado `@media print` (`css/print.css`) que oculta barra de navegação, dock, FAB da inbox e botões, ajusta contraste de texto para impressão econômica e aplica `break-inside: avoid;` em seções analíticas.
14. **Sincronização em Nuvem via Gist Privado com Reconciliação por Registro e Tombstones (`js/services/sync.js`)**:
    - Sincronização 100% opt-in e desligada por padrão, utilizando um Gist privado do próprio usuário nomeado `panel-sync-data.json`.
    - Token do GitHub (`ghp_` ou `github_pat_`) mantido estritamente no dispositivo em chave isolada (`panel_gist_sync_token_v1`) e nunca exportado no payload ou backup.
    - Reconciliação inteligente por registro: cada entidade possui `updatedAt`; deleções são propagadas por tombstones explícitos (`_deleted: true`). Conflitos simultâneos em múltiplos dispositivos acionam backup automático antes de mesclar ou solicitar confirmação.
15. **PWA, Service Worker e Cache Diferenciado (`sw.js`, `manifest.webmanifest`, `js/app.js`)**:
    - Manifest web completo (`manifest.webmanifest`) configurado para modo `standalone`, ícones maskable SVG e tema visual `#090d16`.
    - Service Worker (`sw.js`) versionado (`panel-cache-v6.0`) com estratégia de cache separada: *Stale-While-Revalidate* para assets locais estáticos e *Network-First* para requisições da API do GitHub, nunca mantendo dados do GitHub em cache-first sem revalidação.
    - Limpeza garantida de caches obsoletos no evento `activate` e atualização sob demanda via `skipWaiting`.
    - Indicador visual em tempo real no cabeçalho com status `Online` (verde) e `Offline` (âmbar), além de toasts informativos ao alternar conectividade.
16. **4 Novos Temas Acessíveis (`css/tokens.css`) e Onboarding Interativo (`js/components/onboarding.js`)**:
    - Adição de 4 novos temas visuais: `cyber` (preto profundo e neon azul/rosa), `aurora` (verde esmeralda e ciano místico), `vaporwave` (tons pastéis roxo/magenta) e `mono` (alto contraste minimalista preto e branco), todos verificados contra critérios de contraste WCAG AA.
    - Tour de boas-vindas interativo em 3 passos destacando a Bento Grid, a Paleta de Comandos (`Ctrl+K`) e a Inbox Rápida (`C`), com acionamento não intrusivo na primeira visita e botão nas Configurações para reiniciar a qualquer momento.

### Como Executar Localmente:
Qualquer servidor HTTP estático na raiz do projeto.
Exemplo:
```bash
python -m http.server 8080
```
Abrir `http://localhost:8080` no navegador.
