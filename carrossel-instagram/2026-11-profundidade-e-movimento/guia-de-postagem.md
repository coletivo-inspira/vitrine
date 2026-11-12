# Guia de postagem

Peças em `exportacoes/`. Textos em [`legendas.md`](./legendas.md). Nada foi publicado automaticamente.

## 1. Carrossel (feed)

1. Novo post → selecione `exportacoes/carrossel/01-capa.png` a `07-encerramento.png`, nessa ordem.
2. Mantenha o corte quadrado (1:1); não aplique filtro.
3. Cole a **legenda principal**.
4. Em cada imagem, adicione o texto alternativo da tabela em `legendas.md`.
5. Confirme que o link da bio aponta para `https://vitrine.inspira.dev.br`.

## 2. Vídeo do feed (Reels quadrado ou post de vídeo)

1. Use `exportacoes/video-feed/vitrine-feed-1080x1080-20s-efeitos.mp4`. A versão `-sem-audio` serve para quem vai adicionar áudio no próprio Instagram.
2. Capa: “Adicionar da galeria” → `exportacoes/video-feed/capa-video-feed-1080x1080.png`.
3. Legenda principal; texto alternativo do vídeo.
4. Publique em dia diferente do carrossel (sugestão: 2 a 3 dias depois) para medir as duas peças separadamente.

## 3. Story animado

1. Use `exportacoes/story/vitrine-story-1080x1920-20s-efeitos.mp4` (ou `-sem-audio`).
2. Toque em **Figurinhas → Link**, cole `https://vitrine.inspira.dev.br` e texto “Criar minha vitrine”.
3. Posicione o sticker na faixa livre logo abaixo da frase de benefício, entre 1450 e 1580 px de altura (por volta de 76% a 82% da tela). Os 250 px do topo e os 340 px da base ficam livres para a interface.
4. Se o Story for dividido em partes, confira que cada parte mantém o sticker.
5. A capa vertical (`exportacoes/story/capa-video-story-1080x1920.png`) pode ser usada como capa de destaque.

## 4. GIFs e modelos

- GIFs (`exportacoes/gifs/`, 600 × 450, loop de 4 s): mensagens diretas, WhatsApp, e-mail, apresentações.
- SVGs animados (`exportacoes/modelos-site/*.svg`, 1200 × 900): funcionam sozinhos em navegador, com fontes e fotos embutidas e sem scripts.
- PNGs 1200 × 900: versão estática equivalente.

## 5. Depois de publicar

Revise após 48 horas e após 7 dias:

| O que olhar | Onde | O que indica |
|---|---|---|
| Retenção nos primeiros 3 s e tempo médio assistido | Insights do vídeo/Reels | Se a abertura (toque e total) segura a atenção. A Meta destaca o tempo assistido como sinal para revisar a abertura ([referência](https://about.fb.com/news/2023/04/instagram-reels-trending-audio-and-gifts-updates/)). |
| Gráfico de retenção por segundo | Insights do vídeo | Em qual demonstração as pessoas saem; troque a ordem das cenas se uma delas perder muito público. |
| Alcance até a lâmina 7 | Insights do carrossel | Se a sequência leva até a chamada. |
| Toques no link | Insights do Story (toques no sticker) e da bio | Se a chamada única leva ao site. |
| Visitas a `/possibilidades/` | Métricas do site | Se quem chega encontra os modelos. |

Para nova versão, ajuste textos, preços ou tempos em `fonte/campanha.mjs` e rode `npm run campanha` na raiz do repositório.
