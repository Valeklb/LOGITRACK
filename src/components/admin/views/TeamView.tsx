import React, { useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { KeyRound, Pencil, Power, Truck, UserCheck, UserPlus, Users, UserX } from 'lucide-react';
import type { User, UserRole } from '../../../types';
import { api, errorMessage } from '../../../lib/api';
import { emitDataChanged } from '../../../lib/events';
import { Button, EmptyState, ErrorBanner } from '../../common/UI';
import { roleLabel } from '../../../utils/labels';
import { formatDateTimeManaus, formatTimeManaus, isTodayInManaus } from '../../../utils/datetime';
import {
  FilterChips,
  LiveStatus,
  PageHeader,
  RefreshButton,
  SearchInput,
  SuccessBanner,
  formatCPF,
  matchesSearch,
  useNotice,
  type AdminCoreData,
  type LiveData,
} from '../shared';
import { ResetPasswordModal, UserFormModal } from './UserModals';

type RoleFilter = 'TODOS' | UserRole;

type TeamModal = { type: 'create' } | { type: 'edit'; target: User } | { type: 'reset'; target: User } | null;

const ROLE_STYLES: Record<string, { avatar: string; badge: string }> = {
  driver: { avatar: 'bg-emerald-100 text-emerald-700', badge: 'bg-emerald-100 text-emerald-700' },
  gestor: { avatar: 'bg-indigo-100 text-indigo-700', badge: 'bg-indigo-100 text-indigo-700' },
  admin: { avatar: 'bg-blue-100 text-blue-700', badge: 'bg-blue-100 text-blue-700' },
};

function shiftText(u: User): string | null {
  if (u.shift_status !== 'ON_SHIFT' || !u.shift_started_at) return null;
  const when = isTodayInManaus(u.shift_started_at)
    ? formatTimeManaus(u.shift_started_at)
    : formatDateTimeManaus(u.shift_started_at);
  return `Em turno desde ${when}${u.current_plate ? ` · ${u.current_plate}` : ''}`;
}

const CardAction = ({
  icon: Icon,
  label,
  onClick,
  tone = 'neutral',
  disabled,
}: {
  icon: React.ElementType;
  label: string;
  onClick: () => void;
  tone?: 'neutral' | 'red' | 'emerald' | 'amber';
  disabled?: boolean;
}) => {
  const tones = {
    neutral: 'bg-zinc-50 text-zinc-700 hover:bg-zinc-100',
    red: 'bg-red-50 text-red-700 hover:bg-red-100',
    emerald: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
    amber: 'bg-amber-50 text-amber-700 hover:bg-amber-100',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${tones[tone]}`}
    >
      <Icon size={15} /> {label}
    </button>
  );
};

export const TeamView = ({ core, user }: { core: LiveData<AdminCoreData>; user: User }) => {
  const isAdmin = user.role === 'admin';
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('TODOS');
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<TeamModal>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, showNotice] = useNotice();

  const allUsers = core.data?.users ?? [];
  const orders = core.data?.orders ?? [];
  // O gestor só cuida de motoristas.
  const team = isAdmin ? allUsers : allUsers.filter((u) => u.role === 'driver');
  const filtered = team.filter(
    (u) =>
      (roleFilter === 'TODOS' || u.role === roleFilter) &&
      matchesSearch(search, [u.name, u.email, u.cpf, u.current_plate, roleLabel(u.role)]),
  );

  const canManage = (target: User) => target.id !== user.id && (isAdmin || target.role === 'driver');

  const runAction = async (target: User, action: () => Promise<string>) => {
    if (busyId) return;
    setBusyId(target.id);
    setActionError(null);
    try {
      const message = await action();
      showNotice(message);
      emitDataChanged(null);
    } catch (err) {
      setActionError(errorMessage(err, 'Não foi possível concluir. Tente de novo.'));
    } finally {
      setBusyId(null);
    }
  };

  const toggleActive = (target: User) => {
    const activating = !target.is_active;
    let message: string;
    if (activating) {
      message = `Ativar ${target.name}? A pessoa volta a conseguir entrar no app.`;
    } else {
      message = `Desativar ${target.name}? A pessoa sai do app na hora e não consegue mais entrar.`;
      if (target.shift_status === 'ON_SHIFT') message += ' O turno dela será encerrado.';
      if (target.role === 'driver') {
        const open = orders.filter(
          (o) => Number(o.driver_id) === target.id && (o.status === 'ABERTA' || o.status === 'EM_ROTA' || o.status === 'EM_COLETA'),
        );
        if (open.length > 0) {
          message +=
            `\n\nAtenção: ${target.name} ainda tem ${open.length} ` +
            `${open.length === 1 ? 'OS aberta ou em rota' : 'OS abertas ou em rota'} ` +
            `(${open.map((o) => `#${o.os_number}`).join(', ')}). Elas continuam com essa pessoa até você realocar.`;
        }
      }
    }
    if (!window.confirm(message)) return;
    void runAction(target, async () => {
      await api(`/api/users/${target.id}`, { method: 'PATCH', body: { is_active: activating } });
      return activating ? `${target.name} foi ativado(a).` : `${target.name} foi desativado(a).`;
    });
  };

  const endShift = (target: User) => {
    if (!window.confirm(`Encerrar o turno de ${target.name}? A pessoa será avisada no app.`)) return;
    void runAction(target, async () => {
      const res = await api<{ already?: boolean }>(`/api/users/${target.id}/end-shift`, { method: 'POST' });
      return res?.already ? `O turno de ${target.name} já estava encerrado.` : `Turno de ${target.name} encerrado.`;
    });
  };

  const roleChips = [
    { value: 'TODOS' as RoleFilter, label: 'Todos', count: team.length },
    { value: 'driver' as RoleFilter, label: 'Motoristas', count: team.filter((u) => u.role === 'driver').length },
    { value: 'gestor' as RoleFilter, label: 'Gestores', count: team.filter((u) => u.role === 'gestor').length },
    { value: 'admin' as RoleFilter, label: 'Administradores', count: team.filter((u) => u.role === 'admin').length },
  ];

  return (
    <>
      <PageHeader
        title="Equipe"
        subtitle={
          isAdmin
            ? 'Cadastre pessoas, resete senhas e acompanhe quem está em turno.'
            : 'Cadastre motoristas, resete senhas e acompanhe quem está em turno.'
        }
        actions={
          <>
            <RefreshButton onClick={() => void core.refresh()} refreshing={core.refreshing} />
            <Button icon={UserPlus} onClick={() => setModal({ type: 'create' })}>
              {isAdmin ? 'Novo usuário' : 'Novo motorista'}
            </Button>
          </>
        }
      />

      <LiveStatus live={core} label="Carregando a equipe…" />
      {actionError && <ErrorBanner message={actionError} />}
      {notice && <SuccessBanner message={notice} onClose={() => showNotice(null)} />}

      {core.data && (
        <>
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            {isAdmin ? <FilterChips options={roleChips} value={roleFilter} onChange={setRoleFilter} /> : <div />}
            <SearchInput value={search} onChange={setSearch} placeholder="Buscar nome, e-mail, CPF ou placa" />
          </div>

          {filtered.length === 0 ? (
            <div className="bg-white rounded-[2rem] border border-zinc-200 shadow-sm">
              <EmptyState
                icon={Users}
                title={team.length === 0 ? 'Nenhum motorista cadastrado ainda.' : 'Ninguém encontrado'}
                description={
                  team.length === 0 ? 'Clique em Novo motorista para cadastrar.' : 'Tente outro filtro ou outra busca.'
                }
              />
            </div>
          ) : (
            <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filtered.map((member) => {
                const styles = ROLE_STYLES[member.role] ?? ROLE_STYLES.driver;
                const shift = shiftText(member);
                const isSelf = member.id === user.id;
                const busy = busyId === member.id;
                return (
                  <li
                    key={member.id}
                    className={`bg-white p-5 rounded-3xl border shadow-sm space-y-4 ${
                      member.is_active ? 'border-zinc-200' : 'border-zinc-200 bg-zinc-50/80'
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      <div
                        className={`w-12 h-12 rounded-2xl flex items-center justify-center text-lg font-black shrink-0 ${
                          member.is_active ? styles.avatar : 'bg-zinc-200 text-zinc-500'
                        }`}
                      >
                        {member.name.charAt(0).toUpperCase() || '?'}
                      </div>
                      <div className="flex-1 min-w-0 space-y-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-black text-zinc-900 truncate">{member.name}</p>
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-md uppercase tracking-wide ${styles.badge}`}>
                            {roleLabel(member.role)}
                          </span>
                          {isSelf && (
                            <span className="text-[10px] font-black px-2 py-0.5 rounded-md uppercase tracking-wide bg-zinc-900 text-white">
                              Você
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-zinc-500 font-medium truncate">{member.email}</p>
                        <p className="text-xs text-zinc-500 font-medium">CPF {formatCPF(member.cpf)}</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2 py-1 rounded-full ${
                          member.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${member.is_active ? 'bg-emerald-500' : 'bg-red-500'}`} />
                        {member.is_active ? 'Ativo' : 'Inativo'}
                      </span>
                      {member.must_change_password && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-full bg-amber-50 text-amber-700">
                          <KeyRound size={12} /> Senha provisória
                        </span>
                      )}
                    </div>

                    {member.role === 'driver' && (
                      <div
                        className={`flex items-center gap-2 text-sm font-bold rounded-xl px-3 py-2 ${
                          shift ? 'bg-emerald-50 text-emerald-800' : 'bg-zinc-50 text-zinc-500'
                        }`}
                      >
                        <Truck size={16} className="shrink-0" />
                        <span className="truncate">{shift ?? 'Fora de turno'}</span>
                      </div>
                    )}

                    {canManage(member) && (
                      <div className="flex flex-wrap gap-2 pt-3 border-t border-zinc-100">
                        <CardAction icon={Pencil} label="Editar" disabled={busy} onClick={() => setModal({ type: 'edit', target: member })} />
                        {member.is_active && (
                          <CardAction
                            icon={KeyRound}
                            label="Resetar senha"
                            disabled={busy}
                            onClick={() => setModal({ type: 'reset', target: member })}
                          />
                        )}
                        {member.shift_status === 'ON_SHIFT' && (
                          <CardAction icon={Power} label="Encerrar turno" tone="amber" disabled={busy} onClick={() => endShift(member)} />
                        )}
                        <CardAction
                          icon={member.is_active ? UserX : UserCheck}
                          label={member.is_active ? 'Desativar' : 'Ativar'}
                          tone={member.is_active ? 'red' : 'emerald'}
                          disabled={busy}
                          onClick={() => toggleActive(member)}
                        />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      <AnimatePresence>
        {(modal?.type === 'create' || modal?.type === 'edit') && (
          <React.Fragment key={modal.type === 'edit' ? `edit-${modal.target.id}` : 'create'}>
            <UserFormModal
              target={modal.type === 'edit' ? modal.target : null}
              actorRole={user.role}
              onClose={() => setModal(null)}
              onSaved={(message) => {
                setModal(null);
                if (message) showNotice(message);
              }}
            />
          </React.Fragment>
        )}
        {modal?.type === 'reset' && (
          <React.Fragment key={`reset-${modal.target.id}`}>
            <ResetPasswordModal target={modal.target} onClose={() => setModal(null)} />
          </React.Fragment>
        )}
      </AnimatePresence>
    </>
  );
};
