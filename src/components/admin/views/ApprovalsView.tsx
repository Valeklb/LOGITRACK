import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, CheckCheck, Clock, X } from 'lucide-react';
import type { ReassignmentRequest, User } from '../../../types';
import { api, errorMessage } from '../../../lib/api';
import { emitDataChanged } from '../../../lib/events';
import { Badge, Button, EmptyState, ErrorBanner, InfoBanner, Textarea } from '../../common/UI';
import { formatDateTimeManaus } from '../../../utils/datetime';
import { actsAsGestor, roleLabel } from '../../../utils/labels';
import { LiveStatus, PageHeader, RefreshButton, SuccessBanner, useLiveData, useNotice } from '../shared';

type PendingRequest = ReassignmentRequest & {
  origin?: string | null;
  destination?: string | null;
  os_status?: string | null;
};

type Decision = 'APROVADO' | 'REPROVADO';

export const ApprovalsView = ({ user }: { user: User }) => {
  const canDecide = actsAsGestor(user);
  const live = useLiveData(() => api<PendingRequest[]>('/api/reassign/pending'));
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [busyId, setBusyId] = useState<number | null>(null);
  const [notice, showNotice] = useNotice();

  const requests = Array.isArray(live.data) ? live.data : [];

  const decide = async (request: PendingRequest, status: Decision) => {
    if (busyId) return;
    const verb = status === 'APROVADO' ? 'Aprovar' : 'Reprovar';
    if (!window.confirm(`${verb} a realocação da OS #${request.os_number ?? request.os_id}?`)) return;
    setBusyId(request.id);
    setErrors((e) => ({ ...e, [request.id]: '' }));
    try {
      await api(`/api/reassign/${request.id}/decide`, {
        method: 'POST',
        body: { status, decision_note: (notes[request.id] ?? '').trim() || null },
      });
      showNotice(
        status === 'APROVADO'
          ? `Realocação aprovada. A OS #${request.os_number ?? request.os_id} agora é de ${request.new_driver_name ?? 'outro motorista'}.`
          : `Realocação da OS #${request.os_number ?? request.os_id} reprovada.`,
      );
      setNotes((n) => ({ ...n, [request.id]: '' }));
      emitDataChanged(request.os_id);
      void live.refresh();
    } catch (err) {
      setErrors((e) => ({ ...e, [request.id]: errorMessage(err, 'Não foi possível registrar a decisão. Tente de novo.') }));
      void live.refresh();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Aprovações"
        subtitle={
          canDecide
            ? 'Pedidos de troca de motorista feitos pelo administrador. Aprove ou reprove cada um.'
            : 'Pedidos de troca de motorista aguardando a decisão do gestor.'
        }
        actions={<RefreshButton onClick={() => void live.refresh()} refreshing={live.refreshing} />}
      />

      {!canDecide && <InfoBanner message="Só o gestor pode aprovar ou reprovar. Aqui você acompanha os pedidos." />}
      <LiveStatus live={live} label="Carregando os pedidos…" />
      {notice && <SuccessBanner message={notice} onClose={() => showNotice(null)} />}

      {live.data &&
        (requests.length === 0 ? (
          <div className="bg-white rounded-[2rem] border border-zinc-200 shadow-sm">
            <EmptyState
              icon={CheckCheck}
              title="Nenhum pedido pendente."
              description="Quando o administrador pedir uma realocação, ela aparece aqui."
            />
          </div>
        ) : (
          <ul className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {requests.map((request) => {
              const busy = busyId === request.id;
              return (
                <li key={request.id} className="bg-white rounded-3xl border border-zinc-200 shadow-sm p-5 space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <Link
                        to={`/admin/os/${request.os_id}`}
                        className="text-lg font-black text-zinc-900 hover:text-emerald-700 hover:underline"
                      >
                        OS #{request.os_number ?? request.os_id}
                      </Link>
                      {(request.origin || request.destination) && (
                        <p className="text-xs text-zinc-500">
                          {request.origin ?? '—'} → {request.destination ?? '—'}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {request.os_status && <Badge status={request.os_status} />}
                      <span className="text-xs font-bold text-zinc-500 bg-zinc-100 px-2.5 py-1 rounded-lg whitespace-nowrap">
                        {formatDateTimeManaus(request.created_at)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 bg-zinc-50 rounded-2xl p-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Motorista atual</p>
                      <p className="font-bold text-zinc-900 truncate">{request.current_driver_name ?? '—'}</p>
                    </div>
                    <ArrowRight size={20} className="text-emerald-600 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Novo motorista</p>
                      <p className="font-bold text-zinc-900 truncate">{request.new_driver_name ?? '—'}</p>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Motivo</p>
                    <p className="text-sm text-zinc-700 whitespace-pre-line">{request.reason || '—'}</p>
                    <p className="text-xs text-zinc-500">
                      Pedido por {request.requested_by_name ?? '—'}
                      {request.requested_by_role ? ` (${roleLabel(request.requested_by_role)})` : ''}
                    </p>
                  </div>

                  {errors[request.id] && <ErrorBanner message={errors[request.id]} />}

                  {canDecide ? (
                    <div className="space-y-3 pt-1">
                      <Textarea
                        label="Observação (opcional)"
                        value={notes[request.id] ?? ''}
                        onChange={(v) => setNotes((n) => ({ ...n, [request.id]: v }))}
                        placeholder="Ex.: Aprovado, motorista já avisado."
                        rows={2}
                        maxLength={1000}
                        disabled={busy}
                      />
                      <div className="grid grid-cols-2 gap-3">
                        <Button variant="outline" icon={X} disabled={busy} onClick={() => void decide(request, 'REPROVADO')}>
                          Reprovar
                        </Button>
                        <Button icon={Check} disabled={busy} onClick={() => void decide(request, 'APROVADO')}>
                          {busy ? 'Salvando…' : 'Aprovar'}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="inline-flex items-center gap-2 text-xs font-bold text-amber-700 bg-amber-50 border border-amber-100 px-3 py-1.5 rounded-lg">
                      <Clock size={14} /> Aguardando o gestor
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        ))}
    </>
  );
};
