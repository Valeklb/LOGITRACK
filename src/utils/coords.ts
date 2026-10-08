import { formatDateManaus, formatTimeManaus } from './datetime';

/** 'HH:MM' de um ISO ('2026-10-07T08:30:00') ou de um horário ('08:30'). */
export function extractTimeFromIso(iso?: string | null): string | null {
  if (!iso) return null;
  const time = iso.includes('T') ? iso.split('T')[1] : iso.includes(' ') ? iso.split(' ')[1] : iso;
  return time?.substring(0, 5) || null;
}

/** 'dd/mm/aaaa' — aceita 'YYYY-MM-DD', 'YYYY-MM-DD HH:MM:SS' (UTC) e ISO. */
export function formatDateBR(value?: string | null): string {
  return formatDateManaus(value);
}

/** 'HH:MM' — aceita horário ('08:30:00') ou data/hora completa. */
export function formatTime(value?: string | null): string {
  return formatTimeManaus(value);
}
