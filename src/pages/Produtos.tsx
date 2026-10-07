import { useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import { useQuery } from '../db/useDb.ts'
import { listProducts, saveProduct, deleteProduct, importProducts, listCategorias } from '../db/repo.ts'
import { parseProductsCsv, parseMoney, toCsv, ptNumber, downloadFile } from '../lib/csv.ts'
import { PROMO_PRESETS, parsePromo, promoLabel, priceLine, formatEuro } from '../lib/pricing.ts'
import { useToast } from '../components/Toast.tsx'
import { useConfirm } from '../components/ConfirmProvider.tsx'
import CategoryFilter, { CategoryFilterButton } from '../components/CategoryFilter.tsx'
import { parseCategorias, matchesCategorias } from '../lib/categorias.ts'
import CategoriasInput from '../components/CategoriasInput.tsx'
import { stockIlimitado, esgotado } from '../lib/stock.ts'
import StockValue from '../components/StockValue.tsx'
import TrashIcon from '../components/TrashIcon.tsx'
import type { Product } from '../types.ts'

/** Produto a editar: um existente, ou um novo ainda vazio (valor e preço especial por preencher). */
type EditingProduct = Omit<Product, 'id' | 'valor' | 'preco_especial' | 'categorias'> & {
  id?: string
  valor: number | ''
  preco_especial: number | '' | null
  categorias?: string | null
}

/** Estado do formulário: números ainda como texto (como foram escritos, ex.: "12,50"). */
type FormState = Omit<EditingProduct, 'valor' | 'preco_especial' | 'categorias' | 'qtd'> & {
  valor: string
  preco_especial: string
  qtd: number | string
  categorias: string[]
}

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
  const [editing, setEditing] = useState<EditingProduct | null>(null)
  const [mode, setMode] = useState<'replace' | 'merge'>('replace')
  const [filter, setFilter] = useState('')
  const [cats, setCats] = useState<string[]>([])
  const [report, setReport] = useState<ImportReport | null>(null) // resultado da última importação
  const [onlyNoPrice, setOnlyNoPrice] = useState(false)

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase()
    const base = products.filter((p) => matchesCategorias(p, cats) && (!onlyNoPrice || !(p.valor > 0)))
    return q ? base.filter((p) => `${p.nome} ${p.tamanho}`.toLowerCase().includes(q)) : base
  }, [products, filter, onlyNoPrice, cats])
  const noPrice = products.filter((p) => !(p.valor > 0)).length

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
    const csv = toCsv(products, [
      { header: 'NOME', value: 'nome' },
      { header: 'QTD', value: 'qtd' },
      { header: 'TAMANHO', value: 'tamanho' },
      { header: 'VALOR', value: (p) => ptNumber(p.valor) },
      { header: 'PROMOCAO', value: 'promocao' },
      { header: 'PRECO ESPECIAL', value: (p) => ptNumber(p.preco_especial) },
      { header: 'CATEGORIA', value: (p) => parseCategorias(p.categorias).join(', ') },
      { header: 'SEM LIMITE', value: (p) => (stockIlimitado(p) ? 'SIM' : '') },
    ], '\t')
    downloadFile(`stock-${today()}.csv`, csv)
  }

  return (
    <div className="page">
      <section className="panel">
        <h2>Importar CSV</h2>
        <div className="row wrap">
          <select value={mode} onChange={(e) => setMode(e.target.value as 'replace' | 'merge')}>
            <option value="replace">Substituir todos os produtos</option>
            <option value="merge">Atualizar existentes (nome + tamanho) e adicionar novos</option>
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
          <h2>Produtos ({products.length})</h2>
          <div className="row">
            {noPrice > 0 && (
              <label className="inline warn-text">
                <input type="checkbox" checked={onlyNoPrice} onChange={(e) => setOnlyNoPrice(e.target.checked)} />
                Só sem preço ({noPrice})
              </label>
            )}
            <input placeholder="Filtrar…" value={filter} onChange={(e) => setFilter(e.target.value)} />
            <CategoryFilterButton products={products} selected={cats} onChange={setCats} />
            <button className="primary" onClick={() => setEditing({ nome: '', qtd: 0, tamanho: '', valor: '', promocao: '', preco_especial: '', sem_limite: false })}>
              + Novo produto
            </button>
          </div>
        </div>
        <CategoryFilter products={products} selected={cats} onChange={setCats} />
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Nome</th><th>Tamanho</th><th className="num">Qtd</th><th className="num">Valor</th><th>Categorias</th><th>Promoção</th><th></th></tr>
            </thead>
            <tbody>
              {shown.map((p) => (
                <tr key={p.id} className={esgotado(p) ? 'out' : ''}>
                  <td>{p.nome}</td>
                  <td>{p.tamanho}</td>
                  <td className="num"><StockValue product={p} /></td>
                  <td className="num">{p.valor > 0 ? formatEuro(p.valor) : <span className="badge warn">Sem preço</span>}</td>
                  <td>{parseCategorias(p.categorias).map((c) => <span key={c} className="cat-tag">{c}</span>)}</td>
                  <td>{promoLabel(p) && <span className="badge">{promoLabel(p)}</span>}</td>
                  <td className="actions"><button onClick={() => setEditing({ ...p })}>Editar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {editing && <ProductForm initial={editing} allCats={categorias.map(([c]) => c)} onClose={() => setEditing(null)} />}
    </div>
  )
}

function presetFor(code: string | null): string {
  if (!code) return ''
  if (PROMO_PRESETS.some((p) => p.code === code)) return code
  const p = parsePromo(code)
  return p?.type === 'PACK' ? 'PACK_N' : p?.type === 'LEVE' ? 'LEVE_N_PAGUE_M' : ''
}

function ProductForm({ initial, allCats = [], onClose }: { initial: EditingProduct; allCats?: string[]; onClose: () => void }) {
  const toast = useToast()
  const confirm = useConfirm()
  const parsed = parsePromo(initial.promocao)
  const [f, setF] = useState<FormState>({
    ...initial,
    valor: initial.valor === '' ? '' : String(initial.valor).replace('.', ','),
    preco_especial: initial.preco_especial == null ? '' : String(initial.preco_especial).replace('.', ','),
    categorias: parseCategorias(initial.categorias),
  })
  const [preset, setPreset] = useState(presetFor(initial.promocao))
  const [leve, setLeve] = useState(parsed?.type === 'LEVE' ? parsed.leve : 3)
  const [pague, setPague] = useState(parsed?.type === 'LEVE' ? parsed.pague : 2)
  const [packN, setPackN] = useState(parsed?.type === 'PACK' ? parsed.n : 3)
  const set = (k: 'nome' | 'tamanho' | 'qtd' | 'valor' | 'preco_especial') => (e: ChangeEvent<HTMLInputElement>) =>
    setF({ ...f, [k]: e.target.value })
  const [catDraft, setCatDraft] = useState('') // categoria escrita mas ainda sem Enter

  const promocao =
    preset === 'LEVE_N_PAGUE_M' ? `LEVE_${leve}_PAGUE_${pague}` : preset === 'PACK_N' ? `PACK_${packN}` : preset
  const candidate = { ...f, valor: parseMoney(f.valor), preco_especial: parseMoney(f.preco_especial), promocao: promocao || null }
  const example = candidate.valor != null ? [1, 2, 3, 4, 6].map((q) => [q, priceLine(candidate, q).total]) : []

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!f.nome.trim()) return toast('O nome é obrigatório.', 'error')
    if (candidate.valor == null) return toast('Valor inválido.', 'error')
    if (promocao && !parsePromo(promocao)) return toast('Promoção inválida: "pague" tem de ser menor que "leve".', 'error')
    if (preset === 'PACK_N' && candidate.preco_especial == null) return toast('O pack precisa de um preço especial.', 'error')
    // o que ficou escrito no campo das categorias (sem Enter) também conta
    const categorias = [...new Set([...f.categorias, ...parseCategorias(catDraft)])]
    await saveProduct({ ...candidate, categorias, qtd: parseInt(String(f.qtd), 10) || 0 })
    toast('Produto guardado.')
    onClose()
  }

  async function remove() {
    if (!f.id) return // produto novo: ainda não há nada para apagar
    const ok = await confirm({
      title: 'Apagar produto?',
      message: `${`${f.nome} ${f.tamanho}`.trim()}. As vendas já feitas não são afetadas.`,
      confirmLabel: 'Apagar',
      danger: true,
    })
    if (!ok) return
    await deleteProduct(f.id)
    toast('Produto apagado.')
    onClose()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>{f.id ? 'Editar produto' : 'Novo produto'}</h2>
        <div className="form-grid">
          <label className="span2">Nome<input value={f.nome} onChange={set('nome')} autoFocus /></label>
          <label>Tamanho<input value={f.tamanho} onChange={set('tamanho')} /></label>
          <div className="field">
            Quantidade
            {f.sem_limite
              ? <input value="∞ sem limite" disabled />
              : <input type="number" value={f.qtd} onChange={set('qtd')} aria-label="Quantidade" />}
            <label className="toggle">
              <input type="checkbox" checked={Boolean(f.sem_limite)} onChange={(e) => setF({ ...f, sem_limite: e.target.checked })} />
              <span className="toggle-track" aria-hidden="true" />
              <span>Sem limite <span className="muted">(nunca esgota)</span></span>
            </label>
          </div>
          <label>Valor (€)<input inputMode="decimal" value={f.valor} onChange={set('valor')} placeholder="0,00" /></label>
          <label>Preço especial (€) <span className="muted">opcional</span>
            <input inputMode="decimal" value={f.preco_especial} onChange={set('preco_especial')} placeholder="—" />
          </label>
          <div className="span2 field">
            Categorias
            <CategoriasInput value={f.categorias} onChange={(categorias) => setF({ ...f, categorias })}
              draft={catDraft} onDraft={setCatDraft} sugestoes={allCats} />
          </div>
          <label className="span2">Promoção
            <select value={preset} onChange={(e) => setPreset(e.target.value)}>
              {PROMO_PRESETS.map((p) => <option key={p.code} value={p.code}>{p.label}</option>)}
            </select>
          </label>
          {preset === 'LEVE_N_PAGUE_M' && (
            <>
              <label>Leve<input type="number" min="2" value={leve} onChange={(e) => setLeve(+e.target.value)} /></label>
              <label>Pague<input type="number" min="0" value={pague} onChange={(e) => setPague(+e.target.value)} /></label>
            </>
          )}
          {preset === 'PACK_N' && (
            <label>Unidades no pack<input type="number" min="2" value={packN} onChange={(e) => setPackN(+e.target.value)} /></label>
          )}
        </div>
        <p className="muted small">
          {preset === 'PACK_N' && 'Cada pack de N unidades custa o "preço especial"; unidades a mais pagam o valor normal. '}
          {!preset && 'Sem promoção: se houver preço especial, é usado como preço unitário. '}
        </p>
        {example.length > 0 && (
          <div className="preview">
            <span className="muted">Simulação:</span>
            {example.map(([q, t]) => <span key={q}>{q}× = <strong>{formatEuro(t)}</strong></span>)}
          </div>
        )}
        <div className="row between">
          {f.id ? <button type="button" className="danger with-icon" onClick={remove}><TrashIcon size={14} />Apagar</button> : <span />}
          <div className="row">
            <button type="button" onClick={onClose}>Cancelar</button>
            <button type="submit" className="primary">Guardar</button>
          </div>
        </div>
      </form>
    </div>
  )
}
