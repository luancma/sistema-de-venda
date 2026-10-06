import { useEffect, useState } from 'react'
import { openDatabase } from './db/database.js'
import { ToastProvider } from './components/Toast.jsx'
import Vender from './pages/Vender.jsx'
import Produtos from './pages/Produtos.jsx'
import Vendas from './pages/Vendas.jsx'
import Config from './pages/Config.jsx'
import CartBadge from './components/CartBadge.jsx'
import ConfigGate from './components/ConfigGate.jsx'

const TABS = [
  { id: 'vender', label: 'Vender', Comp: Vender },
  { id: 'produtos', label: 'Produtos', Comp: Produtos },
  { id: 'vendas', label: 'Vendas do dia', Comp: Vendas },
]

// As Configurações não aparecem nos separadores: só se abrem pelo endereço …/#config
// (e pedem senha — ver components/ConfigGate.jsx).
const CONFIG_HASH = '#config'
const isConfigUrl = () => window.location.hash.toLowerCase() === CONFIG_HASH

const store = {
  get: (k, d = '') => { try { return localStorage.getItem(k) ?? d } catch { return d } },
  set: (k, v) => { try { localStorage.setItem(k, v) } catch { /* ignora */ } },
}

export default function App() {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState(null)
  const [tab, setTab] = useState(() => {
    const saved = store.get('loja.tab', 'vender')
    return TABS.some((t) => t.id === saved) ? saved : 'vender'
  })
  const [configOpen, setConfigOpen] = useState(isConfigUrl)
  const [vendedor, setVendedor] = useState(() => store.get('loja.vendedor'))

  useEffect(() => {
    openDatabase().then(() => setReady(true)).catch((e) => setError(e))
  }, [])
  // indica quando a app ficou guardada no dispositivo e já pode ser usada sem internet
  const [offlineReady, setOfflineReady] = useState(false)
  useEffect(() => {
    navigator.serviceWorker?.ready.then(() => setOfflineReady(true)).catch(() => {})
  }, [])
  useEffect(() => store.set('loja.tab', tab), [tab])
  useEffect(() => {
    const onHash = () => setConfigOpen(isConfigUrl())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // sai das Configurações: tira o #config do endereço e volta ao separador escolhido
  function goTo(id) {
    if (isConfigUrl()) history.replaceState(null, '', window.location.pathname + window.location.search)
    setConfigOpen(false)
    if (TABS.some((t) => t.id === id)) setTab(id)
  }
  useEffect(() => store.set('loja.vendedor', vendedor), [vendedor])

  if (error) return <div className="center error">Erro ao abrir a base de dados: {String(error.message || error)}</div>
  if (!ready) return <div className="center">A carregar…</div>

  const Current = (TABS.find((t) => t.id === tab) ?? TABS[0]).Comp

  return (
    <ToastProvider>
      <header className="topbar">
        <strong className="brand">
          Loja
          {offlineReady && <span className="offline-ok" title="Guardada neste dispositivo: funciona sem internet">✓ offline</span>}
        </strong>
        <nav className="tabs">
          {TABS.map((t) => (
            <button key={t.id} className={!configOpen && t.id === tab ? 'active' : ''} onClick={() => goTo(t.id)}>
              {t.label}
              {t.id === 'vender' && <CartBadge />}
            </button>
          ))}
        </nav>
        <label className="seller">
          Vendedor
          <input value={vendedor} onChange={(e) => setVendedor(e.target.value)} placeholder="O teu nome" />
        </label>
      </header>
      <main>
        {configOpen ? (
          <ConfigGate onExit={() => goTo(tab)}>
            <Config vendedor={vendedor} goTo={goTo} />
          </ConfigGate>
        ) : (
          <Current vendedor={vendedor} goTo={goTo} />
        )}
      </main>
    </ToastProvider>
  )
}
