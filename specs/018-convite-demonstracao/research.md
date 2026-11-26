# Pesquisa: convite de demonstração e equipe da vitrine

Data: 2026-11-26. Fontes: código e migrações da `main`, ADRs 0002, 0005 e 0013, e a documentação pública citada em cada item. Os pontos marcados "a reconferir" dependem de regra externa que pode mudar (Princípio IV).

## R1. Formato e guarda do token do convite (D1)

**Decisão**: token de 32 bytes de `crypto.getRandomValues`, em base64url sem preenchimento (43 caracteres). O banco guarda só `sha256(token)` em hexadecimal; a busca é pelo hash. Uso único, 7 dias (ou o prazo da demonstração, se menor), revogável.

**Motivo**: com 256 bits, adivinhar um token é inviável, e o vazamento do banco não entrega links que funcionem. SHA-256 sem sal basta porque o token já é aleatório (não é senha escolhida por pessoa). É o mesmo cuidado de "credenciais apenas no servidor" (Princípio III).

**Alternativas recusadas**:
- Token assinado com HMAC e sem tabela, como `src/preview-token.mjs`: não permite revogar um convite antes do prazo nem garantir uso único.
- Convite pelo UUID da conta, como `invite_linktree_demo_owner`: exige conta prévia e expõe identificador interno; é o problema que motivou esta spec.
- Código curto (6 a 8 caracteres) para digitar: mais fácil de adivinhar; exigiria limite rígido por convite.

## R2. Vazamento do link

O token vai no caminho (`/convite/<token>`), porque a prévia é renderizada no servidor. Cuidados:

- `Referrer-Policy: no-referrer` na página e nos recursos dela, para o token não ir a outros sites.
- O Worker não registra URLs em log hoje; o teste do Worker DEVE conferir que nenhuma linha de `console.*` contém o token.
- Depois de "Quero esta vitrine", o painel recebe o token por `POST` e o guarda em `sessionStorage`, não na query string, até o aceite.
- O WhatsApp gera prévia de link: o robô do WhatsApp abre a URL. A primeira abertura registrada pode ser do robô. Por isso a data guardada é só "primeira abertura" (indicativa), sem contar visitas e sem IP.

## R3. Prévia sem sessão (D2)

A rota atual `/__preview/:siteId` exige sessão e assina `[siteId, userId, revision, expires]`; quem ainda não tem conta não passa. A prévia do convite é uma rota nova, `GET /convite/:token`, que:

1. calcula o hash, busca o convite aberto e a demonstração vigente com a chave de serviço (`private.read_invitation_preview`, só `service_role`);
2. compila o rascunho com `compilePublicStorefront` e os direitos do Profissional (a cortesia que a pessoa ganha), com `interactive: false`;
3. acrescenta a faixa e os botões do convite fora do HTML da vitrine, num invólucro próprio, sem misturar com o modelo publicado;
4. responde com os mesmos cabeçalhos do `/__preview` (`no-store`, `noindex, nofollow`, `no-referrer`, CSP da vitrine).

O endereço público `/<slug>` continua `404`, porque a demonstração não tem publicação (gatilho `publications_block_demo`).

## R4. Catálogo do WhatsApp e outras fontes (fora de escopo)

- A WhatsApp Business Platform só dá acesso a catálogos de contas que a própria empresa administra (Commerce Manager); não há API pública para ler o catálogo do WhatsApp Business de terceiros. A reconferir em <https://developers.facebook.com/docs/whatsapp/cloud-api/guides/sell-products-and-services>.
- Raspar a página `wa.me/c/<número>` ou o Instagram viola os termos da Meta (coleta automatizada sem permissão) e cria risco de bloqueio do número e da conta.
- Por isso a demonstração é montada à mão ou pela planilha CSV que o painel já importa (`web/portal/csv-catalog.js`). A busca de negócios na internet fica com a pessoa da equipe, sem robô.

## R5. LGPD, direitos sobre fotos e contato

- **Dados do negócio**: nome, serviços, preços e fotos que o negócio já divulga são dados de pessoa jurídica ou de atividade comercial pública; quando o negócio é de uma pessoa (MEI, autônomo), nome e telefone são dados pessoais. Base legal proposta: legítimo interesse (art. 7º, IX, LGPD), com minimização (só o que está em público), finalidade clara (oferecer a vitrine), prazo curto (30 dias, até 90) e oposição fácil ("Não tenho interesse" e "responda NÃO"). A reconferir com o jurídico antes de usar em escala.
- **Número do WhatsApp do negócio**: usado só para montar o link `wa.me` no navegador do operador; não é gravado (FR-024).
- **Fotos**: têm direito autoral do negócio ou de quem as tirou. Ficam só na demonstração, que não é pública, e são apagadas com ela. Nada vai para o portfólio ou para a divulgação sem autorização escrita, como no piloto Guavira (`BLK-GUAVIRA-01`).
- **Mensagens**: o convite é enviado uma vez, por uma pessoa identificada, do WhatsApp dela. Envio em massa ou automático está fora de escopo; a Política Comercial do WhatsApp pede consentimento para mensagens da empresa, e o envio pessoal e pontual reduz o risco de denúncia e bloqueio. A reconferir em <https://business.whatsapp.com/policy>.
- **Recusa**: apaga demonstração, rascunho, fotos e convites; a auditoria guarda só o evento e o endereço (FR-013).

## R6. Cortesia sobre o ciclo de assinatura existente (D4)

O ciclo atual (`20261116000100_subscription_lifecycle.sql`) faz:

- `active` vencida passa a `grace` por 7 dias e depois a `suspended`;
- `canceled` mantém o plano até `current_period_end` e depois volta ao Gratuito (`private.site_entitlements`).

E `billing_attach_checkout` (`20261115000200_billing_events.sql`) recusa uma nova contratação quando a organização já tem assinatura `active`, `past_due` ou `grace` (`SUBSCRIPTION_ALREADY_ACTIVE`); quando aceita, troca a linha única da organização por uma `pending`, que vale Gratuito até o pagamento.

**Decisão**: a cortesia NÃO é uma linha de `subscriptions`. Ela fica em `private.courtesy_grants` (uma por conta, ligada à organização criada no aceite, com `plan_code = 'profissional'` e `ends_at = aceite + 90 dias`). `private.site_entitlements` passa a resolver nesta ordem:

1. assinatura paga que vale (regra atual, sem mudança);
2. senão, cortesia da organização da vitrine com `ends_at > now()` e não encerrada;
3. senão, Gratuito.

Consequências:
- A cortesia termina pelo relógio, sem tolerância e sem mudar status de nada. A rotina agendada de hora em hora (`billing_lifecycle_tick` ou função própria chamada no mesmo `scheduled()`) só marca `ended_logged_at` e grava `courtesy.ended` em `audit_logs` uma vez.
- Assinar durante a cortesia funciona pelo fluxo atual, sem mudança em `billing_attach_checkout` e no webhook do Asaas: enquanto a assinatura está `pending`, a cortesia continua valendo; quando o pagamento é confirmado, a assinatura paga passa à frente e a cortesia deixa de contar (`billing_apply_event` marca `ended_at`). O período pago começa no pagamento; os dias restantes da cortesia não se somam.
- Nenhuma linha de vitrine, rascunho, publicação ou equipe é tocada (mesma regra do ciclo atual).
- Os avisos de 15 e 3 dias saem de uma função nova `public.read_courtesy_notices()`, lida pela mesma faixa de avisos (`web/portal/billing-notice.mjs`).

**Alternativas recusadas**:
- Assinatura `manual` do Profissional com uma coluna `kind = 'courtesy'` (ideia inicial do plano): bate com `SUBSCRIPTION_ALREADY_ACTIVE` e, ao contratar, a linha vira `pending` e a pessoa perde o Profissional até pagar.
- Status novo `trial` na assinatura: mesmo problema, e ainda exigiria mudar `read_subscription_notices`, o webhook do Asaas e a tela de cobrança.

## R7. Uma cortesia por conta e organização por vitrine (D5)

- `tenants.owner_user_id` não é único: uma pessoa pode ter várias organizações. O aceite cria uma organização nova (`name` = nome da vitrine, `slug` = endereço da vitrine) e liga `sites.tenant_id` a ela. Assim a cortesia não interfere em outra organização da pessoa, paga ou não.
- `private.courtesy_grants` (chave `user_id`) impede uma segunda cortesia para a mesma conta. O `platform_admin` pode conceder outra por função auditada, se fizer sentido comercial.
- Limite de vitrines por plano: o Profissional permite 1 vitrine por organização; a organização nova tem exatamente 1. Nada muda no limite das outras organizações da pessoa.

## R8. Papel `growth_operator` (D3)

`platform_operators.role` aceita `platform_admin`, `support_operator` e `sponsor`, e um usuário tem um papel só (chave `user_id`). Reaproveitar o `support_operator` daria acesso a atendimento e pedidos de customização, o que não se quer para quem só prospecta. O papel novo `growth_operator`:

- entra na restrição `platform_operators_role_check`;
- passa em `private.can_manage_demos()` (`platform_admin` ou `growth_operator`), não em `private.is_platform_admin()`;
- só lê e edita vitrines com `owner_user_id is null and demo_expires_at is not null`.

## R9. Rebaixamento ao Gratuito (D7)

Regras atuais na `main`:
- `src/portal-validation.mjs` recusa a publicação com `422 ACTIVE_ITEMS_LIMIT_EXCEEDED` quando há mais itens ativos que `maxActiveItems`; a versão já publicada continua no ar (snapshot imutável, ADR 0009).
- `assertItemBlocksAllowed` em `src/entitlements.mjs` só recusa quando a mudança acrescenta blocos acima do plano; os que já existiam continuam.

A spec mantém as duas regras no servidor e acrescenta só no painel a escolha dos itens que ficam ativos ao publicar (FR-017). Ocultar não apaga: o item continua no rascunho e volta com um plano maior.

## R10. Limite de tentativas inválidas

`src/quote-webhook.mjs` já tem um limitador em memória por chave (`createLeadRateLimiter`, criado na primeira requisição). As rotas `/convite/:token` e `/api/invitations/:token/*` usam o mesmo limitador, com chave pelo IP de `CF-Connecting-IP` transformado em hash, e limite proposto de 30 tentativas inválidas por 10 minutos. O limitador é por instância do Worker (não global); com 256 bits de token, ele serve para conter abuso, não para proteger o segredo. Nenhum serviço pago (Rate Limiting da Cloudflare) é usado.

## R11. Equipe: nomes de exibição

`public.profiles` tem RLS por dono; um membro não lê o perfil do outro. A aba Equipe usa a função nova `public.list_site_team(target_site)` (`security definer`), que só responde a proprietário e `admin` da vitrine e devolve `user_id`, `display_name` e papel, sem e-mail nem telefone. O `user_id` serve só para as ações de mudar papel e remover; a tela não o mostra.

## R12. Custos e cotas (Princípio IV)

- Supabase Free: duas tabelas pequenas (`private.site_invitations` e `private.courtesy_grants`); limpeza junto com as demonstrações.
- Workers Free: uma renderização por abertura de convite, igual à prévia atual; sem subrequests novos além do Supabase.
- WhatsApp: nenhum envio pela plataforma; o link `wa.me` é gratuito.
- Fotos das demonstrações: mesmo limite de WebP ≤ 200 KB (ADR 0011). A limpeza DEVE apagar os objetos do armazenamento, não só as linhas de `assets` (verificar no `purgeExpiredLinktreeDemos` atual e corrigir se necessário).
