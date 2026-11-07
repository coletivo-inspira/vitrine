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

1. Auth + criar vitrine + rascunho persistido. Aceite: usuário A não lê/escreve dados de B, inclusive por requisição direta; associação e papel protegidos; logout/revogação testados.
2. Editor pizzaria + prévia. Capturar contexto PRODUCT e direção visual com Impeccable antes de criar UI. Portal em modo Operate; cardápio para consulta e contato. Aceite: teclado, erros e salvamento, mobile/desktop, preço em centavos, estado vazio, item oculto e feedback de alterações não publicadas.
3. Publicação manual em staging no host escolhido. Aceite: só campos públicos, conteúdo escapado no renderizador, sem segredos em bundle/histórico, artefato reproduzível e rollback.
4. Job automatizado e subdomínio. Aceite: duplo clique não duplica recurso; disputa por slug tem um vencedor; falhas de DNS/TLS/build não apagam site ativo; retry limitado e credenciais restritas.
5. Piloto com alertas de cota, exportação/restauração e rotina de remoção. Aceite: exercício de restauração e revogação de acesso; nenhuma dependência de plano gratuito tratada como SLA.

Antes de ativar deploy automático ou criar recursos de clientes, definir conta, domínio, produto Cloudflare e validar autorização real. Esta entrega não é um portal operacional.

## Evidência da camada de acesso

Migração SQL implementada e testada em PGlite com roles de usuário. `npm test`: 16 testes aprovados (inclui agrupador e 10 cenários de banco). Supabase Auth/Data API e OAuth ainda não testados de ponta a ponta; sem liberação pública.
