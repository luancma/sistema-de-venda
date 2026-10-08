import { useState, type FormEvent } from 'react'
import { savePiece, deletePiece } from '../db/repo.ts'
import { parseMoney } from '../lib/csv.ts'
import { PROMO_PRESETS, parsePromo, priceLine, formatEuro } from '../lib/pricing.ts'
import { parseCategorias } from '../lib/categorias.ts'
import { normTamanho, skuPai, skuFilho, type Piece } from '../lib/pieces.ts'
import { errorMessage } from '../lib/errors.ts'
import { useToast } from './Toast.tsx'
import { useConfirm } from './ConfirmProvider.tsx'
import CategoriasInput from './CategoriasInput.tsx'
import TrashIcon from './TrashIcon.tsx'

/** Uma linha de tamanho no formulário (números ainda como texto). */
interface SizeRow {
  key: number
  id?: string
  tamanho: string
  qtd: string
  sem_limite: boolean
  sku: string
  /** o SKU foi escrito à mão (ou já existia): deixa de ser gerado */
  skuFixo: boolean
  valor: string
}

const RAPIDOS = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL']
/** promoção diferente em cada tamanho: manter a de cada um */
const MANTER = '__manter__'
const txt = (n: number | null | undefined) => (n == null ? '' : String(n).replace('.', ','))
let nextKey = 1

function presetFor(code: string | null): string {
  if (!code) return ''
  if (PROMO_PRESETS.some((p) => p.code === code)) return code
  const p = parsePromo(code)
  return p?.type === 'PACK' ? 'PACK_N' : p?.type === 'LEVE' ? 'LEVE_N_PAGUE_M' : ''
}

/**
 * Criar ou editar uma peça (SKU_PAI) com todos os seus tamanhos.
 * Os dados de cima valem para todos os tamanhos; os SKUs de linhas novas geram-se do SKU da peça.
 */
export default function PieceForm({ piece, allCats = [], onClose }: { piece: Piece | null; allCats?: string[]; onClose: () => void }) {
  const toast = useToast()
  const confirm = useConfirm()
  const base = piece?.variants[0]
  // valores diferentes entre tamanhos (vindos do CSV): mostram "vários" e só mudam se forem editados
  const varia = (f: (v: NonNullable<typeof base>) => unknown) => Boolean(piece && new Set(piece.variants.map(f)).size > 1)
  const promoVaria = varia((v) => v.promocao)
  const parsed = parsePromo(base?.promocao)
  const [nome, setNome] = useState(piece?.nome ?? '')
  const [cor, setCor] = useState(piece?.cor ?? '')
  const [paiEscrito, setPaiEscrito] = useState(piece ? piece.sku_pai : null) // null = gerado do nome e da cor
  const [valor, setValor] = useState(txt(base?.valor))
  const [especial, setEspecial] = useState(txt(base?.preco_especial))
  const [especialVarios, setEspecialVarios] = useState(varia((v) => v.preco_especial))
  const [preset, setPreset] = useState(promoVaria ? MANTER : presetFor(base?.promocao ?? null))
  const [leve, setLeve] = useState(parsed?.type === 'LEVE' ? parsed.leve : 3)
  const [pague, setPague] = useState(parsed?.type === 'LEVE' ? parsed.pague : 2)
  const [packN, setPackN] = useState(parsed?.type === 'PACK' ? parsed.n : 3)
  const [categorias, setCategorias] = useState(piece?.categorias ?? [])
  const [catDraft, setCatDraft] = useState('')
  const [caixa, setCaixa] = useState(base?.caixa_destino ?? '')
  const [caixaVarios, setCaixaVarios] = useState(varia((v) => v.caixa_destino))
  const [porTamanho, setPorTamanho] = useState(piece ? piece.precoMin !== piece.precoMax : false)
  const [rows, setRows] = useState<SizeRow[]>(() =>
    piece
      ? piece.variants.map((v) => ({ key: nextKey++, id: v.id, tamanho: v.tamanho, qtd: String(v.qtd), sem_limite: v.sem_limite, sku: v.sku, skuFixo: true, valor: txt(v.valor) }))
      : [{ key: nextKey++, tamanho: '', qtd: '', sem_limite: false, sku: '', skuFixo: false, valor: '' }])
  const [skuErro, setSkuErro] = useState<string | null>(null)
  const [paiErro, setPaiErro] = useState(false)

  const pai = paiEscrito ?? skuPai(nome, cor)
  const skuDe = (r: SizeRow) => (r.skuFixo ? r.sku : skuFilho(pai, normTamanho(r.tamanho)))
  const setRow = (key: number, ch: Partial<SizeRow>) => setRows(rows.map((r) => (r.key === key ? { ...r, ...ch } : r)))
  const usados = new Set(rows.map((r) => normTamanho(r.tamanho)))

  function addSize(t: string) {
    const nova: SizeRow = { key: nextKey++, tamanho: t, qtd: '', sem_limite: false, sku: '', skuFixo: false, valor: '' }
    // uma peça nova começa com uma linha "Único" vazia: o 1.º tamanho escolhido ocupa o lugar dela
    const soUnicoVazio = rows.length === 1 && !rows[0].id && !normTamanho(rows[0].tamanho) && !rows[0].qtd
    setRows(soUnicoVazio ? [nova] : [...rows, nova])
  }

  const promocao = preset === MANTER ? '' : preset === 'LEVE_N_PAGUE_M' ? `LEVE_${leve}_PAGUE_${pague}` : preset === 'PACK_N' ? `PACK_${packN}` : preset
  const valorN = parseMoney(valor)
  const especialN = parseMoney(especial)
  const example = valorN != null ? [1, 2, 3, 4, 6].map((q) => [q, priceLine({ valor: valorN, preco_especial: especialN, promocao: promocao || null }, q).total]) : []

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!nome.trim()) return toast('O nome é obrigatório.', 'error')
    if (valorN == null) return toast('Valor inválido.', 'error')
    if (promocao && !parsePromo(promocao)) return toast('Promoção inválida: "pague" tem de ser menor que "leve".', 'error')
    if (preset === 'PACK_N' && especialN == null) return toast('O pack precisa de um preço especial.', 'error')
    if (!pai.trim()) return toast('Falta o SKU da peça.', 'error')
    if (!caixaVarios && !caixa.trim()) return toast('A caixa de destino é obrigatória.', 'error')
    if (!rows.length) return toast('A peça precisa de pelo menos um tamanho.', 'error')
    if (usados.size < rows.length) return toast('Há tamanhos repetidos.', 'error')
    // tamanhos com stock que vão ser apagados
    const ficam = new Set(rows.map((r) => r.id).filter(Boolean))
    const saem = (piece?.variants ?? []).filter((v) => !ficam.has(v.id) && (v.qtd > 0 || v.sem_limite))
    if (saem.length && !(await confirm({
      title: 'Remover tamanhos com stock?',
      message: `${saem.map((v) => `${v.tamanho || 'Único'} (${v.sem_limite ? '∞' : v.qtd})`).join(', ')} vão ser apagados. As vendas já feitas não mudam.`,
      confirmLabel: 'Remover', danger: true,
    }))) return
    try {
      await savePiece({
        sku_pai: pai.trim(), nome: nome.trim(), cor: cor.trim(), valor: valorN,
        // "vários" (não editado) = cada tamanho mantém o seu valor
        preco_especial: especialVarios ? undefined : especialN,
        promocao: preset === MANTER ? undefined : promocao || null,
        categorias: [...new Set([...categorias, ...parseCategorias(catDraft)])],
        caixa_destino: caixaVarios ? undefined : caixa.trim(),
        variants: rows.map((r) => ({
          id: r.id, sku: skuDe(r), tamanho: r.tamanho, qtd: parseInt(r.qtd, 10) || 0, sem_limite: r.sem_limite,
          valor: porTamanho ? parseMoney(r.valor) ?? valorN : undefined,
        })),
      }, piece?.sku_pai)
    } catch (err) {
      const m = errorMessage(err)
      setSkuErro(m.startsWith('SKU repetido: ') ? m.slice('SKU repetido: '.length) : null)
      setPaiErro(m.startsWith('SKU da peça repetido'))
      return toast(m, 'error')
    }
    toast('Peça guardada.')
    onClose()
  }

  async function remove() {
    if (!piece) return
    const ok = await confirm({
      title: 'Apagar peça?',
      message: `${[piece.nome, piece.cor].filter(Boolean).join(' · ')}: ${piece.variants.length} tamanho(s). As vendas já feitas não são afetadas.`,
      confirmLabel: 'Apagar', danger: true,
    })
    if (!ok) return
    await deletePiece(piece.sku_pai)
    toast('Peça apagada.')
    onClose()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal piece-form" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>{piece ? 'Editar peça' : 'Nova peça'}</h2>
        <div className="form-grid">
          <label>Nome<input value={nome} onChange={(e) => setNome(e.target.value)} autoFocus /></label>
          <label>Cor<input value={cor} onChange={(e) => setCor(e.target.value)} placeholder="opcional" /></label>
          <label className="span2"><span>SKU da peça <span className="muted">{paiEscrito == null ? 'gerado do nome e da cor' : ''}</span></span>
            <input className={paiErro ? 'erro' : ''} value={pai} onChange={(e) => { setPaiEscrito(e.target.value.trim() ? e.target.value.toUpperCase() : null); setPaiErro(false) }} placeholder="ex.: CAM-OLG" />
            {paiErro && <span className="field-error">Já existe outra peça com este SKU — muda-o (ex.: junta a cor ou um número).</span>}
          </label>
          <label>Valor (€)<input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" /></label>
          <label>Preço especial (€)
            <input inputMode="decimal" value={especialVarios ? '' : especial} onChange={(e) => { setEspecial(e.target.value); setEspecialVarios(false) }}
              placeholder={especialVarios ? 'vários (manter)' : 'opcional'} />
          </label>
          <label className="span2">Promoção
            <select value={preset} onChange={(e) => setPreset(e.target.value)}>
              {promoVaria && <option value={MANTER}>— vários (manter a de cada tamanho) —</option>}
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
          <div className="span2 field">
            Categorias
            <CategoriasInput value={categorias} onChange={setCategorias} draft={catDraft} onDraft={setCatDraft} sugestoes={allCats} />
          </div>
          <label className={`span2 ${!caixaVarios && !caixa.trim() ? 'invalid' : ''}`}>Caixa de destino
            <input value={caixaVarios ? '' : caixa} onChange={(e) => { setCaixa(e.target.value); setCaixaVarios(false) }}
              placeholder={caixaVarios ? 'vários (manter)' : 'ex.: PORTUGAL'} />
            {!caixaVarios && !caixa.trim() && <span className="field-error">Obrigatória.</span>}
          </label>
        </div>

        <div className="field">
          Tamanhos
          <div className={`size-table ${porTamanho ? 'com-valor' : ''}`}>
            <div className="size-head">
              <span>Tamanho</span><span>Qtd</span><span>Sem lim.</span>{porTamanho && <span>Valor</span>}<span>SKU</span><span />
            </div>
            {rows.map((r) => (
              <div key={r.key} className="size-row">
                <input value={r.tamanho} onChange={(e) => setRow(r.key, { tamanho: e.target.value })} placeholder="Único" aria-label="Tamanho" />
                {r.sem_limite
                  ? <input value="∞" disabled aria-label="Quantidade" />
                  : <input type="number" inputMode="numeric" value={r.qtd} onChange={(e) => setRow(r.key, { qtd: e.target.value })} placeholder="0" aria-label="Quantidade" />}
                <label className="toggle" title="Sem limite (nunca esgota)">
                  <input type="checkbox" checked={r.sem_limite} onChange={(e) => setRow(r.key, { sem_limite: e.target.checked })} />
                  <span className="toggle-track" aria-hidden="true" />
                </label>
                {porTamanho && <input inputMode="decimal" value={r.valor} onChange={(e) => setRow(r.key, { valor: e.target.value })} placeholder={valor || '0,00'} aria-label="Valor deste tamanho" />}
                <input className={`size-sku ${skuErro && skuDe(r) === skuErro ? 'erro' : ''}`} value={skuDe(r)}
                  onChange={(e) => setRow(r.key, { sku: e.target.value.toUpperCase(), skuFixo: true })} aria-label="SKU" />
                <button type="button" className="chip-icon danger-icon" onClick={() => setRows(rows.filter((x) => x.key !== r.key))}
                  aria-label={`remover tamanho ${r.tamanho || 'Único'}`} title="Remover tamanho"><TrashIcon size={16} /></button>
              </div>
            ))}
          </div>
          <div className="quick-sizes">
            <span className="muted">Juntar:</span>
            {RAPIDOS.map((t) => (
              <button key={t} type="button" className="small" disabled={usados.has(t)} onClick={() => addSize(t)}>{t}</button>
            ))}
            {/* um tamanho de cada vez: escreve o da linha vazia antes de juntar outro */}
            <button type="button" className="small" disabled={usados.has('') && rows.length > 0} onClick={() => addSize('')}>+ outro</button>
          </div>
          <label className="toggle">
            <input type="checkbox" checked={porTamanho} onChange={(e) => setPorTamanho(e.target.checked)} />
            <span className="toggle-track" aria-hidden="true" />
            <span>Preços diferentes por tamanho</span>
          </label>
        </div>

        {example.length > 0 && (
          <div className="preview">
            <span className="muted">Simulação:</span>
            {example.map(([q, t]) => <span key={q}>{q}× = <strong>{formatEuro(t)}</strong></span>)}
          </div>
        )}
        <div className="row between">
          {piece ? <button type="button" className="danger with-icon" onClick={remove}><TrashIcon size={14} />Apagar peça</button> : <span />}
          <div className="row">
            <button type="button" onClick={onClose}>Cancelar</button>
            <button type="submit" className="primary">Guardar</button>
          </div>
        </div>
      </form>
    </div>
  )
}
