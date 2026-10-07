// Base de dados em JavaScript puro: os dados vivem em memória (arrays de objetos)
// e são gravados inteiros em IndexedDB a cada escrita. Sem WebAssembly nem dependências,
// funciona em qualquer browser (iPhone incluído) e offline.
// Os dados são poucos (uma loja), por isso gravar tudo de cada vez é rápido e simples.

import type { DbState, Product, Transaction } from '../types.ts'

const IDB_NAME = 'loja-db'
const IDB_STORE = 'files'
const IDB_KEY = 'data'

export const FORMAT = 1 // versão do formato do backup .json

const empty = (): DbState => ({ products: [], transactions: [], nucleos: [], categorias: [] })

let state: DbState | null = null

// cópia profunda (os dados são só texto/números; JSON funciona em qualquer browser, ao contrário do structuredClone em iOS < 15.4)
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v))

// ---------- normalização (campos e valores por defeito de cada registo) ----------
const str = (v: unknown) => (v == null ? '' : String(v))
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0)
const numOrNull = (v: unknown) => (v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v))
const strOrNull = (v: unknown) => (v === '' || v == null ? null : String(v))

/** Registo ainda por validar: os mesmos campos, mas de qualquer tipo (vindos de um backup, do CSV…). */
type Loose<T> = { [K in keyof T]?: unknown }

export const normalizeProduct = (p: Loose<Product>): Product => ({
  id: str(p.id) || uuid(),
  nome: str(p.nome),
  qtd: Math.trunc(num(p.qtd)),
  tamanho: str(p.tamanho),
  valor: num(p.valor),
  promocao: strOrNull(p.promocao),
  preco_especial: numOrNull(p.preco_especial),
  categorias: strOrNull(p.categorias), // ex.: "CAMISETA,OLGA"
  sem_limite: Boolean(p.sem_limite), // stock ilimitado: não é controlado nem descontado
  caixa_destino: str(p.caixa_destino).trim(),
})

export const normalizeTransaction = (t: Loose<Transaction>): Transaction => ({
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
  responsavel: str(t.responsavel), // quem estava a usar a app (campo Responsável)
  observacao: str(t.observacao), // obrigatória ao vender sem stock
  desconto_venda: num(t.desconto_venda), // parte desta linha do desconto dado no carrinho
  desconto_info: str(t.desconto_info), // como foi dado: "10%", "-5,00 €", "total 40,00 €"
  atividade: str(t.atividade), // atividade/evento em que a venda foi feita
  caixa_destino: str(t.caixa_destino), // caixa de destino do produto
})

/** Valida e completa dados vindos do IndexedDB ou de um backup. */
export function normalizeData(input: unknown): DbState {
  if (!input || typeof input !== 'object') throw new Error('formato desconhecido')
  const raw = input as Record<string, unknown>
  const list = (k: keyof DbState): unknown[] => {
    if (raw[k] != null && !Array.isArray(raw[k])) throw new Error(`"${k}" devia ser uma lista`)
    return (raw[k] as unknown[] | undefined) ?? []
  }
  const products = list('products') as Loose<Product>[]
  const transactions = list('transactions') as Loose<Transaction>[]
  const nucleos = [...new Set(list('nucleos').map((n) => str(n && typeof n === 'object' ? (n as { nome?: unknown }).nome : n).trim()).filter(Boolean))]
  // categorias criadas nas Configurações (as usadas nos produtos também contam, ver listCategorias)
  const categorias = [...new Set(list('categorias').map((c) => str(c).trim().replace(/\s+/g, ' ').toUpperCase()).filter(Boolean))]
  return {
    products: products.map(normalizeProduct),
    transactions: transactions.map(normalizeTransaction),
    nucleos,
    categorias,
  }
}

// ---------- IndexedDB (sem IndexedDB, p.ex. nos testes, fica só em memória) ----------
const hasIdb = () => typeof indexedDB !== 'undefined'
let conn: Promise<IDBDatabase> | null = null
function idb(): Promise<IDBDatabase> {
  conn ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return conn
}
async function idbGet(key: string): Promise<unknown> {
  const db = await idb()
  return new Promise((resolve, reject) => {
    const r = db.transaction(IDB_STORE).objectStore(IDB_STORE).get(key)
    r.onsuccess = () => resolve(r.result ?? null)
    r.onerror = () => reject(r.error)
  })
}
async function idbPut(key: string, value: unknown): Promise<void> {
  const db = await idb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite')
    tx.objectStore(IDB_STORE).put(value, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

// ---------- ciclo de vida ----------
export async function openDatabase(): Promise<DbState> {
  if (state) return state
  if (!hasIdb()) return (state = empty())
  const saved = await idbGet(IDB_KEY)
  state = saved ? normalizeData(saved) : empty()
  // pede ao browser para não apagar os dados quando houver pouco espaço
  navigator.storage?.persist?.().catch(() => {})
  await persist()
  return state
}

/** Estado atual (só para ler dentro do db/; para escrever usa `write`). A app só arranca depois de `openDatabase`. */
export const db = (): DbState => state!

let saving: Promise<void> = Promise.resolve()
/** Grava todos os dados em IndexedDB (escritas em série). */
export function persist(): Promise<void> {
  if (!hasIdb()) return saving
  const snapshot = clone(state)
  saving = saving.then(() => idbPut(IDB_KEY, snapshot))
  return saving
}

/** Substitui os dados atuais por um backup (.json). */
export async function replaceDatabase(bytes: ArrayBuffer | Uint8Array): Promise<void> {
  let raw: { formato?: number } | null
  try {
    raw = JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    throw new Error('não é um backup da loja (.json)')
  }
  if ((raw?.formato ?? 0) > FORMAT) throw new Error('backup feito por uma versão mais recente da app')
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
export async function write<T>(fn: (state: DbState) => T): Promise<T> {
  const backup = clone(db())
  let result: T
  try {
    result = fn(db())
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
const listeners = new Set<() => void>()
export function notify() {
  version++
  listeners.forEach((l) => l())
}
export const subscribe = (l: () => void) => (listeners.add(l), () => { listeners.delete(l) })
export const getVersion = () => version

export function uuid(): string {
  // (o TS assume que existe sempre, mas fora de "secure context" o browser não o tem)
  if (typeof globalThis.crypto?.randomUUID === 'function') return crypto.randomUUID()
  // fallback (p.ex. app aberta por http://IP-da-rede, que não é "secure context")
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}
