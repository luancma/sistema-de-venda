import { sha256 } from './sha256.js'

// SHA-256 da senha de administração (a senha não fica em texto simples no código).
// Para mudar: node -e "console.log(require('crypto').createHash('sha256').update('NOVA_SENHA').digest('hex'))"
const PASSWORD_HASH = 'e4f929c67e22d08600469909e2bdbc675d01a2114b732ac7d2f9550cbc249492'

export const checkAdminPassword = (pwd) => sha256(String(pwd ?? '')) === PASSWORD_HASH
