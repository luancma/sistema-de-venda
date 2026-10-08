import { useMemo, useState, type ChangeEvent } from 'react'
import { useQuery } from '../db/useDb.ts'
import { listProducts, deleteProducts, importProducts, listCategorias } from '../db/repo.ts'
import { parseProductsCsv, productsToCsv, downloadFile } from '../lib/csv.ts'
import { formatEuro } from '../lib/pricing.ts'
import { groupPieces, piecePromoLabel, type Piece } from '../lib/pieces.ts'
import { useToast } from '../components/Toast.tsx'
import { useConfirm } from '../components/ConfirmProvider.tsx'
import CategoryFilter from '../components/CategoryFilter.tsx'
import { esgotado } from '../lib/stock.ts'
import TrashIcon from '../components/TrashIcon.tsx'
import ProductBatchModal from '../components/ProductBatchModal.tsx'
import PieceForm from '../components/PieceForm.tsx'

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

interface ImportReport {
  title: string
  errors: string[]
  warnings: string[]
}

const today = () => new Date().toLocaleDateString('sv-SE') // YYYY-MM-DD local

export default function Produtos() {
  const toast = useToast()
  const confirm = useConfirm()
  const products = useQuery(listProducts)
  const categorias = useQuery(listCategorias)
  const [editing, setEditing] = useState<Piece | 'nova' | null>(null)
  const [mode, setMode] = useState<'replace' | 'merge'>('replace')
  const [filter, setFilter] = useState('')
  const [cats, setCats] = useState<string[]>([])
  const [report, setReport] = useState<ImportReport | null>(null) // resultado da última importação
  const [onlyNoPrice, setOnlyNoPrice] = useState(false)
  const [selected, setSelected] = useState<string[]>([]) // ids marcados para alterar em lote
  const [batchOpen, setBatchOpen] = useState(false)

  const pieces = useMemo(() => groupPieces(products), [products])
  const semPreco = (pc: Piece) => pc.variants.some((v) => !(v.valor > 0))
  const shown = useMemo(() => {
    const q = norm(filter.trim())
    return pieces.filter((pc) =>
      cats.every((c) => pc.categorias.includes(c)) && (!onlyNoPrice || semPreco(pc)) &&
      (!q || norm([pc.nome, pc.cor, pc.sku_pai, ...pc.variants.map((v) => v.sku)].join(' ')).includes(q)))
  }, [pieces, filter, onlyNoPrice, cats])
  const noPrice = pieces.filter(semPreco).length
  // seleção por peça: marcar uma peça marca todos os seus tamanhos (só contam os que ainda existem)
  const picked = useMemo(() => products.filter((p) => selected.includes(p.id)), [products, selected])
  const pickedPieces = new Set(picked.map((p) => p.sku_pai)).size
  const idsOf = (pc: Piece) => pc.variants.map((v) => v.id)
  const isPicked = (pc: Piece) => idsOf(pc).every((id) => selected.includes(id))
  const allShownPicked = shown.length > 0 && shown.every(isPicked)
  const toggle = (pc: Piece) => {
    const ids = idsOf(pc)
    setSelected(isPicked(pc) ? selected.filter((id) => !ids.includes(id)) : [...new Set([...selected, ...ids])])
  }
  const toggleShown = () => {
    const ids = shown.flatMap(idsOf)
    setSelected(allShownPicked ? selected.filter((id) => !ids.includes(id)) : [...new Set([...selected, ...ids])])
  }

  async function removePicked() {
    const ok = await confirm({
      title: `Apagar ${pickedPieces} peça(s)?`,
      message: `${picked.length} tamanho(s). As vendas já feitas não são afetadas.`,
      confirmLabel: 'Apagar',
      danger: true,
    })
    if (!ok) return
    const n = await deleteProducts(picked.map((p) => p.id))
    setSelected([])
    toast(`${n} artigo(s) apagado(s).`)
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const { products: rows, errors, warnings } = parseProductsCsv(await file.text())
    if (!rows.length) {
      setReport({ title: 'Nada importado', errors, warnings })
      return toast(errors[0] || 'O ficheiro não tem produtos.', 'error')
    }
    if (mode === 'replace' && products.length && !(await confirm({
      title: 'Substituir produtos?',
      message: `Os ${products.length} produtos atuais vão ser substituídos por ${rows.length} do ficheiro. As vendas mantêm-se.`,
      confirmLabel: 'Substituir',
      danger: true,
    }))) return
    const r = await importProducts(rows, mode)
    const title = `${r.created} criados, ${r.updated} atualizados`
    setReport(errors.length || warnings.length ? { title, errors, warnings } : null)
    toast(`Importação: ${title}.`, errors.length || warnings.length ? 'warn' : 'ok')
  }

  function exportStock() {
    // mesmo formato da importação: pode ser reimportado no dia seguinte
    const csv = productsToCsv(products)
    downloadFile(`stock-${today()}.csv`, csv)
  }

  return (
    <div className="page">
      <section className="panel">
        <h2>Importar CSV</h2>
        <div className="row wrap">
          <select value={mode} onChange={(e) => setMode(e.target.value as 'replace' | 'merge')}>
            <option value="replace">Substituir todos os produtos</option>
            <option value="merge">Atualizar existentes (por SKU) e adicionar novos</option>
          </select>
          <label className="button primary">
            Escolher ficheiro CSV
            <input type="file" accept=".csv,.tsv,.txt,text/csv" onChange={onFile} hidden />
          </label>
          <button onClick={exportStock} disabled={!products.length}>Exportar stock (CSV)</button>
        </div>
        {report && (
          <div className="report">
            <div className="row between">
              <strong>Importação: {report.title}</strong>
              <button className="small" onClick={() => setReport(null)}>Fechar</button>
            </div>
            {report.errors.length > 0 && (
              <details open>
                <summary className="error">{report.errors.length} linha(s) ignorada(s)</summary>
                <ul>{report.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
              </details>
            )}
            {report.warnings.length > 0 && (
              <details open={report.warnings.length <= 5}>
                <summary>{report.warnings.length} aviso(s) — importadas, mas a rever</summary>
                <ul>{report.warnings.map((e, i) => <li key={i}>{e}</li>)}</ul>
              </details>
            )}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="row wrap between">
          <h2>Produtos ({pieces.length} peças)</h2>
          <div className="row">
            {noPrice > 0 && (
              <label className="inline warn-text">
                <input type="checkbox" checked={onlyNoPrice} onChange={(e) => setOnlyNoPrice(e.target.checked)} />
                Só sem preço ({noPrice})
              </label>
            )}
            <input placeholder="Filtrar…" value={filter} onChange={(e) => setFilter(e.target.value)} />
            <CategoryFilter products={products} selected={cats} onChange={setCats} />
            <button className="primary" onClick={() => setEditing('nova')}>+ Nova peça</button>
          </div>
        </div>
        {picked.length > 0 && (
          <div className="batch-bar row wrap">
            <strong>{pickedPieces} peça(s) selecionada(s) ({picked.length} tamanhos)</strong>
            <button className="primary" onClick={() => setBatchOpen(true)}>Alterar em lote</button>
            <button className="danger with-icon" onClick={removePicked}><TrashIcon size={14} />Apagar</button>
            <button onClick={() => setSelected([])}>Limpar seleção</button>
          </div>
        )}
        <div className="piece-list">
          {shown.length > 0 && (
            <label className="piece-list-all">
              <input type="checkbox" checked={allShownPicked} onChange={toggleShown} />
              <span className="muted">Selecionar todas as mostradas</span>
            </label>
          )}
          {shown.map((pc) => {
            const promo = piecePromoLabel(pc)
            return (
              <div key={pc.sku_pai} className={`piece-row ${isPicked(pc) ? 'picked' : ''}`}>
                <input type="checkbox" checked={isPicked(pc)} onChange={() => toggle(pc)}
                  aria-label={`Selecionar ${[pc.nome, pc.cor].filter(Boolean).join(' ')}`} />
                <div className="piece-row-main">
                  <div className="piece-name">{pc.nome}{pc.cor && <span className="piece-cor"> · {pc.cor}</span>}</div>
                  <div className="piece-sku">{pc.sku_pai}</div>
                  <div className="piece-sizes">
                    {pc.variants.map((v) => (
                      <span key={v.id} className={esgotado(v) ? 'esgotado' : ''}>{v.tamanho || 'Único'} {v.sem_limite ? '∞' : v.qtd}</span>
                    ))}
                    {pc.variants.length > 1 && <strong>Total {pc.stockTotal == null ? '∞' : pc.stockTotal}</strong>}
                  </div>
                  <div className="piece-tags">
                    {pc.categorias.map((c) => <span key={c} className="cat-tag">{c}</span>)}
                    {pc.variants[0].caixa_destino && <span className="cat-tag">{pc.variants[0].caixa_destino}</span>}
                  </div>
                </div>
                <div className="piece-row-side">
                  <span className="card-price">
                    {!(pc.precoMax > 0) ? <span className="badge warn">Sem preço</span>
                      : pc.precoMin === pc.precoMax ? formatEuro(pc.precoMin) : `${formatEuro(pc.precoMin)}–${formatEuro(pc.precoMax)}`}
                  </span>
                  {promo && <span className="badge">{promo}</span>}
                  <button className="small" onClick={() => setEditing(pc)}>Editar</button>
                </div>
              </div>
            )
          })}
          {!shown.length && <p className="muted">Nenhuma peça encontrada.</p>}
        </div>
      </section>

      {batchOpen && picked.length > 0 && (
        <ProductBatchModal products={picked} allCats={categorias.map(([c]) => c)}
          onClose={() => setBatchOpen(false)} onDone={() => { setBatchOpen(false); setSelected([]) }} />
      )}
      {editing && <PieceForm piece={editing === 'nova' ? null : editing} allCats={categorias.map(([c]) => c)} onClose={() => setEditing(null)} />}
    </div>
  )
}
