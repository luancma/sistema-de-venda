import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import ConfirmModal from './ConfirmModal.tsx'

// Confirmação com a janela da própria app, em vez do window.confirm: alguns browsers
// (e apps instaladas no ecrã principal) bloqueiam as janelas nativas e o confirm devolve
// logo "não" — a ação simplesmente não acontecia.
export interface ConfirmOptions {
  title: ReactNode
  message?: ReactNode
  confirmLabel?: ReactNode
  danger?: boolean
}
type Confirm = (opts: ConfirmOptions) => Promise<boolean>

const Ctx = createContext<Confirm>(async () => false)

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [req, setReq] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null)

  const confirm = useCallback<Confirm>((opts) => new Promise((resolve) => setReq({ ...opts, resolve })), [])
  const close = (ok: boolean) => {
    req?.resolve(ok)
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
