import { useMemo, useSyncExternalStore, type DependencyList } from 'react'
import { subscribe, getVersion } from './database.ts'

/** Executa `query` e volta a executá-la sempre que a base de dados muda. */
export function useQuery<T>(query: () => T, deps: DependencyList = []): T {
  const version = useSyncExternalStore(subscribe, getVersion)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(query, [version, ...deps])
}
