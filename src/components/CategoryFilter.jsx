import { countCategorias } from '../lib/categorias.js'

/**
 * Filtro por categorias (botões que ligam/desligam).
 * Com várias selecionadas mostra os produtos que têm TODAS — ex.: CAMISETA + OLGA.
 */
export default function CategoryFilter({ products, selected, onChange }) {
  const all = countCategorias(products)
  if (!all.length) return null
  const toggle = (c) => onChange(selected.includes(c) ? selected.filter((x) => x !== c) : [...selected, c])
  return (
    <div className="cat-filter" role="group" aria-label="Filtrar por categoria">
      <button type="button" className={`cat-chip ${selected.length ? '' : 'on'}`} aria-pressed={!selected.length} onClick={() => onChange([])}>
        Todas
      </button>
      {all.map(([c, n]) => (
        <button key={c} type="button" className={`cat-chip ${selected.includes(c) ? 'on' : ''}`} aria-pressed={selected.includes(c)} onClick={() => toggle(c)}>
          {c} <span className="cat-n">{n}</span>
        </button>
      ))}
    </div>
  )
}
