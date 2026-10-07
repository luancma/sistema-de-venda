import { describe, expect, it } from 'vitest'
import { stockIlimitado, faltaStock, esgotado } from '../src/lib/stock.js'

describe('stock', () => {
  it('só é ilimitado quando marcado "sem limite" (o tamanho não conta)', () => {
    expect(stockIlimitado({ tamanho: '', sem_limite: true })).toBe(true)
    expect(stockIlimitado({ tamanho: '' })).toBe(false)
    expect(stockIlimitado({ tamanho: 'M', sem_limite: false })).toBe(false)
  })
  it('falta de stock e esgotado não contam para produtos sem limite', () => {
    expect(faltaStock({ sem_limite: true, qtd: 0 }, 99)).toBe(false)
    expect(faltaStock({ qtd: 2 }, 3)).toBe(true)
    expect(faltaStock({ qtd: 2 }, 2)).toBe(false)
    expect(esgotado({ sem_limite: true, qtd: 0 })).toBe(false)
    expect(esgotado({ tamanho: '', qtd: 0 })).toBe(true)
  })
})
