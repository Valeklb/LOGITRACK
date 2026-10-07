import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { User } from '../types';
import { api, ApiError, onAuthEvent, setAuthToken } from './api';
import { clearSession, normalizeUser, readSession, SESSION_KEY, writeSession, type Session } from './session';
import { pending } from './syncQueue';

export const SESSION_EXPIRED_MESSAGE = 'Sua sessão expirou. Entre novamente.';

interface AuthContextValue {
  user: User | null;
  token: string | null;
  /** Guarda a sessão depois do login. */
  login: (token: string, user: User) => void;
  /** Atualiza (e salva) os dados do usuário logado. */
  setUser: (user: User) => void;
  /** Sai na hora (sem perguntar). `reason` aparece na tela de login. */
  logout: (reason?: string) => void;
  /** Motivo do último logout forçado (ex.: sessão expirada), para mostrar na tela de login. */
  logoutMessage: string | null;
  /** Botão "Sair": pergunta antes se ainda há registros na fila offline. */
  confirmAndLogout: () => void;
  /** Relê o usuário em /api/me (nunca rejeita). */
  refreshMe: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function extractUser(data: any): User | null {
  const candidate = data && typeof data === 'object' && data.user ? data.user : data;
  if (candidate && typeof candidate.id === 'number' && typeof candidate.role === 'string') {
    return normalizeUser(candidate as User);
  }
  return null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  // Lido na hora (sem esperar efeito) para que o F5 mantenha a pessoa logada.
  const [session, setSession] = useState<Session | null>(() => {
    const saved = readSession();
    setAuthToken(saved?.token ?? null);
    return saved;
  });
  const sessionRef = useRef<Session | null>(session);
  const [logoutMessage, setLogoutMessage] = useState<string | null>(null);

  const applySession = useCallback((next: Session | null) => {
    sessionRef.current = next;
    setAuthToken(next?.token ?? null);
    if (next) writeSession(next);
    else clearSession();
    setSession(next);
  }, []);

  const login = useCallback(
    (token: string, user: User) => {
      setLogoutMessage(null);
      applySession({ token, user: normalizeUser(user) });
    },
    [applySession],
  );

  const setUser = useCallback(
    (user: User) => {
      const current = sessionRef.current;
      if (!current) return;
      applySession({ token: current.token, user: normalizeUser(user) });
    },
    [applySession],
  );

  const logout = useCallback(
    (reason?: string) => {
      if (sessionRef.current) {
        // Avisa o servidor (melhor esforço; o token ainda vai no cabeçalho desta chamada).
        api('/api/logout', { method: 'POST', skipAuthHandler: true, timeoutMs: 5000 }).catch(() => {});
      }
      // Guardado também no contexto: a guarda de rota pode redirecionar antes e perder o `state`.
      setLogoutMessage(reason ?? null);
      applySession(null);
      navigateRef.current('/login', { replace: true, state: reason ? { message: reason } : null });
    },
    [applySession],
  );

  const confirmAndLogout = useCallback(() => {
    const current = sessionRef.current;
    if (current) {
      const count = pending(current.user.id).length;
      if (
        count > 0 &&
        !window.confirm(
          `Ainda há ${count} registro(s) esperando internet para serem enviados. ` +
            'Se sair agora, eles só serão enviados quando você entrar de novo neste aparelho. Sair mesmo assim?',
        )
      ) {
        return;
      }
    }
    logout();
  }, [logout]);

  const refreshMe = useCallback(async () => {
    const current = sessionRef.current;
    if (!current) return;
    try {
      const data = await api('/api/me', { skipAuthHandler: true });
      // Ignora se a sessão mudou enquanto esperava.
      if (sessionRef.current?.token !== current.token) return;
      const fresh = extractUser(data);
      if (fresh) applySession({ token: current.token, user: fresh });
    } catch (err) {
      if (sessionRef.current?.token !== current.token) return;
      if (err instanceof ApiError && err.status === 401) logout(SESSION_EXPIRED_MESSAGE);
      // Sem conexão / erro do servidor: mantém o usuário salvo.
    }
  }, [applySession, logout]);

  // Confere a sessão em segundo plano ao abrir o app.
  useEffect(() => {
    if (sessionRef.current) void refreshMe();
  }, [refreshMe]);

  // Avisos vindos das chamadas à API (401 / troca de senha obrigatória).
  useEffect(() => {
    return onAuthEvent((event) => {
      const current = sessionRef.current;
      if (!current) return;
      if (event === 'unauthorized') {
        logout(SESSION_EXPIRED_MESSAGE);
      } else if (event === 'password_change_required' && !current.user.must_change_password) {
        setUser({ ...current.user, must_change_password: true });
      }
    });
  }, [logout, setUser]);

  // Login/logout em outra aba do mesmo navegador.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== SESSION_KEY && e.key !== null) return;
      const stored = readSession();
      const current = sessionRef.current;
      if (stored?.token !== current?.token || stored?.user.id !== current?.user.id) {
        window.location.reload();
        return;
      }
      if (stored && current) {
        // Mesma sessão, dados atualizados (ex.: turno iniciado na outra aba).
        sessionRef.current = stored;
        setSession(stored);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      token: session?.token ?? null,
      login,
      setUser,
      logout,
      logoutMessage,
      confirmAndLogout,
      refreshMe,
    }),
    [session, login, setUser, logout, logoutMessage, confirmAndLogout, refreshMe],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>');
  return ctx;
}

/** Página inicial de cada papel. */
export function homePathFor(user: Pick<User, 'role'> | null | undefined): string {
  if (!user) return '/login';
  return user.role === 'driver' ? '/motorista' : '/admin/painel';
}
