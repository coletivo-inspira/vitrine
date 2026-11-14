---
titulo: "[Estudo de mercado] SEO local (JSON-LD LocalBusiness) e cartão de prévia por vitrine"
rotulos: estudo-mercado, vitrine-publica, enhancement
depende: 02
---
## Contexto

O Essencial inclui dados estruturados de negócio local (Schema.org). O Comment-to-
Vitrine depende de um cartão de prévia (OpenGraph) bom no Direct e no WhatsApp.
`src/publication-engine.mjs` já grava `og:title`, `og:description`, `og:url` e
`og:image` por vitrine; não há JSON-LD. A conferência real do cartão já está no passo
humano `BLK-UX-68-OG` e no achado `UX-68-019` (`PB-24`) da auditoria.

## Escopo

- Projeção pública ganha campos opcionais do negócio: tipo (`LocalBusiness` ou
  subtipo, como `Restaurant` ou `ProfessionalService`), endereço, cidade, bairro,
  área atendida e horário (o mesmo da issue {{issue:08}}, quando existir).
- Na publicação, para vitrines com o recurso `local_seo` (issue {{issue:02}}), o
  HTML ganha um `<script type="application/ld+json">` gerado no servidor a partir só
  de campos públicos, com JSON escapado (sem `</script>` injetável).
- Cartão de prévia: `og:image` da vitrine (capa ou logo), `og:type`, `og:locale`
  `pt_BR`, `twitter:card` `summary_large_image` e `og:url` igual ao endereço canônico
  (domínio próprio quando ativo).
- Página de ajuda curta no painel explicando o que aparece no Google e no WhatsApp.

## Fora de escopo

- Gerar imagem de prévia dinâmica no Worker (CPU do plano gratuito).
- Cadastro no Google Meu Negócio (faz parte da Implantação Chave na Mão).

## Critérios de aceite

- [ ] O JSON-LD de uma vitrine de teste passa no validador do Schema.org (resultado no PR).
- [ ] Um nome com `</script><script>` não quebra o HTML nem executa script (teste).
- [ ] Vitrine `free` não recebe JSON-LD; `essencial` recebe (teste).
- [ ] `og:url` muda para o domínio próprio quando ele é canônico.
- [ ] Nenhum campo privado (telefone do dono no modo Mila, e-mail, plano) aparece no
      JSON-LD (`assertNoPrivateLeakage`).
- [ ] CSP `script-src 'self'` continua sem `unsafe-inline` (JSON-LD não é executável).

## Dependências

- {{issue:02}} `02-direitos-por-plano.md`.
- Auditoria: `UX-68-019` (`PB-24`) e passo humano `BLK-UX-68-OG` para a conferência real.

## Referências

- Estudo: [seções 5 e 6, item 1](../../market-study-2026.md#6-estratégias-de-aquisição).
- ADR 0008 (snapshots), ADR 0012 (modo Mila), `test/share-image.test.mjs`.
