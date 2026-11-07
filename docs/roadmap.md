# Roadmap e decisões abertas

## Entrega desta branch

- Inspeção: main continha apenas README; sem aplicação, workflows ou instruções AGENTS no checkout.
- Pesquisa com fontes oficiais, fronteiras de segurança e proposta de arquitetura.
- Projeção de cardápio público e link WhatsApp, demonstração local e CI sem credenciais de publicação.

## Entrevista de decisões — uma por vez

1. Resolvida em 2026-11-07: Cloudflare escolhida para hospedagem; GitHub para código e automações. Produto Cloudflare e topologia ainda serão avaliados.
2. Depois: cada usuário é dono individual ou existe equipe por negócio? Recomendação: workspace com um dono inicial e estrutura para membros; testar pessoa com duas pizzarias e funcionário com acesso a apenas uma.
3. Depois: Supabase gerenciado versus Apps Script/Sheets ou Workers/D1? Recomendação inicial: Supabase; validar pausa, OAuth e recuperação de conta.
4. Depois: repositório por vitrine é requisito de propriedade/exportação ou apenas mecanismo imaginado de deploy? Recomendação: código de templates central, artefatos separados; avaliar custo e acesso antes de mudar o requisito.
5. Depois: zona/domínio controlado pelo coletivo e limites do piloto. Recomendação: poucos negócios convidados, subdomínio específico por vitrine e teto de publicação.

## Fatias seguintes, dependentes das decisões

1. Auth + criar vitrine + rascunho persistido. Aceite: usuário A não lê/escreve dados de B, inclusive por requisição direta; associação e papel protegidos; logout/revogação testados.
2. Editor pizzaria + prévia. Capturar contexto PRODUCT e direção visual com Impeccable antes de criar UI. Portal em modo Operate; cardápio para consulta e contato. Aceite: teclado, erros e salvamento, mobile/desktop, preço em centavos, estado vazio, item oculto e feedback de alterações não publicadas.
3. Publicação manual em staging no host escolhido. Aceite: só campos públicos, conteúdo escapado no renderizador, sem segredos em bundle/histórico, artefato reproduzível e rollback.
4. Job automatizado e subdomínio. Aceite: duplo clique não duplica recurso; disputa por slug tem um vencedor; falhas de DNS/TLS/build não apagam site ativo; retry limitado e credenciais restritas.
5. Piloto com alertas de cota, exportação/restauração e rotina de remoção. Aceite: exercício de restauração e revogação de acesso; nenhuma dependência de plano gratuito tratada como SLA.

Antes de ativar deploy automático ou criar recursos de clientes, definir conta, domínio, produto Cloudflare e validar autorização real. Esta entrega não é um portal operacional.
