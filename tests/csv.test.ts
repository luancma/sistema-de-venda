import { describe, it, expect } from 'vitest'
import { parseProductsCsv, parseMoney } from '../src/lib/csv.ts'

describe('parseMoney', () => {
  it.each([
    ['12,50', 12.5], ['12.50', 12.5], ['12,50 €', 12.5], ['€ 1.234,56', 1234.56],
    ['1,234.56', 1234.56], ['1.234', 1234], ['7', 7], ['', null], ['abc', null],
  ])('%s -> %s', (i, o) => expect(parseMoney(i)).toBe(o))
})

describe('parseProductsCsv', () => {
  it('lê o formato tab do enunciado', () => {
    const csv = 'NOME\tQTD\tTAMANHO\tVALOR\nT-shirt\t20\tM\t12,50\nCaneca\t5\t\t6\n'
    const { products, errors } = parseProductsCsv(csv)
    expect(errors).toEqual([])
    expect(products).toEqual([
      { nome: 'T-shirt', qtd: 20, tamanho: 'M', valor: 12.5, promocao: null, preco_especial: null, categorias: [] },
      { nome: 'Caneca', qtd: 5, tamanho: '', valor: 6, promocao: null, preco_especial: null, categorias: [] },
    ])
  })
  it('aceita ; com BOM, acentos e colunas opcionais', () => {
    const csv = '﻿Nome;Qtd;Tamanho;Valor;Promoção;Preço Especial\n"Boné; azul";3;U;8,00;pack_2;14,00\n'
    const { products } = parseProductsCsv(csv)
    expect(products[0]).toMatchObject({ nome: 'Boné; azul', promocao: 'PACK_2', preco_especial: 14 })
  })
  it('reporta colunas em falta e linhas inválidas', () => {
    expect(parseProductsCsv('NOME\tQTD\nA\t1').errors[0]).toMatch(/VALOR/)
    const r = parseProductsCsv('NOME\tQTD\tTAMANHO\tVALOR\nA\t1\tM\txx\n\t1\tM\t2\n')
    expect(r.products).toHaveLength(0)
    expect(r.errors).toHaveLength(2)
  })
})

describe('VALOR vazio e promoções em texto livre', () => {
  it('importa VALOR vazio a 0 € com aviso', () => {
    const r = parseProductsCsv('NOME,QTD,TAMANHO,VALOR\nC. UP PRETA - S,1,S,\nC. OLGA - M,12,,\n')
    expect(r.errors).toEqual([])
    expect(r.products).toHaveLength(2)
    expect(r.products[0]).toMatchObject({ nome: 'C. UP PRETA - S', qtd: 1, tamanho: 'S', valor: 0 })
    expect(r.warnings).toHaveLength(2)
  })
  it('converte o texto da coluna Promoção', () => {
    const csv = 'Nome\tTamanho\tQtd\tValor\tPromoção\nA\tS\t1\t10\t2 por 1\nB\tM\t1\t4\t3 por 10€\nC\tL\t1\t5\tcompre 3 leve 1 grátis\nD\t\t1\t5\tqualquer coisa\n'
    const r = parseProductsCsv(csv)
    expect(r.products.map((p) => [p.promocao, p.preco_especial])).toEqual([
      ['LEVE_2_PAGUE_1', null], ['PACK_3', 10], ['LEVE_4_PAGUE_3', null], [null, null],
    ])
    expect(r.warnings).toHaveLength(1)
  })
})

describe('CATEGORIA', () => {
  it('lê várias categorias por produto e "DEFAULT" como sem tamanho', () => {
    const csv = 'NOME,QTD,TAMANHO,VALOR,CATEGORIA\nC. OLGA - M,12,M,15,"CAMISETA, OLGA"\nBOTTON,40,DEFAULT,2,BOTTON\nX,1,,1,\n'
    const { products, errors } = parseProductsCsv(csv)
    expect(errors).toEqual([])
    expect(products.map((p) => [p.tamanho, p.categorias])).toEqual([['M', ['CAMISETA', 'OLGA']], ['', ['BOTTON']], ['', []]])
  })
})

describe('coluna SEM LIMITE', () => {
  it('lê SIM/X como true, vazio como false, e sem coluna fica undefined', () => {
    const com = parseProductsCsv('NOME;QTD;TAMANHO;VALOR;SEM LIMITE\nRifa;;;1;SIM\nCaneca;3;;2;\nBolo;;;1;x')
    expect(com.products.map((p) => p.sem_limite)).toEqual([true, false, true])
    const sem = parseProductsCsv('NOME;QTD;TAMANHO;VALOR\nRifa;;;1')
    expect(sem.products[0].sem_limite).toBeUndefined()
  })
})

describe('coluna CAIXA DE DESTINO', () => {
  it('lê a caixa de cada produto, e sem coluna fica undefined', () => {
    const com = parseProductsCsv('NOME\tQTD\tTAMANHO\tVALOR\tCATEGORIA\tCAIXA DE DESTINO\nT-shirt\t2\tM\t10\tCAMISETA\t Caixa 3 \nCaneca\t1\t\t5\t\t')
    expect(com.products.map((p) => p.caixa_destino)).toEqual(['Caixa 3', ''])
    expect(parseProductsCsv('NOME;QTD;VALOR\nRifa;;1').products[0].caixa_destino).toBeUndefined()
  })
})
