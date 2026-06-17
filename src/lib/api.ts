const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

export function apiUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE}${normalized}`;
}

export function wsUrl(userId: number): string {
  const wsBase = (import.meta.env.VITE_WS_URL ?? API_BASE).replace(/\/$/, '');

  if (wsBase) {
    const httpBase = wsBase.startsWith('ws')
      ? wsBase.replace(/^ws/i, 'http')
      : wsBase.startsWith('http')
        ? wsBase
        : `https://${wsBase}`;
    const url = new URL(httpBase);
    const protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${url.host}?userId=${userId}`;
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}?userId=${userId}`;
}
