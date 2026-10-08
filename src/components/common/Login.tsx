import React, { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Truck, Mail, Lock } from 'lucide-react';
import { motion } from 'motion/react';
import type { User } from '../../types';
import { Button, ErrorBanner, InfoBanner, Input } from './UI';
import { api, ApiError } from '../../lib/api';
import { homePathFor, useAuth } from '../../lib/auth';

export const Login = () => {
  const { user, login, logoutMessage } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as { message?: string; from?: { pathname?: string; search?: string } } | null;
  const infoMessage = (typeof state?.message === 'string' && state.message) || logoutMessage;

  // Volta para a página que a pessoa tentou abrir, se for da área dela.
  const targetFor = (u: Pick<User, 'role' | 'must_change_password'>) => {
    if (u.must_change_password) return '/trocar-senha';
    const from = state?.from?.pathname;
    const area = u.role === 'driver' ? '/motorista' : '/admin';
    if (from && (from === area || from.startsWith(`${area}/`))) return `${from}${state?.from?.search ?? ''}`;
    return homePathFor(u);
  };

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (user) {
    return <Navigate to={targetFor(user)} replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !password) {
      setError('Informe seu e-mail e sua senha.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await api<{ token: string; user: User }>('/api/login', {
        method: 'POST',
        body: { email: cleanEmail, password },
        skipAuthHandler: true,
      });
      if (!data || typeof data.token !== 'string' || !data.user) {
        throw new ApiError(502, 'Resposta inválida do servidor');
      }
      login(data.token, data.user);
      navigate(targetFor(data.user), { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.status === 401 && !err.data?.error ? 'E-mail ou senha incorretos.' : err.message);
      } else {
        setError('Não foi possível entrar. Tente de novo.');
      }
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh bg-zinc-50 flex flex-col items-center justify-center p-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md space-y-8">
        <div className="text-center space-y-2">
          <div className="inline-flex p-4 bg-emerald-100 rounded-3xl text-emerald-600 mb-4">
            <Truck size={48} strokeWidth={1.5} />
          </div>
          <h1 className="text-3xl font-bold text-zinc-900 tracking-tight">LogiTrack</h1>
          <p className="text-zinc-500">Entre com seu e-mail e senha</p>
        </div>

        <form
          onSubmit={handleSubmit}
          noValidate
          className="bg-white p-6 sm:p-8 rounded-3xl shadow-sm border border-zinc-100 space-y-5"
        >
          {infoMessage && !error && <InfoBanner message={infoMessage} />}
          {error && <ErrorBanner message={error} />}
          <Input
            label="E-mail"
            type="email"
            name="email"
            value={email}
            onChange={setEmail}
            icon={Mail}
            placeholder="seu@email.com"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            disabled={loading}
          />
          <Input
            label="Senha"
            type="password"
            name="password"
            value={password}
            onChange={setPassword}
            icon={Lock}
            placeholder="Sua senha"
            autoComplete="current-password"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            disabled={loading}
          />
          <Button type="submit" disabled={loading} className="w-full py-4 text-lg">
            {loading ? 'Entrando...' : 'Entrar'}
          </Button>
        </form>
      </motion.div>
    </div>
  );
};
