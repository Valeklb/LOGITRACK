/** Aviso interno "os dados mudaram" (WebSocket, fila offline, ações locais). */

export const DATA_CHANGED_EVENT = 'logitrack:data-changed';

export function emitDataChanged(osId?: number | null): void {
  window.dispatchEvent(new CustomEvent(DATA_CHANGED_EVENT, { detail: { osId: osId ?? null } }));
}

export function onDataChanged(cb: (osId?: number | null) => void): () => void {
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<{ osId?: number | null }>).detail;
    cb(detail?.osId ?? null);
  };
  window.addEventListener(DATA_CHANGED_EVENT, listener);
  return () => window.removeEventListener(DATA_CHANGED_EVENT, listener);
}
