import { useEffect, useMemo } from 'react'
import { useQuery } from '../db/useDb.ts'
import { listProductIds } from '../db/repo.ts'
import { useCart } from '../lib/cartStore.ts'

/** Nº de artigos no carrinho, mostrado no separador "Vender". */
export default function CartBadge() {
  const items = useCart((s) => s.items)
  const prune = useCart((s) => s.prune)
  const ids = useQuery(listProductIds)
  useEffect(() => prune(ids), [prune, ids])
  const count = useMemo(
    () => Object.entries(items).reduce((s, [id, q]) => (ids.has(id) ? s + q : s), 0),
    [items, ids],
  )
  return count > 0 ? <span className="tab-count">{count}</span> : null
}
