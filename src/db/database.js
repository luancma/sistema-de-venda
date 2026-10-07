// Base de dados em JavaScript puro: os dados vivem em memória (arrays de objetos)
// e são gravados inteiros em IndexedDB a cada escrita. Sem WebAssembly nem dependências,
// funciona em qualquer browser (iPhone incluído) e offline.
// Os dados são poucos (uma loja), por isso gravar tudo de cada vez é rápido e simples.

const IDB_NAME = 'loja-db'
const IDB_STORE = 'files'
const IDB_KEY = 'data'
const LEGACY_KEY = 'main.sqlite' // versões anteriores guardavam aqui o ficheiro SQLite (sql.js)

export const FORMAT = 1 // versão do formato do backup .json

const empty = () => ({ products: [], transactions: [], nucleos: [], categorias: [] })

let state = null

// cópia profunda (os dados são só texto/números; JSON funciona em qualquer browser, ao contrário do structuredClone em iOS < 15.4)
const clone = (v) => JSON.parse(JSON.stringify(v))

// ---------- normalização (equivale ao schema + defaults do antigo SQLite) ----------
const str = (v) => (v == null ? '' : String(v))
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)
const numOrNull = (v) => (v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v))
const strOrNull = (v) => (v === '' || v == null ? null : String(v))

export const normalizeProduct = (p) => ({
  id: str(p.id) || uuid(),
  nome: str(p.nome),
  qtd: Math.trunc(num(p.qtd)),
  tamanho: str(p.tamanho),
  valor: num(p.valor),
  promocao: strOrNull(p.promocao),
  preco_especial: numOrNull(p.preco_especial),
  categorias: strOrNull(p.categorias), // ex.: "CAMISETA,OLGA"
  sem_limite: Boolean(p.sem_limite), // stock ilimitado: não é controlado nem descontado
})

export const normalizeTransaction = (t) => ({
  id: str(t.id) || uuid(),
  venda_id: str(t.venda_id),
  data: str(t.data), // ISO 8601 (UTC)
  produto_id: strOrNull(t.produto_id),
  nome_produto: str(t.nome_produto),
  tamanho: str(t.tamanho),
  quantidade: Math.trunc(num(t.quantidade)),
  preco_unitario: num(t.preco_unitario),
  desconto: num(t.desconto),
  preco: num(t.preco), // total da linha, já com promoção
  promocao: strOrNull(t.promocao),
  nome: str(t.nome), // nome do comprador
  nucleo: str(t.nucleo),
  vendedor: str(t.vendedor), // quem vendeu
  observacao: str(t.observacao), // obrigatória ao vender sem stock
  desconto_venda: num(t.desconto_venda), // parte desta linha do desconto dado no carrinho
  desconto_info: str(t.desconto_info), // como foi dado: "10%", "-5,00 €", "total 40,00 €"
  atividade: str(t.atividade), // atividade/evento em que a venda foi feita
})

/** Valida e completa dados vindos do IndexedDB, de um backup ou do SQLite antigo. */
export function normalizeData(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('formato desconhecido')
  for (const k of ['products', 'transactions', 'nucleos', 'categorias']) {
    if (raw[k] != null && !Array.isArray(raw[k])) throw new Error(`"${k}" devia ser uma lista`)
  }
  const nucleos = [...new Set((raw.nucleos ?? []).map((n) => str(typeof n === 'object' ? n?.nome : n).trim()).filter(Boolean))]
  // categorias criadas nas Configurações (as usadas nos produtos também contam, ver listCategorias)
  const categorias = [...new Set((raw.categorias ?? []).map((c) => str(c).trim().replace(/\s+/g, ' ').toUpperCase()).filter(Boolean))]
  return {
    products: (raw.products ?? []).map(normalizeProduct),
    transactions: (raw.transactions ?? []).map(normalizeTransaction),
    nucleos,
    categorias,
  }
}

// ---------- IndexedDB (sem IndexedDB, p.ex. nos testes, fica só em memória) ----------
const hasIdb = () => typeof indexedDB !== 'undefined'
let conn = null
function idb() {
  conn ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return conn
}
async function idbGet(key) {
  const db = await idb()
  return new Promise((resolve, reject) => {
    const r = db.transaction(IDB_STORE).objectStore(IDB_STORE).get(key)
    r.onsuccess = () => resolve(r.result ?? null)
    r.onerror = () => reject(r.error)
  })
}
async function idbPut(key, value) {
  const db = await idb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite')
    tx.objectStore(IDB_STORE).put(value, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

// ---------- ciclo de vida ----------
export async function openDatabase() {
  if (state) return state
  if (!hasIdb()) return (state = empty())
  const saved = await idbGet(IDB_KEY)
  if (saved) {
    state = normalizeData(saved)
  } else {
    // 1.ª abertura depois da mudança: traz os dados do SQLite antigo, se existirem.
    // O ficheiro antigo fica intacto no IndexedDB (não se apaga nada).
    const legacy = await idbGet(LEGACY_KEY)
    state = legacy ? normalizeData(await readLegacySqlite(legacy)) : empty()
  }
  // pede ao browser para não apagar os dados quando houver pouco espaço
  navigator.storage?.persist?.().catch(() => {})
  await persist()
  return state
}

/** Lê um ficheiro .sqlite das versões anteriores. O sql.js só é descarregado quando é preciso. */
async function readLegacySqlite(bytes) {
  const { readSqlite } = await import('./legacySqlite.js')
  return readSqlite(bytes)
}

/** Estado atual (só para ler dentro do db/; para escrever usa `write`). */
export const db = () => state

let saving = Promise.resolve()
/** Grava todos os dados em IndexedDB (escritas em série). */
export function persist() {
  if (!hasIdb()) return saving
  const snapshot = clone(state)
  saving = saving.then(() => idbPut(IDB_KEY, snapshot))
  return saving
}

const isSqlite = (bytes) =>
  new TextDecoder().decode(new Uint8Array(bytes).slice(0, 15)) === 'SQLite format 3'

/** Substitui os dados atuais por um backup (.json, ou .sqlite de versões anteriores). */
export async function replaceDatabase(bytes) {
  let raw
  if (isSqlite(bytes)) {
    raw = await readLegacySqlite(bytes)
  } else {
    try {
      raw = JSON.parse(new TextDecoder().decode(bytes))
    } catch {
      throw new Error('não é um backup da loja (.json ou .sqlite)')
    }
    if (raw?.formato > FORMAT) throw new Error('backup feito por uma versão mais recente da app')
  }
  state = normalizeData(raw)
  await persist()
  notify()
}

/** Backup em JSON (legível, abre em qualquer editor de texto). */
export const exportDatabase = () =>
  JSON.stringify({ app: 'loja', formato: FORMAT, exportado: new Date().toISOString(), ...state }, null, 1)

/**
 * Executa `fn(state)` como uma transação: se lançar um erro, nada fica alterado.
 * No fim grava e notifica.
 */
export async function write(fn) {
  const backup = clone(state)
  let result
  try {
    result = fn(state)
  } catch (e) {
    state = backup
    throw e
  }
  await persist()
  notify()
  return result
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
