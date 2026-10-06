import { useEffect, useRef, useState } from 'react'
import { checkAdminPassword } from '../lib/adminPassword.js'

/** Confirmação para ações destrutivas: pede a senha de administração antes de confirmar. */
export default function PasswordConfirmModal({ title, children, confirmLabel = 'Apagar', onConfirm, onCancel }) {
  const [pwd, setPwd] = useState('')
  const [wrong, setWrong] = useState(false)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef(null)
  const cancel = useRef(onCancel)
  cancel.current = onCancel

  useEffect(() => {
    inputRef.current?.focus()
    const onKey = (e) => e.key === 'Escape' && cancel.current()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  async function submit(e) {
    e.preventDefault()
    if (!checkAdminPassword(pwd)) {
      setWrong(true)
      setPwd('')
      inputRef.current?.focus()
      return
    }
    setBusy(true)
    try { await onConfirm() } finally { setBusy(false) }
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <form className="modal confirm" role="alertdialog" aria-modal="true" aria-labelledby="pwconfirm-title"
        onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2 id="pwconfirm-title">{title}</h2>
        {children && <div className="confirm-body">{children}</div>}
        <label>
          Senha de administração
          <input ref={inputRef} type="password" autoComplete="off" value={pwd}
            onChange={(e) => { setPwd(e.target.value); setWrong(false) }} />
        </label>
        {wrong && <p className="error small">Senha incorreta.</p>}
        <div className="row between">
          <button type="button" onClick={onCancel}>Cancelar</button>
          <button type="submit" className="danger-solid" disabled={!pwd || busy}>{confirmLabel}</button>
        </div>
      </form>
    </div>
  )
}
