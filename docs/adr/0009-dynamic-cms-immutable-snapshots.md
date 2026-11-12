---
status: accepted
---
# CMS institucional dinâmico e publicação sem deploy via manifestos imutáveis

## Contexto e Problema

A página institucional da Vitrine Inspira (`vitrine.inspira.dev.br`) e o diretório de modelos e cases precisam ser administrados visualmente pela equipe de Operadores Inspira (banners, textos comerciais, ordem de seções, modelos disponíveis, vitrines em destaque, comunicados e rodapé) sem editar código-fonte, acessar o banco manualmente ou realizar novo deploy a cada atualização.

## Opções Consideradas

1. **Headless CMS externo de terceiros (Strapi, Sanity, Contentful)**: introduz dependência externa, outra superfície de autenticação/permissões e limites próprios de plano gratuito.
2. **Edição via commits em arquivos JSON no GitHub**: exige fluxo técnico ou token de escrita em repositório e dispara deploy a cada alteração de texto institucional.
3. **CMS institucional integrado ao portal (`/portal/`) sobre `public.platform_cms` com projeção pública e fallback estático**: gerenciar o conteúdo institucional no mesmo painel administrativo, persistindo rascunhos e versões publicadas em `public.platform_cms` (com validação `assertNoPrivateLeakage`) e servindo a projeção pública com cache na borda e fallback seguro para o pacote estático (`content/portfolio.json`).

## Decisão

Adotamos a **Opção 3**.

1. **Separação de papéis (Operador Inspira vs. Equipe da Vitrine)**:
   - Operadores autorizados da plataforma (identificados por registro verificado no servidor, nunca por flag editável pelo cliente) acessam o módulo **Administração da Plataforma** no portal para editar o CMS institucional (`platform_cms`), o catálogo de modelos (`templates` e `modules`), o status de pedidos de customização (`customization_requests`) e a governança de domínios e cotas.
   - Proprietários e membros de vitrines continuam enxergando exclusivamente suas próprias vitrines (`private.accessible_site_ids()`).
2. **Publicação em tempo de execução com reversão (rollback)**:
   - Alterações institucionais e de vitrines passam pelo fluxo **Rascunho → Prévia autenticada (token HMAC com `X-Robots-Tag: noindex, nofollow`) → Publicação imutável (SHA-256) → Reversão para revisão anterior**, mantendo no máximo as últimas 5 versões publicadas por vitrine para proteger o limite de 500 MB do Supabase Postgres Free.

## Consequências

- **Positivas**: atualizações imediatas da página principal e das vitrines sem deploy; reaproveitamento do motor de validação e projeção pública existente; custo operacional zero.
- **Negativas / Trade-offs**: exige controle rigoroso do tamanho dos manifestos JSON ($\le 256\text{ KiB}$) e expurgo automático de versões antigas além das 5 mais recentes para preservar os 500 MB do banco gratuito.
