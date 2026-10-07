import { beforeAll, describe, expect, it } from 'vitest'

// localStorage em memória, já com dados no formato das versões anteriores
const mem = new Map([
  ['loja.carrinho', JSON.stringify({ items: { p1: 2, p2: 1 }, nome: 'Ana', nucleo: 'Porto', observacao: '', descontoMode: 'valor', descontoValue: '' })],
  ['loja.atividade', 'Feira'],
  ['loja.vendedor', 'Rui'],
])
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
}

let useCart, useSessao
beforeAll(async () => {
  ;({ useCart } = await import('../src/lib/cartStore.js'))
  ;({ useSessao } = await import('../src/lib/sessionStore.js'))
})

describe('carrinho (zustand)', () => {
  it('lê o carrinho guardado no formato antigo', () => {
    expect(useCart.getState()).toMatchObject({ items: { p1: 2, p2: 1 }, nome: 'Ana', nucleo: 'Porto' })
  })

  it('ações e persistência', () => {
    const c = useCart.getState()
    c.setQty('p1', 0) // mínimo 1
    expect(useCart.getState().items.p1).toBe(1)
    c.prune(new Set(['p1']))
    expect(useCart.getState().items).toEqual({ p1: 1 })
    c.afterSale()
    expect(useCart.getState()).toMatchObject({ items: {}, nome: '', nucleo: 'Porto' })
    const saved = JSON.parse(mem.get('loja.carrinho'))
    expect(saved.state).toMatchObject({ items: {}, nucleo: 'Porto' })
    expect(saved.state.setQty).toBeUndefined()
  })
})

describe('sessão (zustand)', () => {
  it('lê Atividade e Responsável das chaves antigas e grava na nova', () => {
    expect(useSessao.getState()).toMatchObject({ atividade: 'Feira', vendedor: 'Rui' })
    useSessao.getState().setVendedor('Maria')
    expect(JSON.parse(mem.get('loja.sessao')).state).toEqual({ atividade: 'Feira', vendedor: 'Maria' })
  })
})
