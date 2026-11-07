---
status: accepted
---
# Divulgação, painel e endereços das vitrines

Em 2026-11-07 o usuário definiu `vitrine.inspira.dev.br` como site principal de
divulgação e sugeriu vitrines por subdomínio ou caminho. Com a autorização prévia
para decidir pelo menor custo, adotamos inicialmente:

| Endereço | Finalidade |
| --- | --- |
| `vitrine.inspira.dev.br` | Divulgação, explicação do produto e chamada para criar vitrine |
| `vitrine.inspira.dev.br/loja1` | Vitrine pública do negócio, identificada pelo slug |
| `painel.inspira.dev.br` | Login e administração das vitrines |

Atualização comercial: ver ADR 0007 (proposto). Endereços premium ativos poderão
ser canônicos e o caminho básico redirecionará para eles; isso substitui somente
a direção de redirecionamento prevista no parágrafo abaixo.

`loja1.inspira.dev.br` é uma alternativa compatível para depois, como alias que
redireciona ao endereço canônico por caminho. Não manter duas cópias indexáveis
do mesmo conteúdo. Caminhos dispensam configurar DNS por loja e reduzem a
complexidade do piloto, sem impedir subdomínios futuros.

Separar o painel evita compartilhar origem, localStorage e escopo de service
worker com páginas dos negócios. Cookies do painel, se usados, devem ser host-only,
sem Domain=.inspira.dev.br; preferir prefixo __Host-. Subdomínios irmãos continuam
same-site: autorização e proteção CSRF seguem necessárias. Nenhum HTML/JS de
clientes é aceito nas páginas públicas do MVP.

Pré-requisitos: confirmar controle do domínio e zona Cloudflare antes de configurar.
Subdomínios não são novos registros de domínio, mas a renovação de inspira.dev.br
continua sendo custo do domínio existente. Não contratar novo registro nem plano
pago. Sem acesso/configuração, usar workers.dev apenas para staging.

Reservar rotas institucionais e técnicas antes da publicação: /, /sobre, /precos,
/ajuda, /termos, /privacidade, /entrar, /cadastro, /auth, /api, /assets e /admin.
Cadastro deve validar slug também contra essa lista e rotas futuras. O SQL atual
reserva apenas os nomes técnicos iniciais; a lista ampliada será aplicada na fatia
de roteamento/publicação, antes de abrir cadastro público.

DNS não foi alterado; nenhum dos endereços foi publicado nesta decisão.
Fontes: [Workers Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/),
[Routes](https://developers.cloudflare.com/workers/configuration/routing/routes/).
