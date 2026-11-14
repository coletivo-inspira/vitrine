---
status: accepted
---
# Planos do estudo de mercado e cobrança recorrente pelo Asaas

Data: 2026-11-14. Decidido pelo Lino (escolhas 1.a e 2.b sobre o
[estudo de mercado 2026](../market-study-2026.md)). Os detalhes marcados como
"decisão do agente" foram fechados pelo agente e são revisáveis por ele.

Substitui em parte o [ADR 0007](0007-commercial-services.md): os preços (R$ 10 e
R$ 15 por endereço) e a regra "cobrança manual, sem gateway, cartão, recorrência
automática ou webhooks". Complementa o [ADR 0005](0005-zero-cost-mvp.md): a
infraestrutura continua nos planos gratuitos; o que muda é que a receita passa a
ter tarifa por recebimento. O ADR 0006 (endereços) e o ADR 0008 (roteamento e
trava de 95 domínios) continuam valendo.

## Contexto

- O ADR 0007 deixou os preços como hipótese e a cobrança manual no piloto. O estudo
  de 2026 compara a Vitrine com link na bio, lojas com carrinho e automação de
  conversas e propõe quatro planos e uma consultoria paga.
- A arquitetura não muda (escolha 1.a): um Worker `vitrine-inspira`, Supabase e
  snapshots públicos imutáveis. Nada de repositório `vtr-*`, Astro ou Cloudflare Pages.
- `public.tenants.plan` já existe com `free`, `custom_domain` e `bespoke`, e só
  `platform_admin` altera esse campo (migração `202611120005`). O desenho
  `commercial_subscriptions` do spec 002 (por vitrine, manual) nunca foi migrado.

## Opções consideradas

1. **Manter a cobrança manual** (ADR 0007). Sem tarifa, mas não escala, depende do
   operador para cada vencimento e não oferece Pix Automático nem cartão.
2. **Stripe Billing como motor principal.** Bom para cartão e exterior, mas cartão
   custa 3,99% + R$ 0,39 (+0,7% e R$ 0,50 com Billing), e o Pix recorrente é limitado.
3. **Asaas como motor principal, Stripe depois.** Sem mensalidade, tarifa só no
   recebimento, Pix, boleto, cartão e Pix Automático. Conta brasileira com sandbox.
4. **Repasse entre contas (Stripe Connect) para vender pelos lojistas.** R$ 6 por conta
   ativa por mês + 0,25% + R$ 0,67 por repasse e responsabilidade por estornos.

## Decisão

Adotamos a **opção 3** e descartamos a 4.

### Planos

| Código | Plano | Preço mensal | Vitrines | Itens ativos por vitrine | Recursos |
| --- | --- | --- | --- | --- | --- |
| `free` | Gratuito/Social | R$ 0 | 1 | 20 | Endereço `vitrine.inspira.dev.br/<endereço>`, selo "Apoio Coletivo Me Inspira", WhatsApp e Instagram por link direto, "Aberto agora", "Traçar rota", QR Code e Insights básicos |
| `essencial` | Essencial | R$ 39 | 1 | 100 | Tudo do Gratuito, sem o selo obrigatório + domínio próprio do cliente (ou subdomínio `inspira.dev.br`) + dados estruturados de negócio local |
| `profissional` | Profissional | R$ 89 | 1 | 100 | Tudo do Essencial + até 5 blocos de itens + pré-orçamento com webhook + `vitrine.json` + Insights por origem |
| `equipe` | Equipe/Multi-Vitrine | R$ 169 | até 5 | 100 | Recursos do Profissional em cada vitrine do mesmo cliente |

- **Consultoria (fora da assinatura):** Implantação Chave na Mão de R$ 290 a 490
  (DNS, imagens, Google Meu Negócio, QR Codes impressos) e projetos sob medida a
  partir de R$ 950. Cobrada como cobrança avulsa no Asaas, depois de orçamento aceito.
- **Patrocínio (nível 3):** cotas negociadas, sem preço de tabela. Dá leitura de
  métricas agregadas (issue 17 do backlog, depois).
- O registro e a renovação de domínio continuam fora de qualquer plano (ADR 0006 e 0007).
- O domínio próprio respeita a trava de 95 domínios ativos (ADR 0008). Sem vaga, o
  Essencial é oferecido com subdomínio `inspira.dev.br` e lista de espera.
- 100 itens é o teto técnico já existente (ADR 0005); não há plano "ilimitado".

### Direitos por plano

- A fonte da verdade passa a ser `public.subscriptions` (uma por tenant) ligada a
  `public.plans`. O Worker decide cada recurso pago por uma função no banco
  (`private.site_entitlements(site_id)`), nunca pelo navegador.
- Vitrine sem tenant, ou tenant sem assinatura ativa, recebe os direitos de `free`.
- Só três caminhos alteram uma assinatura: o webhook do Asaas verificado, a ação de
  um `platform_admin` com auditoria e a migração inicial. O cliente inicia a
  contratação no painel, mas o plano só muda quando o Asaas confirma o pagamento.

### Cobrança

1. **Asaas primeiro em sandbox.** Produção só depois do passo humano
   `BLK-ASAAS-01` (conta Asaas do coletivo e chaves de sandbox e de produção).
2. **Segredos só no Worker:** `ASAAS_API_KEY` e `ASAAS_WEBHOOK_TOKEN` via
   `wrangler secret put`, nunca em repositório, bundle, URL ou log. A base da API
   (sandbox ou produção) vem de variável não secreta `ASAAS_API_BASE`.
3. **Meios:** Pix Automático quando disponível na conta, boleto e cartão. O cartão é
   digitado na página de pagamento do Asaas; nenhum dado de cartão passa pelo Worker.
4. **Webhook** em `POST /api/billing/asaas/webhook`: confere o cabeçalho
   `asaas-access-token` em tempo constante, grava o `id` do evento para não aplicar
   duas vezes e responde rápido. Chamadas do Worker ao Asaas têm nova tentativa
   limitada (no máximo 3, com espera crescente) só para `429` e `5xx`.
5. **Dados pessoais mínimos:** CPF ou CNPJ e e-mail de cobrança seguem para o Asaas e
   não ficam no banco da Vitrine; guardamos só os identificadores do Asaas.
6. **Ciclo:** aviso antes do vencimento, 7 dias de tolerância depois do vencimento,
   depois suspensão **só dos recursos pagos**. A vitrine continua em
   `vitrine.inspira.dev.br/<endereço>`; nenhum conteúdo é apagado; a reativação é
   automática quando o Asaas confirma o pagamento. Mantém a política do ADR 0007.
7. **Stripe** fica como complemento posterior (cartão e exterior), atrás da mesma
   interface de provedor. Stripe Connect não será usado.
8. **Vendas do lojista** continuam fora da plataforma: links de pagamento do próprio
   lojista, sem repasse nem responsabilidade da Vitrine por estornos.

## Consequências

- **Positivas:** receita recorrente sem mensalidade fixa de gateway; tabela pública
  coerente com o estudo; direitos verificados no servidor e testáveis em PGlite.
- **Negativas:** tarifa por recebimento (estimada entre R$ 1 e R$ 2 por cobrança no
  estudo; conferir a tabela vigente do Asaas antes de publicar preços); dependência de
  um fornecedor; dados de cobrança exigem cuidado de LGPD e termos atualizados.
- **Migração:** `tenants.plan = 'custom_domain'` passa a `essencial`; `bespoke`
  continua como marcador de consultoria e recebe direitos de `profissional` até
  revisão manual. Nenhum cliente paga hoje, então não há cobrança a migrar.
- O guia de operação (`docs/operations-guide.md`, seção 3) será atualizado pela issue
  do ciclo da assinatura; até lá, ele descreve o processo manual antigo.

Nenhuma conta, chave, cobrança ou configuração remota foi criada por este ADR.
