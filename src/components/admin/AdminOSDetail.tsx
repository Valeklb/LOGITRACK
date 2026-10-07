import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence } from 'motion/react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Clock,
  Container,
  ExternalLink,
  FileSearch,
  Hash,
  Info,
  Pencil,
  Play,
  RefreshCw,
  Route,
  ShieldX,
  Truck,
  User as UserIcon,
  Users,
  XCircle,
} from 'lucide-react';
import type { AuditLog, OSEvent, ReassignmentRequest, User } from '../../types';
import { api, ApiError, errorMessage } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { emitDataChanged } from '../../lib/events';
import { Badge, Button, EmptyState, ErrorBanner, Modal, Select, Spinner, Textarea } from '../common/UI';
import {
  formatCurrencyBR,
  formatDateManaus,
  formatDateTimeManaus,
  formatNumberBR,
  formatTimeRange,
} from '../../utils/datetime';
import { mapUrlForDestination } from '../../utils/maps';
import { auditLabel, roleLabel } from '../../utils/labels';
import { OSFormModal } from './OSFormModal';
import { SuccessBanner, useLiveData, useNotice, type AdminOS } from './shared';

const TRAILER_STATES: Record<string, string> = { CHEIA: 'Cheia', VAZIA: 'Vazia' };

const DETAIL_LABELS: Record<string, string> = {
  os_number: 'Nº da OS',
  driver_name: 'Motorista',
  from_name: 'De',
  to_name: 'Para',
  origin: 'Origem',
  destination: 'Destino',
  plate: 'Placa da carreta',
  truck_plate: 'Placa do cavalo',
  scheduled_date: 'Data',
  os_start_time: 'Previsto início',
  os_end_time: 'Previsto fim',
  route_start_time: 'Realizado início',
  route_end_time: 'Realizado fim',
  admin_note: 'Observação',
  distance_km: 'KM',
  haulage_cost: 'Custo',
  reason: 'Motivo',
  note: 'Observação',
  observation: 'Observação',
  trailer_state: 'Carreta',
  local_time: 'Horário',
  previous_status: 'Status anterior',
  direct: 'Direto pelo gestor',
};

/** Campos técnicos (ids) que não ajudam quem lê a auditoria. */
const HIDDEN_DETAIL_KEYS = new Set(['driver_id', 'from', 'to', 'request_id', 'user_id', 'os_id']);

function describeValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'sim' : 'não';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** Detalhes da auditoria (JSON) em linhas curtas: "Campo: valor" ou "Campo: antes → depois". */
function auditDetailLines(raw: string | null | undefined): string[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [raw];
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return [describeValue(parsed)];

  const lines: string[] = [];
  const add = (key: string, value: unknown) => {
    const label = DETAIL_LABELS[key] ?? key;
    if (value && typeof value === 'object' && !Array.isArray(value) && 'from' in value && 'to' in value) {
      const change = value as { from: unknown; to: unknown };
      lines.push(`${label}: ${describeValue(change.from)} → ${describeValue(change.to)}`);
    } else {
      lines.push(`${label}: ${describeValue(value)}`);
    }
  };
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (HIDDEN_DETAIL_KEYS.has(key)) continue;
    if (key === 'changes' && value && typeof value === 'object') {
      for (const [changeKey, changeValue] of Object.entries(value as Record<string, unknown>)) add(changeKey, changeValue);
    } else {
      add(key, value);
    }
  }
  return lines;
}

const SectionTitle = ({ icon: Icon, children }: { icon?: React.ElementType; children: React.ReactNode }) => (
  <h3 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest flex items-center gap-2">
    {Icon && <Icon size={14} className="text-emerald-600" />}
    {children}
  </h3>
);

const InfoTile = ({ icon: Icon, label, value, tone = 'text-emerald-600' }: { icon: React.ElementType; label: string; value: React.ReactNode; tone?: string }) => (
  <div className="flex items-start gap-3 bg-zinc-50 rounded-2xl p-4 min-w-0">
    <div className={`p-2 bg-white rounded-xl shrink-0 ${tone}`}>
      <Icon size={18} />
    </div>
    <div className="min-w-0">
      <p className="text-[10px] text-zinc-400 font-bold uppercase">{label}</p>
      <p className="font-black text-zinc-900 break-words">{value}</p>
    </div>
  </div>
);

const FullPageState = ({
  icon,
  title,
  description,
  onBack,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  onBack: () => void;
}) => (
  <div className="min-h-dvh bg-[#F8F9FA] flex items-center justify-center p-6">
    <div className="bg-white rounded-[2rem] border border-zinc-200 shadow-sm max-w-md w-full">
      <EmptyState
        icon={icon}
        title={title}
        description={description}
        action={
          <Button icon={ArrowLeft} onClick={onBack}>
            Voltar para Ordens
          </Button>
        }
      />
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// Realocar
// ---------------------------------------------------------------------------

const ReassignModal = ({
  os,
  drivers,
  isGestor,
  onClose,
  onDone,
}: {
  os: AdminOS;
  drivers: User[];
  isGestor: boolean;
  onClose: () => void;
  onDone: (message: string) => void;
}) => {
  const [driverId, setDriverId] = useState('');
  const [reason, setReason] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const options = drivers
    .filter((d) => d.role === 'driver' && d.is_active && d.id !== Number(os.driver_id))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
    .map((d) => ({ value: String(d.id), label: d.shift_status === 'ON_SHIFT' ? `${d.name} · em turno` : d.name }));

  const driverError = !driverId ? 'Escolha o novo motorista.' : null;
  const reasonError = !reason.trim() ? 'Conte o motivo da troca.' : null;

  const handleSubmit = async () => {
    if (saving) return;
    setSubmitted(true);
    if (driverError || reasonError) return;
    setSaving(true);
    setError(null);
    try {
      const res = await api<{ applied?: boolean; pending?: boolean }>(`/api/os/${os.id}/reassign`, {
        method: 'POST',
        body: { new_driver_id: Number(driverId), reason: reason.trim() },
      });
      onDone(
        res?.applied
          ? 'Motorista trocado. Os dois motoristas foram avisados.'
          : 'Pedido de realocação enviado. Agora é com o gestor.',
      );
    } catch (err) {
      setError(errorMessage(err, 'Não foi possível realocar. Tente de novo.'));
      setSaving(false);
    }
  };

  return (
    <Modal
      title={`Realocar OS #${os.os_number}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={saving || options.length === 0}>
            {saving ? 'Enviando…' : isGestor ? 'Trocar motorista' : 'Enviar para aprovação'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {error && <ErrorBanner message={error} />}
        <p className="text-sm text-zinc-600 bg-zinc-50 border border-zinc-100 rounded-xl p-3">
          {isGestor
            ? 'A troca será aplicada na hora e os dois motoristas serão avisados.'
            : 'O pedido vai para aprovação do gestor. A OS continua com o motorista atual até ele decidir.'}
        </p>
        {isGestor && os.pending_request && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl p-3">
            Já existe um pedido pendente para esta OS. Ele será cancelado e substituído por esta troca.
          </p>
        )}
        <div className="text-sm">
          <span className="text-zinc-500">Motorista atual: </span>
          <span className="font-bold text-zinc-900">{os.driver_name || '—'}</span>
        </div>
        {options.length === 0 ? (
          <ErrorBanner message="Não há outro motorista ativo para receber esta OS." />
        ) : (
          <Select
            label="Novo motorista"
            required
            value={driverId}
            onChange={setDriverId}
            options={options}
            placeholder="Selecione o novo motorista"
            error={submitted ? driverError : null}
          />
        )}
        <Textarea
          label="Motivo"
          required
          value={reason}
          onChange={setReason}
          placeholder="Ex.: Caminhão do motorista atual quebrou."
          maxLength={1000}
          error={submitted ? reasonError : null}
        />
      </div>
    </Modal>
  );
};

// ---------------------------------------------------------------------------
// Partes do detalhe
// ---------------------------------------------------------------------------

const RequestBanner = ({ request, isGestor, onGoApprovals }: { request: ReassignmentRequest; isGestor: boolean; onGoApprovals: () => void }) => (
  <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl flex items-start gap-3">
    <AlertCircle className="text-amber-600 mt-0.5 shrink-0" size={20} />
    <div className="flex-1 space-y-1">
      <p className="text-sm font-bold text-amber-900">Realocação aguardando o gestor</p>
      <p className="text-sm text-amber-800">
        {request.current_driver_name ?? '—'} → <strong>{request.new_driver_name ?? '—'}</strong>
        {request.reason ? ` · Motivo: ${request.reason}` : ''}
      </p>
      <p className="text-xs text-amber-700">
        Pedido por {request.requested_by_name ?? '—'} em {formatDateTimeManaus(request.created_at)}
      </p>
      {isGestor && (
        <button type="button" onClick={onGoApprovals} className="text-xs font-black text-amber-900 underline">
          Decidir em Aprovações
        </button>
      )}
    </div>
  </div>
);

const DecisionBanner = ({ request }: { request: ReassignmentRequest }) => {
  const styles: Record<string, { box: string; title: string; text: string }> = {
    APROVADO: { box: 'bg-emerald-50 border-emerald-200', title: 'text-emerald-900', text: 'Realocação aprovada' },
    REPROVADO: { box: 'bg-red-50 border-red-200', title: 'text-red-900', text: 'Realocação reprovada' },
    CANCELADO: { box: 'bg-zinc-50 border-zinc-200', title: 'text-zinc-800', text: 'Realocação cancelada' },
  };
  const style = styles[request.status] ?? styles.CANCELADO;
  return (
    <div className={`border p-4 rounded-2xl flex items-start gap-3 ${style.box}`}>
      <Users className={`mt-0.5 shrink-0 ${style.title}`} size={20} />
      <div className="flex-1 space-y-1 text-sm">
        <p className={`font-bold ${style.title}`}>
          {style.text}
          {request.manager_name ? ` por ${request.manager_name}` : ''}
          {request.decision_note ? `: ${request.decision_note}` : ''}
        </p>
        <p className="text-zinc-600">
          {request.current_driver_name ?? '—'} → {request.new_driver_name ?? '—'}
          {request.reason ? ` · Motivo: ${request.reason}` : ''}
        </p>
        {request.decided_at && <p className="text-xs text-zinc-500">{formatDateTimeManaus(request.decided_at)}</p>}
      </div>
    </div>
  );
};

const EventsTimeline = ({ events }: { events: OSEvent[] }) => {
  if (events.length === 0) {
    return (
      <div className="bg-white border border-dashed border-zinc-200 rounded-[2rem] p-8 text-center">
        <Clock size={28} className="mx-auto text-zinc-300 mb-3" />
        <p className="text-sm font-bold text-zinc-500">Nenhum registro ainda</p>
        <p className="text-xs text-zinc-400 mt-1">O início e o fim da viagem aparecem aqui.</p>
      </div>
    );
  }
  return (
    <div className="space-y-4 relative before:absolute before:left-[19px] before:top-3 before:bottom-3 before:w-0.5 before:bg-zinc-200">
      {events.map((event) => {
        const isStart = event.type === 'COLETA';
        return (
          <div key={event.id} className="relative pl-14">
            <div
              className={`absolute left-0 top-1 w-10 h-10 rounded-xl flex items-center justify-center shadow-sm text-white ${
                isStart ? 'bg-blue-500' : 'bg-emerald-500'
              }`}
            >
              {isStart ? <Play size={18} /> : <CheckCircle2 size={18} />}
            </div>
            <div className="bg-white p-4 rounded-2xl border border-zinc-100 shadow-sm space-y-2">
              <div className="flex flex-wrap justify-between items-start gap-2">
                <span className={`text-xs font-black uppercase tracking-widest ${isStart ? 'text-blue-600' : 'text-emerald-600'}`}>
                  {isStart ? 'Início da viagem' : event.type === 'ENTREGA' ? 'Fim da viagem' : event.type}
                </span>
                <span className="text-xs font-black text-zinc-700 bg-zinc-100 px-2.5 py-1 rounded-lg">
                  {formatDateTimeManaus(event.local_time || event.server_time)}
                </span>
              </div>
              {isStart && (event.plate || event.trailer_state) && (
                <p className="text-sm text-zinc-700">
                  Carreta <strong>{event.plate || '—'}</strong>
                  {event.trailer_state ? ` · ${TRAILER_STATES[event.trailer_state] ?? event.trailer_state}` : ''}
                </p>
              )}
              {event.observation && (
                <p className="text-sm text-zinc-600 bg-zinc-50 border border-zinc-100 rounded-xl p-3 flex items-start gap-2">
                  <Info size={16} className="text-zinc-400 shrink-0 mt-0.5" />
                  <span className="whitespace-pre-line">{event.observation}</span>
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const AuditList = ({ logs }: { logs: AuditLog[] }) => {
  if (logs.length === 0) {
    return (
      <div className="bg-white rounded-[2rem] border border-zinc-200 shadow-sm">
        <EmptyState icon={FileSearch} title="Nenhum registro de auditoria." />
      </div>
    );
  }
  return (
    <div className="bg-white rounded-[2rem] border border-zinc-200 shadow-sm overflow-hidden">
      <ul className="divide-y divide-zinc-100">
        {logs.map((log) => {
          const lines = auditDetailLines(log.details);
          return (
            <li key={log.id} className="p-5 space-y-1.5">
              <div className="flex flex-wrap justify-between items-center gap-2">
                <span className="text-sm font-black text-zinc-900">{auditLabel(log.action)}</span>
                <span className="text-xs text-zinc-500 font-bold whitespace-nowrap">{formatDateTimeManaus(log.created_at)}</span>
              </div>
              <p className="text-xs text-zinc-500 font-medium">
                Por {log.actor_name || '—'}
                {log.actor_role ? ` (${roleLabel(log.actor_role)})` : ''}
              </p>
              {lines.length > 0 && (
                <ul className="text-[11px] text-zinc-500 font-mono bg-zinc-50 p-2.5 rounded-lg space-y-0.5 break-words">
                  {lines.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Tela
// ---------------------------------------------------------------------------

type DetailModal = 'edit' | 'reassign' | null;

const OSDetailScreen = ({ osId }: { osId: number }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const validId = Number.isInteger(osId) && osId > 0;
  const live = useLiveData(
    async () => {
      if (!validId) throw new ApiError(404, 'OS não encontrada.');
      const [os, users] = await Promise.all([api<AdminOS>(`/api/os/${osId}`), api<User[]>('/api/users')]);
      return { os, users: Array.isArray(users) ? users : [] };
    },
    { shouldRefresh: (changedId) => changedId === null || changedId === osId },
  );
  const [tab, setTab] = useState<'info' | 'audit'>('info');
  const [modal, setModal] = useState<DetailModal>(null);
  const [cancelling, setCancelling] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, showNotice] = useNotice(6000);

  const goBack = () => navigate('/admin/ordens');

  if (live.errorStatus === 404) {
    return (
      <FullPageState
        icon={FileSearch}
        title="OS não encontrada"
        description="Ela pode ter sido excluída ou o endereço está errado."
        onBack={goBack}
      />
    );
  }
  if (live.errorStatus === 403) {
    return (
      <FullPageState icon={ShieldX} title="Sem acesso a esta OS" description="Você não tem permissão para ver esta OS." onBack={goBack} />
    );
  }
  if (!live.data) {
    return (
      <div className="min-h-dvh bg-[#F8F9FA] flex items-center justify-center p-6">
        {live.loading ? (
          <Spinner label="Carregando a OS…" />
        ) : (
          <div className="max-w-md w-full space-y-4">
            <ErrorBanner message={live.error ?? 'Não foi possível carregar a OS.'} onRetry={() => void live.refresh()} />
            <Button variant="outline" icon={ArrowLeft} onClick={goBack} className="w-full">
              Voltar para Ordens
            </Button>
          </div>
        )}
      </div>
    );
  }

  const { os, users } = live.data;
  const isGestor = user?.role === 'gestor';
  const isClosed = os.status === 'FECHADA' || os.status === 'CANCELADA';
  const canEdit = os.status !== 'CANCELADA';
  const adminBlockedByPending = !isGestor && Boolean(os.pending_request);
  const containerChecklists = (os.checklists ?? []).filter((c) => c.type === 'CONTAINER');
  const events = [...(os.events ?? [])].sort((a, b) => a.id - b.id);

  const handleCancel = async () => {
    if (cancelling) return;
    if (!window.confirm(`Cancelar a OS #${os.os_number}? O motorista será avisado. Isso não pode ser desfeito.`)) return;
    setCancelling(true);
    setActionError(null);
    try {
      await api(`/api/os/${os.id}`, { method: 'PATCH', body: { status: 'CANCELADA' } });
      showNotice(`OS #${os.os_number} cancelada.`);
      emitDataChanged(os.id);
    } catch (err) {
      setActionError(errorMessage(err, 'Não foi possível cancelar a OS. Tente de novo.'));
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="min-h-dvh bg-[#F8F9FA]">
      <header className="bg-white border-b border-zinc-200 sticky top-0 z-20 pt-safe">
        <div className="max-w-5xl mx-auto px-4 lg:px-8 py-3 flex items-center gap-3">
          <button
            type="button"
            onClick={goBack}
            title="Voltar para Ordens"
            aria-label="Voltar para Ordens"
            className="p-2 -ml-2 hover:bg-zinc-100 rounded-full"
          >
            <ArrowLeft size={24} />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Ordem de serviço</p>
            <h1 className="text-xl font-black text-zinc-900 truncate">OS #{os.os_number}</h1>
          </div>
          <Badge status={os.status} />
          <button
            type="button"
            onClick={() => void live.refresh()}
            disabled={live.refreshing}
            title="Atualizar"
            aria-label="Atualizar"
            className="p-2 text-zinc-500 hover:bg-zinc-100 rounded-full disabled:opacity-60"
          >
            <RefreshCw size={20} className={live.refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-4 lg:p-8 space-y-6 pb-safe">
        {live.error && (
          <ErrorBanner
            message={`${live.error} Mostrando os últimos dados carregados.`}
            onRetry={() => void live.refresh()}
          />
        )}
        {actionError && <ErrorBanner message={actionError} />}
        {notice && <SuccessBanner message={notice} onClose={() => showNotice(null)} />}
        {os.pending_request && (
          <RequestBanner request={os.pending_request} isGestor={isGestor} onGoApprovals={() => navigate('/admin/aprovacoes')} />
        )}
        {os.last_decision && <DecisionBanner request={os.last_decision} />}

        {(canEdit || !isClosed) && (
          <div className="flex flex-wrap gap-3">
            {canEdit && (
              <Button variant="outline" icon={Pencil} onClick={() => setModal('edit')}>
                {os.status === 'FECHADA' ? 'Editar (KM e custo)' : 'Editar'}
              </Button>
            )}
            {!isClosed && (
              <Button
                variant="outline"
                icon={Users}
                onClick={() => setModal('reassign')}
                disabled={adminBlockedByPending}
                title={adminBlockedByPending ? 'Já existe um pedido aguardando o gestor.' : undefined}
              >
                Realocar
              </Button>
            )}
            {!isClosed && isGestor && (
              <Button variant="danger" icon={XCircle} onClick={() => void handleCancel()} disabled={cancelling}>
                {cancelling ? 'Cancelando…' : 'Cancelar OS'}
              </Button>
            )}
          </div>
        )}

        <div className="flex border-b border-zinc-200">
          {(
            [
              { id: 'info', label: 'Detalhes' },
              { id: 'audit', label: 'Auditoria' },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              aria-pressed={tab === t.id}
              className={`flex-1 sm:flex-none sm:px-8 py-3 text-sm font-bold border-b-2 transition-all ${
                tab === t.id ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-zinc-400 hover:text-zinc-600'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'audit' ? (
          <AuditList logs={os.audit ?? []} />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            <div className="lg:col-span-3 space-y-6">
              {/* Resumo */}
              <section className="bg-gradient-to-br from-emerald-600 to-emerald-800 p-6 rounded-[2rem] text-white shadow-lg shadow-emerald-200/50 space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-100/80">Ordem de serviço</p>
                    <h2 className="text-3xl font-black tracking-tight break-all">#{os.os_number}</h2>
                  </div>
                  <Badge status={os.status} />
                </div>
                <div className="flex flex-wrap gap-4 pt-3 border-t border-white/20 text-sm font-medium text-emerald-50">
                  <span className="flex items-center gap-2">
                    <Calendar size={16} /> {formatDateManaus(os.scheduled_date || os.created_at)}
                  </span>
                  {os.reassignment_count > 0 && (
                    <span className="text-[10px] font-black uppercase tracking-widest bg-white/20 px-2 py-1 rounded-lg">
                      Realocada {os.reassignment_count}x
                    </span>
                  )}
                </div>
              </section>

              {/* Previsto × Realizado */}
              <section className="bg-white p-6 rounded-[2rem] border border-zinc-200 shadow-sm space-y-4">
                <SectionTitle icon={Clock}>Horários (Manaus)</SectionTitle>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-zinc-50 rounded-2xl p-4 space-y-1">
                    <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Previsto</p>
                    <p className="text-lg font-black text-zinc-900">{formatTimeRange(os.os_start_time, os.os_end_time)}</p>
                  </div>
                  <div className="bg-zinc-50 rounded-2xl p-4 space-y-1">
                    <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Realizado</p>
                    <p className="text-lg font-black text-zinc-900">{formatTimeRange(os.route_start_time, os.route_end_time)}</p>
                  </div>
                </div>
              </section>

              {/* Informações */}
              <section className="bg-white p-6 rounded-[2rem] border border-zinc-200 shadow-sm space-y-5">
                <SectionTitle>Informações</SectionTitle>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <InfoTile
                    icon={UserIcon}
                    label="Motorista"
                    tone="text-indigo-600"
                    value={
                      <>
                        {os.driver_name || '—'}
                        {os.driver_is_active === false && <span className="text-xs text-red-500"> (inativo)</span>}
                      </>
                    }
                  />
                  <InfoTile icon={Truck} label="Placa do cavalo" value={os.truck_plate || '—'} />
                  <InfoTile icon={Hash} label="Placa da carreta" value={os.plate || '—'} />
                </div>

                <div className="relative pl-8 space-y-5 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-0.5 before:bg-emerald-100">
                  {[
                    { label: 'Origem', value: os.origin, dot: 'bg-indigo-500', ring: 'bg-indigo-100 border-indigo-500' },
                    { label: 'Destino', value: os.destination, dot: 'bg-emerald-500', ring: 'bg-emerald-100 border-emerald-500' },
                  ].map((place) => (
                    <div key={place.label} className="relative">
                      <div className={`absolute -left-8 top-0.5 w-6 h-6 rounded-full border-2 flex items-center justify-center ${place.ring}`}>
                        <div className={`w-2 h-2 rounded-full ${place.dot}`} />
                      </div>
                      <p className="text-[10px] text-zinc-400 font-bold uppercase">{place.label}</p>
                      <p className="font-bold text-zinc-900">{place.value || '—'}</p>
                      {place.value && (
                        <a
                          href={mapUrlForDestination(place.value)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-emerald-600 font-bold hover:underline"
                        >
                          Ver no mapa <ExternalLink size={12} />
                        </a>
                      )}
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-zinc-100">
                  <div className="text-center p-4 bg-emerald-50 rounded-2xl">
                    <p className="text-[10px] text-zinc-500 font-bold uppercase">KM percorrido</p>
                    <p className="font-black text-emerald-700 text-xl">
                      {os.distance_km == null ? '—' : `${formatNumberBR(os.distance_km)} km`}
                    </p>
                  </div>
                  <div className="text-center p-4 bg-zinc-50 rounded-2xl">
                    <p className="text-[10px] text-zinc-500 font-bold uppercase">Custo da puxada</p>
                    <p className="font-black text-zinc-900 text-xl">{formatCurrencyBR(os.haulage_cost)}</p>
                  </div>
                </div>
                {os.status === 'FECHADA' && (os.distance_km == null || os.haulage_cost == null) && (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl p-3">
                    Viagem finalizada. Lance o KM e o custo em "Editar (KM e custo)".
                  </p>
                )}

                <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4">
                  <p className="text-[10px] font-black text-amber-700 uppercase tracking-widest mb-1">Observação para o motorista</p>
                  <p className="text-sm text-amber-900 whitespace-pre-line">{os.admin_note || 'Nenhuma observação.'}</p>
                </div>
              </section>
            </div>

            <div className="lg:col-span-2 space-y-6">
              {/* Checklist da carreta */}
              <section className="bg-white p-6 rounded-[2rem] border border-zinc-200 shadow-sm space-y-4">
                <SectionTitle icon={Container}>Checklist da carreta</SectionTitle>
                {containerChecklists.length === 0 ? (
                  <p className="text-sm text-zinc-500">O motorista informa se a carreta está cheia ou vazia ao iniciar a viagem.</p>
                ) : (
                  <ul className="space-y-3">
                    {containerChecklists.map((c) => {
                      const state = typeof c.items?.estado_carreta === 'string' ? c.items.estado_carreta : null;
                      return (
                        <li key={c.id} className="flex items-center justify-between gap-3 bg-zinc-50 rounded-2xl p-4">
                          <div>
                            <p className="font-black text-zinc-900">
                              {state ? (TRAILER_STATES[state] ?? state) : '—'}
                            </p>
                            <p className="text-xs text-zinc-500">Placa {c.vehicle_plate || '—'}</p>
                          </div>
                          <span className="text-xs font-bold text-zinc-500">{formatDateTimeManaus(c.created_at)}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              {/* Registros da viagem */}
              <section className="space-y-4">
                <SectionTitle icon={Route}>Registros da viagem</SectionTitle>
                <EventsTimeline events={events} />
              </section>
            </div>
          </div>
        )}
      </main>

      <AnimatePresence>
        {modal === 'edit' && (
          <OSFormModal
            os={os}
            drivers={users}
            onClose={() => setModal(null)}
            onSaved={(saved) => {
              setModal(null);
              if (saved) {
                showNotice('Alterações salvas.');
                emitDataChanged(os.id);
              }
            }}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {modal === 'reassign' && (
          <ReassignModal
            os={os}
            drivers={users}
            isGestor={isGestor}
            onClose={() => setModal(null)}
            onDone={(message) => {
              setModal(null);
              showNotice(message);
              emitDataChanged(os.id);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

/** Detalhe da OS para administrador e gestor (`/admin/os/:id`). */
export const AdminOSDetail = () => {
  const { id } = useParams<{ id: string }>();
  // A `key` recria a tela ao trocar de OS (ex.: ao tocar em um aviso).
  return (
    <React.Fragment key={id}>
      <OSDetailScreen osId={Number(id)} />
    </React.Fragment>
  );
};
