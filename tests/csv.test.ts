import { describe, it, expect } from 'vitest'
import { parseProductsCsv, parseMoney, productsToCsv } from '../src/lib/csv.ts'
import type { Product } from '../src/types.ts'

// CSV de exemplo do spec
const EXEMPLO = `SKU_FILHO,SKU_PAI,NOME_PRODUTO,COR,TAMANHO,QTD,VALOR,CATEGORIA,CAIXA
CAM-OLG-3XL,CAM-OLG,Camiseta Olga,—,3XL,3,15,Camiseta,PORTUGAL
CAM-OLG-2XL,CAM-OLG,Camiseta Olga,—,2XL,5,15,Camiseta,PORTUGAL
CAM-AML-VD-S,CAM-AML-VD,Camiseta Amílcar,Verde,S,5,15,Camiseta,PORTUGAL
CAM-AML-PR-XS,CAM-AML-PR,Camiseta Amílcar,Preta,XS,2,15,Camiseta,PORTUGAL
CAM-FID-S,CAM-FID,Camiseta Fidel,—,S,7,15,Camiseta,PORTUGAL
LIV-CAP-01,LIV-CAP-01,As maravilhas do capitalismo...,—,Único,1,3,Livro,PORTUGAL
`
const H = 'CAIXA,SKU_FILHO,SKU_PAI,NOME_PRODUTO,COR,TAMANHO,QTD,VALOR'

describe('parseMoney', () => {
  it.each([
    ['12,50', 12.5], ['12.50', 12.5], ['12,50 €', 12.5], ['€ 1.234,56', 1234.56],
    ['1,234.56', 1234.56], ['1.234', 1234], ['7', 7], ['', null], ['abc', null],
  ])('%s -> %s', (i, o) => expect(parseMoney(i)).toBe(o))
})

describe('parseProductsCsv (formato com SKU)', () => {
  it('lê o CSV de exemplo: SKU, peça, cor, "—" e "Único"', () => {
    const { products, errors, warnings } = parseProductsCsv(EXEMPLO)
    expect(errors).toEqual([])
    expect(warnings).toEqual([])
    expect(products).toHaveLength(6)
    expect(products[0]).toEqual({
      sku: 'CAM-OLG-3XL', sku_pai: 'CAM-OLG', nome: 'Camiseta Olga', cor: '', tamanho: '3XL', qtd: 3, valor: 15,
      promocao: null, preco_especial: null, categorias: ['CAMISETA'], sem_limite: undefined, caixa_destino: 'PORTUGAL',
    })
    expect(products[2]).toMatchObject({ sku_pai: 'CAM-AML-VD', cor: 'Verde', tamanho: 'S' })
    expect(products[5]).toMatchObject({ sku: 'LIV-CAP-01', tamanho: '', categorias: ['LIVRO'] })
  })

  it.each(['SKU_FILHO', 'SKU_PAI', 'NOME_PRODUTO', 'VALOR', 'CAIXA'])('sem a coluna %s não importa nada', (col) => {
    const cols = H.split(',').filter((c) => c !== col)
    const r = parseProductsCsv(`${cols.join(',')}\n${cols.map(() => 'x').join(',')}\n`)
    expect(r.products).toEqual([])
    expect(r.errors).toContain(`Coluna obrigatória em falta: ${col}`)
  })

  it('o formato antigo (sem SKU) deixa de ser aceite', () => {
    const r = parseProductsCsv('NOME;QTD;TAMANHO;VALOR\nCaneca;3;;6\n')
    expect(r.products).toEqual([])
    expect(r.errors).toContain('Coluna obrigatória em falta: SKU_FILHO')
  })

  it('SKU_FILHO repetido: fica o primeiro, os outros vão para os erros', () => {
    const r = parseProductsCsv(`${H}\nC1,CAM-OLG-3XL,CAM-OLG,Camiseta Olga,,3XL,3,15\nC1,CAM-OLG-3XL,CAM-OLG,Camiseta Olga,,3XL,9,15\n`)
    expect(r.products).toHaveLength(1)
    expect(r.products[0].qtd).toBe(3)
    expect(r.errors).toEqual(['Linha 3: SKU_FILHO "CAM-OLG-3XL" repetido — ignorada'])
  })

  it('SKUs ficam em maiúsculas: "cam-olg-s" e "CAM-OLG-S" são o mesmo (repetido)', () => {
    const r = parseProductsCsv(`${H}\nC1,cam-olg-s,cam-olg,Camiseta Olga,,S,1,15\nC1,CAM-OLG-S,CAM-OLG,Camiseta Olga,,S,2,15\n`)
    expect(r.products.map((p) => [p.sku, p.sku_pai])).toEqual([['CAM-OLG-S', 'CAM-OLG']])
    expect(r.errors).toEqual(['Linha 3: SKU_FILHO "CAM-OLG-S" repetido — ignorada'])
  })

  it('linha sem SKU ou nome é ignorada', () => {
    const r = parseProductsCsv(`${H}\nC1,,CAM-OLG,Camiseta Olga,,S,1,15\nC1,A-S,,A,,S,1,1\nC1,B-S,B,,,S,1,1\nC1,C-S,C,C,,S,1,1\n`)
    expect(r.products.map((p) => p.sku)).toEqual(['C-S'])
    expect(r.errors).toEqual([
      'Linha 2: sem SKU_FILHO, SKU_PAI ou NOME_PRODUTO — ignorada',
      'Linha 3: sem SKU_FILHO, SKU_PAI ou NOME_PRODUTO — ignorada',
      'Linha 4: sem SKU_FILHO, SKU_PAI ou NOME_PRODUTO — ignorada',
    ])
  })

  it('mesma peça com nomes ou cores diferentes entra, com aviso', () => {
    const r = parseProductsCsv(`${H}\nC1,X-S,X,Camiseta,Verde,S,1,15\nC1,X-M,X,Camisola,Verde,M,1,15\n`)
    expect(r.products).toHaveLength(2)
    expect(r.warnings).toEqual(['SKU_PAI "X": nome ou cor diferentes entre linhas'])
  })

  it('tamanhos escritos de formas diferentes ficam normalizados', () => {
    const r = parseProductsCsv(`${H}\nC1,A-1,A,A,,s,1,1\nC1,A-2,A,A,,xxl,1,1\nC1,A-3,A,A,,u,1,1\n`)
    expect(r.products.map((p) => p.tamanho)).toEqual(['S', '2XL', ''])
  })

  it('aceita ; com BOM, acentos nos cabeçalhos e colunas opcionais', () => {
    const csv = '﻿SKU Filho;SKU Pai;Nome Produto;Cor;Tamanho;Qtd;Valor;Promoção;Preço Especial;Caixa\n"BON-AZ";BON;"Boné; azul";Azul;Único;3;8,00;pack_2;14,00;C1\n'
    const { products, errors } = parseProductsCsv(csv)
    expect(errors).toEqual([])
    expect(products[0]).toMatchObject({ nome: 'Boné; azul', cor: 'Azul', tamanho: '', promocao: 'PACK_2', preco_especial: 14 })
  })
})

describe('VALOR vazio e promoções em texto livre', () => {
  it('importa VALOR vazio a 0 € com aviso', () => {
    const r = parseProductsCsv(`${H}\nC1,A-S,A,A,,S,1,\n`)
    expect(r.errors).toEqual([])
    expect(r.products[0]).toMatchObject({ valor: 0 })
    expect(r.warnings).toHaveLength(1)
  })
  it('converte o texto da coluna Promoção', () => {
    const r = parseProductsCsv(`${H},PROMOCAO\nC1,A,A,A,,S,1,10,2 por 1\nC1,B,B,B,,M,1,4,3 por 10€\nC1,C,C,C,,L,1,5,compre 3 leve 1 grátis\nC1,D,D,D,,,1,5,qualquer coisa\n`)
    expect(r.products.map((p) => [p.promocao, p.preco_especial])).toEqual([
      ['LEVE_2_PAGUE_1', null], ['PACK_3', 10], ['LEVE_4_PAGUE_3', null], [null, null],
    ])
    expect(r.warnings).toHaveLength(1)
  })
})

describe('colunas opcionais', () => {
  it('CATEGORIA com várias categorias', () => {
    const r = parseProductsCsv(`${H},CATEGORIA\nC1,A,A,A,,M,1,15,"CAMISETA, OLGA"\nC1,B,B,B,,,1,2,\n`)
    expect(r.products.map((p) => p.categorias)).toEqual([['CAMISETA', 'OLGA'], []])
  })
  it('SEM LIMITE: SIM/X = true, vazio = false, sem coluna = undefined', () => {
    const com = parseProductsCsv(`${H},SEM LIMITE\nC1,A,A,A,,,,1,SIM\nC1,B,B,B,,,3,2,\nC1,C,C,C,,,,1,x\n`)
    expect(com.products.map((p) => p.sem_limite)).toEqual([true, false, true])
    expect(parseProductsCsv(`${H}\nC1,A,A,A,,,,1\n`).products[0].sem_limite).toBeUndefined()
  })
  it('CAIXA é aparada; linha sem caixa é ignorada e reportada', () => {
    const r = parseProductsCsv(`${H}\n Caixa 3 ,A,A,A,,M,2,10\n,B,B,B,,,1,5\n`)
    expect(r.products.map((p) => [p.sku, p.caixa_destino])).toEqual([['A', 'Caixa 3']])
    expect(r.errors).toEqual(['Linha 3 (B): sem CAIXA — ignorada'])
  })
})

describe('exportar stock', () => {
  it('gera o mesmo formato e volta a ser lido igual', () => {
    const lidos = parseProductsCsv(EXEMPLO).products
    const products: Product[] = lidos.map((p, i) => ({
      id: String(i), ...p, cor: p.cor ?? '', qtd: p.qtd ?? 0, tamanho: p.tamanho ?? '', categorias: p.categorias.join(','), sem_limite: i === 5, caixa_destino: p.caixa_destino ?? '',
      promocao: i < 2 ? 'LEVE_2_PAGUE_1' : null,
    }))
    const csv = productsToCsv(products)
    expect(csv.split('\n')[0].replace(/^﻿/, '').trim()).toBe(
      'SKU_FILHO,SKU_PAI,NOME_PRODUTO,COR,TAMANHO,QTD,VALOR,CATEGORIA,CAIXA,PROMOCAO,PRECO ESPECIAL,SEM LIMITE',
    )
    const relidos = parseProductsCsv(csv)
    expect(relidos.errors).toEqual([])
    expect(relidos.products.map((p) => [p.sku, p.sku_pai, p.nome, p.cor, p.tamanho, p.qtd, p.valor, p.promocao, p.sem_limite])).toEqual(
      products.map((p) => [p.sku, p.sku_pai, p.nome, p.cor, p.tamanho, p.qtd, p.valor, p.promocao, p.sem_limite]),
    )
  })
})
