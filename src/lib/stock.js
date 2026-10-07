// Produto marcado como "sem limite" (Produtos → Editar): a quantidade não é controlada
// (não desconta ao vender, nunca fica "sem stock" e não exige observação).
// Por defeito os produtos têm stock controlado.

export const stockIlimitado = (p) => Boolean(p?.sem_limite)

/** a quantidade pedida passa do stock disponível? */
export const faltaStock = (p, quantidade) => !stockIlimitado(p) && quantidade > p.qtd

/** produto esgotado (para o mostrar esbatido) */
export const esgotado = (p) => !stockIlimitado(p) && p.qtd <= 0
