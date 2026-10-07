// Atividade e Responsável (zustand): usados no topo, nas Configurações e em cada venda.
// Ficam guardados neste aparelho (localStorage).
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

// versões anteriores guardavam cada um numa chave própria
const legacy = (key) => { try { return localStorage.getItem(key) ?? '' } catch { return '' } }

export const useSessao = create(
  persist(
    (set) => ({
      atividade: legacy('loja.atividade'),
      vendedor: legacy('loja.vendedor'), // "Responsável"
      setAtividade: (atividade) => set({ atividade }),
      setVendedor: (vendedor) => set({ vendedor }),
    }),
    {
      name: 'loja.sessao',
      storage: createJSONStorage(() => localStorage),
      partialize: ({ atividade, vendedor }) => ({ atividade, vendedor }),
    },
  ),
)
