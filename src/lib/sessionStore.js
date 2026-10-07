// Atividade e Responsável (zustand): usados no topo, nas Configurações e em cada venda.
// Ficam guardados neste aparelho (localStorage).
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export const useSessao = create(
  persist(
    (set) => ({
      atividade: '',
      responsavel: '',
      setAtividade: (atividade) => set({ atividade }),
      setResponsavel: (responsavel) => set({ responsavel }),
    }),
    {
      name: 'loja.sessao',
      storage: createJSONStorage(() => localStorage),
      partialize: ({ atividade, responsavel }) => ({ atividade, responsavel }),
    },
  ),
)
