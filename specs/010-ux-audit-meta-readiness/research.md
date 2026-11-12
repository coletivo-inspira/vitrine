# Pesquisa e Decisões Técnicas (Phase 0): Programa de Auditoria UX e Prontidão Meta/Instagram (`010-ux-audit-meta-readiness`)

**Feature**: `010-ux-audit-meta-readiness`
**Date**: 2026-11-12
**Spec**: [spec.md](spec.md) | **Constitution**: [../../.specify/memory/constitution.md](../../.specify/memory/constitution.md)

---

## 1. Resumo Executivo

Todas as questões técnicas, metodológicas e de escopo relativas às 25 issues abertas do repositório (`#34`–`#38`, `#39`–`#44`, `#48` e `#61`–`#73`) foram decididas a partir da Constituição (`.specify/memory/constitution.md`), da Arquitetura (`docs/architecture.md`), do Roadmap (`docs/roadmap.md`) e dos ADRs `0001` a `0011`. Nenhuma pergunta ou marcador `NEEDS CLARIFICATION` permanece em aberto. Onde existe dependência de ação humana real em consoles externos (como criar o aplicativo na Meta na `#48`, configurar DNS/Cloudflare for SaaS na `#44` ou fornecer sessão real de operador na `#72`), a decisão técnica de como fazer já está tomada e o item fica registrado como bloqueio humano explícito (HITL) para o Lino.

---

## 2. Decisões Consolidadas (`Decisão / Motivo / Alternativas Consideradas`)

### 2.1. Reconciliação das Issues `#34`–`#38` (Spec 008)
- **Decisão**: Marcar todas as tarefas de `specs/008-portal-redesign/tasks.md` (`T001` a `T028`) como concluídas (`[x]`), classificar as issues `#34`, `#35`, `#36`, `#37` e `#38` como **Entregues** no código (pelas PRs `#22` a `#28` e refinamentos posteriores nas PRs `#54` a `#60`, `#74`, `#75`, `#83`, `#85` e `#86`) e manter as issues abertas no GitHub para revisão e fechamento pelo Lino.
- **Motivo**: Todo o código, migrações (`202611120002` e `202611120003`) e suítes de teste (`portal-redesign-backend`, `portal-shell-wizard`, `csv-catalog`, `storefront-staged-flow`, `site-metrics-insights`, `portal-redesign-qa`) já estão na `main` e passando em `npm test`.
- **Alternativas consideradas**:
  - *Recriar tarefas ou reabrir PRs para a Spec 008*: rejeitada por retrabalho sobre funcionalidade já mergeada e testada.
  - *Fechar as issues automaticamente via CLI*: rejeitada por restrição explícita do usuário ("não feche nenhuma issue, apenas registre").

### 2.2. Reconciliação de Migrações, Módulos e Testes das Issues `#39`–`#44` (Spec 009)
- **Decisão**: Adotar oficialmente a cadeia de migrações append-only já presente em `supabase/migrations/` (`202611120005_multi_tenant_rbac_audit.sql`, `202611120006_cms_pages_sections_releases.sql`, `202611120007_assets_sandbox_domains.sql`, `202611120008_platform_operations.sql` e `202611120009_profile_custom_interests.sql`, preservando `202611120004_fix_upsert_column_grants.sql` da PR `#33`), reconhecer `#39` a `#43` como **Entregues** (PRs `#45`, `#85` e `#86`) com os testes PGlite consolidados em `test/portal-redesign-backend.test.mjs` e as suítes `cms-preview-rollback`, `template-inheritance-modules`, `assets-opaque-sandbox` e `custom-domains-edge-cache`, e atualizar `supabase/README.md` e `specs/009-modular-admin-platform/tasks.md` para fechar a pendência documental de `T033` (`#44`).
- **Motivo**: Garante fidelidade entre a documentação Spec Kit `009` e a implementação real mergeada na PR `#45`, respeitando a regra de ouro de nunca renomear migrações já existentes na `main`.
- **Alternativas consideradas**:
  - *Renomear `202611120005`–`0007` para `0004`–`0006`*: rejeitada porque quebraria o histórico append-only do Supabase e o pipeline `.github/workflows/deploy.yml`.

### 2.3. Governança de Domínios Personalizados e Validação Externa na Issue `#44` (Spec 009)
- **Decisão**: Manter 100% da lógica de validação RFC 1123, desafios DNS (`TXT` e `CNAME`), trava rígida de 95 domínios ativos (`DOMAIN_QUOTA_REACHED`), roteamento por `Host` com `caches.default` (`stale-while-revalidate`) e Cron diário verificada localmente em `test/custom-domains-edge-cache.test.mjs`, e registrar a configuração real de `CF_SAAS_CNAME_TARGET`, `CF_SAAS_ZONE_ID`, `CF_SAAS_API_TOKEN` e `sandbox.inspira.dev.br` na conta Cloudflare como bloqueio humano explícito (HITL) do Lino.
- **Motivo**: Atende aos Princípios III, IV e V da Constituição (credenciais só no servidor, trava de custo zero abaixo dos 100 domínios gratuitos do Cloudflare for SaaS e proibição de afirmar deploy/configuração remota não realizada).
- **Alternativas consideradas**:
  - *Remover a exigência das variáveis `CF_SAAS_*` e simular ativação de domínio em produção*: rejeitada por violar o Princípio V (enganaria o usuário sobre o estado real do DNS/TLS).

### 2.4. Modelo de Integração Meta/Instagram e Páginas Públicas de Conformidade na Issue `#48`
- **Decisão**: Confirmar a arquitetura de **aplicativo Meta único da Vitrine** operando com *Instagram API with Instagram Login* e escopo mínimo somente leitura `instagram_business_basic` (1 conta profissional Empresa/Criador por vitrine, sincronização periódica server-side a cada 6 horas no Cron do Worker Free, zero mensagens na fase inicial conforme PR `#76`, e login do painel mantido exclusivamente via Google OAuth PKCE conforme PR `#78`), planejar a criação das páginas institucionais estáticas `/privacidade` (`web/privacidade/index.html`, com seção `#exclusao-dados`) e `/termos` (`web/termos/index.html`) sob direção sólida ("no glass"), e isolar as etapas de console Meta e conta `@ganjastudio.br` como bloqueios HITL do Lino.
- **Motivo**: Fecha todas as definições arquiteturais e entrega os destinos públicos HTTPS exigidos pelo console Meta antes do *App Review*, sem introduzir custos fixos nem expor tokens a sites consumidores como o da Ganja.
- **Alternativas consideradas**:
  - *Exigir que cada cliente crie seu próprio app no console Meta*: rejeitada por inviabilizar a experiência para pequenos negócios.
  - *Adotar Facebook Login for Business exigindo Página do Facebook vinculada*: rejeitada por adicionar fricção desnecessária a contas profissionais que operam apenas no Instagram.

### 2.5. Estrutura e Versionamento da Matriz Central de Auditoria UX na Issue `#61`
- **Decisão**: Versionar o documento central da auditoria diretamente no repositório em `docs/auditoria-ux/matriz-central.md` (complementado por `docs/auditoria-ux/relatorio-consolidado.md` na `#73`), estruturando-o com: (a) tabela de ambientes e versões (produção planejada vs. preview local `127.0.0.1:4173`), (b) matriz de papéis e permissões, (c) inventário completo de controles por tela, estado e largura, e (d) registro de achados `P0`–`P3` com distinção obrigatória entre `problema_confirmado`, `risco_codigo`, `critica_ux` e `nao_verificado`.
- **Motivo**: Permite rastreabilidade por PR, revisão de código no GitHub e execução determinística por agentes AFK nas ondas 1 e 2 sem depender de planilhas externas fora do controle de versão.
- **Alternativas consideradas**:
  - *Manter a matriz apenas em comentários soltos nas issues do GitHub*: rejeitada por dificultar a consolidação cruzada na issue `#73` e por não ser verificável em testes automatizados do repositório.

### 2.6. Protocolo de Viewports, Orientação, Zoom 200% e Acessibilidade nas Issues `#62`–`#72`
- **Decisão**: Padronizar a bateria de inspeção em todas as 11 issues de jornada (`#62` a `#72`) sobre as 5 larguras obrigatórias (`360×800`, `390×844`, `768×1024`, `1024×768` e `1440×900`), orientação horizontal móvel (`844×390`), zoom de `200%` (equivalente a viewport lógica de `640×360` em desktop e `180–195 px` ou `text-scale` 200%), temas `light` e `dark`, navegação por teclado (`Tab`, `Shift+Tab`, `Enter`, `Space`, `Escape`), contraste WCAG 2.2 AA/AAA, alvos de toque `>= 44×44 px` e media queries `prefers-reduced-motion: reduce` e `prefers-reduced-transparency: reduce`.
- **Motivo**: Cumpre literalmente os critérios de aceite padronizados de `#62` a `#72` e as diretrizes de `DESIGN.md`.
- **Alternativas consideradas**:
  - *Testar apenas em `1440px` e `390px` como na auditoria preliminar da Spec 008*: rejeitada porque as issues `#62` a `#72` exigem explicitamente `360`, `390`, `768`, `1024` e `1440 px`, orientação horizontal e zoom `200%`.

### 2.7. Escopo da Auditoria da Descoberta Institucional até o Contato na Issue `#62`
- **Decisão**: Auditar integralmente a arquitetura multipágina do site de divulgação (`web/index.html`, `web/como-funciona/index.html`, `web/possibilidades/index.html`, `web/planos/index.html` e `web/orcamento/index.html`), cobrindo cabeçalho fixo `.site-header` em Liquid Glass, ilustração da Mila, pilha interativa de vitrines, filtros por área, oferta comercial, perguntas frequentes, rodapé com assinatura Coletivo Inspira, bolinha fixa (`inspira-orb.js` com reação a hover/foco e respeito a movimento reduzido), metatags Open Graph (`og-vitrine.png`) e validação de destinos `wa.me` sem uso dos termos proibidos.
- **Motivo**: Reflete as entregas das PRs `#46`, `#47`, `#57`, `#59` e `#74` que expandiram o site institucional além de uma página única.
- **Alternativas consideradas**:
  - *Auditar apenas `web/index.html`*: rejeitada por deixar de fora `/como-funciona/`, `/possibilidades/`, `/planos/` e `/orcamento/`.

### 2.8. Estratégia de Execução AFK para Jornadas Autenticadas do Painel nas Issues `#63`–`#67` e `#69`–`#71`
- **Decisão**: Executar as auditorias das jornadas do painel (`/portal/`) combinando dois modos complementares: (1) **Modo Local de Demonstração** no navegador para fluxos de interface, responsividade, teclado e estado offline, e (2) **Servidor/Handler Local Integrado (`createApiHandler` + PGlite/MemoryStore com tokens JWT de teste)** para exercitar fluxos autenticados online (portão de perfil obrigatório da PR `#54`/`#75`, máscara de WhatsApp, até 8 interesses com `outro:`, seletor rápido de vitrines no topo, assistente em 3 passos, editor em cartões estilo Forms da PR `#60`/`#85`/`#86`, modalidades de preço fixo/lance/doação/troca da PR `#83`, prévia HMAC, rollback de 5 versões, importação CSV e Insights `7d`/`30d`/`90d`).
- **Motivo**: Permite auditar 100% dos estados de sucesso, erro (`401`, `403`, `409`, `422`), concorrência de revisão e isolamento de papéis de forma determinística e sem depender de login interativo humano no Google durante as tarefas AFK.
- **Alternativas consideradas**:
  - *Testar o painel apenas em Modo Local (offline)*: rejeitada porque recursos online da Spec 009 (como Prévia Segura HMAC, Histórico de Versões/Rollback, Equipe, Estrutura, Biblioteca de Arquivos e Domínios) exigem sessão autenticada na API.

### 2.9. Escopo da Auditoria da Vitrine Pública na Issue `#68`
- **Decisão**: Auditar a vitrine pública (`/loja1` e vitrines dinâmicas `/<slug>`) percorrendo as 3 etapas do `StorefrontRenderer` (1. Escolher itens → 2. Preencher dados configurados → 3. Revisar resumo e validar a URL `https://wa.me/` gerada sem enviar mensagem real), cobrindo as 4 modalidades de item (`fixed_price`, `minimum_bid`, `donation`, `barter`), caracteres especiais (`&`, `%`, acentos, quebras de linha) e campos opcionais ausentes na interpolação, estados de vitrine vazia, erro de rede e `404.html`, aviso de privacidade no rodapé (`sendBeacon`) e ausência absoluta de controles administrativos ou chamadas ao Supabase.
- **Motivo**: Garante conformidade com o Princípio I da Constituição e cobre as novas modalidades introduzidas na PR `#83`.
- **Alternativas consideradas**:
  - *Testar apenas itens de preço fixo*: rejeitada porque a PR `#83` introduziu lance, doação e troca na vitrine pública.

### 2.10. Execução Híbrida (AFK Local + Portão HITL) na Issue `#72` (Administração da Plataforma)
- **Decisão**: Realizar imediatamente a auditoria completa de código, contratos HTTP e interface de `#platform-cms-section`, `#platform-operations` e `#platform-templates` usando sessão local de teste com papel `platform_admin` (em `public.platform_operators`) e contas não privilegiadas (`owner`, `editor`, `viewer` recebendo `403`), registrando os resultados na matriz central, e deixar preparado o checklist de homologação HITL para quando o Lino autenticar com a conta real de operador no ambiente remoto.
- **Motivo**: Adianta 95% da verificação de usabilidade, responsividade e controle de acesso de `#72` sem bloquear a consolidação preliminar, respeitando a marcação `Tipo: HITL — acesso de operador de teste` da issue.
- **Alternativas consideradas**:
  - *Deixar a issue `#72` inteiramente em branco esperando a conta de teste remota*: rejeitada porque toda a interface (`web/portal/platform-cms.js`) e as rotas (`/api/admin/*`) já estão no repositório e podem ser auditadas localmente.

### 2.11. Critérios de Consolidação e Eixos de Simplificação na Issue `#73`
- **Decisão**: Consolidar todas as evidências em `docs/auditoria-ux/relatorio-consolidado.md` com: (1) quadro de cobertura de cenários executados vs. aplicáveis por dispositivo, (2) lista de achados `P0` e `P1` com status e critério de aceite, e (3) backlog priorizado de melhorias e simplificações organizado nos 5 eixos da issue (`navegação`, `conta/tema`, `formulários`, `feedback` e `movimento`).
- **Motivo**: Atende integralmente aos 3 critérios de aceite da issue `#73` e fornece ao Lino uma visão executiva única para tomada de decisão.
- **Alternativas consideradas**:
  - *Manter relatórios separados por issue sem documento consolidado*: rejeitada por contrariar o objetivo central da `#73`.
