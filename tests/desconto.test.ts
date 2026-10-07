import { describe, it, expect } from 'vitest'
import { saleDiscount, allocateDiscount, parseDecimal } from '../src/lib/pricing.ts'

describe('saleDiscount', () => {
  it('valor em €', () => expect(saleDiscount(40, 'valor', '5')).toEqual({ desconto: 5, total: 35, percent: 12.5 }))
  it('percentagem', () => expect(saleDiscount(33.5, 'percent', '10')).toEqual({ desconto: 3.35, total: 30.15, percent: 10 }))
  it('novo total', () => expect(saleDiscount(42, 'total', '40,00')).toEqual({ desconto: 2, total: 40, percent: 4.8 }))
  it('vazio = sem desconto', () => expect(saleDiscount(10, 'valor', '')).toEqual({ desconto: 0, total: 10, percent: 0 }))
  it('erros', () => {
    expect(saleDiscount(10, 'valor', '11').error).toMatch(/maior/)
    expect(saleDiscount(10, 'percent', '120').error).toMatch(/entre 0 e 100/)
    expect(saleDiscount(10, 'total', '12').error).toMatch(/maior/)
    expect(saleDiscount(10, 'total', '-1').error).toMatch(/negativo/)
  })
  it('aceita vírgula e €', () => expect(parseDecimal('2,50 €')).toBe(2.5))
})

describe('allocateDiscount', () => {
  it('proporcional e soma exata', () => {
    const parts = allocateDiscount([12.5, 21, 0.01], 3.33)
    expect(Math.round(parts.reduce((a, b) => a + b, 0) * 100)).toBe(333)
    expect(parts[1]).toBeGreaterThan(parts[0])
  })
  it('linhas iguais', () => expect(allocateDiscount([10, 10, 10], 1)).toEqual([0.34, 0.33, 0.33]))
  it('sem desconto', () => expect(allocateDiscount([5, 5], 0)).toEqual([0, 0]))
  it('desconto total', () => expect(allocateDiscount([5, 7.5], 12.5)).toEqual([5, 7.5]))
})
