import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
// Tema retro 16-bit: SNES.css (https://snes-css.sadlative.com) + fonte "Press Start 2P" local (offline)
import '@fontsource/press-start-2p/latin-400.css'
import 'snes.css/dist/snes.css'
import './styles.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
