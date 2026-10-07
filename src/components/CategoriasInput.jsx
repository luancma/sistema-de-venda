import { useState } from 'react'
import { parseCategorias } from '../lib/categorias.js'
import TrashIcon from './TrashIcon.jsx'

/**
 * Categorias de um produto: etiquetas escolhidas + campo para escrever.
 * Enter (ou o botão +) junta o que foi escrito — se for uma categoria nova, fica criada ao guardar o produto.
 * `value`: lista de categorias; `draft`/`onDraft`: texto ainda por juntar (o formulário junta-o ao guardar).
 */
export default function CategoriasInput({ value, onChange, draft, onDraft, sugestoes = [] }) {
  const [focused, setFocused] = useState(false)
  const add = (raw) => {
    const novas = parseCategorias(raw).filter((c) => !value.includes(c))
    if (novas.length) onChange([...value, ...novas])
    onDraft('')
  }
  const livres = sugestoes.filter((c) => !value.includes(c))
  const escrito = parseCategorias(draft)[0]
  const nova = escrito && !sugestoes.includes(escrito) && !value.includes(escrito)

  return (
    <div className="span2 cat-input">
      <div className="cat-selected">
        {value.map((c) => (
          <span key={c} className="cat-chip on">
            {c}
            <button type="button" className="cat-chip-del" onClick={() => onChange(value.filter((x) => x !== c))} aria-label={`tirar ${c}`} title="Tirar deste produto">
              <TrashIcon size={12} />
            </button>
          </span>
        ))}
        {!value.length && <span className="muted">Sem categorias.</span>}
      </div>
      <div className="row">
        <input
          className="grow"
          list="cat-sugestoes"
          value={draft}
          onChange={(e) => onDraft(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return
            e.preventDefault() // Enter junta a categoria em vez de guardar o produto
            add(draft)
          }}
          enterKeyHint="done"
          placeholder="Escreve e carrega Enter"
          aria-label="Adicionar categoria"
        />
        <datalist id="cat-sugestoes">{livres.map((c) => <option key={c} value={c} />)}</datalist>
        <button type="button" onClick={() => add(draft)} disabled={!escrito} aria-label="Juntar categoria">+</button>
      </div>
      {nova && focused && <span className="muted small">Enter cria a categoria nova <strong>{escrito}</strong>.</span>}
      {livres.length > 0 && (
        <div className="cat-quick">
          {livres.map((c) => (
            <button key={c} type="button" className="cat-chip" onClick={() => onChange([...value, c])}>+ {c}</button>
          ))}
        </div>
      )}
    </div>
  )
}
