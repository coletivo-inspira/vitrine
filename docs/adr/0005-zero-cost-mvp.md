---
status: accepted
---
# MVP restrito a planos gratuitos e templates centralizados

Em 2026-11-07 o usuário autorizou resolver recomendações sem novas confirmações,
priorizando ausência de custo. Adotamos código de templates centralizado e dados
privados no Supabase; não haverá criação de um repositório por cliente. Publicações
serão artefatos separados, sem dados de clientes no histórico público de código.

Para o piloto: Cloudflare Workers Free com Static Assets, Supabase Free e Google
OAuth; sem upgrade automático, cartão para serviços adicionais, API WhatsApp paga,
R2, filas pagas ou SMTP contratado. Os limites gratuitos podem interromper uso;
aceitamos limitar o piloto em vez de contratar excedentes. Não contornar pausa
do Supabase com tráfego artificial.

Primeira publicação usará endereço gratuito do provedor e caminhos por vitrine.
Subdomínios próprios só com domínio já existente sob controle do coletivo; não
comprar nem renovar domínio automaticamente. Não prometer um subdomínio gratuito
independente por cliente em workers.dev. Antes da publicação, validar o vínculo
host/caminho → vitrine sem consultar tabelas administrativas anonimamente.

Limites iniciais de produto propostos: 10 vitrines no piloto, 100 itens por vitrine,
sem upload de vídeo ou imagens; texto e conteúdo próprio do template. Esses limites
deverão ser aplicados no servidor ao implementar cadastro e publicação. Não estão
implementados por este ADR. Monitorar cotas nos painéis gratuitos; sem promessa de
serviço ilimitado ou SLA. Backup exportado para armazenamento local privado.

Fonte das cotas e condições: docs/backend-research.md. Nenhuma conta remota foi
criada ou alterada nesta decisão.
