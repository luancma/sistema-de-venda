import { all, get, run, write, uuid } from './database.js'
import { priceLine, saleDiscount, allocateDiscount, formatEuro } from '../lib/pricing.js'
import { parseCategorias, joinCategorias } from '../lib/categorias.js'

// ================= Produtos =================
export const listProducts = () =>
  all('SELECT * FROM products ORDER BY nome COLLATE NOCASE, tamanho COLLATE NOCASE')

export const getProduct = (id) => get('SELECT * FROM products WHERE id = ?', [id])

const nullable = (v) => (v === '' || v === undefined ? null : v)
const cats = (v) => joinCategorias(Array.isArray(v) ? v : parseCategorias(v))

function insertProduct(p) {
  const id = p.id || uuid()
  run(
    `INSERT INTO products (id, nome, qtd, tamanho, valor, promocao, preco_especial, categorias)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, p.nome.trim(), Number(p.qtd) || 0, (p.tamanho || '').trim(), Number(p.valor) || 0,
      nullable(p.promocao), nullable(p.preco_especial), cats(p.categorias)],
  )
  return id
}

export const saveProduct = (p) =>
  write(() => {
    if (!p.id) return insertProduct(p)
    run(
      `UPDATE products SET nome=?, qtd=?, tamanho=?, valor=?, promocao=?, preco_especial=?, categorias=? WHERE id=?`,
      [p.nome.trim(), Number(p.qtd) || 0, (p.tamanho || '').trim(), Number(p.valor) || 0,
        nullable(p.promocao), nullable(p.preco_especial), cats(p.categorias), p.id],
    )
    return p.id
  })

export const deleteProduct = (id) => write(() => run('DELETE FROM products WHERE id = ?', [id]))

/**
 * Importa produtos do CSV.
 *  mode 'replace' -> apaga todos os produtos e cria de novo (as vendas mantêm-se)
 *  mode 'merge'   -> produto com o mesmo NOME+TAMANHO é atualizado (qtd, valor e,
 *                    se vierem no CSV, promoção/preço especial); os restantes são criados
 */
export const importProducts = (products, mode = 'replace') =>
  write(() => {
    let created = 0
    let updated = 0
    if (mode === 'replace') run('DELETE FROM products')
    for (const p of products) {
      const existing =
        mode === 'merge' &&
        get('SELECT id FROM products WHERE nome = ? COLLATE NOCASE AND tamanho = ? COLLATE NOCASE',
          [p.nome, p.tamanho || ''])
      if (existing) {
        run(
          `UPDATE products SET qtd=?, valor=?,
             promocao = COALESCE(?, promocao), preco_especial = COALESCE(?, preco_especial),
             categorias = COALESCE(?, categorias)
           WHERE id=?`,
          [p.qtd, p.valor, p.promocao, p.preco_especial, cats(p.categorias), existing.id],
        )
        updated++
      } else {
        insertProduct(p)
        created++
      }
    }
    return { created, updated }
  })

// ================= Núcleos =================
export const listNucleos = () => all('SELECT nome FROM nucleos ORDER BY nome COLLATE NOCASE').map((r) => r.nome)
export const addNucleo = (nome) => write(() => run('INSERT OR IGNORE INTO nucleos (nome) VALUES (?)', [nome.trim()]))
export const deleteNucleo = (nome) => write(() => run('DELETE FROM nucleos WHERE nome = ?', [nome]))

// ================= Vendas =================
/**
 * Regista uma venda (um carrinho). Cria uma linha em `transactions` por produto
 * e desconta o stock. Falha se algum produto não tiver stock suficiente
 * (a menos que allowNegative = true).
 */
/** Texto que descreve o desconto dado no carrinho (vai para o CSV). */
export function describeDiscount(mode, value, d) {
  if (!d.desconto) return ''
  if (mode === 'percent') return `${d.percent}%`
  if (mode === 'total') return `novo total ${formatEuro(d.total)}`
  return `-${formatEuro(d.desconto)}`
}

/**
 * Regista uma venda (um carrinho). Cria uma linha em `transactions` por produto e desconta o stock.
 * `desconto` (opcional): { mode: 'valor' | 'percent' | 'total', value } — desconto dado no carrinho,
 * repartido pelas linhas proporcionalmente ao valor de cada uma (a soma bate certo ao cêntimo).
 */
export const registerSale = ({ items, nome, nucleo, vendedor, observacao = '', allowNegative = false, desconto = null }) =>
  write(() => {
    const vendaId = uuid()
    const data = new Date().toISOString()

    // 1) preços de cada linha (com as promoções dos produtos)
    const lines = items.map(({ productId, quantidade }) => {
      const p = getProduct(productId)
      if (!p) throw new Error('Produto já não existe na base de dados.')
      if (p.qtd < quantidade) {
        if (!allowNegative) throw new Error(`Stock insuficiente: ${p.nome} ${p.tamanho} (restam ${p.qtd}).`)
        if (!observacao.trim()) throw new Error('Vender sem stock exige uma observação.')
      }
      return { p, quantidade, price: priceLine(p, quantidade) }
    })

    // 2) desconto da venda
    const subtotal = lines.reduce((s, l) => s + l.price.total, 0)
    const d = desconto ? saleDiscount(subtotal, desconto.mode, desconto.value) : { desconto: 0 }
    if (d.error) throw new Error(d.error)
    const shares = allocateDiscount(lines.map((l) => l.price.total), d.desconto)
    const info = desconto ? describeDiscount(desconto.mode, desconto.value, d) : ''

    // 3) gravar
    let total = 0
    lines.forEach(({ p, quantidade, price }, i) => {
      const preco = Math.round((price.total - shares[i]) * 100) / 100
      run(
        `INSERT INTO transactions (id, venda_id, data, produto_id, nome_produto, tamanho, quantidade,
           preco_unitario, desconto, preco, promocao, nome, nucleo, vendedor, observacao, desconto_venda, desconto_info)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [uuid(), vendaId, data, p.id, p.nome, p.tamanho, quantidade, price.unitario, price.desconto,
          preco, p.promocao || (p.preco_especial != null ? 'PRECO_ESPECIAL' : null),
          (nome || '').trim(), nucleo || '', (vendedor || '').trim(), observacao.trim(), shares[i], info],
      )
      run('UPDATE products SET qtd = qtd - ? WHERE id = ?', [quantidade, p.id])
      total += preco
    })
    return { vendaId, total: Math.round(total * 100) / 100, desconto: d.desconto }
  })

/** Anula uma venda inteira e devolve as quantidades ao stock. */
export const cancelSale = (vendaId) =>
  write(() => {
    const lines = all('SELECT produto_id, quantidade FROM transactions WHERE venda_id = ?', [vendaId])
    for (const l of lines) run('UPDATE products SET qtd = qtd + ? WHERE id = ?', [l.quantidade, l.produto_id])
    run('DELETE FROM transactions WHERE venda_id = ?', [vendaId])
  })

/** Vendas entre duas datas locais (YYYY-MM-DD, inclusive). */
export function listTransactions(fromDate, toDate) {
  const from = new Date(`${fromDate}T00:00:00`).toISOString()
  const to = new Date(`${toDate}T23:59:59.999`).toISOString()
  return all('SELECT * FROM transactions WHERE data BETWEEN ? AND ? ORDER BY data DESC, nome_produto', [from, to])
}

export const listSellers = () =>
  all(`SELECT DISTINCT vendedor FROM transactions WHERE vendedor <> '' ORDER BY vendedor`).map((r) => r.vendedor)
