import type { CurrencyCode } from '../types';

const BRACKET_TIERS = new Set(['high', 'medium', 'low']);

const UPPERCASE_TOKENS: Record<string, string> = {
  gpt: 'GPT',
  llm: 'LLM',
  ai: 'AI',
};

function formatModelWord(word: string): string {
  const lower = word.toLowerCase();
  if (UPPERCASE_TOKENS[lower]) {
    return UPPERCASE_TOKENS[lower];
  }
  if (/^\d+(\.\d+)*$/.test(word)) {
    return word;
  }
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/**
 * 将模型 ID 格式化为人类可读名称，例如：
 * gemini-4-hydrogen-high -> Gemini 4 Hydrogen (High)
 * gemini-4-hydrogen-tiered-high -> Gemini 4 Hydrogen Tiered (High)
 */
export function formatModelName(modelId: string): string {
  const trimmed = (modelId ?? '').trim();
  if (!trimmed) {
    return 'Unknown Model';
  }

  const parts = trimmed.split(/[-_]+/).filter(Boolean);
  if (parts.length === 0) {
    return 'Unknown Model';
  }

  const lastLower = parts[parts.length - 1].toLowerCase();
  if (parts.length > 1 && BRACKET_TIERS.has(lastLower)) {
    const mainWords = parts.slice(0, -1).map(formatModelWord);
    const tierWord = formatModelWord(lastLower);
    return `${mainWords.join(' ')} (${tierWord})`;
  }

  return parts.map(formatModelWord).join(' ');
}

export function getCurrencySymbol(currency: CurrencyCode): string {
  return currency === 'CNY' ? '¥' : '$';
}

/**
 * 格式化货币金额，小额（0 < |x| < 0.01）自动保留 4 位小数
 */
export function formatCurrency(amount: number, currency: CurrencyCode): string {
  const symbol = getCurrencySymbol(currency);
  if (!Number.isFinite(amount) || amount === 0) {
    return `${symbol}0.00`;
  }

  const sign = amount < 0 ? '-' : '';
  const abs = Math.abs(amount);

  if (abs < 0.01) {
    return `${sign}${symbol}${abs.toFixed(4)}`;
  }

  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(abs);

  return `${sign}${symbol}${formatted}`;
}

export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return '0';
  }
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
  }).format(Math.round(value));
}

function cleanCompactDecimal(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace(/\.0$/, '');
}

/**
 * 紧凑数字格式化（用于图表 Y 轴，如 200M, 100K）
 */
export function formatCompactNumber(value: number): string {
  if (!Number.isFinite(value) || value === 0) {
    return '0';
  }
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);

  if (abs >= 1_000_000_000) {
    return `${sign}${cleanCompactDecimal(abs / 1_000_000_000)}B`;
  }
  if (abs >= 1_000_000) {
    return `${sign}${cleanCompactDecimal(abs / 1_000_000)}M`;
  }
  if (abs >= 1_000) {
    return `${sign}${cleanCompactDecimal(abs / 1_000)}K`;
  }
  if (abs < 1) {
    return `${sign}${Number(abs.toFixed(2))}`;
  }
  return `${sign}${cleanCompactDecimal(abs)}`;
}

export function formatPercent(ratio: number, decimals = 1): string {
  if (!Number.isFinite(ratio)) {
    return '0.0%';
  }
  return `${(ratio * 100).toFixed(decimals)}%`;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function toLocalDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = pad2(date.getMonth() + 1);
  const d = pad2(date.getDate());
  return `${y}-${m}-${d}`;
}

export function toLocalHourKey(date: Date): string {
  return `${pad2(date.getHours())}:00`;
}

/**
 * 将 YYYY-MM-DD 转为 MM/DD 或 M/D（参考图格式如 10/26, 11/5），小时键保持 HH:00
 */
export function formatShortDate(bucketKey: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(bucketKey);
  if (match) {
    return `${Number(match[2])}/${Number(match[3])}`;
  }
  return bucketKey;
}

export function formatDateTime(isoString: string): string {
  if (!isoString) {
    return '—';
  }
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return `${toLocalDateKey(date)} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export function formatTimeOnly(isoString: string): string {
  if (!isoString) {
    return '—';
  }
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}
