// Categorias de um produto: texto livre com várias etiquetas, ex.: "CAMISETA, OLGA".
// Guardadas na BD como "CAMISETA,OLGA" (maiúsculas, sem repetidos, pela ordem em que aparecem).

/** "camiseta, Olga ; olga" -> ['CAMISETA', 'OLGA'] */
export function parseCategorias(raw) {
  const seen = new Set()
  for (const part of String(raw ?? '').split(/[,;|/]/)) {
    const c = part.trim().replace(/\s+/g, ' ').toUpperCase()
    if (c) seen.add(c)
  }
  return [...seen]
}

/** lista -> texto guardado na BD (ou null se vazio) */
export const joinCategorias = (list) => (list.length ? list.join(',') : null)

/** todas as categorias usadas por uma lista de produtos, com o nº de produtos de cada uma */
export function countCategorias(products) {
  const counts = new Map()
  for (const p of products) for (const c of parseCategorias(p.categorias)) counts.set(c, (counts.get(c) || 0) + 1)
  return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt'))
}

/** o produto tem TODAS as categorias selecionadas? (seleção vazia = mostra tudo) */
export function matchesCategorias(product, selected) {
  if (!selected.length) return true
  const cats = parseCategorias(product.categorias)
  return selected.every((c) => cats.includes(c))
}
