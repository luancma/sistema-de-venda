import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import type { ToastKind } from '../types.ts'

type ShowToast = (text: string, kind?: ToastKind) => void
interface ToastItem { id: number; text: string; kind: ToastKind }

const ToastCtx = createContext<ShowToast>(() => {})
export const useToast = () => useContext(ToastCtx)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const show = useCallback<ShowToast>((text, kind = 'ok') => {
    const id = Math.random()
    // o mesmo aviso já visível não se repete (p.ex. várias tentativas seguidas da mesma ação)
    setToasts((t) => (t.some((x) => x.text === text) ? t : [...t, { id, text, kind }]))
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 6000 : 3500)
  }, [])
  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>{t.text}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}
