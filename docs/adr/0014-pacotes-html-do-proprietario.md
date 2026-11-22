---
status: proposed
---
# Pacotes HTML enviados pelo proprietário, com revisão por versão

Emenda a [ADR 0010](0010-opaque-sandbox-custom-components.md). Relaciona-se com as ADRs
[0005](0005-zero-cost-mvp.md), [0008](0008-multi-tenant-edge-routing.md),
[0009](0009-dynamic-cms-immutable-snapshots.md) e [0013](0013-plans-and-recurring-billing.md).
Origem: [`specs/016-html-puro-projeto-externo`](../../specs/016-html-puro-projeto-externo/plan.md).

## Contexto e Problema

A ADR 0010 previu componentes personalizados em origem opaca, mas só criados e aprovados por
Operador Inspira, com `sandbox="allow-scripts"` e sem dizer onde o conteúdo fica nem como é
retirado do ar. A especificação 016 pede que o próprio proprietário (plano Essencial ou superior)
envie um arquivo HTML único — por exemplo, um protótipo feito em ferramenta de IA como o Orbit —,
use-o como página inteira com endereço próprio ou como bloco, e que nada chegue ao visitante sem
revisão humana. Protótipos desse tipo dependem de `cdn.tailwindcss.com` e Google Fonts e costumam
ter formulários. Tudo precisa caber no Workers Free e no Supabase Free (ADR 0005).

## Opções Consideradas

1. **Manter só o fluxo do operador** (ADR 0010 como está): o operador recebe o arquivo por fora e o
   cadastra. Não atende ao autoatendimento e não tem estado "aguardando revisão".
2. **Autoatendimento sem revisão, só com validação automática**: rápido, mas a validação não avalia
   golpe, uso de marca de terceiros nem coerência com o negócio.
3. **Autoatendimento com revisão humana por impressão digital (SHA-256) de cada versão**, servido
   no host isolado com política de conteúdo por versão.

## Decisão

Adotamos a **Opção 3**, mantendo tudo o que a ADR 0010 exige (origem opaca, nunca
`allow-same-origin`, comunicação só por `postMessage` validado) e acrescentando:

1. **Revisão por versão**: cada arquivo distinto vira uma versão imutável identificada pelo
   SHA-256; só versões `approved` são servidas a visitantes; reenviar um arquivo já aprovado não
   exige nova revisão; o operador pode retirar uma versão do ar a qualquer momento.
2. **Armazenamento no Postgres** (`private.html_package_contents`, até 512 KiB por versão, 3 MiB
   por vitrine, 100 MiB no total), lido só por RPC que exige versão aprovada e hash igual. Sem R2
   (exige cartão) e sem Storage (egress próprio).
3. **Entrega pelo mesmo Worker** no host `SANDBOX_ORIGIN` (`sandbox.inspira.dev.br`), com
   `caches.default` revalidado a cada 300 s e `cache-control: max-age=300` no navegador, para que
   uma retirada tenha efeito em até 5 minutos; o Worker recalcula o SHA-256 em cada leitura do
   banco e nunca serve conteúdo divergente.
4. **Política de conteúdo por versão**: `default-src 'none'`, scripts e estilos inline permitidos,
   e somente os hosts de uma lista fechada efetivamente usados pela versão (`cdn.tailwindcss.com`,
   `fonts.googleapis.com`, `fonts.gstatic.com`); `connect-src 'none'`, imagens só `data:`/`blob:`.
5. **Formulários**: `sandbox="allow-scripts allow-forms"` com `form-action 'none'`: o formulário
   funciona por script dentro do pacote, mas nenhum envio sai do navegador.
6. **`frame-ancestors` restrito** à vitrine pública, ao painel e aos domínios próprios ativos da
   vitrine dona do pacote.
7. **Uma única mensagem**: `{ type: "vitrine:resize", height }`, aceita só da própria moldura, com
   origem `null`, entre 120 e 4000 px e até 10 por segundo. A vitrine não envia mensagens ao pacote.
8. **Página emoldurada com endereço próprio** (`/<endereço>/<página>`), renderizada a partir do
   snapshot publicado (ADR 0008/0009), que guarda só `versionId` e hash.
9. **Plano**: recurso `html_packages` do Essencial em diante, conferido no servidor (ADR 0013);
   pacotes do operador ligados a uma customização contratada valem em qualquer plano.

## Consequências

- **Positivas**: autoatendimento sem abrir mão da revisão; protótipos de IA funcionam sem
  reescrita; retirada do ar rápida; custo zero; isolamento igual ao da ADR 0010.
- **Negativas / Trade-offs**:
  - O host isolado é subdomínio do mesmo site registrável (`inspira.dev.br`): é *same-site*, embora
    de outra origem. Com origem opaca, sem cookies lidos ou definidos no host e cookies da sessão
    com prefixo `__Host-`, o risco residual é baixo; um domínio registrável separado custaria
    dinheiro (ADR 0005) e fica como evolução.
  - Os visitantes da página com pacote fazem pedidos a hosts de terceiros (Tailwind e Google Fonts),
    que recebem IP e agente de usuário; isso precisa constar na política de privacidade antes de
    liberar o recurso.
  - `'unsafe-inline'` em scripts dentro do host isolado é aceito porque o documento não tem origem
    utilizável; continua proibido na vitrine e no painel (`script-src 'self'`).
  - Revisão humana cria fila e espera (meta de 2 dias úteis) e depende de contas de operador.
  - O conteúdo divide os 500 MB do banco gratuito; o painel do operador avisa a partir de 80%.
- **Pendências**: rota e certificado do host isolado dependem da autenticação na Cloudflare
  (`BLK-CLOUD-01`); nada foi implantado.
