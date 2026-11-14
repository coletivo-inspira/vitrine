# Backlog do estudo de mercado 2026

Issues derivadas do [estudo de mercado 2026](../../market-study-2026.md) e do
[ADR 0013](../../adr/0013-plans-and-recurring-billing.md) (01 a 17) e da
[referência laurapires.com](../../referencia-laurapires.md) como padrão de vitrine de
serviços e produtos (18 a 27), escritas para serem criadas
no GitHub pelo Lino com:

```bash
scripts/criar-issues-estudo-mercado.sh --dry-run   # confere sem criar nada
scripts/criar-issues-estudo-mercado.sh             # cria rótulos e issues que faltam
```

## Formato dos arquivos

Cada issue é um arquivo `NN-nome.md` nesta pasta. O script lê **todos** os arquivos
`NN-*.md` em ordem numérica; para acrescentar issues, basta criar `18-…md` em diante.

```markdown
---
titulo: "[Estudo de mercado] Título da issue"
rotulos: estudo-mercado, painel, enhancement
depende: 02, 07
---
## Contexto
…
```

- `titulo`: título exato no GitHub; o script pula títulos que já existem.
- `rotulos`: separados por vírgula; os que faltarem são criados.
- `depende`: números dos arquivos de que esta issue depende (informativo; a seção
  "Dependências" do corpo é o que aparece na issue).
- `{{issue:NN}}` no corpo vira `#<número>` da issue criada a partir de `NN-*.md`,
  inclusive para issues de número maior (o script faz uma segunda passada).
- Links relativos (`../../…`) viram links para `main` no GitHub.

## Lista

| N.º | Issue | Rótulos | Depende de |
| --- | --- | --- | --- |
| 01 | [Tabela de planos como fonte única](01-tabela-de-planos.md) | `estudo-mercado`, `cobranca`, `documentation` | — |
| 02 | [Direitos por plano no banco e no Worker](02-direitos-por-plano.md) | `estudo-mercado`, `cobranca`, `enhancement` | 01 |
| 03 | [Integração com o Asaas em sandbox](03-integracao-asaas.md) | `estudo-mercado`, `cobranca`, `enhancement` | 02 |
| 04 | [Ciclo da assinatura](04-ciclo-da-assinatura.md) | `estudo-mercado`, `cobranca`, `enhancement` | 03 |
| 05 | [Tela "Plano e cobrança" e página de preços](05-plano-e-cobranca-e-pagina-de-precos.md) | `estudo-mercado`, `cobranca`, `painel`, `enhancement` | 04 |
| 06 | [Stripe como complemento (depois)](06-stripe-cartao-complementar.md) | `estudo-mercado`, `cobranca`, `depois` | 03, 04 |
| 07 | [SEO local e cartão de prévia](07-seo-local-e-cartao-de-previa.md) | `estudo-mercado`, `vitrine-publica`, `enhancement` | 02 |
| 08 | ["Aberto agora", "Traçar rota" e QR Code](08-aberto-agora-rota-e-qr-code.md) | `estudo-mercado`, `vitrine-publica`, `enhancement` | — |
| 09 | [Insights por origem](09-insights-por-origem.md) | `estudo-mercado`, `vitrine-publica`, `painel`, `enhancement` | 02, 07, 08 |
| 10 | [`vitrine.json` público](10-vitrine-json-publico.md) | `estudo-mercado`, `vitrine-publica`, `enhancement` | 02, 08 |
| 11 | [Pré-orçamento com webhook assinado](11-pre-orcamento-com-webhook.md) | `estudo-mercado`, `vitrine-publica`, `enhancement` | 02 |
| 12 | [Kit Comment-to-Vitrine](12-kit-comment-to-vitrine.md) | `estudo-mercado`, `aquisicao`, `documentation` | 07, 09 |
| 13 | [Importador do Linktree para rascunho](13-importador-linktree.md) | `estudo-mercado`, `aquisicao`, `enhancement` | — |
| 14 | [Vitrine piloto Guavira Fotos](14-vitrine-piloto-guavira.md) | `estudo-mercado`, `aquisicao` | — (desejável 07, 08) |
| 15 | [Central de canais](15-central-de-canais.md) | `estudo-mercado`, `painel`, `enhancement` | 02 |
| 16 | [Pausar, desconectar domínio e arquivar](16-pausar-desconectar-arquivar.md) | `estudo-mercado`, `painel`, `enhancement` | — |
| 17 | [Papel de patrocinador (depois)](17-papel-patrocinador.md) | `estudo-mercado`, `painel`, `depois` | 02, 09 |

### Vitrine de serviços e produtos (referência laurapires.com)

Todas levam também `estudo-mercado`, `referencia-laurapires` e `enhancement`.

| N.º | Issue | Rótulo da frente | Depende de |
| --- | --- | --- | --- |
| 18 | [Cabeçalho com identidade, menu e "Sua seleção"](18-cabecalho-identidade-e-sua-selecao.md) | `vitrine-publica` | — (`PB-07`, `PB-14`) |
| 19 | [Gaveta lateral "Sua seleção"](19-gaveta-sua-selecao.md) | `vitrine-publica` | 18, `PB-06`, `PB-09`, `PB-17` (desejável 11) |
| 20 | [Página própria do item, compartilhável](20-pagina-do-item.md) | `vitrine-publica` | 07, 18, 19 |
| 21 | [Hero com foto e duas ações, e destaques](21-hero-com-foto-e-destaques.md) | `vitrine-publica` | — |
| 22 | [Depoimentos e perguntas frequentes](22-depoimentos-e-faq.md) | `vitrine-publica` | — |
| 23 | [Item "Em breve" com "Avise-me pelo WhatsApp"](23-item-em-breve-avise-me.md) | `vitrine-publica` | 20 (contagem pela 09, `PB-20`) |
| 24 | [Link de pagamento do próprio negócio](24-link-de-pagamento-do-negocio.md) | `vitrine-publica` | 20 (contagem pela 09, termos pela 01) |
| 25 | [Rodapé completo da vitrine](25-rodape-completo.md) | `vitrine-publica` | 08, 18, `PB-26` |
| 26 | [Modelo "Serviços e produtos"](26-modelo-servicos-e-produtos.md) | `vitrine-publica`, `painel` | 18, 21, 22, 25, `PB-12` (recomendado 20) |
| 27 | [Orçamento de desempenho e acessibilidade](27-orcamento-desempenho-acessibilidade.md) | `vitrine-publica` | — (antes de 18 a 26) |

## Cobertura existente, fusões e cortes

Antes de escrever, o backlog foi cruzado com os 27 pacotes da auditoria UX
([`docs/auditoria-ux/relatorio-consolidado.md`](../../auditoria-ux/relatorio-consolidado.md),
`#73`) e com os specs 008 e 009. O que já tem cobertura virou referência.

**Cortadas (já cobertas):**

| Item do estudo | Coberto por |
| --- | --- |
| Diretriz 2 — publicação em 3 estados (rascunho, prévia, publicado com data e certificado) | Spec 009 US2 ([#40](https://github.com/coletivo-inspira/vitrine/issues/40)), `PB-10` e `PB-22`; status de certificado em [#44](https://github.com/coletivo-inspira/vitrine/issues/44) |
| Diretriz 4 — papéis do cliente (dono, admin, editor, leitor) e consultor | Spec 009 US1 ([#39](https://github.com/coletivo-inspira/vitrine/issues/39)) e `PB-05`; o consultor é `support_operator`. Só o patrocinador virou issue (17) |
| Diretriz 5 — dados validados na origem (telefone `55DDDNÚMERO`, cor hexadecimal, rótulos claros) | `PB-13` (validação por campo e paridade com o servidor) e `src/portal-validation.mjs` (`validateWhatsapp`) |
| Domínio próprio com verificação de DNS e certificado | [#44](https://github.com/coletivo-inspira/vitrine/issues/44) e ADR 0008; a issue 02 só condiciona ao plano |
| Coleta de eventos e painel de Insights | Spec 008 US7 ([#37](https://github.com/coletivo-inspira/vitrine/issues/37)), `PB-11`, `PB-21`; a issue 09 só acrescenta origem, rota e QR |
| Conferência real do cartão de prévia | `UX-68-019` (`PB-24`) e `BLK-UX-68-OG`; a issue 07 cuida do conteúdo do cartão e do JSON-LD |
| Proposta Git por cliente (`vtr-*`, Astro, Cloudflare Pages) | Cortada pela decisão 1.a do Lino (ADR 0005) |
| Robô na API oficial do WhatsApp ou do Instagram | Cortado: tarifas da Meta (estudo, seção 2) e ADR 0012; tudo segue por `wa.me` |
| Stripe Connect (repasse entre contas) | Cortado pelo ADR 0013 |

**Fundidas:**

- Diretriz 1 (central de canais) e "limites antes do clique": a parte de canais ficou
  na 15 e a de planos e cobrança na 05.
- Diretriz 6 (transparência financeira e telemetria): faturas na 05; visitas,
  WhatsApp, rota e QR na 09.
- "Aberto agora", "Traçar rota" e QR Code numa só issue (08), porque dividem o
  mesmo campo de horário e endereço.
- Modelos compartilháveis do Manychat e do BotConversa junto do Comment-to-Vitrine (12).

**Fusões das propostas da referência laurapires.com (18 a 27):** nenhuma das 10
duplicava uma issue inteira, então todas ficaram, mas as partes repetidas foram
tiradas delas e apontam para quem já cobre:

| Parte da proposta | Ficou em |
| --- | --- |
| Contagem de cliques em "Avise-me" (23) e no link de pagamento (24) | Issue 09, como métricas `notify_click` e `payment_link_click`, sem tabela nem rota própria |
| Metadados e OG por item (20) | Mesmo gerador da issue 07; JSON-LD de item continua fora |
| Parágrafo dos termos sobre o link de pagamento (24) | Mesma revisão de `/termos/` da issue 01 |
| Horário e cidade no rodapé (25) | Campos da issue 08, sem segundo cadastro; acabamento em 768–1440 px de `PB-26` |
| Instagram no cabeçalho (18) | O mesmo link direto da central de canais (15) |
| Seletor "Disponível / Em breve / Oculto" (23) | Controle único de visibilidade de `PB-20` (`UX-66-012`) |
| Componente visual de perguntas frequentes (20 e 22) | Um só, na 22; a página do item reaproveita |
| Checagem de termos proibidos no orçamento (27) | `PB-18` (`TT-14`); a 27 vigia só os termos em inglês |
| Foco da gaveta (19), mensagem do WhatsApp completa (19), contraste e alvos do cabeçalho (18) | `PB-09`/`PB-17`, `PB-06`, `PB-07`/`PB-14` |
| Selo "Apoio Coletivo Me Inspira" do plano Gratuito | Rodapé da 25 (ADR 0013) |

**Usadas como base, sem duplicar:** região de mensagens (`PB-01`), estado de falha
(`PB-02`), trava de envio (`PB-03`), diálogo padronizado (`PB-12`, `PB-20`), alvos de
toque (`PB-14`) e contrato de webhook com HMAC do feed
([`docs/instagram/interface-publica-feed.md`](../../instagram/interface-publica-feed.md)).

## Passos humanos

| Código | Responsável | Libera |
| --- | --- | --- |
| `BLK-ASAAS-01` | Lino | Abrir a conta Asaas do coletivo (sem mensalidade), gerar a chave de sandbox e, depois, a de produção; gravar com `wrangler secret put ASAAS_API_KEY` e `ASAAS_WEBHOOK_TOKEN`; cadastrar a URL do webhook no painel do Asaas. Libera o teste real da 03 e a produção da 03 a 05 |
| `BLK-GUAVIRA-01` | Lino com a Guavira Fotos | Autorização escrita para publicar o conteúdo e usar como case (14) |
| `BLK-STRIPE-01` | Lino, só se decidir | Abrir a conta Stripe do coletivo, gerar a chave de teste (live só com nova decisão e `STRIPE_ENV=live`); gravar com `wrangler secret put STRIPE_SECRET_KEY` e `STRIPE_WEBHOOK_SECRET`; cadastrar o endpoint do webhook e salvar o portal do cliente. Libera o teste real da 06 (`docs/billing/stripe.md`) |
| Lista de domínios de pagamento | Lino | Revisar a lista fechada da 24 antes do merge dela |
| Rodar o script | Lino | Criar os rótulos e as 27 issues no GitHub (as que já existirem são puladas) |
