import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Bell, X } from 'lucide-react';
import type { UserRole, WsMessage } from './types';
import { wsUrl } from './lib/api';
import { homePathFor, useAuth } from './lib/auth';
import { emitDataChanged } from './lib/events';
import { syncQueue } from './lib/syncQueue';

import { Login } from './components/common/Login';
import { ChangePassword } from './components/common/ChangePassword';
import { AdminDashboard } from './components/admin/AdminDashboard';
import { AdminOSDetail } from './components/admin/AdminOSDetail';
import { DriverHome } from './components/driver/DriverHome';
import { DriverOSDetail } from './components/driver/DriverOSDetail';
import { ShiftStart } from './components/driver/ShiftStart';

const ADMIN_ROLES: UserRole[] = ['admin', 'gestor'];
const DRIVER_ROLES: UserRole[] = ['driver'];
const ADMIN_VIEWS = ['painel', 'ordens', 'historico', 'checklists', 'equipe', 'aprovacoes'];

const RECONNECT_DELAYS_MS = [1000, 2000, 5000, 10000, 30000];
const WS_AUTH_FAILED_CODE = 4401;
const QUEUE_INTERVAL_MS = 20000;
const TOAST_DURATION_MS = 6000;

// --- Guardas de rota ---

/** Exige login (e senha definitiva). Com `roles`, manda quem não pertence para a própria página inicial. */
const RequireAuth = ({ roles, children }: { roles?: UserRole[]; children?: React.ReactNode }) => {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (user.must_change_password) return <Navigate to="/trocar-senha" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to={homePathFor(user)} replace />;
  return <>{children ?? <Outlet />}</>;
};

/** /trocar-senha: só exige estar logado. */
const RequireLogin = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return <>{children}</>;
};

const HomeRedirect = () => {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.must_change_password) return <Navigate to="/trocar-senha" replace />;
  return <Navigate to={homePathFor(user)} replace />;
};

const AdminViewRoute = () => {
  const { view } = useParams<{ view: string }>();
  if (!view || !ADMIN_VIEWS.includes(view)) return <Navigate to="/admin/painel" replace />;
  return <AdminDashboard />;
};

/** Moldura com largura de celular para as telas do motorista. */
const DriverShell = () => (
  <div className="max-w-md mx-auto min-h-dvh bg-zinc-50 shadow-2xl relative flex flex-col">
    <Outlet />
  </div>
);

// --- Aviso (toast) ---

interface Toast {
  id: number;
  title: string;
  message?: string;
  osId?: number | null;
}

// --- App ---

export default function App() {
  const { user, token, logout, refreshMe } = useAuth();
  const navigate = useNavigate();
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  const userId = user?.id ?? null;
  const role = user?.role ?? null;
  const mustChangePassword = Boolean(user?.must_change_password);

  // Refs para usar dentro dos efeitos sem reconectar o WebSocket a cada mudança.
  const logoutRef = useRef(logout);
  const refreshMeRef = useRef(refreshMe);
  const mustChangePasswordRef = useRef(mustChangePassword);
  logoutRef.current = logout;
  refreshMeRef.current = refreshMe;
  mustChangePasswordRef.current = mustChangePassword;

  const showToast = useCallback((title: string, message?: string, osId?: number | null) => {
    window.clearTimeout(toastTimer.current);
    setToast({ id: Date.now(), title, message, osId });
    toastTimer.current = window.setTimeout(() => setToast(null), TOAST_DURATION_MS);
  }, []);
  const showToastRef = useRef(showToast);
  showToastRef.current = showToast;

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  // Some com o aviso ao sair.
  useEffect(() => {
    if (!userId) setToast(null);
  }, [userId]);

  // WebSocket único enquanto houver login + reconexão ao voltar para o app.
  useEffect(() => {
    if (!token || !userId) return;

    let stopped = false;
    let ws: WebSocket | null = null;
    let retryTimer: number | undefined;
    let attempt = 0;
    let connectedBefore = false;
    let authRejected = false;

    const clearRetry = () => {
      window.clearTimeout(retryTimer);
      retryTimer = undefined;
    };

    const scheduleReconnect = () => {
      if (stopped || authRejected || retryTimer !== undefined) return;
      const delay = RECONNECT_DELAYS_MS[Math.min(attempt, RECONNECT_DELAYS_MS.length - 1)];
      attempt += 1;
      retryTimer = window.setTimeout(() => {
        retryTimer = undefined;
        connect();
      }, delay);
    };

    const handleMessage = (raw: unknown) => {
      if (typeof raw !== 'string') return;
      let msg: WsMessage;
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }
      if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') return;
      if (msg.type === 'PING' || msg.type === 'PONG') return;

      if (msg.type === 'SESSION_REVOKED') {
        stopped = true;
        clearRetry();
        logoutRef.current(msg.message || 'Sua sessão foi encerrada. Entre novamente.');
        return;
      }

      const osId = typeof msg.os_id === 'number' ? msg.os_id : null;
      if (msg.title) showToastRef.current(msg.title, msg.message, osId);
      if (role === 'driver' && (msg.type === 'NEW_OS' || msg.type === 'DATA_CHANGED')) {
        // O turno pode ter mudado (ex.: encerrado pelo gestor).
        void refreshMeRef.current();
      }
      emitDataChanged(osId);
    };

    const connect = () => {
      if (stopped) return;
      if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) return;

      let socket: WebSocket;
      try {
        socket = new WebSocket(wsUrl(token));
      } catch {
        scheduleReconnect();
        return;
      }
      ws = socket;

      socket.onopen = () => {
        attempt = 0;
        authRejected = false;
        // Ao reconectar, algo pode ter mudado enquanto estava fora.
        if (connectedBefore) emitDataChanged(null);
        connectedBefore = true;
      };
      socket.onmessage = (event) => handleMessage(event.data);
      socket.onerror = () => {
        // O 'close' vem em seguida e cuida da reconexão.
      };
      socket.onclose = (event) => {
        if (ws === socket) ws = null;
        if (stopped) return;
        if (event.code === WS_AUTH_FAILED_CODE) {
          // Token recusado: não tenta de novo sozinho; confere se a sessão ainda vale.
          authRejected = true;
          void refreshMeRef.current();
          return;
        }
        scheduleReconnect();
      };
    };

    const resume = () => {
      if (stopped || document.visibilityState === 'hidden') return;
      if (!ws) {
        clearRetry();
        attempt = 0;
        authRejected = false;
        connect();
      }
      emitDataChanged(null);
      if (role === 'driver' && !mustChangePasswordRef.current) void syncQueue.process(userId);
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') resume();
    };

    connect();
    window.addEventListener('online', resume);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stopped = true;
      clearRetry();
      window.removeEventListener('online', resume);
      document.removeEventListener('visibilitychange', onVisibility);
      if (ws) {
        const socket = ws;
        ws = null;
        socket.onopen = null;
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null;
        try {
          socket.close();
        } catch {
          // ignora
        }
      }
    };
  }, [token, userId, role]);

  // Fila offline do motorista: envia ao abrir e a cada 20 s.
  useEffect(() => {
    if (!userId || role !== 'driver' || mustChangePassword) return;
    void syncQueue.process(userId);
    const interval = window.setInterval(() => void syncQueue.process(userId), QUEUE_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [userId, role, mustChangePassword]);

  const openToastTarget = () => {
    if (!toast) return;
    if (toast.osId && role) {
      navigate(role === 'driver' ? `/motorista/os/${toast.osId}` : `/admin/os/${toast.osId}`);
    }
    setToast(null);
  };

  return (
    <div className="relative min-h-dvh bg-zinc-100">
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: -50, x: '-50%' }}
            animate={{ opacity: 1, y: 20, x: '-50%' }}
            exit={{ opacity: 0, y: -50, x: '-50%' }}
            className="fixed top-0 left-1/2 z-[9999] w-full max-w-sm px-4"
          >
            <div className="bg-white border-l-4 border-emerald-600 shadow-2xl rounded-lg p-4 flex items-start gap-4">
              <div className="p-2 bg-emerald-50 rounded-full">
                <Bell className="w-5 h-5 text-emerald-600" />
              </div>
              <button type="button" onClick={openToastTarget} className="flex-1 text-left">
                <h4 className="font-bold text-zinc-900">{toast.title}</h4>
                {toast.message && <p className="text-sm text-zinc-600">{toast.message}</p>}
              </button>
              <button
                type="button"
                onClick={() => setToast(null)}
                aria-label="Fechar aviso"
                className="p-1 hover:bg-zinc-100 rounded-full transition-colors"
              >
                <X className="w-4 h-4 text-zinc-400" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/trocar-senha"
          element={
            <RequireLogin>
              <ChangePassword />
            </RequireLogin>
          }
        />

        <Route element={<RequireAuth roles={ADMIN_ROLES} />}>
          <Route path="/admin" element={<Navigate to="/admin/painel" replace />} />
          <Route path="/admin/os/:id" element={<AdminOSDetail />} />
          <Route path="/admin/:view" element={<AdminViewRoute />} />
        </Route>

        <Route element={<RequireAuth roles={DRIVER_ROLES} />}>
          <Route element={<DriverShell />}>
            <Route path="/motorista" element={<DriverHome />} />
            <Route path="/motorista/turno" element={<ShiftStart />} />
            <Route path="/motorista/os/:id" element={<DriverOSDetail />} />
          </Route>
        </Route>

        <Route path="/" element={<HomeRedirect />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
