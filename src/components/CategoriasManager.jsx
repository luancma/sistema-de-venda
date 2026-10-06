import { useState } from 'react'
import { useQuery } from '../db/useDb.js'
import { listProducts, renameCategoria, removeCategoria } from '../db/repo.js'
import { countCategorias, similarGroups, parseCategorias } from '../lib/categorias.js'
import ConfirmModal from './ConfirmModal.jsx'
import { useToast } from './Toast.jsx'

/** Secção "Categorias" das Configurações: renomear, juntar duplicadas e remover. */
export default function CategoriasManager() {
  const toast = useToast()
  const products = useQuery(listProducts)
  const cats = countCategorias(products) // [[nome, nº produtos]]
  const count = Object.fromEntries(cats)
  const names = cats.map(([c]) => c)
  const dupes = similarGroups(names)
  const [editing, setEditing] = useState(null) // nome em edição
  const [draft, setDraft] = useState('')
  const [removing, setRemoving] = useState(null)

  async function rename(e) {
    e.preventDefault()
    const to = parseCategorias(draft)[0]
    if (!to) return toast('Escreve o novo nome.', 'error')
    if (to !== editing) {
      const merged = names.includes(to)
      const n = await renameCategoria(editing, to)
      toast(merged ? `${editing} juntada com ${to} (${n} produto(s)).` : `${editing} → ${to} (${n} produto(s)).`)
    }
    setEditing(null)
  }

  async function merge(group) {
    // fica o nome com mais produtos
    const keep = [...group].sort((a, b) => count[b] - count[a])[0]
    let n = 0
    for (const c of group) if (c !== keep) n += await renameCategoria(c, keep)
    toast(`Juntadas em ${keep} (${n} produto(s) atualizados).`)
  }

  return (
    <section className="panel">
      <h2>Categorias</h2>
      <p className="muted">
        As categorias vêm do CSV ou de Produtos → Editar. Aqui podes renomear (se o novo nome já existir, juntam-se) ou remover.
      </p>

      {dupes.length > 0 && (
        <div className="dupes">
          {dupes.map((g) => (
            <div key={g.join()} className="row wrap">
              <span className="warn-text">Parecidas: {g.map((c) => `${c} (${count[c]})`).join(' · ')}</span>
              <button className="small" onClick={() => merge(g)}>Juntar</button>
            </div>
          ))}
        </div>
      )}

      <div className="by-nucleo">
        {cats.map(([c, n]) =>
          editing === c ? (
            <form key={c} className="chip chip-edit" onSubmit={rename}>
              <input autoFocus list="cat-names" value={draft} onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && setEditing(null)} aria-label={`Novo nome para ${c}`} />
              <datalist id="cat-names">{names.filter((x) => x !== c).map((x) => <option key={x} value={x} />)}</datalist>
              <button className="small">OK</button>
              <button type="button" className="small" onClick={() => setEditing(null)}>Cancelar</button>
            </form>
          ) : (
            <span key={c} className="chip">
              {c} <span className="cat-n">{n}</span>
              <button className="chip-icon" onClick={() => { setEditing(c); setDraft(c) }} aria-label={`renomear ${c}`} title="Renomear / juntar">
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4" /></svg>
              </button>
              <button className="chip-icon danger-icon" onClick={() => setRemoving(c)} aria-label={`remover ${c}`} title="Remover">
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </span>
          ),
        )}
        {!cats.length && <span className="muted">Ainda não há categorias.</span>}
      </div>

      {removing && (
        <ConfirmModal
          title="Remover categoria?"
          confirmLabel="Remover"
          danger
          onCancel={() => setRemoving(null)}
          onConfirm={async () => {
            const n = await removeCategoria(removing)
            toast(`${removing} removida de ${n} produto(s).`)
            setRemoving(null)
          }}
        >
          <strong>{removing}</strong> vai sair de {count[removing]} produto(s). Os produtos não são apagados.
        </ConfirmModal>
      )}
    </section>
  )
}
