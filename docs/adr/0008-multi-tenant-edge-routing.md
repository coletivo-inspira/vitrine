---
status: accepted
---
# Roteamento e renderização multi-inquilino na borda com Cloudflare Workers Free

## Contexto e Problema

O Cloudflare Workers Free impõe um limite estrito de 10 ms de tempo de CPU por requisição e uma franquia de 100.000 requisições por dia. Em uma arquitetura multi-inquilino onde visitantes acessam vitrines em caminhos (`vitrine.inspira.dev.br/<slug>`) ou em domínios personalizados (`cardapio.cliente.com.br`), consultar tabelas relacionais normalizadas e compilar HTML complexo em tempo real a cada requisição correria o risco de ultrapassar 10 ms de CPU (erro HTTP 1102) e esgotar a cota diária.

## Opções Consideradas

1. **Renderização SSR relacional sob demanda em toda requisição**: consultar `sites`, `pages`, `sections` e `items` diretamente no Supabase a cada visita. Rejeitada por latência, consumo de CPU e acoplamento direto de leitura pública com tabelas administrativas.
2. **Geração estática (SSG) via rebuild completo a cada alteração**: disparar um pipeline de build e deploy a cada edição de cardápio ou vitrine. Rejeitada porque viola o requisito de alterações em tempo de execução sem novo deploy e esgota minutos de CI/CD conforme o número de clientes cresce.
3. **Snapshots públicos imutáveis + Renderização leve na borda com `Cache API` (`stale-while-revalidate`)**: compilar e validar o artefato público no ato da publicação (`public.publications` com hash SHA-256 e `assertNoPrivateLeakage`) e servir as vitrines pelo Worker usando `caches.default` com `Cache-Control: public, max-age=300, stale-while-revalidate=86400` e invalidação ativa na publicação.

## Decisão

Adotamos a **Opção 3**.

1. **Projeção pública imutável na publicação**: quando o proprietário ou membro publica uma vitrine, o servidor valida o rascunho, aplica `assertNoPrivateLeakage()`, calcula o `artifact_hash` (SHA-256) e grava o manifesto público compilado em `public.publications` e no histórico `public.publication_releases`.
2. **Resolução na borda em $< 1,5\text{ ms}$ de CPU**: o Cloudflare Worker resolve a vitrine pelo caminho (`/<slug>`) ou pelo cabeçalho `Host` (domínio vinculado em `public.custom_domains`), verifica `caches.default` e entrega o HTML/JSON público sem tocar nas tabelas privadas de rascunho ou administração.
3. **Domínios personalizados a custo zero**:
   - No plano gratuito sem cartão, os clientes utilizam `vitrine.inspira.dev.br/<slug>`, subdomínios sob `inspira.dev.br` ou domínios com DNS gratuito na Cloudflare roteados para o Worker.
   - Quando o recurso *Cloudflare for SaaS (Custom Hostnames)* estiver habilitado, uma trava rígida no servidor limita o provisionamento a **95 domínios ativos** (abaixo da franquia gratuita de 100 hostnames por zona), impedindo qualquer cobrança de excedente ($0,10/domínio). Para domínios ápice (`cliente.com.br`) em registradores sem *CNAME Flattening*, recomenda-se subdomínio (`cardapio.cliente.com.br`) ou delegação gratuita de DNS para a Cloudflare.

## Consequências

- **Positivas**: tempo de CPU por requisição na borda inferior a $1,5\text{ ms}$; absorção de picos de tráfego pelo cache da CDN; zero necessidade de redeploy de código para criar ou atualizar vitrines; conformidade integral com os Princípios I, II e IV da Constituição.
- **Negativas / Trade-offs**: caso a invalidação explícita de cache falhe em uma borda regional, uma alteração publicada pode levar até 5 minutos (`max-age=300`) para atualizar para todos os visitantes daquela região.
