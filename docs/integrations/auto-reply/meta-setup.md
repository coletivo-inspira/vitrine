# Configuração Meta para a AutoResposta

Data: 2026-11-26. Nenhuma configuração externa foi alterada nesta entrega. Este guia complementa [`docs/instagram/configuracao-meta.md`](../../instagram/configuracao-meta.md) (#48), que continua valendo para a leitura do feed. Responsável pelas ações no console: **Lino** (administrador do app e do portfólio Coletivo Inspira).

> Nunca registrar aqui chave secreta do app, `config_id`, URL de login gerada, token ou captura de tela que mostre esses valores. O ID do app (`1358511666092768`) e o ID do portfólio já são públicos na issue #48.

## O que muda em relação a #48

| Tema | #48 (feed) | AutoResposta |
| --- | --- | --- |
| Permissões | `instagram_basic` | `instagram_basic` + `instagram_manage_messages` |
| Configuração | "Vitrine — leitura do Instagram" | Nova: "Vitrine — resposta automática" |
| Webhooks | Adiados (decisão 6) | Necessários: campo `messages` |
| Revisão do app | `instagram_basic` | `instagram_basic` e `instagram_manage_messages` |
| Variável de configuração | `META_IG_CONFIG_ID` | `META_IG_AUTOREPLY_CONFIG_ID` |

A permissão de mensagens vem marcada como "sempre incluída" na configuração padrão do login unificado (documentação oficial), o que bate com o que #48 viu no console.

## Identificadores e segredos (nomes, sem valores)

| Item | Onde fica | Segredo? |
| --- | --- | --- |
| ID do app Meta | Configurações do app > Básico → `META_APP_ID` | Não |
| Chave secreta do app Meta | Configurações do app > Básico → `META_APP_SECRET` | **Sim**: `wrangler secret` |
| `config_id` da AutoResposta | Aba de login unificado → `META_IG_AUTOREPLY_CONFIG_ID` | Não, mas fora dos docs |
| Token de verificação do webhook | Escolhido pela equipe → `META_WEBHOOK_VERIFY_TOKEN` | **Sim** |
| Chave de cifragem | Gerada pela equipe → `AUTO_REPLY_ENCRYPTION_KEY` | **Sim** |

## Passo a passo (quando autorizado)

1. **Configuração**: aba "Configuração da API com login unificado" > "Criar nova configuração". Token de usuário do sistema com expiração "Nunca" (se houver); ativo só "conta do Instagram"; permissões só `instagram_basic` e `instagram_manage_messages`. Desmarcar comentários, publicação, insights, eventos e anúncios. Nome sugerido: "Vitrine — resposta automática". Conferir o rótulo "Instagram Login Compatible".
2. **URL de redirecionamento**: `https://painel.inspira.dev.br/api/instagram/oauth/callback` (a mesma de #48). Enquanto o DNS não estiver verificado, a URL `*.workers.dev` de staging pode entrar só em modo desenvolvimento e sair antes do Live.
3. **Webhook**: em "Configurar webhooks" do login unificado (objeto Instagram), URL `https://painel.inspira.dev.br/api/webhooks/meta/instagram` e o token de verificação. Marcar **só** `messages`. A rota precisa estar no ar para o "Verificar e salvar".
4. **Testadores**: convidar contas profissionais do Coletivo como *Instagram Tester* (aceite no instagram.com > Configurações > Apps e sites > Convites de testador). A conta precisa estar num portfólio diferente do dono do app, conforme #48.
5. **URLs de conformidade**: privacidade, termos e instruções de exclusão (itens 12 e 13 de #48); callbacks de desautorização e exclusão só depois do teste do item 16 de #48.
6. **Teste interno**: conectar uma conta testadora pelo painel de staging, mandar uma mensagem de outra conta testadora e conferir a execução `sent`. Lembrar que a Meta só entrega webhooks com o app publicado/Live: em desenvolvimento, usar o botão "Testar" do campo `messages` no console (payload de exemplo) e confirmar que o Worker responde `200`.

## Checklist com estados

Legenda: **CV** configurado e validado; **CNV** configurado não validado; **P** pendente; **NA** não aplicável; **BE** bloqueado por requisito externo.

| # | Item | Estado | Responsável | Observação |
| --- | --- | --- | --- | --- |
| 1 | App Meta existente (tipo Empresa, portfólio Coletivo Inspira) | CNV | Lino | Checkpoint de 12/11/2026; não revisto nesta entrega |
| 2 | Modo do app | P | Lino | Desenvolvimento; Live só depois da Revisão |
| 3 | Configuração do login unificado da AutoResposta | P | Lino | Passo 1 |
| 4 | `instagram_manage_messages` com Acesso padrão | P | Lino | Vem com a configuração |
| 5 | Permissões extras do app revistas | P | Lino | Item 10 de #48 |
| 6 | URL de redirecionamento | P | Lino | Passo 2; rota implementada no código, sem deploy |
| 7 | Webhook `messages` com verificação | BE | Lino + Equipe | Depende de deploy e DNS (ADR 0006) |
| 8 | Testadores do Instagram | P | Lino | 0 de 50 no checkpoint |
| 9 | Política de privacidade com a AutoResposta | P | Lino + jurídico | Texto em `security-privacy.md` |
| 10 | Termos com a AutoResposta | P | Lino + jurídico | Idem |
| 11 | Exclusão de dados (instruções e callback) | P | Equipe | Callback implementado; cadastro depois do item 16 de #48 |
| 12 | Desautorização (callback) | P | Equipe | Idem |
| 13 | Domínio do app `inspira.dev.br` | BE | Lino | DNS não verificado (ADR 0006) |
| 14 | Segredos no cofre do Worker | BE | Lino + Equipe | Autenticação Cloudflare não configurada |
| 15 | Migração aplicada no Supabase | P | Equipe | Não aplicada |
| 16 | Verificação da empresa | P | Lino | Obrigatória para Acesso avançado e *Tech Provider* |
| 17 | Revisão do app (Acesso avançado) | BE | Lino + Equipe | Depende de 3 a 16; roteiro em `app-review.md` |
| 18 | Contorno da limitação de webhooks sem Página (`pages_show_list`) | NA no MVP | Equipe | Reavaliar se o piloto não receber eventos |
| 19 | mTLS dos webhooks | NA | Equipe | Não suportado no Workers Free sem configuração de zona; HMAC obrigatório |
| 20 | Human Agent | NA | — | A AutoResposta só responde na janela padrão |
