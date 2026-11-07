# Backend e publicação — pesquisa de 7 de novembro de 2026

## Vercel versus Cloudflare

Recomendação para este escopo: Cloudflare, pelo objetivo de baixo custo e pela
combinação de arquivos estáticos, API e DNS. Para projeto novo, avaliar Workers
Static Assets antes de escolher Pages. Roteamento por hostname e publicação de
artefatos precisam de validação; evitar um projeto por cliente como padrão.

Vercel é alternativa se aceitarmos plano pago e priorizarmos seu fluxo de
desenvolvimento. Hobby restringe uso a projetos pessoais não comerciais. Pro tem
taxa de US$ 20/mês com um assento de deploy e US$ 20 em crédito de uso; excedentes
e assentos adicionais podem gerar cobrança. Crédito não elimina a taxa mensal.
[Hobby](https://vercel.com/docs/plans/hobby), [Pro](https://vercel.com/docs/plans/pro-plan).

Cloudflare tem plano gratuito Workers; entrega de arquivos estáticos e execução
dinâmica têm modelos de consumo distintos. Cotas, serviços adicionais e escala
podem exigir pagamento. [Static Assets](https://developers.cloudflare.com/workers/static-assets/),
[preços Workers](https://developers.cloudflare.com/workers/platform/pricing/).

Atualização: em 2026-11-07 o usuário escolheu Cloudflare para hospedagem. Backend e produto específico Cloudflare continuam pendentes.

## Comparação de backend

Valores de planos são limites consultados nesta data, não promessa de custo zero permanente. Confirmar uso comercial, cotas da conta e custos externos antes de contratar ou publicar.

| Alternativa | Benefício | Trabalho e risco | Indicação proposta |
| --- | --- | --- | --- |
| Apps Script + Sheets | Familiar, integração com planilhas | Autorização por vitrine, integridade e concorrência precisam ser construídas; execução como dono exige verificar cada operação | Importação/exportação e protótipos internos |
| Supabase Auth + Postgres | Identidade gerenciada, relações e RLS | Políticas incorretas expõem dados; pausa e email precisam ser planejados | Candidato preferido para MVP multiusuário |
| Cloudflare Workers + D1 | API e SQL próximos da hospedagem | D1 não fornece Auth equivalente: integrar provedor e implementar isolamento em toda consulta | Alternativa se houver capacidade de manter auth e autorização |

Apps Script: execução de até 6 minutos, concorrência de 30 execuções por usuário e 1.000 por script. Web app pode executar com identidade do dono ou visitante; executar como dono não identifica nem autoriza automaticamente o cliente. Sheets não substitui política de acesso por registro. [Cotas](https://developers.google.com/apps-script/guides/services/quotas), [identidade de execução](https://developers.google.com/apps-script/guides/web).

Supabase Free: 500 MB de banco e 50.000 usuários ativos mensais; projetos gratuitos podem pausar por baixa atividade. Planejar backup/exportação, disponibilidade e migração para plano pago. O SMTP padrão é restrito e não serve como serviço de email público de produção; OAuth ou SMTP próprio demandam configuração. RLS e testes com dois usuários são obrigatórios antes de conectar clientes. [Plano](https://supabase.com/pricing), [pausa](https://supabase.com/kb/faqs/platform/free-postgres-for-side-projects), [SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).

Workers Free: 100.000 requisições/dia; cotas de CPU e subrequests também se aplicam. D1 Free: 5 milhões de linhas lidas/dia, 100 mil escritas/dia e 5 GB totais. Índices e volume lido influenciam consumo; exceder cota pode interromper operações. [Workers](https://developers.cloudflare.com/workers/platform/limits/), [D1](https://developers.cloudflare.com/d1/platform/pricing/).

Cloudflare Pages Free: 500 builds/mês por conta, um build simultâneo; 100 domínios por projeto e limite de 100 projetos por conta. Um projeto por vitrine esgota capacidade; validar arquitetura consolidada antes de crescer. Functions consomem cotas Workers. DNS gratuito não significa domínios registrados gratuitamente. [Limites](https://developers.cloudflare.com/pages/platform/limits/), [DNS](https://developers.cloudflare.com/dns/manage-dns-records/how-to/create-dns-records/).

GitHub Pages: restrição explícita a hospedagem gratuita de negócios, sites destinados principalmente a facilitar transações comerciais e SaaS; não usar para transações sensíveis. Sites até 1 GB, banda flexível de 100 GB/mês e limite flexível de 10 builds/hora, com exceção deste último para workflows Actions customizados. Mudar o build não elimina a restrição de finalidade. [Política e limites](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits).

GitHub Actions: uso de runners padrão em repositórios públicos é gratuito; repositórios privados e recursos adicionais têm franquias/cobrança conforme plano. Não extrapolar essa gratuidade a qualquer runner. REST API tem limites primários e secundários: tokens de instalação geralmente começam em 5.000 requisições/hora; filas devem respeitar headers e backoff. Não fazer build por tecla do editor: publicar explicitamente e agrupar alterações. [Cobrança](https://docs.github.com/en/billing/concepts/product-billing/github-actions), [API](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api).

Recomendação de engenharia, ainda proposta: Supabase para identidade/persistência e servidor para publicação, com artefatos públicos desacoplados do banco administrativo. Cloudflare foi escolhida para hospedagem; produto específico e configuração seguem pendentes. Custo zero é meta de piloto limitado, sem garantia de SLA; domínio, SMTP, armazenamento, backups e crescimento podem exigir pagamento. Monitorar consumo em 70% e 90% das cotas como política proposta; bloquear novas publicações quando faltar orçamento, preservando a versão ativa.
