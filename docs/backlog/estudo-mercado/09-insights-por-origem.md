---
titulo: "[Estudo de mercado] Insights por origem: UTM, cliques no WhatsApp, rota e QR (sem dados pessoais)"
rotulos: estudo-mercado, vitrine-publica, painel, enhancement
depende: 02, 07, 08
---
## Contexto

O spec 008 (US7, FR-014 e FR-015) já coleta `visit`, `item_view`, `item_select` e
`whatsapp_order` em `public.site_metrics_daily`, agregados, sem IP nem cookie. A
auditoria tem `PB-11` (Insights honestos) e `PB-21` (leitura dos gráficos) abertos.
Falta saber **de onde** vêm as visitas (Comment-to-Vitrine, QR, bio) e contar rota e QR.

## Escopo

- Novas métricas agregadas: `route_click` e `qr_visit`, e uma dimensão `source`
  derivada só de `utm_source` e `utm_campaign` da URL (lista fechada de até 32
  caracteres por valor, minúsculas; valores desconhecidos viram `outro`).
- Migração append-only que amplia o `check` de `metric_name` e acrescenta `source`,
  mantendo a retenção de 13 meses. A lista de métricas fica num só lugar
  (`src/portal-validation.mjs` e o `check` da migração) para que `notify_click`
  ("Avise-me", issue {{issue:23}}) e `payment_link_click` (link de pagamento, issue
  {{issue:24}}) entrem como novos nomes, sem tabela nem rota própria.
- Vitrine pública: lê os parâmetros UTM só na carga da página, não grava nada no
  navegador e envia a origem junto do evento `visit` no lote atual.
- Painel Insights: quadro "Visitas por origem" e funil por origem (visitas → cliques
  para enviar no WhatsApp), restrito ao recurso `conversion_reports` (Profissional);
  nos outros planos, o quadro aparece bloqueado com o nome do plano.
- Aviso de privacidade do rodapé atualizado: sem cookies, sem identificação, só
  contagens. Sem Google Analytics, logo sem banner de consentimento.

## Fora de escopo

- Ferramentas de terceiros (Google Analytics, Meta Pixel) e Consent Mode.
- Corrigir os achados de `PB-11` e `PB-21` (são pré-requisito, não parte desta issue).

## Critérios de aceite

- [ ] Uma visita com `?utm_source=ig_comment&utm_campaign=reel_01` incrementa
      `visit` com essa origem; sem UTM, a origem é `direto`.
- [ ] `utm_source` com 200 caracteres ou com e-mail é descartado e vira `outro`.
- [ ] Nenhuma linha nova guarda IP, user-agent, cookie ou texto livre do visitante (teste).
- [ ] Clique em "Traçar rota" e visita com `utm_source=qr` aparecem nos Insights do período.
- [ ] Usuário sem acesso à vitrine recebe `404` em `/api/sites/:id/insights` (teste existente continua).
- [ ] Plano `free` vê o quadro por origem bloqueado, com "Disponível no Profissional".

## Dependências

- {{issue:02}} `02-direitos-por-plano.md`, {{issue:07}} `07-seo-local-e-cartao-de-previa.md`
  e {{issue:08}} `08-aberto-agora-rota-e-qr-code.md`.
- Auditoria: `PB-11` antes; `PB-21` recomendado.

## Referências

- Estudo: [seções 6 (item 1) e 7 (diretriz 6)](../../market-study-2026.md#6-estratégias-de-aquisição).
- Spec 008: US7, FR-014, FR-015; [#37](https://github.com/coletivo-inspira/vitrine/issues/37).
