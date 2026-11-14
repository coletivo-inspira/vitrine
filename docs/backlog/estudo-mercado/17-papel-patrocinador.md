---
titulo: "[Estudo de mercado] Papel de patrocinador com leitura de métricas agregadas (depois)"
rotulos: estudo-mercado, painel, depois
depende: 02, 09
---
## Contexto

O plano Gratuito/Social é financiado por cotas de patrocínio (nível 3). O
patrocinador quer ver o alcance do que financia sem acessar dados de uma vitrine
específica. A diretriz 4 lista o papel "Investidor/Patrocinador". O spec 008 deixou
a visão consolidada entre vitrines como continuação fora de escopo.

## Escopo

- Papel de plataforma `sponsor` em `public.platform_operators` (atribuído só por
  `platform_admin`).
- Tela "Impacto" só leitura: número de vitrines sociais ativas, visitas e cliques para
  enviar no WhatsApp somados por mês e por cidade, sem nome de negócio, sem itens e
  com supressão de grupos com menos de 5 vitrines.
- Função `security definer` que devolve só agregados; o patrocinador não lê
  `site_metrics_daily` diretamente.

## Fora de escopo

- Cobrança das cotas de patrocínio (por contrato, fora do sistema).
- Exportação de dados.

## Critérios de aceite

- [ ] `sponsor` não lê nenhuma linha de `sites`, `drafts` ou `site_metrics_daily` (teste PGlite).
- [ ] Cidade com 4 vitrines aparece como "outras cidades".
- [ ] O papel não dá acesso a nenhuma rota de administração além de "Impacto".

## Dependências

- {{issue:02}} `02-direitos-por-plano.md` e {{issue:09}} `09-insights-por-origem.md`.

## Referências

- Estudo: [seções 5 (nível 3) e 7 (diretriz 4)](../../market-study-2026.md#7-diretrizes-do-painel).
- Spec 008 (fora de escopo de Insights), auditoria `PB-05`.
