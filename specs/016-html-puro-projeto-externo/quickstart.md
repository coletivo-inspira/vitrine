# Quickstart: validar HTML puro, projeto externo e administração por cliente (`016`)

Roteiro de validação da funcionalidade **depois** de implementada. Nada disto está implementado
nesta fase; contratos em [contracts/](contracts/) e modelo em [data-model.md](data-model.md).
A autenticação na Cloudflare não está configurada: este roteiro não faz nem pressupõe deploy
remoto.

## Pré-requisitos

- Node 24 (`package.json` exige `>=24.12.0 <25`). Se o Node padrão da máquina for outro, use a
  instalação da linha 24 antes dos comandos (por exemplo, pelo `nvm`).
- `npm ci` concluído.
- Fixture: [`exemplos/orbit-prototipo.html`](exemplos/orbit-prototipo.html) — 166.225 bytes,
  SHA-256 `e888ce2a7d8159b01d05ebcbb23d89b815a713258eaee30c36edb1e25b05d47c`, usa
  `cdn.tailwindcss.com`, `fonts.googleapis.com` e `fonts.gstatic.com`, tem 2 formulários e não
  envia `vitrine:resize`.
- Fixtures novas a criar em `test/fixtures/html-packages/`: pacote hostil (SC-003), pacote de
  altura variável que envia `vitrine:resize`, pacote com host não permitido (`unpkg.com`), pacote
  com campo de senha, pacote de 524.289 bytes.
- Contas:
  - **conta de teste do proprietário**: a do próprio usuário, informada por ele na hora do aceite
    (nenhum e-mail é versionado). Nos testes automatizados, o token `token-owner` da loja em
    memória (`createMemoryStore`).
  - Dois **Operadores Inspira** com `platform_admin` (dependência `BLK-HITL-72`); nos testes, os
    tokens de operador da loja em memória.
  - Uma vitrine no **Essencial** (ou superior) e uma no **Gratuito/Social**.

## Comandos locais

```bash
npm test                 # suíte inteira, inclusive os testes novos desta funcionalidade
npm run build            # dist/ só com conteúdo público
npm run preview          # http://127.0.0.1:4173 (só dist/; não atende /api nem o host isolado)
npx --yes wrangler@4.158.0 deploy --dry-run   # confere o pacote do Worker; não publica nada
```

Para observar o isolamento no navegador com o Worker local (opcional; confirmar que o
`wrangler dev` local roda sem login antes de depender disto):

```bash
npx --yes wrangler@4.158.0 dev --local --var SANDBOX_ORIGIN:http://sandbox.localhost:8787
# vitrine: http://localhost:8787/<endereço>   pacote: http://sandbox.localhost:8787/embed/…
```

Sem Supabase local, as telas autenticadas podem ser exercitadas como na auditoria
(`research-usabilidade.md`, seção 1): interceptando `/api/*` no navegador com
`createApiHandler` sobre `createMemoryStore`.

## Testes automatizados esperados

| Arquivo | Cobre |
| --- | --- |
| `test/html-package-rules.test.mjs` | limites, níveis do relatório, hosts com linha e coluna, `xmlns` ignorado, Orbit sem erros e com os 3 hosts |
| `test/html-packages-api.test.mjs` | envio, reenvio idêntico, estados, plano (`403` com Essencial), limite (`html_packages_limit`) na criação e no envio para revisão de pacote ainda não ativo, suspensão, cotas, exclusão em uso, voltar versão |
| `test/html-sandbox-embed.test.mjs` | CSP por versão, `frame-ancestors`, hash divergente, retirada com revalidação de 300 s, token de prévia |
| `test/html-framed-page.test.mjs` | rota própria, domínio próprio, metadados, medidas nas classes, perda do plano, publicação recusada com versão não aprovada |
| `test/html-frame-controller.test.mjs` | regras de `vitrine:resize`, limite de 10/s, falha em 10 s |
| `test/external-project.test.mjs` | validação do destino, laço, comprovação DNS e arquivo (com `fetch` simulado), Cron com orçamento, `302` com `utm_*`, `404` de JSON, menu em nova aba, métrica |
| `test/admin-clients.test.mjs` | lista, busca por nome, endereço e código, filtros, ficha, `403` para não operador |
| `test/database/html-packages.test.mjs` | RLS (dono A não lê pacote de B, inclusive por chamada direta), gatilhos de limite (criação e envio para revisão) e cota, retenção |
| `test/database/external-project-links.test.mjs` | RLS, máquina de estados, `public_showcase_overrides` sem dados privados, 5 configurações |
| `test/database/admin-clients.test.mjs` | RPCs recusam não operador; projeção sem dados pessoais |
| `test/plans.test.mjs`, `test/database/plans-subscriptions.test.mjs` | `html_packages`, `htmlPackagesPerVitrine`, coluna `max_html_packages` |
| `test/security-rls-csp-audit.test.mjs` | página da vitrine com `frame-src` só quando há moldura; host isolado nunca com `allow-same-origin` |

Resultado esperado: `npm test` sem falhas; a contagem cresce a partir dos 595 testes de `main`
em `c29ee4c`.

## Cenários de aceite (manual, navegador real, 1280 × 900 e 375 × 812)

### A. Orbit como página emoldurada (US1, US7; MVP)

1. Com a conta de teste do proprietário, numa vitrine no Essencial, abrir **Ajustes → Conteúdo
   HTML → Enviar primeiro pacote**, escolher `orbit-prototipo.html`, marcar as duas declarações.
   - Esperado: "Pronto para revisão"; tamanho 162 KiB; impressão digital `e888ce2a…d47c`; hosts
     permitidos listados; aviso "Formulários só funcionam por script e não enviam dados". (US1-1)
2. **Identidade e páginas → Nova página → Página HTML emoldurada**, título "Protótipo Orbit",
   endereço `prototipo-orbit`, marcar "Mostrar no menu", escolher a versão 1. Abrir a prévia.
   - 1280: cabeçalho da vitrine, barra de título, moldura ~1230 × 754 com margem de 24 px, sem
     rolagem horizontal, rodapé depois da moldura; selo "Aguardando revisão". (US1-2, US1-3)
   - 375: cabeçalho compacto, título de uma linha, moldura ~357 × 702 com margem de 8 px; o Orbit
     ocupa a área com o próprio leiaute. (US1-4)
3. **Enviar para revisão**. Com um Operador Inspira, **Administração → Revisões**: a versão aparece
   com cliente, vitrine, tamanho, hosts e espera. Abrir, alternar prévia 1280/375, marcar a lista e
   **Aprovar**.
   - Esperado: aviso no Início do proprietário; registro de auditoria. (US1-5, FR-030, FR-031)
4. Publicar a vitrine e abrir `/<endereço>/prototipo-orbit` numa janela anônima.
   - Esperado: identidade e menu primeiro; estado de carregamento com o título; Orbit funcionando
     (chat do Parque responde no próprio pacote, nada sai pela rede); "Pular conteúdo interativo"
     no Tab; moldura com nome acessível "Protótipo Orbit"; rodapé alcançável rolando sobre a
     moldura em 375. (US7-1 a US7-3)
5. Celular deitado (812 × 375): moldura com 480 px e a página rola. (US7-4)
6. Bloquear `cdn.tailwindcss.com` nas ferramentas do navegador e recarregar.
   - Esperado: em até 10 s, "O conteúdo interativo não carregou", "Tentar novamente" e o botão de
     contato; o resto da vitrine normal. (US7-5)

### B. Plano e limites (US1-7, US1-8, SC-011)

1. Na vitrine Gratuita/Social: "Conteúdo HTML", "Página HTML emoldurada" e "Bloco HTML" com o selo
   "Disponível no plano Essencial", explicação e link para "Plano e cobrança", sem botão de envio.
2. Chamada direta `POST /api/sites/<id>/html-packages` com a sessão dessa vitrine →
   `403 PLAN_FEATURE_REQUIRED`, `requiredPlan.name = "Essencial"`.
3. No Essencial com 1 pacote ativo, tentar um segundo pacote → recusa com o limite 1 e o plano
   Profissional; enviar nova versão do Orbit continua permitido.
4. No Essencial sem pacote ativo, criar dois pacotes (os dois ficam em "Pronta para revisão"),
   enviar o primeiro para revisão e depois o segundo → o segundo envio é recusado com o limite 1 e
   o plano Profissional, pela interface e por chamada direta a `…/submit`.

### C. Revisão completa e retirada (US3)

1. Três versões pendentes de vitrines diferentes, uma com campo de senha: a fila ordena da mais
   antiga; a com senha mostra o alerta.
2. "Recusar" e "Pedir ajustes" sem motivo → o sistema exige o motivo. Com motivo → o proprietário
   vê motivo, data e "revisado pela equipe Inspira".
3. Reenviar o arquivo idêntico já aprovado → não volta para a fila.
4. "Retirar do ar" com motivo numa versão publicada → em até 5 minutos a página mostra "Conteúdo
   indisponível no momento" com o botão de contato fora da moldura; aviso ao proprietário.

### D. Bloco HTML (US2)

1. Inserir o pacote de altura variável como bloco "Altura do conteúdo" depois do cabeçalho do Início
   → o bloco acompanha o conteúdo entre 120 e 4000 px, sem rolagem interna.
2. Inserir o Orbit como bloco "Altura fixa" → ~1070 × 640 em 1280 e ~349 × 609 em 375; a seção
   seguinte continua acessível.
3. Captura de página inteira com o bloco fora da tela → camada de carregamento nas cores da
   vitrine, nunca área preta. (M-09)
4. O cartão do bloco no editor mostra nome, versão, situação, modo de altura, prévia e "Ver em tela
   de celular". (US2-4)

### E. Substituir e voltar versão (US6)

Versão 1 publicada → enviar versão 2 → visitantes continuam na 1 → aprovar e publicar a 2 →
"Voltar para esta versão" na 1 → em até 5 minutos a página usa a 1, sem nova revisão; histórico com
a ação. Tentar excluir o pacote em uso → impedido, mostrando onde é usado.

### F. Pacote hostil (SC-003)

Publicar (em vitrine de teste) o pacote hostil aprovado e conferir no console do navegador e no
servidor de teste: leitura de `document.cookie`, `localStorage`, DOM da vitrine, `top.location`,
`window.open`, `fetch` para a vitrine e para fora, script de `unpkg.com`, imagem externa, envio de
formulário e mensagens `vitrine:navigate`/altura 99999 → todos bloqueados ou ignorados.

### G. Projeto externo (US4)

Pré-condição: vitrine com a customização "Projeto externo" vigente (registrada na ficha do
cliente) e outra sem. Usar domínios de teste controlados pela equipe.

1. Informar `https://<host-de-teste>` → "Aguardando comprovação" com o TXT
   `_vitrine-verify.<host>` = `vitrine=<código>` e o arquivo `/.well-known/…`, cada um com "Copiar"
   e "Verificar agora". O proprietário vê as mesmas instruções só para leitura.
2. "Verificar agora" sem o registro → "registro não encontrado" e o lembrete de 48 horas. Criar o
   registro e verificar → "Pronto para ativar" em até 30 s. (SC-013)
3. Em outro domínio de teste, comprovar pelo arquivo; servir o arquivo por redirecionamento para
   outro domínio → recusa.
4. Ativar "Vitrine inteira" com a confirmação e o motivo → em até 5 minutos `/<endereço>`,
   `/<endereço>/item/<item>` e o domínio próprio respondem `302` ao destino, levando só `utm_*`;
   `vitrine.json` responde `404`; auditoria com valores anterior e novo.
5. Trocar para "Página da vitrine" com "Protótipo Orbit" em "Nova aba" → só essa página redireciona;
   o item de menu aponta direto para o destino com "(abre em outra aba)".
6. Tentar salvar `http://…`, IP, porta, `usuario:senha@…`, encurtador, `vitrine.inspira.dev.br` e o
   domínio próprio da vitrine → cada um recusado com a mensagem ao lado do campo. (SC-007)
7. Remover o TXT e rodar a tarefa do Cron (em teste, chamando `runExternalProjectChecks` com `fetch`
   simulado) → "Suspenso: posse não confirmada", a vitrine volta a ser exibida, avisos ao operador e
   ao proprietário. (SC-012)
8. Desativar e restaurar uma configuração anterior → efeito em até 5 minutos; as duas ações na
   auditoria. Insights mostram "Levados ao projeto externo" por dia e origem.
9. Na vitrine sem a customização → área desabilitada com a explicação e o atalho para registrar a
   contratação. (US4-4)

### H. Administração por cliente e Ajustes (US5)

1. Medir, antes e depois, tempo e interações para: encontrar o cliente X e ver se tem revisão
   pendente (meta: até 3 interações e 30 s, SC-005); mudar o horário de funcionamento; achar onde
   enviar um pacote HTML.
2. "Clientes": busca por nome, endereço e código `#VI-…`; filtros "Com revisão pendente", "Com
   projeto externo", "Com customização contratada"; abrir `#administracao/clientes` direto pelo
   endereço.
3. Ficha: grupos Resumo, Vitrines, Customizações contratadas, Conteúdo HTML, Projeto externo,
   Domínios e Histórico, cada um com estado vazio e "Tentar novamente" quando falhar.
4. Ajustes do proprietário: título "Ajustes"; nove grupos recolhidos com resumo e selo; a lista
   inteira cabe em até 2 telas em 375 px (SC-008); erro de campo leva o foco ao primeiro erro.
5. Conta sem `platform_admin` (proprietário, membro, `support_operator`, patrocinador) chamando
   `/api/admin/clients` e `/api/admin/html-reviews` → `403`.

## Evidência

Capturas em 1280 e 375 (claro e escuro quando o painel tiver tema) no armazenamento do projeto,
fora do repositório, como nas especificações anteriores; registro dos tempos da US5 no PR de
entrega.
