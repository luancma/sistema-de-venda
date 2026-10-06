import { useMemo, useSyncExternalStore } from 'react'
import { subscribe, getVersion } from './database.js'

/** Executa `query` e volta a executá-la sempre que a base de dados muda. */
export function useQuery(query, deps = []) {
  const version = useSyncExternalStore(subscribe, getVersion)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(query, [version, ...deps])
}
