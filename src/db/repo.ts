import { db, write, uuid, normalizeProduct, normalizeTransaction } from './database.ts'
import { priceCart, saleDiscount, allocateDiscount, formatEuro } from '../lib/pricing.ts'
import { parseCategorias, joinCategorias, replaceCategoria, countCategorias } from '../lib/categorias.ts'
import { stockIlimitado, faltaStock } from '../lib/stock.ts'
import { normTamanho, compareSizes, rotuloArtigo } from '../lib/pieces.ts'
import type { SaleDiscount } from '../lib/pricing.ts'
import type { DiscountMode, Product, Transaction } from '../types.ts'

/** O que se pode gravar como produto (do formulário ou do CSV): números podem vir como texto. */
export interface ProductInput {
  id?: string
  sku?: string
  sku_pai?: string
  nome: string
  cor?: string
  qtd?: number | string
  tamanho?: string
  valor: number | string | null
  promocao?: string | null
  preco_especial?: number | string | null
  categorias?: string | string[] | null
  sem_limite?: boolean
  caixa_destino?: string
}

export interface SaleInput {
  items: { productId: string; quantidade: number }[]
  nome?: string
  nucleo: string
  responsavel?: string
  atividade?: string
  observacao?: string
  /** vender acima do stock (exige observação) */
  allowNegative?: boolean
  /** desconto dado no carrinho */
  desconto?: { mode: DiscountMode; value: string | number } | null
}

// ordem alfabética sem distinguir maiúsculas/minúsculas (como o antigo COLLATE NOCASE)
const cmp = (a: unknown, b: unknown) => String(a).localeCompare(String(b), 'pt', { sensitivity: 'base' })
// cópias: quem lê não altera os dados guardados por engano
const copy = <T extends object>(rows: T[]): T[] => rows.map((r) => ({ ...r }))

// ================= Produtos =================
export const listProducts = (): Product[] =>
  copy(db().products).sort((a, b) => cmp(a.nome, b.nome) || cmp(a.tamanho, b.tamanho))

const findProduct = (id: string | null) => db().products.find((p) => p.id === id) ?? null

const nullable = <T>(v: T | '' | undefined): T | null => (v === '' || v === undefined ? null : v)
const cats = (v: unknown) => joinCategorias(Array.isArray(v) ? v : parseCategorias(v))

const productFields = (p: ProductInput) => ({
  // SKUs sempre em maiúsculas: "cam-olg-s" e "CAM-OLG-S" são o mesmo artigo
  sku: (p.sku || '').trim().toUpperCase(),
  sku_pai: (p.sku_pai || '').trim().toUpperCase(),
  nome: p.nome.trim(),
  cor: (p.cor || '').trim(),
  qtd: Number(p.qtd) || 0,
  tamanho: (p.tamanho || '').trim(),
  valor: Number(p.valor) || 0,
  promocao: nullable(p.promocao),
  preco_especial: nullable(p.preco_especial),
  categorias: cats(p.categorias),
  sem_limite: Boolean(p.sem_limite),
  caixa_destino: (p.caixa_destino || '').trim(),
})

function insertProduct(p: ProductInput): string {
  const product = normalizeProduct({ id: p.id || uuid(), ...productFields(p) })
  db().products.push(product)
  return product.id
}

export const saveProduct = (p: ProductInput) =>
  write(() => {
    if (!p.id) return insertProduct(p)
    const existing = findProduct(p.id)
    if (existing) Object.assign(existing, normalizeProduct({ id: p.id, ...productFields(p) }))
    return p.id
  })

export const deleteProduct = (id: string) =>
  write((s) => {
    s.products = s.products.filter((p) => p.id !== id)
  })

/** Alterações em lote: só os campos definidos mudam; categorias juntam-se/tiram-se às de cada produto. */
export interface ProductBatch {
  valor?: number
  caixa_destino?: string
  promocao?: string | null
  sem_limite?: boolean
  addCategorias?: string[]
  removeCategorias?: string[]
}

/** Aplica as mesmas alterações a vários produtos. @returns nº de produtos alterados */
export const updateProducts = (ids: string[], ch: ProductBatch) =>
  write((s) => {
    const sel = new Set(ids)
    let n = 0
    for (const p of s.products) {
      if (!sel.has(p.id)) continue
      const remove = new Set(ch.removeCategorias ?? [])
      const categorias = [...parseCategorias(p.categorias).filter((c) => !remove.has(c)), ...(ch.addCategorias ?? [])]
      Object.assign(p, normalizeProduct({
        ...p,
        valor: ch.valor ?? p.valor,
        caixa_destino: ch.caixa_destino ?? p.caixa_destino,
        promocao: ch.promocao !== undefined ? ch.promocao : p.promocao,
        sem_limite: ch.sem_limite ?? p.sem_limite,
        categorias: cats(categorias),
      }))
      n++
    }
    return n
  })

/** Apaga vários produtos (as vendas já feitas não são afetadas). @returns nº de produtos apagados */
export const deleteProducts = (ids: string[]) =>
  write((s) => {
    const sel = new Set(ids)
    const before = s.products.length
    s.products = s.products.filter((p) => !sel.has(p.id))
    return before - s.products.length
  })

// ================= Peças (um SKU_PAI com os seus tamanhos) =================
/** Uma peça e os seus tamanhos, como vêm do formulário de peça. */
export interface PieceInput {
  sku_pai: string
  nome: string
  cor: string
  valor: number
  /** promoção, preço especial e caixa: undefined = cada tamanho mantém o seu (os tamanhos novos ficam com os do 1.º) */
  preco_especial?: number | null
  promocao?: string | null
  categorias: string[]
  caixa_destino?: string
  /** `id` = tamanho já existente; `valor` = preço próprio deste tamanho (senão o da peça) */
  variants: { id?: string; sku: string; tamanho: string; qtd: number; sem_limite: boolean; valor?: number }[]
}

/**
 * Grava uma peça inteira numa só transação: atualiza os tamanhos existentes, cria os novos e,
 * ao editar (`originalSkuPai`), apaga os tamanhos da peça que já não vêm. Os SKUs têm de ser únicos.
 */
export const savePiece = (piece: PieceInput, originalSkuPai?: string) =>
  write((s) => {
    const skuPai = piece.sku_pai.trim().toUpperCase()
    const antigos = originalSkuPai ? s.products.filter((p) => p.sku_pai === originalSkuPai.toUpperCase()) : []
    // só os tamanhos desta peça contam como existentes (um id de outra peça é ignorado: nunca a move para aqui)
    const ids = new Set(piece.variants.map((v) => v.id).filter((id) => antigos.some((p) => p.id === id)))
    // os SKUs de fora desta peça (os tamanhos que vão ser apagados também deixam de contar)
    const outros = new Set(s.products.filter((p) => !antigos.includes(p)).map((p) => p.sku))
    // o SKU da peça também não pode ser de outra peça (senão os tamanhos das duas misturavam-se)
    if (s.products.some((p) => !antigos.includes(p) && p.sku_pai === skuPai)) {
      throw new Error(`SKU da peça repetido: ${skuPai}`)
    }
    const vistos = new Set<string>()
    for (const v of piece.variants) {
      const sku = v.sku.trim().toUpperCase()
      if (!sku) throw new Error('Falta o SKU de um tamanho.')
      if (vistos.has(sku) || outros.has(sku)) throw new Error(`SKU repetido: ${sku}`)
      vistos.add(sku)
    }
    s.products = s.products.filter((p) => !antigos.includes(p) || ids.has(p.id))
    const primeiro = [...antigos].sort((a, b) => compareSizes(a.tamanho, b.tamanho))[0]
    for (const v of piece.variants) {
      const existing = v.id && ids.has(v.id) ? findProduct(v.id) : null
      const ref = existing ?? primeiro // de onde vêm os valores "a manter"
      const fields = productFields({
        sku: v.sku, sku_pai: piece.sku_pai, nome: piece.nome, cor: piece.cor, tamanho: normTamanho(v.tamanho),
        qtd: v.qtd, sem_limite: v.sem_limite, valor: v.valor ?? piece.valor,
        preco_especial: piece.preco_especial !== undefined ? piece.preco_especial : ref?.preco_especial ?? null,
        promocao: piece.promocao !== undefined ? piece.promocao : ref?.promocao ?? null,
        categorias: piece.categorias,
        caixa_destino: piece.caixa_destino !== undefined ? piece.caixa_destino : ref?.caixa_destino ?? '',
      })
      if (!fields.caixa_destino) throw new Error('Falta a caixa de destino.') // obrigatória (desfaz tudo)
      if (existing) Object.assign(existing, normalizeProduct({ id: existing.id, ...fields }))
      else s.products.push(normalizeProduct({ id: uuid(), ...fields }))
    }
  })

/** Apaga todos os tamanhos de uma peça (as vendas já feitas não mudam). @returns quantos artigos */
export const deletePiece = (skuPai: string) =>
  write((s) => {
    const antes = s.products.length
    s.products = s.products.filter((p) => p.sku_pai !== skuPai)
    return antes - s.products.length
  })

/**
 * Importa produtos do CSV.
 *  mode 'replace' -> apaga todos os produtos e cria de novo (as vendas mantêm-se)
 *  mode 'merge'   -> produto com o mesmo SKU_FILHO é atualizado (qtd, valor e,
 *                    se vierem no CSV, promoção/preço especial); os restantes são criados
 */
export const importProducts = (products: ProductInput[], mode: 'replace' | 'merge' = 'replace') =>
  write((s) => {
    let created = 0
    let updated = 0
    if (mode === 'replace') s.products = []
    for (const p of products) {
      const existing =
        mode === 'merge' &&
        s.products.find((e) => e.sku === (p.sku || '').trim()) // o SKU_FILHO identifica o artigo
      if (existing) {
        const c = cats(p.categorias)
        Object.assign(existing, normalizeProduct({
          ...existing,
          // com o SKU como identidade, a folha manda no nome, cor, peça e tamanho
          sku_pai: p.sku_pai ?? existing.sku_pai,
          nome: p.nome,
          cor: p.cor ?? existing.cor,
          tamanho: p.tamanho ?? existing.tamanho,
          qtd: p.qtd ?? existing.qtd,
          valor: p.valor,
          promocao: p.promocao ?? existing.promocao,
          preco_especial: p.preco_especial ?? existing.preco_especial,
          categorias: c ?? existing.categorias,
          sem_limite: p.sem_limite ?? existing.sem_limite, // só muda se o CSV tiver a coluna
          caixa_destino: p.caixa_destino ?? existing.caixa_destino, // idem
        }))
        updated++
      } else {
        insertProduct(p)
        created++
      }
    }
    return { created, updated }
  })

// ================= Núcleos =================
export const listNucleos = () => [...db().nucleos].sort(cmp)
export const addNucleo = (nome: string) =>
  write((s) => {
    const n = nome.trim()
    if (n && !s.nucleos.includes(n)) s.nucleos.push(n)
  })
export const deleteNucleo = (nome: string) =>
  write((s) => {
    s.nucleos = s.nucleos.filter((n) => n !== nome)
  })

/** Nº de vendas (carrinhos) de cada núcleo: { nome: n } */
export function countNucleoVendas(): Record<string, number> {
  const vendas: Record<string, Set<string>> = {}
  for (const t of db().transactions) (vendas[t.nucleo] ??= new Set()).add(t.venda_id)
  return Object.fromEntries(Object.entries(vendas).map(([n, set]) => [n, set.size]))
}

/**
 * Renomeia um núcleo e as vendas já feitas com ele. Se `to` já existir, os dois ficam juntos.
 * @returns nº de vendas atualizadas
 */
export const renameNucleo = (from: string, to: string) =>
  write((s) => {
    const target = to.trim()
    if (!target || target === from) return 0
    s.nucleos = s.nucleos.filter((n) => n !== from)
    if (!s.nucleos.includes(target)) s.nucleos.push(target)
    const vendas = new Set<string>()
    for (const t of s.transactions) {
      if (t.nucleo !== from) continue
      t.nucleo = target
      vendas.add(t.venda_id)
    }
    return vendas.size
  })

// ================= Vendas =================
/** Texto que descreve o desconto dado no carrinho (vai para o CSV). */
export function describeDiscount(mode: DiscountMode, d: SaleDiscount): string {
  if (!d.desconto) return ''
  if (mode === 'percent') return `${d.percent}%`
  if (mode === 'total') return `novo total ${formatEuro(d.total)}`
  return `-${formatEuro(d.desconto)}`
}

/**
 * Regista uma venda (um carrinho). Cria uma linha em `transactions` por produto e desconta o stock.
 * Falha se algum produto não tiver stock suficiente (a menos que allowNegative = true).
 * Produtos "sem limite" não são verificados nem descontados.
 * `desconto` (opcional): { mode: 'valor' | 'percent' | 'total', value } — desconto dado no carrinho,
 * repartido pelas linhas proporcionalmente ao valor de cada uma (a soma bate certo ao cêntimo).
 */
export const registerSale = ({ items, nome, nucleo, responsavel, atividade = '', observacao = '', allowNegative = false, desconto = null }: SaleInput) =>
  write((s) => {
    const vendaId = uuid()
    const data = new Date().toISOString()

    // 1) preços de cada linha (com as promoções, que contam o produto inteiro)
    const found = items.map(({ productId, quantidade }) => {
      const p = findProduct(productId)
      if (!p) throw new Error('Produto já não existe na base de dados.')
      if (faltaStock(p, quantidade)) {
        if (!allowNegative) throw new Error(`Stock insuficiente: ${rotuloArtigo(p)} (restam ${p.qtd}).`)
        if (!observacao.trim()) throw new Error('Vender sem stock exige uma observação.')
      }
      return { p, quantidade }
    })
    const prices = priceCart(found.map(({ p, quantidade }) => ({ ...p, quantidade })))
    const lines = found.map((l, i) => ({ ...l, price: prices[i] }))

    // 2) desconto da venda
    const subtotal = lines.reduce((sum, l) => sum + l.price.total, 0)
    const d: SaleDiscount = desconto ? saleDiscount(subtotal, desconto.mode, desconto.value) : { desconto: 0, total: subtotal, percent: 0 }
    if (d.error) throw new Error(d.error)
    const shares = allocateDiscount(lines.map((l) => l.price.total), d.desconto)
    const info = desconto ? describeDiscount(desconto.mode, d) : ''

    // 3) gravar
    let total = 0
    lines.forEach(({ p, quantidade, price }, i) => {
      const preco = Math.round((price.total - shares[i]) * 100) / 100
      s.transactions.push(normalizeTransaction({
        id: uuid(), venda_id: vendaId, data, produto_id: p.id, sku: p.sku, sku_pai: p.sku_pai, nome_produto: p.nome, cor: p.cor, tamanho: p.tamanho,
        quantidade, preco_unitario: price.unitario, desconto: price.desconto, preco,
        promocao: p.promocao || (p.preco_especial != null ? 'PRECO_ESPECIAL' : null),
        nome: (nome || '').trim(), nucleo: nucleo || '', responsavel: (responsavel || '').trim(),
        observacao: observacao.trim(), desconto_venda: shares[i], desconto_info: info, atividade: (atividade || '').trim(),
        caixa_destino: p.caixa_destino,
      }))
      if (!stockIlimitado(p)) p.qtd -= quantidade
      total += preco
    })
    return { vendaId, total: Math.round(total * 100) / 100, desconto: d.desconto }
  })

/** Anula uma venda inteira e devolve as quantidades ao stock. */
export const cancelSale = (vendaId: string) =>
  write((s) => {
    for (const l of s.transactions) {
      if (l.venda_id !== vendaId) continue
      const p = findProduct(l.produto_id)
      if (p && !stockIlimitado(p)) p.qtd += l.quantidade
    }
    s.transactions = s.transactions.filter((t) => t.venda_id !== vendaId)
  })

/** Vendas entre duas datas locais (YYYY-MM-DD, inclusive), mais recentes primeiro. */
export function listTransactions(fromDate: string, toDate: string): Transaction[] {
  const from = new Date(`${fromDate}T00:00:00`).toISOString()
  const to = new Date(`${toDate}T23:59:59.999`).toISOString()
  return copy(db().transactions.filter((t) => t.data >= from && t.data <= to))
    .sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : cmp(a.nome_produto, b.nome_produto)))
}

const distinct = (field: 'responsavel' | 'atividade'): string[] =>
  [...new Set(db().transactions.map((t) => t[field]).filter(Boolean))].sort(cmp)


/** Atividades já usadas (para sugerir no campo do topo). */
export const listAtividades = () => distinct('atividade')

// ================= Categorias =================
/**
 * Todas as categorias — as criadas nas Configurações e as usadas nos produtos —
 * com o nº de produtos de cada uma: [[nome, n], …] por ordem alfabética.
 */
export function listCategorias(): [string, number][] {
  const counts = new Map(countCategorias(db().products))
  for (const c of db().categorias) if (!counts.has(c)) counts.set(c, 0)
  return [...counts.entries()].sort((a, b) => cmp(a[0], b[0]))
}

/** Cria categorias (aceita várias: "CAMISETA, OLGA"). @returns as que foram criadas */
export const addCategorias = (raw: string) =>
  write((s) => {
    const novas = parseCategorias(raw).filter((c) => !s.categorias.includes(c))
    s.categorias.push(...novas)
    return novas
  })

/**
 * Renomeia uma categoria em todos os produtos. Se `to` já existir, as duas ficam juntas (sem repetidos).
 * Com `to` vazio remove a categoria (da lista e dos produtos; os produtos não são apagados).
 * @returns nº de produtos alterados
 */
export const renameCategoria = (from: string, to: string) =>
  write((s) => {
    const target = parseCategorias(to)[0] || ''
    s.categorias = s.categorias.filter((c) => c !== from)
    if (target && !s.categorias.includes(target)) s.categorias.push(target)
    let n = 0
    for (const p of s.products) {
      const list = parseCategorias(p.categorias)
      if (!list.includes(from)) continue
      p.categorias = joinCategorias(replaceCategoria(list, from, target))
      n++
    }
    return n
  })
export const removeCategoria = (name: string) => renameCategoria(name, '')

// ================= Apagar dados (Configurações) =================
/** 'vendas' apaga só as vendas (o stock não é reposto); 'tudo' apaga produtos, vendas e núcleos. */
export const wipeData = (what: 'vendas' | 'tudo') =>
  write((s) => {
    s.transactions = []
    if (what === 'tudo') { s.products = []; s.nucleos = []; s.categorias = [] }
  })

/** IDs de todos os produtos (para limpar do carrinho os que já não existem). */
export const listProductIds = () => new Set(db().products.map((p) => p.id))
