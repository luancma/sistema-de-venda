import { beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, replaceDatabase, exportDatabase } from '../src/db/database.ts'
import {
  listProducts, saveProduct, deleteProduct, importProducts, listNucleos, addNucleo, deleteNucleo, renameNucleo, countNucleoVendas,
  registerSale, cancelSale, listTransactions, listAtividades, renameCategoria, removeCategoria, wipeData,
  listCategorias, addCategorias, updateProducts, deleteProducts, savePiece, deletePiece, listProductIds, type PieceInput,
} from '../src/db/repo.ts'
import { useCart } from '../src/lib/cartStore.ts'
import { parseProductsCsv } from '../src/lib/csv.ts'

const today = () => new Date().toLocaleDateString('sv-SE')
const json = (obj: unknown) => new TextEncoder().encode(JSON.stringify(obj))

// sem IndexedDB (ambiente node) a base de dados fica só em memória
beforeEach(async () => {
  await openDatabase()
  await replaceDatabase(json({ products: [], transactions: [], nucleos: [] }))
})

describe('produtos', () => {
  it('cria, ordena sem distinguir maiúsculas, edita e apaga', async () => {
    await saveProduct({ nome: 'caneca', qtd: '3', tamanho: '', valor: 5 })
    const id = await saveProduct({ nome: 'Boné', qtd: 2, tamanho: ' U ', valor: '8.5', preco_especial: '', categorias: 'acessorio, olga' })
    expect(listProducts().map((p) => p.nome)).toEqual(['Boné', 'caneca'])
    const bone = listProducts()[0]
    expect(bone).toMatchObject({ qtd: 2, tamanho: 'U', valor: 8.5, preco_especial: null, categorias: 'ACESSORIO,OLGA' })

    await saveProduct({ ...bone, qtd: 7 })
    expect(listProducts()[0].qtd).toBe(7)
    await deleteProduct(id)
    expect(listProducts()).toHaveLength(1)
  })

  it('lista devolve cópias (não altera os dados guardados)', async () => {
    await saveProduct({ nome: 'A', qtd: 1, valor: 1 })
    listProducts()[0].qtd = 99
    expect(listProducts()[0].qtd).toBe(1)
  })

  it('importa em modo merge por SKU_FILHO, mantendo promoção se não vier no CSV', async () => {
    await importProducts([{ sku: 'TS-M', sku_pai: 'TS', nome: 'T-shirt', qtd: 5, tamanho: 'M', valor: 10, promocao: 'LEVE_2_PAGUE_1', preco_especial: null }])
    const r = await importProducts([
      // o nome mudou na folha, mas o SKU é o mesmo: atualiza o mesmo artigo
      { sku: 'TS-M', sku_pai: 'TS', nome: 'T-shirt Logo', qtd: 8, tamanho: 'M', valor: 12, promocao: null, preco_especial: null },
      { sku: 'CAN', sku_pai: 'CAN', nome: 'Caneca', qtd: 1, tamanho: '', valor: 4, promocao: null, preco_especial: null },
    ], 'merge')
    expect(r).toEqual({ created: 1, updated: 1 })
    const t = listProducts().find((p) => p.sku === 'TS-M')
    expect(t).toMatchObject({ nome: 'T-shirt Logo', qtd: 8, valor: 12, promocao: 'LEVE_2_PAGUE_1' })
    await importProducts([{ sku: 'X', sku_pai: 'X', nome: 'X', qtd: 1, valor: 1 }], 'replace')
    expect(listProducts().map((p) => p.nome)).toEqual(['X'])
  })

  it('merge: mesmo nome e tamanho mas cores (SKUs) diferentes ficam 2 artigos', async () => {
    await importProducts([{ sku: 'AML-VD-S', sku_pai: 'AML-VD', nome: 'Camiseta Amílcar', cor: 'Verde', tamanho: 'S', qtd: 5, valor: 15 }])
    const r = await importProducts([{ sku: 'AML-PR-S', sku_pai: 'AML-PR', nome: 'Camiseta Amílcar', cor: 'Preta', tamanho: 'S', qtd: 2, valor: 15 }], 'merge')
    expect(r).toEqual({ created: 1, updated: 0 })
    expect(listProducts().map((p) => [p.cor, p.qtd])).toEqual(expect.arrayContaining([['Verde', 5], ['Preta', 2]]))
  })
})

describe('núcleos', () => {
  it('sem repetidos e por ordem', async () => {
    await addNucleo(' Porto ')
    await addNucleo('Lisboa')
    await addNucleo('Porto')
    expect(listNucleos()).toEqual(['Lisboa', 'Porto'])
    await deleteNucleo('Porto')
    expect(listNucleos()).toEqual(['Lisboa'])
  })

  it('renomeia (e junta) atualizando as vendas já feitas', async () => {
    const a = await saveProduct({ nome: 'A', qtd: 9, valor: 1 })
    await addNucleo('Prto')
    await addNucleo('Porto')
    await registerSale({ items: [{ productId: a, quantidade: 1 }, { productId: a, quantidade: 1 }], nucleo: 'Prto' })
    await registerSale({ items: [{ productId: a, quantidade: 1 }], nucleo: 'Prto' })
    await registerSale({ items: [{ productId: a, quantidade: 1 }], nucleo: 'Porto' })
    expect(countNucleoVendas()).toEqual({ Prto: 2, Porto: 1 })

    expect(await renameNucleo('Prto', ' Porto ')).toBe(2) // junta com o existente
    expect(listNucleos()).toEqual(['Porto'])
    expect(countNucleoVendas()).toEqual({ Porto: 3 })

    expect(await renameNucleo('Porto', 'Porto Centro')).toBe(3)
    expect(listNucleos()).toEqual(['Porto Centro'])
    expect(await renameNucleo('Porto Centro', '  ')).toBe(0) // nome vazio não faz nada
    expect(listNucleos()).toEqual(['Porto Centro'])
  })
})

describe('vendas', () => {
  it('regista, desconta stock, aplica desconto e anula', async () => {
    const a = await saveProduct({ nome: 'A', qtd: 5, tamanho: 'M', valor: 10 })
    const b = await saveProduct({ nome: 'B', qtd: 5, tamanho: 'M', valor: 30 })
    const r = await registerSale({
      items: [{ productId: a, quantidade: 2 }, { productId: b, quantidade: 1 }],
      nome: 'Ana', nucleo: 'Porto', responsavel: 'Rui', atividade: 'Feira', desconto: { mode: 'percent', value: 10 },
    })
    expect(r.total).toBe(45)
    expect(listProducts().map((p) => p.qtd)).toEqual([3, 4])
    const tx = listTransactions(today(), today())
    expect(tx).toHaveLength(2)
    expect(tx.reduce((s, t) => s + t.preco, 0)).toBeCloseTo(45)
    expect(tx[0]).toMatchObject({ venda_id: r.vendaId, nucleo: 'Porto', responsavel: 'Rui', desconto_info: '10%' })
    expect(listAtividades()).toEqual(['Feira'])

    await cancelSale(r.vendaId)
    expect(listTransactions(today(), today())).toHaveLength(0)
    expect(listProducts().map((p) => p.qtd)).toEqual([5, 5])
  })

  it('registerSale copia sku, sku_pai e cor para a venda', async () => {
    const id = await saveProduct({ sku: 'CAM-OLG-2XL', sku_pai: 'CAM-OLG', nome: 'Camiseta Olga', cor: '', tamanho: '2XL', qtd: 5, valor: 15 })
    expect(listProducts()[0]).toMatchObject({ sku: 'CAM-OLG-2XL', sku_pai: 'CAM-OLG', cor: '' })
    await registerSale({ items: [{ productId: id, quantidade: 1 }], nucleo: 'X' })
    expect(listTransactions(today(), today())[0]).toMatchObject({ sku: 'CAM-OLG-2XL', sku_pai: 'CAM-OLG', cor: '' })
  })

  it('2 por 1 conta tamanhos diferentes do mesmo produto', async () => {
    const a = await saveProduct({ sku: 'OLG-2XL', sku_pai: 'OLG', nome: 'Camiseta Olga', tamanho: '2XL', qtd: 5, valor: 15, promocao: 'LEVE_2_PAGUE_1' })
    const b = await saveProduct({ sku: 'OLG-3XL', sku_pai: 'OLG', nome: 'Camiseta Olga', tamanho: '3XL', qtd: 5, valor: 15, promocao: 'LEVE_2_PAGUE_1' })
    const r = await registerSale({ items: [{ productId: a, quantidade: 1 }, { productId: b, quantidade: 1 }], nucleo: 'X' })
    expect(r.total).toBe(15)
    const tx = listTransactions(today(), today()).sort((x, y) => x.sku.localeCompare(y.sku))
    expect(tx.map((t) => [t.sku, t.preco, t.desconto])).toEqual([['OLG-2XL', 15, 0], ['OLG-3XL', 0, 15]])
  })

  it('a mensagem de stock insuficiente diz a cor', async () => {
    const a = await saveProduct({ sku: 'AML-VD-S', sku_pai: 'AML-VD', nome: 'Camiseta Amílcar', cor: 'Verde', tamanho: 'S', qtd: 0, valor: 15 })
    await expect(registerSale({ items: [{ productId: a, quantidade: 1 }], nucleo: 'X' })).rejects.toThrow('Stock insuficiente: Camiseta Amílcar · Verde · S (restam 0).')
  })

  it('sem stock falha e não deixa nada alterado (transação)', async () => {
    const a = await saveProduct({ nome: 'A', qtd: 5, tamanho: 'M', valor: 10 })
    const b = await saveProduct({ nome: 'B', qtd: 0, tamanho: 'M', valor: 10 })
    await expect(registerSale({ items: [{ productId: a, quantidade: 1 }, { productId: b, quantidade: 1 }], nucleo: 'X' }))
      .rejects.toThrow(/Stock insuficiente/)
    expect(listProducts().map((p) => p.qtd)).toEqual([5, 0])
    expect(listTransactions(today(), today())).toHaveLength(0)
  })
})

describe('stock ilimitado (produto "sem limite")', () => {
  it('vende sem verificar nem descontar stock, e anular não mexe no stock', async () => {
    const a = await saveProduct({ nome: 'Rifa', qtd: 0, tamanho: '', valor: 2, sem_limite: true })
    const r = await registerSale({ items: [{ productId: a, quantidade: 50 }], nucleo: 'X' })
    expect(r.total).toBe(100)
    expect(listProducts()[0].qtd).toBe(0)
    await cancelSale(r.vendaId)
    expect(listProducts()[0].qtd).toBe(0)
  })

  it('por defeito controla o stock (mesmo sem tamanho)', async () => {
    const a = await saveProduct({ nome: 'Caneca', qtd: 1, tamanho: '', valor: 2 })
    expect(listProducts()[0].sem_limite).toBe(false)
    await expect(registerSale({ items: [{ productId: a, quantidade: 2 }], nucleo: 'X' })).rejects.toThrow(/Stock insuficiente/)
  })

  it('importar em merge só muda "sem limite" se o CSV tiver a coluna', async () => {
    await importProducts([{ sku: 'RIFA', sku_pai: 'RIFA', nome: 'Rifa', qtd: 0, tamanho: '', valor: 1, sem_limite: true }])
    await importProducts([{ sku: 'RIFA', sku_pai: 'RIFA', nome: 'Rifa', qtd: 0, tamanho: '', valor: 2 }], 'merge')
    expect(listProducts()[0]).toMatchObject({ valor: 2, sem_limite: true })
    await importProducts([{ sku: 'RIFA', sku_pai: 'RIFA', nome: 'Rifa', qtd: 0, tamanho: '', valor: 2, sem_limite: false }], 'merge')
    expect(listProducts()[0].sem_limite).toBe(false)
  })
})

describe('categorias e apagar dados', () => {
  it('renomeia categoria e apaga vendas/tudo', async () => {
    await saveProduct({ nome: 'A', qtd: 1, valor: 1, categorias: 'CAMISETAS,OLGA' })
    expect(await renameCategoria('CAMISETAS', 'camiseta')).toBe(1)
    expect(listProducts()[0].categorias).toBe('CAMISETA,OLGA')
    await addNucleo('N')
    await wipeData('tudo')
    expect(listProducts()).toEqual([])
    expect(listNucleos()).toEqual([])
  })
})

describe('categorias criadas nas Configurações', () => {
  it('lista criadas (0 produtos) e usadas, sem repetidos', async () => {
    expect(await addCategorias('camiseta, Olga ; olga')).toEqual(['CAMISETA', 'OLGA'])
    expect(await addCategorias('OLGA')).toEqual([])
    await saveProduct({ nome: 'A', qtd: 1, valor: 1, categorias: 'CAMISETA,BONE' })
    expect(listCategorias()).toEqual([['BONE', 1], ['CAMISETA', 1], ['OLGA', 0]])
  })

  it('renomear e remover também mudam a lista', async () => {
    await addCategorias('OLGA')
    expect(await renameCategoria('OLGA', 'ROSA')).toBe(0)
    expect(listCategorias()).toEqual([['ROSA', 0]])
    await removeCategoria('ROSA')
    expect(listCategorias()).toEqual([])
  })

  it('vão no backup e "apagar tudo" limpa-as', async () => {
    await addCategorias('OLGA')
    const backup = exportDatabase()
    await wipeData('tudo')
    expect(listCategorias()).toEqual([])
    await replaceDatabase(new TextEncoder().encode(backup))
    expect(listCategorias()).toEqual([['OLGA', 0]])
  })
})

describe('backup', () => {
  it('exporta e restaura em JSON', async () => {
    await saveProduct({ nome: 'A', qtd: 1, valor: 2 })
    await addNucleo('N')
    const backup = exportDatabase()
    await wipeData('tudo')
    await replaceDatabase(new TextEncoder().encode(backup))
    expect(listProducts()[0]).toMatchObject({ nome: 'A', qtd: 1, valor: 2 })
    expect(listNucleos()).toEqual(['N'])
  })

  it('recusa ficheiros inválidos', async () => {
    await expect(replaceDatabase(new TextEncoder().encode('olá'))).rejects.toThrow()
    await expect(replaceDatabase(json({ products: 'x' }))).rejects.toThrow()
  })
})

describe('caixa de destino', () => {
  it('é copiada do produto para cada item vendido', async () => {
    const a = await saveProduct({ nome: 'T-shirt', qtd: 5, tamanho: 'M', valor: 10, caixa_destino: ' Caixa 3 ' })
    await registerSale({ items: [{ productId: a, quantidade: 1 }], nucleo: 'X' })
    expect(listTransactions(today(), today())[0].caixa_destino).toBe('Caixa 3')
  })

  it('importar em merge só muda a caixa se o CSV tiver a coluna', async () => {
    await importProducts([{ sku: 'A', sku_pai: 'A', nome: 'A', qtd: 1, valor: 1, caixa_destino: 'C1' }])
    await importProducts([{ sku: 'A', sku_pai: 'A', nome: 'A', qtd: 2, valor: 1 }], 'merge')
    expect(listProducts()[0].caixa_destino).toBe('C1')
    await importProducts([{ sku: 'A', sku_pai: 'A', nome: 'A', qtd: 2, valor: 1, caixa_destino: 'C2' }], 'merge')
    expect(listProducts()[0].caixa_destino).toBe('C2')
  })
})

describe('alterar produtos em lote', () => {
  it('muda só os campos dados e junta/tira categorias', async () => {
    const a = await saveProduct({ nome: 'A', qtd: 1, valor: 5, categorias: 'CAMISETA,OLGA', caixa_destino: 'C1' })
    const b = await saveProduct({ nome: 'B', qtd: 2, valor: 6, categorias: 'BONE' })
    const c = await saveProduct({ nome: 'C', qtd: 3, valor: 7 })
    expect(await updateProducts([a, b], { valor: 10, caixa_destino: 'C9', addCategorias: ['PROMO'], removeCategorias: ['OLGA'] })).toBe(2)
    const [pa, pb, pc] = listProducts()
    expect(pa).toMatchObject({ qtd: 1, valor: 10, caixa_destino: 'C9', categorias: 'CAMISETA,PROMO' })
    expect(pb).toMatchObject({ qtd: 2, valor: 10, caixa_destino: 'C9', categorias: 'BONE,PROMO' })
    expect(pc).toMatchObject({ valor: 7, caixa_destino: '', categorias: null })
    await updateProducts([a], { promocao: 'LEVE_2_PAGUE_1', sem_limite: true })
    expect(listProducts()[0]).toMatchObject({ promocao: 'LEVE_2_PAGUE_1', sem_limite: true, valor: 10 })
    expect(await deleteProducts([a, c])).toBe(2)
    expect(listProducts().map((p) => p.nome)).toEqual(['B'])
  })
})

describe('peças (savePiece / deletePiece)', () => {
  const peca = (variants: PieceInput['variants'], extra: Partial<PieceInput> = {}): PieceInput => ({
    sku_pai: 'CAM-AMI-VE', nome: 'Camiseta Amílcar', cor: 'Verde', valor: 15, preco_especial: null, promocao: 'LEVE_2_PAGUE_1',
    categorias: ['CAMISETA'], caixa_destino: 'PORTUGAL', variants, ...extra,
  })

  it('cria uma peça com vários tamanhos', async () => {
    await savePiece(peca([
      { sku: 'CAM-AMI-VE-S', tamanho: 'S', qtd: 5, sem_limite: false },
      { sku: 'CAM-AMI-VE-M', tamanho: 'm', qtd: 2, sem_limite: false },
    ]))
    const ps = listProducts()
    expect(ps).toHaveLength(2)
    expect(ps.map((p) => p.tamanho).sort()).toEqual(['M', 'S'])
    expect(ps[0]).toMatchObject({ sku_pai: 'CAM-AMI-VE', nome: 'Camiseta Amílcar', cor: 'Verde', valor: 15, promocao: 'LEVE_2_PAGUE_1', categorias: 'CAMISETA', caixa_destino: 'PORTUGAL' })
  })

  it('editar: atualiza os existentes, cria os novos e apaga os que saíram', async () => {
    await savePiece(peca([{ sku: 'A-S', tamanho: 'S', qtd: 5, sem_limite: false }, { sku: 'A-M', tamanho: 'M', qtd: 2, sem_limite: false }], { sku_pai: 'A' }))
    const s = listProducts().find((p) => p.sku === 'A-S')!
    await savePiece(peca([{ id: s.id, sku: 'A-S', tamanho: 'S', qtd: 9, sem_limite: false }, { sku: 'A-L', tamanho: 'L', qtd: 1, sem_limite: false }], { sku_pai: 'A', valor: 18 }), 'A')
    const ps = listProducts()
    expect(ps.map((p) => [p.sku, p.qtd, p.valor]).sort()).toEqual([['A-L', 1, 18], ['A-S', 9, 18]])
    expect(ps.find((p) => p.sku === 'A-S')!.id).toBe(s.id)
  })

  it('valor próprio de um tamanho sobrepõe o da peça', async () => {
    await savePiece(peca([{ sku: 'A-S', tamanho: 'S', qtd: 1, sem_limite: false }, { sku: 'A-3XL', tamanho: '3XL', qtd: 1, sem_limite: false, valor: 18 }], { sku_pai: 'A' }))
    expect(listProducts().map((p) => [p.sku, p.valor]).sort()).toEqual([['A-3XL', 18], ['A-S', 15]])
  })

  it('SKU repetido (no formulário ou noutra peça) é rejeitado e nada muda', async () => {
    await savePiece(peca([{ sku: 'X-S', tamanho: 'S', qtd: 1, sem_limite: false }], { sku_pai: 'X' }))
    await expect(savePiece(peca([{ sku: 'X-S', tamanho: 'S', qtd: 1, sem_limite: false }], { sku_pai: 'Y' }))).rejects.toThrow('SKU repetido: X-S')
    await expect(savePiece(peca([{ sku: 'Z-S', tamanho: 'S', qtd: 1, sem_limite: false }, { sku: 'Z-S', tamanho: 'M', qtd: 1, sem_limite: false }], { sku_pai: 'Z' }))).rejects.toThrow('SKU repetido: Z-S')
    await expect(savePiece(peca([{ sku: ' ', tamanho: 'S', qtd: 1, sem_limite: false }], { sku_pai: 'W' }))).rejects.toThrow('Falta o SKU')
    expect(listProducts().map((p) => p.sku)).toEqual(['X-S'])
  })

  it('SKU da peça já usado por outra peça é rejeitado (não se misturam)', async () => {
    await savePiece(peca([{ sku: 'CAM-OLG-S', tamanho: 'S', qtd: 1, sem_limite: false }], { sku_pai: 'CAM-OLG', nome: 'Camiseta Olga' }))
    await expect(savePiece(peca([{ sku: 'CAM-OLG-L', tamanho: 'L', qtd: 1, sem_limite: false }], { sku_pai: 'CAM-OLG', nome: 'Camiseta Olgaria' })))
      .rejects.toThrow('SKU da peça repetido: CAM-OLG')
    // editar a própria peça mantendo o SKU continua a funcionar
    const s = listProducts()[0]
    await savePiece(peca([{ id: s.id, sku: 'CAM-OLG-S', tamanho: 'S', qtd: 3, sem_limite: false }], { sku_pai: 'CAM-OLG', nome: 'Camiseta Olga' }), 'CAM-OLG')
    expect(listProducts().map((p) => [p.sku, p.qtd])).toEqual([['CAM-OLG-S', 3]])
  })

  it('promoção, preço especial e caixa "undefined" mantêm o valor de cada tamanho', async () => {
    await importProducts([
      { sku: 'A-S', sku_pai: 'A', nome: 'A', tamanho: 'S', qtd: 1, valor: 15, caixa_destino: 'PORTUGAL', promocao: 'LEVE_2_PAGUE_1' },
      { sku: 'A-3XL', sku_pai: 'A', nome: 'A', tamanho: '3XL', qtd: 1, valor: 15, caixa_destino: 'BRASIL', promocao: null, preco_especial: 9 },
    ])
    const [s3, s] = ['A-3XL', 'A-S'].map((k) => listProducts().find((p) => p.sku === k)!)
    await savePiece(peca([
      { id: s.id, sku: 'A-S', tamanho: 'S', qtd: 5, sem_limite: false },
      { id: s3.id, sku: 'A-3XL', tamanho: '3XL', qtd: 1, sem_limite: false },
      { sku: 'A-L', tamanho: 'L', qtd: 2, sem_limite: false },
    ], { sku_pai: 'A', nome: 'A', promocao: undefined, preco_especial: undefined, caixa_destino: undefined }), 'A')
    const by = (k: string) => listProducts().find((p) => p.sku === k)!
    expect(by('A-S')).toMatchObject({ qtd: 5, caixa_destino: 'PORTUGAL', promocao: 'LEVE_2_PAGUE_1', preco_especial: null })
    expect(by('A-3XL')).toMatchObject({ caixa_destino: 'BRASIL', promocao: null, preco_especial: 9 })
    // um tamanho novo fica com os valores do 1.º tamanho da peça
    expect(by('A-L')).toMatchObject({ caixa_destino: 'PORTUGAL', promocao: 'LEVE_2_PAGUE_1' })
  })

  it('um tamanho de outra peça nunca é movido para esta (o id é ignorado)', async () => {
    await savePiece(peca([{ sku: 'A-S', tamanho: 'S', qtd: 1, sem_limite: false }], { sku_pai: 'A', nome: 'A' }))
    const a = listProducts()[0]
    await savePiece(peca([{ id: a.id, sku: 'B-S', tamanho: 'S', qtd: 2, sem_limite: false }], { sku_pai: 'B', nome: 'B' }))
    expect(listProducts().map((p) => [p.sku, p.sku_pai, p.nome]).sort()).toEqual([['A-S', 'A', 'A'], ['B-S', 'B', 'B']])
  })

  it('SKUs comparam-se sem distinguir maiúsculas', async () => {
    await savePiece(peca([{ sku: 'cam-olg-s', tamanho: 'S', qtd: 1, sem_limite: false }], { sku_pai: 'cam-olg' }))
    expect(listProducts()[0]).toMatchObject({ sku: 'CAM-OLG-S', sku_pai: 'CAM-OLG' })
    await expect(savePiece(peca([{ sku: 'CAM-OLG-S', tamanho: 'S', qtd: 1, sem_limite: false }], { sku_pai: 'X' }))).rejects.toThrow('SKU repetido: CAM-OLG-S')
  })

  it('peça sem caixa de destino é recusada', async () => {
    await expect(savePiece(peca([{ sku: 'A-S', tamanho: 'S', qtd: 1, sem_limite: false }], { sku_pai: 'A', caixa_destino: '  ' }))).rejects.toThrow('Falta a caixa de destino.')
    expect(listProducts()).toEqual([])
  })

  it('deletePiece apaga todos os tamanhos e mantém as vendas', async () => {
    await savePiece(peca([{ sku: 'A-S', tamanho: 'S', qtd: 5, sem_limite: false }, { sku: 'A-M', tamanho: 'M', qtd: 5, sem_limite: false }], { sku_pai: 'A' }))
    await registerSale({ items: [{ productId: listProducts()[0].id, quantidade: 1 }], nucleo: 'X' })
    expect(await deletePiece('A')).toBe(2)
    expect(listProducts()).toEqual([])
    expect(listTransactions(today(), today())).toHaveLength(1)
  })

  it('um tamanho removido que estava no carrinho sai do carrinho', async () => {
    await savePiece(peca([{ sku: 'A-S', tamanho: 'S', qtd: 5, sem_limite: false }, { sku: 'A-M', tamanho: 'M', qtd: 5, sem_limite: false }], { sku_pai: 'A' }))
    const [s, m] = ['A-S', 'A-M'].map((k) => listProducts().find((p) => p.sku === k)!)
    useCart.getState().clearItems()
    useCart.getState().setQty(s.id, 1)
    useCart.getState().setQty(m.id, 1)
    await savePiece(peca([{ id: s.id, sku: 'A-S', tamanho: 'S', qtd: 5, sem_limite: false }], { sku_pai: 'A' }), 'A')
    useCart.getState().prune(listProductIds())
    expect(Object.keys(useCart.getState().items)).toEqual([s.id])
    const r = await registerSale({ items: [{ productId: s.id, quantidade: 1 }], nucleo: 'X' })
    expect(r.total).toBe(15)
  })
})


describe('Atualizar com só as colunas obrigatórias', () => {
  it('não mexe no stock, na cor nem no tamanho (colunas ausentes ficam como estão)', async () => {
    await importProducts(parseProductsCsv('SKU_FILHO,SKU_PAI,NOME_PRODUTO,COR,TAMANHO,QTD,VALOR,CAIXA\nCAM-OLG-S,CAM-OLG,Camiseta Olga,Azul,S,7,15,C1\n').products)
    const r = parseProductsCsv('SKU_FILHO,SKU_PAI,NOME_PRODUTO,VALOR,CAIXA\nCAM-OLG-S,CAM-OLG,Camiseta Olga,18,C1\n')
    await importProducts(r.products, 'merge')
    expect(listProducts()[0]).toMatchObject({ sku: 'CAM-OLG-S', valor: 18, qtd: 7, cor: 'Azul', tamanho: 'S' })
  })
})
