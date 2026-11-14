---
titulo: "[Estudo de mercado] Importador do Linktree para rascunho (uso interno de platform_admin)"
rotulos: estudo-mercado, aquisicao, enhancement
depende:
---
## Contexto

Para migrar quem usa o Linktree, o estudo propõe ler os links públicos e a foto e
montar um rascunho de demonstração. A oferta comercial proíbe buscar URL arbitrária
no servidor (SSRF), e nada pode ficar público sem o aceite do dono.

## Escopo

- Em "Administração da plataforma", ação "Importar do Linktree" só para
  `platform_admin`: campo com o nome de usuário (`^[A-Za-z0-9_.]{1,30}$`).
- O Worker busca **só** `https://linktr.ee/<usuário>`: host fixo, sem seguir
  redirecionamento para outro host, tempo limite de 5 s e no máximo 1 MB.
- Extrai nome, descrição, foto e links públicos e cria um **rascunho** numa vitrine
  nova sem dono, marcada "demonstração", nunca publicada automaticamente.
- Links de WhatsApp e Instagram viram botões diretos; os demais viram itens com link.
- Para entregar ao dono: convite pelo fluxo de equipe existente; só depois do aceite
  ele publica. Demonstrações sem aceite em 30 dias são apagadas (rascunho apenas).
- Registro em `audit_logs` de quem importou e quando.

## Fora de escopo

- Acesso por qualquer pessoa que não seja `platform_admin`.
- Beacons e Kyte (podem seguir o mesmo padrão depois).
- Copiar a foto para o armazenamento sem o aceite do dono.

## Critérios de aceite

- [ ] Usuário comum recebe `403`; `support_operator` também.
- [ ] Nome de usuário com `/`, `..` ou `@` é recusado antes de qualquer requisição.
- [ ] Resposta de outro host (redirecionamento) é recusada (teste com `fetch` simulado).
- [ ] O rascunho criado não tem publicação e `/<endereço>` responde `404`.
- [ ] Página acima de 1 MB ou demora acima de 5 s gera erro claro, sem rascunho pela metade.
- [ ] A importação aparece em `audit_logs`.

## Dependências

Nenhuma. Usa a administração da plataforma já entregue
([#41](https://github.com/coletivo-inspira/vitrine/issues/41), `PB-12`).

## Referências

- Estudo: [seção 6, item 4](../../market-study-2026.md#6-estratégias-de-aquisição).
- `docs/commercial-offer.md` (regra contra SSRF), ADR 0009.
