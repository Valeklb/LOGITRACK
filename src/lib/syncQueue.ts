/**
 * Fila offline de eventos de OS (Iniciar/Finalizar viagem).
 *
 * Regras:
 * - Processa só os itens do usuário atual, em ordem, um por vez.
 * - Para no primeiro item que não passou por falta de rede/timeout/401/408/429/5xx (tenta de novo depois).
 * - Descarta apenas em 400/403/404/409 (guardando na lista "não enviados") ou quando o servidor
 *   responde `duplicate: true` (já estava registrado).
 */
import { api, ApiError } from './api';
import { emitDataChanged } from './events';

const QUEUE_KEY = 'logitrack_sync_queue_v2';
const REJECTED_KEY = 'logitrack_sync_rejected_v2';
const LEGACY_QUEUE_KEY = 'logitrack_sync_queue';

export interface SyncItem {
  id: string;
  userId: number;
  osId: number;
  /** Corpo do POST /api/os/:osId/event */
  payload: Record<string, any>;
  createdAt: string;
}

export interface RejectedSyncItem extends SyncItem {
  error: string;
  rejectedAt: string;
}

const DISCARD_STATUSES = [400, 403, 404, 409];

// --- armazenamento ---

let legacyCleaned = false;

function isSyncItem(value: any): value is SyncItem {
  return (
    !!value &&
    typeof value.id === 'string' &&
    typeof value.userId === 'number' &&
    typeof value.osId === 'number' &&
    !!value.payload &&
    typeof value.payload === 'object' &&
    typeof value.createdAt === 'string'
  );
}

function readList<T extends SyncItem>(key: string): T[] {
  try {
    if (!legacyCleaned) {
      legacyCleaned = true;
      localStorage.removeItem(LEGACY_QUEUE_KEY);
    }
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed.filter(isSyncItem) as T[]) : [];
  } catch {
    return [];
  }
}

function writeList(key: string, list: SyncItem[]): void {
  try {
    if (list.length === 0) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(list));
  } catch {
    // Armazenamento cheio/indisponível.
  }
}

// --- assinantes ---

const subscribers = new Set<() => void>();
let storageListening = false;

function notify(): void {
  subscribers.forEach((cb) => {
    try {
      cb();
    } catch (err) {
      console.error('Erro ao avisar mudança da fila', err);
    }
  });
}

export function subscribe(cb: () => void): () => void {
  subscribers.add(cb);
  if (!storageListening) {
    storageListening = true;
    // Mudança feita em outra aba.
    window.addEventListener('storage', (e) => {
      if (e.key === QUEUE_KEY || e.key === REJECTED_KEY) notify();
    });
  }
  return () => {
    subscribers.delete(cb);
  };
}

// --- API pública ---

export function enqueue(userId: number, osId: number, payload: Record<string, any>): SyncItem {
  const item: SyncItem = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    userId,
    osId,
    payload,
    createdAt: new Date().toISOString(),
  };
  writeList(QUEUE_KEY, [...readList<SyncItem>(QUEUE_KEY), item]);
  notify();
  return item;
}

export function pending(userId: number, osId?: number): SyncItem[] {
  return readList<SyncItem>(QUEUE_KEY).filter(
    (item) => item.userId === userId && (osId === undefined || item.osId === osId),
  );
}

export function rejected(userId: number): RejectedSyncItem[] {
  return readList<RejectedSyncItem>(REJECTED_KEY).filter((item) => item.userId === userId);
}

export function dismissRejected(id: string): void {
  writeList(
    REJECTED_KEY,
    readList<RejectedSyncItem>(REJECTED_KEY).filter((item) => item.id !== id),
  );
  notify();
}

function removeFromQueue(id: string): void {
  writeList(
    QUEUE_KEY,
    readList<SyncItem>(QUEUE_KEY).filter((item) => item.id !== id),
  );
}

function moveToRejected(item: SyncItem, error: string): void {
  removeFromQueue(item.id);
  const entry: RejectedSyncItem = { ...item, error, rejectedAt: new Date().toISOString() };
  writeList(REJECTED_KEY, [...readList<RejectedSyncItem>(REJECTED_KEY), entry]);
}

let inFlight: Promise<void> | null = null;

/** Envia os itens pendentes do usuário. Chamadas simultâneas reaproveitam o envio em andamento. */
export function process(userId: number): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = run(userId).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function run(userId: number): Promise<void> {
  // Limite de segurança contra laço infinito (cada volta remove um item ou para).
  for (let guard = 0; guard < 500; guard++) {
    const item = pending(userId)[0];
    if (!item) return;

    try {
      await api(`/api/os/${item.osId}/event`, {
        method: 'POST',
        body: item.payload,
        skipAuthHandler: true,
      });
      // Sucesso ou `duplicate: true` (já registrado): sai da fila.
      removeFromQueue(item.id);
      notify();
      emitDataChanged(item.osId);
    } catch (err) {
      if (
        err instanceof ApiError &&
        DISCARD_STATUSES.includes(err.status) &&
        err.code !== 'PASSWORD_CHANGE_REQUIRED'
      ) {
        moveToRejected(item, err.message);
        notify();
        emitDataChanged(item.osId);
        continue;
      }
      // Sem rede, timeout, 401, 408, 429, 5xx ou erro inesperado: mantém e para.
      return;
    }
  }
}

export const syncQueue = { enqueue, pending, rejected, dismissRejected, process, subscribe };
