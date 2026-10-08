import { useMemo, useState } from 'react'
import { useQuery } from '../db/useDb.ts'
import { listTransactions, cancelSale } from '../db/repo.ts'
import { toCsv, ptNumber, downloadFile, type CsvColumn } from '../lib/csv.ts'
import { formatEuro, promoCodeLabel } from '../lib/pricing.ts'
import { useToast } from '../components/Toast.tsx'
import { useConfirm } from '../components/ConfirmProvider.tsx'
import ReceiptModal from '../components/ReceiptModal.tsx'
import TrashIcon from '../components/TrashIcon.tsx'
import type { Sale, Transaction } from '../types.ts'

const today = () => new Date().toLocaleDateString('sv-SE') // YYYY-MM-DD local
const fmtDateTime = (iso: string) => new Date(iso).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' })
const pad = (n: number) => String(n).padStart(2, '0')
// formato estável para folhas de cálculo, em colunas separadas (curtas, o Excel não as esconde com ####): 2026-10-06 | 15:56
const exportDate = (iso: string) => new Date(iso).toLocaleDateString('sv-SE')
const exportTime = (iso: string) => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}` }
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })

// Colunas do CSV exportado (contrato de transação + campos de contexto)
export const EXPORT_COLUMNS: CsvColumn<Transaction>[] = [
  { header: 'DATA', value: (t) => exportDate(t.data) },
  { header: 'HORA', value: (t) => exportTime(t.data) },
  { header: 'NOME DO PRODUTO', value: 'nome_produto' },
  { header: 'TAMANHO', value: 'tamanho' },
  { header: 'CAIXA DE DESTINO', value: 'caixa_destino' },
  { header: 'QTD', value: 'quantidade' },
  { header: 'PRECO UNITARIO', value: (t) => ptNumber(t.preco_unitario) },
  { header: 'DESCONTO', value: (t) => ptNumber(t.desconto) },
  { header: 'DESCONTO VENDA', value: (t) => ptNumber(t.desconto_venda) },
  { header: 'TIPO DESCONTO', value: 'desconto_info' },
  { header: 'PRECO', value: (t) => ptNumber(t.preco) },
  { header: 'PROMOCAO', value: 'promocao' },
  { header: 'NOME', value: 'nome' },
  { header: 'NUCLEO', value: 'nucleo' },
  { header: 'ATIVIDADE', value: 'atividade' },
  { header: 'RESPONSAVEL', value: 'responsavel' },
  { header: 'OBSERVACAO', value: 'observacao' },
  { header: 'VENDA', value: 'venda_id' },
  { header: 'ID', value: 'id' },
  // colunas novas no fim: as folhas que leem o CSV pela posição das colunas continuam a funcionar
  { header: 'SKU', value: 'sku' },
  { header: 'SKU PAI', value: 'sku_pai' },
  { header: 'COR', value: 'cor' },
]

export default function Vendas() {
  const [receipt, setReceipt] = useState<Sale | null>(null) // venda cujo recibo está aberto
  const toast = useToast()
  const confirm = useConfirm()
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(today)
  const rowsAll = useQuery(() => listTransactions(from, to), [from, to])
  const [ativ, setAtiv] = useState('') // filtro por atividade ('' = todas)
  const atividades = useMemo(() => [...new Set(rowsAll.map((t) => t.atividade).filter(Boolean))].sort(), [rowsAll])
  const rows = useMemo(() => (ativ ? rowsAll.filter((t) => t.atividade === ativ) : rowsAll), [rowsAll, ativ])

  const sales = useMemo(() => {
    const map = new Map<string, Sale>()
    for (const t of rows) {
      if (!map.has(t.venda_id)) map.set(t.venda_id, { id: t.venda_id, data: t.data, nome: t.nome, nucleo: t.nucleo, responsavel: t.responsavel, atividade: t.atividade, observacao: t.observacao, lines: [], total: 0, descontoVenda: 0, descontoInfo: '' })
      const s = map.get(t.venda_id)!
      s.lines.push(t)
      s.total += t.preco
      s.descontoVenda = (s.descontoVenda || 0) + (t.desconto_venda || 0)
      s.descontoInfo = t.desconto_info || s.descontoInfo
    }
    return [...map.values()]
  }, [rows])

  const summary = useMemo(() => {
    const total = rows.reduce((s, t) => s + t.preco, 0)
    const itens = rows.reduce((s, t) => s + t.quantidade, 0)
    const desconto = rows.reduce((s, t) => s + t.desconto + (t.desconto_venda || 0), 0)
    const porNucleo: Record<string, number> = {}
    for (const t of rows) porNucleo[t.nucleo || '—'] = (porNucleo[t.nucleo || '—'] || 0) + t.preco
    return { total, itens, desconto, porNucleo: Object.entries(porNucleo).sort((a, b) => b[1] - a[1]) }
  }, [rows])

  function exportCsv() {
    const csv = toCsv([...rows].reverse(), EXPORT_COLUMNS, ';')
    const slug = ativ ? '-' + ativ.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/gi, '-').toLowerCase() : ''
    downloadFile(from === to ? `vendas-${from}${slug}.csv` : `vendas-${from}_a_${to}${slug}.csv`, csv)
  }

  async function cancel(s: Sale) {
    const ok = await confirm({
      title: 'Anular venda?',
      message: `Venda de ${fmtTime(s.data)} (${formatEuro(s.total)}). O stock é reposto.`,
      confirmLabel: 'Anular venda',
      danger: true,
    })
    if (!ok) return
    await cancelSale(s.id)
    toast('Venda anulada e stock reposto.')
  }

  return (
    <div className="page">
      <section className="panel">
        <div className="row wrap between">
          <div className="row wrap">
            <label className="inline">De <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
            <label className="inline">Até <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
            <button onClick={() => { setFrom(today()); setTo(today()) }}>Hoje</button>
            {atividades.length > 0 && (
              <label className="inline">Atividade
                <select value={ativ} onChange={(e) => setAtiv(e.target.value)}>
                  <option value="">Todas</option>
                  {atividades.map((a) => <option key={a}>{a}</option>)}
                </select>
              </label>
            )}
          </div>
          <button className="primary" onClick={exportCsv} disabled={!rows.length}>Exportar CSV ({rows.length} linhas)</button>
        </div>
        <div className="stats">
          <div><span>Total</span><strong>{formatEuro(summary.total)}</strong></div>
          <div><span>Vendas</span><strong>{sales.length}</strong></div>
          <div><span>Artigos</span><strong>{summary.itens}</strong></div>
          <div><span>Descontos</span><strong>{formatEuro(summary.desconto)}</strong></div>
        </div>
        {summary.porNucleo.length > 0 && (
          <div className="by-nucleo">
            {summary.porNucleo.map(([n, v]) => <span key={n} className="chip">{n}: <strong>{formatEuro(v)}</strong></span>)}
          </div>
        )}
      </section>

      <section className="panel">
        {!sales.length && <p className="muted">Sem vendas neste período.</p>}
        {sales.map((s) => (
          <div key={s.id} className="sale">
            <div className="sale-head">
              <span><strong>{from === to ? fmtTime(s.data) : fmtDateTime(s.data)}</strong></span>
              <span>{s.nome || <span className="muted">sem nome</span>}</span>
              <span className="chip">{s.nucleo}</span>
              {s.atividade && <span className="chip atividade-chip">{s.atividade}</span>}
              <span className="muted">resp. {s.responsavel}</span>
              {s.descontoVenda > 0 && <span className="badge">desconto {s.descontoInfo} −{formatEuro(s.descontoVenda)}</span>}
              <strong className="grow num">{formatEuro(s.total)}</strong>
              <button className="small" onClick={() => setReceipt(s)}>Recibo</button>
              <button className="danger small with-icon" onClick={() => cancel(s)}><TrashIcon size={14} />Anular</button>
            </div>
            {s.observacao && <p className="sale-obs">Obs.: {s.observacao}</p>}
            <ul>
              {s.lines.map((l) => (
                <li key={l.id}>
                  {l.quantidade}× {l.nome_produto} {l.tamanho && <span className="muted">({l.tamanho})</span>}
                  {l.desconto > 0 && <span className="badge">{promoCodeLabel(l.promocao) || 'promo'} −{formatEuro(l.desconto)}</span>}
                  <span className="num">{formatEuro(l.preco)}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
      {receipt && <ReceiptModal sale={receipt} onClose={() => setReceipt(null)} />}
    </div>
  )
}
