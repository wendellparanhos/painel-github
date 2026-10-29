/**
 * Renderizador de Markdown Seguro e Mínimo
 * Constrói nós do DOM diretamente usando textContent para garantir zero XSS.
 */

import { el } from './dom.js';

export function renderMarkdown(markdownText, container) {
  if (!container) return;
  container.replaceChildren();

  if (!markdownText || typeof markdownText !== 'string') {
    container.appendChild(el('p', { class: 'text-muted' }, 'Nenhuma nota registrada ainda.'));
    return;
  }

  const lines = markdownText.split('\n');
  let inCodeBlock = false;
  let codeBlockLines = [];
  let currentList = null;

  function flushList() {
    if (currentList) {
      container.appendChild(currentList);
      currentList = null;
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // Blocos de código multiline (```)
    if (trimmed.startsWith('```')) {
      flushList();
      if (inCodeBlock) {
        // Fechando bloco de código
        const codeEl = el('code', {}, codeBlockLines.join('\n'));
        const preEl = el('pre', {}, codeEl);
        container.appendChild(preEl);
        codeBlockLines = [];
        inCodeBlock = false;
      } else {
        // Abrindo bloco de código
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockLines.push(rawLine);
      continue;
    }

    // Linha em branco
    if (!trimmed) {
      flushList();
      continue;
    }

    // Cabeçalhos (#, ##, ###)
    if (trimmed.startsWith('### ')) {
      flushList();
      container.appendChild(el('h3', {}, ...parseInline(trimmed.slice(4))));
      continue;
    }
    if (trimmed.startsWith('## ')) {
      flushList();
      container.appendChild(el('h2', {}, ...parseInline(trimmed.slice(3))));
      continue;
    }
    if (trimmed.startsWith('# ')) {
      flushList();
      container.appendChild(el('h1', {}, ...parseInline(trimmed.slice(2))));
      continue;
    }

    // Blockquote (> )
    if (trimmed.startsWith('> ')) {
      flushList();
      const quoteEl = el('blockquote', { class: 'markdown-quote' }, ...parseInline(trimmed.slice(2)));
      container.appendChild(quoteEl);
      continue;
    }

    // Task list items (- [ ] ou - [x])
    const taskMatch = trimmed.match(/^[-*]\s+\[([ xX])\]\s+(.*)$/);
    if (taskMatch) {
      if (!currentList || currentList.tagName !== 'UL') {
        flushList();
        currentList = el('ul', { class: 'task-list' });
      }
      const isChecked = taskMatch[1].toLowerCase() === 'x';
      const checkbox = el('input', {
        type: 'checkbox',
        disabled: true,
        checked: isChecked,
        class: 'task-list-check'
      });
      const itemEl = el('li', { class: 'task-list-item' }, checkbox, ' ', ...parseInline(taskMatch[2]));
      currentList.appendChild(itemEl);
      continue;
    }

    // Listas normais (- ou *)
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      if (!currentList || currentList.tagName !== 'UL') {
        flushList();
        currentList = el('ul', {});
      }
      currentList.appendChild(el('li', {}, ...parseInline(trimmed.slice(2))));
      continue;
    }

    // Listas ordenadas (1. 2. etc)
    const olMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (olMatch) {
      if (!currentList || currentList.tagName !== 'OL') {
        flushList();
        currentList = el('ol', {});
      }
      currentList.appendChild(el('li', {}, ...parseInline(olMatch[2])));
      continue;
    }

    // Parágrafo comum
    flushList();
    container.appendChild(el('p', {}, ...parseInline(rawLine)));
  }

  flushList();

  // Se bloco de código ficou aberto no final do arquivo
  if (inCodeBlock && codeBlockLines.length) {
    const codeEl = el('code', {}, codeBlockLines.join('\n'));
    container.appendChild(el('pre', {}, codeEl));
  }
}

/**
 * Processa formatações inline: **bold**, *italic*, `code`, e [link](https://...)
 * Retorna array de nós do DOM seguros (Text e HTMLElement)
 */
function parseInline(text) {
  const nodes = [];
  let remaining = text;

  // Regex combinando tokens inline
  // 1: Link [text](url)
  // 2: Inline code `code`
  // 3: Bold **bold**
  // 4: Italic *italic*
  const pattern = /(!?\[([^\]]+)\]\(([^)]+)\)|`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*)/;

  while (remaining) {
    const match = remaining.match(pattern);
    if (!match) {
      nodes.push(document.createTextNode(remaining));
      break;
    }

    const matchIndex = match.index;
    if (matchIndex > 0) {
      nodes.push(document.createTextNode(remaining.slice(0, matchIndex)));
    }

    const fullMatch = match[0];

    if (fullMatch.startsWith('`')) {
      // Inline code
      const codeContent = match[4];
      nodes.push(el('code', {}, codeContent));
    } else if (fullMatch.startsWith('**')) {
      // Bold
      const boldContent = match[5];
      nodes.push(el('strong', {}, ...parseInline(boldContent)));
    } else if (fullMatch.startsWith('*')) {
      // Italic
      const italicContent = match[6];
      nodes.push(el('em', {}, ...parseInline(italicContent)));
    } else if (fullMatch.startsWith('[')) {
      // Link [text](url)
      const linkText = match[2];
      const linkUrl = match[3];

      // Validação estrita de URL (somente https: ou mailto:)
      let isSafe = false;
      try {
        const parsed = new URL(linkUrl, window.location.href);
        if (parsed.protocol === 'https:' || parsed.protocol === 'mailto:') {
          isSafe = true;
        }
      } catch {
        isSafe = false;
      }

      if (isSafe) {
        nodes.push(el('a', {
          href: linkUrl,
          target: '_blank',
          rel: 'noopener noreferrer'
        }, linkText));
      } else {
        // Se a URL for insegura (javascript:, data:, etc.), renderiza apenas como texto simples
        nodes.push(document.createTextNode(linkText));
      }
    }

    remaining = remaining.slice(matchIndex + fullMatch.length);
  }

  return nodes;
}
