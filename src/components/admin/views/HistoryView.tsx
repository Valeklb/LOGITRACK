import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, History, Pencil } from 'lucide-react';
import { Badge, EmptyState } from '../../common/UI';
import { formatCurrencyBR, formatDateManaus, formatNumberBR, formatTimeRange } from '../../../utils/datetime';
import {
  ActionButton,
  DriverName,
  FilterChips,
  LiveStatus,
  PageHeader,
  RefreshButton,
  SearchInput,
  matchesSearch,
  searchOrderFields,
  type AdminCoreData,
  type AdminOS,
  type LiveData,
} from '../shared';

type HistoryFilter = 'TODAS' | 'FECHADA' | 'CANCELADA';

/** KM ou custo: valor formatado, ou um aviso quando a OS finalizada ainda está sem valor. */
const AmountCell = ({ os, value, onEdit }: { os: AdminOS; value: string | null; onEdit: () => void }) => {
  if (value) return <span>{value}</span>;
  if (os.status === 'FECHADA') {
    return (
      <button type="button" onClick={onEdit} className="text-amber-600 font-bold hover:underline">
        Lançar
      </button>
    );
  }
  return <span className="text-zinc-400">—</span>;
};

const Plates = ({ os }: { os: AdminOS }) => (
  <div className="space-y-0.5 text-xs">
    <p>
      <span className="text-zinc-400 font-bold">Cavalo </span>
      <span className="font-bold text-zinc-700">{os.truck_plate || '—'}</span>
    </p>
    <p>
      <span className="text-zinc-400 font-bold">Carreta </span>
      <span className="font-bold text-zinc-700">{os.plate || '—'}</span>
    </p>
  </div>
);

export const HistoryView = ({
  core,
  onEditOS,
}: {
  core: LiveData<AdminCoreData>;
  onEditOS: (os: AdminOS) => void;
}) => {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<HistoryFilter>('TODAS');
  const [search, setSearch] = useState('');

  const done = (core.data?.orders ?? []).filter((os) => os.status === 'FECHADA' || os.status === 'CANCELADA');
  const filtered = done.filter(
    (os) => (filter === 'TODAS' || os.status === filter) && matchesSearch(search, searchOrderFields(os)),
  );
  const finished = filtered.filter((os) => os.status === 'FECHADA');
  const totalKm = finished.reduce((sum, os) => sum + (os.distance_km ?? 0), 0);
  const totalCost = finished.reduce((sum, os) => sum + (os.haulage_cost ?? 0), 0);
  const missing = finished.filter((os) => os.distance_km == null || os.haulage_cost == null).length;

  const km = (os: AdminOS) => (os.distance_km == null ? null : `${formatNumberBR(os.distance_km)} km`);
  const cost = (os: AdminOS) => (os.haulage_cost == null ? null : formatCurrencyBR(os.haulage_cost));
  const open = (os: AdminOS) => navigate(`/admin/os/${os.id}`);

  const renderActions = (os: AdminOS) => (
    <div className="flex items-center justify-end gap-1">
      <ActionButton icon={ChevronRight} label="Ver detalhes" onClick={() => open(os)} />
      {os.status === 'FECHADA' && (
        <ActionButton icon={Pencil} label="Editar (KM e custo)" tone="blue" onClick={() => onEditOS(os)} />
      )}
    </div>
  );

  return (
    <>
      <PageHeader
        title="Histórico"
        subtitle="OS finalizadas e canceladas, com KM e custo lançados."
        actions={<RefreshButton onClick={() => void core.refresh()} refreshing={core.refreshing} />}
      />

      <LiveStatus live={core} label="Carregando o histórico…" />

      {core.data && (
        <>
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <FilterChips
              options={[
                { value: 'TODAS', label: 'Todas', count: done.length },
                { value: 'FECHADA', label: 'Finalizadas', count: done.filter((o) => o.status === 'FECHADA').length },
                { value: 'CANCELADA', label: 'Canceladas', count: done.filter((o) => o.status === 'CANCELADA').length },
              ]}
              value={filter}
              onChange={setFilter}
            />
            <SearchInput value={search} onChange={setSearch} placeholder="Buscar OS, placa, motorista, origem, destino" />
          </div>

          {finished.length > 0 && (
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-zinc-600 bg-white border border-zinc-200 rounded-2xl px-5 py-3">
              <span>
                <strong className="text-zinc-900">{finished.length}</strong> finalizadas
              </span>
              <span>
                <strong className="text-zinc-900">{formatNumberBR(totalKm)} km</strong>
              </span>
              <span>
                <strong className="text-zinc-900">{formatCurrencyBR(totalCost)}</strong>
              </span>
              {missing > 0 && (
                <span className="text-amber-700 font-medium">
                  {missing} {missing === 1 ? 'OS sem KM ou custo lançado' : 'OS sem KM ou custo lançados'}
                </span>
              )}
            </div>
          )}

          {filtered.length === 0 ? (
            <div className="bg-white rounded-[2rem] border border-zinc-200 shadow-sm">
              <EmptyState
                icon={History}
                title={done.length === 0 ? 'Nenhuma OS finalizada ainda.' : 'Nenhuma OS encontrada'}
                description={
                  done.length === 0
                    ? 'Quando o motorista finalizar a viagem, a OS aparece aqui.'
                    : 'Tente outro filtro ou outra busca.'
                }
              />
            </div>
          ) : (
            <div className="bg-white rounded-[2rem] border border-zinc-200 shadow-sm overflow-hidden">
              {/* Celular: cartões */}
              <ul className="xl:hidden divide-y divide-zinc-100">
                {filtered.map((os) => (
                  <li key={os.id} className="p-4 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <button type="button" onClick={() => open(os)} className="font-black text-zinc-900">
                        #{os.os_number}
                      </button>
                      <Badge status={os.status} />
                    </div>
                    <p className="text-sm font-bold text-zinc-700">
                      <DriverName os={os} />
                    </p>
                    <p className="text-sm text-zinc-500">
                      {os.origin} → {os.destination}
                    </p>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <p className="text-[10px] font-black text-zinc-400 uppercase">Data</p>
                        <p className="font-bold text-zinc-700">{formatDateManaus(os.scheduled_date || os.created_at)}</p>
                      </div>
                      <Plates os={os} />
                      <div>
                        <p className="text-[10px] font-black text-zinc-400 uppercase">Previsto</p>
                        <p className="font-bold text-zinc-700">{formatTimeRange(os.os_start_time, os.os_end_time)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-zinc-400 uppercase">Realizado</p>
                        <p className="font-bold text-zinc-700">{formatTimeRange(os.route_start_time, os.route_end_time)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-zinc-400 uppercase">KM</p>
                        <p className="font-black text-emerald-700">
                          <AmountCell os={os} value={km(os)} onEdit={() => onEditOS(os)} />
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-zinc-400 uppercase">Custo</p>
                        <p className="font-black text-zinc-900">
                          <AmountCell os={os} value={cost(os)} onEdit={() => onEditOS(os)} />
                        </p>
                      </div>
                    </div>
                    {renderActions(os)}
                  </li>
                ))}
              </ul>

              {/* Computador: tabela */}
              <div className="hidden xl:block overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-zinc-50/50 border-b border-zinc-100 text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                      <th className="px-4 py-4">OS</th>
                      <th className="px-3 py-4">Motorista</th>
                      <th className="px-3 py-4">Placas</th>
                      <th className="px-3 py-4">Data</th>
                      <th className="px-3 py-4">Previsto / Realizado</th>
                      <th className="px-3 py-4 text-right">KM</th>
                      <th className="px-3 py-4 text-right">Custo</th>
                      <th className="px-4 py-4 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {filtered.map((os) => (
                      <tr key={os.id} className="hover:bg-zinc-50/50 transition-colors">
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => open(os)}
                              className="font-black text-zinc-900 hover:text-emerald-700 hover:underline"
                            >
                              #{os.os_number}
                            </button>
                            <Badge status={os.status} />
                          </div>
                          <p className="text-[11px] text-zinc-400 font-medium max-w-[200px] truncate">
                            {os.origin} → {os.destination}
                          </p>
                        </td>
                        <td className="px-3 py-4 text-sm font-bold text-zinc-700 whitespace-nowrap">
                          <DriverName os={os} />
                        </td>
                        <td className="px-3 py-4 whitespace-nowrap">
                          <Plates os={os} />
                        </td>
                        <td className="px-3 py-4 text-xs text-zinc-500 font-bold whitespace-nowrap">
                          {formatDateManaus(os.scheduled_date || os.created_at)}
                        </td>
                        <td className="px-3 py-4 text-xs font-bold whitespace-nowrap space-y-0.5">
                          <p>
                            <span className="text-zinc-400">Prev. </span>
                            <span className="text-zinc-600">{formatTimeRange(os.os_start_time, os.os_end_time)}</span>
                          </p>
                          <p>
                            <span className="text-zinc-400">Real. </span>
                            <span className="text-zinc-600">{formatTimeRange(os.route_start_time, os.route_end_time)}</span>
                          </p>
                        </td>
                        <td className="px-3 py-4 text-sm font-black text-emerald-700 text-right whitespace-nowrap">
                          <AmountCell os={os} value={km(os)} onEdit={() => onEditOS(os)} />
                        </td>
                        <td className="px-3 py-4 text-sm font-black text-zinc-900 text-right whitespace-nowrap">
                          <AmountCell os={os} value={cost(os)} onEdit={() => onEditOS(os)} />
                        </td>
                        <td className="px-4 py-4">{renderActions(os)}</td>
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
