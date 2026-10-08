# Produtos por SKU, peças com tamanhos e promoções por produto

Branch: `csv-sku` · Estado: design para revisão (sem implementação)

## Objetivo

Saber, de forma simples, quanto stock há de cada peça e de cada tamanho. Os produtos passam a vir de um CSV
com SKU por artigo e SKU da peça, o Vender e a página Produtos agrupam os tamanhos de cada peça, e as
promoções contam o produto inteiro.

## Decisões tomadas

| Tema | Decisão |
|---|---|
| Agrupamento | Um cartão/linha por peça (`SKU_PAI`, que já distingue a cor), com os tamanhos lá dentro |
| Promoções | Contam o produto inteiro: mesmo `NOME_PRODUTO` + mesma promoção, juntando cores e tamanhos |
| Formato do CSV | Só o formato novo; o antigo (`NOME`, `QTD`, `TAMANHO`, `VALOR`) deixa de ser aceite |
| Criar à mão | "+ Nova peça" cria a peça com vários tamanhos de uma vez; SKUs gerados e editáveis |
| Dados existentes | Sem migração (não há versão em produção); reimporta-se o CSV novo |

## 1. Dados e importação

### CSV

```
SKU_FILHO,SKU_PAI,NOME_PRODUTO,COR,TAMANHO,QTD,VALOR,CATEGORIA,CAIXA
CAM-OLG-3XL,CAM-OLG,Camiseta Olga,—,3XL,3,15,Camiseta,PORTUGAL
```

- Obrigatórias: `SKU_FILHO`, `SKU_PAI`, `NOME_PRODUTO`, `VALOR`, `CAIXA` (linha sem caixa: ignorada e reportada). Opcionais: `COR`, `TAMANHO`, `QTD`,
  `CATEGORIA`, `PROMOCAO`, `PRECO_ESPECIAL`, `SEM_LIMITE`.
- Separador e números como hoje (tab, `;` ou `,`; `12,50`, `12.50`, `12,50 €`).
- `COR` "—", "-" ou vazio = sem cor. `TAMANHO` "Único", "U", "—", "-" ou vazio = tamanho único (guardado vazio).
- Linha sem `SKU_FILHO`/`SKU_PAI`/`NOME_PRODUTO` é ignorada e reportada. `SKU_FILHO` repetido no ficheiro:
  fica a primeira, as seguintes são ignoradas e reportadas.
- Linhas do mesmo `SKU_PAI` com `NOME_PRODUTO` ou `COR` diferentes: entram, com aviso (a peça mostra os da 1.ª linha).
- **Substituir**: apaga os produtos e cria de novo (as vendas mantêm-se).
- **Atualizar**: procura por `SKU_FILHO`; atualiza os existentes, cria os novos. Colunas opcionais ausentes não
  alteram o valor atual (como hoje).
- **Exportar stock** gera este mesmo formato (com `PROMOCAO`, `PRECO_ESPECIAL`, `SEM_LIMITE`), reimportável.

### Modelo (`src/types.ts`)

`Product` ganha `sku`, `sku_pai`, `cor`; o `id` interno mantém-se (as vendas e o carrinho referem-no).

```ts
interface Product {
  id: string; sku: string; sku_pai: string; nome: string; cor: string; tamanho: string
  qtd: number; valor: number; promocao: string | null; preco_especial: number | null
  categorias: string | null; sem_limite: boolean; caixa_destino: string
}
```

`Transaction` ganha `sku`, `sku_pai`, `cor` (cópia no momento da venda). O CSV de vendas ganha as colunas
`SKU`, `SKU PAI`, `COR`.

Invariante: `sku` é único entre os produtos (validado na importação, no formulário e no repo).

## 2. Vender e Produtos

### Peça (agrupamento)

Função pura `groupPieces(products): Piece[]` em `src/lib/pieces.ts`:

```ts
interface Piece {
  sku_pai: string; nome: string; cor: string
  variants: Product[]            // ordenados por tamanho
  stockTotal: number | null      // null se algum tamanho for "sem limite"
  precoMin: number; precoMax: number
  categorias: string[]           // união das categorias dos tamanhos
}
```

Ordem dos tamanhos (`compareSizes`): XXS, XS, S, M, L, XL, 2XL (= XXL), 3XL, 4XL…; depois números por
ordem crescente; o resto por ordem alfabética. Peças ordenadas por nome e cor.

### Cartão no Vender (`PieceCard`)

- Título "Nome · Cor", preço (ou intervalo "12,00–15,00 €"), etiqueta da promoção, "Stock: total".
- Um botão por tamanho com o stock ("S 5"); tocar junta 1 ao carrinho. No carrinho: realçado com a quantidade.
  Esgotado: esbatido mas tocável (vender sem stock continua a exigir observação).
- Peça de tamanho único: sem botões de tamanho; tocar no cartão junta (como hoje).
- Contador no canto: unidades desta peça no carrinho.
- Pesquisa: nome, cor, SKU (da peça e dos tamanhos). Filtro de categorias: pela união da peça.
- Linha do carrinho: "Nome · Cor · Tamanho".

### Página Produtos

- Uma linha por peça: seleção, "Nome · Cor", SKU da peça, tamanhos com stock ("XS 2 · S 5 · M 0"),
  total, preço, categorias, promoção, [Editar].
- Seleção por peça (leva todos os tamanhos para a edição em lote).
- Telemóvel: cada peça em bloco (nome e preço em cima, tamanhos por baixo).

## 3. Promoções por produto

- Função pura `priceCart(lines)` em `src/lib/pricing.ts`; `priceLine` mantém-se para a simulação do formulário.
- Grupo de promoção = linhas com o mesmo `nome` (sem distinguir maiúsculas/acentos) e a mesma
  `promocao` + `preco_especial`. Linhas sem promoção não se agrupam.
- `LEVE_N_PAGUE_M`: por cada N unidades do grupo, N−M ficam grátis — as mais baratas.
- `PACK_N` com preço especial: cada N unidades custam o preço especial; os packs formam-se primeiro com as
  unidades mais caras; as restantes pagam o valor normal.
- Sem promoção com preço especial: preço unitário especial (como hoje).
- O desconto de cada grupo é atribuído às linhas das unidades que o geraram; cada linha tem
  `unitario`, `bruto`, `total`, `desconto`; a soma bate ao cêntimo (cálculos em cêntimos).
- O desconto do carrinho (€ / % / novo total) aplica-se depois, como hoje (`allocateDiscount`).

## 4. Criar/editar peças e edição em lote

### Formulário de peça (`PieceForm`, substitui o `ProductForm`)

- Campos da peça: Nome, Cor, SKU da peça, Valor, Preço especial, Promoção, Categorias, Caixa.
- Tabela de tamanhos: Tamanho, Qtd, Sem limite, SKU, [lixeira]; "+ Tamanho" e botões rápidos
  (XS S M L XL 2XL 3XL). Peça nova sem tamanhos = uma linha "Único".
- Valor por tamanho: coluna "Valor" só aparece se a peça já tiver preços diferentes ou se for ligada
  ("Preços diferentes por tamanho"); senão, o Valor da peça aplica-se a todos.
- SKUs: `skuPai(nome, cor)` = 3 letras de cada uma das 2 primeiras palavras do nome + 2 letras da cor
  (sem acentos, maiúsculas), ex. Camiseta Amílcar + Verde → `CAM-AMI-VE` (os SKUs importados, como o `CAM-AML-VD` do CSV, ficam como vêm); `skuFilho(pai, tamanho)` =
  `PAI-TAMANHO`. Gerados só em linhas novas e enquanto o utilizador não os editar; SKUs existentes nunca
  mudam sozinhos. Repetido (no formulário ou noutro produto) bloqueia o guardar e marca o campo.
- Remover um tamanho apaga esse artigo ao guardar (vendas intactas); se tiver stock, confirma.
- "Apagar peça" (lixeira) apaga todos os tamanhos, com confirmação.
- Gravação numa só transação: `savePiece(piece, variants)` em `repo.ts`.

### Edição em lote

- A janela atual (`ProductBatchModal`) recebe os produtos de todas as peças marcadas.
- Mantém: valor, promoção, sem limite, caixa, categorias. Sai: quantidade em lote.

## Testes

- `pieces.test.ts`: agrupamento, ordem dos tamanhos, total com "sem limite", intervalo de preço, SKU pai/filho gerados.
- `csv.test.ts`: formato novo, obrigatórias, "—"/"Único", SKU repetido, aviso de nome/cor diferentes.
- `repo.test.ts`: importar substituir/atualizar por SKU, `savePiece` (criar, editar, remover tamanho, SKU repetido).
- `pricing.test.ts`: `priceCart` — tamanhos e cores misturados, preços diferentes (grátis as mais baratas),
  packs (mais caras primeiro), promoções diferentes no mesmo nome, soma ao cêntimo.
- Verificação no browser (telemóvel e computador): Vender, Produtos, formulário, importação, venda com promoção.

## Fora de âmbito

Formato antigo de CSV; migração de dados existentes; stock por caixa; variantes além de cor e tamanho.
