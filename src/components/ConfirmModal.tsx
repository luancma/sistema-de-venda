import { useEffect, useRef, type ReactNode } from 'react'

interface Props {
  title: ReactNode
  children?: ReactNode
  confirmLabel?: ReactNode
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/** Janela de confirmação (substitui o window.confirm, que no iPhone é feio e fácil de tocar sem querer). */
export default function ConfirmModal({ title, children, confirmLabel = 'Confirmar', danger = false, onConfirm, onCancel }: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  const cancel = useRef(onCancel)
  cancel.current = onCancel

  useEffect(() => {
    cancelRef.current?.focus() // foco no "Cancelar": um Enter acidental não apaga nada
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && cancel.current()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal confirm" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="confirm-title">{title}</h2>
        {children && <div className="confirm-body">{children}</div>}
        <div className="row between">
          <button ref={cancelRef} onClick={onCancel}>Cancelar</button>
          <button className={danger ? 'danger-solid' : 'primary'} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}
