import { beforeAll, describe, expect, it } from 'vitest'

// localStorage em memória (o node não tem)
const mem = new Map()
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
  it('ações e persistência', () => {
    const c = useCart.getState()
    c.setQty('p1', 2)
    c.setQty('p2', 1)
    c.setNome('Ana')
    c.setNucleo('Porto')
    c.setQty('p1', 0) // mínimo 1
    expect(useCart.getState().items).toEqual({ p1: 1, p2: 1 })
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
  it('começa vazia e grava Atividade e Responsável', () => {
    expect(useSessao.getState()).toMatchObject({ atividade: '', responsavel: '' })
    useSessao.getState().setAtividade('Feira')
    useSessao.getState().setResponsavel('Maria')
    expect(JSON.parse(mem.get('loja.sessao')).state).toEqual({ atividade: 'Feira', responsavel: 'Maria' })
  })
})
