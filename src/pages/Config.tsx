import { useState, type ChangeEvent } from 'react'
import { wipeData } from '../db/repo.ts'
import { exportDatabase, replaceDatabase } from '../db/database.ts'
import { downloadFile } from '../lib/csv.ts'
import { useToast } from '../components/Toast.tsx'
import CategoriasManager from '../components/CategoriasManager.tsx'
import NucleosManager from '../components/NucleosManager.tsx'
import AtividadeInput from '../components/AtividadeInput.tsx'
import PasswordConfirmModal from '../components/PasswordConfirmModal.tsx'
import { useConfirm } from '../components/ConfirmProvider.tsx'
import { useSessao, nomeValido } from '../lib/sessionStore.ts'
import { errorMessage } from '../lib/errors.ts'
import TrashIcon from '../components/TrashIcon.tsx'

const today = () => new Date().toLocaleDateString('sv-SE')

export default function Config() {
  const { responsavel, setResponsavel, atividade, setAtividade } = useSessao()
  const toast = useToast()
  const confirm = useConfirm()
  const [wiping, setWiping] = useState<'vendas' | 'tudo' | null>(null) // confirmação com senha aberta
  const [showAdvanced, setShowAdvanced] = useState(false) // opções da base de dados ficam escondidas por defeito

  function backup() {
    downloadFile(`loja-backup-${today()}.json`, exportDatabase(), 'application/json')
  }

  async function restore(e: ChangeEvent<HTMLInputElement>) {
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
      toast(`Ficheiro inválido: ${errorMessage(err)}`, 'error')
    }
  }

  // chamada só depois da confirmação com senha (PasswordConfirmModal)
  async function wipe(what: 'vendas' | 'tudo') {
    await wipeData(what)
    toast(what === 'vendas' ? 'Todas as vendas foram apagadas.' : 'Todos os dados foram apagados.')
    setWiping(null)
  }

  return (
    <div className="page">
      <section className="panel">
        <h2>Atividade e responsável</h2>
        <p className="muted">
          Ficam gravados em cada venda e guardados neste aparelho. São obrigatórios: sem eles não se sai desta página.
        </p>
        <div className="form-grid">
          <label className={nomeValido(atividade) ? '' : 'invalid'}>Atividade
            <AtividadeInput value={atividade} onChange={setAtividade} />
            {!nomeValido(atividade) && <span className="field-error">Obrigatória — tem de ter letras ou números.</span>}
          </label>
          <label className={nomeValido(responsavel) ? '' : 'invalid'}>Responsável
            <input value={responsavel} onChange={(e) => setResponsavel(e.target.value)} placeholder="O teu nome" />
            {!nomeValido(responsavel) && <span className="field-error">Obrigatório — tem de ter letras ou números.</span>}
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
                <input type="file" accept=".json,application/json" onChange={restore} hidden />
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
