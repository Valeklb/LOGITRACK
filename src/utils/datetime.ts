export const MANAUS_TZ = 'America/Manaus';

export function nowInManausISO(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: MANAUS_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date());

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`;
}

function parseStoredDateTime(value: string): Date | null {
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value) && !value.endsWith('Z') && !/[+-]\d{2}:\d{2}$/.test(value)) {
    return new Date(`${value}-04:00`);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatDateTimeManaus(value?: string): string {
  if (!value) return '—';
  const parsed = parseStoredDateTime(value);
  if (!parsed) return value;

  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: MANAUS_TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(parsed);
}

export function formatDateManaus(value?: string): string {
  if (!value) return '—';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-');
    return `${d}/${m}/${y}`;
  }
  const parsed = parseStoredDateTime(value);
  if (!parsed) return value;
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: MANAUS_TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(parsed);
}

export function formatTimeRange(start?: string, end?: string): string {
  const fmt = (t?: string) => (t ? t.substring(0, 5) : '—');
  return `${fmt(start)} → ${fmt(end)}`;
}

export function eventDisplayTime(localTime?: string, serverTime?: string): string {
  return formatDateTimeManaus(localTime || serverTime);
}
