import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '../db/useDb.js'
import { listProducts, listNucleos, registerSale } from '../db/repo.js'
import DiscountBox from '../components/DiscountBox.jsx'
import { priceLine, promoLabel, formatEuro, saleDiscount } from '../lib/pricing.js'
import { useToast } from '../components/Toast.jsx'
import { useConfirm } from '../components/ConfirmProvider.jsx'
import { useCart } from '../lib/cartStore.js'
import { useSessao } from '../lib/sessionStore.js'
import { faltaStock, esgotado } from '../lib/stock.js'
import StockValue from '../components/StockValue.jsx'
import NucleosModal from '../components/NucleosModal.jsx'
import ConfirmModal from '../components/ConfirmModal.jsx'
import QtyInput from '../components/QtyInput.jsx'
import CategoryFilter, { CategoryFilterButton } from '../components/CategoryFilter.jsx'
import { matchesCategorias } from '../lib/categorias.js'
import TrashIcon from '../components/TrashIcon.jsx'

const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export default function Vender({ goTo }) {
  const { vendedor, atividade } = useSessao()
  const toast = useToast()
  const askConfirm = useConfirm()
  const products = useQuery(listProducts)
  const nucleos = useQuery(listNucleos)
  const [search, setSearch] = useState('')
  const [cats, setCats] = useState([]) // categorias selecionadas no filtro
  // o carrinho vive fora da página: não se perde ao mudar de separador
  const {
    items: cart, nome, nucleo, observacao, descontoMode, descontoValue,
    setQty, remove, setNome, setNucleo, setObservacao, setDesconto, clearDesconto, clearItems, afterSale,
  } = useCart()
  const [busy, setBusy] = useState(false)
  const [nucleosOpen, setNucleosOpen] = useState(false)
  // computador: carrinho num painel lateral (drawer) que abre/fecha; no telemóvel não tem efeito
  const [drawerOpen, setDrawerOpen] = useState(() => { try { return localStorage.getItem('loja.cartDrawer') === '1' } catch { return false } })
  useEffect(() => { try { localStorage.setItem('loja.cartDrawer', drawerOpen ? '1' : '0') } catch { /* ignora */ } }, [drawerOpen])
  useEffect(() => {
    if (!drawerOpen) return
    const onKey = (e) => e.key === 'Escape' && !document.querySelector('.modal-backdrop') && setDrawerOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawerOpen])
  const [confirm, setConfirm] = useState(null) // { line } para apagar um artigo, ou { all: true } para limpar

  const byId = useMemo(() => Object.fromEntries(products.map((p) => [p.id, p])), [products])
  const filtered = useMemo(() => {
    const q = norm(search.trim())
    return products.filter((p) => matchesCategorias(p, cats) && (!q || norm(`${p.nome} ${p.tamanho}`).includes(q)))
  }, [products, search, cats])

  const lines = Object.entries(cart)
    .filter(([id]) => byId[id])
    .map(([id, q]) => ({ product: byId[id], quantidade: q, ...priceLine(byId[id], q) }))
  const total = lines.reduce((s, l) => s + l.total, 0)
  const semStock = lines.filter((l) => faltaStock(l.product, l.quantidade))
  const desconto = lines.reduce((s, l) => s + l.desconto, 0) // promoções dos produtos
  const venda = saleDiscount(total, descontoMode, descontoValue) // desconto dado no carrinho

  const add = (p) => {
    const q = (cart[p.id] || 0) + 1
    if (faltaStock(p, q)) toast(`Atenção: só há ${p.qtd} em stock de ${p.nome} ${p.tamanho}`, 'warn')
    setQty(p.id, q)
    setDrawerOpen(true) // no computador abre o carrinho (no telemóvel não tem efeito)
  }

  async function finalizar() {
    if (!atividade.trim()) return toast('Define a atividade em Configurações.', 'error')
    if (!vendedor.trim()) return toast('Define o responsável em Configurações.', 'error')
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
        items, nome, nucleo, vendedor, atividade, observacao, allowNegative,
        desconto: venda.desconto > 0 ? { mode: descontoMode, value: descontoValue } : null,
      })
      toast(`Venda registada: ${formatEuro(r.total)}`)
      afterSale()
    } catch (e) {
      toast(e.message, 'error')
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
          <CategoryFilterButton products={products} selected={cats} onChange={setCats} />
        </div>
        <CategoryFilter products={products} selected={cats} onChange={setCats} />
        <div className="grid">
          {filtered.map((p) => {
            const promo = promoLabel(p)
            return (
              <button key={p.id} className={`card ${esgotado(p) ? 'out' : ''} ${cart[p.id] ? 'in-cart' : ''}`} onClick={() => add(p)}>
                <span className="card-name">{p.nome}</span>
                {p.tamanho && <span className="card-size">{p.tamanho}</span>}
                <span className="card-price">{p.valor > 0 ? formatEuro(p.valor) : <span className="badge warn">Sem preço</span>}</span>
                {promo && <span className="badge">{promo}</span>}
                <span className="card-stock">Stock: <StockValue product={p} /></span>
                {cart[p.id] > 0 && <span className="card-count">{cart[p.id]}</span>}
              </button>
            )
          })}
          {!filtered.length && <p className="muted">Nenhum produto encontrado.</p>}
        </div>
      </section>

      {lines.length > 0 && (
        <button className="mobile-cart-bar" onClick={() => document.getElementById('carrinho')?.scrollIntoView({ behavior: 'smooth' })}>
          <span>Carrinho · {lines.reduce((n, l) => n + l.quantidade, 0)} artigo(s)</span>
          <strong>{formatEuro(venda.desconto > 0 ? venda.total : total)} ↓</strong>
        </button>
      )}

      {/* botão do drawer (só aparece no computador) */}
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
        {(!atividade.trim() || !vendedor.trim()) && (
          <div className="session-warning">
            Falta definir {!atividade.trim() && 'a atividade'}{!atividade.trim() && !vendedor.trim() && ' e '}{!vendedor.trim() && 'o responsável'}.
            <button type="button" className="small" onClick={() => goTo('config')}>Abrir Configurações</button>
          </div>
        )}
        {!lines.length && <p className="muted">Clica num produto para adicionar.</p>}
        <ul className="cart-lines">
          {lines.map((l) => (
            <li key={l.product.id} className={faltaStock(l.product, l.quantidade) ? 'no-stock' : ''}>
              <div className="line-info">
                <strong>{l.product.nome}</strong> {l.product.tamanho && <span className="muted">· {l.product.tamanho}</span>}
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

      {confirm?.line && (
        <ConfirmModal
          title="Apagar artigo do carrinho?"
          confirmLabel="Apagar"
          danger
          onCancel={() => setConfirm(null)}
          onConfirm={() => { remove(confirm.line.product.id); setConfirm(null) }}
        >
          <strong>{confirm.line.quantidade}× {confirm.line.product.nome}</strong>
          {confirm.line.product.tamanho && ` · ${confirm.line.product.tamanho}`} — {formatEuro(confirm.line.total)}
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
