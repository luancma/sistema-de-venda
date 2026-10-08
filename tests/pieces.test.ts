import { describe, expect, it } from 'vitest'
import { normCor, normTamanho, compareSizes, groupPieces, isSingleSize, skuPai, skuFilho, piecePromoLabel } from '../src/lib/pieces.ts'
import type { Product } from '../src/types.ts'

const prod = (p: Partial<Product>): Product => ({
  id: p.sku ?? 'x', sku: '', sku_pai: '', nome: '', cor: '', tamanho: '', qtd: 0, valor: 15,
  promocao: null, preco_especial: null, categorias: null, sem_limite: false, caixa_destino: '', ...p,
})

// as 6 linhas do CSV de exemplo do spec
const EXEMPLO: Product[] = [
  prod({ sku: 'CAM-OLG-3XL', sku_pai: 'CAM-OLG', nome: 'Camiseta Olga', tamanho: '3XL', qtd: 3, categorias: 'CAMISETA' }),
  prod({ sku: 'CAM-OLG-2XL', sku_pai: 'CAM-OLG', nome: 'Camiseta Olga', tamanho: '2XL', qtd: 5, categorias: 'CAMISETA' }),
  prod({ sku: 'CAM-AML-VD-S', sku_pai: 'CAM-AML-VD', nome: 'Camiseta Amílcar', cor: 'Verde', tamanho: 'S', qtd: 5 }),
  prod({ sku: 'CAM-AML-PR-XS', sku_pai: 'CAM-AML-PR', nome: 'Camiseta Amílcar', cor: 'Preta', tamanho: 'XS', qtd: 2 }),
  prod({ sku: 'CAM-FID-S', sku_pai: 'CAM-FID', nome: 'Camiseta Fidel', tamanho: 'S', qtd: 7 }),
  prod({ sku: 'LIV-CAP-01', sku_pai: 'LIV-CAP-01', nome: 'As maravilhas do capitalismo...', tamanho: '', qtd: 1, valor: 3 }),
]

describe('normalização de cor e tamanho', () => {
  it('"—", "Único" e vazio contam como sem cor / tamanho único', () => {
    expect(normTamanho('Único')).toBe('')
    expect(normTamanho('unico')).toBe('')
    expect(normTamanho('U')).toBe('')
    expect(normTamanho('—')).toBe('')
    expect(normTamanho(undefined)).toBe('')
    expect(normCor('—')).toBe('')
    expect(normCor('-')).toBe('')
    expect(normCor(' Verde ')).toBe('Verde')
  })

  it('tamanhos escritos de formas diferentes ficam iguais', () => {
    expect(normTamanho(' s ')).toBe('S')
    expect(normTamanho('xxl')).toBe('2XL')
    expect(normTamanho('XXXL')).toBe('3XL')
    expect(normTamanho('2xl')).toBe('2XL')
  })
})

describe('ordem dos tamanhos', () => {
  it('letras pela ordem de roupa, depois números, depois o resto', () => {
    const t = ['3XL', 'S', 'XS', 'M', '2XL', 'L', '40', '38', '', 'XXS', 'XL', 'Infantil']
    expect([...t].sort(compareSizes)).toEqual(['', 'XXS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '38', '40', 'Infantil'])
  })
})

describe('peças', () => {
  it('agrupa por SKU_PAI, com os tamanhos por ordem', () => {
    const pecas = groupPieces(EXEMPLO)
    expect(pecas).toHaveLength(5)
    const olga = pecas.find((p) => p.sku_pai === 'CAM-OLG')!
    expect(olga.variants.map((v) => v.tamanho)).toEqual(['2XL', '3XL'])
    expect(olga.stockTotal).toBe(8)
    expect(olga.categorias).toEqual(['CAMISETA'])
    // por nome e depois cor: Amílcar Preta antes de Verde
    expect(pecas.map((p) => `${p.nome}|${p.cor}`)).toEqual([
      'As maravilhas do capitalismo...|', 'Camiseta Amílcar|Preta', 'Camiseta Amílcar|Verde', 'Camiseta Fidel|', 'Camiseta Olga|',
    ])
  })

  it('peça com um tamanho "sem limite" não tem total (∞)', () => {
    const [p] = groupPieces([prod({ sku: 'A-S', sku_pai: 'A', tamanho: 'S', qtd: 2 }), prod({ sku: 'A-M', sku_pai: 'A', tamanho: 'M', sem_limite: true })])
    expect(p.stockTotal).toBeNull()
  })

  it('intervalo de preço quando os tamanhos têm valores diferentes', () => {
    const [p] = groupPieces([prod({ sku: 'A-S', sku_pai: 'A', tamanho: 'S', valor: 12 }), prod({ sku: 'A-M', sku_pai: 'A', tamanho: 'M', valor: 15 })])
    expect([p.precoMin, p.precoMax]).toEqual([12, 15])
  })

  it('tamanho único: uma só variante sem tamanho', () => {
    const pecas = groupPieces(EXEMPLO)
    expect(isSingleSize(pecas.find((p) => p.sku_pai === 'LIV-CAP-01')!)).toBe(true)
    expect(isSingleSize(pecas.find((p) => p.sku_pai === 'CAM-FID')!)).toBe(false)
  })
})

describe('SKUs gerados', () => {
  it('peça: 3 letras das 2 primeiras palavras + 2 da cor, sem acentos', () => {
    expect(skuPai('Camiseta Amílcar', 'Verde')).toBe('CAM-AMI-VE')
    expect(skuPai('Camiseta Olga', '')).toBe('CAM-OLG')
    expect(skuPai('Boné', '')).toBe('BON')
    expect(skuPai('  ', '')).toBe('')
  })

  it('tamanho: SKU da peça + tamanho; tamanho único = SKU da peça', () => {
    expect(skuFilho('CAM-OLG', '2XL')).toBe('CAM-OLG-2XL')
    expect(skuFilho('LIV-CAP', '')).toBe('LIV-CAP')
  })
})

describe('etiqueta da promoção da peça', () => {
  it('a mesma promoção em todos os tamanhos mostra-a; diferentes mostram "Várias promoções"', () => {
    const igual = groupPieces([prod({ sku: 'A-S', sku_pai: 'A', tamanho: 'S', promocao: 'LEVE_2_PAGUE_1' }), prod({ sku: 'A-M', sku_pai: 'A', tamanho: 'M', promocao: 'LEVE_2_PAGUE_1' })])[0]
    expect(piecePromoLabel(igual)).toBe('2 por 1')
    const dif = groupPieces([prod({ sku: 'A-S', sku_pai: 'A', tamanho: 'S', promocao: 'LEVE_2_PAGUE_1' }), prod({ sku: 'A-M', sku_pai: 'A', tamanho: 'M' })])[0]
    expect(piecePromoLabel(dif)).toBe('Várias promoções')
    const nenhuma = groupPieces([prod({ sku: 'A-S', sku_pai: 'A', tamanho: 'S' })])[0]
    expect(piecePromoLabel(nenhuma)).toBe('')
  })
})

