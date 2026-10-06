import { describe, it, expect } from 'vitest'
import { parseCategorias, joinCategorias, countCategorias, matchesCategorias } from '../src/lib/categorias.js'

describe('categorias', () => {
  it('normaliza', () => {
    expect(parseCategorias(' camiseta, Olga ; olga |  ')).toEqual(['CAMISETA', 'OLGA'])
    expect(parseCategorias(null)).toEqual([])
    expect(joinCategorias(['A', 'B'])).toBe('A,B')
    expect(joinCategorias([])).toBeNull()
  })
  const ps = [{ categorias: 'CAMISETA,OLGA' }, { categorias: 'CAMISETA,UP' }, { categorias: 'BOTTON' }, { categorias: null }]
  it('conta', () => {
    expect(countCategorias(ps)).toEqual([['BOTTON', 1], ['CAMISETA', 2], ['OLGA', 1], ['UP', 1]])
  })
  it('filtra com E (todas as selecionadas)', () => {
    expect(ps.filter((p) => matchesCategorias(p, ['CAMISETA'])).length).toBe(2)
    expect(ps.filter((p) => matchesCategorias(p, ['CAMISETA', 'OLGA'])).length).toBe(1)
    expect(ps.filter((p) => matchesCategorias(p, [])).length).toBe(4)
  })
})

import { similarGroups, replaceCategoria } from '../src/lib/categorias.js'
describe('gestão de categorias', () => {
  it('deteta parecidas', () => {
    expect(similarGroups(['CAMISETA', 'CAMISETAS', 'OLGA', 'BOTÃO', 'BOTAO', 'UP'])).toEqual([['CAMISETA', 'CAMISETAS'], ['BOTÃO', 'BOTAO']])
  })
  it('renomeia / junta / remove', () => {
    expect(replaceCategoria(['CAMISETAS', 'OLGA'], 'CAMISETAS', 'CAMISETA')).toEqual(['CAMISETA', 'OLGA'])
    expect(replaceCategoria(['CAMISETA', 'CAMISETAS'], 'CAMISETAS', 'CAMISETA')).toEqual(['CAMISETA'])
    expect(replaceCategoria(['CAMISETA', 'OLGA'], 'OLGA', '')).toEqual(['CAMISETA'])
  })
})
