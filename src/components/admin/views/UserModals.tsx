import React, { useState } from 'react';
import { Dices } from 'lucide-react';
import type { User, UserRole } from '../../../types';
import { api, errorMessage } from '../../../lib/api';
import { emitDataChanged } from '../../../lib/events';
import { Button, ErrorBanner, Input, Modal, Select } from '../../common/UI';
import { roleLabel } from '../../../utils/labels';
import { TempPasswordPanel, formatCPF, generateTempPassword, onlyDigits } from '../shared';

const MIN_PASSWORD = 6;

const ROLE_OPTIONS = [
  { value: 'driver', label: 'Motorista' },
  { value: 'gestor', label: 'Gestor' },
  { value: 'admin', label: 'Administrador' },
];

/** Campo de senha provisória com botão para gerar uma nova. */
const TempPasswordField = ({
  value,
  onChange,
  error,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  disabled?: boolean;
}) => (
  <div className="space-y-2">
    <Input
      label="Senha provisória"
      required
      value={value}
      onChange={onChange}
      autoComplete="off"
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      disabled={disabled}
      hint={`Pelo menos ${MIN_PASSWORD} caracteres. No primeiro acesso a pessoa cria a própria senha.`}
      error={error}
    />
    <button
      type="button"
      onClick={() => onChange(generateTempPassword())}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 text-sm font-bold text-emerald-700 hover:underline disabled:opacity-50"
    >
      <Dices size={16} /> Gerar senha
    </button>
  </div>
);

// ---------------------------------------------------------------------------
// Novo usuário / editar usuário
// ---------------------------------------------------------------------------

interface UserFormModalProps {
  /** Usuário a editar; `null` para cadastrar um novo. */
  target: User | null;
  actorRole: UserRole;
  onClose: () => void;
  /** Depois de editar (mensagem de sucesso, ou null se nada mudou). */
  onSaved: (message: string | null) => void;
}

export const UserFormModal = ({ target, actorRole, onClose, onSaved }: UserFormModalProps) => {
  const isEdit = Boolean(target);
  const canChooseRole = actorRole === 'admin';
  const [form, setForm] = useState(() => ({
    name: target?.name ?? '',
    email: target?.email ?? '',
    cpf: target?.cpf ? formatCPF(target.cpf) : '',
    role: (target?.role ?? 'driver') as UserRole,
    password: isEdit ? '' : generateTempPassword(),
  }));
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ name: string; email: string; password: string } | null>(null);

  const set = (key: keyof typeof form) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  const name = form.name.trim();
  const email = form.email.trim().toLowerCase();
  const cpfDigits = onlyDigits(form.cpf);
  const errors = {
    name: !name ? 'Informe o nome.' : null,
    email: !email ? 'Informe o e-mail.' : !/^[^\s@]+@[^\s@]+$/.test(email) ? 'E-mail inválido.' : null,
    cpf: cpfDigits && cpfDigits.length !== 11 ? 'O CPF precisa ter 11 números.' : null,
    password: !isEdit && form.password.length < MIN_PASSWORD ? `A senha provisória precisa ter pelo menos ${MIN_PASSWORD} caracteres.` : null,
  };
  const hasErrors = Object.values(errors).some(Boolean);
  const show = (message: string | null) => (submitted ? message : null);

  const emailChanged = isEdit && email !== (target?.email ?? '').trim().toLowerCase();
  const roleChanged = isEdit && canChooseRole && form.role !== target?.role;

  const handleSubmit = async () => {
    if (saving) return;
    setSubmitted(true);
    if (hasErrors) return;
    setError(null);

    try {
      if (!target) {
        const body: Record<string, unknown> = {
          name,
          email,
          password: form.password,
          role: canChooseRole ? form.role : 'driver',
        };
        if (cpfDigits) body.cpf = cpfDigits;
        setSaving(true);
        const res = await api<{ user?: User }>('/api/users', { method: 'POST', body });
        setCreated({ name: res?.user?.name ?? name, email: res?.user?.email ?? email, password: form.password });
        emitDataChanged(null);
        return;
      }

      const changes: Record<string, unknown> = {};
      if (name !== target.name) changes.name = name;
      if (emailChanged) changes.email = email;
      if (cpfDigits !== onlyDigits(target.cpf ?? '')) changes.cpf = cpfDigits || null;
      if (roleChanged) changes.role = form.role;
      if (Object.keys(changes).length === 0) {
        onSaved(null);
        return;
      }
      setSaving(true);
      await api(`/api/users/${target.id}`, { method: 'PATCH', body: changes });
      emitDataChanged(null);
      onSaved(`Dados de ${name} salvos.`);
    } catch (err) {
      setError(errorMessage(err, 'Não foi possível salvar. Tente de novo.'));
      setSaving(false);
    }
  };

  if (created) {
    return (
      <Modal title="Usuário cadastrado" onClose={onClose} footer={<Button onClick={onClose}>Concluir</Button>}>
        <TempPasswordPanel name={created.name} email={created.email} password={created.password} />
      </Modal>
    );
  }

  return (
    <Modal
      title={isEdit ? `Editar ${target?.name}` : 'Novo usuário'}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? 'Salvando…' : isEdit ? 'Salvar' : 'Cadastrar'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {error && <ErrorBanner message={error} />}
        <Input
          label="Nome"
          required
          value={form.name}
          onChange={set('name')}
          placeholder="Ex.: João da Silva"
          autoComplete="off"
          error={show(errors.name)}
        />
        <Input
          label="E-mail"
          required
          type="email"
          value={form.email}
          onChange={set('email')}
          placeholder="joao@empresa.com"
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          error={show(errors.email)}
          hint={isEdit ? 'É o login da pessoa.' : 'Será o login da pessoa.'}
        />
        <Input
          label="CPF"
          value={form.cpf}
          onChange={set('cpf')}
          placeholder="000.000.000-00 (opcional)"
          inputMode="numeric"
          autoComplete="off"
          maxLength={14}
          error={errors.cpf && (submitted || cpfDigits.length > 11) ? errors.cpf : null}
        />
        {canChooseRole ? (
          <Select
            label="Papel"
            required
            value={form.role}
            onChange={set('role')}
            options={ROLE_OPTIONS}
            hint="Motorista usa o app no celular. Gestor e administrador usam o painel."
          />
        ) : (
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-zinc-700">Papel</p>
            <p className="bg-zinc-100 text-zinc-600 rounded-xl py-3 px-4">{roleLabel(target?.role ?? 'driver')}</p>
          </div>
        )}
        {!isEdit && <TempPasswordField value={form.password} onChange={set('password')} error={show(errors.password)} />}
        {(emailChanged || roleChanged) && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl p-3">
            Ao mudar o e-mail ou o papel, a pessoa sai do app e precisa entrar de novo
            {roleChanged && target?.shift_status === 'ON_SHIFT' ? ' (e o turno dela é encerrado)' : ''}.
          </p>
        )}
      </div>
    </Modal>
  );
};

// ---------------------------------------------------------------------------
// Resetar senha
// ---------------------------------------------------------------------------

export const ResetPasswordModal = ({ target, onClose }: { target: User; onClose: () => void }) => {
  const [password, setPassword] = useState(generateTempPassword);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const passwordError = password.length < MIN_PASSWORD ? `A senha provisória precisa ter pelo menos ${MIN_PASSWORD} caracteres.` : null;

  const handleSubmit = async () => {
    if (saving) return;
    setSubmitted(true);
    if (passwordError) return;
    setSaving(true);
    setError(null);
    try {
      await api(`/api/users/${target.id}/reset-password`, { method: 'POST', body: { temp_password: password } });
      setDone(true);
      emitDataChanged(null);
    } catch (err) {
      setError(errorMessage(err, 'Não foi possível resetar a senha. Tente de novo.'));
      setSaving(false);
    }
  };

  if (done) {
    return (
      <Modal title="Senha resetada" onClose={onClose} footer={<Button onClick={onClose}>Concluir</Button>}>
        <TempPasswordPanel name={target.name} email={target.email} password={password} />
      </Modal>
    );
  }

  return (
    <Modal
      title={`Resetar senha de ${target.name}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? 'Salvando…' : 'Resetar senha'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {error && <ErrorBanner message={error} />}
        <p className="text-sm text-zinc-600">
          A senha atual de <strong>{target.name}</strong> deixa de funcionar e a pessoa sai do app na hora. Ela vai entrar
          com a senha provisória abaixo e criar uma senha nova.
        </p>
        <TempPasswordField
          value={password}
          onChange={setPassword}
          error={submitted ? passwordError : null}
          disabled={saving}
        />
      </div>
    </Modal>
  );
};
