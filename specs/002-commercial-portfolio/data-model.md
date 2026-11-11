# Modelo de Dados: Oferta Comercial, Portfólio e Benefícios de Endereço

**Feature**: `002-commercial-portfolio`  
**Date**: 2026-11-11  
**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)  
**ADRs de Referência**: ADR 0005 (MVP Custo Zero), ADR 0006 (Endereços Públicos), ADR 0007 (Serviços Comerciais e Identidade Personalizada)

---

## 1. Visão Geral e Fronteira de Dados

O modelo de dados da feature `002-commercial-portfolio` é dividido em dois níveis complementares, respeitando o Princípio I (projeção pública explícita) e o Princípio II (isolamento de privilégios) da Constituição:

1. **Artefatos Estáticos Versionados (Implementados para o Piloto)**:
   - `content/portfolio.json` → validado e projetado por `publishedPortfolio()` (`src/portfolio.mjs`) → `dist/data/portfolio.json`.
   - `content/contact.json` → validado e projetado por `quoteContactLink()` (`src/portfolio.mjs`) → `dist/data/contact.json`.
2. **Modelo Relacional de Controle Comercial e Vínculo de Endereço (Especificado para Persistência Administrativa)**:
   - Governa a relação entre uma vitrine (`public.sites`), sua modalidade comercial (`free_basic`, `inspira_subdomain`, `custom_domain`), o período de vigência com tolerância de 7 dias e o endereço canônico ativo ou suspenso.
   - Mutações são exclusivas de **Operadores Inspira** (papel administrativo separado de `owner_user_id` e `site_memberships`).

---

## 2. Entidades Estáticas (Catálogo de Portfólio e Contato Comercial)

### 2.1. `PortfolioCatalog` (`content/portfolio.json`)

Estrutura de entrada editada via Pull Request pela equipe Inspira:

| Campo | Tipo | Obrigatório | Restrições e Validação (`src/portfolio.mjs`) | Exportado para `dist/`? |
|---|---|---|---|---|
| `schemaVersion` | `integer` | Sim | Deve ser exatamente `1` (`catalog?.schemaVersion === 1`). | Não (envelope interno) |
| `entries` | `Array<PortfolioEntry>` | Sim | Lista de cases (publicados e rascunhos). | Apenas itens com `published === true` |

### 2.2. `PortfolioEntry` → Projeção Pública `PublishedCase` (`dist/data/portfolio.json`)

| Campo | Tipo | Obrigatório | Regra de Validação (`publishedPortfolio`) | Presente em `PublishedCase`? |
|---|---|---|---|---|
| `id` | `string` | Sim | Texto não vazio, máx. 64 chars, formato slug `^[a-z0-9]+(?:-[a-z0-9]+)*$`, único entre entradas publicadas. | **Sim** |
| `title` | `string` | Sim | Texto com `trim()`, entre 1 e 120 caracteres. | **Sim** |
| `url` | `string` (URL) | Sim | URL válida até 2048 chars; `url.protocol === 'https:'`; sem `username` e sem `password`. | **Sim** (`url.href` normalizado) |
| `summary` | `string` | Sim | Texto com `trim()`, entre 1 e 600 caracteres. | **Sim** |
| `category` | `string` | Sim | Texto com `trim()`, entre 1 e 80 caracteres (ex.: `Cardápio digital`, `Serviços`, `Portfólio`). | **Sim** |
| `tags` | `Array<string>` | Sim | Array com 0 a 8 strings; cada tag com `trim()` entre 1 e 40 caracteres. | **Sim** |
| `order` | `integer` | Sim | Inteiro seguro não negativo (`Number.isSafeInteger(order) && order >= 0`). | **Sim** |
| `featured` | `boolean` | Não | Booleano normalizado (`entry.featured === true`). | **Sim** |
| `published` | `boolean` | Sim | Apenas entradas com `entry?.published === true` entram na projeção. | **Não** (filtrado na projeção) |
| `internalNotes` / outros | `any` | Não | Quaisquer anotações de curadoria ou revisão em PR. | **Não** (descartado pela projeção explícita) |

**Regra de Ordenação**: Os itens de `PublishedCase` são ordenados de forma determinística por `a.order - b.order || a.id.localeCompare(b.id)` sem mutar o objeto de entrada.

### 2.3. `CommercialContact` (`content/contact.json`) → Projeção (`dist/data/contact.json`)

| Campo Fonte (`content/contact.json`) | Tipo | Regra de Validação (`quoteContactLink`) | Projeção (`dist/data/contact.json`) |
|---|---|---|---|
| `teamWhatsapp` | `string \| null` | Se `null` ou vazio, retorna `null` (botão de orçamento fica indisponível). Se preenchido, deve casar com `^[1-9]\d{7,14}$` (apenas dígitos, DDI + DDD + número, sem `+`, espaços ou query string). | `{ "href": "https://wa.me/<teamWhatsapp>?text=..." }` ou `{ "href": null }` |

**Contrato de Link de Orçamento (`QuoteRequest` via URL WhatsApp)**:
- Sem referência de case: `https://wa.me/<teamWhatsapp>?text=Ol%C3%A1!%20Gostaria%20de%20um%20or%C3%A7amento%20para%20minha%20vitrine.`
- Com referência a um `PublishedCase`: acrescenta ` Tenho como referência <title> (<id>).` devidamente sanitizado (`title` máx. 120 chars, `id` máx. 64 chars) e codificado com `encodeURIComponent`.

---

## 3. Entidades Relacionais de Controle Comercial (ADR 0006 e ADR 0007)

Estas entidades modelam o controle privado de planos, vigências e endereços personalizados por vitrine no Postgres/Supabase, mantendo a vitrine básica gratuita como estado padrão e garantindo que nenhuma ação do cliente possa escalar privilégios comerciais ou alterar DNS sem validação de um **Operador Inspira**.

### 3.1. `commercial_subscriptions` (Assinatura e Direito Comercial por Vitrine)

Representa a modalidade comercial associada a uma vitrine (`public.sites.id`) e seu ciclo de vigência manual no piloto.

| Coluna | Tipo SQL | Restrições | Descrição |
|---|---|---|---|
| `site_id` | `uuid` | `PRIMARY KEY REFERENCES public.sites(id) ON DELETE CASCADE` | Vitrine à qual a modalidade comercial pertence. |
| `plan_tier` | `text` | `NOT NULL DEFAULT 'free_basic' CHECK (plan_tier IN ('free_basic', 'inspira_subdomain', 'custom_domain'))` | Modalidade: gratuita por caminho (`/loja1`), subdomínio Inspira (`loja1.inspira.dev.br`, R$ 10/mês proposto) ou domínio próprio do cliente (R$ 15/mês proposto). |
| `status` | `text` | `NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'grace_period', 'suspended', 'canceled'))` | Estado operacional do benefício comercial. |
| `active_item_limit` | `integer` | `NOT NULL DEFAULT 20 CHECK (active_item_limit BETWEEN 1 AND 100)` | Franquia comercial de itens ativos (padrão 20 em todos os planos iniciais; teto técnico de 100 conforme ADR 0005/0007). |
| `paid_until` | `timestamptz` | `NULL` | Data de término do período pago confirmado (nulo para `free_basic`). |
| `grace_until` | `timestamptz` | `NULL CHECK (grace_until IS NULL OR paid_until IS NOT NULL AND grace_until >= paid_until)` | Data limite da tolerância de 7 dias após `paid_until` antes da suspensão do endereço personalizado. |
| `updated_by_operator_id` | `uuid` | `NULL REFERENCES auth.users(id)` | Identificador do Operador Inspira que registrou a última alteração comercial. |
| `updated_at` | `timestamptz` | `NOT NULL DEFAULT now()` | Carimbo de tempo da última atualização. |

### 3.2. `site_address_bindings` (Vínculo de Endereço Personalizado e Canonicalização)

Representa o hostname personalizado vinculado a uma vitrine e controla a direção de redirecionamento canônico definida no ADR 0006 e atualizada pelo ADR 0007.

| Coluna | Tipo SQL | Restrições | Descrição |
|---|---|---|---|
| `id` | `uuid` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Identificador único do vínculo de endereço. |
| `site_id` | `uuid` | `NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE` | Vitrine associada ao endereço. |
| `binding_type` | `text` | `NOT NULL CHECK (binding_type IN ('inspira_subdomain', 'custom_domain'))` | Tipo do endereço personalizado. |
| `hostname` | `text` | `NOT NULL UNIQUE CHECK (length(hostname) BETWEEN 4 AND 253 AND hostname ~ '^[a-z0-9.-]+$')` | Hostname em minúsculas (ex.: `loja1.inspira.dev.br` ou `cardapio.cliente.com.br`). Proibido colidir com hosts reservados (`vitrine.inspira.dev.br`, `painel.inspira.dev.br`) ou inventário DNS existente (`docs/dns-review.md`). |
| `verification_status` | `text` | `NOT NULL DEFAULT 'pending_verification' CHECK (verification_status IN ('pending_verification', 'verified', 'suspended', 'quarantined', 'rejected'))` | Estado técnico de DNS/TLS e disponibilidade do hostname. |
| `is_canonical` | `boolean` | `NOT NULL DEFAULT false` | Quando `true` (apenas se `verification_status = 'verified'` e assinatura `active` ou `grace_period`), o hostname personalizado é canônico e `vitrine.inspira.dev.br/<slug>` redireciona para ele. |
| `quarantined_until` | `timestamptz` | `NULL` | Impede reatribuição imediata de um subdomínio suspenso/cancelado para outro negócio (prevenção de takeover). |
| `verified_at` | `timestamptz` | `NULL` | Momento em que DNS e TLS foram verificados pelo Operador Inspira. |
| `created_at` | `timestamptz` | `NOT NULL DEFAULT now()` | Data de criação do registro. |

---

## 4. Máquina de Estados de Vigência e Reversão Segura (`002-US4`)

1. **Estado Padrão (`free_basic` / `active`)**:
   - Endereço canônico: `https://vitrine.inspira.dev.br/<slug>`.
   - Limite comercial padrão: até 20 itens ativos no cardápio (`active_item_limit = 20`).
2. **Ativação de Endereço Personalizado (`inspira_subdomain` ou `custom_domain`)**:
   - Pré-condições: disponibilidade no inventário DNS (`docs/dns-review.md`), verificação manual de DNS/TLS (`verification_status = 'verified'`) e confirmação manual de pagamento pelo Operador Inspira (`paid_until` definido, `grace_until = paid_until + interval '7 days'`).
   - Efeito: `is_canonical = true` no vínculo; `https://vitrine.inspira.dev.br/<slug>` redireciona para `https://<hostname>` sem duplicar conteúdo indexável.
3. **Vencimento e Período de Tolerância (`grace_period`, 7 dias)**:
   - Quando `now() > paid_until` e `now() <= grace_until`, a assinatura entra em `grace_period`.
   - O endereço personalizado permanece operacional enquanto o Operador Inspira notifica o proprietário.
4. **Suspensão após Tolerância (`suspended`)**:
   - Quando `now() > grace_until` sem confirmação de renovação, o Operador Inspira altera a assinatura para `suspended` e o vínculo de endereço para `verification_status = 'suspended'`, `is_canonical = false`.
   - **Garantia de Preservação de Dados (FR-008 / `002-US4`)**:
     - A vitrine volta imediatamente a responder de forma canônica no endereço básico gratuito `https://vitrine.inspira.dev.br/<slug>`.
     - Nenhum registro em `public.sites`, `public.site_memberships` ou `public.drafts` é apagado ou corrompido.
     - O hostname suspenso entra em quarentena (`quarantined_until`), não sendo liberado automaticamente para terceiros.

---

## 5. Regras de Autorização e RLS (Fronteira Cliente vs. Operador Inspira)

- **Proprietários e Membros de Vitrine (`authenticated`)**:
  - Podem **apenas ler (`SELECT`)** o resumo de `commercial_subscriptions` e `site_address_bindings` das vitrines às quais têm acesso via `private.accessible_site_ids()`.
  - **Não possuem `INSERT`, `UPDATE` ou `DELETE`** em `commercial_subscriptions` nem em `site_address_bindings`. Qualquer tentativa direta via cliente Supabase/PostgREST deve falhar com `SQLSTATE 42501` (`insufficient_privilege`).
- **Visitantes Anônimos (`anon`)**:
  - Não possuem acesso às tabelas administrativas `commercial_subscriptions` ou `site_address_bindings`. A resolução pública consome apenas artefatos publicados e projeções estáticas.
- **Operadores Inspira**:
  - Atuam via migração/rotina administrativa autenticada no servidor (ou papel dedicado em tabela privada `private.inspira_operators(user_id)` não editável pelo cliente), nunca por metadados `user_metadata` controlados pelo navegador.
