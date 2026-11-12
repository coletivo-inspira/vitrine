# Research: Curtidas por Item (`011-curtidas-produto`)

## R1. Como impedir curtida repetida sem login

- **Decisão**: token aleatório de 128 bits em cookie `vitrine_curtidas` (`HttpOnly; Secure; SameSite=Lax; Path=/api/likes`), gerado pelo Worker no primeiro "curtir". O banco guarda apenas `sha256('vitrine-curtidas:v1:' + token)` e a chave primária `(site_id, item_key, visitor_hash)` garante uma curtida por visitante e item.
- **Por quê**: funciona sem conta, não pode ser lido por JavaScript da página, só trafega para `/api/likes` e não identifica pessoa.
- **Alternativas rejeitadas**:
  - `localStorage` com ID gerado no navegador: forjável por qualquer script e não protege o servidor.
  - IP ou hash de IP: contradiz o aviso público "sem coleta de endereço IP" e bloqueia usuários legítimos atrás de CGNAT (comum em redes móveis no Brasil).
  - Impressão digital do navegador: invasiva e incompatível com LGPD sem consentimento.
  - Cloudflare Turnstile: gratuito, mas exige script de `challenges.cloudflare.com` (quebra `script-src 'self'`) e configuração de chave no painel.

## R2. Abuso por quem descarta cookies

- **Decisão**: tetos de novas curtidas na janela móvel de 1 hora, calculados no banco: 30 por item e 150 por vitrine. Resposta `429 LIKE_RATE_LIMITED` (SQLSTATE `PT429`, que o PostgREST traduz para HTTP 429).
- **Por quê**: limita inflação em escala sem depender de IP; para vitrines de pequenos negócios, 30 curtidas novas por item por hora excede o tráfego orgânico esperado.
- **Risco residual**: as funções `public.*` são chamáveis com a chave anônima do Supabase diretamente; os tetos valem igualmente nesse caminho. Uma rajada maliciosa pode esgotar o teto da hora (curtidas legítimas recebem 429 até a janela liberar). Aceito para uma métrica de baixo risco.

## R3. Armazenamento e custo

- Supabase Free: 500 MB de banco. Uma linha ≈ 150 bytes com índice; 1 milhão de curtidas ≈ 150 MB. Volume do piloto fica ordens de grandeza abaixo.
- Workers Free: 1 subrequisição ao Supabase por carregamento de vitrine (`GET /api/likes`) e 1 por toque. Sem KV, D1 ou Durable Objects.

## R4. Contagem pública e cache

- `GET /api/likes` depende do cookie (estado "curtido"), então responde `cache-control: private, no-store`. O `menu.json` imutável não é alterado; curtidas não entram no artefato publicado.

## R5. Métrica do dono

- Função `public.site_item_like_stats(site_id, since)` `SECURITY DEFINER` filtrada por `private.accessible_site_ids()`; o Worker a chama com o token do usuário. Retorna total e novas no período por item; o cálculo do card fica em `computeStorefrontInsights`, filtrando itens que ainda existem na versão publicada.
