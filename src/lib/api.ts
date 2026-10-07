const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

export function apiUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE}${normalized}`;
}

// --- Token (somente em memória; a persistência fica em lib/session.ts) ---

let authToken: string | null = null;

export function setAuthToken(token: string | null): void {
  authToken = token;
}

export function getAuthToken(): string | null {
  return authToken;
}

// --- Eventos de autenticação (401 / troca de senha obrigatória) ---

export type AuthEvent = 'unauthorized' | 'password_change_required';

const authHandlers = new Set<(event: AuthEvent) => void>();

export function onAuthEvent(cb: (event: AuthEvent) => void): () => void {
  authHandlers.add(cb);
  return () => {
    authHandlers.delete(cb);
  };
}

function emitAuthEvent(event: AuthEvent) {
  authHandlers.forEach((cb) => {
    try {
      cb(event);
    } catch (err) {
      console.error('Erro no tratamento de autenticação', err);
    }
  });
}

// --- Erro padrão ---

export class ApiError extends Error {
  status: number;
  code?: string;
  data?: any;

  constructor(status: number, message: string, code?: string, data?: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

const OFFLINE_MESSAGE = 'Sem conexão com o servidor';

function defaultMessage(status: number): string {
  if (status === 400) return 'Confira os dados informados e tente de novo.';
  if (status === 401) return 'Sua sessão expirou. Entre novamente.';
  if (status === 403) return 'Você não tem permissão para fazer isso.';
  if (status === 404) return 'Não encontramos o que você procurou.';
  if (status === 408) return 'O servidor demorou para responder. Tente de novo.';
  if (status === 409) return 'Não foi possível concluir porque os dados mudaram. Atualize e tente de novo.';
  if (status === 429) return 'Muitas tentativas. Aguarde um pouco e tente de novo.';
  if (status >= 500) return 'O servidor está com problemas. Tente de novo em instantes.';
  return 'Algo deu errado. Tente de novo.';
}

/** Mensagem amigável para qualquer erro (ApiError ou não). */
export function errorMessage(err: unknown, fallback = 'Algo deu errado. Tente de novo.'): string {
  if (err instanceof ApiError) return err.message;
  return fallback;
}

// --- Requisições ---

export interface ApiOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  timeoutMs?: number;
  /** Não dispara logout/troca de senha automáticos (usado no login, logout e na fila offline). */
  skipAuthHandler?: boolean;
}

export async function api<T = any>(path: string, options: ApiOptions = {}): Promise<T> {
  const { method = 'GET', body, timeoutMs = 15000, skipAuthHandler = false } = options;

  const tokenUsed = authToken;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (tokenUsed) headers.Authorization = `Bearer ${tokenUsed}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  let data: any = null;
  let isJson = false;
  try {
    res = await fetch(apiUrl(path), {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
      cache: 'no-store',
    });
    isJson = (res.headers.get('content-type') || '').includes('application/json');
    if (isJson) {
      try {
        data = await res.json();
      } catch {
        isJson = false;
        data = null;
      }
    }
  } catch (err) {
    const timedOut = controller.signal.aborted;
    throw new ApiError(0, OFFLINE_MESSAGE, timedOut ? 'TIMEOUT' : 'NETWORK');
  } finally {
    clearTimeout(timer);
  }

  if (res.ok) {
    if (res.status === 204) return null as T;
    if (!isJson) throw new ApiError(502, 'Resposta inválida do servidor', 'INVALID_RESPONSE');
    return data as T;
  }

  const code: string | undefined = data && typeof data.code === 'string' ? data.code : undefined;
  const message: string =
    data && typeof data.error === 'string' && data.error.trim() ? data.error : defaultMessage(res.status);
  const error = new ApiError(res.status, message, code, data);

  // Só avisa se a resposta é da sessão atual (ignora respostas atrasadas de uma sessão anterior).
  if (!skipAuthHandler && tokenUsed && tokenUsed === authToken) {
    const cleanPath = path.split('?')[0];
    if (res.status === 401 && cleanPath !== '/api/login') {
      emitAuthEvent('unauthorized');
    } else if (res.status === 403 && code === 'PASSWORD_CHANGE_REQUIRED') {
      emitAuthEvent('password_change_required');
    }
  }

  throw error;
}

// --- WebSocket ---

export function wsUrl(token: string): string {
  const base = (import.meta.env.VITE_WS_URL || API_BASE || '').replace(/\/$/, '');
  const query = `?token=${encodeURIComponent(token)}`;

  if (base) {
    const httpBase = /^wss?:/i.test(base)
      ? base.replace(/^ws/i, 'http')
      : /^https?:/i.test(base)
        ? base
        : `https://${base}`;
    const url = new URL(httpBase);
    const protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${url.host}/${query}`;
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/${query}`;
}
