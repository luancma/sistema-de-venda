// Motor de promoções.
//
// O campo `promocao` de um produto é um código em texto:
//   null / ''              -> sem promoção (usa preco_especial como preço unitário, se existir)
//   'LEVE_<N>_PAGUE_<M>'   -> por cada N unidades paga só M  (ex.: 2 por 1 = LEVE_2_PAGUE_1,
//                             "compre 3 e leve 1 grátis" = LEVE_4_PAGUE_3)
//   'PACK_<N>'             -> cada N unidades custam `preco_especial` (ex.: 3 por 10 €)
//
// Todos os cálculos são feitos em cêntimos para evitar erros de vírgula flutuante.

export const toCents = (euros) => Math.round(Number(euros || 0) * 100)
export const fromCents = (cents) => Math.round(cents) / 100

export const PROMO_PRESETS = [
  { code: '', label: 'Sem promoção' },
  { code: 'LEVE_2_PAGUE_1', label: '2 por 1' },
  { code: 'LEVE_3_PAGUE_2', label: 'Leve 3, pague 2' },
  { code: 'LEVE_4_PAGUE_3', label: 'Compre 3, leve 1 grátis' },
  { code: 'LEVE_N_PAGUE_M', label: 'Leve N, pague M (personalizado)' },
  { code: 'PACK_N', label: 'Pack: N unidades por preço especial' },
]

export function parsePromo(code) {
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

export function promoLabel(product) {
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

/**
 * Calcula o preço de uma linha (produto × quantidade) aplicando a promoção.
 * @returns {{ bruto:number, total:number, desconto:number, unitario:number }} valores em euros
 */
export function priceLine(product, quantidade) {
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
export const formatEuro = (v) => euroFmt.format(Number(v || 0))

/** Etiqueta curta a partir só do código guardado numa venda. */
export function promoCodeLabel(code) {
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
 * @returns {{ promocao: string|null, preco_especial?: number } | undefined}
 *          undefined = texto não reconhecido
 */
export function normalizePromo(text) {
  const raw = String(text ?? '').trim()
  if (!raw) return { promocao: null }
  const s = raw
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ')

  const code = raw.toUpperCase().replace(/\s+/g, '_')
  if (parsePromo(code)) return { promocao: code }

  let m
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
export function parseDecimal(raw) {
  const s = String(raw ?? '').trim().replace(/[^\d,.-]/g, '').replace(',', '.')
  if (!s) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/**
 * @param {number} subtotal em euros (já com as promoções dos produtos)
 * @returns {{ desconto:number, total:number, percent:number, error?:string }} em euros
 */
export function saleDiscount(subtotal, mode, rawValue) {
  const sub = toCents(subtotal)
  const v = parseDecimal(rawValue)
  const none = { desconto: 0, total: fromCents(sub), percent: 0 }
  if (v == null || sub <= 0) return none
  let d
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
export function allocateDiscount(lineTotals, desconto) {
  const cents = lineTotals.map(toCents)
  const sum = cents.reduce((a, b) => a + b, 0)
  const d = Math.min(toCents(desconto), sum)
  if (!d || !sum) return cents.map(() => 0)
  const raw = cents.map((c) => (c * d) / sum)
  const parts = raw.map(Math.floor)
  let rest = d - parts.reduce((a, b) => a + b, 0)
  raw.map((r, i) => [r - Math.floor(r), i]).sort((a, b) => b[0] - a[0])
    .forEach(([, i]) => { if (rest > 0 && parts[i] < cents[i]) { parts[i]++; rest-- } })
  return parts.map(fromCents)
}
