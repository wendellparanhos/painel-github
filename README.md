# 🚀 Painel GitHub — Central Pessoal de Projetos, Foco & Telemetria

> **Seu ecossistema de repositórios do GitHub transformado em um centro de comando visual, interativo e 100% local.**

O **Painel GitHub** é uma aplicação web de página única (*Single-Page Application*) com estética **"Dark Premium, Vidro e Luz"**, projetada para desenvolvedores que desejam organizar seus repositórios, planejar entregas, manter o foco diário com Pomodoro e visualizar sua consistência de código em tempo real — tudo direto no navegador, com zero dependências externas e privacidade total.

[![JavaScript Vanilla](https://img.shields.io/badge/JavaScript-ES_Modules-f7df1e?style=flat-square&logo=javascript&logoColor=000)](#arquitetura-e-tecnologias)
[![CSS3 Moderno](https://img.shields.io/badge/CSS3-Glassmorphism_%26_Tokens-8b5cf6?style=flat-square&logo=css3&logoColor=fff)](#experiencia-visual-e-performance-adaptativa)
[![GitHub API](https://img.shields.io/badge/GitHub-REST_API_v3-06b6d4?style=flat-square&logo=github&logoColor=fff)](#integracao-inteligente-com-o-github)
[![100% Local](https://img.shields.io/badge/Dados-100%25_Local-10b981?style=flat-square)](#seguranca-e-persistencia-de-dados)

---

## ✨ Destaques do Projeto

- **🎯 Gestão Completa de Projetos e Tarefas:** Sincroniza automaticamente seus repositórios públicos do GitHub (`wendellparanhos`) e permite enriquecê-los com status pessoais (`ideia`, `em andamento`, `pausado`, `concluído`, `arquivado`), tarefas com prioridade, prazos locais, subtarefas, recorrência automática (`diária`, `semanal`, `mensal`), notas em Markdown e linha do tempo de marcos.
- **🍅 Modo Foco (Pomodoro) & Modo Cinema (`#/focus`):** Temporizador circular SVG preciso baseado no relógio real do sistema (*wall-clock*), com máquina de estados explícita, detecção honesta de sessões interrompidas por recarregamento/suspensão, som ambiente procedural via Web Audio API (chuva suave e ruído marrom) e **Modo Cinema** livre de distrações.
- **🏅 Gamificação Consciente & Mascote Reativo (`#/achievements`):** Sistema idempotente de XP, níveis, ofensiva diária (*streak* no fuso local com regra documentada), metas semanais configuráveis, galeria de conquistas, celebração épica em tela cheia ao concluir projetos e mascote SVG reativo — tudo **100% opcional e desligável** nas Configurações.
- **🌌 Visualizações Interativas sob Demanda:**
  - **Bento Grid & Cartões 3D (`#/home`):** Anéis de atividade estilo Apple Watch (Tarefas, Commits e Foco real), gráfico Donut de status, barras de commits por semana, distribuição de linguagens, Heatmap 2D de 16 semanas e cartões com giro 3D acessível para concluir tarefas sem sair da tela inicial.
  - **Quadro Kanban (`#/kanban`):** Colunas por status com arrastar e soltar (*drag and drop*) no mouse, toque e teclado (`Alt + ◀/▶`).
  - **Galáxia de Projetos (`#/galaxy`):** Mapa espacial em Canvas 2D onde cada projeto orbita conforme sua atividade recente e estrelas.
  - **Grafo de Conexões (`#/graph`):** Rede física interativa conectando repositórios por linguagem principal, status e tópicos em comum.
  - **Modo Bolhas (`#/bubbles`):** Visualização orgânica com colisão suave proporcional ao volume de trabalho.
- **⚡ Produtividade por Teclado:** Paleta de Comandos global (`Ctrl/⌘ + K`) com busca difusa em projetos, tarefas e notas, além de captura rápida na Inbox (`C`) e atalhos estilo Vim/GitHub (`G H`, `G K`, `G F`, `G A`, `/`, `N`, `?`).

---

## 🧭 Visões e Rotas Disponíveis

| Rota | Tela | Descrição |
| :--- | :--- | :--- |
| `#/home` | **Projetos (Home)** | Painel Bento Grid com tarefas em foco, projeto recente, lista/grade/bolhas de repositórios e telemetria visual. |
| `#/project/:id` | **Detalhe do Projeto** | Visão dedicada com abas de Visão Geral, Tarefas (com subtarefas e recorrência), Notas em Markdown com pré-visualização lado a lado e Linha do Tempo. |
| `#/kanban` | **Quadro Kanban** | Gestão visual em 5 colunas de status com filtros combinados e suporte completo a teclado e toque. |
| `#/focus` | **Modo Foco (Pomodoro)** | Timer vinculado a projeto/tarefa, Modo Cinema, áudio procedural opcional e estatísticas de foco por projeto e tarefa. |
| `#/galaxy` | **Galáxia 2D** | Exploração espacial dos repositórios em Canvas 2D com zoom, filtro e painel de inspeção rápida. |
| `#/graph` | **Grafo de Conexões** | Grafo de força mostrando relações entre projetos por stack, status e tópicos. |
| `#/achievements` | **Conquistas & Ofensiva** | Barra de XP/nível, ofensiva (*streak*) no fuso local, metas semanais e medalhas desbloqueadas. |
| `#/inbox` | **Inbox Rápida** | Caixa de entrada para capturar ideias soltas a qualquer momento e convertê-las em tarefas ou projetos locais. |
| `#/settings` | **Configurações** | Personalização de tema, 6 cores de destaque, nível de efeitos visuais, gamificação, áudio, notificações e backup JSON. |

---

## ⌨️ Atalhos de Teclado

| Atalho | Ação |
| :--- | :--- |
| `Ctrl + K` ou `⌘ + K` | Abre a **Paleta de Comandos** e busca global |
| `/` | Foca o campo de busca da tela atual |
| `N` | Cria uma nova tarefa rapidamente |
| `C` | Abre o modal de captura rápida na **Inbox** |
| `G` depois `H` | Ir para **Projetos (Home)** (`#/home`) |
| `G` depois `K` | Ir para o **Quadro Kanban** (`#/kanban`) |
| `G` depois `F` | Ir para o **Modo Foco / Pomodoro** (`#/focus`) |
| `G` depois `A` | Ir para **Conquistas & Ofensiva** (`#/achievements`) |
| `G` depois `X` | Ir para a **Galáxia de Projetos** (`#/galaxy`) |
| `G` depois `G` | Ir para o **Grafo de Conexões** (`#/graph`) |
| `G` depois `I` | Ir para a **Inbox** (`#/inbox`) |
| `Alt + ◀ / ▶` | Move o cartão focado entre colunas no Kanban |
| `?` | Abre o guia rápido de atalhos de teclado |
| `Esc` | Fecha modais, paleta de comandos ou sai do Modo Cinema |

---

## 🎨 Experiência Visual e Performance Adaptativa

O motor gráfico (`js/fx/effects.js`) monitora continuamente a taxa de quadros por segundo (FPS) com histerese e adapta os efeitos automaticamente em três níveis configuráveis:

1. **Completo:** Aurora reativa sincronizada ao status dominante dos projetos, partículas sutis em Canvas, spotlight e inclinação 3D nos cartões, botões magnéticos e animações de entrada.
2. **Reduzido:** Desativa partículas contínuas e inclinação 3D, mantendo transições suaves e visual de vidro (*glassmorphism*) otimizado.
3. **Mínimo:** Zero loops de `requestAnimationFrame` decorativos e zero transições pesadas — ativado automaticamente quando o sistema operacional solicita redução de movimento (`prefers-reduced-motion: reduce`).

---

## 🛡️ Segurança, Honestidade de Dados e Persistência

- **Separação Estrita de Dados:** Metadados públicos (estrelas, forks, linguagem, último push e eventos recentes) vêm da API do GitHub com cache inteligente e controle de limite de requisições (`X-RateLimit-*`). Seus dados pessoais (status, tarefas, notas, sessões de foco e conquistas) vivem exclusivamente no seu navegador (`localStorage`).
- **Telemetria Honesta:** Quando os eventos públicos do GitHub ainda não foram carregados ou você está sem internet, os gráficos e o Heatmap 2D exibem explicitamente o estado **"Indisponível"**, nunca inventando zeros falsos.
- **Anti-XSS Nativo:** O renderizador Markdown (`js/utils/markdown.js`) constrói nós seguros via DOM API com lista de permissões estrita (`http:`, `https:`, `mailto:`), bloqueando qualquer injeção de HTML ou `javascript:`.
- **Migrações com Backup Automático:** O armazenamento local possui versionamento de esquema (`v1 → v2 → v3`), criando snapshots preventivos antes de cada migração ou importação de arquivo JSON e oferecendo **Desfazer (Undo)** para ações destrutivas.

---

## 🛠️ Como Executar Localmente

Como o projeto utiliza **ES Modules nativos** (`<script type="module">`), basta servi-lo por qualquer servidor HTTP estático local (o protocolo `file://` bloqueia imports de módulos por segurança padrão dos navegadores):

### Opção 1 — Usando Node.js (npx)
```bash
npx serve . -l 8080
```

### Opção 2 — Usando Python
```bash
python -m http.server 8080
```

Depois, abra no navegador:
👉 **`http://localhost:8080`**

---

## 📂 Estrutura de Diretórios

```text
├── index.html                  # Shell semântico da aplicação e carregamento inicial
├── css/
│   ├── tokens.css              # Variáveis de design, temas (escuro/claro) e 6 paletas de destaque
│   ├── base.css                # Reset moderno, tipografia e aurora de fundo
│   ├── layout.css              # Cabeçalho, dock mobile, container principal e FAB da Inbox
│   ├── components.css          # Botões, cartões de vidro, badges, modais, toasts e inputs
│   └── views.css               # Estilos das views, Bento Grid, Kanban, Foco, Cinema e Conquistas
├── js/
│   ├── app.js                  # Ponto de entrada (bootstrap), rotas e eventos globais
│   ├── router.js               # Roteador SPA baseado em hash com lazy loading via import()
│   ├── store/
│   │   ├── store.js            # Store reativo central, máquina de estados do Foco e Undo parcial
│   │   └── storage.js          # Persistência em localStorage, migrações v1→v3 e exportação JSON
│   ├── services/
│   │   ├── github.js           # Cliente da GitHub API com cache, ETag/rate-limit e modo offline
│   │   ├── feedback.js         # Web Audio API (sons e ambiente), vibração tátil e celebrações
│   │   └── notifications.js    # Notificações locais com permissão contextual explicativa
│   ├── components/
│   │   ├── nav.js              # Barra superior, dock animada, pill de XP/Streak e FAB
│   │   ├── charts.js           # Anéis Apple Watch, Donut, Commits/semana, Linguagens e Heatmap 2D
│   │   ├── mascot.js           # Mascote SVG reativo opcional (foco, comemoração e descanso sem culpa)
│   │   ├── palette.js          # Command Palette (Ctrl+K) com busca difusa e ações rápidas
│   │   ├── modal.js            # Modais acessíveis com focus trap e restauração de foco
│   │   └── toast.js            # Notificações visuais rápidas com suporte a botão Desfazer
│   ├── views/
│   │   ├── home.js             # Bento Grid inicial, filtros avançados e cartões com Flip 3D
│   │   ├── project.js          # Detalhe do projeto, subtarefas, recorrência, notas e marcos
│   │   ├── kanban.js           # Quadro Kanban interativo (mouse, toque e teclado)
│   │   ├── focus.js            # Modo Foco (Pomodoro), Modo Cinema e estatísticas de tempo
│   │   ├── achievements.js     # Galeria de conquistas, progresso de nível, XP e ofensiva (streak)
│   │   ├── galaxy.js           # Visualização Galáxia 2D em Canvas (carregada sob demanda)
│   │   ├── graph.js            # Visualização Grafo de Conexões em Canvas (carregada sob demanda)
│   │   ├── bubbles.js          # Visualização Modo Bolhas (carregada sob demanda)
│   │   ├── inbox.js            # Captura rápida de ideias e conversão em tarefas/projetos
│   │   └── settings.js         # Painel de configurações, diagnóstico de performance e backups
│   ├── fx/
│   │   └── effects.js          # Motor de efeitos adaptativos, monitor de FPS com histerese e Canvas
│   └── utils/
│       ├── domain.js           # Funções puras de domínio, datas locais, métricas, foco e conquistas
│       ├── cover.js            # Gerador determinístico de capas em SVG/Canvas
│       ├── markdown.js         # Parser Markdown seguro baseado em DOM (anti-XSS)
│       ├── shortcuts.js        # Gerenciador global de atalhos de teclado
│       ├── formatters.js       # Formatação de números e datas relativas em pt-BR
│       ├── dom.js              # Utilitários de acessibilidade e gerenciamento de foco
│       └── uuid.js             # Geração de identificadores únicos locais
└── docs/
    ├── STATE.md                # Documentação do esquema de estado e migrações
    └── SMOKE-TESTS.md          # Checklist de validação manual e testes automatizados
```

---

Desenvolvido por **Wendell Paranhos** · Feito com HTML5, CSS3 e JavaScript puro.
