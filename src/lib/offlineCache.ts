/** Cache local por usuário (lista e detalhe de OS) para uso sem conexão. */

const PREFIX = 'logitrack_cache_v2';

function cacheKey(userId: number, key: string): string {
  return `${PREFIX}:${userId}:${key}`;
}

export function cacheSet(userId: number, key: string, data: unknown): void {
  try {
    localStorage.setItem(cacheKey(userId, key), JSON.stringify(data));
  } catch {
    // Armazenamento cheio/indisponível: segue sem cache.
  }
}

export function cacheGet<T>(userId: number, key: string): T | null {
  try {
    const raw = localStorage.getItem(cacheKey(userId, key));
    if (raw === null) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
