import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '../db/useDb.ts'
import { listProducts, listNucleos, registerSale } from '../db/repo.ts'
import DiscountBox from '../components/DiscountBox.tsx'
import { priceCart, promoLabel, formatEuro, saleDiscount } from '../lib/pricing.ts'
import { useToast } from '../components/Toast.tsx'
import { useConfirm } from '../components/ConfirmProvider.tsx'
import { useCart } from '../lib/cartStore.ts'
import { useSessao, nomeValido } from '../lib/sessionStore.ts'
import { faltaStock } from '../lib/stock.ts'
import { groupPieces, rotuloArtigo } from '../lib/pieces.ts'
import PieceCard from '../components/PieceCard.tsx'
import NucleosModal from '../components/NucleosModal.tsx'
import ConfirmModal from '../components/ConfirmModal.tsx'
import QtyInput from '../components/QtyInput.tsx'
import CategoryFilter from '../components/CategoryFilter.tsx'
import TrashIcon from '../components/TrashIcon.tsx'
import { errorMessage } from '../lib/errors.ts'
import type { LinePrice } from '../lib/pricing.ts'
import type { PageProps, Product } from '../types.ts'

/** Linha do carrinho: produto, quantidade e preço calculado. */
type CartLine = LinePrice & { product: Product; quantidade: number }

const norm = (s: string) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export default function Vender({ goTo }: PageProps) {
  const { responsavel, atividade } = useSessao()
  const toast = useToast()
  const askConfirm = useConfirm()
  const products = useQuery(listProducts)
  const nucleos = useQuery(listNucleos)
  const [search, setSearch] = useState('')
  const [cats, setCats] = useState<string[]>([]) // categorias selecionadas no filtro
  // o carrinho vive fora da página: não se perde ao mudar de separador
  const {
    items: cart, nome, nucleo, observacao, descontoMode, descontoValue,
    setQty, remove, setNome, setNucleo, setObservacao, setDesconto, clearDesconto, clearItems, afterSale,
  } = useCart()
  const [busy, setBusy] = useState(false)
  const [nucleosOpen, setNucleosOpen] = useState(false)
  // ecrãs médios (861–1023px): carrinho num painel lateral (drawer) que abre/fecha;
  // no computador largo fica sempre aberto e no telemóvel não tem efeito
  const [drawerOpen, setDrawerOpen] = useState(() => { try { return localStorage.getItem('loja.cartDrawer') === '1' } catch { return false } })
  useEffect(() => { try { localStorage.setItem('loja.cartDrawer', drawerOpen ? '1' : '0') } catch { /* ignora */ } }, [drawerOpen])
  useEffect(() => {
    if (!drawerOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !document.querySelector('.modal-backdrop') && setDrawerOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawerOpen])
  // { line } para apagar um artigo, ou { all: true } para limpar
  const [confirm, setConfirm] = useState<{ line?: CartLine; all?: boolean } | null>(null)

  const byId = useMemo<Record<string, Product>>(() => Object.fromEntries(products.map((p) => [p.id, p])), [products])
  const filtered = useMemo(() => {
    const q = norm(search.trim())
    // peças: pesquisa no nome, cor e SKUs; filtro pelas categorias de qualquer tamanho da peça
    return groupPieces(products).filter((pc) =>
      cats.every((c) => pc.categorias.includes(c)) &&
      (!q || norm([pc.nome, pc.cor, pc.sku_pai, ...pc.variants.map((v) => v.sku)].join(' ')).includes(q)))
  }, [products, search, cats])

  const cartItems = Object.entries(cart)
    .filter(([id]) => byId[id])
  // promoções contam o produto inteiro (ex.: 2XL + 3XL da mesma camiseta em "2 por 1")
  const cartPrices = priceCart(cartItems.map(([id, q]) => ({ ...byId[id], quantidade: q })))
  const lines: CartLine[] = cartItems.map(([id, q], i) => ({ product: byId[id], quantidade: q, ...cartPrices[i] }))
  const total = lines.reduce((s, l) => s + l.total, 0)
  const semStock = lines.filter((l) => faltaStock(l.product, l.quantidade))
  const desconto = lines.reduce((s, l) => s + l.desconto, 0) // promoções dos produtos
  const venda = saleDiscount(total, descontoMode, descontoValue) // desconto dado no carrinho

  const add = (p: Product) => {
    const q = (cart[p.id] || 0) + 1
    if (faltaStock(p, q)) toast(`Atenção: só há ${p.qtd} em stock de ${rotuloArtigo(p)}`, 'warn')
    setQty(p.id, q)
  }

  async function finalizar() {
    if (!nomeValido(atividade)) return toast('Define a atividade em Configurações.', 'error')
    if (!nomeValido(responsavel)) return toast('Define o responsável em Configurações.', 'error')
    if (!nucleo) return toast('Escolhe o núcleo do comprador.', 'error')
    if (venda.error) return toast(`Desconto: ${venda.error}`, 'error')
    const semPreco = lines.filter((l) => !(l.product.valor > 0))
    if (semPreco.length && !(await askConfirm({
      title: 'Vender a 0 €?',
      message: `Sem preço definido: ${semPreco.map((l) => l.product.nome).join(', ')}.`,
      confirmLabel: 'Vender a 0 €',
    }))) return
    const items = lines.map((l) => ({ productId: l.product.id, quantidade: l.quantidade }))
    // vender sem stock só com justificação na observação
    const allowNegative = semStock.length > 0
    if (allowNegative && !observacao.trim()) {
      document.getElementById('observacao')?.focus()
      return toast('Há artigos sem stock: escreve na Observação porque vais vendê-los.', 'error')
    }
    setBusy(true)
    try {
      const r = await registerSale({
        items, nome, nucleo, responsavel, atividade, observacao, allowNegative,
        desconto: venda.desconto > 0 ? { mode: descontoMode, value: descontoValue } : null,
      })
      toast(`Venda registada: ${formatEuro(r.total)}`)
      afterSale()
    } catch (e) {
      toast(errorMessage(e), 'error')
    } finally {
      setBusy(false)
    }
  }

  if (!products.length) {
    return (
      <div className="empty">
        <p>Ainda não há produtos.</p>
        <button className="primary" onClick={() => goTo('produtos')}>Importar CSV de produtos</button>
      </div>
    )
  }

  const confirmLine = confirm?.line

  return (
    <div className={`pos ${drawerOpen ? 'drawer-open' : ''}`}>
      <section className="catalog">
        <div className="search-row">
          <input
            className="search"
            autoFocus
            placeholder="Procurar produto…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <CategoryFilter products={products} selected={cats} onChange={setCats} />
        </div>
        <div className="grid pieces">
          {filtered.map((pc) => <PieceCard key={pc.sku_pai} piece={pc} cart={cart} onAdd={add} />)}
          {!filtered.length && <p className="muted">Nenhum produto encontrado.</p>}
        </div>
      </section>

      {lines.length > 0 && (
        <button className="mobile-cart-bar" onClick={() => document.getElementById('carrinho')?.scrollIntoView({ behavior: 'smooth' })}>
          <span>Carrinho · {lines.reduce((n, l) => n + l.quantidade, 0)} artigo(s)</span>
          <strong>{formatEuro(venda.desconto > 0 ? venda.total : total)} ↓</strong>
        </button>
      )}

      {/* ecrãs médios: com o carrinho aberto o catálogo fica escurecido; tocar aí fecha o carrinho */}
      <div className="drawer-backdrop" onClick={() => setDrawerOpen(false)} aria-hidden="true" />

      {/* botão do drawer (só aparece em ecrãs médios) */}
      <button type="button" className="cart-toggle" onClick={() => setDrawerOpen(true)} aria-expanded={drawerOpen} aria-controls="carrinho">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h8.9a1 1 0 0 0 1-.8L20 8H6.2" /><circle cx="9" cy="20" r="1.4" /><circle cx="17" cy="20" r="1.4" />
        </svg>
        Carrinho
        {lines.length > 0 && <span className="cart-toggle-count">{lines.reduce((n, l) => n + l.quantidade, 0)}</span>}
        <strong>{formatEuro(venda.desconto > 0 ? venda.total : total)}</strong>
      </button>

      <aside className="cart" id="carrinho" aria-label="Carrinho">
        <div className="cart-head">
          <h2>Carrinho</h2>
          <button type="button" className="drawer-close" onClick={() => setDrawerOpen(false)} aria-label="Fechar carrinho" title="Fechar (Esc)">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        {(!nomeValido(atividade) || !nomeValido(responsavel)) && (
          <div className="session-warning">
            Falta definir {!nomeValido(atividade) && 'a atividade'}{!nomeValido(atividade) && !nomeValido(responsavel) && ' e '}{!nomeValido(responsavel) && 'o responsável'}.
            <button type="button" className="small" onClick={() => goTo('config')}>Abrir Configurações</button>
          </div>
        )}
        {!lines.length && <p className="muted">Clica num produto para adicionar.</p>}
        <ul className="cart-lines">
          {lines.map((l) => (
            <li key={l.product.id} className={faltaStock(l.product, l.quantidade) ? 'no-stock' : ''}>
              <div className="line-info">
                <strong>{l.product.nome}</strong>{[l.product.cor, l.product.tamanho].filter(Boolean).map((x) => <span key={x} className="muted"> · {x}</span>)}
                {faltaStock(l.product, l.quantidade) && (
                  <div className="stock-alert">
                    {l.product.qtd <= 0 ? 'Sem stock' : `Só há ${l.product.qtd} em stock`}
                  </div>
                )}
                {l.desconto > 0 && <div className="badge">{promoLabel(l.product)} −{formatEuro(l.desconto)}</div>}
              </div>
              <QtyInput value={l.quantidade} onChange={(q) => setQty(l.product.id, q)} />
              <div className="line-total">{formatEuro(l.total)}</div>
              <button
                type="button"
                className="line-delete"
                onClick={() => setConfirm({ line: l })}
                aria-label={`Apagar ${l.product.nome} ${l.product.tamanho}`}
                title="Apagar do carrinho"
              >
                <TrashIcon />
              </button>
            </li>
          ))}
        </ul>

        <div className="buyer">
          <label>
            Nome do comprador <span className="muted">(opcional)</span>
            <input value={nome} onChange={(e) => setNome(e.target.value)} />
          </label>
          <div className="field">
            <label htmlFor="nucleo-select">Núcleo</label>
            <div className="row">
              {nucleos.length > 0 && (
                <select id="nucleo-select" className="grow" value={nucleo} onChange={(e) => setNucleo(e.target.value)}>
                  <option value="">— escolher —</option>
                  {nucleos.map((n) => <option key={n}>{n}</option>)}
                </select>
              )}
              <button
                type="button"
                className={nucleos.length ? '' : 'grow'}
                onClick={() => setNucleosOpen(true)}
                title="Criar núcleo"
              >
                {nucleos.length ? '+ Novo' : '+ Criar núcleo'}
              </button>
            </div>
          </div>
          <div className="field">
            <label htmlFor="observacao">
              Observação{' '}
              {semStock.length > 0
                ? <span className="stock-alert">(obrigatória — há artigos sem stock)</span>
                : <span className="muted">(opcional)</span>}
            </label>
            <textarea
              id="observacao"
              rows={2}
              className={semStock.length > 0 && !observacao.trim() ? 'required-missing' : ''}
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder={semStock.length > 0 ? 'Ex.: peça reservada, stock chega amanhã…' : ''}
            />
          </div>
        </div>

        <DiscountBox
          mode={descontoMode}
          value={descontoValue}
          subtotal={total}
          result={venda}
          onChange={setDesconto}
          onClear={clearDesconto}
        />

        <div className="totals">
          {desconto > 0 && <div className="muted">Promoções: −{formatEuro(desconto)}</div>}
          {venda.desconto > 0 && (
            <>
              <div className="muted">Subtotal: {formatEuro(total)}</div>
              <div className="discount-line">Desconto: −{formatEuro(venda.desconto)}</div>
            </>
          )}
          <div className="total">Total <span>{formatEuro(venda.desconto > 0 ? venda.total : total)}</span></div>
        </div>
        <div className="row">
          <button className="with-icon" onClick={() => setConfirm({ all: true })} disabled={!lines.length || busy}><TrashIcon size={14} />Limpar</button>
          <button className="primary grow" onClick={finalizar} disabled={!lines.length || busy}>
            Finalizar venda
          </button>
        </div>
      </aside>

      {confirmLine && (
        <ConfirmModal
          title="Apagar artigo do carrinho?"
          confirmLabel="Apagar"
          danger
          onCancel={() => setConfirm(null)}
          onConfirm={() => { remove(confirmLine.product.id); setConfirm(null) }}
        >
          <strong>{confirmLine.quantidade}× {confirmLine.product.nome}</strong>
          {confirmLine.product.tamanho && ` · ${confirmLine.product.tamanho}`} — {formatEuro(confirmLine.total)}
        </ConfirmModal>
      )}
      {confirm?.all && (
        <ConfirmModal
          title="Limpar o carrinho?"
          confirmLabel="Limpar tudo"
          danger
          onCancel={() => setConfirm(null)}
          onConfirm={() => { clearItems(); setConfirm(null) }}
        >
          Todos os {lines.length} artigo(s) vão ser removidos.
        </ConfirmModal>
      )}

      {nucleosOpen && (
        <NucleosModal
          onClose={() => setNucleosOpen(false)}
          onAdded={(n) => setNucleo(n)}
        />
      )}
    </div>
  )
}
