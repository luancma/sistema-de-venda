import { useState } from 'react'
import { sha256 } from '../lib/sha256.js'

// SHA-256 da senha das Configurações (a senha não fica em texto simples no código).
// Para mudar a senha: node -e "console.log(require('crypto').createHash('sha256').update('NOVA_SENHA').digest('hex'))"
const PASSWORD_HASH = 'e4f929c67e22d08600469909e2bdbc675d01a2114b732ac7d2f9550cbc249492'
const SESSION_KEY = 'loja.config.unlocked'

const session = {
  get: () => { try { return sessionStorage.getItem(SESSION_KEY) === '1' } catch { return false } },
  set: (v) => { try { v ? sessionStorage.setItem(SESSION_KEY, '1') : sessionStorage.removeItem(SESSION_KEY) } catch { /* ignora */ } },
}

/** Pede a senha antes de mostrar `children`. Fica desbloqueado até fechar o separador do browser. */
export default function ConfigGate({ children, onExit }) {
  const [unlocked, setUnlocked] = useState(session.get)
  const [pwd, setPwd] = useState('')
  const [wrong, setWrong] = useState(false)

  function submit(e) {
    e.preventDefault()
    if (sha256(pwd) === PASSWORD_HASH) {
      session.set(true)
      setUnlocked(true)
    } else {
      setWrong(true)
      setPwd('')
    }
  }

  function lock() {
    session.set(false)
    onExit()
  }

  if (unlocked) {
    return (
      <>
        <div className="row between config-bar">
          <span className="muted">Área restrita</span>
          <button className="small" onClick={lock}>Bloquear e sair</button>
        </div>
        {children}
      </>
    )
  }

  return (
    <form className="panel login" onSubmit={submit}>
      <h2>Configurações</h2>
      <label>
        Senha
        <input
          type="password"
          autoFocus
          autoComplete="current-password"
          value={pwd}
          onChange={(e) => { setPwd(e.target.value); setWrong(false) }}
        />
      </label>
      {wrong && <p className="error small">Senha incorreta.</p>}
      <div className="row between">
        <button type="button" onClick={onExit}>Voltar</button>
        <button className="primary" disabled={!pwd}>Entrar</button>
      </div>
    </form>
  )
}
