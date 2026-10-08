import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, CheckCircle2, Copy, KeyRound, RefreshCw, Search, X } from 'lucide-react';
import type { DashboardStats, ServiceOrder, User } from '../../types';
import { ApiError, errorMessage } from '../../lib/api';
import { onDataChanged } from '../../lib/events';
import { ErrorBanner, Spinner } from '../common/UI';

/** OS como vem da API para admin/gestor (inclui se o motorista ainda está ativo). */
export type AdminOS = ServiceOrder & { driver_is_active?: boolean };

/** Dados compartilhados pelas abas do painel administrativo. */
export interface AdminCoreData {
  stats: DashboardStats;
  orders: AdminOS[];
  users: User[];
}

export const REFRESH_INTERVAL_MS = 30000;
const DATA_CHANGED_DEBOUNCE_MS = 500;

// ---------------------------------------------------------------------------
// Dados que se atualizam sozinhos
// ---------------------------------------------------------------------------

export interface LiveData<T> {
  data: T | null;
  /** Primeira carga (ainda sem dados). */
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  /** Status HTTP do último erro (0 = sem conexão). */
  errorStatus: number | null;
  /** Momento (ISO) da última carga com sucesso. */
  updatedAt: string | null;
  refresh: () => Promise<void>;
}

interface LiveDataOptions {
  /** Decide se um aviso de "dados mudaram" (com o id da OS, ou null) deve recarregar. */
  shouldRefresh?: (osId: number | null) => boolean;
}

/**
 * Carrega ao abrir, ao receber aviso de mudança (com espera de 500 ms), a cada 30 s
 * e quando `refresh()` é chamado. Em caso de erro mantém os últimos dados.
 */
export function useLiveData<T>(fetcher: () => Promise<T>, options: LiveDataOptions = {}): LiveData<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const shouldRefreshRef = useRef(options.shouldRefresh);
  shouldRefreshRef.current = options.shouldRefresh;
  const seqRef = useRef(0);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    const seq = ++seqRef.current;
    setRefreshing(true);
    try {
      const result = await fetcherRef.current();
      if (!mountedRef.current || seq !== seqRef.current) return;
      setData(result);
      setError(null);
      setErrorStatus(null);
      setUpdatedAt(new Date().toISOString());
    } catch (err) {
      if (!mountedRef.current || seq !== seqRef.current) return;
      setError(errorMessage(err, 'Não foi possível carregar os dados. Tente de novo.'));
      setErrorStatus(err instanceof ApiError ? err.status : null);
    } finally {
      if (mountedRef.current && seq === seqRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void refresh();

    let debounce: number | undefined;
    const unsubscribe = onDataChanged((osId) => {
      const filter = shouldRefreshRef.current;
      if (filter && !filter(osId ?? null)) return;
      window.clearTimeout(debounce);
      debounce = window.setTimeout(() => void refresh(), DATA_CHANGED_DEBOUNCE_MS);
    });
    const interval = window.setInterval(() => {
      if (document.visibilityState !== 'hidden') void refresh();
    }, REFRESH_INTERVAL_MS);

    return () => {
      mountedRef.current = false;
      unsubscribe();
      window.clearTimeout(debounce);
      window.clearInterval(interval);
    };
  }, [refresh]);

  return { data, loading, refreshing, error, errorStatus, updatedAt, refresh };
}

/** Carregando (1ª vez) ou erro com "Tentar de novo" — mantendo os últimos dados na tela. */
export function LiveStatus<T>({ live, label = 'Carregando…' }: { live: LiveData<T>; label?: string }) {
  if (live.loading && !live.data) return <Spinner className="py-16" label={label} />;
  if (live.error) {
    return (
      <ErrorBanner
        message={live.data ? `${live.error} Mostrando os últimos dados carregados.` : live.error}
        onRetry={() => void live.refresh()}
      />
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// Aviso de sucesso (some sozinho)
// ---------------------------------------------------------------------------

export function useNotice(durationMs = 5000) {
  const [notice, setNotice] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const show = useCallback(
    (message: string | null) => {
      window.clearTimeout(timer.current);
      setNotice(message);
      if (message) timer.current = window.setTimeout(() => setNotice(null), durationMs);
    },
    [durationMs],
  );

  useEffect(() => () => window.clearTimeout(timer.current), []);
  return [notice, show] as const;
}

export const SuccessBanner = ({ message, onClose }: { message: React.ReactNode; onClose?: () => void }) => (
  <div
    role="status"
    className="bg-emerald-50 border border-emerald-100 text-emerald-800 p-3 rounded-xl text-sm flex items-start gap-3"
  >
    <CheckCircle2 size={18} className="shrink-0 mt-0.5 text-emerald-600" />
    <div className="flex-1">{message}</div>
    {onClose && (
      <button type="button" onClick={onClose} aria-label="Fechar aviso" className="shrink-0 text-emerald-700/70 hover:text-emerald-900">
        <X size={16} />
      </button>
    )}
  </div>
);

// ---------------------------------------------------------------------------
// Peças de layout
// ---------------------------------------------------------------------------

export const PageHeader = ({
  title,
  subtitle,
  actions,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}) => (
  <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
    <div className="space-y-1 min-w-0">
      <h2 className="text-2xl lg:text-3xl font-black tracking-tight text-zinc-900">{title}</h2>
      {subtitle && <p className="text-sm text-zinc-500 font-medium">{subtitle}</p>}
    </div>
    {actions && <div className="flex flex-wrap gap-3">{actions}</div>}
  </div>
);

export const RefreshButton = ({ onClick, refreshing }: { onClick: () => void; refreshing?: boolean }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={refreshing}
    className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-medium bg-white border border-zinc-300 text-zinc-700 hover:bg-zinc-50 transition-all active:scale-95 disabled:opacity-60 disabled:cursor-wait"
  >
    <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
    Atualizar
  </button>
);

export const SearchInput = ({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) => (
  <div className="relative w-full md:w-80">
    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" size={18} />
    <input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={placeholder}
      autoComplete="off"
      className="w-full pl-11 pr-4 py-2.5 bg-white border border-zinc-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 transition-all text-sm"
    />
  </div>
);

export interface ChipOption<T extends string> {
  value: T;
  label: string;
  count?: number;
}

export function FilterChips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: ChipOption<T>[];
  value: NoInfer<T>;
  onChange: (value: NoInfer<T>) => void;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={active}
            className={`shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold border transition-colors ${
              active
                ? 'bg-emerald-600 border-emerald-600 text-white'
                : 'bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50'
            }`}
          >
            {opt.label}
            {opt.count !== undefined && (
              <span
                className={`text-[11px] px-1.5 py-0.5 rounded-full ${active ? 'bg-white/20 text-white' : 'bg-zinc-100 text-zinc-500'}`}
              >
                {opt.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Botão pequeno de ação (ícone + texto opcional) usado em tabelas e cartões. */
export const ActionButton = ({
  icon: Icon,
  label,
  onClick,
  tone = 'neutral',
  showLabel = false,
  disabled,
}: {
  icon: React.ElementType;
  label: string;
  onClick: () => void;
  tone?: 'neutral' | 'blue' | 'red' | 'emerald' | 'amber';
  showLabel?: boolean;
  disabled?: boolean;
}) => {
  const tones = {
    neutral: 'text-zinc-500 hover:text-emerald-700 hover:bg-emerald-50',
    blue: 'text-zinc-500 hover:text-blue-700 hover:bg-blue-50',
    red: 'text-zinc-500 hover:text-red-700 hover:bg-red-50',
    emerald: 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100',
    amber: 'text-amber-700 bg-amber-50 hover:bg-amber-100',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`inline-flex items-center gap-1.5 p-2 rounded-lg text-xs font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${tones[tone]}`}
    >
      <Icon size={17} />
      {showLabel && <span>{label}</span>}
    </button>
  );
};

/** Nome do motorista da OS, com "(inativo)" quando a conta foi desativada. */
export const DriverName = ({ os }: { os: AdminOS }) => (
  <>
    {os.driver_name || '—'}
    {os.driver_is_active === false && <span className="text-xs font-semibold text-red-500"> (inativo)</span>}
  </>
);

// ---------------------------------------------------------------------------
// Busca e formatação
// ---------------------------------------------------------------------------

export function normalizeText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/** Busca sem diferenciar maiúsculas/acentos; também acha placas digitadas com hífen/espaço. */
export function matchesSearch(query: string, fields: unknown[]): boolean {
  const q = normalizeText(query);
  if (!q) return true;
  const compact = q.replace(/[^a-z0-9]/g, '');
  return fields.some((field) => {
    const text = normalizeText(field);
    if (!text) return false;
    if (text.includes(q)) return true;
    return compact.length > 0 && text.replace(/[^a-z0-9]/g, '').includes(compact);
  });
}

/** Campos de uma OS usados na busca (nº, placas, motorista, origem, destino). */
export function searchOrderFields(os: AdminOS): unknown[] {
  return [os.os_number, os.plate, os.truck_plate, os.driver_name, os.origin, os.destination];
}

/** '98765432100' → '987.654.321-00'. */
export function formatCPF(cpf?: string | null): string {
  if (!cpf) return '—';
  const d = cpf.replace(/\D/g, '');
  if (d.length !== 11) return cpf;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

export function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

// ---------------------------------------------------------------------------
// Senha provisória
// ---------------------------------------------------------------------------

const CONSONANTS = 'bcdfghjkmnprstvz';
const VOWELS = 'aeiou';

function randomInt(max: number): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] % max;
}

/** Senha fácil de ler e ditar, ex.: 'Bamo4827'. */
export function generateTempPassword(): string {
  const pick = (chars: string) => chars[randomInt(chars.length)];
  const word = pick(CONSONANTS).toUpperCase() + pick(VOWELS) + pick(CONSONANTS) + pick(VOWELS);
  return `${word}${String(randomInt(10000)).padStart(4, '0')}`;
}

/** Mostra a senha provisória criada para repassar à pessoa. */
export const TempPasswordPanel = ({ name, email, password }: { name: string; email?: string; password: string }) => {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(password);
      setCopyState('copied');
      window.setTimeout(() => setCopyState('idle'), 2500);
    } catch {
      setCopyState('failed');
    }
  };

  return (
    <div className="space-y-4 text-center">
      <div className="inline-flex p-3 bg-emerald-100 text-emerald-600 rounded-2xl">
        <KeyRound size={28} />
      </div>
      <div className="space-y-1">
        <p className="text-sm text-zinc-500">Senha provisória de</p>
        <p className="font-bold text-zinc-900">{name}</p>
        {email && <p className="text-xs text-zinc-500">Login: {email}</p>}
      </div>
      <p className="text-3xl sm:text-4xl font-black font-mono tracking-wider text-zinc-900 bg-zinc-50 border border-zinc-200 rounded-2xl py-4 px-2 select-all break-all">
        {password}
      </p>
      <button
        type="button"
        onClick={copy}
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-zinc-300 text-zinc-700 font-medium hover:bg-zinc-50 transition-colors"
      >
        {copyState === 'copied' ? <Check size={18} className="text-emerald-600" /> : <Copy size={18} />}
        {copyState === 'copied' ? 'Copiado!' : 'Copiar senha'}
      </button>
      {copyState === 'failed' && (
        <p className="text-xs text-red-600">Não deu para copiar automaticamente. Selecione a senha acima e copie.</p>
      )}
      <p className="text-sm text-zinc-600 bg-amber-50 border border-amber-100 rounded-xl p-3">
        Passe esta senha para a pessoa. No primeiro acesso ela vai criar a própria senha.
      </p>
    </div>
  );
};
