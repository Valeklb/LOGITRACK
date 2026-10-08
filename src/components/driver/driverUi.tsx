/** Peças compartilhadas pelas telas do motorista (status com fila offline, avisos de envio). */
import React from 'react';
import { AlertCircle, CloudOff, WifiOff } from 'lucide-react';
import type { OSStatus, ServiceOrder } from '../../types';
import type { RejectedSyncItem, SyncItem } from '../../lib/syncQueue';
import { cacheGet, cacheSet } from '../../lib/offlineCache';
import { formatShortDateTimeManaus, formatTimeManaus } from '../../utils/datetime';
import { Badge, statusLabel } from '../common/UI';

export const QUEUED_MESSAGE = 'Sem internet: registro salvo neste aparelho e será enviado automaticamente.';

export interface EffectiveStatus {
  status: OSStatus;
  /** true quando o status vem de um registro ainda não enviado (fila offline). */
  pending: boolean;
}

/** Status do servidor + registros ainda na fila (COLETA → Em rota, ENTREGA → Finalizada). */
export function effectiveStatus(os: Pick<ServiceOrder, 'status'>, queued: SyncItem[]): EffectiveStatus {
  if (os.status === 'FECHADA' || os.status === 'CANCELADA') return { status: os.status, pending: false };
  const types = new Set(queued.map((item) => item.payload?.type));
  if (types.has('ENTREGA')) return { status: 'FECHADA', pending: true };
  if (types.has('COLETA') && os.status !== 'EM_ROTA') return { status: 'EM_ROTA', pending: true };
  return { status: os.status, pending: false };
}

export function isActiveStatus(status: OSStatus): boolean {
  return status === 'ABERTA' || status === 'EM_COLETA' || status === 'EM_ROTA';
}

/** Horário previsto ('08:00 → 12:00', '08:00', 'até 12:00') ou null. */
export function previstoText(os: Pick<ServiceOrder, 'os_start_time' | 'os_end_time'>): string | null {
  const start = os.os_start_time ? formatTimeManaus(os.os_start_time) : null;
  const end = os.os_end_time ? formatTimeManaus(os.os_end_time) : null;
  if (start && end) return `${start} → ${end}`;
  if (start) return start;
  if (end) return `até ${end}`;
  return null;
}

// Número das OS já vistas neste aparelho (para nomear "não enviados" de OS que saíram da lista).
const OS_NUMBERS_KEY = 'os-numbers';

function readOsNumbers(userId: number): Record<string, string> {
  const map = cacheGet<Record<string, string>>(userId, OS_NUMBERS_KEY);
  return map && typeof map === 'object' && !Array.isArray(map) ? map : {};
}

export function rememberOsNumbers(userId: number, list: Pick<ServiceOrder, 'id' | 'os_number'>[]): void {
  const map = readOsNumbers(userId);
  let changed = false;
  for (const os of list) {
    if (map[os.id] !== os.os_number) {
      map[os.id] = os.os_number;
      changed = true;
    }
  }
  if (changed) cacheSet(userId, OS_NUMBERS_KEY, map);
}

export function rememberedOsNumber(userId: number, osId: number): string | undefined {
  return readOsNumbers(userId)[osId];
}

const EVENT_LABELS: Record<string, string> = {
  COLETA: 'Início da viagem',
  ENTREGA: 'Fim da viagem',
};

export function eventLabel(type: unknown): string {
  return (typeof type === 'string' && EVENT_LABELS[type]) || 'Registro';
}

/** Selo de status; quando vem da fila mostra "Em rota (pendente envio)". */
export const StatusPill = ({ eff }: { eff: EffectiveStatus }) =>
  eff.pending ? (
    <span className="inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-semibold px-2 py-0.5 rounded-full border border-dashed border-amber-300 bg-amber-50 text-amber-800">
      <CloudOff size={12} />
      {statusLabel(eff.status)} (pendente envio)
    </span>
  ) : (
    <Badge status={eff.status} />
  );

/** Etiqueta pequena "aguardando envio". */
export const PendingTag = () => (
  <span className="inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-semibold px-2 py-0.5 rounded-full border border-dashed border-amber-300 bg-amber-50 text-amber-800">
    <CloudOff size={12} /> aguardando envio
  </span>
);

/** Faixa amarela "sem conexão". */
export const OfflineStrip = ({ message = 'Sem conexão — mostrando dados salvos' }: { message?: string }) => (
  <div
    role="status"
    className="bg-amber-100 border border-amber-200 text-amber-900 text-sm font-medium px-3 py-2 rounded-xl flex items-center gap-2"
  >
    <WifiOff size={16} className="shrink-0" />
    {message}
  </div>
);

/** Registros esperando internet para serem enviados. */
export const PendingSyncBanner = ({
  count,
  onSendNow,
  sending = false,
}: {
  count: number;
  onSendNow?: () => void;
  sending?: boolean;
}) => {
  if (count <= 0) return null;
  return (
    <div role="status" className="bg-amber-50 border border-amber-200 p-3 rounded-2xl flex items-center gap-3">
      <div className="p-2 bg-amber-100 text-amber-700 rounded-xl shrink-0">
        <CloudOff size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-amber-900">
          {count} {count === 1 ? 'registro aguardando' : 'registros aguardando'} internet
        </p>
        <p className="text-xs text-amber-800">Serão enviados automaticamente quando a conexão voltar.</p>
      </div>
      {onSendNow && (
        <button
          type="button"
          onClick={onSendNow}
          disabled={sending}
          className="shrink-0 min-h-11 px-3 rounded-xl text-sm font-bold text-amber-900 bg-amber-100 hover:bg-amber-200 disabled:opacity-60"
        >
          {sending ? 'Enviando…' : 'Enviar agora'}
        </button>
      )}
    </div>
  );
};

/** Lista vermelha dos registros que o servidor recusou ("não enviados"). */
export const RejectedSyncList = ({
  items,
  osNumberFor,
  onDismiss,
}: {
  items: RejectedSyncItem[];
  osNumberFor?: (osId: number) => string | null | undefined;
  onDismiss: (id: string) => void;
}) => {
  if (items.length === 0) return null;
  return (
    <div role="alert" className="bg-red-50 border border-red-200 p-3 rounded-2xl space-y-2">
      <p className="text-sm font-bold text-red-800 flex items-center gap-2">
        <AlertCircle size={18} className="shrink-0" />
        {items.length === 1 ? '1 registro não enviado' : `${items.length} registros não enviados`}
      </p>
      <ul className="space-y-2">
        {items.map((item) => {
          const osNumber = osNumberFor?.(item.osId);
          return (
            <li key={item.id} className="bg-white border border-red-100 rounded-xl p-3 flex items-start gap-3">
              <div className="flex-1 min-w-0 text-sm">
                <p className="font-semibold text-zinc-900">
                  {osNumber ? `OS #${osNumber}` : 'OS'} · {eventLabel(item.payload?.type)}
                </p>
                <p className="text-red-700">{item.error}</p>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Registrado em {formatShortDateTimeManaus(item.createdAt)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onDismiss(item.id)}
                className="shrink-0 min-h-11 px-3 rounded-xl text-sm font-semibold text-red-700 hover:bg-red-100"
              >
                Dispensar
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
