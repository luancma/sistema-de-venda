// Motor de promoções.
//
// O campo `promocao` de um produto é um código em texto:
//   null / ''              -> sem promoção (usa preco_especial como preço unitário, se existir)
//   'LEVE_<N>_PAGUE_<M>'   -> por cada N unidades paga só M  (ex.: 2 por 1 = LEVE_2_PAGUE_1,
//                             "compre 3 e leve 1 grátis" = LEVE_4_PAGUE_3)
//   'PACK_<N>'             -> cada N unidades custam `preco_especial` (ex.: 3 por 10 €)
//
// Todos os cálculos são feitos em cêntimos para evitar erros de vírgula flutuante.

import type { DiscountMode, PriceInput } from '../types.ts'

export const toCents = (euros: number | string | null | undefined) => Math.round(Number(euros || 0) * 100)
export const fromCents = (cents: number) => Math.round(cents) / 100

export const PROMO_PRESETS = [
  { code: '', label: 'Sem promoção' },
  { code: 'LEVE_2_PAGUE_1', label: '2 por 1' },
  { code: 'LEVE_3_PAGUE_2', label: 'Leve 3, pague 2' },
  { code: 'LEVE_4_PAGUE_3', label: 'Compre 3, leve 1 grátis' },
  { code: 'LEVE_N_PAGUE_M', label: 'Leve N, pague M (personalizado)' },
  { code: 'PACK_N', label: 'Pack: N unidades por preço especial' },
]

export type Promo = { type: 'LEVE'; leve: number; pague: number } | { type: 'PACK'; n: number }

export function parsePromo(code: string | null | undefined): Promo | null {
  if (!code) return null
  const s = String(code).trim().toUpperCase()
  let m = s.match(/^LEVE_(\d+)_PAGUE_(\d+)$/)
  if (m) {
    const leve = +m[1]
    const pague = +m[2]
    if (leve > 0 && pague >= 0 && pague < leve) return { type: 'LEVE', leve, pague }
    return null
  }
  m = s.match(/^PACK_(\d+)$/)
  if (m && +m[1] > 0) return { type: 'PACK', n: +m[1] }
  return null
}

export function promoLabel(product: PriceInput | null | undefined): string {
  const p = parsePromo(product?.promocao)
  const especial = product?.preco_especial
  if (!p) {
    return especial != null && especial !== '' ? `Preço especial ${formatEuro(especial)}` : ''
  }
  if (p.type === 'LEVE') {
    if (p.leve === 2 && p.pague === 1) return '2 por 1'
    if (p.leve - p.pague === 1) return `Compre ${p.pague}, leve ${p.leve}`
    return `Leve ${p.leve}, pague ${p.pague}`
  }
  if (p.type === 'PACK') {
    return especial != null && especial !== ''
      ? `${p.n} por ${formatEuro(especial)}`
      : `Pack ${p.n} (sem preço especial!)`
  }
  return ''
}

/** Preço de uma linha, em euros. */
export interface LinePrice {
  unitario: number
  bruto: number
  total: number
  desconto: number
}

/** Calcula o preço de uma linha (produto × quantidade) aplicando a promoção. */
export function priceLine(product: PriceInput, quantidade: number | string): LinePrice {
  const q = Math.max(0, Math.floor(Number(quantidade) || 0))
  const valor = toCents(product.valor)
  const hasEspecial = product.preco_especial != null && product.preco_especial !== ''
  const especial = hasEspecial ? toCents(product.preco_especial) : null
  const promo = parsePromo(product.promocao)

  const bruto = valor * q
  let total = bruto

  if (!promo) {
    if (especial != null) total = especial * q
  } else if (promo.type === 'LEVE') {
    const grupos = Math.floor(q / promo.leve)
    const resto = q % promo.leve
    total = (grupos * promo.pague + resto) * valor
  } else if (promo.type === 'PACK' && especial != null) {
    const grupos = Math.floor(q / promo.n)
    const resto = q % promo.n
    total = grupos * especial + resto * valor
  }

  return {
    unitario: fromCents(valor),
    bruto: fromCents(bruto),
    total: fromCents(total),
    desconto: fromCents(bruto - total),
  }
}

const euroFmt = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' })
export const formatEuro = (v: number | string | null | undefined) => euroFmt.format(Number(v || 0))

/** Etiqueta curta a partir só do código guardado numa venda. */
export function promoCodeLabel(code: string | null | undefined): string {
  if (code === 'PRECO_ESPECIAL') return 'Preço especial'
  const p = parsePromo(code)
  if (!p) return ''
  if (p.type === 'PACK') return `Pack ${p.n}`
  return promoLabel({ promocao: code })
}

/**
 * Converte texto livre de promoção (como escrito numa folha de cálculo) num código.
 *   "2 por 1", "2x1", "2 pelo preço de 1"     -> LEVE_2_PAGUE_1
 *   "leve 3 pague 2"                           -> LEVE_3_PAGUE_2
 *   "compre 3 leve 1 grátis", "3+1"            -> LEVE_4_PAGUE_3
 *   "3 por 10€", "3 por 10,50"                 -> PACK_3 + preço especial
 *   "LEVE_2_PAGUE_1", "PACK_3"                 -> mantém
 * Devolve undefined se o texto não for reconhecido.
 */
export function normalizePromo(text: unknown): { promocao: string | null; preco_especial?: number } | undefined {
  const raw = String(text ?? '').trim()
  if (!raw) return { promocao: null }
  const s = raw
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ')

  const code = raw.toUpperCase().replace(/\s+/g, '_')
  if (parsePromo(code)) return { promocao: code }

  let m: RegExpMatchArray | null
  // "3 por 10€" / "3 por 10,50 €" (tem euro ou decimais -> pack com preço)
  if ((m = s.match(/^(\d+) ?(?:por|x) ?(\d+(?:[.,]\d+)?) ?(?:€|eur|euros?)$/)) ||
      (m = s.match(/^(\d+) ?por ?(\d+[.,]\d+)$/))) {
    return { promocao: `PACK_${+m[1]}`, preco_especial: Number(m[2].replace(',', '.')) }
  }
  // "2 por 1", "2x1", "2 pelo preco de 1"
  if ((m = s.match(/^(\d+) ?(?:por|x|pelo preco de) ?(\d+)$/))) {
    const leve = +m[1], pague = +m[2]
    if (pague < leve) return { promocao: `LEVE_${leve}_PAGUE_${pague}` }
  }
  // "leve 3 pague 2"
  if ((m = s.match(/leve ?(\d+),? ?pague ?(\d+)/))) {
    const leve = +m[1], pague = +m[2]
    if (pague < leve) return { promocao: `LEVE_${leve}_PAGUE_${pague}` }
  }
  // "compre 3 leve 1 gratis", "compre 3 e leve 1 gratis", "3+1"
  if ((m = s.match(/compre ?(\d+),? ?(?:e )?(?:leve|ganhe|oferta de?) ?(\d+)/)) || (m = s.match(/^(\d+) ?\+ ?(\d+)$/))) {
    const pague = +m[1], gratis = +m[2]
    if (gratis > 0) return { promocao: `LEVE_${pague + gratis}_PAGUE_${pague}` }
  }
  return undefined
}

// ---------------------------------------------------------------------------
// Desconto na venda (dado no carrinho)
//   mode 'valor'   -> valor em € a descontar
//   mode 'percent' -> percentagem sobre o subtotal
//   mode 'total'   -> novo valor final da venda
// ---------------------------------------------------------------------------

/** "12,5" / "12.5" / "12,50 €" -> 12.5 ; vazio/inválido -> null */
export function parseDecimal(raw: unknown): number | null {
  const s = String(raw ?? '').trim().replace(/[^\d,.-]/g, '').replace(',', '.')
  if (!s) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/** Resultado do desconto da venda, em euros. */
export interface SaleDiscount {
  desconto: number
  total: number
  percent: number
  error?: string
}

/** `subtotal` em euros (já com as promoções dos produtos). */
export function saleDiscount(subtotal: number, mode: DiscountMode, rawValue: unknown): SaleDiscount {
  const sub = toCents(subtotal)
  const v = parseDecimal(rawValue)
  const none = { desconto: 0, total: fromCents(sub), percent: 0 }
  if (v == null || sub <= 0) return none
  let d: number
  if (mode === 'percent') {
    if (v < 0 || v > 100) return { ...none, error: 'A percentagem tem de estar entre 0 e 100.' }
    d = Math.round((sub * v) / 100)
  } else if (mode === 'total') {
    const t = toCents(v)
    if (t < 0) return { ...none, error: 'O novo valor não pode ser negativo.' }
    if (t > sub) return { ...none, error: 'O novo valor é maior que o subtotal.' }
    d = sub - t
  } else {
    d = toCents(v)
    if (d < 0) return { ...none, error: 'O desconto não pode ser negativo.' }
    if (d > sub) return { ...none, error: 'O desconto é maior que o subtotal.' }
  }
  return { desconto: fromCents(d), total: fromCents(sub - d), percent: Math.round((d / sub) * 1000) / 10 }
}

/**
 * Reparte um desconto (em €) pelas linhas, proporcional ao valor de cada uma,
 * de forma a que a soma bata certo ao cêntimo. Devolve a parte de cada linha em €.
 */
export function allocateDiscount(lineTotals: number[], desconto: number): number[] {
  const cents = lineTotals.map(toCents)
  const sum = cents.reduce((a, b) => a + b, 0)
  const d = Math.min(toCents(desconto), sum)
  if (!d || !sum) return cents.map(() => 0)
  const raw = cents.map((c) => (c * d) / sum)
  const parts = raw.map(Math.floor)
  let rest = d - parts.reduce((a, b) => a + b, 0)
  raw.map((r, i): [number, number] => [r - Math.floor(r), i]).sort((a, b) => b[0] - a[0])
    .forEach(([, i]) => { if (rest > 0 && parts[i] < cents[i]) { parts[i]++; rest-- } })
  return parts.map(fromCents)
}

// ---------------------------------------------------------------------------
// Carrinho inteiro: as promoções contam o produto (mesmo nome + mesma promoção),
// juntando tamanhos e cores — ex.: Olga 2XL + Olga 3XL em "2 por 1".
// ---------------------------------------------------------------------------

/** Uma linha do carrinho para o cálculo de preços. */
export interface CartItem extends PriceInput {
  nome: string
  quantidade: number
}

/** nome sem acentos nem maiúsculas: "Camiseta Olga" e "camiseta olga" são o mesmo produto */
const chaveNome = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/** reparte `total` cêntimos proporcionalmente aos pesos (a soma bate certo) */
function splitCents(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0)
  const raw = weights.map((w) => (sum ? (total * w) / sum : total / weights.length))
  const parts = raw.map(Math.floor)
  let rest = total - parts.reduce((a, b) => a + b, 0)
  raw.map((r, i): [number, number] => [r - Math.floor(r), i]).sort((a, b) => b[0] - a[0])
    .forEach(([, i]) => { if (rest > 0) { parts[i]++; rest-- } })
  return parts
}

/**
 * Preço de cada linha do carrinho (mesma ordem que `items`).
 * Linhas com o mesmo nome e a mesma promoção formam um grupo:
 *  - "Leve N, pague M": por cada N unidades do grupo, N−M ficam grátis — as mais baratas;
 *  - "Pack N": cada N unidades custam o preço especial — os packs formam-se com as mais caras.
 * Sem promoção (ou pack sem preço especial) calcula-se linha a linha, como em `priceLine`.
 */
export function priceCart(items: CartItem[]): LinePrice[] {
  const out = items.map((it) => priceLine(it, it.quantidade))
  const groups = new Map<string, number[]>()
  items.forEach((it, i) => {
    const promo = parsePromo(it.promocao)
    const hasEspecial = it.preco_especial != null && it.preco_especial !== ''
    if (!promo || (promo.type === 'PACK' && !hasEspecial)) return
    const key = `${chaveNome(it.nome)}|${String(it.promocao).trim().toUpperCase()}|${hasEspecial ? toCents(it.preco_especial) : ''}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(i)
  })

  for (const idxs of groups.values()) {
    const promo = parsePromo(items[idxs[0]].promocao)!
    // uma entrada por unidade: [linha, preço em cêntimos]
    const units = idxs.flatMap((i) =>
      Array.from({ length: Math.max(0, Math.floor(Number(items[i].quantidade) || 0)) }, (): [number, number] => [i, toCents(items[i].valor)]))
    const desc = new Map<number, number>(idxs.map((i) => [i, 0])) // desconto por linha, em cêntimos
    if (promo.type === 'LEVE') {
      const livres = Math.floor(units.length / promo.leve) * (promo.leve - promo.pague)
      // as mais baratas primeiro (empate: a linha mais abaixo no carrinho)
      units.sort((a, b) => a[1] - b[1] || b[0] - a[0])
      units.slice(0, livres).forEach(([i, c]) => desc.set(i, desc.get(i)! + c))
    } else {
      const especial = toCents(items[idxs[0]].preco_especial)
      // as mais caras primeiro (empate: a linha mais acima)
      units.sort((a, b) => b[1] - a[1] || a[0] - b[0])
      for (let k = 0; k + promo.n <= units.length; k += promo.n) {
        const pack = units.slice(k, k + promo.n)
        const shares = splitCents(especial, pack.map(([, c]) => c))
        pack.forEach(([i, c], j) => desc.set(i, desc.get(i)! + c - shares[j]))
      }
    }
    for (const i of idxs) {
      const q = Math.max(0, Math.floor(Number(items[i].quantidade) || 0))
      const bruto = toCents(items[i].valor) * q
      out[i] = { unitario: fromCents(toCents(items[i].valor)), bruto: fromCents(bruto), total: fromCents(bruto - desc.get(i)!), desconto: fromCents(desc.get(i)!) }
    }
  }
  return out
}
