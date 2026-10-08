// Peças: os artigos (um por SKU) agrupados pelo SKU da peça (SKU_PAI) — cada peça tem os seus tamanhos.
import type { Product } from '../types.ts'
import { parseCategorias } from './categorias.ts'
import { promoLabel } from './pricing.ts'

/** Texto que significa "não se aplica" (sem cor / tamanho único). */
const VAZIO = /^(—|–|-|)$/

/** Cor do CSV/formulário: "—", "-" ou vazio = sem cor. */
export const normCor = (raw: unknown) => {
  const s = String(raw ?? '').trim()
  return VAZIO.test(s) ? '' : s
}

/** Tamanho do CSV/formulário: "Único", "U", "—" ou vazio = tamanho único (''); o resto em maiúsculas, XXL = 2XL. */
export function normTamanho(raw: unknown): string {
  const s = String(raw ?? '').trim().toUpperCase()
  if (VAZIO.test(s) || /^(ÚNICO|UNICO|U)$/.test(s)) return ''
  const x = s.match(/^(X{2,5})L$/) // XXL, XXXL…
  return x ? `${x[1].length}XL` : s
}

const LETRAS = ['XXS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL']

/** Ordem dos tamanhos: tamanho único, depois XXS…5XL, depois números por ordem crescente, depois o resto. */
export function compareSizes(a: string, b: string): number {
  const rank = (t: string): [number, number, string] => {
    if (!t) return [0, 0, '']
    const i = LETRAS.indexOf(t)
    if (i >= 0) return [1, i, '']
    if (/^\d+([.,]\d+)?$/.test(t)) return [2, Number(t.replace(',', '.')), '']
    return [3, 0, t]
  }
  const [ga, na, sa] = rank(a)
  const [gb, nb, sb] = rank(b)
  return ga - gb || na - nb || sa.localeCompare(sb, 'pt')
}

export interface Piece {
  sku_pai: string
  nome: string
  cor: string
  /** os artigos da peça, por ordem de tamanho */
  variants: Product[]
  /** soma das quantidades; null se algum tamanho for "sem limite" (∞) */
  stockTotal: number | null
  precoMin: number
  precoMax: number
  /** categorias de todos os tamanhos (sem repetidos) */
  categorias: string[]
}

const cmpTexto = (a: string, b: string) => a.localeCompare(b, 'pt', { sensitivity: 'base' })

/** Agrupa os artigos por SKU da peça. Nome e cor da peça vêm do 1.º tamanho. */
export function groupPieces(products: Product[]): Piece[] {
  const map = new Map<string, Product[]>()
  for (const p of products) {
    if (!map.has(p.sku_pai)) map.set(p.sku_pai, [])
    map.get(p.sku_pai)!.push(p)
  }
  const pieces = [...map.entries()].map(([sku_pai, list]): Piece => {
    const variants = [...list].sort((a, b) => compareSizes(a.tamanho, b.tamanho))
    const precos = variants.map((v) => v.valor)
    return {
      sku_pai,
      nome: variants[0].nome,
      cor: variants[0].cor,
      variants,
      stockTotal: variants.some((v) => v.sem_limite) ? null : variants.reduce((s, v) => s + v.qtd, 0),
      precoMin: Math.min(...precos),
      precoMax: Math.max(...precos),
      categorias: [...new Set(variants.flatMap((v) => parseCategorias(v.categorias)))],
    }
  })
  return pieces.sort((a, b) => cmpTexto(a.nome, b.nome) || cmpTexto(a.cor, b.cor))
}

/** Peça sem tamanhos (ex.: um livro): um só artigo, de tamanho único. */
export const isSingleSize = (piece: Piece) => piece.variants.length === 1 && !piece.variants[0].tamanho

/** só letras/números, sem acentos, em maiúsculas */
const limpa = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '')

/** SKU de uma peça nova: 3 letras de cada uma das 2 primeiras palavras do nome + 2 da cor (ex.: CAM-AMI-VE). */
export function skuPai(nome: string, cor: string): string {
  const palavras = nome.trim().split(/\s+/).map(limpa).filter(Boolean).slice(0, 2).map((w) => w.slice(0, 3))
  const c = limpa(cor).slice(0, 2)
  return [...palavras, c].filter(Boolean).join('-')
}

/** SKU de um tamanho novo: SKU da peça + tamanho (tamanho único = SKU da peça). */
export const skuFilho = (pai: string, tamanho: string) => (tamanho ? `${pai}-${limpa(tamanho)}` : pai)

/** Como se diz um artigo nas mensagens: "Camiseta Amílcar · Verde · S". */
export const rotuloArtigo = (p: Pick<Product, 'nome' | 'cor' | 'tamanho'>) => [p.nome, p.cor, p.tamanho].filter(Boolean).join(' · ')

/** Etiqueta da promoção da peça: a de todos os tamanhos, ou "Várias promoções" se forem diferentes. */
export function piecePromoLabel(piece: Piece): string {
  const labels = new Set(piece.variants.map((v) => promoLabel(v)))
  if (labels.size > 1) return 'Várias promoções'
  return [...labels][0] ?? ''
}

