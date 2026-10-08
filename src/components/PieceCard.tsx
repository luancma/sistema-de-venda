import { isSingleSize, piecePromoLabel, type Piece } from '../lib/pieces.ts'
import { formatEuro } from '../lib/pricing.ts'
import { esgotado } from '../lib/stock.ts'
import StockValue from './StockValue.tsx'
import type { Product } from '../types.ts'

interface Props {
  piece: Piece
  /** productId -> quantidade no carrinho */
  cart: Record<string, number>
  onAdd: (p: Product) => void
}

/** preço da peça, ou o intervalo se os tamanhos tiverem preços diferentes */
function Preco({ piece }: { piece: Piece }) {
  if (!(piece.precoMax > 0)) return <span className="badge warn">Sem preço</span>
  return <>{piece.precoMin === piece.precoMax ? formatEuro(piece.precoMin) : `${formatEuro(piece.precoMin)}–${formatEuro(piece.precoMax)}`}</>
}

/**
 * Cartão de uma peça no Vender: um botão por tamanho, com o stock; tocar junta 1 ao carrinho.
 * Peça de tamanho único: o cartão inteiro é o botão.
 */
export default function PieceCard({ piece, cart, onAdd }: Props) {
  const noCarrinho = piece.variants.reduce((s, v) => s + (cart[v.id] || 0), 0)
  const promo = piecePromoLabel(piece)
  const titulo = (
    <span className="piece-name">
      {piece.nome}{piece.cor && <span className="piece-cor"> · {piece.cor}</span>}
    </span>
  )
  const info = (
    <span className="piece-info">
      <span className="card-price"><Preco piece={piece} /></span>
      {promo && <span className="badge">{promo}</span>}
      <span className="card-stock">Stock: {piece.stockTotal == null ? <span className="stock-inf" aria-label="sem limite">∞</span> : piece.stockTotal}</span>
    </span>
  )

  if (isSingleSize(piece)) {
    const v = piece.variants[0]
    return (
      <button type="button" className={`card piece ${esgotado(v) ? 'out' : ''} ${noCarrinho ? 'in-cart' : ''}`} onClick={() => onAdd(v)}>
        {titulo}
        {info}
        {noCarrinho > 0 && <span className="card-count">{noCarrinho}</span>}
      </button>
    )
  }

  return (
    <div className={`card piece ${noCarrinho ? 'in-cart' : ''}`}>
      {titulo}
      {info}
      <div className="sizes" role="group" aria-label={`Tamanhos de ${piece.nome}`}>
        {piece.variants.map((v) => (
          <button key={v.id} type="button" className={`size ${cart[v.id] ? 'sel' : ''} ${esgotado(v) ? 'out' : ''}`}
            onClick={() => onAdd(v)} aria-label={`${piece.nome} ${piece.cor} ${v.tamanho}`.replace(/\s+/g, ' ')}>
            {v.tamanho}
            <small><StockValue product={v} /></small>
            {cart[v.id] > 0 && <span className="q">{cart[v.id]}</span>}
          </button>
        ))}
      </div>
      {noCarrinho > 0 && <span className="card-count">{noCarrinho}</span>}
    </div>
  )
}
