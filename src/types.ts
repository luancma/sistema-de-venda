// Tipos centrais da app (os "contratos" descritos no README).

export interface Product {
  id: string
  nome: string
  qtd: number
  tamanho: string
  valor: number
  /** código da promoção (ver lib/pricing.ts) */
  promocao: string | null
  preco_especial: number | null
  /** ex.: "CAMISETA,OLGA" */
  categorias: string | null
  /** stock ilimitado: não é controlado nem descontado */
  sem_limite: boolean
  /** caixa onde o produto está guardado (coluna CAIXA DE DESTINO do CSV) */
  caixa_destino: string
}

/** Uma linha de uma venda (um produto); `venda_id` agrupa o carrinho. */
export interface Transaction {
  id: string
  venda_id: string
  /** ISO 8601 (UTC) */
  data: string
  produto_id: string | null
  nome_produto: string
  tamanho: string
  quantidade: number
  preco_unitario: number
  /** desconto da promoção do produto */
  desconto: number
  /** total da linha, já com promoção e desconto da venda */
  preco: number
  promocao: string | null
  /** nome do comprador */
  nome: string
  nucleo: string
  /** quem estava a usar a app (campo Responsável) */
  responsavel: string
  observacao: string
  /** parte desta linha do desconto dado no carrinho */
  desconto_venda: number
  /** ex.: "10%", "-5,00 €", "novo total 40,00 €" */
  desconto_info: string
  atividade: string
  /** caixa de destino do produto no momento da venda */
  caixa_destino: string
}

/** Uma venda (carrinho) com as suas linhas, como aparece em Vendas e no recibo. */
export interface Sale {
  id: string
  data: string
  nome: string
  nucleo: string
  responsavel: string
  atividade: string
  observacao: string
  lines: Transaction[]
  total: number
  /** soma do desconto dado no carrinho */
  descontoVenda: number
  descontoInfo: string
}

/** Tudo o que fica guardado no IndexedDB (e no backup .json). */
export interface DbState {
  products: Product[]
  transactions: Transaction[]
  nucleos: string[]
  /** categorias criadas nas Configurações (as usadas nos produtos também contam) */
  categorias: string[]
}

/** Como foi dado o desconto no carrinho. */
export type DiscountMode = 'valor' | 'percent' | 'total'

/** Campos que o motor de preços usa (um produto, ou o formulário a meio da edição). */
export interface PriceInput {
  valor?: number | string | null
  promocao?: string | null
  preco_especial?: number | string | null
}

export type ToastKind = 'ok' | 'warn' | 'error'

/** Páginas da app (o menu). */
export type PageId = 'vender' | 'produtos' | 'vendas' | 'config'
export interface PageProps {
  goTo: (id: PageId) => void
}
