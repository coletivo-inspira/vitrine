# Tasks: Campanha Vitrine Inspira — profundidade e movimento (`015-campanha-movimento`)

**Input**: `spec.md`, `plan.md`, `docs/marketing/campanha-profundidade-movimento.md`

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup

- [X] T001 Registrar pesquisa, direção visual, tempos e terminologia em `docs/marketing/campanha-profundidade-movimento.md`
- [X] T002 Gerar fotos de apoio com ImageGen (prato, combo, projeto) em `carrossel-instagram/2026-11-profundidade-e-movimento/imagens-apoio/`

## Phase 2: Foundational

- [X] T003 Fonte única de cores, textos, preços, momentos, roteiro e formatos em `fonte/campanha.mjs`
- [X] T004 Trilhas de animação com limites de 180–300 ms e loop fechado em `fonte/linha-do-tempo.mjs`
- [X] T005 Construtor dos quatro SVGs animados em `fonte/modelos.mjs`
- [X] T006 Cliente headless (fontes, imagens, busca de tempo, sem rolagem) em `fonte/navegador.mjs`

## Phase 3: User Story 1 — Carrossel (P1)

- [X] T007 [US1] Sete lâminas 1080 × 1080 e capas dos vídeos em `fonte/pecas.mjs`
- [X] T008 [US1] Exportar `exportacoes/carrossel/*.png` e capas

## Phase 4: User Story 2 — Vídeos (P1)

- [X] T009 [US2] Composições de feed e Story com linha do tempo de 20 s em `fonte/videos.mjs`
- [X] T010 [US2] Síntese dos efeitos sonoros a partir dos sinais em `fonte/audio.mjs`
- [X] T011 [US2] Exportar MP4 H.264 `yuv420p` 30 fps, com efeitos (AAC) e sem áudio

## Phase 5: User Story 3 — Site (P1)

- [X] T012 [US3] GIFs 600 × 450, SVG avulsos com fontes/fotos embutidas e PNG 1200 × 900
- [X] T013 [US3] SVG do site, PNG e WebP em `web/assets/modelos/`
- [X] T014 [US3] Figuras com PNG estático e controle oculto em `web/possibilidades/index.html`
- [X] T015 [US3] `web/model-demos.js`: SVG inline, Pausar/Retomar, suspensão fora da tela e com aba oculta, movimento reduzido
- [X] T016 [P] [US3] Estilos das demonstrações e do controle em `web/styles.css`

## Phase 6: User Story 4 — Acervo (P2)

- [X] T017 [US4] Legendas, textos alternativos, índice do acervo e guia de postagem
- [X] T018 [US4] Prévias e ZIP final

## Phase 7: Polish & Verification

- [X] T019 Testes em `test/campanha-modelos.test.mjs`
- [X] T020 Conferência do site (`fonte/conferir-site.mjs`), três ciclos por modelo, sondagem dos vídeos
- [X] T021 `npm test` e `npm run build`
