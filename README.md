# Painel de Projetos — Wendell Paranhos

Painel de controle pessoal moderno, de alto impacto visual e mobile-first para acompanhamento de repositórios do GitHub, gestão de status, tarefas com priorização e notas em Markdown.

Construído em **Vanilla JavaScript (ES Modules)**, **HTML5 semântico** e **CSS3 moderno**, sem frameworks, sem bundlers e sem dependências em tempo de execução. Projetado para hospedagem estática direta no **GitHub Pages**.

---

## Como Executar Localmente

Como a aplicação utiliza módulos ES nativos (`import`/`export`), ela deve ser servida através de um servidor HTTP local (o protocolo `file://` bloqueia módulos por padrão de segurança nos navegadores):

### Usando Python:
```bash
python -m http.server 8080
```
Acesse no navegador: `http://localhost:8080`

### Usando Node.js (npx):
```bash
npx serve .
```

---

## Características da Fase 1
- **Visual "Dark Premium, Vidro e Luz"**: Design refinado com glassmorphism, profundidade, tokens de design em CSS e 6 paletas de acento.
- **Navegação SPA Baseada em Hash**: Suporte completo a rotas diretas (`#/home`, `#/project/<id>`, `#/settings`), histórico de Voltar/Avançar e ciclo de vida seguro de views (`mount`/`unmount`).
- **Resiliência e Orçamento da API GitHub**: Cache com timestamp, leitura de limites de requisição (`X-RateLimit-*`), deduplicação e modo offline.
- **Separação de Fontes da Verdade**: Repositórios vêm do GitHub; status pessoal, notas, tarefas e prioridades pertencem exclusivamente ao usuário e são persistidos no navegador.
- **Efeitos Adaptativos**: 3 níveis de performance (`completo`, `reduzido`, `mínimo`), com respeito estrito a `prefers-reduced-motion` e detecção de capacidade de hardware.
- **Segurança Nativa**: Renderizador Markdown próprio baseado em árvore do DOM e whitelist, sem execução de HTML bruto ou XSS.
- **Proteção Contra Perda de Dados**: Backup automático antes de migrações e importações, recuperação de JSON e suporte a desfazer (Undo) em exclusão e mudanças.
