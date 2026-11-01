# 🚀 Painel GitHub — Central Pessoal de Projetos, Foco & Telemetria

> **Seu ecossistema de repositórios do GitHub transformado em um centro de comando visual, interativo e 100% local.**

O **Painel GitHub** é uma aplicação web progressiva (*Progressive Web App - PWA*) com estética **"Dark Premium, Vidro e Luz"**, projetada para desenvolvedores que desejam organizar seus repositórios, planejar entregas, manter o foco diário com Pomodoro, visualizar sua consistência de código em tempo real e exportar portfólios estáticos profissionais — tudo direto no navegador, com zero dependências externas e privacidade total.

[![JavaScript Vanilla](https://img.shields.io/badge/JavaScript-ES_Modules-f7df1e?style=flat-square&logo=javascript&logoColor=000)](#arquitetura-e-tecnologias)
[![CSS3 Moderno](https://img.shields.io/badge/CSS3-Glassmorphism_%26_Tokens-8b5cf6?style=flat-square&logo=css3&logoColor=fff)](#experiencia-visual-e-performance-adaptativa)
[![GitHub API](https://img.shields.io/badge/GitHub-REST_API_v3-06b6d4?style=flat-square&logo=github&logoColor=fff)](#integracao-inteligente-com-o-github)
[![PWA Ready](https://img.shields.io/badge/PWA-Offline_First-5a67d8?style=flat-square&logo=pwa&logoColor=fff)](#pwa-service-worker-e-modo-offline)
[![100% Local](https://img.shields.io/badge/Dados-100%25_Local-10b981?style=flat-square)](#seguranca-e-persistencia-de-dados)
[![Deploy GitHub Pages](https://img.shields.io/badge/Deploy-GitHub_Pages-22c55e?style=flat-square&logo=githubpages&logoColor=fff)](https://wendellparanhos.github.io/painel-github/)

---

## 🌐 Demonstração Online (Deploy no GitHub Pages)

O projeto está pronto para publicação e hospedagem estática direta no **GitHub Pages**:

👉 **[wendellparanhos.github.io/painel-github](https://wendellparanhos.github.io/painel-github/)**

### Como Habilitar no Repositório do GitHub:
1. Acesse o repositório no GitHub: `https://github.com/wendellparanhos/painel-github`
2. Clique na aba **Settings** ⚙️
3. No menu lateral esquerdo, clique em **Pages**
4. Na seção **Build and deployment > Source**, selecione:
   - **Branch:** `main`
   - **Folder:** `/ (root)`
5. Clique em **Save**. O GitHub Pages estará ativo em instantes!

---

## ✨ Destaques do Projeto

- **🎯 Gestão Completa de Projetos e Tarefas:** Sincroniza automaticamente seus repositórios públicos do GitHub (`wendellparanhos`) e permite enriquecê-los com status pessoais (`ideia`, `em andamento`, `pausado`, `concluído`, `arquivado`), tarefas com prioridade, prazos locais, subtarefas, recorrência automática (`diária`, `semanal`, `mensal`), notas em Markdown e linha do tempo de marcos.
- **📁 Portfólio Estático Exportável (`js/services/portfolio.js`):** Gera uma página HTML independente, estática e com CSS embutido para compartilhar seu trabalho. Inclui seleção interativa de projetos e campos, prévia em nova aba e **garantia estrita anti-vazamento** (auditada contra notas privadas, tarefas pessoais, chaves ou tokens).
- **🖼️ Cartões Compartilháveis em Canvas 2D (`js/services/share-card.js`):** Renderiza imagens estáticas de alta qualidade (1200×630px em resolução 2x para redes sociais) com Resumo Semanal (4 KPIs) e Destaque de Projeto com anel de saúde visual v1.0.0, com download em PNG e cópia direta para o clipboard.
- **🖨️ Relatório em Markdown & Impressão/PDF (`css/print.css`):** Download direto do relatório semanal em formato `.md` e folha de estilo para impressão formatada para A4, ocultando ruídos de interface e ajustando contrastes.
- **☁️ Sincronização em Nuvem Opcional via Gist (`js/services/sync.js`):** Permite sincronizar tarefas e status entre computadores usando um Gist privado pessoal (`panel-sync-data.json`). Totalmente opcional, com reconciliação por registro baseada em `updatedAt`, tombstones `_deleted: true` e backup preventivo automático.
- **📱 PWA & Modo Offline Completo (`sw.js` & `manifest.webmanifest`):** Instale o painel como aplicativo no desktop ou celular. Service Worker com cache inteligente *Stale-While-Revalidate* para assets do painel e *Network-First* para chamadas do GitHub, com indicador em tempo real de conexão (`Online` / `Offline`).
- **🍅 Modo Foco (Pomodoro) & Modo Cinema (`#/focus`):** Temporizador circular SVG preciso baseado no relógio real do sistema (*wall-clock*), com máquina de estados explícita, detecção honesta de sessões interrompidas por recarregamento/suspensão, som ambiente procedural via Web Audio API (chuva suave e ruído marrom) e **Modo Cinema** livre de distrações.
- **🏅 Gamificação Consciente & Mascote Reativo (`#/achievements`):** Sistema idempotente de XP, níveis, ofensiva diária (*streak* no fuso local com regra documentada), metas semanais configuráveis, galeria de conquistas, celebração épica em tela cheia ao concluir projetos e mascote SVG reativo — tudo **100% opcional e desligável** nas Configurações.
- **🌌 Visualizações Interativas sob Demanda:**
  - **Bento Grid & Cartões 3D (`#/home`):** Anéis de atividade estilo Apple Watch (Tarefas, Commits e Foco real), gráfico Donut de status, barras de commits por semana, distribuição de linguagens, Heatmap 2D de 16 semanas e cartões com giro 3D acessível para concluir tarefas sem sair da tela inicial.
  - **Quadro Kanban (`#/kanban`):** Colunas por status com arrastar e soltar (*drag and drop*) no mouse, toque e teclado (`Alt + ◀/▶`).
  - **Galáxia de Projetos (`#/galaxy`):** Mapa espacial em Canvas 2D onde cada projeto orbita conforme sua atividade recente e estrelas.
  - **Grafo de Conexões (`#/graph`):** Rede física interativa conectando repositórios por linguagem principal, status e tópicos em comum.
  - **Modo Bolhas (`#/bubbles`):** Visualização orgânica com colisão suave proporcional ao volume de trabalho.
- **⚡ Produtividade por Teclado:** Paleta de Comandos global (`Ctrl/⌘ + K`) com busca difusa em projetos, tarefas e notas, além de captura rápida na Inbox (`C`) e atalhos estilo Vim/GitHub (`G H`, `G K`, `G F`, `G A`, `G R`, `/`, `N`, `?`).
- **🎨 4 Novos Temas Acessíveis:** Além dos temas Escuro, Claro e Sistema, inclui paletas especiais com contraste WCAG AA verificado: **Cyber** (neon cyberpunk), **Aurora** (verde esmeralda místico), **Vaporwave** (pastéis nostálgicos) e **Mono** (minimalismo de alto contraste).

---

## 🧭 Visões e Rotas Disponíveis

| Rota | Tela | Descrição |
| :--- | :--- | :--- |
| `#/home` | **Projetos (Home)** | Painel Bento Grid com tarefas em foco, projeto recente, alertas consolidados, anéis de saúde heurística, lista/grade de repositórios e telemetria visual. |
| `#/project/:id` | **Detalhe do Projeto** | Visão dedicada com anel de saúde, status de build de CI, dados técnicos sob demanda (Actions, Releases, README, Licença), botão para cartão Canvas, detector de abandono, tarefas, notas e linha do tempo. |
| `#/kanban` | **Quadro Kanban** | Gestão visual em 5 colunas de status com filtros combinados e suporte completo a teclado e toque. |
| `#/focus` | **Modo Foco (Pomodoro)** | Timer vinculado a projeto/tarefa, Modo Cinema, áudio procedural opcional e estatísticas de foco por projeto e tarefa. |
| `#/reports` | **Relatório Semanal & Análises** | Síntese executiva dos últimos 7 dias vs semana anterior, botões para exportar Portfólio, Cartão da Semana, Markdown e Impressão/PDF. |
| `#/galaxy` | **Galáxia 2D** | Exploração espacial dos repositórios em Canvas 2D onde o brilho de cada astro reflete a Saúde Heurística (0–100 · v1.0.0). |
| `#/graph` | **Grafo de Conexões** | Grafo de força mostrando relações entre projetos por stack, status e tópicos. |
| `#/achievements` | **Conquistas & Ofensiva** | Barra de XP/nível, ofensiva (*streak*) no fuso local, metas semanais e medalhas desbloqueadas. |
| `#/inbox` | **Inbox Rápida** | Caixa de entrada para capturar ideias soltas a qualquer momento e convertê-las em tarefas ou projetos locais com ilustrações SVG. |
| `#/settings` | **Configurações** | Personalização de temas (Dark, Light, Cyber, Aurora, Vaporwave, Mono), sincronização por Gist, onboarding, áudio, notificações e backup JSON. |

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
| `G` depois `R` | Ir para **Relatório Semanal & Análises** (`#/reports`) |
| `G` depois `X` | Ir para a **Galáxia de Projetos** (`#/galaxy`) |
| `G` depois `G` | Ir para o **Grafo de Conexões** (`#/graph`) |
| `G` depois `I` | Ir para a **Inbox** (`#/inbox`) |
| `Alt + ◀ / ▶` | Move o cartão focado entre colunas no Kanban |
| `?` | Abre o guia rápido de atalhos de teclado |
| `Esc` | Fecha modais, paleta de comandos ou sai do Modo Cinema |

---

## 📱 PWA, Service Worker e Modo Offline

O painel é uma **Progressive Web App** completa e resiliente:
- **Instalação Local:** Pode ser adicionado à tela inicial no Android/iOS ou instalado como app de janela própria no Windows, macOS e Linux.
- **Estratégia de Cache Inteligente (`sw.js`):**
  - **Assets Estáticos (HTML/CSS/JS/SVGs):** Estratégia *Stale-While-Revalidate* com cache versionado (`panel-cache-v6.0`), permitindo abertura instantânea mesmo sem internet.
  - **API do GitHub:** Estratégia *Network-First*, garantindo que os dados remotos estejam sempre atualizados quando online e preservando o cache local quando offline.
- **Indicador de Rede:** Pílula visual no cabeçalho exibindo em tempo real se a aplicação está **Online** ou **Offline**, com alertas suaves em mudanças de estado.
- **Atualização Segura:** Quando uma nova versão do painel é publicada, o Service Worker avisa o usuário de forma não intrusiva com um botão para atualizar imediatamente.

---

## ☁️ Sincronização Opcional em Nuvem via GitHub Gist

Para manter seus dados sincronizados entre múltiplos dispositivos sem depender de servidores de terceiros:
- **Gist Pessoal Privado:** Utiliza a própria API do GitHub para criar e gerenciar um Gist secreto nomeado `panel-sync-data.json`.
- **Desligada por Padrão & Consentimento Explícito:** Nenhuma chamada é feita sem que o usuário configure ativamente seu token pessoal (com escopo `gist`).
- **Resolução de Conflitos por Registro:** Ao invés de uma substituição cega de "última escrita vence", o sincronizador compara o timestamp `updatedAt` de cada projeto individualmente e propaga exclusões através de marcadores `_deleted: true` (*tombstones*).
- **Proteção Total contra Conflitos:** Antes de qualquer sincronização que altere o estado local, é gerado um **backup preventivo automático** no `localStorage`.

---

## 🎨 Experiência Visual e Performance Adaptativa

O motor gráfico (`js/fx/effects.js`) monitora continuamente a taxa de quadros por segundo (FPS) com histerese e adapta os efeitos automaticamente em três níveis configuráveis:

1. **Completo:** Aurora reativa sincronizada ao status dominante dos projetos, partículas sutis em Canvas, spotlight e inclinação 3D nos cartões, botões magnéticos e animações de entrada.
2. **Reduzido:** Desativa partículas contínuas e inclinação 3D, mantendo transições suaves e visual de vidro (*glassmorphism*) otimizado.
3. **Mínimo:** Zero loops de `requestAnimationFrame` decorativos e zero transições pesadas — ativado automaticamente quando o sistema operacional solicita redução de movimento (`prefers-reduced-motion: reduce`).

---

## 🧠 Inteligência, Integrações e Saúde Heurística

### 1. 📐 Fórmula Pública de Saúde do Projeto (`v1.0.0`)
A **Saúde do Projeto** é um **indicador heurístico interno do painel** (0 a 100) projetado para sinalizar atenção e ritmo de manutenção, **nunca uma medida objetiva da qualidade do código**.

A fórmula é pura, determinística, versionada e documentada na própria interface (via modal acessível ao clicar em qualquer anel de saúde):

| Fator | Peso Máximo | Critério de Avaliação |
| :--- | :---: | :--- |
| **Atividade Recente** | `25` | Baseado no último push/tarefa/nota: ≤7d (100%), ≤14d (85%), ≤30d (70%), ≤60d (45%), ≤90d (25%), >90d (10%). |
| **Tarefas Atrasadas** | `25` | 0 tarefas atrasadas (100%), 1 atrasada (65%), 2 atrasadas (35%), ≥3 atrasadas (10%). |
| **Issues Abertas** | `15` | Se consultadas: 0–3 abertas (100%), 4–10 (80%), 11–25 (50%), >25 (20%). |
| **README Detectado** | `8` | Arquivo README presente no repositório (100%) ou ausente (0%). |
| **Licença Declarada** | `7` | Licença detectada no GitHub ou nota manual: permissiva/MIT/Apache (100%), outra (70%), ausente (0%). |
| **Builds Recentes (CI)** | `12` | Se GitHub Actions estiver ativo: último build com sucesso (100%), em andamento/cancelado (70%), falha confirmada (15%). |
| **Releases Recentes** | `8` | Se consultadas e relevantes: com release publicada (100%), sem releases (40%). |

> ⚖️ **Princípio da Não-Penalização por Falta de Dados:**  
> Se um fator não pôde ser consultado (por falta de permissão, rate-limit da API, offline ou endpoints não acionados), **ele não conta como falha nem vira zero**. Os pesos são normalizados exclusivamente entre os fatores disponíveis:
> $$\text{Score Final} = \text{round}\left( \frac{\sum (\text{peso}_i \times \text{pontuação}_i)}{\sum \text{pesos disponíveis}} \right)$$
> Se a cobertura de fatores disponíveis for inferior a 50% dos 100 pontos possíveis, o indicador passa a ter **confiança baixa**, ganha anel tracejado e é marcado como **não comparável** (`isComparable = false`), garantindo honestidade metodológica.

### 2. 🚨 Princípio "Indisponível não é falha" & Concorrência Controlada
- Sub-requisições técnicas do GitHub (Actions, Releases e README) rodam **estritamente sob demanda** (ao abrir o projeto ou por clique explícito), protegidas por uma fila interna com concorrência máxima de **2 requisições simultâneas** (`MAX_CONCURRENT_SUBREQUESTS = 2`).
- Falhas de rede, restrições de escopo de token ou rate-limit **NUNCA** geram status vermelho de "Build falhou". O status é rotulado textualmente e visualmente como `Indisponível` (⚪) ou `Sem permissão` (🔒), preservando a verdade sobre o repositório.

### 3. ⏳ Detector de Abandono Não-Destrutivo
- Detecta projetos em status ativo (`em andamento` ou `ideia`) sem qualquer atividade por período configurável (padrão: **45 dias**, com janela de silêncio/cooldown de **14 dias**).
- **Garantia Fundamental:** O painel **NUNCA altera o status de um projeto sozinho**. Ele apresenta sugestões de ação conscientes: *Retomar projeto*, *Pausar*, *Arquivar*, *Adiar (cooldown de 14 dias)*, *Marcar que não precisa de atividade constante* (`exemptFromAbandonment`) ou *Ignorar alerta*.

### 4. 📊 Relatório Semanal & Radar de Habilidades (`#/reports`)
- **Relatório Semanal:** Compara a janela dos últimos 7 dias civis locais com a janela imediatamente anterior de 7 dias (tarefas concluídas, minutos de foco, atividade do GitHub e conquistas desbloqueadas), com gráfico diário e síntese executiva textual.
- **Portões Estritos de Amostra:** Gráficos de série temporal de linguagens e Radar de habilidades só são exibidos quando há amostra estatística mínima (≥ 3 repositórios em ≥ 2 semestres para timeline; ≥ 3 linguagens distintas para o radar).
- **Aviso Metodológico:** O Radar declara explicitamente que representa a distribuição relativa no painel (repositórios + tarefas + tempo de foco), **sem nunca inferir proficiência real ou senioridade por contagem de repositórios**.

### 5. 🤖 Resumo com IA Opcional, Privado & Seguro (`js/services/ai.js`)
- **100% Desligado por Padrão:** Requer opt-in explícito nas Configurações (`aiEnabled: false`, `aiConsentGiven: false`).
- **Prévia Transparente de Dados:** Antes de qualquer chamada, um modal de consentimento exibe **exatamente o JSON completo que será transmitido** e o endpoint de destino.
- **Allowlist Estrita & Bloqueio de Segredos:** Apenas metadados públicos e títulos curtos de commits/PRs/issues recentes entram no payload. **Notas privadas (`project.note`), tarefas pessoais (`project.tasks`), tokens (`ghp_*`, `sk-*`, `AIza*`) e arquivos completos são terminantemente proibidos e auditados antes do envio.**
- **Chave de API Somente no Aparelho:** A chave fica salva exclusivamente no `localStorage` sob a chave isolada `panel_ai_api_key_v1` (nunca é exportada no backup JSON) e pode ser apagada a qualquer momento ao revogar o consentimento.
- **Saída Sanitizada:** A resposta do modelo de IA é tratada estritamente como **texto não confiável** (sanitizada contra injeção de HTML e inserida exclusivamente via `textContent`).

---

## 🛡️ Segurança, Honestidade de Dados e Persistência

- **Separação Estrita de Dados:** Metadados públicos (estrelas, forks, linguagem, último push e eventos recentes) vêm da API do GitHub com cache inteligente e controle de limite de requisições (`X-RateLimit-*`). Seus dados pessoais (status, tarefas, notas, sessões de foco e conquistas) vivem exclusivamente no seu navegador (`localStorage`).
- **Telemetria Honesta:** Quando os eventos públicos do GitHub ainda não foram carregados ou você está sem internet, os gráficos e o Heatmap 2D exibem explicitamente o estado **"Indisponível"**, nunca inventando zeros falsos.
- **Anti-XSS Nativo:** O renderizador Markdown (`js/utils/markdown.js`) constrói nós seguros via DOM API com lista de permissões estrita (`http:`, `https:`, `mailto:`), bloqueando qualquer injeção de HTML ou `javascript:`.
- **Migrações com Backup Automático:** O armazenamento local possui versionamento de esquema (`v1 → v2 → v3 → v4`), criando snapshots preventivos antes de cada migração ou importação de arquivo JSON e oferecendo **Desfazer (Undo)** para ações destrutivas.

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
├── index.html                  # Shell semântico da aplicação, PWA meta tags e CSP estrita
├── manifest.webmanifest        # Manifesto PWA com modo standalone e atalhos
├── sw.js                       # Service Worker com cache versionado e modo offline
├── css/
│   ├── tokens.css              # Variáveis de design, temas (escuro, claro, cyber, aurora, vaporwave, mono)
│   ├── base.css                # Reset moderno, tipografia e aurora de fundo
│   ├── layout.css              # Cabeçalho com status de rede, dock, container e FAB
│   ├── components.css          # Botões, cartões de vidro, badges, modais, toasts e inputs
│   ├── views.css               # Estilos das views, Bento Grid, Kanban, Foco, Cinema e Conquistas
│   └── print.css               # Folha de estilo @media print otimizada para formato A4
├── js/
│   ├── app.js                  # Ponto de entrada, registro do Service Worker e monitor de rede
│   ├── router.js               # Roteador SPA baseado em hash com lazy loading via import()
│   ├── store/
│   │   ├── store.js            # Store reativo central, máquina de estados do Foco e Undo parcial
│   │   └── storage.js          # Persistência em localStorage, migrações v1→v4 e exportação JSON
│   ├── services/
│   │   ├── github.js           # Cliente da GitHub API com fila concorrente (max 2), Actions e Releases
│   │   ├── portfolio.js        # Exportador de portfólio estático seguro e relatório em Markdown
│   │   ├── share-card.js       # Gerador de cartões 1200×630px em Canvas 2D (semanal e projeto)
│   │   ├── sync.js             # Sincronização em nuvem via Gist privado com reconciliação e tombstones
│   │   ├── ai.js               # Integração opcional com IA, allowlist estrita e auditoria de segredos
│   │   ├── feedback.js         # Web Audio API (sons e ambiente), vibração tátil e celebrações
│   │   └── notifications.js    # Notificações locais com permissão contextual explicativa
│   ├── components/
│   │   ├── nav.js              # Barra superior com status de rede, dock animada, XP e atalhos
│   │   ├── charts.js           # Anéis Apple Watch, saúde heurística v1.0.0, badges CI, radar e relatório
│   │   ├── share-modals.js     # Modais de compartilhamento (cartão PNG e exportação de portfólio)
│   │   ├── onboarding.js       # Tour guiado interativo de 3 passos para novos usuários
│   │   ├── empty-state.js      # Ilustrações temáticas em SVG para estados vazios
│   │   ├── mascot.js           # Mascote SVG reativo opcional (foco, comemoração e descanso sem culpa)
│   │   ├── palette.js          # Command Palette (Ctrl+K) com busca difusa e ações rápidas
│   │   ├── modal.js            # Modais acessíveis com focus trap e restauração de foco
│   │   └── toast.js            # Notificações visuais rápidas com suporte a botão Desfazer
│   ├── views/
│   │   ├── home.js             # Bento Grid inicial, alertas consolidados, anéis de saúde e Flip 3D
│   │   ├── project.js          # Detalhe do projeto, CI, saúde, IA opcional, cartão e tarefas
│   │   ├── kanban.js           # Quadro Kanban interativo (mouse, toque e teclado)
│   │   ├── focus.js            # Modo Foco (Pomodoro), Modo Cinema e estatísticas de tempo
│   │   ├── achievements.js     # Galeria de conquistas, progresso de nível, XP e ofensiva (streak)
│   │   ├── reports.js          # Relatório Semanal comparativo, evolução de stack e radar de linguagens
│   │   ├── galaxy.js           # Visualização Galáxia 2D com brilho proporcional à saúde heurística
│   │   ├── graph.js            # Visualização Grafo de Conexões em Canvas (carregada sob demanda)
│   │   ├── bubbles.js          # Visualização Modo Bolhas (carregada sob demanda)
│   │   ├── inbox.js            # Captura rápida de ideias e conversão em tarefas/projetos
│   │   └── settings.js         # Configurações, temas acessíveis, sincronização Gist, IA e backups
│   ├── fx/
│   │   └── effects.js          # Motor de efeitos adaptativos, monitor de FPS com histerese e Canvas
│   └── utils/
│       ├── domain.js           # Funções puras de domínio, fórmula de saúde v1.0.0, abandono e métricas
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
