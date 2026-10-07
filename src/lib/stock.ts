// Produto marcado como "sem limite" (Produtos → Editar): a quantidade não é controlada
// (não desconta ao vender, nunca fica "sem stock" e não exige observação).
// Por defeito os produtos têm stock controlado.

import type { Product } from '../types.ts'

type ComStock = Partial<Pick<Product, 'sem_limite' | 'qtd' | 'tamanho'>>

export const stockIlimitado = (p: ComStock | null | undefined) => Boolean(p?.sem_limite)

/** a quantidade pedida passa do stock disponível? */
export const faltaStock = (p: ComStock, quantidade: number) => !stockIlimitado(p) && quantidade > (p.qtd ?? 0)

/** produto esgotado (para o mostrar esbatido) */
export const esgotado = (p: ComStock) => !stockIlimitado(p) && (p.qtd ?? 0) <= 0
