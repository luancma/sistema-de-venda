import { describe, it, expect } from 'vitest'
import { priceLine, parsePromo, promoLabel } from '../src/lib/pricing.ts'

const p = (extra = {}) => ({ valor: 12.5, promocao: null, preco_especial: null, ...extra })

describe('priceLine', () => {
  it('sem promoção', () => {
    expect(priceLine(p(), 3)).toMatchObject({ total: 37.5, desconto: 0 })
  })
  it('2 por 1', () => {
    const prod = p({ promocao: 'LEVE_2_PAGUE_1' })
    expect(priceLine(prod, 1).total).toBe(12.5)
    expect(priceLine(prod, 2).total).toBe(12.5)
    expect(priceLine(prod, 3).total).toBe(25)
    expect(priceLine(prod, 4)).toMatchObject({ total: 25, desconto: 25 })
  })
  it('compre 3 leve 1 grátis (LEVE_4_PAGUE_3)', () => {
    const prod = p({ valor: 2, promocao: 'LEVE_4_PAGUE_3' })
    expect(priceLine(prod, 3).total).toBe(6)
    expect(priceLine(prod, 4).total).toBe(6)
    expect(priceLine(prod, 9).total).toBe(14) // 2 grupos de 4 (paga 3+3) + 1 avulso = 7 × 2 €
  })
  it('pack N por preço especial', () => {
    const prod = p({ valor: 4, promocao: 'PACK_3', preco_especial: 10 })
    expect(priceLine(prod, 2).total).toBe(8)
    expect(priceLine(prod, 3).total).toBe(10)
    expect(priceLine(prod, 7)).toMatchObject({ total: 24, desconto: 4 })
  })
  it('preço especial sem promoção = preço unitário', () => {
    expect(priceLine(p({ preco_especial: 10 }), 2)).toMatchObject({ total: 20, desconto: 5 })
  })
  it('sem erros de arredondamento', () => {
    expect(priceLine(p({ valor: 0.1 }), 3).total).toBe(0.3)
  })
  it('promo inválida é ignorada', () => {
    expect(parsePromo('LEVE_2_PAGUE_2')).toBeNull()
    expect(priceLine(p({ promocao: 'XPTO' }), 2).total).toBe(25)
  })
  it('etiquetas', () => {
    expect(promoLabel(p({ promocao: 'LEVE_2_PAGUE_1' }))).toBe('2 por 1')
    expect(promoLabel(p({ promocao: 'LEVE_4_PAGUE_3' }))).toBe('Compre 3, leve 4')
  })
})

import { normalizePromo } from '../src/lib/pricing.ts'
describe('normalizePromo', () => {
  it.each([
    ['', null], ['2 por 1', 'LEVE_2_PAGUE_1'], ['2x1', 'LEVE_2_PAGUE_1'], ['Leve 3, pague 2', 'LEVE_3_PAGUE_2'],
    ['Compre 3 e leve 1 grátis', 'LEVE_4_PAGUE_3'], ['3+1', 'LEVE_4_PAGUE_3'], ['3 por 10€', 'PACK_3'],
    ['3 por 10,50', 'PACK_3'], ['leve_2_pague_1', 'LEVE_2_PAGUE_1'], ['PACK_2', 'PACK_2'],
  ])('%s', (i, o) => expect(normalizePromo(i)?.promocao).toBe(o))
  it('desconhecido -> undefined', () => expect(normalizePromo('desconto amigo')).toBeUndefined())
})
