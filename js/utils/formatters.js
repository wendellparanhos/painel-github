/**
 * Formatadores de data, hora e números
 */

export function formatRelativeTime(dateString) {
  if (!dateString) return 'desconhecido';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return 'data inválida';

  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return 'agora';
  if (diffInSeconds < 3600) {
    const mins = Math.floor(diffInSeconds / 60);
    return `há ${mins} min`;
  }
  if (diffInSeconds < 86400) {
    const hours = Math.floor(diffInSeconds / 3600);
    return `há ${hours} h`;
  }
  if (diffInSeconds < 172800) {
    return 'ontem';
  }
  if (diffInSeconds < 2592000) { // 30 dias
    const days = Math.floor(diffInSeconds / 86400);
    return `há ${days} dias`;
  }
  if (diffInSeconds < 31536000) { // 365 dias
    const months = Math.floor(diffInSeconds / 2592000);
    return `há ${months} ${months === 1 ? 'mês' : 'meses'}`;
  }

  const years = Math.floor(diffInSeconds / 31536000);
  return `há ${years} ${years === 1 ? 'ano' : 'anos'}`;
}

export function formatDate(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

export function formatDateTime(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function formatNumber(num) {
  if (num === null || num === undefined) return '0';
  if (num >= 1000) {
    return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  }
  return String(num);
}
