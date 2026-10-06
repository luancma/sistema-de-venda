# Loja — vendas offline

App simples de ponto de venda feita com **Vite + React 19**. Corre 100% offline no browser:
a base de dados é **SQLite** (via [sql.js](https://sql.js.org), WebAssembly) guardada em IndexedDB.

## Como usar

```bash
npm install
npm run dev          # desenvolvimento -> http://localhost:5173
# ou, para o dia da venda:
npm run build && npm run preview   # -> http://localhost:4173
```

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

### Configurações (área restrita)

O separador **Configurações** não aparece no menu. Abre-se acrescentando `#config` ao endereço
(ex.: `http://localhost:5173/#config` ou `…/loja.html#config`) e pede a senha. Fica desbloqueado até fechar
o separador do browser ou carregar em **Bloquear e sair**. Para mudar a senha, ver `src/components/ConfigGate.jsx`.

> É uma proteção simples para evitar alterações por engano: como tudo corre no browser,
> não substitui segurança a sério (quem tiver acesso ao dispositivo e conhecimentos técnicos consegue contorná-la).

Os núcleos podem ser criados diretamente no ecrã **Vender** (botão **+ Novo**).

### Fluxo de um dia

1. **Produtos → Importar CSV** com o stock inicial (ver `sample/produtos-exemplo.csv`).
2. **Núcleos**: no ecrã Vender, botão **+ Novo** (podes colar vários separados por vírgula).
3. Escreve o teu nome em **Vendedor** (topo).
4. **Vender**: clica nos produtos, escolhe o núcleo (e opcionalmente o nome do comprador) e *Finalizar venda*.
   O stock é descontado automaticamente.
5. Fim do dia: **Vendas do dia → Exportar CSV**. Uma venda errada pode ser *Anulada* (repõe o stock).
6. Opcional: **Produtos → Exportar stock** gera o CSV com as quantidades que sobraram (pode ser importado no dia seguinte).

## CSV de inicialização

```
NOME	QTD	TAMANHO	VALOR
T-shirt Logo	20	M	12,50
```

- Separador tab, `;` ou `,` (detetado automaticamente). Valores aceitam `12,50`, `12.50`, `12,50 €`.
- Colunas opcionais: `PROMOCAO`, `PRECO ESPECIAL`.
- Modo **Substituir** apaga os produtos e cria de novo; modo **Atualizar** procura por NOME + TAMANHO
  e atualiza QTD/VALOR, criando os que não existirem. As vendas nunca são apagadas pela importação.

## Contratos

**Produto** (`products`): `id` (uuid), `nome`, `qtd`, `tamanho`, `valor`, `promocao` (opcional), `preco_especial` (opcional).

**Transação** (`transactions`) — uma linha por produto em cada venda:
`id` (uuid), `nome_produto`, `nome` (comprador), `preco` (total da linha, já com promoção), `nucleo`, `vendedor` (quem vendeu),
mais campos de contexto: `venda_id` (agrupa o carrinho), `data`, `produto_id`, `tamanho`, `quantidade`,
`preco_unitario`, `desconto` (promoção do produto), `promocao`, `observacao` (texto livre; **obrigatória quando se vende acima do stock**),
`desconto_venda` (parte desta linha do desconto dado no carrinho) e `desconto_info` (ex.: `10%`, `-5,00 €`, `novo total 40,00 €`).

### Desconto no carrinho

No carrinho, **% Dar desconto** permite descontar um **valor em €**, uma **percentagem** ou definir o **novo total** da venda.
O desconto é repartido pelas linhas proporcionalmente ao valor de cada uma (a soma bate certo ao cêntimo),
por isso o `PRECO` de cada linha no CSV já é o valor final cobrado.

**Núcleos** (`nucleos`): `nome`.

## Promoções

Editáveis em **Produtos → Editar** ou diretamente com SQL em **Configurações → Consola SQL**.

| Código `promocao`  | Significado                                   | Exemplo                                  |
|--------------------|-----------------------------------------------|------------------------------------------|
| `LEVE_2_PAGUE_1`   | 2 por 1                                       |                                          |
| `LEVE_4_PAGUE_3`   | Compre 3, leve 1 grátis                       |                                          |
| `LEVE_N_PAGUE_M`   | Por cada N unidades paga M                    | `LEVE_3_PAGUE_2`                         |
| `PACK_N`           | Cada N unidades custam `preco_especial`       | `PACK_3` + `preco_especial = 10` → 3 por 10 € |
| *(vazio)*          | Se `preco_especial` existir, é o preço unitário | preço de saldo                         |

Unidades que não completam um grupo pagam o `valor` normal. Os cálculos são feitos em cêntimos.

```sql
UPDATE products SET promocao = 'LEVE_2_PAGUE_1' WHERE nome LIKE 'T-shirt%';
UPDATE products SET promocao = 'PACK_3', preco_especial = 10 WHERE nome = 'Caneca';
UPDATE products SET promocao = NULL, preco_especial = NULL WHERE nome = 'Boné';
```

## Dados e backups

- Os dados ficam **no browser** onde a app foi aberta (mesmo endereço, ex. `localhost:4173`).
  Abrir noutro browser/porta = base de dados vazia.
- **Configurações → Descarregar backup** gera um ficheiro `.sqlite` (abre em DB Browser for SQLite, DBeaver, etc.)
  e *Restaurar backup* carrega-o de volta.

## Estrutura

```
src/
  db/database.js   SQLite (sql.js) + persistência IndexedDB + schema
  db/repo.js       produtos, núcleos, vendas
  db/useDb.js      hook React que re-executa queries quando a BD muda
  lib/pricing.js   motor de promoções
  lib/csv.js       importação/exportação CSV
  pages/           Vender, Produtos, Vendas, Config
tests/             testes (npm test)
```
