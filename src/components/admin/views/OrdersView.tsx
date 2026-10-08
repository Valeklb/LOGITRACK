import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, ClipboardList, Pencil, Plus, Trash2 } from 'lucide-react';
import type { OSStatus } from '../../../types';
import { api, errorMessage } from '../../../lib/api';
import { emitDataChanged } from '../../../lib/events';
import { Badge, Button, EmptyState, ErrorBanner } from '../../common/UI';
import { formatDateManaus, formatTimeRange } from '../../../utils/datetime';
import {
  ActionButton,
  DriverName,
  FilterChips,
  LiveStatus,
  PageHeader,
  RefreshButton,
  SearchInput,
  SuccessBanner,
  matchesSearch,
  searchOrderFields,
  useNotice,
  type AdminCoreData,
  type AdminOS,
  type ChipOption,
  type LiveData,
} from '../shared';

type StatusFilter = 'TODAS' | 'ABERTA' | 'EM_ROTA' | 'FECHADA' | 'CANCELADA';

function statusGroup(status: OSStatus): StatusFilter {
  // EM_COLETA é um status antigo: conta como "em rota".
  return status === 'EM_COLETA' ? 'EM_ROTA' : (status as StatusFilter);
}

export const OrdersView = ({
  core,
  onNewOS,
  onEditOS,
}: {
  core: LiveData<AdminCoreData>;
  onNewOS: () => void;
  onEditOS: (os: AdminOS) => void;
}) => {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<StatusFilter>('TODAS');
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, showNotice] = useNotice();

  const orders = core.data?.orders ?? [];

  const counts = useMemo(() => {
    const c: Record<StatusFilter, number> = { TODAS: orders.length, ABERTA: 0, EM_ROTA: 0, FECHADA: 0, CANCELADA: 0 };
    for (const os of orders) {
      const group = statusGroup(os.status);
      if (group in c) c[group] += 1;
    }
    return c;
  }, [orders]);

  const chips: ChipOption<StatusFilter>[] = [
    { value: 'TODAS', label: 'Todas', count: counts.TODAS },
    { value: 'ABERTA', label: 'Abertas', count: counts.ABERTA },
    { value: 'EM_ROTA', label: 'Em rota', count: counts.EM_ROTA },
    { value: 'FECHADA', label: 'Finalizadas', count: counts.FECHADA },
    { value: 'CANCELADA', label: 'Canceladas', count: counts.CANCELADA },
  ];

  const filtered = orders.filter(
    (os) => (filter === 'TODAS' || statusGroup(os.status) === filter) && matchesSearch(search, searchOrderFields(os)),
  );

  const handleDelete = async (os: AdminOS) => {
    if (busyId) return;
    if (!window.confirm(`Excluir a OS #${os.os_number}? Isso não pode ser desfeito.`)) return;
    setBusyId(os.id);
    setActionError(null);
    try {
      await api(`/api/os/${os.id}`, { method: 'DELETE' });
      showNotice(`OS #${os.os_number} excluída.`);
      emitDataChanged(os.id);
    } catch (err) {
      setActionError(errorMessage(err, 'Não foi possível excluir a OS. Tente de novo.'));
    } finally {
      setBusyId(null);
    }
  };

  const open = (os: AdminOS) => navigate(`/admin/os/${os.id}`);

  const renderActions = (os: AdminOS) => (
    <div className="flex items-center justify-end gap-1">
      <ActionButton icon={ChevronRight} label="Ver detalhes" onClick={() => open(os)} />
      {os.status !== 'CANCELADA' && <ActionButton icon={Pencil} label="Editar" tone="blue" onClick={() => onEditOS(os)} />}
      {os.status === 'ABERTA' && (
        <ActionButton
          icon={Trash2}
          label="Excluir"
          tone="red"
          disabled={busyId === os.id}
          onClick={() => void handleDelete(os)}
        />
      )}
    </div>
  );

  return (
    <>
      <PageHeader
        title="Ordens de serviço"
        subtitle="Crie, acompanhe e edite as OS. Clique em uma OS para ver tudo o que aconteceu."
        actions={
          <>
            <RefreshButton onClick={() => void core.refresh()} refreshing={core.refreshing} />
            <Button icon={Plus} onClick={onNewOS}>
              Nova OS
            </Button>
          </>
        }
      />

      <LiveStatus live={core} label="Carregando as OS…" />
      {actionError && <ErrorBanner message={actionError} />}
      {notice && <SuccessBanner message={notice} onClose={() => showNotice(null)} />}

      {core.data && (
        <>
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <FilterChips options={chips} value={filter} onChange={setFilter} />
            <SearchInput value={search} onChange={setSearch} placeholder="Buscar OS, placa, motorista, origem, destino" />
          </div>

          {orders.length === 0 ? (
            <div className="bg-white rounded-[2rem] border border-zinc-200 shadow-sm">
              <EmptyState
                icon={ClipboardList}
                title="Nenhuma OS cadastrada ainda."
                description="Clique em Nova OS para começar."
                action={
                  <Button icon={Plus} onClick={onNewOS}>
                    Nova OS
                  </Button>
                }
              />
            </div>
          ) : filtered.length === 0 ? (
            <div className="bg-white rounded-[2rem] border border-zinc-200 shadow-sm">
              <EmptyState
                icon={ClipboardList}
                title="Nenhuma OS encontrada"
                description="Tente outro filtro ou outra busca."
              />
            </div>
          ) : (
            <div className="bg-white rounded-[2rem] border border-zinc-200 shadow-sm overflow-hidden">
              {/* Celular: cartões */}
              <ul className="xl:hidden divide-y divide-zinc-100">
                {filtered.map((os) => (
                  <li key={os.id} className="p-4 space-y-2">
                    <button type="button" onClick={() => open(os)} className="w-full text-left space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-black text-zinc-900">#{os.os_number}</span>
                        <Badge status={os.status} />
                      </div>
                      <p className="text-sm font-bold text-zinc-700">
                        <DriverName os={os} />
                      </p>
                      <p className="text-sm text-zinc-500">
                        {os.origin} → {os.destination}
                      </p>
                      <div className="grid grid-cols-3 gap-2 pt-1 text-xs">
                        <div>
                          <p className="text-[10px] font-black text-zinc-400 uppercase">Data</p>
                          <p className="font-bold text-zinc-700">{formatDateManaus(os.scheduled_date || os.created_at)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-black text-zinc-400 uppercase">Previsto</p>
                          <p className="font-bold text-zinc-700">{formatTimeRange(os.os_start_time, os.os_end_time)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-black text-zinc-400 uppercase">Realizado</p>
                          <p className="font-bold text-zinc-700">{formatTimeRange(os.route_start_time, os.route_end_time)}</p>
                        </div>
                      </div>
                    </button>
                    {renderActions(os)}
                  </li>
                ))}
              </ul>

              {/* Computador: tabela */}
              <div className="hidden xl:block overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-zinc-50/50 border-b border-zinc-100 text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                      <th className="px-6 py-4">OS</th>
                      <th className="px-4 py-4">Motorista</th>
                      <th className="px-4 py-4">Origem → Destino</th>
                      <th className="px-4 py-4">Data</th>
                      <th className="px-4 py-4">Previsto</th>
                      <th className="px-4 py-4">Realizado</th>
                      <th className="px-4 py-4">Status</th>
                      <th className="px-6 py-4 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {filtered.map((os) => (
                      <tr key={os.id} className="hover:bg-zinc-50/50 transition-colors">
                        <td className="px-6 py-4">
                          <button
                            type="button"
                            onClick={() => open(os)}
                            className="font-black text-zinc-900 hover:text-emerald-700 hover:underline"
                          >
                            #{os.os_number}
                          </button>
                          {os.plate && <p className="text-[11px] text-zinc-400 font-bold">Carreta {os.plate}</p>}
                        </td>
                        <td className="px-4 py-4 text-sm font-bold text-zinc-700 whitespace-nowrap">
                          <DriverName os={os} />
                        </td>
                        <td className="px-4 py-4 text-sm text-zinc-500 max-w-[260px]">
                          <span className="line-clamp-2">
                            {os.origin} → {os.destination}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-xs text-zinc-500 font-bold whitespace-nowrap">
                          {formatDateManaus(os.scheduled_date || os.created_at)}
                        </td>
                        <td className="px-4 py-4 text-xs text-zinc-600 font-bold whitespace-nowrap">
                          {formatTimeRange(os.os_start_time, os.os_end_time)}
                        </td>
                        <td className="px-4 py-4 text-xs text-zinc-600 font-bold whitespace-nowrap">
                          {formatTimeRange(os.route_start_time, os.route_end_time)}
                        </td>
                        <td className="px-4 py-4">
                          <Badge status={os.status} />
                        </td>
                        <td className="px-6 py-4">{renderActions(os)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
};
