import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { VitePWA } from 'vite-plugin-pwa'

// O snes.css importa a fonte "Press Start 2P" do Google Fonts (precisa de internet).
// Tiramos esse @import e usamos a cópia local (@fontsource/press-start-2p) para funcionar offline.
const snesOffline = {
  name: 'snes-css-offline',
  enforce: 'pre',
  transform(code, id) {
    if (id.includes('snes.css/dist/snes')) {
      return { code: code.replace(/@import\s+url\([^)]*fonts\.googleapis[^)]*\);?/g, ''), map: null }
    }
  },
}

// Dois tipos de build:
//  npm run build         -> dist/  app web instalável e 100% offline (iPhone, Android, computador).
//                           Publica-se uma vez num alojamento estático; depois do 1.º acesso funciona sem internet.
//  npm run build:single  -> dist-single/loja.html  um só ficheiro para abrir com duplo clique num computador.
export default defineConfig(({ mode }) => {
  const single = mode === 'single'
  return {
    plugins: [
      snesOffline,
      react(),
      single && viteSingleFile({ removeViteModuleLoader: true }),
      !single &&
        VitePWA({
          registerType: 'autoUpdate', // quando houver nova versão publicada, atualiza sozinha
          injectRegister: 'script-defer',
          includeAssets: ['icon-180.png'],
          workbox: {
            // guarda TUDO no telemóvel para funcionar offline
            globPatterns: ['**/*.{js,css,html,png,svg}'],
            maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
            navigateFallback: 'index.html',
          },
          manifest: {
            name: 'Loja',
            short_name: 'Loja',
            description: 'Vendas offline',
            lang: 'pt',
            start_url: './',
            scope: './',
            display: 'standalone',
            orientation: 'any',
            background_color: '#f5f6f8',
            theme_color: '#2563eb',
            icons: [
              { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
              { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
              { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
            ],
          },
        }),
    ].filter(Boolean),
    // caminhos relativos: funciona em qualquer pasta/subcaminho (ex.: GitHub Pages)
    base: './',
    publicDir: single ? false : 'public',
    build: single ? { outDir: 'dist-single', assetsInlineLimit: () => true, chunkSizeWarningLimit: 5000 } : {},
    test: { environment: 'node' },
  }
})
