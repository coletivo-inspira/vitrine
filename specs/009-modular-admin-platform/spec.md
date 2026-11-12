# Feature Specification: Plataforma SaaS Multi-Inquilino e Painel Administrativo Modular e Configurável (`009-modular-admin-platform`)

**Feature Branch**: `009-modular-admin-platform`

**Created**: 2026-11-12

**Status**: Approved for Implementation (5 Fases Sequenciais — Fundação Multi-Tenant, Painel & CMS Institucional, Motor de Templates & Módulos, Ativos & Sandbox, Domínios & Cache de Borda)

**Input**: Evoluir a **Vitrine Inspira** de um portal de criação de sites baseados em modelos para uma plataforma de gerenciamento de vitrines digitais multi-inquilino, com painel administrativo centralizado, modular e configurável em tempo de execução (sem necessidade de alterar código-fonte, acessar banco de dados manualmente ou realizar novo deploy a cada mudança), separando claramente a Administração da Plataforma (Operadores Inspira) da Administração da Vitrine (clientes/equipes), operando a custo zero nos planos gratuitos da Cloudflare e do Supabase.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Isolamento Multi-Inquilino, Equipes por Vitrine e Governança de Papéis (`009-US1`) (Priority: P1)

Como proprietário de negócio ou Operador Inspira autenticado no portal, quero gerenciar organizações clientes (`tenants`), múltiplas vitrines (`showcases`) e permissões de equipe por vitrine (`owner`, `admin`, `editor`, `viewer`) de forma estritamente isolada do painel de Administração da Plataforma (`platform_admin`), com registro automático de auditoria nas mutações críticas, para que uma mesma pessoa possa administrar várias vitrines mantendo os dados, configurações e arquivos de cada vitrine completamente isolados de terceiros.

**Why this priority**: É a fundação de segurança e isolamento exigida pelos Princípios I e II da Constituição antes de abrir configurações avançadas, múltiplos colaboradores ou administração global da plataforma.

**Independent Test**: Autenticar como Usuário A (proprietário das vitrines `vitrine-a1` e `vitrine-a2`), Usuário B (membro apenas de `vitrine-a1` com papel `editor`), Usuário C (inquilino externo) e Operador Inspira (`platform_admin`); verificar que Usuário B edita apenas `vitrine-a1` sem enxergar `vitrine-a2`, Usuário C recebe `404`/`403` em qualquer tentativa de leitura ou escrita sobre `vitrine-a1`, nenhum usuário comum consegue elevar o próprio papel para `platform_admin` ou `owner`, e toda alteração de permissão ou status gera registro imutável em `audit_logs`.

**Acceptance Scenarios**:

1. **Given** uma pessoa autenticada que é proprietária de múltiplas vitrines, **When** alterna entre suas vitrines no seletor rápido do painel (`/portal/`), **Then** o painel carrega exclusivamente o contexto, rascunho, páginas, ativos, domínio e equipe da vitrine selecionada, sem vazar dados entre vitrines.
2. **Given** um membro convidado para a equipe de uma vitrine com papel `editor` ou `viewer`, **When** acessa o portal ou envia chamadas diretas à API, **Then** não possui acesso às demais vitrines do mesmo proprietário ou inquilino, e um `viewer` pode apenas consultar dados sem alterar rascunhos nem publicar.
3. **Given** dois inquilinos distintos (`Tenant A` e `Tenant B`), **When** qualquer membro do `Tenant B` tenta consultar, editar ou publicar recursos do `Tenant A` (via interface ou requisição HTTP direta), **Then** o servidor e as políticas de segurança de banco bloqueiam a operação sem revelar a existência do recurso.
4. **Given** uma mutação administrativa relevante (criação/suspensão de vitrine, alteração de membro, publicação, reversão de versão ou vínculo de domínio), **When** a operação é concluída, **Then** o sistema grava um registro em `audit_logs` com autor, vitrine/inquilino, ação, entidade afetada e carimbo de tempo.

---

### User Story 2 - Administração Visual sem Deploy, Pré-Visualização Segura e Reversão de Publicações (`009-US2`) (Priority: P1)

Como administrador autorizado de uma vitrine, quero realizar operações visuais de criação, edição, ativação/desativação, reordenação e exclusão sobre configurações da vitrine, identidade visual (cores, fontes homologadas, tema), menus de navegação, páginas, seções e itens (incluindo chaveamento rápido de disponibilidade inspirado no painel do Bar da Cássia), testar o resultado em um link de pré-visualização seguro antes de publicar e poder restaurar qualquer uma das últimas 5 versões publicadas em um clique, sem depender de alterações de código ou novo deploy.

**Why this priority**: Atende ao requisito central de gestão em tempo de execução sem deploy, garantindo segurança antes da publicação e recuperação imediata em caso de erro operacional.

**Independent Test**: Alterar cores, fontes, menu, ordem de seções e disponibilidade de itens no painel, abrir a URL de pré-visualização assinada (verificando que visitantes sem o token não acessam a prévia e buscadores recebem `noindex`), publicar a nova versão verificando atualização imediata na vitrine pública, e acionar a reversão (*rollback*) para a versão anterior confirmando a restauração instantânea do conteúdo público.

**Acceptance Scenarios**:

1. **Given** um administrador autenticado no editor da vitrine, **When** ativa ou desativa rapidamente um item, seção ou módulo (como no fluxo operacional do Bar da Cássia), **Then** o estado é salvo no rascunho em menos de 1 segundo com feedback visual imediato.
2. **Given** um rascunho com alterações ainda não publicadas, **When** o administrador gera ou abre a pré-visualização antes da publicação, **Then** o sistema exibe a vitrine exatamente como ficará publicada por meio de um token temporário assinado (válido por até 30 minutos e com cabeçalho `X-Robots-Tag: noindex, nofollow`), mantendo a vitrine pública inalterada para os visitantes.
3. **Given** uma vitrine publicada na revisão `N`, **When** o administrador publica a revisão `N+1`, **Then** o sistema valida a ausência de dados privados, calcula a assinatura de integridade do artefato, armazena a revisão no histórico (mantendo até as 5 últimas versões publicadas por vitrine) e invalida o cache público para que a mudança entre no ar sem novo deploy da plataforma.
4. **Given** uma vitrine com histórico de versões publicadas, **When** o administrador seleciona uma versão anterior e aciona **Restaurar versão (Rollback)**, **Then** a versão escolhida volta a ser a publicação ativa imediatamente e a ação é registrada no histórico de auditoria.

---

### User Story 3 - Administração do Portal Institucional (CMS da Plataforma) pela Equipe Inspira (`009-US3`) (Priority: P1)

Como Operador Inspira (`platform_admin`), quero gerenciar visualmente a página principal da plataforma Vitrine Inspira (`vitrine.inspira.dev.br`) — incluindo banners e destaques do topo, textos institucionais e chamadas comerciais, ordem e visibilidade das seções, catálogo de modelos disponíveis, vitrines em destaque / cases autorizados, comunicados/avisos e links de menu e rodapé — bem como administrar clientes, vitrines e pedidos de customização em uma visão dedicada da plataforma, sem precisar editar HTML/JSON no código-fonte ou publicar nova versão do sistema.

**Why this priority**: Transforma a página institucional em um CMS administrável pela equipe do Coletivo Inspira e separa o painel de operação da plataforma do painel usado pelos clientes.

**Independent Test**: Acessar a área **Administração da Plataforma** como `platform_admin` (confirmando que clientes comuns não veem nem acessam essas rotas), atualizar um banner, um aviso global, a ordem de uma seção e um case autorizado em destaque, pré-visualizar e publicar o CMS institucional, e verificar que a página inicial pública reflete as mudanças imediatamente com fallback seguro para o conteúdo padrão caso o banco esteja indisponível.

**Acceptance Scenarios**:

1. **Given** um Operador Inspira autenticado como `platform_admin`, **When** edita textos institucionais, chamadas comerciais, avisos, links de navegação/rodapé, modelos exibidos ou cases autorizados na seção **CMS Institucional** e publica, **Then** a página principal da plataforma passa a exibir o novo conteúdo sem necessidade de novo build ou deploy.
2. **Given** que o Operador Inspira oculta uma seção institucional ou desativa temporariamente um comunicado, **When** a alteração é publicada, **Then** a seção deixa de ser renderizada na página pública mantendo seus dados preservados para reativação futura.
3. **Given** um usuário autenticado que é proprietário de vitrine mas não é `platform_admin`, **When** tenta acessar o módulo ou as rotas de Administração da Plataforma (`/api/admin/*`), **Then** recebe `403 Forbidden` e vê no painel apenas a administração das suas próprias vitrines.

---

### User Story 4 - Modularização por Verticais de Negócio, Modelos Reutilizáveis e Páginas/Seções (`009-US4`) (Priority: P2)

Como proprietário de vitrine, quero escolher e trocar entre modelos reutilizáveis da plataforma (como Cardápio Digital para gastronomia, Portfólio/Agendamento para profissionais e serviços, ou Catálogo/Link-in-Bio para comércio) e personalizar minha identidade visual, páginas adicionais, menus e ordem das seções sem perder meus dados cadastrados e sem ser afetado negativamente quando a equipe Inspira atualizar o modelo base.

**Why this priority**: Permite atender diferentes tipos de negócios sobre a mesma plataforma compartilhada, combinando padronização e autonomia de personalização por vitrine.

**Independent Test**: Criar uma vitrine com modelo de Cardápio Digital e outra com modelo de Portfólio Profissional, personalizar cores/fontes, adicionar uma página extra ("Sobre nós") e reordenar seções (`hero`, `catalogo`, `depoimentos`, `contato`, `faq`), trocar a variante de layout do modelo preservando os itens cadastrados e verificar que uma atualização no modelo base não sobrescreve as personalizações da vitrine.

**Acceptance Scenarios**:

1. **Given** uma vitrine associada a uma versão específica de um modelo base (`template`), **When** o proprietário personaliza tokens visuais (paleta de cores com contraste validado, par tipográfico homologado, estilo de botões), reordena seções ou cria páginas adicionais (até o limite do plano), **Then** as personalizações são salvas como sobreposições (*overrides*) da vitrine sem alterar o modelo base compartilhado pelos demais clientes.
2. **Given** que a equipe Inspira publica uma nova revisão compatível de um modelo base, **When** as vitrines existentes são renderizadas, **Then** nenhuma personalização individual de cores, textos, páginas ou itens do cliente é perdida ou sobrescrita.
3. **Given** que o proprietário decide trocar o modelo visual da sua vitrine dentro da mesma vertical ou habilitar/desabilitar um módulo opcional (ex.: seção de perguntas frequentes, galeria de fotos, horários de atendimento), **When** confirma a alteração no editor, **Then** os produtos/serviços e dados de contato permanecem íntegros e podem ser pré-visualizados antes de publicar.

---

### User Story 5 - Gestão de Arquivos, Ativos Otimizados e Componentes Personalizados em Sandbox (`009-US5`) (Priority: P2)

Como administrador autorizado, quero enviar e organizar imagens e arquivos estáticos por vitrine (com otimização automática para WebP no navegador antes do envio) e, quando houver uma customização sob medida aprovada, registrar componentes personalizados (HTML/CSS/JS ou integrações desenvolvidas em repositórios GitHub separados) que rodem em um ambiente isolado (*sandbox*) sem risco de executar scripts na origem principal ou acessar dados de outras vitrines.

**Why this priority**: Viabiliza tanto a gestão centralizada de mídia por cliente dentro da cota gratuita quanto a criação de funcionalidades exclusivas fora do repositório principal com segurança criptográfica.

**Independent Test**: Fazer upload de imagens de catálogo/banner verificando conversão automática no navegador para WebP (`<= 200 KB`), organização e cota por vitrine; registrar um componente personalizado HTML/JS de teste (ou manifesto de repositório GitHub externo) associado a uma seção da vitrine, pré-visualizar a página e comprovar que o componente renderiza dentro de um `<iframe sandbox="allow-scripts">` em origem opaca (`null`), sendo incapaz de ler `document.cookie`, `localStorage` ou fazer chamadas autenticadas à API do portal.

**Acceptance Scenarios**:

1. **Given** um administrador enviando uma imagem para a biblioteca de arquivos da vitrine, **When** o arquivo é selecionado no navegador, **Then** é convertido no cliente para WebP (`<= 200 KB`, máx. `1600px`), validado contra a cota da vitrine, armazenado sob o prefixo isolado da vitrine e entregue com cache imutável na borda.
2. **Given** uma funcionalidade ou componente personalizado (HTML/CSS/JS ou pacote de repositório GitHub externo) registrado por um Operador Inspira para uma vitrine específica, **When** a vitrine é aberta na prévia ou na versão publicada, **Then** o componente é executado exclusivamente dentro de um contêiner isolado (`<iframe sandbox="allow-scripts">` sem `allow-same-origin`, com origem `null` e CSP restritiva), comunicando-se com a vitrine apenas por mensagens estruturadas e validadas (`postMessage`).
3. **Given** um script dentro de um componente personalizado tentando acessar `document.cookie`, `window.parent.document` ou `/api/*`, **When** o navegador executa o componente na prévia ou na vitrine pública, **Then** o acesso é bloqueado pela política de origem opaca e pela Content Security Policy, impedindo qualquer vazamento de sessão ou dados de outros clientes.

---

### User Story 6 - Gerenciamento de Domínios Personalizados e Publicação a Custo Zero (`009-US6`) (Priority: P3)

Como proprietário de vitrine ou Operador Inspira, quero disponibilizar a vitrine inicialmente em um endereço padrão gratuito da plataforma (`vitrine.inspira.dev.br/<slug>`) e poder vincular um subdomínio personalizado ou domínio próprio já registrado pelo cliente (`cardapio.cliente.com.br` ou `cliente.com.br`), acompanhando o passo a passo de verificação DNS e status de HTTPS/SSL no painel e podendo alterar o endereço sem perder dados, configurações ou o modelo visual da vitrine.

**Why this priority**: Entrega autonomia de marca própria para os negócios que contratam vínculo de domínio mantendo o custo operacional fixo da plataforma em R$ 0/mês.

**Independent Test**: Configurar uma vitrine no endereço padrão `vitrine.inspira.dev.br/<slug>`, cadastrar um domínio personalizado no painel, consultar as instruções de apontamento DNS (`CNAME` / `TXT`), simular a verificação de propriedade e ativação de SSL, validar que o Worker resolve tanto o domínio personalizado quanto o endereço padrão sem perda de dados, e verificar que a trava de cota gratuita impede ultrapassar o limite gratuito de hostnames personalizados.

**Acceptance Scenarios**:

1. **Given** uma vitrine publicada no endereço padrão `vitrine.inspira.dev.br/<slug>`, **When** um domínio próprio ou subdomínio é vinculado e verificado (`status = 'active'` e `ssl_status = 'active'`), **Then** o visitante acessando o novo domínio visualiza a mesma vitrine publicada com HTTPS válido, sem perda de dados, configurações ou histórico.
2. **Given** um domínio recém-cadastrado no painel com status `pending_dns` ou `verifying`, **When** o administrador consulta a tela de **Domínios**, **Then** visualiza exatamente os registros DNS necessários (`CNAME` e `TXT` de verificação), o estado atual da verificação e um botão para revalidar, enquanto a vitrine permanece normalmente acessível no endereço padrão.
3. **Given** que o domínio personalizado é removido ou suspenso, **When** a alteração é aplicada, **Then** a associação do hostname é desfeita de forma coordenada (prevenindo *domain takeover*) e a vitrine volta a ter o endereço básico `vitrine.inspira.dev.br/<slug>` como canônico sem perder nenhum dado.
4. **Given** a cota gratuita de domínios personalizados na infraestrutura de borda (trava defensiva em 95 hostnames ativos para nunca exceder os 100 gratuitos), **When** uma nova ativação atingiria o limite, **Then** o sistema bloqueia o provisionamento automático com aviso claro ao Operador Inspira, garantindo zero cobrança excedente.

---

### Edge Cases

- **Tentativa de publicar rascunho acima de 256 KiB ou com campos administrativos internos**: O validador e a barreira `assertNoPrivateLeakage()` rejeitam a compilação antes de gravar em `publications`, mantendo a última versão publicada intacta no ar.
- **Falha temporária ou pausa do banco de dados durante acesso público à vitrine ou à home institucional**: Vitrines públicas e a página inicial utilizam cache na borda (`stale-while-revalidate`) e fallback estático para continuar respondendo aos visitantes mesmo durante manutenção do banco; além disso, um agendamento periódico leve evita a pausa por inatividade de 7 dias do plano gratuito.
- **Domínio ápice (`cliente.com.br`) em provedor de DNS sem suporte a CNAME na raiz**: O painel detecta se o endereço informado é um domínio raiz e orienta o cliente a usar um subdomínio (`cardapio.cliente.com.br` / `www.cliente.com.br`) ou delegar gratuitamente os nameservers para a Cloudflare Free (que provê *CNAME Flattening*).
- **Atualização de modelo base enquanto o cliente possui rascunho aberto**: Como a vitrine referencia a revisão do modelo e salva suas customizações como sobreposições (*overrides*) declarativas, o rascunho do cliente não quebra e a migração de schema ocorre de forma retrocompatível.
- **Dispositivos móveis de entrada e usuários com redução de transparência**: O visual *Liquid Glass* fica estritamente contido ao App Shell do painel administrativo (`/portal/`) com opacidade base de 85% (contraste WCAG AAA) e fallback sólido automático quando `backdrop-filter` não é suportado ou `prefers-reduced-transparency: reduce` está ativo; vitrines públicas e página institucional permanecem 100% sólidas (zero blur).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001 (Hierarquia Multi-Inquilino e RBAC)**: O sistema DEVE suportar organizações clientes (`tenants`), múltiplas vitrines por cliente (`sites` / `showcases`) e controle de acesso baseado em papéis por vitrine (`owner`, `admin`, `editor`, `viewer`), além do papel separado de operador da plataforma (`platform_admin`), com validação obrigatória no servidor e políticas RLS no PostgreSQL usando funções `SECURITY DEFINER` / `STABLE` no schema `private`.
- **FR-002 (Matriz de Configuração em 4 Escopos)**: O sistema DEVE separar e resolver configurações em quatro níveis distintos: (1) **Global da Plataforma** (`platform_cms`, catálogo de `templates` e `modules`, limites de cota), (2) **Organização/Cliente** (`tenants.settings`, franquia e membros da organização), (3) **Vitrine Específica** (`theme_overrides`, páginas, seções, menus, itens, ativos e domínios) e (4) **Preferências do Usuário** (`profiles`, tema claro/escuro do painel).
- **FR-003 (Administração Visual CRUD sem Deploy)**: O painel administrativo (`/portal/`) DEVE permitir criar, consultar, atualizar, reordenar, ativar/desativar e excluir visualmente páginas, seções, menus de navegação, itens de catálogo, parâmetros visuais (cores, fontes homologadas, layout) e configurações operacionais em tempo de execução, refletindo as alterações após publicação sem necessidade de alterar código-fonte ou realizar novo deploy.
- **FR-004 (Fluxo Rascunho → Prévia Assinada → Publicação Imutável → Rollback)**: Toda alteração de vitrine DEVE ser salva inicialmente em `drafts` ($\le 256\text{ KiB}$), poder ser inspecionada em uma rota de pré-visualização protegida por token temporário assinado via HMAC (`X-Robots-Tag: noindex, nofollow`), ser compilada em um manifesto público imutável com hash SHA-256 (`publications` e `publication_releases`) validado por `assertNoPrivateLeakage()`, e permitir restauração (*rollback*) imediata para qualquer uma das últimas 5 revisões publicadas.
- **FR-005 (CMS Institucional da Plataforma)**: O painel DEVE oferecer aos Operadores Inspira (`platform_admin`) um módulo de CMS Institucional (`public.platform_cms`) para gerenciar banners, textos institucionais, chamadas comerciais, ordem e visibilidade de seções, modelos disponíveis, vitrines em destaque (cases autorizados), comunicados e rodapé da página inicial da Vitrine Inspira sem novo deploy.
- **FR-006 (Modelos Reutilizáveis, Verticais e Herança Segura)**: A plataforma DEVE disponibilizar um registro de modelos (`public.templates`) e módulos de seção (`public.sections` / `public.modules`) cobrindo as verticais de negócio (Gastronomia/Cardápio, Serviços/Agendamento, Portfólio/Orçamento e Catálogo/Link-in-Bio), resolvendo a apresentação por herança em cascata (*Defaults do Modelo* → *Defaults da Vertical* → *Overrides da Vitrine*) para que atualizações no modelo central não quebrem personalizações existentes.
- **FR-007 (Gestão de Ativos WebP e Cota por Vitrine)**: O sistema DEVE converter imagens enviadas no painel para `image/webp` ($\le 200\text{ KB}$, máx. `1600px`) no navegador do administrador antes do envio, registrar metadados e controle de cota em `public.assets` isolados por vitrine/inquilino, e servir as imagens públicas com cache imutável na borda sobre o Supabase Storage Free (com adaptador plugável para Cloudflare R2 Free).
- **FR-008 (Extensibilidade e Sandboxing em Origem Opaca)**: Quando uma vitrine incorporar componentes personalizados (HTML/CSS/JS ou pacotes integrados de repositórios GitHub externos aprovados por Operador Inspira), o sistema DEVE renderizá-los exclusivamente dentro de um `<iframe sandbox="allow-scripts" referrerpolicy="no-referrer">` servido em hostname isolado (`sandbox.inspira.dev.br`) sem `allow-same-origin` (origem `null`), bloqueando acesso a cookies, storage e DOM principal e restringindo a comunicação a eventos `postMessage` validados por schema.
- **FR-009 (Domínios Personalizados e Roteamento de Borda a Custo Zero)**: O sistema DEVE permitir que cada vitrine opere no endereço padrão `vitrine.inspira.dev.br/<slug>` e cadastre subdomínios ou domínios próprios em `public.custom_domains` com verificação de propriedade DNS (`CNAME`/`TXT`), status de SSL e resolução dinâmica pelo cabeçalho `Host` no Cloudflare Worker com `Cache API` (`stale-while-revalidate`), aplicando trava rígida em 95 domínios ativos no Cloudflare for SaaS para manter custo operacional zero.
- **FR-010 (Auditoria e Observabilidade Administrativa)**: Todas as mutações de segurança e governança (alteração de permissões, publicação, reversão, aprovação de componente externo, vínculo/remoção de domínio e alterações no CMS institucional) DEVEM ser registradas em `public.audit_logs` e consultáveis no histórico de alterações do painel conforme o escopo de permissão do usuário.
- **FR-011 (Contenção Visual Liquid Glass vs. Brandbook Inspira)**: O estilo *Liquid Glass* DEVE ser aplicado exclusivamente ao App Shell do painel administrativo (`/portal/`) com opacidade base de 85% (contraste WCAG AAA) e fallbacks sólidos automáticos (`@supports` e `prefers-reduced-transparency`), mantendo a página institucional e todas as vitrines públicas com superfícies 100% sólidas alinhadas ao Brandbook Inspira.

### Key Entities

- **Organização Cliente (`Tenant` / `public.tenants`)**: Agrupador organizacional do cliente com `id`, `slug`, `name`, `plan`, `status` e `settings`, permitindo que um cliente possua uma ou mais vitrines sob limites de cota controlados.
- **Vínculo de Acesso e Papel (`Membership` / `public.site_memberships` & `public.platform_operators`)**: Associação que define o papel de um usuário (`owner`, `admin`, `editor`, `viewer`) em uma vitrine específica (sem herança automática indevida entre vitrines distintas) e identifica separadamente os Operadores Inspira (`platform_admin`).
- **Modelo e Módulo (`Template` & `Module` / `public.templates`, `public.modules`)**: Definição declarativa dos modelos reutilizáveis da plataforma, seus tokens visuais padrão, layout inicial e esquema JSON dos módulos de seção permitidos.
- **Página, Seção e Menu da Vitrine (`Page`, `Section`, `NavigationMenu`)**: Estrutura modular da vitrine permitindo múltiplas páginas, seções reordenáveis (`hero`, `catalog`, `about`, `testimonials`, `faq`, `contact`, `custom_sandbox`) e menus de navegação configuráveis.
- **Ativo e Componente Personalizado (`Asset` & `CustomComponent` / `public.assets`, `public.custom_components`)**: Registro de arquivos estáticos otimizados (imagens WebP, documentos) e manifestos de componentes externos isolados em sandbox, com versionamento e controle de tamanho por vitrine.
- **Domínio Personalizado (`CustomDomain` / `public.custom_domains`)**: Vínculo de hostname personalizado (`cardapio.cliente.com.br` ou `cliente.com.br`) a uma vitrine com estados de verificação DNS (`pending_dns`, `verifying`, `active`, `failed`, `suspended`) e status de certificado TLS.
- **CMS Institucional (`PlatformCms` / `public.platform_cms`)**: Registro das seções editáveis da página principal da Vitrine Inspira (banners, textos, modelos, cases em destaque, avisos e rodapé) com rascunho, publicação e histórico.
- **Registro de Auditoria (`AuditLog` / `public.audit_logs`)**: Trilha imutável de ações administrativas realizadas por operadores e membros de equipe.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001 (Isolamento Multi-Inquilino 100%)**: 100% dos testes automatizados de banco de dados (PGlite) e de API comprovam que um usuário autenticado jamais lê, altera, publica ou reverte dados, arquivos, domínios ou configurações de outra vitrine à qual não pertença, nem acessa rotas de `platform_admin` sem autorização explícita.
- **SC-002 (Publicação e Reversão em Tempo de Execução sem Deploy)**: 100% das alterações de conteúdo, tema, ordem de seções, páginas, disponibilidade de itens e CMS institucional publicadas pelo painel entram no ar imediatamente (e podem ser revertidas para qualquer uma das 5 versões anteriores em 1 clique) sem alterar código-fonte e sem executar novo deploy da aplicação.
- **SC-003 (Zero Vazamento Privado e Sandboxing Efetivo)**: 100% dos artefatos publicados passam na verificação `assertNoPrivateLeakage()` com hash SHA-256 determinístico, e 100% dos componentes personalizados são renderizados em `<iframe sandbox="allow-scripts">` com origem opaca (`null`), sem acesso a cookies ou APIs autenticadas.
- **SC-004 (Performance na Borda e Conformidade com Custo Zero)**: A resolução pública de vitrines na borda opera dentro do orçamento de `< 1,5 ms` de CPU em cache hit/SWR (respeitando o limite de 10 ms do Cloudflare Workers Free), as imagens enviadas respeitam o teto de `200 KB` em WebP, os rascunhos respeitam `256 KiB` e a trava de domínios personalizados bloqueia ativações acima de 95 hostnames gratuitos.
- **SC-005 (Acessibilidade e Contenção Visual)**: 100% das telas do painel administrativo (`/portal/`), da página institucional (`/`) e das vitrines públicas (`/<slug>`) atendem ao contraste mínimo WCAG AA/AAA nos temas claro e escuro, mantendo o efeito *Liquid Glass* restrito ao painel com fallback sólido funcional.

## Assumptions

- A evolução constrói de forma incremental e 100% retrocompatível sobre a base existente em `d:\IA\vitrine` (migrações append-only em `supabase/migrations/`, motor de publicação em `src/publication-engine.mjs`, validações em `src/portal-validation.mjs`, roteador em `workers/api.mjs` e especificações `001` a `008`).
- Para operar imediatamente sem exigir cadastro de cartão de crédito (conforme ADR 0005), o armazenamento padrão de imagens utiliza o bucket `catalog-images` no Supabase Storage Free (1 GB) protegido por compressão WebP no cliente (`<= 200 KB`) e cache imutável na borda da Cloudflare, mantendo o adaptador para Cloudflare R2 Free (10 GB, zero egress) pronto para ativação por configuração.
- A integração de funcionalidades desenvolvidas em repositórios GitHub externos ocorre por meio de manifestos versionados e bundles estáticos auditados por Operadores Inspira, carregados exclusivamente no subdomínio/rota de sandbox com origem opaca (`null`).
