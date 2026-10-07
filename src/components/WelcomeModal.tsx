import { useEffect, useRef, type FormEvent } from 'react'
import { useSessao, sessaoValida } from '../lib/sessionStore.ts'
import AtividadeInput from './AtividadeInput.tsx'

/**
 * 1.ª utilização (sem dados): pede o evento (Atividade) e o Responsável.
 * Os dois são obrigatórios — a janela só fecha quando estiverem preenchidos.
 */
export default function WelcomeModal({ onDone }: { onDone: () => void }) {
  const sessao = useSessao()
  const { atividade, setAtividade, responsavel, setResponsavel } = sessao
  const formRef = useRef<HTMLFormElement>(null)
  const ok = sessaoValida(sessao)

  useEffect(() => {
    formRef.current?.querySelector('input')?.focus()
  }, [])

  function submit(e: FormEvent) {
    e.preventDefault()
    if (ok) onDone()
  }

  return (
    <div className="modal-backdrop">
      <form ref={formRef} className="modal confirm" role="dialog" aria-modal="true" aria-labelledby="welcome-title" onSubmit={submit}>
        <h2 id="welcome-title">Bem-vindo(a)</h2>
        <div className="confirm-body">
          <p>Insira o nome do evento e o nome do responsável.</p>
        </div>
        <label>
          Evento (atividade)
          <AtividadeInput value={atividade} onChange={setAtividade} />
        </label>
        <label>
          Responsável
          <input value={responsavel} onChange={(e) => setResponsavel(e.target.value)} placeholder="O teu nome" />
        </label>
        <div className="row between">
          <span className="muted small">{ok ? '' : 'Os dois campos são obrigatórios (com letras ou números).'}</span>
          <button className="primary" disabled={!ok}>Continuar</button>
        </div>
      </form>
    </div>
  )
}
