---
titulo: "[Estudo de mercado] Kit Comment-to-Vitrine para Manychat e BotConversa (documentação)"
rotulos: estudo-mercado, aquisicao, documentation
depende: 07, 09
---
## Contexto

Comment-to-Vitrine: um gatilho de comentário envia **uma** mensagem no Direct com o
cartão de prévia da vitrine e UTM; a conversão termina no `wa.me`. Economiza até 90%
das mensagens faturadas. É só documentação: a Vitrine não usa a API da Meta.

## Escopo

- `docs/aquisicao/comment-to-vitrine.md`: passo a passo com capturas para o Manychat
  ("Usar como modelo") e para o BotConversa, usando a variável global
  `URL_VITRINE_INSPIRA` com `?utm_source=ig_comment&utm_campaign=<post>`.
- Textos prontos (comentário, mensagem do Direct e resposta pública), sem promessas
  de resultado.
- Seção "Profissional": como o robô consulta `vitrine.json` (issue {{issue:10}}) para
  responder horário e links.
- Página de ajuda no painel com link para o guia e o endereço da vitrine já montado
  com UTM para copiar.
- Avisos: limites do plano gratuito de cada ferramenta e custos da Meta fora da janela
  de 24 h (estudo, seção 2).

## Fora de escopo

- Criar contas, fluxos ou conexões nas ferramentas de terceiros.
- Qualquer chamada à API do Instagram ou do WhatsApp.

## Critérios de aceite

- [ ] Uma pessoa sem conhecimento técnico monta o fluxo seguindo o guia (teste com
      voluntário registrado no PR).
- [ ] O link gerado no painel abre a vitrine e a visita aparece com origem
      `ig_comment` nos Insights (issue {{issue:09}}).
- [ ] O cartão de prévia aparece no Direct (conferido junto com `BLK-UX-68-OG`).
- [ ] O guia diz "vitrine" sempre e não cita preços de terceiros sem data e fonte.

## Dependências

- {{issue:07}} `07-seo-local-e-cartao-de-previa.md` e {{issue:09}} `09-insights-por-origem.md`.
- Desejável: {{issue:10}} `10-vitrine-json-publico.md` para a seção Profissional.

## Referências

- Estudo: [seções 2 e 6, itens 1 e 2](../../market-study-2026.md#6-estratégias-de-aquisição).
- Spec 015 (campanha Instagram) para tom e materiais.
