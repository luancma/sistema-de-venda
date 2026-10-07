// Carrinho em curso (zustand), fora dos componentes: sobrevive à mudança de página
// e é guardado em localStorage, por isso também sobrevive a um refresh.
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

const EMPTY = { items: {}, nome: '', nucleo: '', observacao: '', descontoMode: 'valor', descontoValue: '' } // items: productId -> quantidade

// versões anteriores guardavam o carrinho "solto" (sem o { state, version } do zustand)
const storage = createJSONStorage(() => ({
  getItem: (key) => {
    const raw = localStorage.getItem(key)
    try {
      const saved = JSON.parse(raw)
      if (saved && typeof saved.items === 'object' && !('state' in saved)) return JSON.stringify({ state: saved, version: 0 })
    } catch { /* JSON inválido: o zustand ignora */ }
    return raw
  },
  setItem: (key, value) => localStorage.setItem(key, value),
  removeItem: (key) => localStorage.removeItem(key),
}))

const withoutItems = (items, ids) => {
  const next = { ...items }
  ids.forEach((id) => delete next[id])
  return next
}

export const useCart = create(
  persist(
    (set, get) => ({
      ...EMPTY,
      /** muda a quantidade (mínimo 1 — a quantidade nunca remove o artigo) */
      setQty: (id, q) => set((s) => ({ items: { ...s.items, [id]: Math.max(1, Math.floor(q) || 1) } })),
      /** remove o artigo do carrinho (só depois de confirmado pelo utilizador) */
      remove: (id) => set((s) => ({ items: withoutItems(s.items, [id]) })),
      setNome: (nome) => set({ nome }),
      setNucleo: (nucleo) => set({ nucleo }),
      setObservacao: (observacao) => set({ observacao }),
      /** desconto dado no carrinho: mode 'valor' | 'percent' | 'total' */
      setDesconto: (descontoMode, descontoValue) => set({ descontoMode, descontoValue }),
      clearDesconto: () => set({ descontoValue: '' }),
      clearItems: () => set({ items: {}, observacao: '', descontoValue: '' }),
      /** depois de uma venda: limpa artigos e comprador, mantém o núcleo */
      afterSale: () => set({ items: {}, nome: '', observacao: '', descontoValue: '' }),
      /** Remove do carrinho produtos que já não existem (p.ex. após reimportar o CSV). */
      prune: (existingIds) => {
        const missing = Object.keys(get().items).filter((id) => !existingIds.has(id))
        if (missing.length) set((s) => ({ items: withoutItems(s.items, missing) }))
      },
    }),
    {
      name: 'loja.carrinho',
      storage,
      // só os dados vão para o localStorage (as funções não)
      partialize: ({ items, nome, nucleo, observacao, descontoMode, descontoValue }) =>
        ({ items, nome, nucleo, observacao, descontoMode, descontoValue }),
    },
  ),
)
