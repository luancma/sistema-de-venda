import { useState, type FormEvent } from 'react'
import { updateProducts, type ProductBatch } from '../db/repo.ts'
import { parseMoney } from '../lib/csv.ts'
import { PROMO_PRESETS } from '../lib/pricing.ts'
import { parseCategorias, countCategorias } from '../lib/categorias.ts'
import { useToast } from './Toast.tsx'
import CategoriasInput from './CategoriasInput.tsx'
import type { Product } from '../types.ts'

const KEEP = '__manter__'
// só as promoções sem parâmetros (Leve N / Pack N editam-se produto a produto)
const PROMOS = PROMO_PRESETS.filter((p) => p.code !== 'LEVE_N_PAGUE_M' && p.code !== 'PACK_N')

/**
 * Alterar vários produtos de uma vez. Campos vazios / "manter" ficam como estão em cada produto.
 * Categorias: as marcadas para tirar saem, as escritas juntam-se às que cada produto já tem.
 */
export default function ProductBatchModal({ products, allCats, onClose, onDone }: {
  products: Product[]
  allCats: string[]
  onClose: () => void
  onDone: () => void
}) {
  const toast = useToast()
  const [valor, setValor] = useState('')
  const [qtd, setQtd] = useState('')
  const [caixa, setCaixa] = useState('')
  const [limparCaixa, setLimparCaixa] = useState(false)
  const [promo, setPromo] = useState(KEEP)
  const [semLimite, setSemLimite] = useState(false) // quantidade infinita
  const [add, setAdd] = useState<string[]>([])
  const [draft, setDraft] = useState('')
  const [remove, setRemove] = useState<string[]>([])
  const usadas = countCategorias(products) // categorias dos selecionados, com quantos as têm

  async function submit(e: FormEvent) {
    e.preventDefault()
    const ch: ProductBatch = {}
    if (valor.trim()) {
      const v = parseMoney(valor)
      if (v == null) return toast('Valor inválido.', 'error')
      ch.valor = v
    }
    // quantidade: infinita (sem limite), um número (volta a controlar o stock) ou vazia (manter)
    if (semLimite) ch.sem_limite = true
    else if (qtd.trim()) {
      const q = parseInt(qtd, 10)
      if (!Number.isFinite(q)) return toast('Quantidade inválida.', 'error')
      ch.qtd = q
      ch.sem_limite = false
    }
    if (limparCaixa) ch.caixa_destino = ''
    else if (caixa.trim()) ch.caixa_destino = caixa.trim()
    if (promo !== KEEP) ch.promocao = promo || null
    // o que ficou escrito no campo das categorias (sem Enter) também conta
    const novas = [...new Set([...add, ...parseCategorias(draft)])]
    if (novas.length) ch.addCategorias = novas
    if (remove.length) ch.removeCategorias = remove
    if (!Object.keys(ch).length) return toast('Não há nada para alterar.', 'warn')
    const n = await updateProducts(products.map((p) => p.id), ch)
    toast(`${n} produto(s) alterado(s).`)
    onDone()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>Alterar {products.length} produto(s)</h2>
        <p className="muted small">Só muda o que preencheres; o resto fica como está em cada produto.</p>
        <div className="form-grid">
          <label>Valor (€)<input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="— manter —" /></label>
          <div className="field">
            Quantidade
            {semLimite
              ? <input value="∞ sem limite" disabled aria-label="Quantidade" />
              : <input type="number" value={qtd} onChange={(e) => setQtd(e.target.value)} placeholder="— manter —" aria-label="Quantidade" />}
            <label className="toggle">
              <input type="checkbox" checked={semLimite} onChange={(e) => setSemLimite(e.target.checked)} />
              <span className="toggle-track" aria-hidden="true" />
              <span>∞ Infinita <span className="muted">(nunca esgota)</span></span>
            </label>
          </div>
          <div className="span2 field">
            Caixa de destino
            <input value={limparCaixa ? '' : caixa} onChange={(e) => setCaixa(e.target.value)} placeholder="— manter —" disabled={limparCaixa} aria-label="Caixa de destino" />
            <label className="inline">
              <input type="checkbox" checked={limparCaixa} onChange={(e) => setLimparCaixa(e.target.checked)} />
              Tirar a caixa (deixar vazia)
            </label>
          </div>
          <label className="span2">Promoção
            <select value={promo} onChange={(e) => setPromo(e.target.value)}>
              <option value={KEEP}>— manter —</option>
              {PROMOS.map((p) => <option key={p.code} value={p.code}>{p.label}</option>)}
            </select>
          </label>
          <div className="span2 field">
            Juntar categorias
            <CategoriasInput value={add} onChange={setAdd} draft={draft} onDraft={setDraft} sugestoes={allCats} />
          </div>
          {usadas.length > 0 && (
            <div className="span2 field">
              Tirar categorias
              <div className="by-nucleo">
                {usadas.map(([c, n]) => (
                  <button key={c} type="button" className={`cat-chip ${remove.includes(c) ? 'on' : ''}`} aria-pressed={remove.includes(c)}
                    onClick={() => setRemove(remove.includes(c) ? remove.filter((x) => x !== c) : [...remove, c])}>
                    {c} <span className="cat-n">{n}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="row between">
          <span />
          <div className="row">
            <button type="button" onClick={onClose}>Cancelar</button>
            <button type="submit" className="primary">Aplicar a {products.length}</button>
          </div>
        </div>
      </form>
    </div>
  )
}
