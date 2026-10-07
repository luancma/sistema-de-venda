import { useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react'
import { openDatabase } from './db/database.ts'
import type { DbState } from './types.ts'
import { ToastProvider, useToast } from './components/Toast.tsx'
import { ConfirmProvider } from './components/ConfirmProvider.tsx'
import Vender from './pages/Vender.tsx'
import Produtos from './pages/Produtos.tsx'
import Vendas from './pages/Vendas.tsx'
import Config from './pages/Config.tsx'
import CartBadge from './components/CartBadge.tsx'
import WelcomeModal from './components/WelcomeModal.tsx'
import { useSessao, nomeValido, sessaoValida } from './lib/sessionStore.ts'
import type { PageId, PageProps } from './types.ts'
import { errorMessage } from './lib/errors.ts'

const TABS: { id: Exclude<PageId, 'config'>; label: string; Comp: ComponentType<PageProps> }[] = [
  { id: 'vender', label: 'Vender', Comp: Vender },
  { id: 'produtos', label: 'Produtos', Comp: Produtos },
  { id: 'vendas', label: 'Vendas do dia', Comp: Vendas },
]

// ícones da barra inferior (telemóvel)
const svg = (children: ReactNode) => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
)
const NAV_ICONS: Record<PageId, ReactNode> = {
  vender: svg(<><path d="M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h8.9a1 1 0 0 0 1-.8L20 8H6.2" /><circle cx="9" cy="20" r="1.4" /><circle cx="17" cy="20" r="1.4" /></>),
  produtos: svg(<><path d="M3 7l9-4 9 4-9 4-9-4z" /><path d="M3 7v10l9 4 9-4V7" /><path d="M12 11v10" /></>),
  vendas: svg(<><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6M9 16h4" /></>),
  config: svg(<><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" /></>),
}
// nomes curtos para a barra inferior
const NAV_SHORT: Record<PageId, string> = { vender: 'Vender', produtos: 'Produtos', vendas: 'Vendas', config: 'Config.' }

// O separador Configurações usa o endereço …/#config (também se pode abrir diretamente por aí).
const CONFIG_HASH = '#config'
const isConfigUrl = () => window.location.hash.toLowerCase() === CONFIG_HASH

/** 1.ª utilização: ainda não há nenhum dado. */
const isFirstUse = (data: DbState) =>
  !data.products.length && !data.transactions.length && !data.nucleos.length && !data.categorias.length

const SESSAO_EM_FALTA = 'Preenche a Atividade e o Responsável (com letras ou números) para continuar.'

const store = {
  get: (k: string, d = '') => { try { return localStorage.getItem(k) ?? d } catch { return d } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* ignora */ } },
}

export default function App() {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <Shell />
      </ConfirmProvider>
    </ToastProvider>
  )
}

function Shell() {
  const toast = useToast()
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [tab, setTab] = useState<PageId>(() => {
    const saved = store.get('loja.tab', 'vender')
    return TABS.find((t) => t.id === saved)?.id ?? 'vender'
  })
  const [configOpen, setConfigOpen] = useState(isConfigUrl)
  const { responsavel, atividade } = useSessao() // só para mostrar no topo; editam-se nas Configurações

  const [welcome, setWelcome] = useState(false)
  useEffect(() => {
    openDatabase()
      .then((data) => {
        // Atividade e Responsável são obrigatórios: sem eles abre nas Configurações
        // (na 1.ª utilização, com a janela de boas-vindas que os pede)
        if (!sessaoValida(useSessao.getState())) {
          window.location.hash = 'config'
          setConfigOpen(true)
          if (isFirstUse(data)) setWelcome(true)
        }
        setReady(true)
      })
      .catch((e) => setError(e))
  }, [])
  // indica quando a app ficou guardada no dispositivo e já pode ser usada sem internet
  const [offlineReady, setOfflineReady] = useState(false)
  useEffect(() => {
    navigator.serviceWorker?.ready.then(() => setOfflineReady(true)).catch(() => {})
  }, [])
  useEffect(() => store.set('loja.tab', tab), [tab])
  const toastRef = useRef(toast)
  toastRef.current = toast
  useEffect(() => {
    const onHash = () => {
      // p.ex. botão "voltar" do browser: não sai das Configurações sem Atividade e Responsável
      if (!isConfigUrl() && !sessaoValida(useSessao.getState())) {
        window.location.hash = 'config'
        toastRef.current(SESSAO_EM_FALTA, 'error')
        return
      }
      setConfigOpen(isConfigUrl())
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // sai das Configurações: tira o #config do endereço e volta ao separador escolhido
  function goTo(id: PageId) {
    if (id === 'config') { window.location.hash = 'config'; return }
    if (!sessaoValida(useSessao.getState())) {
      if (!configOpen) window.location.hash = 'config'
      toast(SESSAO_EM_FALTA, 'error')
      return
    }
    if (isConfigUrl()) history.replaceState(null, '', window.location.pathname + window.location.search)
    setConfigOpen(false)
    if (TABS.some((t) => t.id === id)) setTab(id)
  }

  if (error) return <div className="center error">Erro ao abrir a base de dados: {errorMessage(error)}</div>
  if (!ready) return <div className="center">A carregar…</div>

  const Current = (TABS.find((t) => t.id === tab) ?? TABS[0]).Comp

  return (
    <>
      <header className="topbar">
        <div className="topbar-main">
          <strong className="brand">
            Loja
            {offlineReady && <span className="offline-ok" title="Guardada neste dispositivo: funciona sem internet">✓ offline</span>}
          </strong>
          {/* só leitura: Atividade e Responsável definem-se nas Configurações */}
          <div className="session-info">
            <span>Atividade: <strong className={nomeValido(atividade) ? '' : 'missing'}>{nomeValido(atividade) ? atividade.trim() : '—'}</strong></span>
            <span>Responsável: <strong className={nomeValido(responsavel) ? '' : 'missing'}>{nomeValido(responsavel) ? responsavel.trim() : '—'}</strong></span>
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
          <Config />
        ) : (
          <Current goTo={goTo} />
        )}
      </main>
      {/* telemóvel: menu fixo no fundo do ecrã, ao alcance do polegar (no computador fica escondido) */}
      <nav className="bottom-nav" aria-label="Menu">
        {[...TABS.map((t) => t.id), 'config' as const].map((id) => {
          const active = id === 'config' ? configOpen : !configOpen && id === tab
          return (
            <button key={id} className={active ? 'active' : ''} aria-current={active ? 'page' : undefined} onClick={() => goTo(id)}>
              <span className="bottom-nav-icon">
                {NAV_ICONS[id]}
                {id === 'vender' && <CartBadge />}
              </span>
              {NAV_SHORT[id]}
            </button>
          )
        })}
      </nav>
      {welcome && (
        <WelcomeModal onDone={() => setWelcome(false)} />
      )}
    </>
  )
}
