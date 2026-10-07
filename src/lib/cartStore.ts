// Carrinho em curso (zustand), fora dos componentes: sobrevive à mudança de página
// e é guardado em localStorage, por isso também sobrevive a um refresh.
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { DiscountMode } from '../types.ts'

interface CartData {
  /** productId -> quantidade */
  items: Record<string, number>
  nome: string
  nucleo: string
  observacao: string
  descontoMode: DiscountMode
  descontoValue: string
}

interface CartState extends CartData {
  setQty: (id: string, q: number) => void
  remove: (id: string) => void
  setNome: (nome: string) => void
  setNucleo: (nucleo: string) => void
  setObservacao: (observacao: string) => void
  setDesconto: (mode: DiscountMode, value: string) => void
  clearDesconto: () => void
  clearItems: () => void
  afterSale: () => void
  prune: (existingIds: Set<string>) => void
}

const EMPTY: CartData = { items: {}, nome: '', nucleo: '', observacao: '', descontoMode: 'valor', descontoValue: '' } // items: productId -> quantidade

const storage = createJSONStorage(() => localStorage)

const withoutItems = (items: Record<string, number>, ids: string[]) => {
  const next = { ...items }
  ids.forEach((id) => delete next[id])
  return next
}

export const useCart = create<CartState>()(
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
      partialize: ({ items, nome, nucleo, observacao, descontoMode, descontoValue }): CartData =>
        ({ items, nome, nucleo, observacao, descontoMode, descontoValue }),
    },
  ),
)
