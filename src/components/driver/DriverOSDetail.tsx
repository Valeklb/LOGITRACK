import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock,
  ExternalLink,
  Flag,
  Info,
  Loader2,
  MessageSquareText,
  Navigation,
  Package,
  PackageOpen,
  Play,
  SearchX,
  ShieldOff,
  Truck,
  XCircle,
} from 'lucide-react';
import type { ServiceOrder } from '../../types';
import { api, ApiError, errorMessage } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { emitDataChanged, onDataChanged } from '../../lib/events';
import { syncQueue } from '../../lib/syncQueue';
import { cacheGet, cacheSet } from '../../lib/offlineCache';
import { formatDateBR } from '../../utils/coords';
import { mapUrlForDestination } from '../../utils/maps';
import { formatTimeManaus, isTodayInManaus, nowInManausISO } from '../../utils/datetime';
import { Badge, Button, EmptyState, ErrorBanner, Input, Spinner } from '../common/UI';
import { normalizePlate } from '../common/ChecklistForm';
import {
  effectiveStatus,
  OfflineStrip,
  PendingTag,
  previstoText,
  QUEUED_MESSAGE,
  RejectedSyncList,
  rememberOsNumbers,
} from './driverUi';

const REFRESH_INTERVAL_MS = 30000;
const DATA_CHANGED_DEBOUNCE_MS = 300;

type TrailerState = 'CHEIA' | 'VAZIA';
type ViewState = 'loading' | 'ready' | 'forbidden' | 'notfound' | 'error';
type SendResult = 'sent' | 'queued' | 'failed';

interface Notice {
  kind: 'queued' | 'error';
  text: string;
}

/** Erros em que vale guardar o registro e tentar de novo depois. */
function isRetryable(err: unknown): boolean {
  if (!(err instanceof ApiError)) return false;
  return err.status === 0 || err.status === 408 || err.status === 429 || err.status >= 500;
}

const bigButton =
  'min-h-14 rounded-2xl font-black uppercase tracking-wider text-white flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-60 disabled:active:scale-100';

/** O `key` recria a tela ao trocar de OS (ex.: tocar num aviso de outra OS). */
export const DriverOSDetail = () => {
  const { id = '' } = useParams<{ id: string }>();
  return (
    <React.Fragment key={id}>
      <DriverOSDetailView idParam={id} />
    </React.Fragment>
  );
};

const DriverOSDetailView = ({ idParam }: { idParam: string }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const osId = Number(idParam);
  const validId = Number.isInteger(osId) && osId > 0;

  const [os, setOs] = useState<ServiceOrder | null>(null);
  const [view, setView] = useState<ViewState>(validId ? 'loading' : 'notfound');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [, setQueueTick] = useState(0);

  const [starting, setStarting] = useState(false);
  const [trailerState, setTrailerState] = useState<TrailerState | null>(null);
  const [trailerPlate, setTrailerPlate] = useState('');
  const [formTried, setFormTried] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const submittingRef = useRef(false);
  const seqRef = useRef(0);
  const hasDataRef = useRef(false);
  const formRef = useRef<HTMLDivElement>(null);

  const goHome = useCallback(() => navigate('/motorista'), [navigate]);

  const load = useCallback(async () => {
    if (!userId || !validId) return;
    const seq = ++seqRef.current;
    const cacheKey = `os-${osId}`;
    try {
      const data = await api<ServiceOrder>(`/api/os/${osId}`);
      if (seq !== seqRef.current) return;
      cacheSet(userId, cacheKey, data);
      rememberOsNumbers(userId, [data]);
      hasDataRef.current = true;
      setOs(data);
      setOffline(false);
      setLoadError(null);
      setView('ready');
    } catch (err) {
      if (seq !== seqRef.current) return;
      const status = err instanceof ApiError ? err.status : -1;

      if (status === 0) {
        // Sem conexão: mantém o que está na tela ou usa o que foi salvo (detalhe ou lista).
        if (!hasDataRef.current) {
          const list = cacheGet<ServiceOrder[]>(userId, 'os-list');
          const cached =
            cacheGet<ServiceOrder>(userId, cacheKey) ??
            (Array.isArray(list) ? list.find((item) => item.id === osId) : undefined) ??
            null;
          if (cached) {
            hasDataRef.current = true;
            setOs(cached);
          }
        }
        setOffline(true);
        if (hasDataRef.current) {
          setLoadError(null);
          setView('ready');
        } else {
          setLoadError('Sem conexão, e esta OS ainda não foi aberta neste aparelho. Conecte-se à internet e tente de novo.');
          setView('error');
        }
        return;
      }

      if ((status === 403 && (err as ApiError).code !== 'PASSWORD_CHANGE_REQUIRED') || status === 404) {
        cacheSet(userId, cacheKey, null);
        hasDataRef.current = false;
        setOs(null);
        setView(status === 403 ? 'forbidden' : 'notfound');
        return;
      }

      setLoadError(errorMessage(err, 'Não foi possível carregar a OS. Tente de novo.'));
      if (!hasDataRef.current) setView('error');
    }
  }, [userId, osId, validId]);

  // Primeira carga + atualização automática.
  useEffect(() => {
    void load();
    let debounce: number | undefined;
    const offChanged = onDataChanged((changedId) => {
      if (changedId != null && changedId !== osId) return;
      window.clearTimeout(debounce);
      debounce = window.setTimeout(() => void load(), DATA_CHANGED_DEBOUNCE_MS);
    });
    const interval = window.setInterval(() => {
      if (document.visibilityState !== 'hidden') void load();
    }, REFRESH_INTERVAL_MS);
    return () => {
      offChanged();
      window.clearTimeout(debounce);
      window.clearInterval(interval);
    };
  }, [load, osId]);

  // Fila offline mudou → redesenha o status.
  useEffect(() => syncQueue.subscribe(() => setQueueTick((t) => t + 1)), []);

  // Mostra o formulário de início ao abrir.
  useEffect(() => {
    if (starting) formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [starting]);

  if (!user) return null;

  const queued = validId ? syncQueue.pending(user.id, osId) : [];
  const rejectedHere = validId ? syncQueue.rejected(user.id).filter((item) => item.osId === osId) : [];
  const eff = os ? effectiveStatus(os, queued) : null;

  // --- Envio de eventos (direto ou pela fila offline) ---

  const sendEvent = async (payload: Record<string, unknown>): Promise<SendResult> => {
    if (submittingRef.current) return 'failed';
    submittingRef.current = true;
    setSubmitting(true);
    setNotice(null);

    const enqueue = () => {
      syncQueue.enqueue(user.id, osId, payload);
      setNotice({ kind: 'queued', text: QUEUED_MESSAGE });
      // Caso a conexão já tenha voltado.
      void syncQueue.process(user.id);
    };

    try {
      if (!navigator.onLine) {
        enqueue();
        return 'queued';
      }

      // Ainda há registro desta OS na fila: entra atrás dele para manter a ordem.
      if (syncQueue.pending(user.id, osId).length > 0) {
        syncQueue.enqueue(user.id, osId, payload);
        await syncQueue.process(user.id);
        if (syncQueue.pending(user.id, osId).length > 0) {
          setNotice({ kind: 'queued', text: QUEUED_MESSAGE });
          return 'queued';
        }
        await load();
        return 'sent';
      }

      try {
        const res = await api<{ os?: ServiceOrder; duplicate?: boolean }>(`/api/os/${osId}/event`, {
          method: 'POST',
          body: payload,
        });
        if (res?.os) setOs((prev) => (prev ? { ...prev, ...res.os } : res.os!));
        emitDataChanged(osId);
        await load();
        return 'sent';
      } catch (err) {
        if (isRetryable(err)) {
          enqueue();
          return 'queued';
        }
        if (err instanceof ApiError && err.status === 403 && err.code !== 'PASSWORD_CHANGE_REQUIRED') {
          setOs(null);
          setView('forbidden');
          return 'failed';
        }
        setNotice({ kind: 'error', text: errorMessage(err, 'Não foi possível registrar. Tente de novo.') });
        if (err instanceof ApiError && (err.status === 409 || err.status === 404)) await load();
        return 'failed';
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const openStartForm = () => {
    setTrailerPlate((os?.plate ?? '').toUpperCase());
    setTrailerState(null);
    setFormTried(false);
    setNotice(null);
    setStarting(true);
  };

  const handleStartTrip = async () => {
    if (submittingRef.current) return;
    setFormTried(true);
    const plate = normalizePlate(trailerPlate);
    if (!trailerState || !plate) return;
    const result = await sendEvent({
      type: 'COLETA',
      local_time: nowInManausISO(),
      plate,
      trailer_state: trailerState,
    });
    if (result !== 'failed') {
      setStarting(false);
      setFormTried(false);
    }
  };

  const handleFinishTrip = async () => {
    if (submittingRef.current) return;
    if (!window.confirm('Confirmar a entrega e finalizar esta viagem?')) return;
    await sendEvent({ type: 'ENTREGA', local_time: nowInManausISO() });
  };

  // --- Telas de estado (carregando / sem acesso / não encontrada / erro) ---

  const header = (
    <header className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-zinc-100 pt-safe">
      <div className="flex items-center gap-2 px-2 py-2">
        <button
          type="button"
          onClick={goHome}
          aria-label="Voltar para minhas OS"
          title="Voltar"
          className="min-w-11 min-h-11 flex items-center justify-center rounded-full text-zinc-700 hover:bg-zinc-100"
        >
          <ArrowLeft size={24} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-black text-zinc-900 truncate">
              {os ? `OS #${os.os_number}` : 'Ordem de serviço'}
            </h1>
            {eff && <Badge status={eff.status} />}
            {eff?.pending && <PendingTag />}
          </div>
        </div>
      </div>
    </header>
  );

  if (view !== 'ready' || !os || !eff) {
    let body: React.ReactNode;
    if (view === 'forbidden') {
      body = (
        <EmptyState
          icon={ShieldOff}
          title="Esta OS não está mais com você."
          description="Ela pode ter sido passada para outro motorista. Confira suas OS atuais."
          action={<Button onClick={goHome}>Voltar para minhas OS</Button>}
        />
      );
    } else if (view === 'notfound') {
      body = (
        <EmptyState
          icon={SearchX}
          title="OS não encontrada"
          description="Ela pode ter sido apagada pelo administrador."
          action={<Button onClick={goHome}>Voltar para minhas OS</Button>}
        />
      );
    } else if (view === 'error') {
      body = (
        <div className="p-4 space-y-4">
          <ErrorBanner message={loadError ?? 'Não foi possível carregar a OS.'} onRetry={() => void load()} />
          <Button variant="outline" onClick={goHome} className="w-full min-h-12">
            Voltar para minhas OS
          </Button>
        </div>
      );
    } else {
      body = <Spinner className="py-16" label="Carregando OS…" />;
    }
    return (
      <div className="flex-1 flex flex-col">
        {header}
        <div className="flex-1 flex flex-col justify-center pb-safe">{body}</div>
      </div>
    );
  }

  // --- Tela principal ---

  const previsto = previstoText(os);
  const queuedPickup = queued.find((item) => item.payload?.type === 'COLETA');
  const startedAt = os.route_start_time
    ? formatTimeManaus(os.route_start_time)
    : queuedPickup
      ? formatTimeManaus(String(queuedPickup.payload.local_time ?? ''))
      : null;
  const finishedAt = os.route_end_time ? formatTimeManaus(os.route_end_time) : null;
  const plateMissing = formTried && !normalizePlate(trailerPlate);
  const stateMissing = formTried && !trailerState;

  let actions: React.ReactNode = null;
  if (eff.status === 'ABERTA') {
    actions = starting ? (
      <>
        <Button
          variant="outline"
          onClick={() => setStarting(false)}
          disabled={submitting}
          className="min-h-14 px-5"
        >
          Cancelar
        </Button>
        <button
          type="button"
          onClick={handleStartTrip}
          disabled={submitting}
          className={`${bigButton} flex-1 bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-100`}
        >
          {submitting ? <Loader2 size={20} className="animate-spin" /> : <Truck size={20} />}
          {submitting ? 'Enviando…' : 'Iniciar Viagem'}
        </button>
      </>
    ) : (
      <button
        type="button"
        onClick={openStartForm}
        className={`${bigButton} flex-1 bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-100`}
      >
        <Play size={20} /> Iniciar OS
      </button>
    );
  } else if (eff.status === 'EM_ROTA') {
    actions = (
      <button
        type="button"
        onClick={handleFinishTrip}
        disabled={submitting}
        className={`${bigButton} flex-1 bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-100`}
      >
        {submitting ? <Loader2 size={20} className="animate-spin" /> : <Flag size={20} />}
        {submitting ? 'Enviando…' : 'Finalizar Viagem'}
      </button>
    );
  } else {
    actions = (
      <Button variant="outline" onClick={goHome} className="flex-1 min-h-14 font-bold">
        {eff.status === 'FECHADA' ? 'Ver próximas demandas' : 'Voltar para minhas OS'}
      </Button>
    );
  }

  return (
    <div className="flex-1 flex flex-col">
      {header}

      <div className="flex-1 p-4 space-y-4">
        {offline && <OfflineStrip />}
        {loadError && <ErrorBanner message={loadError} onRetry={() => void load()} />}
        <RejectedSyncList
          items={rejectedHere}
          osNumberFor={() => os.os_number}
          onDismiss={syncQueue.dismissRejected}
        />

        {/* Dados da OS */}
        <div className="bg-white p-5 rounded-[2rem] border border-zinc-100 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-zinc-600">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays size={16} className="text-zinc-400" />
              {os.scheduled_date ? formatDateBR(os.scheduled_date) : 'Sem data'}
              {isTodayInManaus(os.scheduled_date) && <span className="font-semibold text-emerald-700">(hoje)</span>}
            </span>
            {previsto && (
              <span className="inline-flex items-center gap-1.5">
                <Clock size={16} className="text-zinc-400" /> Previsto {previsto}
              </span>
            )}
          </div>

          <div className="relative pl-8 space-y-5 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-0.5 before:bg-zinc-100">
            <div className="relative">
              <div className="absolute -left-8 top-1 w-6 h-6 rounded-full bg-indigo-50 border-2 border-indigo-500 flex items-center justify-center">
                <div className="w-2 h-2 rounded-full bg-indigo-500" />
              </div>
              <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Origem</p>
              <p className="text-base font-black text-zinc-900 leading-tight break-words">{os.origin}</p>
            </div>
            <div className="relative">
              <div className="absolute -left-8 top-1 w-6 h-6 rounded-full bg-emerald-50 border-2 border-emerald-500 flex items-center justify-center">
                <div className="w-2 h-2 rounded-full bg-emerald-500" />
              </div>
              <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Destino</p>
              <p className="text-base font-black text-zinc-900 leading-tight break-words">{os.destination}</p>
              <a
                href={mapUrlForDestination(os.destination)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 min-h-11 text-sm font-bold text-emerald-700 hover:underline"
              >
                <Navigation size={16} /> Abrir no mapa <ExternalLink size={14} />
              </a>
            </div>
          </div>

          {(os.plate || os.truck_plate) && (
            <div className="flex flex-wrap gap-2 pt-1">
              {os.plate && (
                <span className="text-xs bg-zinc-100 text-zinc-700 px-2.5 py-1 rounded-lg">
                  Carreta: <strong>{os.plate}</strong>
                </span>
              )}
              {os.truck_plate && (
                <span className="text-xs bg-zinc-100 text-zinc-700 px-2.5 py-1 rounded-lg">
                  Cavalo: <strong>{os.truck_plate}</strong>
                </span>
              )}
            </div>
          )}
        </div>

        {os.admin_note && os.admin_note.trim() && (
          <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl">
            <p className="text-xs font-black text-amber-700 uppercase tracking-widest flex items-center gap-1.5 mb-1">
              <MessageSquareText size={14} /> Observação do administrador
            </p>
            <p className="text-sm text-amber-950 whitespace-pre-wrap break-words">{os.admin_note}</p>
          </div>
        )}

        {/* Etapa atual */}
        {eff.status === 'ABERTA' && !starting && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gradient-to-br from-indigo-50 to-zinc-50 border border-indigo-100 p-5 rounded-[2rem] space-y-3"
          >
            <div className="flex items-center gap-3">
              <div className="bg-indigo-500 text-white w-11 h-11 rounded-full flex items-center justify-center shrink-0">
                <Truck size={22} />
              </div>
              <div>
                <h2 className="font-bold text-zinc-900">Pronto para começar?</h2>
                <p className="text-sm text-zinc-600">
                  Com a carreta engatada, toque em <strong>Iniciar OS</strong> e responda duas perguntas rápidas.
                </p>
              </div>
            </div>
            {user.shift_status !== 'ON_SHIFT' && (
              <div className="bg-white border border-indigo-100 rounded-xl p-3 flex items-start gap-2 text-sm text-zinc-700">
                <Info size={18} className="shrink-0 mt-0.5 text-indigo-500" />
                <div className="flex-1">
                  Você ainda não iniciou o turno.{' '}
                  <button
                    type="button"
                    onClick={() => navigate('/motorista/turno')}
                    className="font-bold text-indigo-700 underline min-h-11"
                  >
                    Iniciar turno
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        )}

        {eff.status === 'ABERTA' && starting && (
          <motion.div
            ref={formRef}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white p-5 rounded-[2rem] border border-zinc-200 shadow-md space-y-5 scroll-mt-20"
          >
            <div>
              <h2 className="font-black text-zinc-900 text-lg">Antes de sair</h2>
              <p className="text-sm text-zinc-500">Responda e toque em Iniciar Viagem.</p>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-semibold text-zinc-800">A carreta está cheia ou vazia?</p>
              <div className="grid grid-cols-2 gap-3" role="group" aria-label="A carreta está cheia ou vazia?">
                {(
                  [
                    ['CHEIA', 'Cheia', Package],
                    ['VAZIA', 'Vazia', PackageOpen],
                  ] as const
                ).map(([value, label, Icon]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={trailerState === value}
                    disabled={submitting}
                    onClick={() => setTrailerState(value)}
                    className={`min-h-16 rounded-xl border font-black uppercase flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-60 ${
                      trailerState === value
                        ? 'bg-emerald-600 border-emerald-600 text-white shadow-md shadow-emerald-100'
                        : `bg-zinc-50 text-zinc-700 ${stateMissing ? 'border-red-300' : 'border-zinc-200'}`
                    }`}
                  >
                    <Icon size={22} /> {label}
                  </button>
                ))}
              </div>
              {stateMissing && <p className="text-xs text-red-600">Escolha se a carreta está cheia ou vazia.</p>}
            </div>

            <Input
              label="Placa da carreta"
              value={trailerPlate}
              onChange={(value) => setTrailerPlate(value.toUpperCase())}
              placeholder="Ex.: ABC1D23"
              maxLength={8}
              autoCapitalize="characters"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              required
              disabled={submitting}
              error={plateMissing ? 'Informe a placa da carreta.' : null}
            />
          </motion.div>
        )}

        {eff.status === 'EM_ROTA' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-zinc-900 p-5 rounded-[2rem] text-white shadow-xl space-y-3"
          >
            <div className="flex items-center gap-3">
              <div className="p-3 bg-emerald-500 rounded-2xl shrink-0">
                <Truck size={24} />
              </div>
              <div className="min-w-0">
                <h2 className="font-black text-lg">Viagem em andamento</h2>
                <p className="text-sm text-zinc-300">
                  {startedAt ? `Iniciada às ${startedAt}` : 'Iniciada'}
                  {os.plate ? ` · Carreta ${os.plate}` : ''}
                </p>
              </div>
            </div>
            {eff.pending && (
              <p className="text-xs text-amber-300">
                O início ainda não foi enviado. Será enviado automaticamente quando houver internet.
              </p>
            )}
            <p className="text-sm text-zinc-300 border-t border-white/10 pt-3">
              Ao entregar no destino, toque em <strong className="text-white">Finalizar Viagem</strong>.
            </p>
          </motion.div>
        )}

        {eff.status === 'FECHADA' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-emerald-50 border border-emerald-100 p-6 rounded-[2rem] text-center space-y-3"
          >
            <div className="bg-emerald-600 text-white w-14 h-14 rounded-full flex items-center justify-center mx-auto shadow-md">
              <CheckCircle2 size={32} />
            </div>
            <h2 className="font-black text-emerald-950 text-xl">Viagem finalizada</h2>
            <p className="text-emerald-800 text-sm">
              {eff.pending
                ? 'Registrada neste aparelho. Será enviada automaticamente quando houver internet.'
                : finishedAt
                  ? `Entrega registrada às ${finishedAt}. Obrigado!`
                  : 'Entrega registrada. Obrigado!'}
            </p>
          </motion.div>
        )}

        {eff.status === 'CANCELADA' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-red-50 border border-red-100 p-6 rounded-[2rem] text-center space-y-3"
          >
            <div className="bg-red-600 text-white w-12 h-12 rounded-full flex items-center justify-center mx-auto shadow-md">
              <XCircle size={28} />
            </div>
            <h2 className="font-bold text-red-950 text-lg">OS cancelada</h2>
            <p className="text-red-700 text-sm">Esta OS foi cancelada pela gestão. Não é preciso fazer mais nada.</p>
          </motion.div>
        )}

        {eff.status === 'EM_COLETA' && (
          <div className="bg-zinc-100 border border-zinc-200 p-5 rounded-[2rem] text-sm text-zinc-600 flex items-start gap-2">
            <AlertTriangle size={18} className="shrink-0 mt-0.5 text-zinc-500" />
            Esta OS está aguardando ajuste do administrador. Nenhuma ação sua é necessária agora.
          </div>
        )}
      </div>

      <div className="sticky bottom-0 z-10 bg-white border-t border-zinc-100 px-4 pt-3 pb-safe space-y-3">
        {/* O aviso "salvo neste aparelho" some sozinho quando a fila desta OS for enviada. */}
        {notice?.kind === 'queued' && queued.length > 0 && (
          <div
            role="status"
            className="bg-amber-50 border border-amber-200 text-amber-900 p-3 rounded-xl text-sm flex items-start gap-2"
          >
            <Info size={18} className="shrink-0 mt-0.5" />
            <span>{notice.text}</span>
          </div>
        )}
        {notice?.kind === 'error' && <ErrorBanner message={notice.text} />}
        <div className="flex gap-3">{actions}</div>
      </div>
    </div>
  );
};
