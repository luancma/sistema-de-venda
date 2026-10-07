import { useState } from 'react'
import { useQuery } from '../db/useDb.js'
import { listNucleos, addNucleo, deleteNucleo, renameNucleo, countNucleoVendas } from '../db/repo.js'
import { similarGroups } from '../lib/categorias.js'
import { useCart } from '../lib/cartStore.js'
import ConfirmModal from './ConfirmModal.jsx'
import { useToast } from './Toast.jsx'
import TrashIcon from './TrashIcon.jsx'

/** Secção "Núcleos" das Configurações: adicionar, renomear, juntar parecidos e remover. */
export default function NucleosManager() {
  const toast = useToast()
  const nucleos = useQuery(listNucleos)
  const vendas = useQuery(countNucleoVendas) // { nome: nº de vendas }
  const dupes = similarGroups(nucleos)
  const [novo, setNovo] = useState('')
  const [editing, setEditing] = useState(null) // nome em edição
  const [draft, setDraft] = useState('')
  const [removing, setRemoving] = useState(null)

  async function add(e) {
    e.preventDefault()
    // aceita vários de uma vez: "Lisboa, Porto; Braga"
    const nomes = novo.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean)
    if (!nomes.length) return
    for (const n of nomes) await addNucleo(n)
    setNovo('')
  }

  // o núcleo escolhido no carrinho acompanha a mudança de nome
  async function doRename(from, to) {
    const n = await renameNucleo(from, to)
    const cart = useCart.getState()
    if (cart.nucleo === from) cart.setNucleo(to)
    return n
  }

  async function rename(e) {
    e.preventDefault()
    const to = draft.trim()
    if (!to) return toast('Escreve o novo nome.', 'error')
    if (to !== editing) {
      const merged = nucleos.includes(to)
      const n = await doRename(editing, to)
      toast(merged ? `${editing} juntado com ${to} (${n} venda(s)).` : `${editing} → ${to} (${n} venda(s)).`)
    }
    setEditing(null)
  }

  async function merge(group) {
    // fica o nome com mais vendas
    const keep = [...group].sort((a, b) => (vendas[b] || 0) - (vendas[a] || 0))[0]
    let n = 0
    for (const c of group) if (c !== keep) n += await doRename(c, keep)
    toast(`Juntados em ${keep} (${n} venda(s) atualizadas).`)
  }

  return (
    <section className="panel">
      <h2>Núcleos</h2>
      <p className="muted">
        O núcleo a que o comprador pertence — é obrigatório em cada venda. Ao renomear, as vendas já feitas também mudam
        (se o novo nome já existir, juntam-se). Remover não altera as vendas.
      </p>
      <form className="row" onSubmit={add}>
        <input value={novo} onChange={(e) => setNovo(e.target.value)} placeholder="Nome do núcleo (podes colar vários separados por vírgula)" className="grow" />
        <button className="primary">Adicionar</button>
      </form>

      {dupes.length > 0 && (
        <div className="dupes">
          {dupes.map((g) => (
            <div key={g.join()} className="row wrap">
              <span className="warn-text">Parecidos: {g.map((c) => `${c} (${vendas[c] || 0})`).join(' · ')}</span>
              <button className="small" onClick={() => merge(g)}>Juntar</button>
            </div>
          ))}
        </div>
      )}

      <div className="by-nucleo">
        {nucleos.map((c) =>
          editing === c ? (
            <form key={c} className="chip chip-edit" onSubmit={rename}>
              <input autoFocus list="nucleo-names" value={draft} onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && setEditing(null)} aria-label={`Novo nome para ${c}`} />
              <datalist id="nucleo-names">{nucleos.filter((x) => x !== c).map((x) => <option key={x} value={x} />)}</datalist>
              <button className="small">OK</button>
              <button type="button" className="small" onClick={() => setEditing(null)}>Cancelar</button>
            </form>
          ) : (
            <span key={c} className="chip">
              {c} <span className="cat-n" title="vendas">{vendas[c] || 0}</span>
              <button className="chip-icon" onClick={() => { setEditing(c); setDraft(c) }} aria-label={`renomear ${c}`} title="Renomear / juntar">
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4" /></svg>
              </button>
              <button className="chip-icon danger-icon" onClick={() => setRemoving(c)} aria-label={`remover ${c}`} title="Remover">
                <TrashIcon />
              </button>
            </span>
          ),
        )}
        {!nucleos.length && <span className="muted">Ainda não há núcleos.</span>}
      </div>

      {removing && (
        <ConfirmModal
          title="Remover núcleo?"
          confirmLabel="Remover"
          danger
          onCancel={() => setRemoving(null)}
          onConfirm={async () => {
            await deleteNucleo(removing)
            const cart = useCart.getState()
            if (cart.nucleo === removing) cart.setNucleo('')
            toast(`${removing} removido.`)
            setRemoving(null)
          }}
        >
          <strong>{removing}</strong> deixa de aparecer na lista ao vender.
          {vendas[removing] > 0 && <> As {vendas[removing]} venda(s) já feitas mantêm este núcleo.</>}
        </ConfirmModal>
      )}
    </section>
  )
}
