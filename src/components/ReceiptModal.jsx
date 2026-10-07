import { useEffect, useRef } from 'react'
import { formatEuro, promoCodeLabel } from '../lib/pricing.js'

const fmt = (iso) => new Date(iso).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' })
/** nº curto e legível a partir do id da venda (uuid) */
export const receiptNumber = (vendaId) => vendaId.replace(/-/g, '').slice(0, 8).toUpperCase()

/**
 * Recibo de uma venda (comprovativo simples, não é fatura).
 * "Imprimir / Guardar PDF" usa o diálogo de impressão do sistema — no computador e no iPhone
 * é possível escolher "Guardar como PDF" / "Partilhar".
 */
export default function ReceiptModal({ sale, onClose }) {
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && closeRef.current()
    window.addEventListener('keydown', onKey)
    document.body.classList.add('printing-receipt')
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.classList.remove('printing-receipt')
    }
  }, [])

  const lines = sale.lines
  const bruto = lines.reduce((s, l) => s + l.preco_unitario * l.quantidade, 0)
  const promos = lines.reduce((s, l) => s + (l.desconto || 0), 0)
  const descVenda = lines.reduce((s, l) => s + (l.desconto_venda || 0), 0)
  const info = lines.find((l) => l.desconto_info)?.desconto_info
  const total = lines.reduce((s, l) => s + l.preco, 0)
  const itens = lines.reduce((s, l) => s + l.quantidade, 0)

  return (
    <div className="modal-backdrop receipt-backdrop" onClick={onClose}>
      <div className="receipt-wrap" role="dialog" aria-modal="true" aria-label="Recibo de venda" onClick={(e) => e.stopPropagation()}>
        <article className="receipt">
          <header>
            <div className="receipt-shop">LOJA</div>
            <div>RECIBO DE VENDA</div>
            <div className="receipt-small">Nº {receiptNumber(sale.id)}</div>
          </header>
          <div className="receipt-sep" />
          <dl>
            <dt>Data</dt><dd>{fmt(sale.data)}</dd>
            {sale.nome && <><dt>Cliente</dt><dd>{sale.nome}</dd></>}
            {sale.nucleo && <><dt>Núcleo</dt><dd>{sale.nucleo}</dd></>}
            {sale.atividade && <><dt>Atividade</dt><dd>{sale.atividade}</dd></>}
            {sale.responsavel && <><dt>Responsável</dt><dd>{sale.responsavel}</dd></>}
          </dl>
          <div className="receipt-sep" />
          <table>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id}>
                  <td>
                    {l.nome_produto}{l.tamanho ? ` (${l.tamanho})` : ''}
                    <div className="receipt-small">
                      {l.quantidade} × {formatEuro(l.preco_unitario)}
                      {l.desconto > 0 && ` · ${promoCodeLabel(l.promocao) || 'promoção'} −${formatEuro(l.desconto)}`}
                    </div>
                  </td>
                  <td className="num">{formatEuro(l.preco_unitario * l.quantidade - (l.desconto || 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="receipt-sep" />
          <table className="receipt-totals">
            <tbody>
              {(promos > 0 || descVenda > 0) && <tr><td>Subtotal ({itens} art.)</td><td className="num">{formatEuro(bruto)}</td></tr>}
              {promos > 0 && <tr><td>Promoções</td><td className="num">−{formatEuro(promos)}</td></tr>}
              {descVenda > 0 && <tr><td>Desconto{info ? ` (${info})` : ''}</td><td className="num">−{formatEuro(descVenda)}</td></tr>}
              <tr className="receipt-total"><td>TOTAL</td><td className="num">{formatEuro(total)}</td></tr>
            </tbody>
          </table>
          {sale.observacao && (
            <>
              <div className="receipt-sep" />
              <p className="receipt-small">Obs.: {sale.observacao}</p>
            </>
          )}
          <div className="receipt-sep" />
          <footer>
            <div>Obrigado!</div>
            <div className="receipt-small">Comprovativo de venda — não serve de fatura.</div>
          </footer>
        </article>
        <div className="row between receipt-actions">
          <button type="button" onClick={onClose}>Fechar</button>
          <button type="button" className="primary" onClick={() => window.print()}>Imprimir / PDF</button>
        </div>
      </div>
    </div>
  )
}
