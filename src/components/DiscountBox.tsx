import { useEffect, useRef, useState } from 'react'
import { formatEuro, type SaleDiscount } from '../lib/pricing.ts'
import type { DiscountMode } from '../types.ts'
import TrashIcon from './TrashIcon.tsx'

const MODES: { id: DiscountMode; label: string; hint: string }[] = [
  { id: 'valor', label: '€ desconto', hint: 'Valor a descontar (€)' },
  { id: 'percent', label: '% desconto', hint: 'Percentagem (%)' },
  { id: 'total', label: 'Novo total', hint: 'Novo valor da venda (€)' },
]

/** "Dar desconto" no carrinho: valor a descontar, percentagem ou novo valor total. */
interface Props {
  mode: DiscountMode
  value: string
  /** subtotal do carrinho, em euros */
  subtotal: number
  result: SaleDiscount
  onChange: (mode: DiscountMode, value: string) => void
  onClear: () => void
}

export default function DiscountBox({ mode, value, subtotal, result, onChange, onClear }: Props) {
  const [open, setOpen] = useState(Boolean(value))
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { if (value) setOpen(true) }, [value])
  useEffect(() => { if (subtotal <= 0) setOpen(false) }, [subtotal]) // carrinho vazio (p.ex. depois de vender)
  useEffect(() => { if (open) inputRef.current?.focus() }, [open, mode])

  if (!open) {
    return (
      <button type="button" className="discount-toggle" onClick={() => setOpen(true)} disabled={subtotal <= 0}>
        % Dar desconto
      </button>
    )
  }
  const hint = MODES.find((m) => m.id === mode)?.hint
  return (
    <div className="discount-box">
      <div className="discount-modes" role="radiogroup" aria-label="Tipo de desconto">
        {MODES.map((m) => (
          <button key={m.id} type="button" role="radio" aria-checked={mode === m.id}
            className={mode === m.id ? 'on' : ''} onClick={() => onChange(m.id, '')}>
            {m.label}
          </button>
        ))}
      </div>
      <label>
        {hint}
        <input ref={inputRef} inputMode="decimal" value={value} placeholder={mode === 'percent' ? '10' : '0,00'}
          onChange={(e) => onChange(mode, e.target.value)} />
      </label>
      {result.error
        ? <p className="error small">{result.error}</p>
        : result.desconto > 0 && (
          <p className="discount-preview">
            −{formatEuro(result.desconto)} ({String(result.percent).replace('.', ',')}%) → {formatEuro(result.total)}
          </p>
        )}
      <button type="button" className="small with-icon" onClick={() => { onClear(); setOpen(false) }}><TrashIcon size={14} />Remover desconto</button>
    </div>
  )
}
