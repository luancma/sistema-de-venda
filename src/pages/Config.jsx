import { useState } from 'react'
import { wipeData } from '../db/repo.js'
import { exportDatabase, replaceDatabase } from '../db/database.js'
import { downloadFile } from '../lib/csv.js'
import { useToast } from '../components/Toast.jsx'
import CategoriasManager from '../components/CategoriasManager.jsx'
import NucleosManager from '../components/NucleosManager.jsx'
import AtividadeInput from '../components/AtividadeInput.jsx'
import PasswordConfirmModal from '../components/PasswordConfirmModal.jsx'
import { useConfirm } from '../components/ConfirmProvider.jsx'
import { useSessao } from '../lib/sessionStore.js'
import TrashIcon from '../components/TrashIcon.jsx'

const today = () => new Date().toLocaleDateString('sv-SE')

export default function Config() {
  const { vendedor, setVendedor, atividade, setAtividade } = useSessao()
  const toast = useToast()
  const confirm = useConfirm()
  const [wiping, setWiping] = useState(null) // 'vendas' | 'tudo' — confirmação com senha aberta
  const [showAdvanced, setShowAdvanced] = useState(false) // opções da base de dados ficam escondidas por defeito

  function backup() {
    downloadFile(`loja-backup-${today()}.json`, exportDatabase(), 'application/json')
  }

  async function restore(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const ok = await confirm({
      title: 'Restaurar backup?',
      message: 'TODOS os dados atuais deste aparelho vão ser substituídos pelos do backup.',
      confirmLabel: 'Restaurar',
      danger: true,
    })
    if (!ok) return
    try {
      await replaceDatabase(await file.arrayBuffer())
      toast('Backup restaurado.')
    } catch (err) {
      toast(`Ficheiro inválido: ${err.message}`, 'error')
    }
  }

  // chamada só depois da confirmação com senha (PasswordConfirmModal)
  async function wipe(what) {
    await wipeData(what)
    toast(what === 'vendas' ? 'Todas as vendas foram apagadas.' : 'Todos os dados foram apagados.')
    setWiping(null)
  }

  return (
    <div className="page">
      <section className="panel">
        <h2>Atividade e responsável</h2>
        <p className="muted">Ficam gravados em cada venda. São obrigatórios para vender e ficam guardados neste aparelho.</p>
        <div className="form-grid">
          <label>Atividade
            <AtividadeInput value={atividade} onChange={setAtividade} />
          </label>
          <label>Responsável
            <input value={vendedor} onChange={(e) => setVendedor(e.target.value)} placeholder="O teu nome" />
          </label>
        </div>
      </section>

      <NucleosManager />

      <CategoriasManager />

      <label className="toggle">
        <input type="checkbox" checked={showAdvanced} onChange={(e) => setShowAdvanced(e.target.checked)} />
        <span className="toggle-track" aria-hidden="true" />
        <span>Opções avançadas <span className="muted">(backup e apagar dados)</span></span>
      </label>

      {showAdvanced && (
        <>
          <section className="panel">
            <h2>Base de dados</h2>
            <p className="muted">Os dados ficam guardados neste browser (IndexedDB). Faz backup regularmente.</p>
            <div className="row wrap">
              <button onClick={backup}>Descarregar backup (.json)</button>
              <label className="button">
                Restaurar backup…
                <input type="file" accept=".json,application/json,.sqlite,.db" onChange={restore} hidden />
              </label>
              <button className="danger with-icon" onClick={() => setWiping('vendas')}><TrashIcon size={14} />Apagar vendas</button>
              <button className="danger with-icon" onClick={() => setWiping('tudo')}><TrashIcon size={14} />Apagar tudo</button>
            </div>
          </section>
        </>
      )}
      {wiping && (
        <PasswordConfirmModal
          title={wiping === 'vendas' ? 'Apagar todas as vendas?' : 'Apagar tudo?'}
          confirmLabel={wiping === 'vendas' ? 'Apagar vendas' : 'Apagar tudo'}
          onCancel={() => setWiping(null)}
          onConfirm={() => wipe(wiping)}
        >
          {wiping === 'vendas'
            ? <p>Todas as vendas registadas neste aparelho vão ser apagadas. O stock <strong>não</strong> é reposto.</p>
            : <p>Produtos, vendas e núcleos deste aparelho vão ser apagados.</p>}
          <p className="muted small">Esta ação não se pode desfazer. Sugestão: descarrega primeiro um backup.</p>
        </PasswordConfirmModal>
      )}
    </div>
  )
}
