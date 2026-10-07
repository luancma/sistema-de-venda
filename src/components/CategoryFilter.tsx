import { useEffect, useRef, useState } from 'react'
import { countCategorias } from '../lib/categorias.ts'
import type { Product } from '../types.ts'

interface Props {
  products: Product[]
  selected: string[]
  onChange: (selected: string[]) => void
}

/**
 * Filtro por categorias: um botão "Filtros (n)" que abre uma janela com as categorias para marcar.
 * As escolhas aplicam-se logo (os produtos por trás já ficam filtrados).
 * Com várias marcadas mostra os produtos que têm TODAS — ex.: CAMISETA + OLGA.
 */
export default function CategoryFilter({ products, selected, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const all = countCategorias(products)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (!all.length) return null
  const toggle = (c: string) => onChange(selected.includes(c) ? selected.filter((x) => x !== c) : [...selected, c])

  return (
    <>
      <button type="button" className={`filter-btn ${selected.length ? 'on' : ''}`} onClick={() => setOpen(true)}
        aria-haspopup="dialog" aria-label={`Filtros${selected.length ? `: ${selected.join(', ')}` : ''}`}>
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 5h18l-7 8v6l-4-2v-4z" /></svg>
        Filtros{selected.length > 0 && ` (${selected.length})`}
      </button>
      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div className="modal filter-modal" role="dialog" aria-modal="true" aria-labelledby="filter-title" onClick={(e) => e.stopPropagation()}>
            <h2 id="filter-title">Filtrar categorias</h2>
            {selected.length > 1 && <p className="muted small">Mostra os produtos com TODAS as categorias marcadas.</p>}
            <ul className="filter-list">
              {all.map(([c, n]) => (
                <li key={c}>
                  <label>
                    <input type="checkbox" checked={selected.includes(c)} onChange={() => toggle(c)} />
                    <span className="grow">{c}</span>
                    <span className="cat-n">{n}</span>
                  </label>
                </li>
              ))}
            </ul>
            <div className="row between">
              <button type="button" onClick={() => onChange([])} disabled={!selected.length}>Limpar</button>
              <button type="button" className="primary" ref={closeRef} onClick={() => setOpen(false)}>Ver produtos</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
