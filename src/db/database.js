// SQLite no browser (sql.js / WebAssembly), guardado em IndexedDB.
// Tudo funciona offline: o ficheiro .wasm é incluído no build pelo Vite.
import initSqlJs from 'sql.js'
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url'

const IDB_NAME = 'loja-db'
const IDB_STORE = 'files'
const IDB_KEY = 'main.sqlite'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS products (
  id             TEXT PRIMARY KEY,
  nome           TEXT NOT NULL,
  qtd            INTEGER NOT NULL DEFAULT 0,
  tamanho        TEXT NOT NULL DEFAULT '',
  valor          REAL NOT NULL DEFAULT 0,
  promocao       TEXT,
  preco_especial REAL
);
CREATE INDEX IF NOT EXISTS idx_products_nome ON products(nome, tamanho);

CREATE TABLE IF NOT EXISTS transactions (
  id              TEXT PRIMARY KEY,
  venda_id        TEXT NOT NULL,
  data            TEXT NOT NULL,          -- ISO 8601 (UTC)
  produto_id      TEXT,
  nome_produto    TEXT NOT NULL,
  tamanho         TEXT NOT NULL DEFAULT '',
  quantidade      INTEGER NOT NULL,
  preco_unitario  REAL NOT NULL,
  desconto        REAL NOT NULL DEFAULT 0,
  preco           REAL NOT NULL,          -- total da linha, já com promoção
  promocao        TEXT,
  nome            TEXT NOT NULL DEFAULT '', -- nome do comprador
  nucleo          TEXT NOT NULL DEFAULT '',
  vendedor        TEXT NOT NULL DEFAULT '', -- quem vendeu
  observacao      TEXT NOT NULL DEFAULT ''  -- obrigatória ao vender sem stock
);
CREATE INDEX IF NOT EXISTS idx_tx_data ON transactions(data);
CREATE INDEX IF NOT EXISTS idx_tx_venda ON transactions(venda_id);

CREATE TABLE IF NOT EXISTS nucleos (
  nome TEXT PRIMARY KEY
);
`

/** Atualiza bases de dados criadas por versões anteriores da app. */
function migrate(database) {
  const cols = database.exec('PRAGMA table_info(transactions)')[0]?.values.map((r) => r[1]) ?? []
  if (!cols.includes('observacao')) {
    database.exec("ALTER TABLE transactions ADD COLUMN observacao TEXT NOT NULL DEFAULT ''")
  }
}

let SQL = null
let db = null

// ---------- IndexedDB ----------
function idb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}
async function idbGet(key) {
  const conn = await idb()
  return new Promise((resolve, reject) => {
    const r = conn.transaction(IDB_STORE).objectStore(IDB_STORE).get(key)
    r.onsuccess = () => resolve(r.result ?? null)
    r.onerror = () => reject(r.error)
  })
}
async function idbPut(key, value) {
  const conn = await idb()
  return new Promise((resolve, reject) => {
    const tx = conn.transaction(IDB_STORE, 'readwrite')
    tx.objectStore(IDB_STORE).put(value, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

// ---------- ciclo de vida ----------
export async function openDatabase() {
  if (db) return db
  SQL = await initSqlJs({ locateFile: () => wasmUrl })
  const saved = await idbGet(IDB_KEY)
  db = saved ? new SQL.Database(new Uint8Array(saved)) : new SQL.Database()
  db.exec(SCHEMA)
  migrate(db)
  // pede ao browser para não apagar os dados quando houver pouco espaço
  navigator.storage?.persist?.().catch(() => {})
  await persist()
  return db
}

let saving = Promise.resolve()
/** Grava a base de dados inteira em IndexedDB (escritas em série). */
export function persist() {
  const bytes = db.export()
  saving = saving.then(() => idbPut(IDB_KEY, bytes))
  return saving
}

/** Substitui a base de dados atual por um ficheiro .sqlite (restauro de backup). */
export async function replaceDatabase(bytes) {
  const next = new SQL.Database(new Uint8Array(bytes))
  next.exec(SCHEMA) // valida/atualiza o ficheiro
  migrate(next)
  db.close()
  db = next
  await persist()
  notify()
}

export const exportDatabase = () => db.export()

// ---------- consultas ----------
export function all(sql, params = []) {
  const stmt = db.prepare(sql)
  try {
    stmt.bind(params)
    const rows = []
    while (stmt.step()) rows.push(stmt.getAsObject())
    return rows
  } finally {
    stmt.free()
  }
}
export const get = (sql, params = []) => all(sql, params)[0] ?? null
export const run = (sql, params = []) => db.run(sql, params)

/** Executa `fn` numa transação SQL; grava e notifica no fim. */
export async function write(fn) {
  db.exec('BEGIN')
  let result
  try {
    result = fn()
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
  await persist()
  notify()
  return result
}

/** SQL livre (consola). Devolve [{columns, values}] como o sql.js. */
export async function execRaw(sql) {
  const res = db.exec(sql)
  await persist()
  notify()
  return res
}

// ---------- subscrição (para o React re-renderizar após escritas) ----------
let version = 0
const listeners = new Set()
export function notify() {
  version++
  listeners.forEach((l) => l())
}
export const subscribe = (l) => (listeners.add(l), () => listeners.delete(l))
export const getVersion = () => version

export function uuid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID()
  // fallback (p.ex. app aberta por http://IP-da-rede, que não é "secure context")
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}
