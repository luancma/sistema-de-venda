// Atividade e Responsável (zustand): usados no topo, nas Configurações e em cada venda.
// Ficam guardados neste aparelho (localStorage).
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

/**
 * Nome válido para a Atividade e o Responsável: tem de ter pelo menos uma letra ou um número
 * (de qualquer língua, com acentos). Recusa vazio, só espaços, só emojis ou só pontuação.
 */
export const nomeValido = (v: string) => /[\p{L}\p{N}]/u.test(v)

/** Atividade e Responsável preenchidos — obrigatórios para usar a app. */
export const sessaoValida = (s: { atividade: string; responsavel: string }) => nomeValido(s.atividade) && nomeValido(s.responsavel)

interface SessaoState {
  atividade: string
  responsavel: string
  setAtividade: (atividade: string) => void
  setResponsavel: (responsavel: string) => void
}

export const useSessao = create<SessaoState>()(
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
