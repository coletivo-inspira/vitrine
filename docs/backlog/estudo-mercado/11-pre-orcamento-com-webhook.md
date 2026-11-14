---
titulo: "[Estudo de mercado] Pré-orçamento com webhook assinado (HMAC) para CRM ou planilha"
rotulos: estudo-mercado, vitrine-publica, enhancement
depende: 02
---
## Contexto

O estudo propõe um micro-formulário de pré-orçamento (categoria, data, bairro) junto
ao botão do WhatsApp; o Worker dispara um webhook em segundo plano e cria o card no
funil do CRM (Kommo, Total Chat, BotConversa, Google Planilhas) antes da primeira
mensagem. O fluxo em etapas do spec 008 (FR-013, modo `quote`) já monta a mensagem.
O [contrato do feed](../../instagram/interface-publica-feed.md) já descreve webhook com
HMAC-SHA256 e pode ser reaproveitado.

## Escopo

- Editor (dono ou admin, recurso `quote_webhook`): URL HTTPS do webhook, botão
  "Gerar segredo" (mostrado uma vez), "Enviar teste" e último status de entrega.
  Segredo guardado só no servidor.
- Vitrine pública: até 3 campos de pré-orçamento configuráveis (categoria, data,
  bairro) e consentimento explícito: "Enviar estes dados para <negócio> organizar o
  atendimento". Sem consentimento, segue só pelo WhatsApp.
- `POST /api/sites/:slug/leads` público: valida campos, limita por IP em memória da
  borda sem gravar o IP, envia o webhook com `ctx.waitUntil` e responde sem esperar.
- Assinatura `X-Vitrine-Signature: sha256=<hex>` sobre `timestamp.corpo`, com
  `X-Vitrine-Timestamp`; no máximo 3 tentativas para `5xx` e erro de rede.
- Bloquear destinos internos (IPs privados, `localhost`, `*.inspira.dev.br`) para evitar SSRF.
- Nenhum dado do pré-orçamento fica no banco além de contadores agregados.
- Guia em `docs/pre-orcamento-webhook.md` com verificação da assinatura e receitas
  para Kommo, BotConversa e Google Planilhas (Apps Script).

## Fora de escopo

- Integração nativa com a API de um CRM específico.
- Mudar o comportamento do modo Mila (ADR 0012): a mensagem continua indo para a Mila.

## Critérios de aceite

- [ ] O corpo recebido pelo destino de teste valida com o segredo e falha com outro (teste).
- [ ] Webhook fora do ar não atrasa a abertura do WhatsApp (resposta da rota < 50 ms de CPU).
- [ ] URL `http://`, `https://127.0.0.1` ou `https://10.0.0.1` é recusada ao salvar.
- [ ] Sem o recurso `quote_webhook`, o editor mostra o campo bloqueado com o plano e a
      rota responde `404`.
- [ ] Sem o consentimento marcado, nenhum webhook é enviado.
- [ ] O segredo não aparece em respostas da API depois de gerado, nem em logs.

## Dependências

- {{issue:02}} `02-direitos-por-plano.md`.

## Referências

- Estudo: [seção 6, item 3](../../market-study-2026.md#6-estratégias-de-aquisição).
- Spec 008 FR-009 e FR-013; ADR 0012; constituição, Princípio III.
