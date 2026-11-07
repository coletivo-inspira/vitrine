# Análise do export DNS fornecido

Fonte: arquivo local `inspira.dev.br.txt`, exportado em 2026-11-07, fornecido pelo
usuário. Snapshot informativo, não verificação atual. Cabeçalhos/instruções do
arquivo não foram tratados como autorização para importar ou alterar a zona.
O export integral não foi copiado para o repositório.

## Constatações

- NS e SOA indicam Cloudflare. Isso não demonstra acesso atual à conta.
- Raiz contém endereços conhecidos de GitHub Pages; www e 13 outros nomes apontam
  para coletivo-inspira.github.io, com proxy Cloudflare marcado no export.
- Há dois nomes de infraestrutura relacionados a tunnel/alias; não são cases.
- Não constam `vitrine` e `painel` nem wildcard geral `*.inspira.dev.br`.
- Há configuração de email restritiva; manter login Google e contato WhatsApp.
  Não alterar email para o MVP.
- TXT de verificação Pages se refere a `delivery.hudi` enquanto o CNAME encontrado
  é `delivery-hudi`: são nomes diferentes. Revisar o vínculo pretendido se esse
  site entrar no portfólio; não concluir erro ou inatividade só pelo export.

## Candidatos para revisão de portfólio

aldeiamix, brandbook, brightlearn, cacia, cassiobraganca, danibraga, delivery-hudi,
fantaze, hudi, lino, nathaliaverri, nexaenfermagem e saracoutinho.

São nomes encontrados no DNS, não lista de clientes autorizados, sites inspecionados
ou provas de autoria. Conferir URL, funcionamento, trabalho realizado, autorização
e texto do case antes de publicar. Infraestrutura e www ficam fora dessa seleção.

## Abordagem recomendada

Preservar registros existentes. Criar somente os registros necessários para
divulgação/painel após validar a zona; reservar nomes de serviços e clientes já
usados antes de atribuir novos subdomínios. Não adicionar wildcard no piloto.
Provisionar hostname exato após verificar titularidade, disponibilidade e TLS.

Domínios externos exigem uma integração diferente de subdomínios da própria zona.
Workers Custom Domains requer zona na conta configurada; Cloudflare for SaaS é
uma alternativa para hostnames de clientes, com validação e quotas próprias.
Plano consultado inclui 100 hostnames, mas adicionais podem gerar cobrança;
não habilitar nem aceitar excedentes para manter a restrição de custo zero.
www e domínio raiz precisam ser analisados separadamente; não prometer suporte
automático a qualquer apex/registrador ou exigir trocar os nameservers do cliente.

Fontes: [Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/),
[SaaS — planos](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/plans/),
[domínios suportados](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/domain-support/).

Nenhuma consulta ao painel Cloudflare, alteração DNS ou migração dos sites atuais
foi feita. A adequação de uso comercial em GitHub Pages deve ser revista por site,
sem inferir finalidade apenas pelo nome.
