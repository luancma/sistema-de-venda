import { stockIlimitado } from '../lib/stock.js'

/** Quantidade em stock, ou ∞ para produtos "sem limite". */
export default function StockValue({ product }) {
  if (!stockIlimitado(product)) return product.qtd
  return <span className="stock-inf" title="Sem limite" aria-label="sem limite">∞</span>
}
