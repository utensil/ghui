import * as Atom from "effect/unstable/reactivity/Atom"

/**
 * A generic stale-while-revalidate cache backed by an Effect Atom.
 *
 * Usage:
 *   const commitListCache = createStaleCache<readonly CommitItem[]>({
 *     equals: (a, b) => a.length === b.length && a.every((c, i) => c.oid === b[i]?.oid),
 *   })
 *
 *   // In component:
 *   const setCommitListCacheState = useAtomSet(commitListCache.atom)
 *   const cached = staleFetch(commitListCache, cacheKey, currentCache, setCommitListCacheState, fetcher, onUpdate, onError)
 */

export interface StaleCacheEntry<V> {
	readonly data: V
	readonly fetchedAt: number
}

export interface StaleCacheOptions<V> {
	/** Compare cached vs fresh data. Return true if they're equivalent (skip update). */
	readonly equals?: (cached: V, fresh: V) => boolean
}

export interface StaleCache<V> {
	readonly atom: Atom.Writable<Record<string, StaleCacheEntry<V>>>
	readonly equals: (cached: V, fresh: V) => boolean
}

export const createStaleCache = <V>(options: StaleCacheOptions<V> = {}): StaleCache<V> => {
	const atom = Atom.make<Record<string, StaleCacheEntry<V>>>({}).pipe(Atom.keepAlive)
	const equals = options.equals ?? ((a, b) => a === b)
	return { atom, equals }
}

export type StaleCacheSetter<V> = (
	updater: (current: Record<string, StaleCacheEntry<V>>) => Record<string, StaleCacheEntry<V>>,
) => void

/**
 * Perform a stale-while-revalidate fetch.
 *
 * Returns the cached data immediately (if any), and triggers a background fetch.
 * When fresh data arrives and differs from cached, calls onUpdate.
 *
 * @param cache - The StaleCache instance
 * @param key - Cache key
 * @param currentCache - Current cache state (from registry.get(cache.atom))
 * @param setCacheState - Setter (from useAtomSet(cache.atom))
 * @param fetcher - Async function to fetch fresh data
 * @param onUpdate - Called with fresh data when it differs from cached
 * @param onError - Called on fetch failure
 * @returns The cached data if available, or undefined
 */
export const staleFetch = <V>(
	cache: StaleCache<V>,
	key: string,
	currentCache: Record<string, StaleCacheEntry<V>>,
	setCacheState: StaleCacheSetter<V>,
	fetcher: () => Promise<V>,
	onUpdate: (data: V) => void,
	onError?: (error: unknown) => void,
): V | undefined => {
	const existing = currentCache[key]
	const cached = existing?.data

	void fetcher()
		.then((fresh) => {
			setCacheState((current) => ({
				...current,
				[key]: { data: fresh, fetchedAt: Date.now() },
			}))
			if (!cached || !cache.equals(cached, fresh)) {
				onUpdate(fresh)
			}
		})
		.catch((error) => onError?.(error))

	return cached
}
