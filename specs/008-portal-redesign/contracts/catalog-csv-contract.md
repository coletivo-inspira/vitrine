# Contrato de Dados: Importação e Exportação de Cardápio por Planilha CSV (`008-portal-redesign`)

**Feature**: `008-portal-redesign` (Entregue na **PR (c)** — Editor por Componentes)  
**Date**: 2026-11-12  
**Spec**: [../spec.md](../spec.md)

---

## 1. Arquivos Estáticos de Modelo (`web/portal/`)

Os arquivos estáticos são servidos diretamente a partir de `web/portal/` sem necessidade de rota nova no Cloudflare Worker:

1. **`web/portal/modelo-produtos.csv`** (usado para `catalogType: "products"` e `catalogType: "quote"`)
2. **`web/portal/modelo-servicos.csv`** (usado para `catalogType: "booking"`)

### 1.1. Codificação e Formato Regional
- **Charset**: UTF-8 com BOM inicial obrigatório (`\uFEFF`, bytes `EF BB BF`), garantindo abertura direta com acentuação correta no Microsoft Excel e Google Planilhas em português.
- **Separador de colunas**: ponto e vírgula (`;`) na exportação e nos modelos (o parser de importação aceita `;` e também `,` quando o cabeçalho utiliza vírgula).
- **Separador decimal de preço**: vírgula (ex.: `25,00`, `49,90`, `0,00`).
- **Estrutura dos arquivos modelo**: 1 linha de cabeçalho + 2 linhas de exemplo realistas.

---

## 2. Esquema de Colunas

### 2.1. Modelo de Produtos / Orçamento (`modelo-produtos.csv`)

Cabeçalho exato:
```csv
categoria;nome;descricao;preco;quantidade_minima;ativo
```

Exemplo de conteúdo completo (após o BOM `\uFEFF`):
```csv
categoria;nome;descricao;preco;quantidade_minima;ativo
Pizzas Artesanais;Margherita Verace;Molho de tomate San Marzano, muçarela fresca e manjericão;48,00;1;sim
Bebidas;Soda Italiana de Limão;Xarope artesanal de limão siciliano com água com gás 350ml;14,00;1;sim
```

### 2.2. Modelo de Serviços / Agendamento (`modelo-servicos.csv`)

Cabeçalho exato:
```csv
categoria;nome;descricao;preco;duracao_min;ativo
```

Exemplo de conteúdo completo (após o BOM `\uFEFF`):
```csv
categoria;nome;descricao;preco;duracao_min;ativo
Cabelo;Corte Clássico;Lavagem, corte na tesoura ou máquina e finalização;45,00;45;sim
Barba;Barba com Toalha Quente;Modelagem completa com navalha e óleo hidratante;35,00;30;sim
```

---

## 3. Regras de Validação por Coluna no Parser Cliente (`web/portal/csv-catalog.js`)

| Coluna | Obrigatória | Regra de Parsing e Validação | Exemplo de Mensagem de Erro (por Linha e Coluna) |
|---|---|---|---|
| `categoria` | Sim | Texto com `trim()` entre 1 e 160 chars, sem tags/protocolos perigosos. | `"Linha 4, categoria: informe o nome da categoria (1 a 160 caracteres)."` |
| `nome` | Sim | Texto com `trim()` entre 1 e 160 chars, sem tags/protocolos perigosos. | `"Linha 5, nome: informe o nome do item (1 a 160 caracteres)."` |
| `descricao` | Não | Texto com `trim()` até 280 chars. Vazio resulta em `""`. | `"Linha 6, descricao: a descrição deve ter no máximo 280 caracteres."` |
| `preco` | Sim (em `products`/`booking`) / Opcional (em `quote`) | Padrão brasileiro `^\d+(?:,\d{1,2})?$` (ou `R$ 25,00`), convertido para `priceCents` inteiro. Em `products`/`booking`, deve ser `> 0`; em `quote`, vazio ou `0,00` vira `0`. | `"Linha 7, preço: use o formato 25,00"` |
| `quantidade_minima` | Não (apenas `modelo-produtos.csv`) | Inteiro entre `1` e `99`. Quando vazio, assume `1`. | `"Linha 8, quantidade_minima: informe um número inteiro entre 1 e 99."` |
| `duracao_min` | Não (apenas `modelo-servicos.csv`) | Inteiro entre `5` e `480` (minutos). Quando vazio em `booking`, assume `30`. | `"Linha 9, duracao_min: informe a duração em minutos (entre 5 e 480)."` |
| `ativo` | Não | Aceita `sim`, `s`, `true`, `1`, `ativo` (-> `true`) ou `nao`, `não`, `n`, `false`, `0`, `oculto` (-> `false`). Quando vazio, assume `true`. | `"Linha 10, ativo: use 'sim' ou 'nao'."` |

---

## 4. Semântica de Prévia, Upsert e Limites

1. **Prévia Obrigatória antes de Aplicar**:
   - O parser retorna `{ validRows, errors, summary: { validCount, errorCount, newCategoriesCount, updatedItemsCount, addedItemsCount } }`.
   - O usuário visualiza no editor quantas linhas são válidas e todos os erros por linha e coluna antes de confirmar.
2. **Modos de Aplicação**:
   - **Adicionar ao cardápio (`mode: "merge"`)**:
     - Chave de correspondência (upsert): `normalizeKey(categoria) + "::" + normalizeKey(nome)` (comparação case-insensitive e sem espaços duplicados).
     - Se já existir um item com a mesma categoria e nome no rascunho: atualiza `description`, `priceCents`, `minQuantity` / `durationMinutes` e `active`, **preservando `id` e `imageUrl` existentes**.
     - Se a categoria não existir no rascunho: cria a categoria ao final da lista.
     - Se a mesma chave `categoria + nome` aparecer mais de uma vez dentro da própria planilha importada: a última ocorrência válida atualiza a anterior sem duplicar.
   - **Substituir cardápio (`mode: "replace"`)**:
     - Substitui a lista de categorias e itens do rascunho pelas categorias e itens válidos da planilha (preservando `imageUrl` quando um item de mesma `categoria + nome` já possuía foto no rascunho substituído).
3. **Limites do Rascunho e do Plano Gratuito**:
   - O resultado pós-importação é validado com as mesmas regras de `src/portal-validation.mjs`: máximo de **20 itens ativos**, **100 itens totais** e **256 KiB** de JSON serializado.
   - A importação altera **apenas o rascunho em edição**; salvar (`PUT /api/sites/:id/draft`) e publicar (`POST /api/sites/:id/publish`) permanecem passos explícitos do usuário.
