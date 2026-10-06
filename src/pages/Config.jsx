import { useState } from 'react'
import { useQuery } from '../db/useDb.js'
import { listNucleos, addNucleo, deleteNucleo } from '../db/repo.js'
import { exportDatabase, replaceDatabase, execRaw, write, run } from '../db/database.js'
import { downloadFile } from '../lib/csv.js'
import { useToast } from '../components/Toast.jsx'
import CategoriasManager from '../components/CategoriasManager.jsx'
import AtividadeInput from '../components/AtividadeInput.jsx'
import PasswordConfirmModal from '../components/PasswordConfirmModal.jsx'

const today = () => new Date().toLocaleDateString('sv-SE')

const SQL_EXAMPLES = [
  "UPDATE products SET promocao = 'LEVE_2_PAGUE_1' WHERE nome LIKE 'T-shirt%';",
  "UPDATE products SET promocao = 'PACK_3', preco_especial = 10 WHERE nome = 'Caneca';",
  'SELECT nucleo, SUM(preco) AS total FROM transactions GROUP BY nucleo;',
]

export default function Config({ vendedor, setVendedor, atividade, setAtividade }) {
  const toast = useToast()
  const nucleos = useQuery(listNucleos)
  const [novo, setNovo] = useState('')
  const [sql, setSql] = useState(SQL_EXAMPLES[0])
  const [result, setResult] = useState(null)
  const [wiping, setWiping] = useState(null) // 'vendas' | 'tudo' — confirmação com senha aberta
  const [showAdvanced, setShowAdvanced] = useState(false) // base de dados + consola SQL ficam escondidas por defeito

  async function add(e) {
    e.preventDefault()
    const nomes = novo.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean)
    if (!nomes.length) return
    for (const n of nomes) await addNucleo(n)
    setNovo('')
  }

  function backup() {
    downloadFile(`loja-backup-${today()}.sqlite`, new Blob([exportDatabase()], { type: 'application/x-sqlite3' }))
  }

  async function restore(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!window.confirm('Substituir TODOS os dados atuais pelo backup?')) return
    try {
      await replaceDatabase(await file.arrayBuffer())
      toast('Backup restaurado.')
    } catch (err) {
      toast(`Ficheiro inválido: ${err.message}`, 'error')
    }
  }

  // chamada só depois da confirmação com senha (PasswordConfirmModal)
  async function wipe(what) {
    await write(() => {
      run('DELETE FROM transactions')
      if (what === 'tudo') { run('DELETE FROM products'); run('DELETE FROM nucleos') }
    })
    toast(what === 'vendas' ? 'Todas as vendas foram apagadas.' : 'Todos os dados foram apagados.')
    setWiping(null)
  }

  async function runSql() {
    try {
      const res = await execRaw(sql)
      setResult({ ok: true, res })
      if (!res.length) toast('SQL executado.')
    } catch (err) {
      setResult({ ok: false, error: err.message })
    }
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

      <section className="panel">
        <h2>Núcleos</h2>
        <p className="muted">O núcleo a que o comprador pertence — é obrigatório em cada venda.</p>
        <form className="row" onSubmit={add}>
          <input value={novo} onChange={(e) => setNovo(e.target.value)} placeholder="Nome do núcleo (podes colar vários separados por vírgula)" className="grow" />
          <button className="primary">Adicionar</button>
        </form>
        <div className="by-nucleo">
          {nucleos.map((n) => (
            <span key={n} className="chip">
              {n}
              <button className="chip-x" onClick={() => deleteNucleo(n)} aria-label={`remover ${n}`}>×</button>
            </span>
          ))}
          {!nucleos.length && <span className="muted">Ainda não há núcleos.</span>}
        </div>
      </section>

      <CategoriasManager />

      <label className="toggle">
        <input type="checkbox" checked={showAdvanced} onChange={(e) => setShowAdvanced(e.target.checked)} />
        <span className="toggle-track" aria-hidden="true" />
        Opções avançadas <span className="muted">(base de dados e consola SQL)</span>
      </label>

      {showAdvanced && (
        <>
          <section className="panel">
            <h2>Base de dados</h2>
            <p className="muted">Os dados ficam guardados neste browser (IndexedDB). Faz backup do ficheiro SQLite regularmente.</p>
            <div className="row wrap">
              <button onClick={backup}>Descarregar backup (.sqlite)</button>
              <label className="button">
                Restaurar backup…
                <input type="file" accept=".sqlite,.db,application/x-sqlite3" onChange={restore} hidden />
              </label>
              <button className="danger" onClick={() => setWiping('vendas')}>Apagar vendas</button>
              <button className="danger" onClick={() => setWiping('tudo')}>Apagar tudo</button>
            </div>
          </section>

          <section className="panel">
            <h2>Consola SQL</h2>
            <p className="muted">
              Tabelas: <code>products</code>, <code>transactions</code>, <code>nucleos</code>. Promoções:{' '}
              <code>LEVE_N_PAGUE_M</code> (ex.: 2 por 1 = <code>LEVE_2_PAGUE_1</code>; compre 3 leve 1 = <code>LEVE_4_PAGUE_3</code>) ou{' '}
              <code>PACK_N</code> + <code>preco_especial</code>.
            </p>
            <div className="row wrap">
              {SQL_EXAMPLES.map((s, i) => <button key={i} className="small" onClick={() => setSql(s)}>Exemplo {i + 1}</button>)}
            </div>
            <textarea rows={4} value={sql} onChange={(e) => setSql(e.target.value)} spellCheck={false} />
            <div className="row"><button className="primary" onClick={runSql}>Executar</button></div>
            {result && !result.ok && <pre className="error">{result.error}</pre>}
            {result?.ok && result.res.map((r, i) => (
              <div key={i} className="table-wrap">
                <table>
                  <thead><tr>{r.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
                  <tbody>{r.values.map((row, j) => <tr key={j}>{row.map((v, k) => <td key={k}>{v == null ? '∅' : String(v)}</td>)}</tr>)}</tbody>
                </table>
              </div>
            ))}
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
