import { describe, expect, it } from 'vitest'
import { EXPORT_COLUMNS } from '../src/pages/Vendas.tsx'

describe('CSV de vendas', () => {
  it('as colunas antigas mantêm a posição; SKU, SKU PAI e COR vão para o fim', () => {
    expect(EXPORT_COLUMNS.map((c) => c.header)).toEqual([
      'DATA', 'HORA', 'NOME DO PRODUTO', 'TAMANHO', 'CAIXA DE DESTINO', 'QTD', 'PRECO UNITARIO', 'DESCONTO', 'DESCONTO VENDA',
      'TIPO DESCONTO', 'PRECO', 'PROMOCAO', 'NOME', 'NUCLEO', 'ATIVIDADE', 'RESPONSAVEL', 'OBSERVACAO', 'VENDA', 'ID',
      'SKU', 'SKU PAI', 'COR',
    ])
  })
})
