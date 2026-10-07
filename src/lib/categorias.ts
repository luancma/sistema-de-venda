// Categorias de um produto: texto livre com várias etiquetas, ex.: "CAMISETA, OLGA".
// Guardadas na BD como "CAMISETA,OLGA" (maiúsculas, sem repetidos, pela ordem em que aparecem).

/** qualquer coisa com categorias (um produto, ou parte dele) */
type ComCategorias = { categorias?: string | null }

/** "camiseta, Olga ; olga" -> ['CAMISETA', 'OLGA'] */
export function parseCategorias(raw: unknown): string[] {
  const seen = new Set<string>()
  for (const part of String(raw ?? '').split(/[,;|/]/)) {
    const c = part.trim().replace(/\s+/g, ' ').toUpperCase()
    if (c) seen.add(c)
  }
  return [...seen]
}

/** lista -> texto guardado na BD (ou null se vazio) */
export const joinCategorias = (list: string[]): string | null => (list.length ? list.join(',') : null)

/** todas as categorias usadas por uma lista de produtos, com o nº de produtos de cada uma */
export function countCategorias(products: ComCategorias[]): [string, number][] {
  const counts = new Map<string, number>()
  for (const p of products) for (const c of parseCategorias(p.categorias)) counts.set(c, (counts.get(c) || 0) + 1)
  return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt'))
}

/** o produto tem TODAS as categorias selecionadas? (seleção vazia = mostra tudo) */
export function matchesCategorias(product: ComCategorias, selected: string[]): boolean {
  if (!selected.length) return true
  const cats = parseCategorias(product.categorias)
  return selected.every((c) => cats.includes(c))
}

/** chave para detetar categorias "parecidas": sem acentos, só letras/números, sem plural em S */
export const similarKey = (c: string) =>
  String(c).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/S$/, '')

/** grupos de categorias parecidas (ex.: CAMISETA / CAMISETAS / CAMISETA-) — só grupos com 2+ nomes */
export function similarGroups(names: string[]): string[][] {
  const groups = new Map<string, string[]>()
  for (const n of names) {
    const k = similarKey(n)
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k)!.push(n)
  }
  return [...groups.values()].filter((g) => g.length > 1)
}

/** substitui (ou remove, se `to` vazio) uma categoria na lista de um produto, sem repetidos */
export function replaceCategoria(list: string[], from: string, to: string): string[] {
  const out: string[] = []
  for (const c of list) {
    const v = c === from ? to : c
    if (v && !out.includes(v)) out.push(v)
  }
  return out
}
