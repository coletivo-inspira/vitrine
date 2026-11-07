# Marca Vitrine — implementação aprovada

2026-11-07. Opção A aprovada pelo usuário: V na caixa verde-lima e apenas
“vitrine”, com lettering firme e proporções naturais do estudo. O nome do projeto
e o endosso do Coletivo Inspira permanecem no conteúdo da página.

## Ativos

- `web/assets/brand/vitrine.svg`: assinatura estática em curvas.
- `web/assets/brand/vitrine-animated.svg`: mesma assinatura, lâminas abrem
  uma única vez em 700 ms. Sem animação com preferência por movimento reduzido.
- `web/assets/brand/vitrine-icon.svg`: símbolo quadrado, favicon.
- `web/assets/brand/vitrine-inverse.svg`: letras claras para superfícies escuras.

Reprodução: `python scripts/create-vitrine-brand.py`, biblioteca padrão, a partir
do SVG de referência aprovado em `docs/design/logo-study/vitrine-caixa-verde.svg`.
Sem dependência de fonte no navegador, JS no SVG ou rede externa.

## Verificação local

- `npm test`: 23 testes passaram; `npm run build` concluiu.
- Chromium 1440×1000 e 390×1000: marcas carregadas, sem overflow horizontal,
  sem erros JavaScript. Capturas completas em `.impeccable/review/logo/`.
- Cabeçalho e rodapé: 188×58 px no desktop, 169.2×52.2 px no celular.
- Menu mobile abre; Escape executado no caminho de teclado.
- SVG animado: transformação muda durante abertura e termina na identidade
  após 800 ms. Preferência reduzida: `animation-name: none`, sem transformação.
- Revisão visual independente: `ship`, sem correções materiais na integração.
- Detector Impeccable executado uma vez; avisos de espaçamento, cores e tamanhos
  pertencem ao restante preexistente da página, fora da alteração de marca.

Publicação usa o workflow GitHub Pages existente; não altera DNS, plano ou recursos
Cloudflare. Conferir o resultado de Actions e o ativo servido após o push.
