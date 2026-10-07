import { beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, replaceDatabase, exportDatabase } from '../src/db/database.js'
import {
  listProducts, saveProduct, deleteProduct, importProducts, listNucleos, addNucleo, deleteNucleo, renameNucleo, countNucleoVendas,
  registerSale, cancelSale, listTransactions, listAtividades, renameCategoria, removeCategoria, wipeData,
  listCategorias, addCategorias,
} from '../src/db/repo.js'

const today = () => new Date().toLocaleDateString('sv-SE')
const json = (obj) => new TextEncoder().encode(JSON.stringify(obj))

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

  it('importa em modo merge por NOME+TAMANHO, mantendo promoção se não vier no CSV', async () => {
    await importProducts([{ nome: 'T-shirt', qtd: 5, tamanho: 'M', valor: 10, promocao: 'LEVE_2_PAGUE_1', preco_especial: null }])
    const r = await importProducts([
      { nome: 't-shirt', qtd: 8, tamanho: 'm', valor: 12, promocao: null, preco_especial: null },
      { nome: 'Caneca', qtd: 1, tamanho: '', valor: 4, promocao: null, preco_especial: null },
    ], 'merge')
    expect(r).toEqual({ created: 1, updated: 1 })
    const t = listProducts().find((p) => p.nome === 'T-shirt')
    expect(t).toMatchObject({ qtd: 8, valor: 12, promocao: 'LEVE_2_PAGUE_1' })
    await importProducts([{ nome: 'X', qtd: 1, valor: 1 }], 'replace')
    expect(listProducts().map((p) => p.nome)).toEqual(['X'])
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
    await importProducts([{ nome: 'Rifa', qtd: 0, tamanho: '', valor: 1, sem_limite: true }])
    await importProducts([{ nome: 'Rifa', qtd: 0, tamanho: '', valor: 2 }], 'merge')
    expect(listProducts()[0]).toMatchObject({ valor: 2, sem_limite: true })
    await importProducts([{ nome: 'Rifa', qtd: 0, tamanho: '', valor: 2, sem_limite: false }], 'merge')
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
