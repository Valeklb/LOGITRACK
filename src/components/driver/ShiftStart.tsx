import React, { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ArrowLeft, ClipboardCheck } from 'lucide-react';
import type { User } from '../../types';
import { api, ApiError, errorMessage } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { emitDataChanged } from '../../lib/events';
import { ChecklistForm, type ChecklistFormData } from '../common/ChecklistForm';
import { OfflineStrip } from './driverUi';

const OFFLINE_MESSAGE = 'Sem conexão. Conecte-se à internet para iniciar o turno.';

export const ShiftStart = () => {
  const { user, setUser, refreshMe } = useAuth();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  if (!user) return null;
  if (user.shift_status === 'ON_SHIFT') return <Navigate to="/motorista" replace />;

  const goHome = () => navigate('/motorista');

  const handleSubmit = async (data: ChecklistFormData) => {
    if (submitting) return;
    if (!navigator.onLine) {
      setError(OFFLINE_MESSAGE);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await api<{ user?: User }>('/api/shift/start', { method: 'POST', body: data });
      if (res?.user) setUser(res.user);
      else await refreshMe();
      emitDataChanged(null);
      navigate('/motorista', { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 0
          ? OFFLINE_MESSAGE
          : errorMessage(err, 'Não foi possível iniciar o turno. Tente de novo.'),
      );
      setSubmitting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col">
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-zinc-100 pt-safe">
        <div className="flex items-center gap-2 px-2 py-2">
          <button
            type="button"
            onClick={goHome}
            aria-label="Voltar"
            title="Voltar"
            className="min-w-11 min-h-11 flex items-center justify-center rounded-full text-zinc-700 hover:bg-zinc-100"
          >
            <ArrowLeft size={24} />
          </button>
          <div>
            <h1 className="text-lg font-black text-zinc-900">Iniciar Turno</h1>
            <p className="text-xs text-zinc-500">Checklist do veículo</p>
          </div>
        </div>
      </header>

      <div className="px-4 pt-4 space-y-3">
        {!online && <OfflineStrip message={OFFLINE_MESSAGE} />}
        <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-2xl flex items-start gap-3">
          <div className="p-2 bg-emerald-600 text-white rounded-xl shrink-0">
            <ClipboardCheck size={20} />
          </div>
          <p className="text-sm text-emerald-900">
            Antes de sair, confira o veículo. Informe a placa do cavalo e marque <strong>OK</strong> ou{' '}
            <strong>Problema</strong> em cada item. Se algo estiver com problema, você ainda pode iniciar o turno.
          </p>
        </div>
      </div>

      <ChecklistForm
        onSubmit={handleSubmit}
        submitting={submitting}
        submitLabel="Iniciar Turno"
        initialPlate={user.current_plate ?? ''}
        onCancel={goHome}
        error={error}
      />
    </div>
  );
};
