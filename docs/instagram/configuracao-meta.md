# Configuração Meta para integração Instagram

Data: 12/11/2026. Status: mapeamento documental (`Refs #48`); sem código de integração, sem criação remota no console Meta e sem deploy nesta entrega.

Este documento detalha a etapa 1 do roteiro [`docs/instagram-integration-roadmap.md`](../instagram-integration-roadmap.md), alinhado à [arquitetura proposta](../architecture.md), ao [roadmap](../roadmap.md) e ao vocabulário de [`CONTEXT.md`](../../CONTEXT.md).

## Modelo: aplicativo Meta único da Vitrine

- **Propriedade centralizada da equipe**: a Vitrine Inspira mantém **um único aplicativo Meta**, criado e administrado pela equipe Inspira no console Meta for Developers, que atende todas as vitrines da plataforma.
- **Experiência do proprietário da vitrine**: nenhum proprietário de vitrine precisa criar aplicativo, acessar o console Meta ou lidar com chaves de API. O proprietário apenas entra no painel (`painel.inspira.dev.br`), seleciona sua vitrine e autoriza a própria conta profissional do Instagram via fluxo OAuth oficial.
- **Isolamento por vitrine**: cada vitrine conecta no máximo uma conta profissional do Instagram. A autorização concedida para uma vitrine não concede acesso a outras vitrines do mesmo proprietário ou de outros membros (ADR 0002).
- **Vitrine como central para sites consumidores**: sites externos (como o da Ganja) não consultam a API da Meta diretamente nem recebem tokens; eles consomem exclusivamente a projeção pública servida pela Vitrine.
- **Custo operacional zero**: toda a orquestração de retorno OAuth, guarda de segredos e renovação opera nos limites gratuitos já aprovados (Cloudflare Workers Free e Supabase Free, conforme ADR 0001, ADR 0003 e ADR 0005), sem planos pagos ou upgrades automáticos.

## Configuração do aplicativo com Instagram Login

1. **Produto e fluxo**: utilizar a *API with Instagram Login* (Instagram API com Login do Instagram para contas profissionais), dispensando vínculo obrigatório com Página do Facebook quando a conta profissional opera diretamente no Instagram.
2. **Tipos de conta suportados**: a conta do Instagram do proprietário da vitrine precisa ser **Profissional** (**Empresa / Business** ou **Criador de Conteúdo / Creator**). Contas pessoais não são suportadas pela API oficial e devem ser convertidas pelo próprio dono no aplicativo do Instagram antes da conexão.
3. **Permissão mínima (escopo)**:
   - `instagram_business_basic`: permissão mínima e única solicitada nesta fase para leitura de dados públicos básicos do perfil (identificador da conta, nome de usuário, foto/nome públicos quando disponíveis) e listagem paginada das mídias publicadas no feed.
   - Nenhuma permissão de escrita, publicação de mídia, leitura de comentários ou mensagens (`instagram_business_manage_messages`) será solicitada nesta entrega.
4. **Credenciais e segredos**:
   - `INSTAGRAM_APP_ID` (identificador público do app): configurado no servidor apenas após o cadastro real no console Meta.
   - `INSTAGRAM_APP_SECRET` (segredo do app): armazenado exclusivamente no *secret store* do servidor (Cloudflare Worker / Supabase), jamais em repositório, documentos, logs, variáveis públicas ou código de navegador.

## URLs HTTPS obrigatórias no console Meta

Todas as URLs registradas no console Meta devem utilizar HTTPS estrito, apontando para os domínios oficiais planejados no [ADR 0006](../adr/0006-public-addresses.md). Não são aceitos redirecionamentos abertos nem curingas (*wildcards*) que alcancem vitrines de clientes.

| Finalidade no console Meta | Endereço HTTPS planejado | Papel na arquitetura |
| --- | --- | --- |
| **Redirect URI (Retorno OAuth)** | `https://painel.inspira.dev.br/api/instagram/oauth/callback` | Recebe o `code` e o `state` assinado no servidor após o consentimento do proprietário no Instagram e vincula a conta à vitrine selecionada. |
| **Política de Privacidade** | `https://vitrine.inspira.dev.br/privacidade` | Página pública institucional descrevendo o uso restrito à leitura de perfil e mídias da vitrine autorizada. |
| **Termos de Uso** | `https://vitrine.inspira.dev.br/termos` | Condições de uso do portal e responsabilidade do proprietário sobre o conteúdo exibido na vitrine. |
| **Callback de Desconexão (Deauthorize Callback URL)** | `https://painel.inspira.dev.br/api/instagram/deauthorize` | Endpoint assinado (`signed_request` com segredo do app) chamado pela Meta quando o dono revoga o acesso diretamente nas configurações do Instagram. |
| **Callback de Exclusão de Dados (Data Deletion Request URL)** | `https://painel.inspira.dev.br/api/instagram/data-deletion` | Endpoint assinado que remove tokens e mídias sincronizadas da vitrine e retorna o código de confirmação e a URL pública de acompanhamento exigidos pela Meta. |
| **Instruções de Exclusão de Dados (página pública)** | `https://vitrine.inspira.dev.br/privacidade#exclusao-dados` | Explica como o proprietário desconecta o Instagram pelo painel ou solicita remoção completa dos dados sincronizados. |

> **Nota sobre ambiente de homologação**: enquanto o controle da zona DNS de `inspira.dev.br` não estiver verificado em produção (ADR 0006), os testes fechados em modo de desenvolvimento do app Meta poderão registrar temporariamente a URL HTTPS de *staging* no Worker (`*.workers.dev`), removendo-a antes de entrar em modo *Live*.

## Conta de teste, revisão (App Review) e acesso externo

1. **Modo de Desenvolvimento (*Development Mode*)**:
   - Atende exclusivamente contas cadastradas no painel do app Meta com o papel de *Instagram Tester* (Testador do Instagram) que tenham aceitado o convite em *Apps e sites → Convites de testador* na própria conta do Instagram.
   - Permite validar o fluxo ponta a ponta com uma conta de teste da equipe e com a conta do piloto (`@ganjastudio.br`, caso convidada como testadora) antes da revisão pública.
2. **Revisão do Aplicativo (*App Review*) e Modo *Live***:
   - Para que proprietários de vitrines externas conectem suas contas sem convite manual no console Meta, o app precisa passar pelo **App Review** para `instagram_business_basic` com nível **Advanced Access** (*Acesso Avançado*).
   - A submissão exige gravação de tela (*screencast*) demonstrando o proprietário entrando no painel da Vitrine, iniciando a conexão do Instagram na vitrine selecionada, concedendo permissão e exibindo as mídias sincronizadas na vitrine publicada.
3. **Verificação de Negócio (*Business Verification*) e Provedor de Tecnologia**:
   - Como o aplicativo da Vitrine acessará contas profissionais de terceiros (os proprietários de cada vitrine), o console Meta pode exigir a **Verificação da Empresa (Business Verification)** do portfólio empresarial da Inspira e a declaração de atuação como *Tech Provider*.
   - Essa exigência deve ser conferida diretamente no painel *App Review / Verification* do console Meta assim que o app for criado.

## Checklist de requisitos e status (#48)

| # | Requisito | Status | Responsável | Observação / Evidência |
| --- | --- | --- | --- | --- |
| 1 | Modelo de aplicativo Meta único da Vitrine servindo todas as vitrines | **Confirmado** | Equipe Vitrine | Definido na arquitetura da integração: proprietários conectam pelo painel sem acessar o console Meta. |
| 2 | Produto *API with Instagram Login* e escopo mínimo `instagram_business_basic` | **Confirmado** | Equipe Vitrine | Apenas leitura de perfil e feed; mensagens e escrita ficam fora do escopo inicial. |
| 3 | Mapa de URLs HTTPS (retorno OAuth, privacidade, termos, desconexão e exclusão de dados) | **Confirmado** | Equipe Vitrine | Endereços definidos sob `painel.inspira.dev.br` e `vitrine.inspira.dev.br` conforme ADR 0006, sem segredos no documento. |
| 4 | Restrição a planos gratuitos (Workers Free + Supabase Free, zero custo fixo) | **Confirmado** | Equipe Vitrine | Alinhado ao ADR 0005; sem planos pagos ou upgrades automáticos. |
| 5 | Confirmar se `@ganjastudio.br` já está configurada como conta Profissional (Empresa ou Criador) | **Pendente** | Proprietário da marca Ganja (`@ganjastudio.br`) | Exige verificação humana no aplicativo do Instagram da conta piloto. |
| 6 | Definir e registrar o responsável nominal pelo aplicativo Meta e pelo portfólio Meta Business da Inspira | **Pendente** | Administrador Meta (Operador Inspira) | Necessário para criação do app, recuperação administrativa e submissão de revisão. |
| 7 | Definir e vincular conta profissional de teste do Instagram (*Instagram Tester*) no console Meta | **Pendente** | Administrador Meta + Equipe Vitrine | Necessário para testar consentimento, paginação, revogação e expiração em *Development Mode*. |
| 8 | Criar o aplicativo no console Meta e guardar `INSTAGRAM_APP_ID` e `INSTAGRAM_APP_SECRET` no cofre do servidor | **Pendente** | Administrador Meta + Equipe Vitrine | Execução remota fora do escopo desta entrega documental; credenciais nunca entram no repositório. |
| 9 | Publicar páginas institucionais `/privacidade` e `/termos` e verificar controle da zona DNS `inspira.dev.br` | **Pendente** | Equipe Vitrine + Operador Inspira | Pré-requisito do ADR 0006 para validação das URLs obrigatórias pela Meta. |
| 10 | Confirmar exigência de *Business Verification* e submeter *App Review* (`Advanced Access` em `instagram_business_basic`) | **Pendente** | Administrador Meta + Equipe Vitrine | Necessário antes de liberar o botão "Conectar Instagram" para clientes externos fora da lista de testadores. |

## Bloqueios antes da liberação a clientes

O pacote público inclui as páginas `/privacidade/` (com `#exclusao-dados`) e `/termos/`, conforme a [Spec 010](../../specs/010-ux-audit-meta-readiness/spec.md). Antes de publicar, confirme o texto institucional e o canal de privacidade, verifique se alguma vitrine publicada usa os endereços reservados e valide as URLs por HTTPS. Cadastre os callbacks no console somente depois de implementar e testar os endpoints correspondentes.

1. **Bloqueios para o piloto fechado (Ganja)**:
   - Confirmação do tipo profissional da conta `@ganjastudio.br` (item 5).
   - Nomeação do responsável pelo app Meta (item 6), criação do app em *Development Mode* (item 8) e aceite do convite de *Instagram Tester* pela conta de teste e pela conta piloto (item 7).
2. **Bloqueios para liberação geral às demais vitrines**:
   - Domínios `vitrine.inspira.dev.br` e `painel.inspira.dev.br` ativos com TLS e páginas de privacidade/exclusão publicadas (item 9).
   - Aprovação do *App Review* com *Advanced Access* para `instagram_business_basic` e eventual *Business Verification* concluída no console Meta (item 10).

## Referências

- Roteiro geral da integração: [`docs/instagram-integration-roadmap.md`](../instagram-integration-roadmap.md)
- Issue de acompanhamento: [vitrine #48 — Mapear configuração Meta para integração Instagram](https://github.com/coletivo-inspira/vitrine/issues/48)
- Arquitetura e decisões: [`docs/architecture.md`](../architecture.md), [`docs/roadmap.md`](../roadmap.md), [ADR 0002](../adr/0002-site-access-boundary.md), [ADR 0005](../adr/0005-zero-cost-mvp.md) e [ADR 0006](../adr/0006-public-addresses.md)
- Documentação oficial Meta: [Instagram API with Instagram Login](https://www.postman.com/meta/instagram/folder/1z5vxzu/instagram-api-with-instagram-login)
