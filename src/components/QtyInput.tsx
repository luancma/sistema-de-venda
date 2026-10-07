import { useEffect, useState, type CSSProperties } from 'react'

/**
 * Quantidade de uma linha do carrinho. Nunca desce abaixo de 1:
 * para tirar um artigo do carrinho é preciso usar o botão de apagar.
 */
export default function QtyInput({ value, onChange }: { value: number; onChange: (q: number) => void }) {
  const [draft, setDraft] = useState(String(value))
  useEffect(() => setDraft(String(value)), [value])

  const commit = (raw: string) => {
    const n = parseInt(raw, 10)
    if (Number.isFinite(n) && n >= 1) onChange(n)
  }

  return (
    <div className="qty">
      <button type="button" onClick={() => onChange(value - 1)} disabled={value <= 1} aria-label="menos">−</button>
      <input
        type="number"
        inputMode="numeric"
        min="1"
        value={draft}
        style={{ '--digits': Math.max(2, String(draft || value).length) } as CSSProperties} // a largura acompanha o nº de dígitos
        onChange={(e) => { setDraft(e.target.value); commit(e.target.value) }}
        onBlur={() => setDraft(String(value))} // vazio ou 0 -> volta ao valor atual
      />
      <button type="button" onClick={() => onChange(value + 1)} aria-label="mais">+</button>
    </div>
  )
}
