import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, KeyRound, Lock, LogOut } from 'lucide-react';
import { motion } from 'motion/react';
import type { User } from '../../types';
import { Button, ErrorBanner, Input } from './UI';
import { api, ApiError } from '../../lib/api';
import { homePathFor, useAuth } from '../../lib/auth';

const MIN_LENGTH = 6;

export const ChangePassword = () => {
  const { user, setUser, confirmAndLogout } = useAuth();
  const navigate = useNavigate();
  const forced = Boolean(user?.must_change_password);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!user) return null;

  const validate = (): string | null => {
    if (!currentPassword) return forced ? 'Digite a senha provisória que você recebeu.' : 'Digite sua senha atual.';
    if (newPassword.length < MIN_LENGTH) return `A nova senha precisa ter pelo menos ${MIN_LENGTH} caracteres.`;
    if (newPassword === currentPassword) return 'A nova senha precisa ser diferente da atual.';
    if (newPassword !== confirmPassword) return 'A confirmação não é igual à nova senha.';
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await api<{ user: User }>('/api/me/password', {
        method: 'POST',
        body: { current_password: currentPassword, new_password: newPassword },
      });
      const updated: User = data?.user ?? { ...user, must_change_password: false };
      setUser({ ...updated, must_change_password: Boolean(updated.must_change_password) });
      navigate(homePathFor(updated), { replace: true, state: { passwordChanged: true } });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível trocar a senha. Tente de novo.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh bg-zinc-50 flex flex-col items-center justify-center p-6 pb-safe">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md space-y-6">
        {!forced && (
          <button
            type="button"
            onClick={() => navigate(homePathFor(user))}
            className="inline-flex items-center gap-2 text-sm font-medium text-zinc-600 hover:text-zinc-900"
          >
            <ArrowLeft size={18} /> Voltar
          </button>
        )}

        <div className="text-center space-y-2">
          <div className="inline-flex p-4 bg-emerald-100 rounded-3xl text-emerald-600 mb-2">
            <KeyRound size={40} strokeWidth={1.5} />
          </div>
          <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">
            {forced ? 'Crie sua senha' : 'Alterar senha'}
          </h1>
          <p className="text-zinc-500">
            {forced
              ? 'Você entrou com uma senha provisória. Crie sua senha pessoal para continuar.'
              : `Olá, ${user.name.split(' ')[0]}. Escolha uma nova senha para entrar no LogiTrack.`}
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          noValidate
          className="bg-white p-6 sm:p-8 rounded-3xl shadow-sm border border-zinc-100 space-y-5"
        >
          {/* Ajuda os gerenciadores de senha a associar a conta. */}
          <input type="text" name="username" autoComplete="username" value={user.email} readOnly hidden />
          {error && <ErrorBanner message={error} />}
          <Input
            label={forced ? 'Senha provisória' : 'Senha atual'}
            type="password"
            name="current-password"
            value={currentPassword}
            onChange={setCurrentPassword}
            icon={Lock}
            autoComplete="current-password"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            disabled={loading}
          />
          <Input
            label="Nova senha"
            type="password"
            name="new-password"
            value={newPassword}
            onChange={setNewPassword}
            icon={KeyRound}
            autoComplete="new-password"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            disabled={loading}
            hint={`Pelo menos ${MIN_LENGTH} caracteres.`}
          />
          <Input
            label="Confirmar nova senha"
            type="password"
            name="confirm-password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            icon={KeyRound}
            autoComplete="new-password"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            disabled={loading}
          />
          <Button type="submit" disabled={loading} className="w-full py-4 text-lg">
            {loading ? 'Salvando...' : 'Salvar nova senha'}
          </Button>
        </form>

        {forced && (
          <div className="text-center">
            <button
              type="button"
              onClick={confirmAndLogout}
              className="inline-flex items-center gap-2 text-sm font-medium text-zinc-500 hover:text-red-600"
            >
              <LogOut size={16} /> Sair
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
};
