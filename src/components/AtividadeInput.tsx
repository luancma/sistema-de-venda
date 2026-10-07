import { useQuery } from '../db/useDb.ts'
import { listAtividades } from '../db/repo.ts'

/** Campo "Atividade" do topo, com sugestões das atividades já usadas. */
export default function AtividadeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const atividades = useQuery(listAtividades)
  return (
    <>
      <input list="atividades-list" value={value} onChange={(e) => onChange(e.target.value)} placeholder="Ex.: Feira de outubro" />
      <datalist id="atividades-list">
        {atividades.map((a) => <option key={a} value={a} />)}
      </datalist>
    </>
  )
}
