import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  CalendarDays,
  ChevronRight,
  Clock,
  Inbox,
  KeyRound,
  Loader2,
  LogOut,
  MapPin,
  Play,
  RefreshCw,
  Truck,
} from 'lucide-react';
import type { ServiceOrder, User } from '../../types';
import { api, ApiError, errorMessage } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { onDataChanged } from '../../lib/events';
import { syncQueue } from '../../lib/syncQueue';
import { cacheGet, cacheSet } from '../../lib/offlineCache';
import { formatDateBR } from '../../utils/coords';
import { dateKeyInManaus, formatShortDateTimeManaus, formatTimeManaus, isTodayInManaus } from '../../utils/datetime';
import { EmptyState, ErrorBanner, Spinner } from '../common/UI';
import {
  effectiveStatus,
  isActiveStatus,
  OfflineStrip,
  PendingSyncBanner,
  previstoText,
  RejectedSyncList,
  rememberedOsNumber,
  rememberOsNumbers,
  StatusPill,
  type EffectiveStatus,
} from './driverUi';

const REFRESH_INTERVAL_MS = 30000;
const DATA_CHANGED_DEBOUNCE_MS = 400;
const FINISHED_LIMIT = 30;

type Tab = 'ativas' | 'finalizadas';

interface OrderView {
  os: ServiceOrder;
  eff: EffectiveStatus;
}

function activeSortKey(os: ServiceOrder): string {
  return `${os.scheduled_date || '9999-99-99'} ${os.os_start_time || '99:99'}`;
}

function finishedSortKey(os: ServiceOrder): string {
  const day = os.scheduled_date || dateKeyInManaus(os.created_at) || '';
  return `${day} ${os.route_end_time || os.route_start_time || os.os_start_time || ''}`;
}

export const DriverHome = () => {
  const { user, setUser, refreshMe, confirmAndLogout } = useAuth();
  const navigate = useNavigate();
  const userId = user?.id ?? null;

  const [orders, setOrders] = useState<ServiceOrder[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('ativas');
  const [queueTick, setQueueTick] = useState(0);
  const [sendingQueue, setSendingQueue] = useState(false);
  const [endingShift, setEndingShift] = useState(false);
  const [shiftError, setShiftError] = useState<string | null>(null);
  const loadSeq = useRef(0);
  const hasOrdersRef = useRef(false);

  const load = useCallback(
    async (manual = false) => {
      if (!userId) return;
      const seq = ++loadSeq.current;
      if (manual) setRefreshing(true);
      try {
        const data = await api<ServiceOrder[]>('/api/os');
        if (seq !== loadSeq.current) return;
        const list = Array.isArray(data) ? data : [];
        cacheSet(userId, 'os-list', list);
        rememberOsNumbers(userId, list);
        hasOrdersRef.current = true;
        setOrders(list);
        setOffline(false);
        setLoadError(null);
        setLastUpdated(new Date().toISOString());
      } catch (err) {
        if (seq !== loadSeq.current) return;
        if (err instanceof ApiError && err.status === 0) {
          // Mantém o que já está na tela; senão usa o que foi salvo neste aparelho.
          if (!hasOrdersRef.current) {
            const cached = cacheGet<ServiceOrder[]>(userId, 'os-list');
            if (Array.isArray(cached)) {
              hasOrdersRef.current = true;
              setOrders(cached);
            }
          }
          setOffline(true);
          setLoadError(
            hasOrdersRef.current ? null : 'Sem conexão e nenhuma OS salva neste aparelho. Conecte-se à internet.',
          );
        } else {
          setLoadError(errorMessage(err, 'Não foi possível carregar suas OS. Tente de novo.'));
        }
      } finally {
        if (seq === loadSeq.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [userId],
  );

  // Primeira carga + atualização automática (aviso de mudança e a cada 30 s).
  useEffect(() => {
    void load();
    let debounce: number | undefined;
    const offChanged = onDataChanged(() => {
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
  }, [load]);

  // Fila offline mudou → redesenha (pendentes / não enviados).
  useEffect(() => syncQueue.subscribe(() => setQueueTick((t) => t + 1)), []);

  const pendingItems = useMemo(() => (userId ? syncQueue.pending(userId) : []), [userId, queueTick]);
  const rejectedItems = useMemo(() => (userId ? syncQueue.rejected(userId) : []), [userId, queueTick]);

  const { active, finished } = useMemo(() => {
    const views: OrderView[] = (orders ?? []).map((os) => ({
      os,
      eff: effectiveStatus(
        os,
        pendingItems.filter((item) => item.osId === os.id),
      ),
    }));
    const activeList = views
      .filter((v) => isActiveStatus(v.eff.status))
      .sort(
        (a, b) =>
          (a.eff.status === 'EM_ROTA' ? 0 : 1) - (b.eff.status === 'EM_ROTA' ? 0 : 1) ||
          activeSortKey(a.os).localeCompare(activeSortKey(b.os)) ||
          a.os.id - b.os.id,
      );
    const finishedList = views
      .filter((v) => !isActiveStatus(v.eff.status))
      .sort(
        (a, b) =>
          (b.eff.pending ? 1 : 0) - (a.eff.pending ? 1 : 0) ||
          finishedSortKey(b.os).localeCompare(finishedSortKey(a.os)) ||
          b.os.id - a.os.id,
      )
      .slice(0, FINISHED_LIMIT);
    return { active: activeList, finished: finishedList };
  }, [orders, pendingItems]);

  if (!user) return null;

  const firstName = user.name.trim().split(/\s+/)[0] || user.name;
  const onShift = user.shift_status === 'ON_SHIFT';
  const shown = tab === 'ativas' ? active : finished;
  const hasTripInProgress = active.some((v) => v.eff.status === 'EM_ROTA');

  const osNumberFor = (osId: number) =>
    orders?.find((os) => os.id === osId)?.os_number ?? rememberedOsNumber(user.id, osId);

  const handleRefresh = () => {
    void load(true);
    void refreshMe();
    if (pendingItems.length > 0) void syncQueue.process(user.id);
  };

  const handleSendQueue = async () => {
    setSendingQueue(true);
    try {
      await syncQueue.process(user.id);
    } finally {
      setSendingQueue(false);
    }
  };

  const handleEndShift = async () => {
    if (endingShift) return;
    const question = hasTripInProgress
      ? 'Você ainda tem uma viagem em andamento. Encerrar o turno mesmo assim?'
      : 'Encerrar o turno agora?';
    if (!window.confirm(question)) return;
    setEndingShift(true);
    setShiftError(null);
    try {
      const res = await api<{ user?: User }>('/api/shift/end', { method: 'POST' });
      if (res?.user) setUser(res.user);
      else await refreshMe();
    } catch (err) {
      setShiftError(
        err instanceof ApiError && err.status === 0
          ? 'Sem conexão. Conecte-se à internet para encerrar o turno.'
          : errorMessage(err, 'Não foi possível encerrar o turno. Tente de novo.'),
      );
    } finally {
      setEndingShift(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col">
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-zinc-100 pt-safe">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 bg-emerald-600 text-white rounded-2xl shrink-0">
              <Truck size={22} />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-black text-emerald-600 uppercase tracking-widest">LogiTrack</p>
              <h1 className="text-lg font-black text-zinc-900 truncate">Olá, {firstName}</h1>
            </div>
          </div>
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() => navigate('/trocar-senha')}
              title="Alterar senha"
              aria-label="Alterar senha"
              className="min-h-11 px-3 inline-flex items-center gap-1.5 rounded-full text-sm font-semibold text-zinc-600 hover:bg-zinc-100"
            >
              <KeyRound size={18} /> Senha
            </button>
            <button
              type="button"
              onClick={confirmAndLogout}
              title="Sair"
              className="min-h-11 px-3 inline-flex items-center gap-1.5 rounded-full text-sm font-semibold text-zinc-600 hover:bg-red-50 hover:text-red-600"
            >
              <LogOut size={18} /> Sair
            </button>
          </div>
        </div>
      </header>

      <div className="p-4 space-y-3">
        {offline && <OfflineStrip />}

        {/* Turno */}
        {onShift ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-zinc-900 p-5 rounded-[2rem] text-white shadow-xl space-y-4"
          >
            <div className="flex items-center gap-3">
              <div className="p-3 bg-emerald-500 rounded-2xl shrink-0">
                <Truck size={24} />
              </div>
              <div className="min-w-0">
                <h2 className="font-black text-lg">Em turno</h2>
                <p className="text-sm text-zinc-300">
                  Em turno desde {formatShortDateTimeManaus(user.shift_started_at)}
                  {user.current_plate ? ` · Placa ${user.current_plate}` : ''}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleEndShift}
              disabled={endingShift}
              className="w-full min-h-12 rounded-xl border border-white/20 bg-white/10 hover:bg-white/15 font-bold text-white flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-60"
            >
              {endingShift && <Loader2 size={18} className="animate-spin" />}
              {endingShift ? 'Encerrando…' : 'Encerrar Turno'}
            </button>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-emerald-600 p-5 rounded-[2rem] text-white shadow-lg shadow-emerald-200 space-y-4"
          >
            <div className="flex items-center gap-3">
              <div className="p-3 bg-white/20 rounded-2xl shrink-0">
                <Truck size={24} />
              </div>
              <div>
                <h2 className="font-black text-lg">Pronto para trabalhar?</h2>
                <p className="text-sm text-emerald-50">Inicie o turno para registrar o veículo do dia.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => navigate('/motorista/turno')}
              className="w-full min-h-14 rounded-xl bg-white text-emerald-700 hover:bg-emerald-50 font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-sm transition-all active:scale-95"
            >
              <Play size={20} /> Iniciar Turno
            </button>
          </motion.div>
        )}
        {shiftError && <ErrorBanner message={shiftError} />}

        {/* Fila offline */}
        <PendingSyncBanner count={pendingItems.length} onSendNow={handleSendQueue} sending={sendingQueue} />
        <RejectedSyncList items={rejectedItems} osNumberFor={osNumberFor} onDismiss={syncQueue.dismissRejected} />
      </div>

      {/* Minhas OS */}
      <section className="flex-1 px-4 pb-safe space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-black text-zinc-400 uppercase tracking-widest">Minhas OS</h2>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="min-h-11 px-3 -mr-3 inline-flex items-center gap-1.5 rounded-full text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
          >
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} /> Atualizar
          </button>
        </div>

        <div role="tablist" aria-label="Minhas OS" className="grid grid-cols-2 gap-1 p-1 bg-zinc-200/70 rounded-2xl">
          {(
            [
              ['ativas', 'Ativas', active.length],
              ['finalizadas', 'Finalizadas', finished.length],
            ] as const
          ).map(([key, label, count]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`min-h-11 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all ${
                tab === key ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500'
              }`}
            >
              {label}
              <span
                className={`text-[11px] px-1.5 py-0.5 rounded-full ${
                  tab === key ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-300/60 text-zinc-600'
                }`}
              >
                {count}
              </span>
            </button>
          ))}
        </div>

        {lastUpdated && !offline && (
          <p className="text-[11px] text-zinc-400 px-1">Atualizado às {formatTimeManaus(lastUpdated)}</p>
        )}

        {loadError && <ErrorBanner message={loadError} onRetry={() => void load(true)} />}

        {orders === null ? (
          loading ? <Spinner className="py-12" label="Carregando suas OS…" /> : null
        ) : shown.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title={tab === 'ativas' ? 'Nenhuma OS para você agora.' : 'Nenhuma OS finalizada ainda.'}
            description={
              tab === 'ativas' ? 'Quando o administrador atribuir uma, ela aparece aqui.' : undefined
            }
          />
        ) : (
          <ul className="space-y-3 pb-4">
            {shown.map(({ os, eff }) => {
              const previsto = previstoText(os);
              return (
                <li key={os.id}>
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.98 }}
                    onClick={() => navigate(`/motorista/os/${os.id}`)}
                    className="w-full text-left bg-white p-4 rounded-2xl border border-zinc-100 shadow-sm flex items-center gap-3"
                  >
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-black text-zinc-900">OS #{os.os_number}</span>
                        <StatusPill eff={eff} />
                        {os.reassignment_count > 0 && (
                          <span className="text-[10px] font-black uppercase tracking-wide bg-amber-500 text-white px-1.5 py-0.5 rounded">
                            Reatribuída
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays size={13} />
                          {os.scheduled_date ? formatDateBR(os.scheduled_date) : 'Sem data'}
                          {isTodayInManaus(os.scheduled_date) && (
                            <span className="font-semibold text-emerald-700">(hoje)</span>
                          )}
                        </span>
                        {previsto && (
                          <span className="inline-flex items-center gap-1">
                            <Clock size={13} /> Previsto {previsto}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-zinc-700 flex items-start gap-1.5">
                        <MapPin size={14} className="mt-0.5 shrink-0 text-zinc-400" />
                        <span className="min-w-0 break-words">
                          {os.origin} → {os.destination}
                        </span>
                      </p>
                      {os.plate && (
                        <p className="text-xs text-zinc-500">
                          Placa: <span className="font-semibold text-zinc-700">{os.plate}</span>
                        </p>
                      )}
                    </div>
                    <ChevronRight className="text-zinc-300 shrink-0" />
                  </motion.button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
};
