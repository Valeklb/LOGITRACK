export const DEFAULT_COORDS = { lat: -23.55052, lng: -46.6333, accuracy: 0 };

export function getDefaultCoordinates() {
  return { ...DEFAULT_COORDS };
}

export function extractTimeFromIso(iso?: string): string | null {
  if (!iso) return null;
  const time = iso.includes('T') ? iso.split('T')[1] : iso;
  return time?.substring(0, 5) ?? null;
}

export function formatDateBR(value?: string): string {
  if (!value) return '—';
  const datePart = value.includes('T') ? value.split('T')[0] : value;
  const [y, m, d] = datePart.split('-');
  if (!y || !m || !d) return value;
  return `${d}/${m}/${y}`;
}

export function formatTime(value?: string): string {
  if (!value) return '—';
  return value.substring(0, 5);
}
