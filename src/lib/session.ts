import type { User } from '../types';

export const SESSION_KEY = 'logitrack_session_v2';
const LEGACY_USER_KEY = 'logitrack_user';

export interface Session {
  token: string;
  user: User;
}

function isValidUser(value: unknown): value is User {
  if (!value || typeof value !== 'object') return false;
  const u = value as Record<string, unknown>;
  return (
    typeof u.id === 'number' &&
    typeof u.email === 'string' &&
    typeof u.name === 'string' &&
    (u.role === 'driver' || u.role === 'admin' || u.role === 'gestor')
  );
}

/** Garante os campos obrigatórios do User mesmo se vierem faltando/com outro tipo. */
export function normalizeUser(user: User): User {
  return {
    ...user,
    is_active: user.is_active === undefined ? true : Boolean(user.is_active),
    shift_status: user.shift_status === 'ON_SHIFT' ? 'ON_SHIFT' : 'OFF_SHIFT',
    must_change_password: Boolean(user.must_change_password),
    is_master: Boolean(user.is_master),
  };
}

export function readSession(): Session | null {
  try {
    localStorage.removeItem(LEGACY_USER_KEY);
  } catch {
    // ignora
  }
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Session> | null;
    if (!parsed || typeof parsed.token !== 'string' || !parsed.token || !isValidUser(parsed.user)) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return { token: parsed.token, user: normalizeUser(parsed.user) };
  } catch {
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch {
      // ignora
    }
    return null;
  }
}

export function writeSession(session: Session): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // Armazenamento indisponível (modo privado, cheio): a sessão fica só em memória.
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(LEGACY_USER_KEY);
  } catch {
    // ignora
  }
}
