# Diagnóstico de usabilidade atual — HTML puro, projeto externo e configurações por cliente

Pesquisa de apoio da [especificação 016](spec.md). Registra o que foi observado
num navegador real nas telas que a funcionalidade vai mudar e o resultado de uma
maquete temporária da página emoldurada com o protótipo Orbit.

- **Data da coleta**: 2026-11-21, 20:50–21:40 UTC.
- **Commit auditado**: `main` em `7564f7c`.
- **Navegador**: Google Chrome 157 (headless) controlado por Playwright, larguras
  de 1280 × 900 e 375 × 812 px (esta com emulação de toque).
- **Capturas**: em `/opt/cursor/artifacts/` (não versionadas). Os nomes estão na
  seção 4.

## 1. Ambiente e limites

- `npm run build` e `npm run preview` (loopback, `http://127.0.0.1:4173`). O
  preview só serve o `dist/`; `/api/*` responde `404` e o painel para na tela de
  entrada (igual ao relatado em `docs/auditoria-ux/matriz-central.md`, seção 1.3).
- Para chegar às telas autenticadas, um script temporário fora do repositório
  interceptou `/api/*` no navegador e respondeu com o próprio
  `createApiHandler` de `workers/api.mjs` sobre `createMemoryStore`, com o token
  de teste do proprietário (`token-owner`). Foram acrescentados só dados de
  apoio: perfil completo, duas vitrines (o exemplo "Ateliê Barro Claro" de
  `content/vitrines/servicos-produtos-exemplo.json` e `loja1`), os padrões do
  modelo `servicos-produtos-v1`, um componente aprovado fictício
  ("Orbit — protótipo · 1.0.0") e, no papel de operador, indicadores, dois
  pedidos de customização e dois registros de atividade.
- Não verificado: sessão Google real, Supabase remoto (RLS, RPCs), rota
  `sandbox.inspira.dev.br` (sem DNS nem rota em `wrangler.jsonc`), deploy. Achados
  que dependem do servidor real estão marcados como "a confirmar".
- A conta de teste do proprietário (a do próprio usuário) não foi usada nem
  escrita aqui; entra no quickstart do plano.

## 2. Achados no painel atual

| ID | Tela | Observação | Largura | Efeito na 016 |
| --- | --- | --- | --- | --- |
| U-01 | Administração da plataforma | Não há lista de clientes nem de vitrines. O indicador "Vitrines 12" não leva a lugar nenhum; não existe caminho para ver as configurações de um cliente específico. | 1280 e 375 | FR-044, FR-045 |
| U-02 | Administração › Visão geral | Os pedidos de customização mostram só o objetivo, a etapa e a data ("Página interativa do protótipo Orbit · recebido em 20/11/2026"), sem o cliente ou a vitrine. "Atividade recente" também não mostra autor nem cliente. | 1280 e 375 | FR-047 |
| U-03 | Administração | Não há tela para registrar, revisar ou listar componentes personalizados. O cadastro só existe pela API (`POST /api/admin/custom-components`), restrita ao operador, sem fila nem estado "aguardando revisão". | — | US3, FR-027 a FR-031 |
| U-04 | Editor › Identidade, menus e páginas | A seção "Componente aprovado" mostra só um campo "Componente" com "Orbit — protótipo · 1.0.0": sem prévia, descrição, situação, altura ou origem. Sem componente aprovado, a opção some da lista "Tipo da nova seção", sem explicar como conseguir uma. | 1280 e 375 | US2 (cenário 4), FR-052 |
| U-05 | Editor › aba "Ajustes" | A aba se chama "Ajustes", mas o painel abre com o título "Configurações e Componentes". O painel tem 5.519 px de altura em 1280 (6,1 telas) e 5.616 px em 375 (6,9 telas), com 27 campos visíveis: dados do negócio, página por cidade, horário, endereço, Google e WhatsApp, QR Code, comentário no Instagram e, no fim, "Administração e Estrutura da Vitrine" com cinco painéis recolhidos. | 1280 e 375 | FR-050, FR-051 |
| U-06 | Editor › Identidade, menus e páginas | Aberto, o painel mede 13.076 px em 1280 (≈ 14,5 telas) e 14.425 px em 375 (≈ 17,8 telas). Todas as seções vêm expandidas e há um único "Salvar estrutura" no fim. | 1280 e 375 | FR-051 |
| U-07 | Editor › Menu do cabeçalho/rodapé | O "Destino" de cada link é texto livre com exemplo `#sec-sobre`; aceita âncora, caminho ou endereço `https://`. O dono precisa conhecer identificadores internos. Link `https://` abre em nova aba sem aviso. | 1280 e 375 | FR-037, FR-053 |
| U-08 | Editor em 1280 | A coluna do formulário fica estreita ao lado da "Pré-visualização Instantânea" e corta o conteúdo dos campos ("Conversar r…", "Conversa no…"). | 1280 | FR-054 |
| U-09 | Editor › "Administração e Estrutura da Vitrine" | Estilos de painel recolhível diferentes: "Identidade, menus e páginas" tem ícone, subtítulo e seta; "Versões publicadas", "Equipe e permissões", "Biblioteca de arquivos" e "Domínios e publicação" usam o triângulo padrão do navegador. | 1280 e 375 | FR-050 |
| U-10 | Editor › Identidade, menus e páginas | Quando a consulta falha, aparece só "Não foi possível consultar a estrutura.", sem motivo nem "Tentar novamente" (observado antes de o roteiro fornecer os padrões do modelo). | 375 | FR-055 |
| U-11 | Editor › Equipe e permissões; Administração › Patrocinadores | Pedem o "ID da conta" (identificador técnico) em vez de nome ou e-mail. | 1280 e 375 | Fora do escopo; registrado para o backlog |
| U-12 | Editor › Domínios e publicação | Bom padrão a reaproveitar: selo do plano ("Essencial") no título do painel e mensagem de estado ("Domínios indisponíveis neste ambiente."). | 1280 e 375 | FR-050 |
| U-13 | Administração | Seis abas misturam operação da plataforma (Mila, Linktree, Patrocinadores, Modelos, Site institucional) e quebram em duas linhas em 1280; em 375 viram grade de 2 colunas. Nada é organizado por cliente. | 1280 e 375 | FR-044 |
| U-14 | Endereço `/portal/#administracao` | Aberto direto, mostra o Início em vez da administração, nas duas larguras. A confirmar com sessão real: pode ser a ordem entre a checagem de permissão e a leitura do endereço. | 1280 e 375 | FR-044 |
| U-15 | Todas as capturas | Nenhuma tela teve rolagem horizontal em 375 px. | 375 | Manter |
| U-16 | Customizações (dono) | O formulário de pedido não pergunta a vitrine e já vem com "Alimentação" escolhida; o dono não vê as customizações já contratadas. | 1280 e 375 | FR-046, FR-047 |

## 3. Maquete da página emoldurada com o Orbit

Arquivos temporários em `/tmp/audit016/frame/` (não versionados): uma página
com a aparência da vitrine em `http://127.0.0.1:4310` e o pacote servido de outra
origem (`http://localhost:4311`), com `sandbox="allow-scripts"`, sem
`allow-same-origin`, `referrerpolicy="no-referrer"` e uma política de conteúdo
proposta para o pacote: `script-src 'unsafe-inline' https://cdn.tailwindcss.com`,
`style-src 'unsafe-inline' https://fonts.googleapis.com`,
`font-src https://fonts.gstatic.com`, `img-src data: blob:`,
`connect-src 'none'`, `form-action 'none'`, `base-uri 'none'`,
`frame-ancestors` com a origem da vitrine e `sandbox allow-scripts`.

Moldura usada: cabeçalho da vitrine (64 px no computador, 56 px no celular), barra
de título da página (56/44 px), margem lateral de 24 px no computador e 8 px no
celular, altura da moldura = altura visível − cabeçalho − barra de título −
margem inferior, com mínimo de 560/480 px, cantos de 16/12 px e rodapé da vitrine
depois da moldura.

| ID | Verificação | Resultado |
| --- | --- | --- |
| M-01 | Tamanho da moldura | 1230 × 754 px em 1280 × 900; 357 × 702 px em 375 × 812. Sem rolagem horizontal. O Orbit preenche a moldura com o próprio layout de altura 100% e `overflow: hidden`. |
| M-02 | Rolagem até o rodapé | Rodar a roda do mouse sobre a moldura rola a página (194 px em 1280, 215 px em 375, até o fim). Rolagem por toque não foi medida. |
| M-03 | Hosts externos liberados | Tailwind (`tailwind` definido) e a fonte Inter carregaram; origem do pacote é `null`. O CDN do Tailwind avisa no console que não deve ser usado em produção. |
| M-04 | Política atual (`SANDBOX_CSP` sem hosts externos) | O Orbit aparece sem estilo: botões nativos, texto solto, ícones gigantes (`016-orbit-sem-cdn-*.png`). O caso de referência não funciona com a política atual. |
| M-05 | Formulários do Orbit | Sem `allow-forms`, o evento `submit` não dispara: o chat do "Parque" e os comentários do Orbit (tratados com `preventDefault`) ficam quebrados. Com `allow-forms` e `form-action 'none'`, o evento dispara e o envio de rede é barrado pela política (o servidor de teste não recebeu nada). Num teste com destino externo, a moldura do pacote hostil virou página de erro do navegador: o pacote só consegue quebrar a si mesmo. |
| M-06 | Pacote hostil | Bloqueados: ler `document.cookie`, ler `localStorage`, ler o DOM da vitrine, navegar a janela de cima (`top.location`), abrir pop-up, `fetch` para a vitrine e para fora, script de host fora da lista, imagem externa (beacon) e envio de formulário. |
| M-07 | Mensagens do pacote | Recusadas: altura 99999, tipo desconhecido `vitrine:navigate` com URL e texto solto. Aceita: altura 640 vinda da própria moldura com origem `null`. |
| M-08 | Bloco HTML | Altura do conteúdo: o bloco foi a 271 px depois da mensagem de altura. Altura fixa do Orbit, `min(640 px, 75% da altura da tela)`: 1070 × 640 em 1280 e 349 × 609 em 375; a seção seguinte continua acessível. |
| M-09 | Moldura fora da tela | Na captura de página inteira, o bloco Orbit fora da área visível ficou preto até ser rolado para a tela. É preciso um estado de carregamento visível. |
| M-10 | Tamanho do pacote | O Orbit tem 166.225 bytes (SHA-256 `e888ce2a…d47c`), acima do limite atual de 64 KiB. |

## 4. Capturas

Painel (roteiro com `createApiHandler` e dados de apoio):

- `016-admin-visao-geral-1280.png`, `016-admin-visao-geral-375.png` — U-01, U-02, U-13
- `016-admin-modelos-1280.png`, `016-admin-modelos-375.png`
- `016-admin-site-institucional-1280.png`, `016-admin-site-institucional-375.png`
- `016-owner-vitrines-1280.png`, `016-owner-vitrines-375.png`
- `016-owner-editor-1280.png`, `016-owner-editor-375.png` — U-05 (aba "Ajustes")
- `016-owner-configuracoes-1280.png` (página inteira, 6.195 px), `016-owner-configuracoes-375.png` — U-05
- `016-owner-estrutura-topo-1280.png`, `016-owner-estrutura-topo-375.png`,
  `016-owner-estrutura-menus-1280.png`, `016-owner-estrutura-menus-375.png` — U-06, U-07
- `016-owner-estrutura-componente-1280.png`, `016-owner-bloco-componente-1280.png`,
  `016-owner-bloco-componente-375.png` — U-04, U-08
- `016-owner-dominios-1280.png`, `016-owner-dominios-375.png`, `016-owner-equipe-1280.png`,
  `016-owner-equipe-375.png` — U-09, U-11, U-12
- `016-owner-customizacoes-1280.png`, `016-owner-customizacoes-375.png` — U-16

Maquete (seção 3):

- `016-orbit-pagina-emoldurada-1280.png`, `016-orbit-pagina-emoldurada-375.png`,
  `016-orbit-pagina-emoldurada-rodape-375.png` — M-01, M-02
- `016-orbit-sem-cdn-1280.png`, `016-orbit-sem-cdn-375.png` — M-04
- `016-pacote-hostil-1280.png`, `016-pacote-hostil-375.png`,
  `016-pacote-hostil-com-allow-forms-1280.png` — M-05, M-06, M-07
- `016-bloco-html-1280.png`, `016-bloco-html-375.png`,
  `016-bloco-html-orbit-1280.png`, `016-bloco-html-orbit-375.png` — M-08, M-09
