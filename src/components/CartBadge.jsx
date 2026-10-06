import { useEffect, useMemo } from 'react'
import { useQuery } from '../db/useDb.js'
import { all } from '../db/database.js'
import { useCart, pruneCart } from '../lib/cartStore.js'

/** Nº de artigos no carrinho, mostrado no separador "Vender". */
export default function CartBadge() {
  const { items } = useCart()
  const ids = useQuery(() => new Set(all('SELECT id FROM products').map((r) => r.id)))
  useEffect(() => pruneCart(ids), [ids])
  const count = useMemo(
    () => Object.entries(items).reduce((s, [id, q]) => (ids.has(id) ? s + q : s), 0),
    [items, ids],
  )
  return count > 0 ? <span className="tab-count">{count}</span> : null
}
