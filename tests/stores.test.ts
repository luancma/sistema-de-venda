import { beforeAll, describe, expect, it } from 'vitest'

// localStorage em memória (o node não tem)
const mem = new Map<string, string>()
globalThis.localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => { mem.set(k, String(v)) },
  removeItem: (k: string) => { mem.delete(k) },
} as unknown as Storage // só o que o zustand usa

let useCart: typeof import('../src/lib/cartStore.ts').useCart
let useSessao: typeof import('../src/lib/sessionStore.ts').useSessao
beforeAll(async () => {
  ;({ useCart } = await import('../src/lib/cartStore.ts'))
  ;({ useSessao } = await import('../src/lib/sessionStore.ts'))
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
    const saved = JSON.parse(mem.get('loja.carrinho')!)
    expect(saved.state).toMatchObject({ items: {}, nucleo: 'Porto' })
    expect(saved.state.setQty).toBeUndefined()
  })
})

describe('sessão (zustand)', () => {
  it('começa vazia e grava Atividade e Responsável', () => {
    expect(useSessao.getState()).toMatchObject({ atividade: '', responsavel: '' })
    useSessao.getState().setAtividade('Feira')
    useSessao.getState().setResponsavel('Maria')
    expect(JSON.parse(mem.get('loja.sessao')!).state).toEqual({ atividade: 'Feira', responsavel: 'Maria' })
  })
})

describe('validação de Atividade e Responsável', () => {
  it('exige pelo menos uma letra ou número', async () => {
    const { nomeValido, sessaoValida } = await import('../src/lib/sessionStore.ts')
    for (const v of ['Rui', 'Feira de outubro', 'João', '2026', ' Ana 😀 ', 'Núcleo-1']) expect(nomeValido(v)).toBe(true)
    for (const v of ['', '   ', '😀', '😀 🎉', '...', ' - ', '\t\n']) expect(nomeValido(v)).toBe(false)
    expect(sessaoValida({ atividade: 'Feira', responsavel: 'Rui' })).toBe(true)
    expect(sessaoValida({ atividade: 'Feira', responsavel: '🙂' })).toBe(false)
  })
})
