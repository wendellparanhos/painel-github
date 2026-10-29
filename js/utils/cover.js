/**
 * Gerador de capas determinísticas e leves.
 * A capa de cada projeto é derivada exclusivamente do ID numérico do repo
 * e de um "coverSeed" pessoal armazenado localmente.
 * O cache de capa fica em um Map em memória (invalida-se ao trocar o seed).
 */

// Cache em memória: chave = `${repoId}-${coverSeed}`
const coverCache = new Map();

/**
 * Hash FNV-1a de 32 bits sobre uma string
 * Produz número estável e determinístico sem precisar de crypto
 */
function fnv1a(str) {
  let hash = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash;
}

/**
 * Converte um número [0, 1] em um valor de ângulo em graus
 */
function toAngle(frac) {
  return Math.round(frac * 360);
}

/**
 * Gera um CSS gradient determinístico a partir do ID do repo e do seed.
 * Retorna um objeto { gradient, stops } pronto para uso como background.
 *
 * @param {string|number} repoId  — ID numérico do repositório
 * @param {number} coverSeed      — semente pessoal (0–9999)
 * @returns {{ gradient: string, angle: number, stops: string[] }}
 */
export function generateCoverGradient(repoId, coverSeed = 0) {
  const cacheKey = `${repoId}-${coverSeed}`;

  if (coverCache.has(cacheKey)) {
    return coverCache.get(cacheKey);
  }

  // Combina ID + seed para garantir unicidade entre projetos com mesma seed
  const baseStr = `${repoId}::${coverSeed}`;
  const h1 = fnv1a(baseStr);
  const h2 = fnv1a(baseStr + '_b');
  const h3 = fnv1a(baseStr + '_c');
  const h4 = fnv1a(baseStr + '_d');
  const h5 = fnv1a(baseStr + '_e');

  // Gera 3 cores HSL com saturação e luminosidade ajustadas para parecer premium
  const hue1 = h1 % 360;
  const hue2 = h2 % 360;
  const hue3 = h3 % 360;

  const sat1 = 55 + (h4 % 30);   // 55–84%
  const sat2 = 50 + (h5 % 35);   // 50–84%

  const light1 = 35 + (h1 % 20); // 35–54%
  const light2 = 30 + (h2 % 25); // 30–54%

  const angle = toAngle((h3 % 90 + 100) / 360); // ângulo entre 100–190°

  const color1 = `hsl(${hue1}, ${sat1}%, ${light1}%)`;
  const color2 = `hsl(${hue2}, ${sat2}%, ${light2}%)`;
  const color3 = `hsl(${hue3}, ${sat1}%, ${light1 + 8}%)`;

  const gradient = `linear-gradient(${angle}deg, ${color1} 0%, ${color2} 55%, ${color3} 100%)`;

  const result = { gradient, angle, stops: [color1, color2, color3] };
  coverCache.set(cacheKey, result);
  return result;
}

/**
 * Invalida o cache para um projeto específico (ex.: quando o seed muda)
 * @param {string|number} repoId
 * @param {number} oldSeed
 */
export function invalidateCoverCache(repoId, oldSeed) {
  const cacheKey = `${repoId}-${oldSeed}`;
  coverCache.delete(cacheKey);
}

/**
 * Aplica o gradiente como background-image em um elemento DOM
 * @param {HTMLElement} element
 * @param {string|number} repoId
 * @param {number} coverSeed
 */
export function applyCover(element, repoId, coverSeed = 0) {
  const { gradient } = generateCoverGradient(repoId, coverSeed);
  element.style.backgroundImage = gradient;
}
