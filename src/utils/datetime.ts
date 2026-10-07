export const MANAUS_TZ = 'America/Manaus';

type DateInput = string | null | undefined;

const manausPartsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: MANAUS_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

interface ManausParts {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
}

function manausParts(date: Date): ManausParts {
  const parts = manausPartsFormatter.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  // Alguns navegadores devolvem "24" para meia-noite.
  const hour = get('hour') === '24' ? '00' : get('hour');
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour,
    minute: get('minute'),
    second: get('second'),
  };
}

/** Data/hora atual em Manaus no formato 'YYYY-MM-DDTHH:mm:ss' (sem fuso). */
export function nowInManausISO(): string {
  const p = manausParts(new Date());
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
}

/** Data de hoje em Manaus: 'YYYY-MM-DD'. */
export function todayInManaus(): string {
  return nowInManausISO().slice(0, 10);
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const TIME_ONLY = /^\d{2}:\d{2}(:\d{2})?$/;
const SQLITE_DATETIME = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2}(\.\d+)?)?$/;
const LOCAL_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/;
const HAS_ZONE = /(Z|[+-]\d{2}(:?\d{2})?)$/i;

/**
 * Converte datas guardadas no banco/cliente para Date:
 * - 'YYYY-MM-DD HH:MM(:SS)' (CURRENT_TIMESTAMP do SQLite) → UTC
 * - ISO com 'Z' ou deslocamento → como veio
 * - 'YYYY-MM-DDTHH:mm(:ss)' sem fuso (local_time do celular) → horário de Manaus (-04:00)
 * - 'YYYY-MM-DD' → meia-noite em Manaus
 */
export function parseStoredDateTime(value: DateInput): Date | null {
  if (!value || typeof value !== 'string') return null;
  const v = value.trim();
  let parsed: Date;

  if (DATE_ONLY.test(v)) {
    parsed = new Date(`${v}T00:00:00-04:00`);
  } else if (SQLITE_DATETIME.test(v)) {
    parsed = new Date(`${v.replace(' ', 'T')}Z`);
  } else if (LOCAL_ISO.test(v)) {
    parsed = new Date(`${v}-04:00`);
  } else if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(v) && HAS_ZONE.test(v)) {
    parsed = new Date(v.replace(' ', 'T'));
  } else {
    parsed = new Date(v);
  }

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** 'YYYY-MM-DD' (em Manaus) de uma data guardada; null se inválida. */
export function dateKeyInManaus(value: DateInput): string | null {
  if (!value) return null;
  if (DATE_ONLY.test(value.trim())) return value.trim();
  const parsed = parseStoredDateTime(value);
  if (!parsed) return null;
  const p = manausParts(parsed);
  return `${p.year}-${p.month}-${p.day}`;
}

export function isTodayInManaus(value: DateInput): boolean {
  const key = dateKeyInManaus(value);
  return key !== null && key === todayInManaus();
}

/** '07/10/2026 14:05' */
export function formatDateTimeManaus(value?: DateInput): string {
  if (!value) return '—';
  const parsed = parseStoredDateTime(value);
  if (!parsed) return value;
  const p = manausParts(parsed);
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}

/** '07/10/2026' */
export function formatDateManaus(value?: DateInput): string {
  if (!value) return '—';
  const v = value.trim();
  if (DATE_ONLY.test(v)) {
    const [y, m, d] = v.split('-');
    return `${d}/${m}/${y}`;
  }
  const parsed = parseStoredDateTime(v);
  if (!parsed) return value;
  const p = manausParts(parsed);
  return `${p.day}/${p.month}/${p.year}`;
}

/** 'HH:MM' — aceita só horário ('08:30', '08:30:00') ou data/hora completa. */
export function formatTimeManaus(value?: DateInput): string {
  if (!value) return '—';
  const v = value.trim();
  if (TIME_ONLY.test(v)) return v.substring(0, 5);
  const parsed = parseStoredDateTime(v);
  if (!parsed) return value;
  const p = manausParts(parsed);
  return `${p.hour}:${p.minute}`;
}

/** Hoje → '08:40'; outro dia → '06/10 08:40'. Útil para "Em turno desde…". */
export function formatShortDateTimeManaus(value?: DateInput): string {
  if (!value) return '—';
  const parsed = parseStoredDateTime(value);
  if (!parsed) return value;
  const p = manausParts(parsed);
  const time = `${p.hour}:${p.minute}`;
  return isTodayInManaus(value) ? time : `${p.day}/${p.month} ${time}`;
}

/** '08:00 → 12:00' (usa '—' para o que faltar). */
export function formatTimeRange(start?: DateInput, end?: DateInput): string {
  return `${formatTimeManaus(start)} → ${formatTimeManaus(end)}`;
}

export function eventDisplayTime(localTime?: DateInput, serverTime?: DateInput): string {
  return formatDateTimeManaus(localTime || serverTime);
}

// --- Números (padrão brasileiro) ---

const currencyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** 'R$ 1.234,50' ou '—' quando vazio. */
export function formatCurrencyBR(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return currencyFormatter.format(value);
}

/** '1.234,5' — até `decimals` casas decimais; '—' quando vazio. */
export function formatNumberBR(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(value);
}

/**
 * Lê número digitado no padrão brasileiro (ou com ponto decimal).
 * '1.200,50' → 1200.5 · '1200,5' → 1200.5 · '1200.5' → 1200.5 · '1.200' → 1200 · '' → null
 * Retorna `undefined` quando o texto é inválido (inclui números negativos).
 */
export function parseDecimalBR(input: string | number | null | undefined): number | null | undefined {
  if (input === null || input === undefined) return null;
  if (typeof input === 'number') return Number.isFinite(input) && input >= 0 ? input : undefined;

  const s = input.replace(/R\$/gi, '').replace(/\s+/g, '');
  if (s === '') return null;

  let normalized: string;
  const hasComma = s.includes(',');
  const hasDot = s.includes('.');

  if (hasComma && hasDot) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      // 1.200,50
      if (!/^\d{1,3}(\.\d{3})+,\d+$/.test(s)) return undefined;
      normalized = s.replace(/\./g, '').replace(',', '.');
    } else {
      // 1,200.50
      if (!/^\d{1,3}(,\d{3})+\.\d+$/.test(s)) return undefined;
      normalized = s.replace(/,/g, '');
    }
  } else if (hasComma) {
    if (!/^\d+,\d+$/.test(s) && !/^\d+,$/.test(s)) return undefined;
    normalized = s.replace(',', '.').replace(/\.$/, '');
  } else if (hasDot) {
    if (/^[1-9]\d{0,2}(\.\d{3})+$/.test(s)) {
      // 1.200 / 1.200.000 → milhar
      normalized = s.replace(/\./g, '');
    } else if (/^\d+\.\d+$/.test(s) || /^\d+\.$/.test(s)) {
      normalized = s.replace(/\.$/, '');
    } else {
      return undefined;
    }
  } else {
    if (!/^\d+$/.test(s)) return undefined;
    normalized = s;
  }

  const n = Number(normalized);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}
