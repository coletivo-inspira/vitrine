# Roadmap e decisões abertas

## Entrega desta branch

- Inspeção: main continha apenas README; sem aplicação, workflows ou instruções AGENTS no checkout.
- Pesquisa com fontes oficiais, fronteiras de segurança e proposta de arquitetura.
- Projeção de cardápio público e link WhatsApp, demonstração local e CI sem credenciais de publicação.

## Entrevista de decisões — uma por vez

1. Resolvida em 2026-11-07: Cloudflare escolhida para hospedagem; GitHub para código e automações. Workers Free com Static Assets adotado para o piloto; configuração e roteamento ainda serão implementados.
2. Resolvida em 2026-11-07: uma pessoa pode administrar várias vitrines; cada vitrine pode ter sua própria equipe. Acesso a uma não concede acesso às demais. Fluxo de convites e permissões detalhadas ainda será definido.
3. Resolvida em 2026-11-07: Supabase Auth + Postgres aprovados para o MVP. Login inicial aprovado: Google via Supabase Auth. Recuperação de acesso ao negócio e configuração continuam pendentes.
4. Resolvida por autorização geral em 2026-11-07: templates centralizados e artefatos separados, sem repositório por cliente (ADR 0005).
5. Definida por autorização geral: piloto de até 10 vitrines, 100 itens cada e sem uploads; usar vitrine.inspira.dev.br para divulgação, caminhos /loja1 para negócios e painel.inspira.dev.br para administração (ADR 0006). Confirmar controle da zona antes de publicar; nenhum domínio será comprado. Limites serão aplicados ao implementar cadastro/publicação.

## Fatias seguintes, dependentes das decisões

Novo escopo solicitado: oferta gratuita com endereço básico, assinaturas opcionais
de endereço e customizações sob orçamento; portfólio mantido pela equipe Inspira.
Ver docs/commercial-offer.md e ADR 0013 (planos adotados em 2026-11-14; substitui os preços do ADR 0007). Conteúdo inicial
editável em content/portfolio.json; interface administrativa ainda será criada.

1. Auth + criar vitrine + rascunho persistido. Aceite: usuário A não lê/escreve dados de B, inclusive por requisição direta; associação e papel protegidos; logout/revogação testados.
2. Editor pizzaria + prévia. Capturar contexto PRODUCT e direção visual com Impeccable antes de criar UI. Portal em modo Operate; cardápio para consulta e contato. Aceite: teclado, erros e salvamento, mobile/desktop, preço em centavos, estado vazio, item oculto e feedback de alterações não publicadas.
3. Publicação manual em staging no host escolhido. Aceite: só campos públicos, conteúdo escapado no renderizador, sem segredos em bundle/histórico, artefato reproduzível e rollback.
4. Job automatizado e subdomínio. Aceite: duplo clique não duplica recurso; disputa por slug tem um vencedor; falhas de DNS/TLS/build não apagam site ativo; retry limitado e credenciais restritas.
5. Piloto com alertas de cota, exportação/restauração e rotina de remoção. Aceite: exercício de restauração e revogação de acesso; nenhuma dependência de plano gratuito tratada como SLA.

Antes de ativar deploy automático ou criar recursos de clientes, definir conta, domínio, produto Cloudflare e validar autorização real. Esta entrega não é um portal operacional.

## Evidência da camada de acesso

Migração SQL implementada e testada em PGlite com roles de usuário. Suíte atual: 23 testes contabilizados (agrupador, 10 cenários de banco, 5 de projeção, 6 de portfólio e 1 de empacotamento). Evidência de runtime e dependências em docs/runtime-security.md. Supabase Auth/Data API e OAuth ainda não testados de ponta a ponta; sem liberação pública.

## Divulgação implementada

Direção A implementada em web/; build para dist/ e preview local. Menu/FAQ, oferta
em preparação, catálogo público e contato configurável. Revisão em
docs/design/marketing-qa.md e publicação em docs/marketing-launch.md.
Wrangler dry-run passou; autenticação Cloudflare não configurada, sem deploy remoto.

## Planejamento da Plataforma Modular e Painel Configurável (`008` e `009`)

1. **Especificação `008-portal-redesign`**: App Shell Liquid Glass no `/portal/`, painel inicial, perfil e interesses, assistente de nova vitrine em 3 passos, pedidos de customização, editor por componentes (`products`, `booking`, `quote`), planilha CSV no cliente, fluxo público em etapas e painel de Insights sem dados pessoais.
2. **Especificação `009-modular-admin-platform` e `docs/modular-admin-architecture.md`**:
   - **Fase 1 (S)**: Fundação Multi-Inquilino (`tenants`, `platform_operators`), RBAC por vitrine (`owner`, `admin`, `editor`, `viewer`) e trilha de auditoria (`audit_logs`).
   - **Fase 2 (M)**: Edição sem deploy, alternância rápida de disponibilidade, pré-visualização assinada por HMAC, rollback das últimas 5 versões e CMS Institucional (`platform_cms`).
   - **Fase 3 (L)**: Motor de templates (`templates`), módulos de seção (`modules`, `pages`, `sections`, `navigation_menus`) e herança em cascata por vertical de negócio.
   - **Fase 4 (M)**: Gestão de ativos WebP (`<= 200 KB`) com cache imutável na borda (`SupabaseStorageProvider` padrão sem cartão + `R2StorageProvider` plugável) e sandboxing em origem opaca (`sandbox.inspira.dev.br`).
   - **Fase 5 (L)**: Domínios personalizados (`custom_domains`), verificação DNS/SSL, roteamento por `Host` com SWR na borda e trava de 95 domínios gratuitos.

## Estudo de mercado 2026 (ADR 0013)

Decisões do Lino em 2026-11-14: **1.a** manter a arquitetura atual (Worker único,
Supabase e snapshots imutáveis; sem repositório `vtr-*`, Astro ou Cloudflare Pages) e
**2.b** adotar os planos do estudo com cobrança recorrente pelo Asaas desde já
(Stripe depois). Estudo em `docs/market-study-2026.md`; decisão em
`docs/adr/0013-plans-and-recurring-billing.md`; 17 issues prontas em
`docs/backlog/estudo-mercado/`, criadas pelo Lino com
`scripts/criar-issues-estudo-mercado.sh`.

1. **Planos e cobrança:** tabela de planos → direitos por plano no banco → Asaas em
   sandbox → ciclo da assinatura → tela "Plano e cobrança" e página de preços. Stripe
   fica para depois. Produção depende do passo humano `BLK-ASAAS-01`.
2. **Vitrine pública e conversão:** SEO local e cartão de prévia → UTM e Insights por
   origem; "Aberto agora", "Traçar rota" e QR Code; `vitrine.json`; pré-orçamento com
   webhook assinado.
3. **Aquisição:** kit Comment-to-Vitrine (só documentação), importador do Linktree
   para rascunho e vitrine piloto Guavira Fotos.
4. **Painel:** central de canais e pausar, desconectar domínio e arquivar. Papel de
   patrocinador fica para depois.
5. **Vitrine de serviços e produtos** (referência laurapires.com,
   `docs/referencia-laurapires.md`): orçamento de desempenho primeiro (27), depois
   cabeçalho com "Sua seleção", gaveta, página do item, hero com foto, depoimentos,
   "Em breve", link de pagamento do próprio negócio, rodapé e o modelo
   `servicos-produtos-v1` (issues 18 a 26).

## Login múltiplo no painel (`017`, ADR 0015 proposta)

Pedido do Lino em 2026-11-22: tela de entrada minimalista e métodos além do Google.
Especificação em `specs/017-login-multiplo/`; 8 issues em `docs/backlog/login-multiplo/`,
criadas com `scripts/criar-issues-estudo-mercado.sh --dir docs/backlog/login-multiplo`.

1. Tela de entrada nova e ponte WhatsApp no Worker podem começar juntas.
2. E-mail e senha; depois código pelo WhatsApp (resposta gratuita a uma mensagem enviada pela
   pessoa, sem SMS nem modelo pago) e telefone e senha.
3. Proteção contra abuso (Turnstile) antes de ligar os métodos em produção.
4. Passos humanos: SMTP gratuito (`BLK-SMTP-01`), número e app WhatsApp (`BLK-WA-01`), Send SMS
   Hook do Supabase (`BLK-HOOK-01`) e Turnstile (`BLK-TURNSTILE-01`). Nada foi configurado.

As correções de UX da auditoria (`docs/auditoria-ux/`, pacotes `PB-01` a `PB-27`)
continuam valendo e vêm antes das telas novas que dependem delas.
