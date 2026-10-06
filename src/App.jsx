import { useEffect, useState } from 'react'
import { openDatabase } from './db/database.js'
import { ToastProvider } from './components/Toast.jsx'
import Vender from './pages/Vender.jsx'
import Produtos from './pages/Produtos.jsx'
import Vendas from './pages/Vendas.jsx'
import Config from './pages/Config.jsx'
import CartBadge from './components/CartBadge.jsx'

const TABS = [
  { id: 'vender', label: 'Vender', Comp: Vender },
  { id: 'produtos', label: 'Produtos', Comp: Produtos },
  { id: 'vendas', label: 'Vendas do dia', Comp: Vendas },
]

// O separador Configurações usa o endereço …/#config (também se pode abrir diretamente por aí).
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
  const [vendedor, setVendedor] = useState(() => store.get('loja.vendedor')) // "Responsável"
  const [atividade, setAtividade] = useState(() => store.get('loja.atividade'))

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
    if (id === 'config') { window.location.hash = 'config'; return }
    if (isConfigUrl()) history.replaceState(null, '', window.location.pathname + window.location.search)
    setConfigOpen(false)
    if (TABS.some((t) => t.id === id)) setTab(id)
  }
  useEffect(() => store.set('loja.vendedor', vendedor), [vendedor])
  useEffect(() => store.set('loja.atividade', atividade), [atividade])

  if (error) return <div className="center error">Erro ao abrir a base de dados: {String(error.message || error)}</div>
  if (!ready) return <div className="center">A carregar…</div>

  const Current = (TABS.find((t) => t.id === tab) ?? TABS[0]).Comp

  return (
    <ToastProvider>
      <header className="topbar">
        <div className="topbar-main">
          <strong className="brand">
            Loja
            {offlineReady && <span className="offline-ok" title="Guardada neste dispositivo: funciona sem internet">✓ offline</span>}
          </strong>
          {/* só leitura: Atividade e Responsável definem-se nas Configurações */}
          <div className="session-info">
            <span>Atividade: <strong className={atividade.trim() ? '' : 'missing'}>{atividade.trim() || '—'}</strong></span>
            <span>Responsável: <strong className={vendedor.trim() ? '' : 'missing'}>{vendedor.trim() || '—'}</strong></span>
          </div>
        </div>
        <nav className="tabs">
          {TABS.map((t) => (
            <button key={t.id} className={!configOpen && t.id === tab ? 'active' : ''} onClick={() => goTo(t.id)}>
              {t.label}
              {t.id === 'vender' && <CartBadge />}
            </button>
          ))}
          <button className={configOpen ? 'active' : ''} onClick={() => { window.location.hash = 'config' }}>
            Configurações
          </button>
        </nav>
      </header>
      <main>
        {configOpen ? (
          <Config vendedor={vendedor} setVendedor={setVendedor} atividade={atividade} setAtividade={setAtividade} goTo={goTo} />
        ) : (
          <Current vendedor={vendedor} atividade={atividade} goTo={goTo} />
        )}
      </main>
    </ToastProvider>
  )
}
