import Papa from 'papaparse'
import { normalizePromo } from './pricing.ts'
import { parseCategorias } from './categorias.ts'
import { normCor, normTamanho } from './pieces.ts'
import type { Product } from '../types.ts'

/** Produto lido do CSV (ainda sem id). */
export interface ImportedProduct {
  /** SKU_FILHO: identifica o artigo */
  sku: string
  /** SKU_PAI: a peça */
  sku_pai: string
  nome: string
  /** '' = sem cor; undefined = o CSV não tem a coluna COR */
  cor?: string
  /** undefined = o CSV não tem a coluna QTD */
  qtd?: number
  /** '' = tamanho único; undefined = o CSV não tem a coluna TAMANHO */
  tamanho?: string
  valor: number
  promocao: string | null
  preco_especial: number | null
  categorias: string[]
  /** undefined = o CSV não tem a coluna SEM LIMITE */
  sem_limite?: boolean
  /** caixa onde o artigo está guardado (coluna CAIXA, obrigatória no CSV) */
  caixa_destino?: string
}

/** Coluna do CSV exportado: campo do objeto ou função que calcula o valor. */
export interface CsvColumn<T> {
  header: string
  value: (keyof T & string) | ((row: T) => unknown)
}

// Normaliza cabeçalhos: "Preço Especial" -> "PRECO_ESPECIAL"
const normHeader = (h: unknown) =>
  String(h || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '')

const HEADER_ALIASES: Record<string, string> = {
  SKU_FILHO: 'sku',
  SKU: 'sku',
  SKU_PAI: 'sku_pai',
  NOME_PRODUTO: 'nome',
  COR: 'cor',
  NOME: 'nome',
  NOME_DO_PRODUTO: 'nome',
  PRODUTO: 'nome',
  QTD: 'qtd',
  QUANTIDADE: 'qtd',
  TAMANHO: 'tamanho',
  VALOR: 'valor',
  PRECO: 'valor',
  PROMOCAO: 'promocao',
  PRECO_ESPECIAL: 'preco_especial',
  CATEGORIA: 'categorias',
  CATEGORIAS: 'categorias',
  SEM_LIMITE: 'sem_limite',
  ILIMITADO: 'sem_limite',
  CAIXA_DE_DESTINO: 'caixa_destino',
  CAIXA_DESTINO: 'caixa_destino',
  CAIXA: 'caixa_destino',
}

/** "SIM", "S", "X", "1", "TRUE" -> true; vazio/outros -> false; coluna inexistente -> undefined */
const parseSimNao = (v: unknown) => (v === undefined ? undefined : /^(sim|s|x|1|true|yes|y)$/i.test(String(v).trim()))

/** Converte "12,50 €", "1.234,50", "12.5" em número. Devolve null se vazio/ inválido. */
export function parseMoney(raw: unknown): number | null {
  if (raw == null) return null
  let s = String(raw).trim().replace(/[^\d,.-]/g, '')
  if (!s) return null
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  if (lastComma >= 0 && lastDot >= 0) {
    // o último separador é o decimal
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.')
    else s = s.replace(/,/g, '')
  } else if (lastComma >= 0) {
    s = s.replace(/\./g, '').replace(/,/g, '.')
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, '') // "1.234" = milhares
  }
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

export function parseInteger(raw: unknown): number {
  const n = parseMoney(raw)
  return n == null ? 0 : Math.trunc(n)
}

/** colunas obrigatórias: campo interno -> nome no CSV */
const OBRIGATORIAS: [string, string][] = [['sku', 'SKU_FILHO'], ['sku_pai', 'SKU_PAI'], ['nome', 'NOME_PRODUTO'], ['valor', 'VALOR'], ['caixa_destino', 'CAIXA']]

/**
 * Lê o CSV de produtos: SKU_FILHO, SKU_PAI, NOME_PRODUTO, VALOR e CAIXA obrigatórios;
 * COR, TAMANHO, QTD, CATEGORIA, PROMOCAO, PRECO ESPECIAL e SEM LIMITE opcionais.
 * O separador (tab, ; ou ,) é detetado automaticamente.
 * `errors`: linhas ignoradas; `warnings`: linhas importadas, mas com algo a rever.
 */
export function parseProductsCsv(text: string): { products: ImportedProduct[]; errors: string[]; warnings: string[] } {
  const clean = String(text).replace(/^﻿/, '')
  const res = Papa.parse<Record<string, string | undefined>>(clean, {
    header: true,
    skipEmptyLines: 'greedy',
    delimitersToGuess: ['\t', ';', ',', '|'],
    transformHeader: (h) => HEADER_ALIASES[normHeader(h)] ?? normHeader(h).toLowerCase(),
  })

  const errors: string[] = []   // linhas ignoradas
  const warnings: string[] = [] // linhas importadas, mas com algo a rever
  const fields = res.meta.fields || []
  for (const [req, coluna] of OBRIGATORIAS) {
    if (!fields.includes(req)) errors.push(`Coluna obrigatória em falta: ${coluna}`)
  }
  if (errors.length) return { products: [], errors, warnings }

  const products: ImportedProduct[] = []
  const vistos = new Set<string>() // SKU_FILHO já lidos
  const pecas = new Map<string, string>() // SKU_PAI -> "nome|cor" da 1.ª linha
  const avisadas = new Set<string>()
  res.data.forEach((row, i) => {
    const linha = i + 2
    // SKUs em maiúsculas: "cam-olg-s" e "CAM-OLG-S" são o mesmo artigo
    const sku = String(row.sku ?? '').trim().toUpperCase()
    const sku_pai = String(row.sku_pai ?? '').trim().toUpperCase()
    const nome = String(row.nome ?? '').trim()
    if (!sku || !sku_pai || !nome) {
      errors.push(`Linha ${linha}: sem SKU_FILHO, SKU_PAI ou NOME_PRODUTO — ignorada`)
      return
    }
    if (vistos.has(sku)) {
      errors.push(`Linha ${linha}: SKU_FILHO "${sku}" repetido — ignorada`)
      return
    }
    // a caixa de destino é obrigatória em cada artigo
    const caixa = String(row.caixa_destino ?? '').trim()
    if (!caixa) {
      errors.push(`Linha ${linha} (${sku}): sem CAIXA — ignorada`)
      return
    }
    vistos.add(sku)
    // colunas opcionais ausentes ficam undefined: ao Atualizar não mexem no valor atual
    const cor = fields.includes('cor') ? normCor(row.cor) : undefined
    const peca = `${nome}|${cor}`
    if (!pecas.has(sku_pai)) pecas.set(sku_pai, peca)
    else if (pecas.get(sku_pai) !== peca && !avisadas.has(sku_pai)) {
      avisadas.add(sku_pai)
      warnings.push(`SKU_PAI "${sku_pai}": nome ou cor diferentes entre linhas`)
    }
    const valorTxt = String(row.valor ?? '').trim()
    let valor = parseMoney(valorTxt)
    if (valor == null) {
      if (valorTxt) {
        errors.push(`Linha ${linha} (${nome}): VALOR inválido "${valorTxt}" — ignorada`)
        return
      }
      // VALOR vazio: importa com 0 € para o preço ser preenchido depois na app
      valor = 0
      warnings.push(`Linha ${linha} (${nome}): sem VALOR — importado a 0 €`)
    }
    let preco_especial = parseMoney(row.preco_especial)
    const promo = normalizePromo(row.promocao)
    if (promo === undefined) {
      warnings.push(`Linha ${linha} (${nome}): promoção "${row.promocao}" não reconhecida — ignorada`)
    } else if (promo.preco_especial != null && preco_especial == null) {
      preco_especial = promo.preco_especial
    }
    products.push({
      sku,
      sku_pai,
      nome,
      cor,
      qtd: fields.includes('qtd') ? parseInteger(row.qtd) : undefined,
      tamanho: fields.includes('tamanho') ? normTamanho(row.tamanho) : undefined,
      valor,
      promocao: promo?.promocao ?? null,
      preco_especial,
      categorias: parseCategorias(row.categorias),
      sem_limite: fields.includes('sem_limite') ? parseSimNao(row.sem_limite) : undefined,
      caixa_destino: caixa,
    })
  })
  return { products, errors, warnings }
}

/** Gera CSV (com BOM para o Excel abrir acentos corretamente). */
export function toCsv<T>(rows: T[], columns: CsvColumn<T>[], delimiter = ';'): string {
  const data = rows.map((r) =>
    columns.map((c) => {
      const v = typeof c.value === 'function' ? c.value(r) : r[c.value]
      return v == null ? '' : v
    }),
  )
  return '﻿' + Papa.unparse({ fields: columns.map((c) => c.header), data }, { delimiter })
}

/** Número com vírgula decimal (formato PT, para Excel). */
export const ptNumber = (n: number | string | null | undefined) => (n == null || n === '' ? '' : Number(n).toFixed(2).replace('.', ','))

export function downloadFile(filename: string, content: string | Blob, mime = 'text/csv;charset=utf-8') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Stock no mesmo formato da importação (pode ser reimportado). */
export function productsToCsv(products: Product[]): string {
  return toCsv(products, [
    { header: 'SKU_FILHO', value: 'sku' },
    { header: 'SKU_PAI', value: 'sku_pai' },
    { header: 'NOME_PRODUTO', value: 'nome' },
    { header: 'COR', value: (p) => p.cor || '—' },
    { header: 'TAMANHO', value: (p) => p.tamanho || 'Único' },
    { header: 'QTD', value: 'qtd' },
    { header: 'VALOR', value: (p) => ptNumber(p.valor) },
    { header: 'CATEGORIA', value: (p) => parseCategorias(p.categorias).join(', ') },
    { header: 'CAIXA', value: 'caixa_destino' },
    { header: 'PROMOCAO', value: 'promocao' },
    { header: 'PRECO ESPECIAL', value: (p) => ptNumber(p.preco_especial) },
    { header: 'SEM LIMITE', value: (p) => (p.sem_limite ? 'SIM' : '') },
  ], ',')
}
