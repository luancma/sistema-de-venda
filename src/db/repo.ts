import { db, write, uuid, normalizeProduct, normalizeTransaction } from './database.ts'
import { priceLine, saleDiscount, allocateDiscount, formatEuro } from '../lib/pricing.ts'
import { parseCategorias, joinCategorias, replaceCategoria, countCategorias } from '../lib/categorias.ts'
import { stockIlimitado, faltaStock } from '../lib/stock.ts'
import type { SaleDiscount } from '../lib/pricing.ts'
import type { DiscountMode, Product, Transaction } from '../types.ts'

/** O que se pode gravar como produto (do formulário ou do CSV): números podem vir como texto. */
export interface ProductInput {
  id?: string
  nome: string
  qtd: number | string
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
const sameText = (a: unknown, b: unknown) => String(a).toLowerCase() === String(b).toLowerCase()
// cópias: quem lê não altera os dados guardados por engano
const copy = <T extends object>(rows: T[]): T[] => rows.map((r) => ({ ...r }))

// ================= Produtos =================
export const listProducts = (): Product[] =>
  copy(db().products).sort((a, b) => cmp(a.nome, b.nome) || cmp(a.tamanho, b.tamanho))

const findProduct = (id: string | null) => db().products.find((p) => p.id === id) ?? null

const nullable = <T>(v: T | '' | undefined): T | null => (v === '' || v === undefined ? null : v)
const cats = (v: unknown) => joinCategorias(Array.isArray(v) ? v : parseCategorias(v))

const productFields = (p: ProductInput) => ({
  nome: p.nome.trim(),
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
  qtd?: number
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
        qtd: ch.qtd ?? p.qtd,
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

/**
 * Importa produtos do CSV.
 *  mode 'replace' -> apaga todos os produtos e cria de novo (as vendas mantêm-se)
 *  mode 'merge'   -> produto com o mesmo NOME+TAMANHO é atualizado (qtd, valor e,
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
        s.products.find((e) => sameText(e.nome, p.nome) && sameText(e.tamanho, p.tamanho || ''))
      if (existing) {
        const c = cats(p.categorias)
        Object.assign(existing, normalizeProduct({
          ...existing,
          qtd: p.qtd,
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

    // 1) preços de cada linha (com as promoções dos produtos)
    const lines = items.map(({ productId, quantidade }) => {
      const p = findProduct(productId)
      if (!p) throw new Error('Produto já não existe na base de dados.')
      if (faltaStock(p, quantidade)) {
        if (!allowNegative) throw new Error(`Stock insuficiente: ${p.nome} ${p.tamanho} (restam ${p.qtd}).`)
        if (!observacao.trim()) throw new Error('Vender sem stock exige uma observação.')
      }
      return { p, quantidade, price: priceLine(p, quantidade) }
    })

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
        id: uuid(), venda_id: vendaId, data, produto_id: p.id, nome_produto: p.nome, tamanho: p.tamanho,
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
