// Só para migrar dados das versões anteriores (que usavam SQLite via sql.js).
// Este módulo é carregado a pedido: quem nunca teve a versão antiga não descarrega o sql.js.
import initSqlJs from 'sql.js'
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url'

/** Lê um ficheiro .sqlite e devolve { products, transactions, nucleos } (objetos simples). */
export async function readSqlite(bytes) {
  const SQL = await initSqlJs({ locateFile: () => wasmUrl })
  const sqlite = new SQL.Database(new Uint8Array(bytes))
  const rows = (table) => {
    try {
      const r = sqlite.exec(`SELECT * FROM ${table}`)[0]
      return r ? r.values.map((v) => Object.fromEntries(r.columns.map((c, i) => [c, v[i]]))) : []
    } catch {
      return [] // tabela não existe neste ficheiro
    }
  }
  try {
    return { products: rows('products'), transactions: rows('transactions'), nucleos: rows('nucleos') }
  } finally {
    sqlite.close()
  }
}
