/**
 * Serviço de Geração de Portfólio Estático Autônomo — Fase 6.
 *
 * Princípios Fundamentais:
 *   1. Allowlist estrita de metadados públicos: NUNCA exporta notas privadas (`note`),
 *      tarefas pessoais (`tasks`), tokens de API, IDs internos desnecessários ou credenciais.
 *   2. Página HTML totalmente independente e autônoma: funciona abrindo diretamente `file://`
 *      ou em qualquer servidor estático (GitHub Pages, Netlify, Vercel), sem depender do estado
 *      local do painel nem acessar APIs externas.
 *   3. Busca instantânea e filtros em JavaScript vanilla embutido limpo.
 *   4. Design responsivo moderno no padrão Dark Premium com acessibilidade WCAG AA.
 */

export const PORTFOLIO_ALLOWLIST_FIELDS = Object.freeze([
  'name',
  'description',
  'language',
  'stars',
  'forks',
  'pushedAt',
  'htmlUrl',
  'homepage',
  'topics',
  'status',
  'healthScore',
  'healthLabel',
  'customIcon',
  'customColor'
]);

const FORBIDDEN_CANARY_KEYS = new Set([
  'note',
  'notes',
  'task',
  'tasks',
  'token',
  'apikey',
  'api_key',
  'secret',
  'credentials',
  'aiproviders',
  'ghp_',
  'password'
]);

const SECRET_PATTERNS = [
  /ghp_[A-Za-z0-9_]{20,}/g,
  /github_pat_[A-Za-z0-9_]{20,}/g,
  /sk-[A-Za-z0-9_]{20,}/g,
  /AIza[0-9A-Za-z-_]{35}/g,
  /CANARY_[A-Za-z0-9_]+/g
];

/**
 * Filtra e sanitiza estritamente os projetos para o portfólio público.
 *
 * @param {Array<object>} mergedProjects
 * @param {Array<string|number>} selectedIds - IDs dos projetos que o usuário marcou para incluir
 * @param {object} options - configurações de exibição (ex: incluir status, estrelas, etc)
 */
export function filterProjectsForPortfolio(mergedProjects = [], selectedIds = null, options = {}) {
  const allowedSet = Array.isArray(selectedIds) ? new Set(selectedIds.map(String)) : null;

  const sanitizedList = [];

  for (const proj of mergedProjects) {
    if (!proj || proj.hidden) continue;
    const idStr = String(proj.repoId || proj.id || '');
    if (allowedSet && !allowedSet.has(idStr)) continue;

    // Constrói item sanitizado estritamente pela allowlist
    const item = {
      name: String(proj.name || 'Projeto').slice(0, 100),
      description: proj.description ? String(proj.description).slice(0, 300) : '',
      language: proj.language ? String(proj.language).slice(0, 50) : null,
      stars: typeof proj.stars === 'number' ? proj.stars : 0,
      forks: typeof proj.forks === 'number' ? proj.forks : 0,
      pushedAt: proj.pushedAt || null,
      htmlUrl: proj.htmlUrl && /^https?:\/\//i.test(proj.htmlUrl) ? proj.htmlUrl : null,
      homepage: proj.homepage && /^https?:\/\//i.test(proj.homepage) ? proj.homepage : null,
      topics: Array.isArray(proj.topics) ? proj.topics.map(t => String(t).slice(0, 30)).slice(0, 6) : [],
      status: String(proj.status || 'em andamento'),
      healthScore: proj.health?.score ?? null,
      healthLabel: proj.health?.label ?? null,
      customIcon: proj.customIcon || null,
      customColor: proj.customColor || null
    };

    // Aplica opções de personalização do usuário
    if (options.includeStatus === false) delete item.status;
    if (options.includeStars === false) { delete item.stars; delete item.forks; }
    if (options.includeHealth === false) { delete item.healthScore; delete item.healthLabel; }

    sanitizedList.push(item);
  }

  // Ordena por estrelas e atividade recente
  sanitizedList.sort((a, b) => {
    if ((b.stars || 0) !== (a.stars || 0)) return (b.stars || 0) - (a.stars || 0);
    return String(b.pushedAt || '').localeCompare(String(a.pushedAt || ''));
  });

  return sanitizedList;
}

/**
 * Audita o payload filtrado garantindo que NENHUM dado-canário ou nota/tarefa/token vaze.
 */
export function auditPortfolioPayloadForSecrets(sanitizedProjects = []) {
  const violations = [];
  const serialized = JSON.stringify(sanitizedProjects);

  // 1. Verifica se chaves proibidas existem
  function walk(node, path = '') {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach((item, idx) => walk(item, `${path}[${idx}]`));
      return;
    }
    for (const [k, v] of Object.entries(node)) {
      const lower = k.toLowerCase();
      if (FORBIDDEN_CANARY_KEYS.has(lower)) {
        violations.push(`Campo proibido detectado no portfólio: "${path ? path + '.' : ''}${k}"`);
      }
      walk(v, path ? `${path}.${k}` : k);
    }
  }
  walk(sanitizedProjects);

  // 2. Verifica se padrões de tokens ou canários estão presentes no texto
  for (const regex of SECRET_PATTERNS) {
    regex.lastIndex = 0;
    const match = serialized.match(regex);
    if (match) {
      violations.push(`Padrão de segredo/canário detectado: "${match[0]}"`);
    }
  }

  return {
    safe: violations.length === 0,
    violations,
    projectCount: sanitizedProjects.length
  };
}

/**
 * Gera o documento HTML autônomo completo do portfólio estático.
 *
 * @param {object} params
 * @param {string} params.title - Título do portfólio (ex: "Wendell Paranhos · Portfólio de Projetos")
 * @param {string} params.bio - Biografia curta pública
 * @param {string} params.githubUsername - Usuário do GitHub
 * @param {Array<object>} params.projects - Lista de projetos sanitizados
 */
export function generateStandalonePortfolioHtml({
  title = 'Portfólio de Projetos',
  bio = 'Desenvolvedor focado em soluções web de alto impacto, arquitetura moderna e automação.',
  githubUsername = 'wendellparanhos',
  projects = []
} = {}) {
  const generatedAt = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  const jsonProjects = JSON.stringify(projects).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${_escapeHtml(title)}</title>
  <meta name="description" content="${_escapeHtml(bio)}">
  <style>
    :root {
      --bg: #090d16;
      --bg-card: rgba(18, 24, 38, 0.85);
      --bg-elevated: #1a2234;
      --border: rgba(255, 255, 255, 0.08);
      --border-hover: rgba(139, 92, 246, 0.4);
      --text-main: #f1f5f9;
      --text-muted: #94a3b8;
      --accent: #8b5cf6;
      --accent-glow: rgba(139, 92, 246, 0.25);
      --font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      --font-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      --radius: 12px;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--font);
      background: var(--bg);
      color: var(--text-main);
      min-height: 100vh;
      line-height: 1.6;
      padding: 3rem 1.5rem;
      background-image: radial-gradient(circle at 50% 0%, rgba(139, 92, 246, 0.15) 0%, transparent 60%);
    }
    .container { max-width: 1100px; margin: 0 auto; }
    header { margin-bottom: 2.5rem; text-align: center; }
    .badge-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 12px;
      background: rgba(139, 92, 246, 0.12);
      border: 1px solid rgba(139, 92, 246, 0.3);
      color: #c084fc;
      border-radius: 999px;
      font-size: 0.8rem;
      font-weight: 600;
      margin-bottom: 1rem;
    }
    h1 { font-size: 2.5rem; font-weight: 800; letter-spacing: -0.03em; margin-bottom: 0.5rem; }
    .bio { font-size: 1.1rem; color: var(--text-muted); max-width: 650px; margin: 0 auto 1.5rem; }
    .social-links { display: flex; justify-content: center; gap: 12px; margin-bottom: 2rem; }
    .btn-link {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      background: var(--bg-elevated);
      color: var(--text-main);
      text-decoration: none;
      border-radius: 8px;
      font-size: 0.9rem;
      border: 1px solid var(--border);
      transition: all 0.2s ease;
    }
    .btn-link:hover { border-color: var(--accent); transform: translateY(-1px); }
    .controls {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-bottom: 2rem;
      justify-content: space-between;
      align-items: center;
    }
    .search-input {
      flex: 1;
      min-width: 240px;
      padding: 10px 14px;
      background: var(--bg-elevated);
      border: 1px solid var(--border);
      border-radius: 8px;
      color: var(--text-main);
      font-size: 0.95rem;
      outline: none;
    }
    .search-input:focus { border-color: var(--accent); }
    .lang-filter {
      padding: 10px 14px;
      background: var(--bg-elevated);
      border: 1px solid var(--border);
      border-radius: 8px;
      color: var(--text-main);
      font-size: 0.95rem;
      outline: none;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 1.5rem;
    }
    .card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 1.5rem;
      display: flex;
      flex-direction: column;
      backdrop-filter: blur(8px);
      transition: all 0.2s ease;
    }
    .card:hover {
      border-color: var(--border-hover);
      box-shadow: 0 10px 25px -5px var(--accent-glow);
      transform: translateY(-2px);
    }
    .card-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; margin-bottom: 0.75rem; }
    .card-title { font-size: 1.2rem; font-weight: 700; color: #fff; text-decoration: none; display: flex; align-items: center; gap: 8px; }
    .card-title:hover { color: #c084fc; }
    .card-desc { font-size: 0.9rem; color: var(--text-muted); flex: 1; margin-bottom: 1.2rem; }
    .topics { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 1.2rem; }
    .topic-tag { font-size: 0.75rem; padding: 2px 8px; background: rgba(255,255,255,0.06); border-radius: 6px; color: #cbd5e1; font-family: var(--font-mono); }
    .card-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-top: 1px solid var(--border);
      padding-top: 0.75rem;
      font-size: 0.8rem;
      color: var(--text-muted);
    }
    .lang-indicator { display: inline-flex; align-items: center; gap: 6px; font-weight: 600; }
    .lang-dot { width: 8px; height: 8px; border-radius: 50%; background: #94a3b8; }
    .meta-metrics { display: flex; align-items: center; gap: 10px; font-family: var(--font-mono); }
    footer { margin-top: 4rem; text-align: center; font-size: 0.85rem; color: var(--text-muted); border-top: 1px solid var(--border); padding-top: 2rem; }
    @media (max-width: 600px) {
      body { padding: 1.5rem 1rem; }
      h1 { font-size: 1.8rem; }
      .controls { flex-direction: column; align-items: stretch; }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <span class="badge-pill">🚀 Portfólio de Repositórios</span>
      <h1>${_escapeHtml(title)}</h1>
      <p class="bio">${_escapeHtml(bio)}</p>
      <div class="social-links">
        ${githubUsername ? `<a class="btn-link" href="https://github.com/${_escapeHtml(githubUsername)}" target="_blank" rel="noopener noreferrer">🐙 GitHub: @${_escapeHtml(githubUsername)}</a>` : ''}
      </div>
      <div class="controls">
        <input type="text" id="filter-search" class="search-input" placeholder="Buscar projetos por nome, linguagem ou tópico..." aria-label="Buscar projetos">
        <select id="filter-lang" class="lang-filter" aria-label="Filtrar por linguagem">
          <option value="">Todas as linguagens</option>
        </select>
      </div>
    </header>

    <main id="projects-grid" class="grid" role="region" aria-label="Lista de projetos"></main>

    <footer>
      <p>Gerado autonomamente pelo <strong>Painel GitHub</strong> em ${generatedAt} · 100% estático e livre de rastreadores.</p>
    </footer>
  </div>

  <script>
    (function() {
      const projects = ${jsonProjects};
      const grid = document.getElementById('projects-grid');
      const searchInput = document.getElementById('filter-search');
      const langSelect = document.getElementById('filter-lang');

      // Cores por linguagem
      const LANG_COLORS = {
        JavaScript: '#f1e05a', TypeScript: '#3178c6', Python: '#3572A5', HTML: '#e34c26', CSS: '#563d7c',
        Java: '#b07219', 'C#': '#178600', PHP: '#4F5D95', Go: '#00ADD8', Rust: '#dea584', Shell: '#89e051'
      };

      // Popula filtro de linguagens
      const langs = Array.from(new Set(projects.map(p => p.language).filter(Boolean))).sort();
      langs.forEach(lang => {
        const opt = document.createElement('option');
        opt.value = lang;
        opt.textContent = lang;
        langSelect.appendChild(opt);
      });

      function render(items) {
        grid.innerHTML = '';
        if (items.length === 0) {
          grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:3rem;color:var(--text-muted);">Nenhum projeto encontrado para esta busca.</div>';
          return;
        }

        items.forEach(p => {
          const card = document.createElement('article');
          card.className = 'card';

          const icon = p.customIcon ? p.customIcon + ' ' : '📦 ';
          const langDot = p.language ? '<span class="lang-dot" style="background:' + (LANG_COLORS[p.language] || '#94a3b8') + '"></span>' : '';
          const langText = p.language ? '<span class="lang-indicator">' + langDot + _escape(p.language) + '</span>' : '<span></span>';
          const starsHtml = p.stars > 0 ? '<span>⭐ ' + p.stars + '</span>' : '';
          const forksHtml = p.forks > 0 ? '<span>🍴 ' + p.forks + '</span>' : '';
          const topicsHtml = (p.topics || []).map(t => '<span class="topic-tag">#' + _escape(t) + '</span>').join('');

          const titleContent = p.htmlUrl
            ? '<a class="card-title" href="' + _escape(p.htmlUrl) + '" target="_blank" rel="noopener noreferrer">' + icon + _escape(p.name) + ' ↗</a>'
            : '<span class="card-title">' + icon + _escape(p.name) + '</span>';

          card.innerHTML =
            '<div class="card-header">' + titleContent + '</div>' +
            '<p class="card-desc">' + _escape(p.description || 'Sem descrição pública cadastrada.') + '</p>' +
            (topicsHtml ? '<div class="topics">' + topicsHtml + '</div>' : '') +
            '<div class="card-footer">' +
              langText +
              '<div class="meta-metrics">' + starsHtml + forksHtml + '</div>' +
            '</div>';

          grid.appendChild(card);
        });
      }

      function filter() {
        const q = searchInput.value.toLowerCase().trim();
        const selLang = langSelect.value;
        const filtered = projects.filter(p => {
          const matchesLang = !selLang || p.language === selLang;
          const textCorpus = ((p.name || '') + ' ' + (p.description || '') + ' ' + (p.topics || []).join(' ')).toLowerCase();
          const matchesQuery = !q || textCorpus.includes(q);
          return matchesLang && matchesQuery;
        });
        render(filtered);
      }

      function _escape(str) {
        if (!str) return '';
        return String(str)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');
      }

      searchInput.addEventListener('input', filter);
      langSelect.addEventListener('change', filter);

      render(projects);
    })();
  </script>
</body>
</html>`;
}

function _escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Gera relatório semanal completo formatado em Markdown (GitHub Flavored Markdown).
 */
export function exportWeeklyReportMarkdown(weeklyData = {}) {
  const period = weeklyData.period?.label || 'Últimos 7 dias locais';
  const genDate = new Date().toISOString().slice(0, 10);

  const lines = [
    `# 📊 Relatório Semanal de Produtividade & Foco`,
    ``,
    `> **Período Analisado:** ${period}  `,
    `> **Gerado em:** ${genDate} · Painel GitHub (100% Local)`,
    ``,
    `---`,
    ``,
    `## 📝 Síntese Executiva`,
    ``,
    weeklyData.textualSummary || 'Sem resumo textual gerado para o período.',
    ``,
    `---`,
    ``,
    `## 📈 Indicadores Chave da Semana`,
    ``,
    `| Métrica | Janela Atual (7d) | Semana Anterior (7d) | Variação (Delta) |`,
    `| :--- | :---: | :---: | :---: |`,
    `| **Tarefas Concluídas** | ${weeklyData.tasks?.completedCount ?? 0} | ${weeklyData.tasks?.prevCount ?? 0} | ${(weeklyData.tasks?.delta ?? 0) >= 0 ? '+' : ''}${weeklyData.tasks?.delta ?? 0} |`,
    `| **Tempo de Foco (Pomodoro)** | ${weeklyData.focus?.minutes ?? 0} min | ${weeklyData.focus?.prevMinutes ?? 0} min | ${(weeklyData.focus?.deltaMinutes ?? 0) >= 0 ? '+' : ''}${weeklyData.focus?.deltaMinutes ?? 0} min |`,
    `| **Sessões de Foco Concluídas** | ${weeklyData.focus?.sessionsCount ?? 0} | — | — |`,
    `| **Atividade GitHub (Commits)** | ${weeklyData.githubActivity?.available ? (weeklyData.githubActivity?.commits7d ?? 0) : 'Indisponível'} | ${weeklyData.githubActivity?.available ? (weeklyData.githubActivity?.previousWeekCommits ?? 0) : 'Indisponível'} | ${weeklyData.githubActivity?.available ? ((weeklyData.githubActivity?.deltaCommits ?? 0) >= 0 ? '+' : '') + (weeklyData.githubActivity?.deltaCommits ?? 0) : '—'} |`,
    `| **Novas Conquistas Desbloqueadas** | ${Array.isArray(weeklyData.achievements?.unlockedThisWeek) ? weeklyData.achievements.unlockedThisWeek.length : 0} | — | — |`,
    ``,
    `---`,
    ``,
    `## 📅 Ritmo Diário nos Últimos 7 Dias`,
    ``,
    `| Data | Dia | Tarefas Concluídas | Tempo de Foco (min) | Commits Públicos |`,
    `| :--- | :--- | :---: | :---: | :---: |`
  ];

  (weeklyData.dailyBreakdown || []).forEach(d => {
    const cStr = d.publicEvents !== null ? `${d.publicEvents}` : '—';
    lines.push(`| \`${d.date}\` | ${d.label || d.date} | ${d.tasksCompleted || 0} | ${d.focusMinutes || 0}m | ${cStr} |`);
  });

  if (Array.isArray(weeklyData.focus?.byProject) && weeklyData.focus.byProject.length > 0) {
    lines.push(``, `---`, ``, `## 🎯 Foco por Projeto na Semana`, ``);
    lines.push(`| Projeto | Minutos de Foco | Sessões Realizadas |`);
    lines.push(`| :--- | :---: | :---: |`);
    weeklyData.focus.byProject.forEach(fp => {
      lines.push(`| **${fp.projectName}** | ${fp.minutes} min | ${fp.sessions} |`);
    });
  }

  if (Array.isArray(weeklyData.tasks?.completedItems) && weeklyData.tasks.completedItems.length > 0) {
    lines.push(``, `---`, ``, `## ✅ Tarefas Concluídas na Semana`, ``);
    weeklyData.tasks.completedItems.forEach(t => {
      lines.push(`- [x] **${t.title}** — *${t.projectName}* (\`${t.dateYMD || 'Semana'}\`)`);
    });
  }

  lines.push(
    ``,
    `---`,
    ``,
    `> ℹ️ **Nota de Integridade:** Dados calculados localmente pelo Painel GitHub. Ausência de rede ou rate-limit da API pública do GitHub nunca gera penalização ou dados inventados.`
  );

  return lines.join('\n');
}

/**
 * Dispara download do relatório semanal em formato Markdown (.md).
 */
export function downloadWeeklyReportMarkdown(weeklyData = {}, filename = null) {
  const mdContent = exportWeeklyReportMarkdown(weeklyData);
  const fname = filename || `relatorio-semanal-${new Date().toISOString().slice(0, 10)}.md`;
  const blob = new Blob([mdContent], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fname;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

/**
 * Dispara o download seguro do arquivo HTML autônomo gerado.
 */
export function downloadPortfolioHtml(htmlContent, filename = 'portfolio-projetos.html') {
  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}
