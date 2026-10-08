import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Check, Container, ShieldCheck, Truck, X } from 'lucide-react';
import type { Checklist } from '../../../types';
import { api } from '../../../lib/api';
import { EmptyState } from '../../common/UI';
import { CHECKLIST_LABELS, checklistLabel } from '../../../utils/labels';
import { formatDateTimeManaus } from '../../../utils/datetime';
import {
  FilterChips,
  LiveStatus,
  PageHeader,
  RefreshButton,
  SearchInput,
  matchesSearch,
  useLiveData,
} from '../shared';

type TypeFilter = 'TODOS' | 'VEHICLE' | 'CONTAINER' | 'PROBLEMA';

const KEY_ORDER = Object.keys(CHECKLIST_LABELS);
const TEXT_KEYS = new Set(['observacao']);

const TRAILER_STATES: Record<string, string> = { CHEIA: 'Cheia', VAZIA: 'Vazia' };

function orderedEntries(items: Checklist['items']): [string, boolean | string][] {
  const entries = Object.entries(items ?? {});
  const rank = (key: string) => {
    const i = KEY_ORDER.indexOf(key);
    return i === -1 ? KEY_ORDER.length : i;
  };
  return entries.sort(([a], [b]) => rank(a) - rank(b));
}

function hasProblem(checklist: Checklist): boolean {
  return Object.values(checklist.items ?? {}).some((value) => value === false);
}

const ItemChip = ({ name, value }: { name: string; value: boolean | string }) => {
  if (typeof value === 'boolean') {
    return value ? (
      <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
        <Check size={14} /> {checklistLabel(name)}: OK
      </span>
    ) : (
      <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full bg-red-50 text-red-700 border border-red-200">
        <X size={14} /> {checklistLabel(name)}: Problema
      </span>
    );
  }
  const text = name === 'estado_carreta' ? (TRAILER_STATES[value] ?? value) : value;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full bg-zinc-100 text-zinc-700 border border-zinc-200">
      {checklistLabel(name)}: {text}
    </span>
  );
};

const ChecklistCard = ({ checklist }: { checklist: Checklist }) => {
  const problem = hasProblem(checklist);
  const isVehicle = checklist.type === 'VEHICLE';
  const entries = orderedEntries(checklist.items);
  const chips = entries.filter(([key, value]) => !(TEXT_KEYS.has(key) && typeof value === 'string'));
  const notes = entries.filter(([key, value]) => TEXT_KEYS.has(key) && typeof value === 'string' && value.trim());

  return (
    <li
      className={`bg-white rounded-3xl border shadow-sm p-5 space-y-4 ${problem ? 'border-red-300 ring-1 ring-red-100' : 'border-zinc-200'}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className={`p-2.5 rounded-xl shrink-0 ${isVehicle ? 'bg-indigo-50 text-indigo-600' : 'bg-amber-50 text-amber-600'}`}>
            {isVehicle ? <Truck size={20} /> : <Container size={20} />}
          </div>
          <div className="min-w-0">
            <p className="font-black text-zinc-900 truncate">{checklist.driver_name || 'Motorista'}</p>
            <p className="text-xs text-zinc-500 font-medium">
              {isVehicle ? 'Veículo' : 'Carreta'} · Placa{' '}
              <span className="font-bold text-zinc-700">{checklist.vehicle_plate || '—'}</span>
              {checklist.os_id && checklist.os_number && (
                <>
                  {' '}
                  ·{' '}
                  <Link to={`/admin/os/${checklist.os_id}`} className="font-bold text-emerald-700 hover:underline">
                    OS #{checklist.os_number}
                  </Link>
                </>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {problem && (
            <span className="inline-flex items-center gap-1 text-[11px] font-black uppercase tracking-wide px-2 py-1 rounded-lg bg-red-100 text-red-700">
              <AlertTriangle size={12} /> Com problema
            </span>
          )}
          <span className="text-xs font-bold text-zinc-500 bg-zinc-100 px-2.5 py-1 rounded-lg whitespace-nowrap">
            {formatDateTimeManaus(checklist.created_at)}
          </span>
        </div>
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {chips.map(([key, value]) => (
            <React.Fragment key={key}>
              <ItemChip name={key} value={value} />
            </React.Fragment>
          ))}
        </div>
      )}

      {notes.map(([key, value]) => (
        <div key={key} className="bg-zinc-50 border border-zinc-100 rounded-xl p-3 text-sm text-zinc-700">
          <span className="font-bold">{checklistLabel(key)}:</span> {String(value)}
        </div>
      ))}
    </li>
  );
};

export const ChecklistsView = () => {
  const live = useLiveData(() => api<Checklist[]>('/api/checklists'));
  const [filter, setFilter] = useState<TypeFilter>('TODOS');
  const [search, setSearch] = useState('');

  const all = Array.isArray(live.data) ? live.data : [];
  const filtered = all.filter((c) => {
    if (filter === 'VEHICLE' || filter === 'CONTAINER') {
      if (c.type !== filter) return false;
    } else if (filter === 'PROBLEMA' && !hasProblem(c)) {
      return false;
    }
    return matchesSearch(search, [c.driver_name, c.vehicle_plate, c.os_number]);
  });

  return (
    <>
      <PageHeader
        title="Checklists"
        subtitle="Checklist do veículo (início do turno) e da carreta (início da viagem)."
        actions={<RefreshButton onClick={() => void live.refresh()} refreshing={live.refreshing} />}
      />

      <LiveStatus live={live} label="Carregando os checklists…" />

      {live.data && (
        <>
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <FilterChips
              options={[
                { value: 'TODOS', label: 'Todos', count: all.length },
                { value: 'VEHICLE', label: 'Veículo', count: all.filter((c) => c.type === 'VEHICLE').length },
                { value: 'CONTAINER', label: 'Carreta', count: all.filter((c) => c.type === 'CONTAINER').length },
                { value: 'PROBLEMA', label: 'Com problema', count: all.filter(hasProblem).length },
              ]}
              value={filter}
              onChange={setFilter}
            />
            <SearchInput value={search} onChange={setSearch} placeholder="Buscar motorista, placa ou OS" />
          </div>

          {filtered.length === 0 ? (
            <div className="bg-white rounded-[2rem] border border-zinc-200 shadow-sm">
              <EmptyState
                icon={ShieldCheck}
                title={all.length === 0 ? 'Nenhum checklist ainda.' : 'Nenhum checklist encontrado'}
                description={
                  all.length === 0
                    ? 'Os checklists aparecem aqui quando o motorista inicia o turno ou a viagem.'
                    : 'Tente outro filtro ou outra busca.'
                }
              />
            </div>
          ) : (
            <ul className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {filtered.map((c) => (
                <React.Fragment key={c.id}>
                  <ChecklistCard checklist={c} />
                </React.Fragment>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
};
