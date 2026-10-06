// Carrinho em curso, fora dos componentes: sobrevive à mudança de página
// e é guardado em localStorage, por isso também sobrevive a um refresh.
import { useSyncExternalStore } from 'react'

const KEY = 'loja.carrinho'
const EMPTY = { items: {}, nome: '', nucleo: '', observacao: '' } // items: productId -> quantidade

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY))
    if (saved && typeof saved.items === 'object') return { ...EMPTY, ...saved }
  } catch { /* sem storage ou JSON inválido */ }
  return EMPTY
}

let state = load()
const listeners = new Set()

function setState(patch) {
  state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) }
  try { localStorage.setItem(KEY, JSON.stringify(state)) } catch { /* ignora */ }
  listeners.forEach((l) => l())
}

const subscribe = (l) => (listeners.add(l), () => listeners.delete(l))
const getSnapshot = () => state

export const cart = {
  /** muda a quantidade (mínimo 1 — a quantidade nunca remove o artigo) */
  setQty: (id, q) => setState((s) => ({ items: { ...s.items, [id]: Math.max(1, Math.floor(q) || 1) } })),
  /** remove o artigo do carrinho (só depois de confirmado pelo utilizador) */
  remove: (id) =>
    setState((s) => {
      const items = { ...s.items }
      delete items[id]
      return { items }
    }),
  setNome: (nome) => setState({ nome }),
  setNucleo: (nucleo) => setState({ nucleo }),
  setObservacao: (observacao) => setState({ observacao }),
  clearItems: () => setState({ items: {}, observacao: '' }),
  /** depois de uma venda: limpa artigos e comprador, mantém o núcleo */
  afterSale: () => setState({ items: {}, nome: '', observacao: '' }),
}

export function useCart() {
  return useSyncExternalStore(subscribe, getSnapshot)
}

/** Remove do carrinho produtos que já não existem (p.ex. após reimportar o CSV). */
export function pruneCart(existingIds) {
  const missing = Object.keys(state.items).filter((id) => !existingIds.has(id))
  if (missing.length) setState((s) => {
    const items = { ...s.items }
    missing.forEach((id) => delete items[id])
    return { items }
  })
}
