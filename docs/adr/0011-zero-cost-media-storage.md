---
status: accepted
---
# Armazenamento de mídia WebP client-side com cache de borda e adaptador R2

## Contexto e Problema

O gerenciamento de fotos de produtos, logotipos, banners e arquivos estáticos das vitrines precisa operar com custo zero. O Supabase Storage Free oferece 1 GB de armazenamento, mas limita a transferência de saída (egress) a 2 GB/mês. Já o Cloudflare R2 Free oferece 10 GB/mês de armazenamento e zero taxa de egress, porém exige o cadastro de um método de pagamento na conta Cloudflare (o que conflita com a restrição inicial de zero cartão do ADR 0005 caso a conta ainda não possua faturamento configurado). Além disso, converter imagens no Cloudflare Worker estouraria o limite de 10 ms de CPU do plano gratuito.

## Opções Consideradas

1. **Upload de imagens originais (JPEG/PNG de 5–10 MB) e conversão no servidor**: inviável; esgota o limite de 10 ms de CPU do Worker e consome rapidamente o armazenamento gratuito.
2. **Uso exclusivo do Supabase Storage sem cache na borda**: esgota a franquia de 2 GB/mês de egress com poucas vitrines ativas.
3. **Pipeline híbrido a custo zero: compressão WebP no navegador ($\le 200\text{ KB}$) + Proxy de Cache na Borda sobre Supabase Storage Free (padrão sem cartão) + Adaptador plugável para Cloudflare R2 Free (10 GB, zero egress)**: processar toda imagem no cliente antes do upload e servir os ativos públicos através do cache da CDN da Cloudflare (`caches.default` com `Cache-Control: public, max-age=31536000, immutable` por hash no nome do arquivo), permitindo chavear por variável de ambiente para um bucket Cloudflare R2 quando disponível.

## Decisão

Adotamos a **Opção 3** como recomendação padrão.

1. **Compressão obrigatória no navegador (`OffscreenCanvas` / `Canvas`)**: toda imagem enviada no painel é redimensionada no cliente (máx. 1600px) e codificada em `image/webp` com tamanho máximo de **200 KB** (`262144` bytes no limite rígido), consumindo **0 ms de CPU** no Worker e permitindo milhares de imagens dentro da cota gratuita.
2. **Padrão imediato sem cartão (Supabase Storage Free 1 GB + Cache Imutável na Borda)**:
   - Os arquivos WebP recebem nome endereçado por hash (`<site_id>/<item_id>-<hash>.webp`) no bucket `catalog-images` do Supabase Storage Free.
   - A entrega pública passa por cache de longa duração (`max-age=31536000, immutable`), fazendo com que a borda da Cloudflare retenha o arquivo e proteja a cota mensal de 2 GB de egress do Supabase.
   - Cada vitrine possui cota máxima de ativos controlada em `public.assets` (ex.: até 100 imagens ativas / 20 MB por vitrine no plano básico).
3. **Evolução plugável sem refatoração (Cloudflare R2 Free — 10 GB e Zero Egress)**:
   - A camada de armazenamento no Worker é abstraída por interface (`StorageProvider`), permitindo ativar o binding `env.R2_BUCKET` do Cloudflare R2 assim que a conta Cloudflare tiver o recurso habilitado, escalando para 10 GB (~50.000 fotos WebP) com zero taxa de saída.

## Consequências

- **Positivas**: respeita integralmente o ADR 0005 (funciona imediatamente sem exigir cartão de crédito) e já deixa pronta a transição para 10 GB com zero egress no Cloudflare R2; protege a CPU do Worker e o banco de 500 MB (que guarda apenas metadados e URLs).
- **Negativas / Trade-offs**: exige suporte a codificação WebP em Canvas no navegador do administrador no momento do upload (suportado em todos os navegadores modernos desktop e mobile).
