declare global {
  var __memoryCache: Map<string, { value: any; expiresAt: number }> | undefined;
}

if (!global.__memoryCache) {
  global.__memoryCache = new Map();
}

const cacheMap = global.__memoryCache;

/**
 * Get a value from the cache, or fetch it and save to cache if expired or missing.
 */
export async function getCached<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const cached = cacheMap.get(key);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }
  const value = await fetcher();
  cacheMap.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}

/**
 * Invalidate a specific cache key, or clear the entire cache.
 */
export function invalidateCache(key?: string) {
  if (key) {
    cacheMap.delete(key);
  } else {
    cacheMap.clear();
  }
}
