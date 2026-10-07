import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useQuery } from '../db/useDb.ts'
import { listNucleos, addNucleo, deleteNucleo } from '../db/repo.ts'
import TrashIcon from './TrashIcon.tsx'

/**
 * Modal para criar/remover núcleos sem sair do ecrã de venda.
 * `onAdded(nome)` é chamado com o último núcleo criado (para o selecionar logo).
 */
export default function NucleosModal({ onClose, onAdded }: { onClose: () => void; onAdded?: (nome: string) => void }) {
  const nucleos = useQuery(listNucleos)
  const [novo, setNovo] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    inputRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeRef.current()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  async function add(e: FormEvent) {
    e.preventDefault()
    // aceita vários de uma vez: "Lisboa, Porto; Braga"
    const nomes = novo.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean)
    if (!nomes.length) return
    for (const n of nomes) await addNucleo(n)
    setNovo('')
    inputRef.current?.focus()
    onAdded?.(nomes[nomes.length - 1])
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="nucleos-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="nucleos-title">Núcleos</h2>
        <form className="row" onSubmit={add}>
          <input
            ref={inputRef}
            className="grow"
            value={novo}
            onChange={(e) => setNovo(e.target.value)}
            placeholder="Novo núcleo (vários: separa por vírgula)"
          />
          <button className="primary" disabled={!novo.trim()}>Adicionar</button>
        </form>
        <div className="by-nucleo">
          {nucleos.map((n) => (
            <span key={n} className="chip">
              {n}
              <button className="chip-icon danger-icon" onClick={() => deleteNucleo(n)} aria-label={`remover ${n}`} title="Remover"><TrashIcon /></button>
            </span>
          ))}
          {!nucleos.length && <span className="muted">Ainda não há núcleos.</span>}
        </div>
        <div className="row between">
          <span />
          <button onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>
  )
}
