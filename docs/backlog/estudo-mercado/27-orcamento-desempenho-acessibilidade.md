---
titulo: "[Estudo de mercado] Orçamento de desempenho e acessibilidade da vitrine pública"
rotulos: estudo-mercado, vitrine-publica, referencia-laurapires, enhancement
depende:
---
## Contexto

As issues 18 a 26 acrescentam cabeçalho, gaveta, página do item, foto no hero e
módulos. A referência mostra o risco: 3,1 MB na home desktop, 42 arquivos JS, Pixel e
Google Analytics sem consentimento, foto do hero em PNG de 289 KB, links sem nome
acessível, textos em inglês e páginas com zero ou dois `h1`.

A vitrine é leve por arquitetura (um módulo JS próprio, fontes locais, nada de
terceiros, cache na borda), mas nenhum teste impede uma regressão.

## Escopo

- Teste automatizado em `npm test` que publica as vitrines de exemplo
  (`pizzeria-v1`, uma `quote` e `servicos-produtos-v1` quando existir) e verifica no
  HTML gerado e nos recursos referenciados:
  - nenhum `<script>` ou `<link>` para host diferente da própria origem e de
    `sandbox.inspira.dev.br`;
  - no máximo 1 módulo JS de entrada e 1 folha de estilo;
  - JS + CSS próprios da vitrine ≤ 120 KB comprimidos;
  - exatamente um `h1` por página (vitrine e página do item);
  - toda `<img>` com `alt`, `width` e `height`;
  - todo link e botão com nome acessível;
  - nenhum texto de interface da lista de termos comuns em inglês ("Cart",
    "Checkout", "Close", "Search", "Shop").
- Medição de LCP com Playwright no perfil "Slow 4G" e CPU 4× em 390 px, alvo ≤ 2,5 s
  na vitrine de exemplo com foto no hero; resultado anotado no PR quando o CI não
  puder rodar o navegador.
- Documentar o orçamento em `docs/development.md`.

## Fora de escopo

- Termos proibidos ("catálogo", "cardápio"): a ampliação do teste é de `PB-18`
  (`TT-14`) e não é repetida aqui.
- Lighthouse completo no CI e medição em produção.
- As correções já mapeadas pela auditoria (`PB-07`, `PB-09`, `PB-18`, `PB-26`), que o
  teste só passa a vigiar.

## Critérios de aceite

- [ ] O teste falha ao acrescentar `<script src="https://www.googletagmanager.com/…">`
      ao modelo da vitrine e passa sem ele.
- [ ] O teste falha com uma `<img>` sem `alt` ou com dois `h1` na vitrine.
- [ ] O teste falha com "Cart" em texto visível.
- [ ] O orçamento de bytes está documentado e o valor medido aparece na saída do teste.
- [ ] `npm test` continua passando na `main` depois da introdução do teste.

## Dependências

Nenhuma. Idealmente entra antes das issues 18 a 26, para que cada uma já passe pelo
orçamento.

## Referências

- [Referência laurapires.com](../../referencia-laurapires.md): seções 4, 5, 7.3, 7.6,
  7.10 e decisões 8 e 11.
- ADR 0008 e 0011; auditoria `PB-18`.
