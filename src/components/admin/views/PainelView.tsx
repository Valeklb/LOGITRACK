import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Activity, BarChart3, ChevronRight, ClipboardList, DollarSign, Percent, Plus, ShieldCheck, Truck, Users } from 'lucide-react';
import type { DashboardDay, DashboardStats, User } from '../../../types';
import { Badge, Button, EmptyState } from '../../common/UI';
import { formatCurrencyBR, formatDateManaus, formatNumberBR, formatTimeManaus, formatTimeRange } from '../../../utils/datetime';
import { DriverName, LiveStatus, PageHeader, RefreshButton, type AdminCoreData, type AdminOS, type LiveData } from '../shared';

const STATUS_COLORS = {
  aberta: '#3b82f6',
  em_rota: '#f59e0b',
  fechada: '#10b981',
  cancelada: '#ef4444',
};

type Tone = 'emerald' | 'blue' | 'amber' | 'indigo' | 'red';

const TONES: Record<Tone, string> = {
  emerald: 'bg-emerald-50 text-emerald-600',
  blue: 'bg-blue-50 text-blue-600',
  amber: 'bg-amber-50 text-amber-600',
  indigo: 'bg-indigo-50 text-indigo-600',
  red: 'bg-red-50 text-red-600',
};

const KpiCard = ({
  label,
  value,
  hint,
  icon: Icon,
  tone,
  onClick,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon: React.ElementType;
  tone: Tone;
  onClick?: () => void;
}) => {
  const content = (
    <>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">{label}</p>
        <div className={`p-2 rounded-xl shrink-0 ${TONES[tone]}`}>
          <Icon size={18} />
        </div>
      </div>
      <p className="text-2xl font-black text-zinc-900 tracking-tight whitespace-nowrap">{value}</p>
      {hint && <p className="text-xs text-zinc-500 font-medium">{hint}</p>}
    </>
  );
  const className = 'bg-white p-5 rounded-3xl border border-zinc-200 shadow-sm flex flex-col gap-2 text-left min-w-0';
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${className} hover:border-emerald-300 transition-colors`}>
        {content}
      </button>
    );
  }
  return <div className={className}>{content}</div>;
};

const DayTooltip = ({ active, payload }: { active?: boolean; payload?: ReadonlyArray<{ payload?: DashboardDay }> }) => {
  const day = active ? payload?.[0]?.payload : undefined;
  if (!day) return null;
  return (
    <div className="bg-white rounded-2xl shadow-lg border border-zinc-100 px-4 py-3 text-sm space-y-0.5">
      <p className="font-bold text-zinc-900">
        {day.label} · {formatDateManaus(day.date)}
      </p>
      <p className="text-zinc-600">{day.os} OS</p>
      <p className="text-zinc-600">Custo: {formatCurrencyBR(day.cost)}</p>
    </div>
  );
};

const PieTooltip = ({ active, payload }: { active?: boolean; payload?: ReadonlyArray<{ name?: string; value?: number }> }) => {
  const item = active ? payload?.[0] : undefined;
  if (!item) return null;
  return (
    <div className="bg-white rounded-xl shadow-lg border border-zinc-100 px-3 py-2 text-sm">
      <span className="font-bold text-zinc-900">{item.name}:</span> <span className="text-zinc-600">{item.value} OS</span>
    </div>
  );
};

const LastSevenDays = ({ stats }: { stats: DashboardStats }) => {
  const days = stats.by_day ?? [];
  const hasData = days.some((d) => d.os > 0);
  const totalOS = days.reduce((sum, d) => sum + d.os, 0);
  const totalCost = days.reduce((sum, d) => sum + d.cost, 0);

  return (
    <div className="xl:col-span-2 bg-white p-5 sm:p-8 rounded-[2rem] border border-zinc-200 shadow-sm space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-black flex items-center gap-2">
          <BarChart3 size={20} className="text-emerald-600" /> Últimos 7 dias
        </h3>
        {hasData && (
          <p className="text-xs font-bold text-zinc-500">
            {totalOS} OS · {formatCurrencyBR(totalCost)}
          </p>
        )}
      </div>
      {hasData ? (
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={days} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fontWeight: 600, fill: '#94a3b8' }}
                dy={10}
              />
              <YAxis
                allowDecimals={false}
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fontWeight: 600, fill: '#94a3b8' }}
              />
              <Tooltip content={<DayTooltip />} cursor={{ fill: '#f8fafc' }} />
              <Bar dataKey="os" name="OS" fill="#10b981" radius={[6, 6, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <EmptyState
          icon={BarChart3}
          title="Nenhuma OS nos últimos 7 dias"
          description="O gráfico mostra as OS pela data marcada, com o custo lançado."
        />
      )}
    </div>
  );
};

const StatusPie = ({ stats }: { stats: DashboardStats }) => {
  const items = [
    { name: 'Abertas', value: stats.aberta, color: STATUS_COLORS.aberta },
    { name: 'Em rota', value: stats.em_rota, color: STATUS_COLORS.em_rota },
    { name: 'Finalizadas', value: stats.fechada, color: STATUS_COLORS.fechada },
    { name: 'Canceladas', value: stats.cancelada, color: STATUS_COLORS.cancelada },
  ];
  const slices = items.filter((i) => i.value > 0);

  return (
    <div className="bg-white p-5 sm:p-8 rounded-[2rem] border border-zinc-200 shadow-sm space-y-6">
      <h3 className="text-lg font-black flex items-center gap-2">
        <Activity size={20} className="text-blue-600" /> Status das OS
      </h3>
      {slices.length === 0 ? (
        <EmptyState icon={Activity} title="Nenhuma OS ainda" description="Os status aparecem aqui assim que houver OS." />
      ) : (
        <>
          <div className="h-[220px] w-full relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={slices}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={60}
                  outerRadius={85}
                  paddingAngle={slices.length > 1 ? 3 : 0}
                  stroke="none"
                  animationDuration={600}
                >
                  {slices.map((item) => (
                    <Cell key={item.name} fill={item.color} />
                  ))}
                </Pie>
                <Tooltip content={<PieTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <p className="text-2xl font-black text-zinc-900">{stats.total}</p>
              <p className="text-[10px] font-bold text-zinc-400 uppercase">Total de OS</p>
            </div>
          </div>
          <div className="space-y-2">
            {items.map((item) => (
              <div key={item.name} className="flex items-center justify-between text-xs font-bold">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-zinc-500">{item.name}</span>
                </div>
                <span className="text-zinc-900">{item.value}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

const RecentOrders = ({ orders, onNewOS }: { orders: AdminOS[]; onNewOS: () => void }) => {
  const navigate = useNavigate();
  const recent = orders.slice(0, 5);

  return (
    <div className="bg-white rounded-[2rem] border border-zinc-200 shadow-sm overflow-hidden">
      <div className="p-5 sm:p-8 border-b border-zinc-100 flex items-center justify-between gap-4">
        <h3 className="text-lg font-black">OS recentes</h3>
        {recent.length > 0 && (
          <button
            type="button"
            onClick={() => navigate('/admin/ordens')}
            className="text-xs text-emerald-600 font-bold hover:underline uppercase tracking-widest"
          >
            Ver todas
          </button>
        )}
      </div>
      {recent.length === 0 ? (
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
      ) : (
        <>
          {/* Celular: cartões */}
          <ul className="md:hidden divide-y divide-zinc-100">
            {recent.map((os) => (
              <li key={os.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/admin/os/${os.id}`)}
                  className="w-full text-left p-4 flex items-center gap-3 hover:bg-zinc-50"
                >
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-black text-zinc-900">#{os.os_number}</span>
                      <Badge status={os.status} />
                    </div>
                    <p className="text-sm text-zinc-700 font-medium truncate">
                      <DriverName os={os} />
                    </p>
                    <p className="text-xs text-zinc-500 truncate">
                      {os.origin} → {os.destination}
                    </p>
                  </div>
                  <ChevronRight size={18} className="text-zinc-300 shrink-0" />
                </button>
              </li>
            ))}
          </ul>

          {/* Computador: tabela */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-zinc-50/50 text-[10px] font-black text-zinc-400 uppercase tracking-[0.15em]">
                  <th className="px-8 py-4">OS</th>
                  <th className="px-4 py-4">Motorista</th>
                  <th className="px-4 py-4">Origem → Destino</th>
                  <th className="px-4 py-4">Data</th>
                  <th className="px-4 py-4">Previsto</th>
                  <th className="px-4 py-4">Status</th>
                  <th className="px-8 py-4 text-right">Ver</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {recent.map((os) => (
                  <tr key={os.id} className="hover:bg-zinc-50/50 transition-colors">
                    <td className="px-8 py-4 font-black text-zinc-900">#{os.os_number}</td>
                    <td className="px-4 py-4 text-sm font-bold text-zinc-700">
                      <DriverName os={os} />
                    </td>
                    <td className="px-4 py-4 text-sm text-zinc-500 max-w-xs truncate">
                      {os.origin} → {os.destination}
                    </td>
                    <td className="px-4 py-4 text-xs text-zinc-500 font-bold whitespace-nowrap">
                      {formatDateManaus(os.scheduled_date || os.created_at)}
                    </td>
                    <td className="px-4 py-4 text-xs text-zinc-600 font-bold whitespace-nowrap">
                      {formatTimeRange(os.os_start_time, os.os_end_time)}
                    </td>
                    <td className="px-4 py-4">
                      <Badge status={os.status} />
                    </td>
                    <td className="px-8 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => navigate(`/admin/os/${os.id}`)}
                        title="Ver detalhes"
                        aria-label={`Ver OS ${os.os_number}`}
                        className="p-2 text-zinc-400 hover:text-emerald-600 transition-colors"
                      >
                        <ChevronRight size={20} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};

export const PainelView = ({
  core,
  user,
  onNewOS,
}: {
  core: LiveData<AdminCoreData>;
  user: User;
  onNewOS: () => void;
}) => {
  const navigate = useNavigate();
  const stats = core.data?.stats;
  const firstName = user.name.split(' ')[0] || user.name;

  return (
    <>
      <PageHeader
        title="Painel"
        subtitle={
          <>
            Olá, {firstName}. Este é o resumo da operação.
            {core.updatedAt && <> Atualizado às {formatTimeManaus(core.updatedAt)}.</>}
          </>
        }
        actions={
          <>
            <RefreshButton onClick={() => void core.refresh()} refreshing={core.refreshing} />
            <Button icon={Plus} onClick={onNewOS}>
              Nova OS
            </Button>
          </>
        }
      />

      <LiveStatus live={core} label="Carregando o painel…" />

      {stats && core.data && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <KpiCard
              label="Custo total"
              value={formatCurrencyBR(stats.total_haulage_cost)}
              hint={`${formatNumberBR(stats.total_distance_km)} km lançados · sem canceladas`}
              icon={DollarSign}
              tone="emerald"
            />
            <KpiCard
              label="Taxa de conclusão"
              value={stats.completion_rate === null ? '—' : `${formatNumberBR(stats.completion_rate, 1)}%`}
              hint={
                stats.completion_rate === null
                  ? 'Ainda não há OS ativas'
                  : `${stats.fechada} de ${stats.total - stats.cancelada} OS finalizadas`
              }
              icon={Percent}
              tone="blue"
            />
            <KpiCard
              label="OS em rota"
              value={stats.em_rota}
              hint={`${stats.aberta} ${stats.aberta === 1 ? 'aberta aguardando' : 'abertas aguardando'}`}
              icon={Truck}
              tone="amber"
              onClick={() => navigate('/admin/ordens')}
            />
            {user.role === 'gestor' ? (
              <KpiCard
                label="Aprovações pendentes"
                value={stats.pending_approvals}
                hint={`${stats.pending_approvals > 0 ? 'Aguardando sua decisão' : 'Nada para decidir'} · ${stats.drivers_on_shift} em turno`}
                icon={ShieldCheck}
                tone={stats.pending_approvals > 0 ? 'red' : 'emerald'}
                onClick={() => navigate('/admin/aprovacoes')}
              />
            ) : (
              <KpiCard
                label="Motoristas em turno"
                value={stats.drivers_on_shift}
                hint={
                  stats.pending_approvals > 0
                    ? `${stats.pending_approvals} ${stats.pending_approvals === 1 ? 'realocação aguardando' : 'realocações aguardando'} o gestor`
                    : 'Agora'
                }
                icon={Users}
                tone="indigo"
                onClick={() => navigate('/admin/equipe')}
              />
            )}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <LastSevenDays stats={stats} />
            <StatusPie stats={stats} />
          </div>

          <RecentOrders orders={core.data.orders} onNewOS={onNewOS} />
        </>
      )}
    </>
  );
};
