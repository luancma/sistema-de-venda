import { stockIlimitado } from '../lib/stock.ts'
import type { Product } from '../types.ts'

/** Quantidade em stock, ou ∞ para produtos "sem limite". */
export default function StockValue({ product }: { product: Product }) {
  if (!stockIlimitado(product)) return product.qtd
  return <span className="stock-inf" title="Sem limite" aria-label="sem limite">∞</span>
}
