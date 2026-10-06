import { all, get, run, write, uuid } from './database.js'
import { priceLine } from '../lib/pricing.js'

// ================= Produtos =================
export const listProducts = () =>
  all('SELECT * FROM products ORDER BY nome COLLATE NOCASE, tamanho COLLATE NOCASE')

export const getProduct = (id) => get('SELECT * FROM products WHERE id = ?', [id])

const nullable = (v) => (v === '' || v === undefined ? null : v)

function insertProduct(p) {
  const id = p.id || uuid()
  run(
    `INSERT INTO products (id, nome, qtd, tamanho, valor, promocao, preco_especial)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, p.nome.trim(), Number(p.qtd) || 0, (p.tamanho || '').trim(), Number(p.valor) || 0,
      nullable(p.promocao), nullable(p.preco_especial)],
  )
  return id
}

export const saveProduct = (p) =>
  write(() => {
    if (!p.id) return insertProduct(p)
    run(
      `UPDATE products SET nome=?, qtd=?, tamanho=?, valor=?, promocao=?, preco_especial=? WHERE id=?`,
      [p.nome.trim(), Number(p.qtd) || 0, (p.tamanho || '').trim(), Number(p.valor) || 0,
        nullable(p.promocao), nullable(p.preco_especial), p.id],
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
             promocao = COALESCE(?, promocao), preco_especial = COALESCE(?, preco_especial)
           WHERE id=?`,
          [p.qtd, p.valor, p.promocao, p.preco_especial, existing.id],
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
export const registerSale = ({ items, nome, nucleo, vendedor, observacao = '', allowNegative = false }) =>
  write(() => {
    const vendaId = uuid()
    const data = new Date().toISOString()
    let total = 0
    for (const { productId, quantidade } of items) {
      const p = getProduct(productId)
      if (!p) throw new Error('Produto já não existe na base de dados.')
      if (p.qtd < quantidade) {
        if (!allowNegative) throw new Error(`Stock insuficiente: ${p.nome} ${p.tamanho} (restam ${p.qtd}).`)
        if (!observacao.trim()) throw new Error('Vender sem stock exige uma observação.')
      }
      const price = priceLine(p, quantidade)
      run(
        `INSERT INTO transactions (id, venda_id, data, produto_id, nome_produto, tamanho, quantidade,
           preco_unitario, desconto, preco, promocao, nome, nucleo, vendedor, observacao)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [uuid(), vendaId, data, p.id, p.nome, p.tamanho, quantidade, price.unitario, price.desconto,
          price.total, p.promocao || (p.preco_especial != null ? 'PRECO_ESPECIAL' : null),
          (nome || '').trim(), nucleo || '', (vendedor || '').trim(), observacao.trim()],
      )
      run('UPDATE products SET qtd = qtd - ? WHERE id = ?', [quantidade, p.id])
      total += price.total
    }
    return { vendaId, total: Math.round(total * 100) / 100 }
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
