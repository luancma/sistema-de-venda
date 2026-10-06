import Papa from 'papaparse'
import { normalizePromo } from './pricing.js'

// Normaliza cabeçalhos: "Preço Especial" -> "PRECO_ESPECIAL"
const normHeader = (h) =>
  String(h || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '')

const HEADER_ALIASES = {
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
}

/** Converte "12,50 €", "1.234,50", "12.5" em número. Devolve null se vazio/ inválido. */
export function parseMoney(raw) {
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

export function parseInteger(raw) {
  const n = parseMoney(raw)
  return n == null ? 0 : Math.trunc(n)
}

/**
 * Lê o CSV de inicialização (NOME, QTD, TAMANHO, VALOR [, PROMOCAO, PRECO ESPECIAL]).
 * O separador (tab, ; ou ,) é detetado automaticamente.
 * @returns {{ products: object[], errors: string[] }}
 */
export function parseProductsCsv(text) {
  const clean = String(text).replace(/^﻿/, '')
  const res = Papa.parse(clean, {
    header: true,
    skipEmptyLines: 'greedy',
    delimitersToGuess: ['\t', ';', ',', '|'],
    transformHeader: (h) => HEADER_ALIASES[normHeader(h)] ?? normHeader(h).toLowerCase(),
  })

  const errors = []   // linhas ignoradas
  const warnings = [] // linhas importadas, mas com algo a rever
  const fields = res.meta.fields || []
  for (const req of ['nome', 'qtd', 'valor']) {
    if (!fields.includes(req)) errors.push(`Coluna obrigatória em falta: ${req.toUpperCase()}`)
  }
  if (errors.length) return { products: [], errors, warnings }

  const products = []
  res.data.forEach((row, i) => {
    const linha = i + 2
    const nome = String(row.nome ?? '').trim()
    if (!nome) {
      errors.push(`Linha ${linha}: sem NOME — ignorada`)
      return
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
      nome,
      qtd: parseInteger(row.qtd),
      tamanho: String(row.tamanho ?? '').trim(),
      valor,
      promocao: promo?.promocao ?? null,
      preco_especial,
    })
  })
  return { products, errors, warnings }
}

/** Gera CSV (com BOM para o Excel abrir acentos corretamente). */
export function toCsv(rows, columns, delimiter = ';') {
  const data = rows.map((r) =>
    columns.map((c) => {
      const v = typeof c.value === 'function' ? c.value(r) : r[c.value]
      return v == null ? '' : v
    }),
  )
  return '﻿' + Papa.unparse({ fields: columns.map((c) => c.header), data }, { delimiter })
}

/** Número com vírgula decimal (formato PT, para Excel). */
export const ptNumber = (n) => (n == null || n === '' ? '' : Number(n).toFixed(2).replace('.', ','))

export function downloadFile(filename, content, mime = 'text/csv;charset=utf-8') {
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
