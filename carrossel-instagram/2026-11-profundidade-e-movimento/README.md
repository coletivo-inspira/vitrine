# Vitrine Inspira — campanha “profundidade e movimento” (2026-11)

Apresenta a Vitrine a pequenos negócios e profissionais com quatro usos — Cardápio, Lanches, Serviços e Portfólio — e leva a **vitrine.inspira.dev.br**. Especificação: [`specs/015-campanha-movimento`](../../specs/015-campanha-movimento/spec.md). Pesquisa e roteiro: [`docs/marketing/campanha-profundidade-movimento.md`](../../docs/marketing/campanha-profundidade-movimento.md).

Leia também: [legendas e textos alternativos](./legendas.md) · [guia de postagem](./guia-de-postagem.md).

Negócios, pessoas, documentos e valores são fictícios; cada cena traz “Demonstração ilustrativa”.

## Índice do acervo

| Peça | Finalidade | Formato | Duração | Arquivo |
|---|---|---|---|---|
| Carrossel 1 — capa | Abrir com a marca: “Mostre o que você faz.” | PNG 1080 × 1080 | — | `exportacoes/carrossel/01-capa.png` |
| Carrossel 2 — caminho | Conhecer → escolher → entrar em contato | PNG 1080 × 1080 | — | `exportacoes/carrossel/02-caminho.png` |
| Carrossel 3 — Cardápio | “Escolha o prato. Veja o total.” | PNG 1080 × 1080 | — | `exportacoes/carrossel/03-cardapio.png` |
| Carrossel 4 — Lanches | “Monte o pedido. Continue no WhatsApp.” | PNG 1080 × 1080 | — | `exportacoes/carrossel/04-lanches.png` |
| Carrossel 5 — Serviços | “Apresente seu serviço. Facilite o orçamento.” | PNG 1080 × 1080 | — | `exportacoes/carrossel/05-servicos.png` |
| Carrossel 6 — Portfólio | Projetos, currículo e conquistas | PNG 1080 × 1080 | — | `exportacoes/carrossel/06-portfolio.png` |
| Carrossel 7 — encerramento | “Qual combina com a sua ideia?” e endereço | PNG 1080 × 1080 | — | `exportacoes/carrossel/07-encerramento.png` |
| Vídeo feed — com efeitos | Post de vídeo/Reels quadrado | MP4 H.264 + AAC, 1080 × 1080, 30 fps | 20 s | `exportacoes/video-feed/vitrine-feed-1080x1080-20s-efeitos.mp4` |
| Vídeo feed — sem áudio | Para áudio do próprio Instagram | MP4 H.264, 1080 × 1080, 30 fps | 20 s | `exportacoes/video-feed/vitrine-feed-1080x1080-20s-sem-audio.mp4` |
| Capa do vídeo feed | Capa adaptada da lâmina 1 | PNG 1080 × 1080 | — | `exportacoes/video-feed/capa-video-feed-1080x1080.png` |
| Story — com efeitos | Story com sticker de link | MP4 H.264 + AAC, 1080 × 1920, 30 fps | 20 s | `exportacoes/story/vitrine-story-1080x1920-20s-efeitos.mp4` |
| Story — sem áudio | Story sem som | MP4 H.264, 1080 × 1920, 30 fps | 20 s | `exportacoes/story/vitrine-story-1080x1920-20s-sem-audio.mp4` |
| Capa do Story | Capa vertical / destaque | PNG 1080 × 1920 | — | `exportacoes/story/capa-video-story-1080x1920.png` |
| GIF Cardápio | Mensagens, e-mail, apresentações | GIF 600 × 450, loop | 4 s | `exportacoes/gifs/cardapio-600x450-4s.gif` |
| GIF Lanches | Mensagens, e-mail, apresentações | GIF 600 × 450, loop | 4 s | `exportacoes/gifs/lanches-600x450-4s.gif` |
| GIF Serviços | Mensagens, e-mail, apresentações | GIF 600 × 450, loop | 4 s | `exportacoes/gifs/servicos-600x450-4s.gif` |
| GIF Portfólio | Mensagens, e-mail, apresentações | GIF 600 × 450, loop | 4 s | `exportacoes/gifs/portfolio-600x450-4s.gif` |
| Modelos animados | Uso avulso, sem scripts nem arquivos externos | SVG 1200 × 900, loop | 4 s | `exportacoes/modelos-site/{cardapio,lanches,servicos,portfolio}-1200x900.svg` |
| Modelos estáticos | Versão parada equivalente | PNG 1200 × 900 | — | `exportacoes/modelos-site/{cardapio,lanches,servicos,portfolio}-1200x900.png` |
| Modelos no site | Seção Possibilidades | SVG inline + PNG/WebP 1200 × 900 | 4 s | `web/assets/modelos/` |
| Prévias | Conferência rápida | PNG | — | `exportacoes/previas/` |
| Fotos de apoio | ImageGen: prato, combo, projeto | JPEG 1152 × 864 e 960 × 720 | — | `imagens-apoio/` |
| Pacote final | Tudo acima, para envio | ZIP | — | `vitrine-inspira-campanha-2026-11-profundidade-e-movimento.zip` |

## Roteiro dos vídeos

| Tempo | Cena | Ação | Benefício |
|---|---|---|---|
| 0–2 s | Abertura | Marca e título entram; toque em “Continuar no WhatsApp” traz o total de R$ 42,00 para a frente | Mostre o que você faz. Facilite o próximo passo. |
| 2–6 s | Cardápio | Moqueca escolhida, total de R$ 0,00 a R$ 42,00, mensagem pronta | Escolha o prato. Veja o total. |
| 6–10 s | Lanches | Combo Clássico, quantidade 1 → 2, total de R$ 32,00 a R$ 64,00, resumo em destaque | Monte o pedido. Continue no WhatsApp. |
| 10–14 s | Serviços | Pintura de cômodo, pedido de orçamento em três linhas, a partir de R$ 380,00 | Apresente seu serviço. Facilite o orçamento. |
| 14–18 s | Portfólio | Projeto → Currículo → Diploma, com aproximação | Projetos, currículo e conquistas em uma apresentação. |
| 18–20 s | Encerramento | Quatro modelos, marca e endereço | Qual combina com a sua ideia? |

## Como gerar de novo

Requisitos: Node 22+, Google Chrome ou Chromium e FFmpeg (`CHROME_PATH` e `FFMPEG_PATH` apontam executáveis fora do padrão).

```bash
npm run campanha                     # todas as etapas
node carrossel-instagram/2026-11-profundidade-e-movimento/fonte/exportar.mjs estaticos gifs   # etapas avulsas
VIDEOS=story node carrossel-instagram/2026-11-profundidade-e-movimento/fonte/exportar.mjs videos audio
```

Etapas: `apoio` (fotos 960 px), `estaticos` (carrossel e capas), `modelos` (SVG avulso e PNG), `gifs`, `videos` (MP4 mudos), `audio` (efeitos e versões com som), `site` (`web/assets/modelos/`), `previas` (folhas de conferência), `pacote` (ZIP).

Para editar, mude textos, preços ou tempos em `fonte/campanha.mjs`; desenho dos modelos em `fonte/modelos.mjs`; lâminas em `fonte/pecas.mjs`; vídeos em `fonte/videos.mjs`. Toda transição precisa durar entre 180 e 300 ms e todo ciclo precisa terminar no estado inicial; o gerador recusa o contrário. Depois de `npm run build` e `npm run preview`, `node …/fonte/conferir-site.mjs` confere a página Possibilidades e grava capturas em `exportacoes/previas/site/`.
