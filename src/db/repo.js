import { db, write, uuid, normalizeProduct, normalizeTransaction } from './database.js'
import { priceLine, saleDiscount, allocateDiscount, formatEuro } from '../lib/pricing.js'
import { parseCategorias, joinCategorias, replaceCategoria, countCategorias } from '../lib/categorias.js'
import { stockIlimitado, faltaStock } from '../lib/stock.js'

// ordem alfabética sem distinguir maiúsculas/minúsculas (como o antigo COLLATE NOCASE)
const cmp = (a, b) => String(a).localeCompare(String(b), 'pt', { sensitivity: 'base' })
const sameText = (a, b) => String(a).toLowerCase() === String(b).toLowerCase()
// cópias: quem lê não altera os dados guardados por engano
const copy = (rows) => rows.map((r) => ({ ...r }))

// ================= Produtos =================
export const listProducts = () =>
  copy(db().products).sort((a, b) => cmp(a.nome, b.nome) || cmp(a.tamanho, b.tamanho))

const findProduct = (id) => db().products.find((p) => p.id === id) ?? null
export const getProduct = (id) => {
  const p = findProduct(id)
  return p ? { ...p } : null
}

const nullable = (v) => (v === '' || v === undefined ? null : v)
const cats = (v) => joinCategorias(Array.isArray(v) ? v : parseCategorias(v))

const productFields = (p) => ({
  nome: p.nome.trim(),
  qtd: Number(p.qtd) || 0,
  tamanho: (p.tamanho || '').trim(),
  valor: Number(p.valor) || 0,
  promocao: nullable(p.promocao),
  preco_especial: nullable(p.preco_especial),
  categorias: cats(p.categorias),
  sem_limite: Boolean(p.sem_limite),
})

function insertProduct(p) {
  const product = normalizeProduct({ id: p.id || uuid(), ...productFields(p) })
  db().products.push(product)
  return product.id
}

export const saveProduct = (p) =>
  write(() => {
    if (!p.id) return insertProduct(p)
    const existing = findProduct(p.id)
    if (existing) Object.assign(existing, normalizeProduct({ id: p.id, ...productFields(p) }))
    return p.id
  })

export const deleteProduct = (id) =>
  write((s) => {
    s.products = s.products.filter((p) => p.id !== id)
  })

/**
 * Importa produtos do CSV.
 *  mode 'replace' -> apaga todos os produtos e cria de novo (as vendas mantêm-se)
 *  mode 'merge'   -> produto com o mesmo NOME+TAMANHO é atualizado (qtd, valor e,
 *                    se vierem no CSV, promoção/preço especial); os restantes são criados
 */
export const importProducts = (products, mode = 'replace') =>
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
export const addNucleo = (nome) =>
  write((s) => {
    const n = nome.trim()
    if (n && !s.nucleos.includes(n)) s.nucleos.push(n)
  })
export const deleteNucleo = (nome) =>
  write((s) => {
    s.nucleos = s.nucleos.filter((n) => n !== nome)
  })

/** Nº de vendas (carrinhos) de cada núcleo: { nome: n } */
export function countNucleoVendas() {
  const vendas = {}
  for (const t of db().transactions) (vendas[t.nucleo] ??= new Set()).add(t.venda_id)
  return Object.fromEntries(Object.entries(vendas).map(([n, set]) => [n, set.size]))
}

/**
 * Renomeia um núcleo e as vendas já feitas com ele. Se `to` já existir, os dois ficam juntos.
 * @returns nº de vendas atualizadas
 */
export const renameNucleo = (from, to) =>
  write((s) => {
    const target = to.trim()
    if (!target || target === from) return 0
    s.nucleos = s.nucleos.filter((n) => n !== from)
    if (!s.nucleos.includes(target)) s.nucleos.push(target)
    const vendas = new Set()
    for (const t of s.transactions) {
      if (t.nucleo !== from) continue
      t.nucleo = target
      vendas.add(t.venda_id)
    }
    return vendas.size
  })

// ================= Vendas =================
/** Texto que descreve o desconto dado no carrinho (vai para o CSV). */
export function describeDiscount(mode, value, d) {
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
export const registerSale = ({ items, nome, nucleo, vendedor, atividade = '', observacao = '', allowNegative = false, desconto = null }) =>
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
    const d = desconto ? saleDiscount(subtotal, desconto.mode, desconto.value) : { desconto: 0 }
    if (d.error) throw new Error(d.error)
    const shares = allocateDiscount(lines.map((l) => l.price.total), d.desconto)
    const info = desconto ? describeDiscount(desconto.mode, desconto.value, d) : ''

    // 3) gravar
    let total = 0
    lines.forEach(({ p, quantidade, price }, i) => {
      const preco = Math.round((price.total - shares[i]) * 100) / 100
      s.transactions.push(normalizeTransaction({
        id: uuid(), venda_id: vendaId, data, produto_id: p.id, nome_produto: p.nome, tamanho: p.tamanho,
        quantidade, preco_unitario: price.unitario, desconto: price.desconto, preco,
        promocao: p.promocao || (p.preco_especial != null ? 'PRECO_ESPECIAL' : null),
        nome: (nome || '').trim(), nucleo: nucleo || '', vendedor: (vendedor || '').trim(),
        observacao: observacao.trim(), desconto_venda: shares[i], desconto_info: info, atividade: (atividade || '').trim(),
      }))
      if (!stockIlimitado(p)) p.qtd -= quantidade
      total += preco
    })
    return { vendaId, total: Math.round(total * 100) / 100, desconto: d.desconto }
  })

/** Anula uma venda inteira e devolve as quantidades ao stock. */
export const cancelSale = (vendaId) =>
  write((s) => {
    for (const l of s.transactions) {
      if (l.venda_id !== vendaId) continue
      const p = findProduct(l.produto_id)
      if (p && !stockIlimitado(p)) p.qtd += l.quantidade
    }
    s.transactions = s.transactions.filter((t) => t.venda_id !== vendaId)
  })

/** Vendas entre duas datas locais (YYYY-MM-DD, inclusive), mais recentes primeiro. */
export function listTransactions(fromDate, toDate) {
  const from = new Date(`${fromDate}T00:00:00`).toISOString()
  const to = new Date(`${toDate}T23:59:59.999`).toISOString()
  return copy(db().transactions.filter((t) => t.data >= from && t.data <= to))
    .sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : cmp(a.nome_produto, b.nome_produto)))
}

const distinct = (field) =>
  [...new Set(db().transactions.map((t) => t[field]).filter(Boolean))].sort(cmp)

export const listSellers = () => distinct('vendedor')

/** Atividades já usadas (para sugerir no campo do topo). */
export const listAtividades = () => distinct('atividade')

// ================= Categorias =================
/**
 * Todas as categorias — as criadas nas Configurações e as usadas nos produtos —
 * com o nº de produtos de cada uma: [[nome, n], …] por ordem alfabética.
 */
export function listCategorias() {
  const counts = new Map(countCategorias(db().products))
  for (const c of db().categorias) if (!counts.has(c)) counts.set(c, 0)
  return [...counts.entries()].sort((a, b) => cmp(a[0], b[0]))
}

/** Cria categorias (aceita várias: "CAMISETA, OLGA"). @returns as que foram criadas */
export const addCategorias = (raw) =>
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
export const renameCategoria = (from, to) =>
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
export const removeCategoria = (name) => renameCategoria(name, '')

// ================= Apagar dados (Configurações) =================
/** 'vendas' apaga só as vendas (o stock não é reposto); 'tudo' apaga produtos, vendas e núcleos. */
export const wipeData = (what) =>
  write((s) => {
    s.transactions = []
    if (what === 'tudo') { s.products = []; s.nucleos = []; s.categorias = [] }
  })

/** IDs de todos os produtos (para limpar do carrinho os que já não existem). */
export const listProductIds = () => new Set(db().products.map((p) => p.id))
