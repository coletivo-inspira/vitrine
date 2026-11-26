---
titulo: "[AutoResposta 08] App Review, Verificação da empresa e conformidade"
rotulos: autoresposta, documentation, pendencia-externa
depende: 02, 04, 06
---
**Épico**: {{issue:00}} · **Prioridade**: P0 · **Complexidade**: M · **Tipo**: pendência externa

## Contexto

Clientes externos só conectam com Acesso avançado às permissões, app Live e Verificação da empresa. Nada disso foi feito.

## Objetivo

Configuração Meta completa e Revisão do app aprovada para `instagram_basic` e `instagram_manage_messages`.

## Escopo

- Console: configuração da AutoResposta, URL de retorno, webhook `messages`, testadores, URLs de conformidade, callbacks ([`meta-setup.md`](../../integrations/auto-reply/meta-setup.md)).
- Política de privacidade e termos com a AutoResposta (revisão jurídica).
- Verificação da empresa do portfólio Coletivo Inspira.
- Envio da Revisão com textos e roteiro de [`app-review.md`](../../integrations/auto-reply/app-review.md).

## Fora do escopo

Human Agent; `pages_show_list` (só com nova decisão).

## Critérios de aceite

- [ ] Itens 3 a 17 de `meta-setup.md` em "configurado e validado".
- [ ] Revisão aprovada (evidência da Meta).
- [ ] Verificação da empresa concluída.

## Dependências

{{issue:02}}, {{issue:04}}, {{issue:06}}; deploy em HTTPS; DNS (ADR 0006).

## Riscos

Reprovação por screencast incompleto; prazo da Meta; limitação de webhooks sem Página.

## Cenários de teste

Roteiro de `app-review.md`.

## Evidências para conclusão

Capturas do console sem segredos e resposta da Meta.

## Referências

#48; ADR 0017 (Consequências).
