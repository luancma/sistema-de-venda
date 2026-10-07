# Loja — vendas offline

App simples de ponto de venda feita com **Vite + React 19 + TypeScript**. Corre 100% offline no browser:
os dados ficam guardados diretamente no **IndexedDB** do browser (nativo, sem WebAssembly nem bibliotecas),
o que funciona em qualquer browser moderno — iPhone e Android incluídos.

## Como usar

```bash
npm install
npm run dev          # desenvolvimento -> http://localhost:5173
# ou, para o dia da venda:
npm run build && npm run preview   # -> http://localhost:4173
```

Outros comandos: `npm test` (testes) e `npm run typecheck` (verifica os tipos — o build do Vite não o faz).

Depois do `npm install` não é preciso internet.

### iPhone, iPad e Android (app offline)

```bash
npm run build:web
```

Gera `loja-web.zip` — a app web pronta a publicar. Publica-a **uma vez** num alojamento estático gratuito
(Netlify, Cloudflare Pages ou GitHub Pages: basta arrastar a pasta `dist/` ou o zip). Depois, em cada telemóvel:

1. Com internet, abre o link no **Safari** (iPhone) ou **Chrome** (Android).
2. Espera até aparecer **✓ offline** ao lado de "Loja" (a app ficou guardada no telemóvel).
3. iPhone: botão **Partilhar → Adicionar ao ecrã principal**. Android: menu **⋮ → Instalar app**.
4. A partir daí abre-se pelo ícone e funciona **sem internet** (modo avião incluído).

Quando publicares uma versão nova, os telemóveis atualizam sozinhos da próxima vez que abrirem a app com internet.
Os dados ficam em cada telemóvel — exporta o CSV no fim do dia.

### Versão para partilhar (um só ficheiro)

```bash
npm run build:single
```

Gera `loja.zip` (≈ 500 KB) com `loja.html`, `LEIA-ME.txt` e um CSV de exemplo.
Quem o recebe (Drive, email, pen) só tem de **extrair o zip e abrir `loja.html` com duplo clique** —
sem instalar nada e sem internet. Pensado para computadores (Windows, macOS, Linux) com Chrome, Edge ou Firefox. **Não funciona em iPhone** (o iOS não executa ficheiros HTML locais) — usa a versão acima.

Os dados ficam no browser de cada computador: cada posto de venda exporta o seu CSV no fim do dia.

### Configurações

O separador **Configurações** (no menu) tem os núcleos, as categorias, o backup/restauro dos dados e "Apagar vendas/tudo".
Núcleos e categorias podem ser criados, renomeados (se o novo nome já existir, juntam-se) e removidos aí.
No **Editar/Novo produto**, as categorias escolhem-se tocando nas sugestões, ou escreve-se uma nova e carrega-se **Enter**. Também abre pelo endereço `#config` (ex.: `http://localhost:5173/#config`).

Os núcleos podem ser criados diretamente no ecrã **Vender** (botão **+ Novo**).

### Fluxo de um dia

1. **Produtos → Importar CSV** com o stock inicial (ver `sample/produtos-exemplo.csv`).
2. **Núcleos**: no ecrã Vender, botão **+ Novo** (podes colar vários separados por vírgula).
3. No topo, preenche **Atividade** (ex.: "Feira de outubro") e **Responsável** (o teu nome). Ficam guardados em cada venda.
4. **Vender**: clica nos produtos, escolhe o núcleo (e opcionalmente o nome do comprador) e *Finalizar venda*.
   O stock é descontado automaticamente.
5. Fim do dia: **Vendas do dia → Exportar CSV** (podes filtrar por atividade). Uma venda errada pode ser *Anulada* (repõe o stock); **Recibo** mostra/imprime o comprovativo.
6. Opcional: **Produtos → Exportar stock** gera o CSV com as quantidades que sobraram (pode ser importado no dia seguinte).

## CSV de inicialização

```
NOME	QTD	TAMANHO	VALOR
T-shirt Logo	20	M	12,50
```

- Separador tab, `;` ou `,` (detetado automaticamente). Valores aceitam `12,50`, `12.50`, `12,50 €`.
- Colunas opcionais: `PROMOCAO`, `PRECO ESPECIAL`, `CATEGORIA`, `CAIXA DE DESTINO`.
- **Caixa de destino**: a coluna `CAIXA DE DESTINO` fica guardada no produto (editável em **Produtos → Editar**) e é copiada
  para cada item vendido, aparecendo na exportação das vendas (coluna `CAIXA DE DESTINO`).
- **Stock ilimitado** (ex.: rifas, cafés): por defeito todos os produtos têm stock controlado. Em **Produtos → Editar**,
  o interruptor **Sem limite** faz com que a quantidade deixe de ser controlada: não é descontada nas vendas e o produto
  nunca fica "sem stock" (aparece como ∞). No CSV, a coluna opcional `SEM LIMITE` (`SIM`/`X`) faz o mesmo; a exportação
  do stock já a inclui, para não se perder ao reimportar.
- Modo **Substituir** apaga os produtos e cria de novo; modo **Atualizar** procura por NOME + TAMANHO
  e atualiza QTD/VALOR, criando os que não existirem. As vendas nunca são apagadas pela importação.

## Contratos

**Produto** (`products`): `id` (uuid), `nome`, `qtd`, `tamanho`, `valor`, `promocao` (opcional), `preco_especial` (opcional).

**Transação** (`transactions`) — uma linha por produto em cada venda:
`id` (uuid), `nome_produto`, `nome` (comprador), `preco` (total da linha, já com promoção), `nucleo`, `responsavel` (o **Responsável**, quem está a usar a app; no CSV: `RESPONSAVEL`), `atividade` (campo **Atividade** do topo),
mais campos de contexto: `venda_id` (agrupa o carrinho), `data`, `produto_id`, `tamanho`, `quantidade`,
`preco_unitario`, `desconto` (promoção do produto), `promocao`, `observacao` (texto livre; **obrigatória quando se vende acima do stock**),
`desconto_venda` (parte desta linha do desconto dado no carrinho) e `desconto_info` (ex.: `10%`, `-5,00 €`, `novo total 40,00 €`).

### Desconto no carrinho

No carrinho, **% Dar desconto** permite descontar um **valor em €**, uma **percentagem** ou definir o **novo total** da venda.
O desconto é repartido pelas linhas proporcionalmente ao valor de cada uma (a soma bate certo ao cêntimo),
por isso o `PRECO` de cada linha no CSV já é o valor final cobrado.

**Núcleos** (`nucleos`): `nome`.

## Promoções

Editáveis em **Produtos → Editar** ou com as colunas `PROMOCAO` / `PRECO ESPECIAL` do CSV.

| Código `promocao`  | Significado                                   | Exemplo                                  |
|--------------------|-----------------------------------------------|------------------------------------------|
| `LEVE_2_PAGUE_1`   | 2 por 1                                       |                                          |
| `LEVE_4_PAGUE_3`   | Compre 3, leve 1 grátis                       |                                          |
| `LEVE_N_PAGUE_M`   | Por cada N unidades paga M                    | `LEVE_3_PAGUE_2`                         |
| `PACK_N`           | Cada N unidades custam `preco_especial`       | `PACK_3` + `preco_especial = 10` → 3 por 10 € |
| *(vazio)*          | Se `preco_especial` existir, é o preço unitário | preço de saldo                         |

Unidades que não completam um grupo pagam o `valor` normal. Os cálculos são feitos em cêntimos.


## Dados e backups

- Os dados ficam **no browser** onde a app foi aberta (mesmo endereço, ex. `localhost:4173`).
  Abrir noutro browser/porta = base de dados vazia.
- **Configurações → Descarregar backup** gera um ficheiro `.json` (texto legível, com produtos, vendas e núcleos)
  e *Restaurar backup* carrega-o de volta.
- **iPhone**: instala a app no ecrã principal — o Safari pode apagar dados de sites não visitados há 7 dias,
  mas não os de apps instaladas. Mesmo assim, exporta o CSV / faz backup regularmente.

## Estrutura

```
src/
  types.ts         tipos centrais (Product, Transaction, Sale, DbState…)
  db/database.ts   dados em memória + persistência IndexedDB + normalização (schema)
  db/repo.ts       produtos, núcleos, categorias, vendas
  db/useDb.ts      hook React que re-executa queries quando a BD muda
  lib/cartStore.ts     carrinho em curso (zustand, guardado em localStorage)
  lib/sessionStore.ts  Atividade e Responsável (zustand, guardado em localStorage)
  lib/pricing.ts   motor de promoções
  lib/csv.ts       importação/exportação CSV
  pages/           Vender, Produtos, Vendas, Config
tests/             testes (npm test)
```
