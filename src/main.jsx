import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
// Tema retro 16-bit: SNES.css (https://snes-css.sadlative.com) + fonte "Press Start 2P" local (offline)
import '@fontsource/press-start-2p/latin-400.css'
import 'snes.css/dist/snes.css'
import './styles.css'

// iPhone/iPad: o Safari faz zoom ao tocar num campo com letra < 16px (e a fonte pixel a 16px fica enorme).
// maximum-scale=1 evita esse zoom automático; no iOS o zoom com dois dedos continua a funcionar.
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
if (isIOS) {
  const vp = document.querySelector('meta[name="viewport"]')
  vp?.setAttribute('content', `${vp.getAttribute('content')}, maximum-scale=1`)
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
