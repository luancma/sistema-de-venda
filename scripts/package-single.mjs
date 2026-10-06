// Renomeia dist-single/index.html -> loja.html e cria o zip para partilhar (Drive, email, pen...).
import { renameSync, existsSync, copyFileSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const out = 'dist-single'
if (existsSync(`${out}/index.html`)) renameSync(`${out}/index.html`, `${out}/loja.html`)
copyFileSync('sample/produtos-exemplo.csv', `${out}/produtos-exemplo.csv`)
writeFileSync(`${out}/LEIA-ME.txt`, readFileSync('scripts/LEIA-ME.txt'))
try {
  rmSync('loja.zip', { force: true })
  execSync(`cd ${out} && zip -q -r ../loja.zip loja.html LEIA-ME.txt produtos-exemplo.csv`)
  console.log('✓ loja.zip criado')
} catch {
  console.log(`(zip não disponível — partilha a pasta ${out}/)`)
}
