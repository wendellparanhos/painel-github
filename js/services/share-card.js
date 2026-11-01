/**
 * Serviço de Geração de Cartões Compartilháveis em Canvas 2D — Fase 6.
 *
 * Gera imagens de alta resolução (1200x630px, padrão Social Preview / Open Graph / Twitter)
 * prontas para download como PNG ou cópia para a área de transferência.
 */

import { getLangColor } from './github.js';

/**
 * Renderiza o Cartão da Semana em um elemento Canvas 2D de 1200x630px.
 *
 * @param {object} weeklyData - Retornado por domain.computeWeeklyReportData
 * @param {object} state - Estado global da aplicação
 * @param {HTMLCanvasElement} [targetCanvas] - Opcional, cria se omitido
 * @returns {HTMLCanvasElement}
 */
export function renderWeeklySummaryCardToCanvas(weeklyData = {}, state = {}, targetCanvas = null) {
  const width = 1200;
  const height = 630;
  const canvas = targetCanvas || document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  // 1. Fundo com gradiente e luz ambiente
  const bgGrad = ctx.createLinearGradient(0, 0, width, height);
  bgGrad.addColorStop(0, '#0a0e1a');
  bgGrad.addColorStop(0.5, '#0f172a');
  bgGrad.addColorStop(1, '#070b14');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // Luz ambiente suave no topo esquerdo (violeta) e rodapé direito (ciano)
  const radTop = ctx.createRadialGradient(250, 100, 10, 250, 100, 450);
  radTop.addColorStop(0, 'rgba(139, 92, 246, 0.22)');
  radTop.addColorStop(1, 'rgba(139, 92, 246, 0)');
  ctx.fillStyle = radTop;
  ctx.fillRect(0, 0, width, height);

  const radBottom = ctx.createRadialGradient(1000, 500, 10, 1000, 500, 400);
  radBottom.addColorStop(0, 'rgba(6, 182, 212, 0.16)');
  radBottom.addColorStop(1, 'rgba(6, 182, 212, 0)');
  ctx.fillStyle = radBottom;
  ctx.fillRect(0, 0, width, height);

  // Moldura externa elegante
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.lineWidth = 2;
  _roundRect(ctx, 24, 24, width - 48, height - 48, 20);
  ctx.stroke();

  // 2. Cabeçalho do Cartão
  // Eyebrow / Tag
  ctx.fillStyle = 'rgba(139, 92, 246, 0.18)';
  _roundRect(ctx, 60, 60, 280, 36, 18);
  ctx.fill();
  ctx.strokeStyle = 'rgba(139, 92, 246, 0.4)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.font = '700 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.fillStyle = '#c084fc';
  ctx.fillText('📊 PAINEL GITHUB · RESUMO SEMANAL', 75, 83);

  // Título Principal
  ctx.font = '800 38px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.fillStyle = '#f8fafc';
  ctx.fillText('Ritmo de Trabalho & Foco', 60, 140);

  // Subtítulo / Período
  const periodLabel = weeklyData.period?.label || 'Últimos 7 dias locais';
  ctx.font = '500 17px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.fillStyle = '#94a3b8';
  ctx.fillText(`Janela: ${periodLabel}`, 60, 172);

  // 3. Grid de 4 Cards de Métricas (2 linhas x 2 colunas)
  const kpis = [
    {
      title: 'TAREFAS CONCLUÍDAS',
      val: `${weeklyData.tasks?.completedCount ?? 0}`,
      unit: 'tarefa(s)',
      sub: (weeklyData.tasks?.delta ?? 0) >= 0 ? `+${weeklyData.tasks?.delta ?? 0} vs semana anterior` : `${weeklyData.tasks?.delta ?? 0} vs semana anterior`,
      color: '#10b981',
      icon: '✅'
    },
    {
      title: 'TEMPO DE FOCO REAL',
      val: `${weeklyData.focus?.minutes ?? 0}`,
      unit: 'minutos',
      sub: `${weeklyData.focus?.sessionsCount ?? 0} ciclo(s) Pomodoro`,
      color: '#8b5cf6',
      icon: '⏱️'
    },
    {
      title: 'ATIVIDADE GITHUB',
      val: weeklyData.githubActivity?.available ? `${weeklyData.githubActivity?.commits7d ?? 0}` : 'OK',
      unit: weeklyData.githubActivity?.available ? 'commits' : 'Telemetria',
      sub: weeklyData.githubActivity?.available ? `${weeklyData.githubActivity?.events7d ?? 0} eventos públicos` : 'Sincronizado localmente',
      color: '#06b6d4',
      icon: '🐙'
    },
    {
      title: 'NÍVEL & CONQUISTAS',
      val: `Nv. ${state?.gamification?.level ?? 1}`,
      unit: `(${state?.gamification?.xp ?? 0} XP)`,
      sub: `Ofensiva: ${state?.gamification?.streak?.current ?? 0} dia(s) consecutivos`,
      color: '#f59e0b',
      icon: '🏆'
    }
  ];

  const cardW = 515;
  const cardH = 145;
  const startX = 60;
  const startY = 210;
  const gapX = 50;
  const gapY = 25;

  kpis.forEach((kpi, idx) => {
    const col = idx % 2;
    const row = Math.floor(idx / 2);
    const x = startX + col * (cardW + gapX);
    const y = startY + row * (cardH + gapY);

    // Fundo do card interno
    ctx.fillStyle = 'rgba(255, 255, 255, 0.035)';
    _roundRect(ctx, x, y, cardW, cardH, 14);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Barra lateral de cor
    ctx.fillStyle = kpi.color;
    _roundRect(ctx, x, y + 14, 4, cardH - 28, 2);
    ctx.fill();

    // Rótulo
    ctx.font = '700 12px ui-monospace, SFMono-Regular, monospace';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(`${kpi.icon} ${kpi.title}`, x + 24, y + 36);

    // Valor grande
    ctx.font = '800 42px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(kpi.val, x + 24, y + 90);

    // Unidade
    ctx.font = '600 16px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillStyle = kpi.color;
    const valMetrics = ctx.measureText(kpi.val);
    ctx.fillText(kpi.unit, x + 24 + valMetrics.width + 10, y + 88);

    // Subtítulo
    ctx.font = '500 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.fillText(kpi.sub, x + 24, y + 122);
  });

  // 4. Rodapé
  const footerY = 565;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.beginPath();
  ctx.moveTo(60, footerY);
  ctx.lineTo(width - 60, footerY);
  ctx.stroke();

  ctx.font = '600 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.fillStyle = '#64748b';
  ctx.fillText('Gerado via Painel GitHub · Central Pessoal de Projetos & Foco · 100% Local', 60, footerY + 28);

  ctx.font = '700 13px ui-monospace, SFMono-Regular, monospace';
  ctx.fillStyle = '#a78bfa';
  ctx.textAlign = 'right';
  ctx.fillText('wendell.dev', width - 60, footerY + 28);
  ctx.textAlign = 'left';

  return canvas;
}

/**
 * Renderiza um Cartão de Destaque de Projeto em Canvas 2D (1200x630px).
 */
export function renderProjectHighlightCardToCanvas(project = {}, targetCanvas = null) {
  const width = 1200;
  const height = 630;
  const canvas = targetCanvas || document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  // Fundo
  const bgGrad = ctx.createLinearGradient(0, 0, width, height);
  bgGrad.addColorStop(0, '#090d16');
  bgGrad.addColorStop(1, '#111827');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // Luz ambiente
  const langColor = getLangColor(project.language || '');
  const rad = ctx.createRadialGradient(250, 150, 10, 250, 150, 500);
  rad.addColorStop(0, langColor ? `${langColor}33` : 'rgba(139, 92, 246, 0.25)');
  rad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = rad;
  ctx.fillRect(0, 0, width, height);

  // Borda
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.lineWidth = 2;
  _roundRect(ctx, 24, 24, width - 48, height - 48, 20);
  ctx.stroke();

  // Eyebrow
  ctx.font = '700 13px ui-monospace, monospace';
  ctx.fillStyle = '#a78bfa';
  ctx.fillText('🚀 PROJETO EM DESTAQUE', 60, 85);

  // Nome do projeto
  const icon = project.customIcon ? `${project.customIcon} ` : '📦 ';
  ctx.font = '800 46px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(icon + (project.name || 'Projeto').slice(0, 32), 60, 150);

  // Status & Linguagem
  let curX = 60;
  const statusStr = (project.status || 'em andamento').toUpperCase();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  _roundRect(ctx, curX, 175, 140, 30, 8);
  ctx.fill();
  ctx.font = '700 11px ui-monospace, monospace';
  ctx.fillStyle = '#94a3b8';
  ctx.fillText(`STATUS: ${statusStr}`, curX + 12, 195);
  curX += 155;

  if (project.language) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    _roundRect(ctx, curX, 175, 140, 30, 8);
    ctx.fill();
    ctx.fillStyle = langColor;
    ctx.beginPath();
    ctx.arc(curX + 16, 190, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f1f5f9';
    ctx.fillText(project.language, curX + 28, 195);
    curX += 155;
  }

  if (project.stars > 0) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    _roundRect(ctx, curX, 175, 100, 30, 8);
    ctx.fill();
    ctx.fillStyle = '#fbbf24';
    ctx.fillText(`⭐ ${project.stars}`, curX + 16, 195);
  }

  // Descrição
  ctx.font = '400 20px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.fillStyle = '#94a3b8';
  const desc = project.description || 'Repositório integrante da central de projetos pessoais.';
  _wrapText(ctx, desc, 60, 250, 720, 32, 3);

  // Anel de Saúde Heurística no lado direito (x=960, y=270)
  const health = project.health || { score: 100, label: 'Excelente', confidence: 'alta' };
  const hX = 960;
  const hY = 270;
  const hR = 90;

  ctx.lineWidth = 14;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.beginPath();
  ctx.arc(hX, hY, hR, 0, Math.PI * 2);
  ctx.stroke();

  const scoreFrac = Math.max(0, Math.min(100, health.score)) / 100;
  ctx.strokeStyle = health.score >= 80 ? '#10b981' : health.score >= 50 ? '#f59e0b' : '#ef4444';
  ctx.beginPath();
  ctx.arc(hX, hY, hR, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * scoreFrac);
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.font = '800 48px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(String(health.score), hX, hY + 12);

  ctx.font = '700 13px ui-monospace, monospace';
  ctx.fillStyle = '#94a3b8';
  ctx.fillText('SAÚDE v1.0', hX, hY + 36);

  ctx.font = '600 15px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.fillStyle = health.score >= 80 ? '#34d399' : '#fbbf24';
  ctx.fillText(health.label || 'Estável', hX, hY + 125);
  ctx.textAlign = 'left';

  // Rodapé
  const footerY = 565;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.beginPath();
  ctx.moveTo(60, footerY);
  ctx.lineTo(width - 60, footerY);
  ctx.stroke();

  ctx.font = '600 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.fillStyle = '#64748b';
  ctx.fillText('Gerado via Painel GitHub · Metadados Públicos e Domínio Local', 60, footerY + 28);

  ctx.font = '700 13px ui-monospace, SFMono-Regular, monospace';
  ctx.fillStyle = '#a78bfa';
  ctx.textAlign = 'right';
  ctx.fillText('wendell.dev', width - 60, footerY + 28);
  ctx.textAlign = 'left';

  return canvas;
}

/**
 * Dispara o download de um Canvas como arquivo PNG.
 */
export function downloadCanvasAsPng(canvas, filename = 'cartao-resumo.png') {
  if (!canvas || typeof canvas.toBlob !== 'function') return;
  canvas.toBlob((blob) => {
    if (!blob) return;
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
  }, 'image/png');
}

/**
 * Tenta copiar a imagem do Canvas para a área de transferência do usuário.
 */
export async function copyCanvasImageToClipboard(canvas) {
  if (!canvas || typeof canvas.toBlob !== 'function') {
    throw new Error('Canvas inválido para captura.');
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) return reject(new Error('Falha ao gerar blob de imagem.'));
      try {
        if (navigator.clipboard && window.ClipboardItem) {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
          resolve(true);
        } else {
          reject(new Error('Área de transferência com suporte a imagem não suportada neste navegador.'));
        }
      } catch (err) {
        reject(err);
      }
    }, 'image/png');
  });
}

function _roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function _wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 4) {
  const words = text.split(' ');
  let line = '';
  let lineCount = 0;

  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + ' ';
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && n > 0) {
      ctx.fillText(line.trim(), x, y);
      line = words[n] + ' ';
      y += lineHeight;
      lineCount++;
      if (lineCount >= maxLines - 1 && n < words.length - 1) {
        ctx.fillText(line.trim() + '...', x, y);
        return;
      }
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line.trim(), x, y);
}
