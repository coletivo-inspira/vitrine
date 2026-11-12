# Implementation Plan: Campanha Vitrine Inspira — profundidade e movimento

**Branch**: `cursor/campanha-profundidade-movimento-a72e` | **Date**: 2026-11-12 | **Spec**: [spec.md](./spec.md)
**Input**: `specs/015-campanha-movimento/spec.md`; pesquisa e roteiro em `docs/marketing/campanha-profundidade-movimento.md`

## Summary

Uma fonte única (`campanha.mjs`) descreve cores, textos, preços em centavos e momentos de cada modelo. Um construtor gera o SVG animado de cada modelo com CSS keyframes prefixados; esse SVG é a origem visual de tudo: o site o insere inline, o arquivo avulso embute fontes e fotos, e PNG, GIF, lâminas e vídeos são capturados no Chrome headless buscando as animações CSS no instante exato (Web Animations API). O áudio é sintetizado em Node a partir dos mesmos instantes. FFmpeg codifica GIF e MP4. Sem dependências novas.

## Technical Context

**Language/Version**: JavaScript ES Modules (Node 22+/24; navegador sem build)
**Primary Dependencies**: nenhuma nova; Chrome/Chromium e FFmpeg já instalados (`CHROME_PATH`, `FFMPEG_PATH` opcionais)
**Storage**: arquivos versionados em `carrossel-instagram/2026-11-profundidade-e-movimento/` e `web/assets/modelos/`
**Testing**: `node --test` (`test/campanha-modelos.test.mjs`), `npm run build`, `fonte/conferir-site.mjs` contra `npm run preview`
**Target Platform**: Instagram (feed, carrossel, Stories) e site estático em Cloudflare Workers Static Assets
**Constraints**: CSP `script-src 'self'`, `img-src 'self'` (SVG busca fotos locais), vocabulário “vitrine” nas páginas de divulgação, custo zero
**Scale/Scope**: 7 lâminas, 2 capas, 4 MP4, 4 GIF, 4 SVG + 4 PNG, 4 demonstrações no site

## Constitution Check

| Princípio | Verificação |
|---|---|
| I. Administração privada e publicação pública | Nenhum dado de painel ou vitrine é lido; só conteúdo estático demonstrativo. |
| II. Isolamento entre vitrines | Sem rota, API ou dado novo. |
| III. Credenciais apenas no servidor | Nenhuma credencial; o script só busca SVG da mesma origem e rejeita scripts, `foreignObject` e imagens externas. |
| IV. Custo e condições verificáveis | Ferramentas locais; Notion, Instagram e deploy ficam fora. |
| V. Entregas verificáveis | Testes de totais, ciclos, isolamento de IDs, marcação e build; conferência automatizada do site; sondagem dos vídeos. |

## Project Structure

```text
carrossel-instagram/2026-11-profundidade-e-movimento/
├── README.md                    # índice do acervo
├── legendas.md                  # legenda principal, curta e textos alternativos
├── guia-de-postagem.md
├── imagens-apoio/               # ImageGen (original + 960 px)
├── fonte/
│   ├── campanha.mjs             # fonte única: cores, textos, preços, tempos, roteiro, formatos
│   ├── linha-do-tempo.mjs       # trilhas CSS com limites de 180–300 ms e loop fechado
│   ├── modelos.mjs              # SVG animado de cada modelo
│   ├── pecas.mjs                # lâminas e capas (HTML)
│   ├── videos.mjs               # feed e Story (HTML com linha do tempo de 20 s) e sinais sonoros
│   ├── audio.mjs                # síntese dos efeitos e WAV
│   ├── navegador.mjs            # cliente DevTools mínimo: espera fontes/imagens, busca o tempo, captura
│   ├── midia.mjs, fontes.mjs, zip.mjs, caminhos.mjs
│   ├── exportar.mjs             # etapas: apoio, estaticos, modelos, gifs, videos, audio, site, pacote
│   └── conferir-site.mjs        # QA da página Possibilidades
├── exportacoes/                 # carrossel, video-feed, story, gifs, modelos-site, previas
└── vitrine-inspira-campanha-2026-11-profundidade-e-movimento.zip
web/assets/modelos/              # SVG do site, PNG, WebP e fotos de apoio
web/model-demos.js               # troca PNG → SVG inline, pausa, visibilidade, movimento reduzido
web/possibilidades/index.html    # quatro figuras com PNG estático e controle oculto
web/styles.css                   # estilos das demonstrações e do controle
test/campanha-modelos.test.mjs
```

**Structure Decision**: geradores dentro da pasta da campanha para o acervo ser autocontido; o site recebe apenas os artefatos gerados. `npm run campanha` executa todas as etapas.

## Decisões

1. **SVG como fonte visual**: animações CSS (não SMIL) porque pausam com `animation-play-state` e são buscáveis por `getAnimations()`; isso garante que GIF/MP4 mostrem exatamente o que o site anima.
2. **Prefixos por instância**: cada cópia de um modelo recebe prefixo próprio (`mcd`, `mcd2`…), pois estilos de SVG inline são globais no documento.
3. **Congelamento nas cenas**: `data-t1` prende o modelo no resultado até a troca de cena; `data-t0` desloca o relógio.
4. **Fontes no SVG avulso**: TTF convertida em WOFF (zlib) e embutida; o site usa as fontes já carregadas.
5. **Terminologia**: “Pratos” no site, “Cardápio” no Instagram.

## Pendências humanas

1. Revisar textos, legendas e nomes fictícios antes de publicar.
2. Publicar no Instagram e aplicar o sticker de link no Story (fora do escopo).
3. Deploy do site segue pendente (Cloudflare auth não configurada).

## Complexity Tracking

Nenhuma violação da constituição.
