import 'server-only'

type Entry = { expires: number; value: unknown; error?: unknown }

const store = globalThis as unknown as {
  __tdCache?: Map<string, Entry>
  __tdInflight?: Map<string, Promise<unknown>>
}

const cache = (store.__tdCache ??= new Map())
const inflight = (store.__tdInflight ??= new Map())

const MAX_ENTRIES = 500

/**
 * Caches successes for `ttlMs` and failures for `errorTtlMs`, and collapses concurrent
 * identical requests into a single upstream call so duplicate charts don't burn credits.
 */
export async function cached<T>(
  key: string,
  ttlMs: number,
  errorTtlMs: number,
  load: () => Promise<T>,
): Promise<{ value: T; hit: boolean }> {
  const now = Date.now()
  const entry = cache.get(key)
  if (entry && entry.expires > now) {
    if (entry.error) throw entry.error
    return { value: entry.value as T, hit: true }
  }

  const pending = inflight.get(key)
  if (pending) return { value: (await pending) as T, hit: true }

  const promise = load()
  inflight.set(key, promise)
  try {
    const value = await promise
    set(key, { expires: Date.now() + ttlMs, value })
    return { value, hit: false }
  } catch (error) {
    if (errorTtlMs > 0) set(key, { expires: Date.now() + errorTtlMs, value: null, error })
    throw error
  } finally {
    inflight.delete(key)
  }
}

function set(key: string, entry: Entry) {
  if (cache.size >= MAX_ENTRIES) {
    const firstKey = cache.keys().next().value
    if (firstKey) cache.delete(firstKey)
  }
  cache.set(key, entry)
}
