import { createContext, useCallback, useContext, useState } from 'react'
import ConfirmModal from './ConfirmModal.jsx'

// Confirmação com a janela da própria app, em vez do window.confirm: alguns browsers
// (e apps instaladas no ecrã principal) bloqueiam as janelas nativas e o confirm devolve
// logo "não" — a ação simplesmente não acontecia.
const Ctx = createContext(null)

export function ConfirmProvider({ children }) {
  const [req, setReq] = useState(null) // { title, message, confirmLabel, danger, resolve }

  const confirm = useCallback((opts) => new Promise((resolve) => setReq({ ...opts, resolve })), [])
  const close = (ok) => {
    req.resolve(ok)
    setReq(null)
  }

  return (
    <Ctx.Provider value={confirm}>
      {children}
      {req && (
        <ConfirmModal title={req.title} confirmLabel={req.confirmLabel} danger={req.danger}
          onCancel={() => close(false)} onConfirm={() => close(true)}>
          {req.message}
        </ConfirmModal>
      )}
    </Ctx.Provider>
  )
}

/** `const confirm = useConfirm()` → `if (!(await confirm({ title, message, confirmLabel, danger }))) return` */
export const useConfirm = () => useContext(Ctx)
