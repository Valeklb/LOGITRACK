import React, { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence } from 'motion/react';
import { CheckCheck, ClipboardList, History, KeyRound, LayoutDashboard, LogOut, ShieldCheck, Users } from 'lucide-react';
import type { DashboardStats, ServiceOrder, User } from '../../types';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { emitDataChanged } from '../../lib/events';
import { Logo } from '../common/UI';
import { roleLabel } from '../../utils/labels';
import { OSFormModal } from './OSFormModal';
import { SuccessBanner, useLiveData, useNotice, type AdminCoreData, type AdminOS } from './shared';
import { PainelView } from './views/PainelView';
import { OrdersView } from './views/OrdersView';
import { HistoryView } from './views/HistoryView';
import { ChecklistsView } from './views/ChecklistsView';
import { ApprovalsView } from './views/ApprovalsView';
import { TeamView } from './views/TeamView';

type AdminView = 'painel' | 'ordens' | 'historico' | 'checklists' | 'equipe' | 'aprovacoes';

const NAV_ITEMS: { id: AdminView; label: string; short: string; icon: React.ElementType }[] = [
  { id: 'painel', label: 'Painel', short: 'Painel', icon: LayoutDashboard },
  { id: 'ordens', label: 'Ordens de serviço', short: 'Ordens', icon: ClipboardList },
  { id: 'historico', label: 'Histórico', short: 'Histórico', icon: History },
  { id: 'checklists', label: 'Checklists', short: 'Checklists', icon: ShieldCheck },
  { id: 'equipe', label: 'Equipe', short: 'Equipe', icon: Users },
  { id: 'aprovacoes', label: 'Aprovações', short: 'Aprovações', icon: CheckCheck },
];

function isAdminView(value: string | undefined): value is AdminView {
  return NAV_ITEMS.some((item) => item.id === value);
}

async function loadCoreData(): Promise<AdminCoreData> {
  const [stats, orders, users] = await Promise.all([
    api<DashboardStats>('/api/stats'),
    api<AdminOS[]>('/api/os'),
    api<User[]>('/api/users'),
  ]);
  return {
    stats,
    orders: Array.isArray(orders) ? orders : [],
    users: Array.isArray(users) ? users : [],
  };
}

const CountBadge = ({ count, className = '' }: { count: number; className?: string }) =>
  count > 0 ? (
    <span className={`bg-red-500 text-white text-[10px] min-w-[18px] px-1.5 py-0.5 rounded-full font-black text-center ${className}`}>
      {count > 99 ? '99+' : count}
    </span>
  ) : null;

export const AdminDashboard = () => {
  const { user, confirmAndLogout } = useAuth();
  const { view } = useParams<{ view: string }>();
  const navigate = useNavigate();
  const core = useLiveData(loadCoreData);
  const [osModal, setOsModal] = useState<{ os: AdminOS | null } | null>(null);
  const [notice, showNotice] = useNotice();

  if (!user) return null;
  if (!isAdminView(view)) return <Navigate to="/admin/painel" replace />;

  const pendingApprovals = core.data?.stats.pending_approvals ?? 0;
  const go = (id: AdminView) => navigate(`/admin/${id}`);
  const openNewOS = () => setOsModal({ os: null });
  const openEditOS = (os: AdminOS) => setOsModal({ os });

  const handleOSSaved = (saved: ServiceOrder | null, wasEdit: boolean) => {
    setOsModal(null);
    if (saved) {
      showNotice(
        wasEdit
          ? `OS #${saved.os_number} salva.`
          : `OS #${saved.os_number} criada${saved.driver_name ? ` e enviada para ${saved.driver_name}` : ''}.`,
      );
      emitDataChanged(saved.id);
    }
  };

  return (
    <div className="min-h-dvh bg-[#F8F9FA] lg:flex font-sans">
      {/* Menu lateral (computador) */}
      <aside className="hidden lg:flex flex-col w-72 shrink-0 bg-white border-r border-zinc-200 p-8 gap-10 shadow-sm sticky top-0 h-dvh overflow-y-auto">
        <Logo />
        <nav className="flex-1 space-y-1" aria-label="Menu principal">
          <p className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] mb-4 px-4">Menu</p>
          {NAV_ITEMS.map((item) => {
            const active = view === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => go(item.id)}
                aria-current={active ? 'page' : undefined}
                className={`w-full flex items-center gap-3 p-3.5 rounded-xl transition-all duration-200 ${
                  active ? 'bg-emerald-50 text-emerald-700 font-bold shadow-sm' : 'text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900'
                }`}
              >
                <item.icon size={20} strokeWidth={active ? 2.5 : 2} />
                <span className="text-sm">{item.label}</span>
                {item.id === 'aprovacoes' && <CountBadge count={pendingApprovals} className="ml-auto" />}
              </button>
            );
          })}
        </nav>

        <div className="pt-6 border-t border-zinc-100 space-y-2">
          <div className="flex items-center gap-3 mb-4 p-2">
            <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-700 font-black shrink-0">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold truncate">{user.name}</p>
              <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">{roleLabel(user.role)}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate('/trocar-senha')}
            className="w-full flex items-center gap-3 p-3 text-zinc-600 hover:bg-zinc-50 rounded-xl transition-all font-bold text-sm"
          >
            <KeyRound size={20} /> Alterar senha
          </button>
          <button
            type="button"
            onClick={confirmAndLogout}
            className="w-full flex items-center gap-3 p-3 text-red-500 hover:bg-red-50 rounded-xl transition-all font-bold text-sm"
          >
            <LogOut size={20} /> Sair
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0 pb-28 lg:pb-10">
        {/* Topo (celular) */}
        <header className="bg-white border-b border-zinc-200 lg:hidden sticky top-0 z-20 pt-safe">
          <div className="px-4 py-3 flex items-center justify-between gap-3">
            <Logo size={26} />
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => navigate('/trocar-senha')}
                title="Alterar senha"
                aria-label="Alterar senha"
                className="p-2.5 text-zinc-500 hover:bg-zinc-100 rounded-xl"
              >
                <KeyRound size={22} />
              </button>
              <button
                type="button"
                onClick={confirmAndLogout}
                title="Sair"
                aria-label="Sair"
                className="p-2.5 text-zinc-500 hover:text-red-500 hover:bg-red-50 rounded-xl"
              >
                <LogOut size={22} />
              </button>
            </div>
          </div>
        </header>

        <div className="p-4 sm:p-6 lg:p-10 space-y-6 max-w-7xl mx-auto">
          {notice && <SuccessBanner message={notice} onClose={() => showNotice(null)} />}

          {view === 'painel' && <PainelView core={core} user={user} onNewOS={openNewOS} />}
          {view === 'ordens' && <OrdersView core={core} onNewOS={openNewOS} onEditOS={openEditOS} />}
          {view === 'historico' && <HistoryView core={core} onEditOS={openEditOS} />}
          {view === 'checklists' && <ChecklistsView />}
          {view === 'equipe' && <TeamView core={core} user={user} />}
          {view === 'aprovacoes' && <ApprovalsView user={user} />}
        </div>
      </main>

      {/* Menu inferior (celular) */}
      <nav
        aria-label="Menu principal"
        className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-zinc-200 shadow-lg pb-safe"
      >
        <div className="flex overflow-x-auto px-1 pt-2">
          {NAV_ITEMS.map((item) => {
            const active = view === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => go(item.id)}
                aria-current={active ? 'page' : undefined}
                className={`relative flex-1 min-w-[58px] flex flex-col items-center gap-1 px-0.5 py-1 transition-colors ${
                  active ? 'text-emerald-600' : 'text-zinc-400'
                }`}
              >
                <item.icon size={22} strokeWidth={active ? 2.5 : 2} />
                <span className="text-[10px] font-bold whitespace-nowrap">{item.short}</span>
                {item.id === 'aprovacoes' && <CountBadge count={pendingApprovals} className="absolute top-0 right-1" />}
              </button>
            );
          })}
        </div>
      </nav>

      <AnimatePresence>
        {osModal && (
          <React.Fragment key={osModal.os ? `edit-${osModal.os.id}` : 'create'}>
            <OSFormModal
              os={osModal.os}
              drivers={core.data?.users ?? []}
              onClose={() => setOsModal(null)}
              onSaved={(saved) => handleOSSaved(saved, Boolean(osModal.os))}
            />
          </React.Fragment>
        )}
      </AnimatePresence>
    </div>
  );
};
