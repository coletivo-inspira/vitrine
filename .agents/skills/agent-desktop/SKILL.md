---
name: agent-desktop
tags: uso-do-computador, automacao-desktop, acessibilidade, agente-ia, automacao-gui, cli, computer-use, desktop-automation
requirements:
  - agent-desktop
description: >-
  Opera aplicativos de área de trabalho (desktop) no Windows, macOS e Linux por meio de árvores de acessibilidade nativas (UIA/AX/AT-SPI) usando a CLI agent-desktop. Use quando o usuário pedir para visualizar, inspecionar ou interagir com aplicativos gráficos (GUI) do desktop: abrir aplicativos, clicar em botões, preencher formulários, ler o estado da interface, tirar capturas de tela (screenshots), gerenciar janelas, navegar em menus, alternar caixas de seleção (checkboxes), rolar a tela, arrastar elementos, digitar textos, pressionar atalhos de teclado, usar a área de transferência ou ler notificações do sistema.
  Gatilhos: "clicar no botão", "preencher formulário", "abrir aplicativo", "ler interface", "ler UI", "uso do computador", "computer use", "operar desktop", "árvore de acessibilidade", "capturar snapshot do app", "digitar no campo", "navegar no menu", "marcar checkbox", "tirar print", "tirar screenshot", "automação de desktop", "controlar janela", "agent-desktop", ou qualquer tarefa de interação gráfica no Windows, macOS ou Linux.
---

# Agent Desktop (Automação de Desktop via Árvore de Acessibilidade)

O `agent-desktop` é uma ferramenta de linha de comando (CLI) de código aberto desenvolvida pelo Vercel Labs para automação nativa de área de trabalho. Em vez de depender de capturas de tela lentas e frágeis baseadas em coordenadas de pixels, ele interage diretamente com a árvore de acessibilidade nativa do sistema operacional (UI Automation no Windows, AX no macOS e AT-SPI no Linux).

Cada comando imprime um único envelope JSON estruturado (`ok`, `data` ou `error`). O `agent-desktop` é uma ferramenta, não um agente autônomo: o ciclo de observar, agir e verificar roda em você.

---

## Diretrizes e Pré-requisitos no Windows (PowerShell)

No Windows (usando PowerShell):

1. **Coloque todas as referências (`@ref`) entre aspas simples:**
   O PowerShell interpreta um `@token` sem aspas como seu operador de *splatting* de arrays e remove o argumento antes de enviá-lo ao binário. Sempre use aspas simples nas referências:
   ```powershell
   agent-desktop click '@s8f3k2p9:e12'
   agent-desktop set-value '@s8f3k2p9:e3' "meu valor"
   ```
   Use `$env:NOME = 'valor'` em vez de `export`, e `| ConvertFrom-Json` em vez de `$(...)` e `jq`.

2. **Diretório de Estado (`AGENT_DESKTOP_HOME`):**
   Defina a variável de ambiente do diretório de estado para garantir permissões de escrita (especialmente dentro de sandboxes):
   ```powershell
   $env:AGENT_DESKTOP_HOME = "$pwd\.agent-desktop"
   ```

3. **Primeira Execução:**
   - Execute `agent-desktop status`. Ele informa a plataforma, as permissões e as superfícies suportadas (`supported_surfaces`).
   - Execute `agent-desktop skills get platform` (ou consulte [agent-desktop-windows.md](./references/agent-desktop-windows.md)) para ver os detalhes específicos do sistema operacional atual.
   - Para consultar flags e sintaxe de qualquer comando, execute `agent-desktop <comando> --help`.

4. **Ações Semânticas (Headless) vs. Físicas (`--headed`):**
   - **Semânticas/Headless (Padrão):** `click`, `set-value`, `clear`, `select`, `toggle`, `check`, `uncheck`, `expand`, `collapse`, `scroll`, `scroll-to`. Usam chamadas semânticas de acessibilidade, não movem o cursor do mouse e não roubam o foco da janela do usuário. Se não houver caminho semântico, a ação falha de forma segura (*fails closed*).
   - **Físicas/Headed (Requerem `--headed`):** `type`, `double-click`, `triple-click`, `right-click`, `focus`, `hover`, `drag`, `mouse-click`, `mouse-move`, `mouse-wheel`. Use a flag global `--headed` somente quando a entrada física (teclado/mouse real ou mudança de foco) for necessária ou permitida. Nunca mude para `--headed` apenas para contornar uma falha headless sem entender a causa. Coordenadas brutas (`--xy`) nunca implicam foco automático.

5. **Janelas Minimizadas:**
   Uma janela atrás de outra pode ser controlada normalmente, mas uma janela **minimizada** não. Todos os elementos de uma janela minimizada reportam `offscreen` e as ações por referência falham. Execute `agent-desktop restore --app <nome>` e tire um novo snapshot. Não use `focus-window` por reflexo, pois isso rouba o primeiro plano do usuário.

---

## O Ciclo Observar-Agir-Verificar (The Loop)

Use `find` quando já souber a função (`role`) ou o nome exato do elemento. Caso contrário, mapeie o aplicativo primeiro e aprofunde (*drill down*) em uma região específica:

```powershell
# 1. Mapa superficial (skeleton), mantendo apenas elementos interativos (-i) e compacto (--compact)
agent-desktop snapshot --skeleton --app "Notepad" -i --compact

# 2. Aprofundar (drill) em uma subárvore específica a partir de uma referência
agent-desktop snapshot --root '@s8f3k2p9:e3' -i --compact

# 3. Agir sobre uma referência qualificada
agent-desktop click '@s8f3k2p9:e12'

# 4. Verificar: reler a mesma região para confirmar o resultado
agent-desktop snapshot --root '@s8f3k2p9:e3' -i --compact
```

### Regras do Ciclo
- Um aplicativo pequeno não precisa de `--skeleton`. Tire um `snapshot -i` completo.
- `-i` mantém apenas nós interativos, portanto o rótulo de texto estático (`statictext`) de uma linha é omitido. Para saber a qual linha pertence um botão repetido, aprofunde no contêiner da linha com `--root` e **omita** `-i`. No Windows e no Linux isso permite ler a linha, mas não torna o botão acionável por referência se ele for repetido de forma idêntica em outras linhas (veja **Referências (Refs)** abaixo).
- Um aprofundamento com `--root` adiciona suas referências ao mesmo ID de snapshot. As referências fora da subárvore aprofundada e a própria raiz permanecem válidas; as referências que já estavam dentro dela são substituídas, portanto uma referência antiga daquela subárvore retornará `STALE_REF`.
- Nunca use `--skeleton` em uma superfície (`--surface menu`, `sheet`, `alert`). Uma superfície já é focada e reduzida.
- Uma ação que abre um menu, folha modal (*sheet*) ou alerta lista essa superfície em `data.surfaces`. Direcione a próxima ação para essa sobreposição.
- Após uma etapa assíncrona, use `wait` (veja [commands-system.md](./references/commands-system.md)). Um `sleep` de tempo fixo causa condições de corrida (*race conditions*).

---

## Referências (Refs)

- As referências geradas são qualificadas no formato `@<snapshot_id>:e<N>`, por exemplo `'@s8f3k2p9:e1'`. Passe-as exatamente assim para os comandos seguintes.
- As referências são válidas para um snapshot. Após qualquer alteração na interface, aprofunde novamente na região afetada ou tire um novo snapshot.
- Apenas elementos endereçáveis recebem referências. Textos estáticos e contêineres inertes não recebem.
- O comando reidentifica o elemento antes de agir. No macOS a referência carrega o endereço próprio do elemento, permitindo distinguir gêmeos idênticos. No Windows e no Linux uma referência só é resolvida quando era o **único** elemento na janela capturada com aquela combinação de `role`, ID nativo, `name` e `description` (contado inclusive abaixo de cortes de `--skeleton` ou `--max-depth`), e exatamente um elemento ativo continua correspondendo. Gêmeos idênticos no Windows/Linux não possuem caminho por referência: apenas `--headed mouse-click --xy X,Y` pode escolher um deles (assumindo o primeiro plano).
- `STALE_REF`: o elemento desapareceu ou não corresponde mais (`details.kind` é `saved_ref_absent`, ou `retained_object_stale` no macOS). Tire um novo snapshot e use a nova referência.
- `AMBIGUOUS_TARGET`: um elemento idêntico apareceu (`saved_ref_ambiguous`), ou a referência não pôde ter sua unicidade comprovada na captura (`identity_not_unique`). Repetir a referência ou tirar outro snapshot de gêmeos idênticos resultará na mesma recusa; atue em um controle único na janela. `identity_not_unique` também ocorre quando o snapshot não conseguiu ler toda a janela a tempo: tire um novo snapshot com um `--timeout-ms` maior.
- `TIMEOUT` com `details.kind: resolution_identity_unknown`: uma leitura ao vivo não respondeu a tempo, então a identidade não foi comprovada. Nada foi enviado; tente novamente.
- `SNAPSHOT_NOT_FOUND`: o ID do snapshot expirou ou pertence a outra sessão. Tire um novo snapshot.

---

## Entrega e Novas Tentativas (Delivery & Retry)

Os resultados de ações trazem `data.disposition` e os erros trazem `error.disposition`, cada um contendo `delivery` e `retry`. Comandos de observação como `snapshot` não possuem `disposition` em caso de sucesso; seus erros e qualquer recusa `INVALID_ARGS` trazem `not_delivered` e `retry: safe`.

- **Repita ou substitua uma ação somente quando `disposition.retry` for `safe`.** Apenas `not_delivered` é seguro para repetir diretamente.
- Qualquer outro valor de `delivery` significa que a ação pode ter sido entregue. Repetir cegamente pode clicar, digitar ou enviar um formulário duas vezes, e `toggle` pode desfazer a si mesmo.
- Quando o resultado não for `safe`, leia o estado atual ao vivo (`get`, `is` ou um novo `snapshot`) e decida a partir dele. `details.post_state` ajuda quando está presente.
- Tome decisões de fluxo com base em `error.code` e `error.disposition` (textos de `message` e `suggestion` podem mudar).
- `details.retryable: false` significa que esperar não mudará o resultado; tente uma abordagem diferente.

---

## Comandos Essenciais

### 1. Inspeção e Observação
- **Listar Janelas:**
  ```powershell
  agent-desktop list-windows
  ```
- **Listar Aplicativos em Execução:**
  ```powershell
  agent-desktop list-apps
  ```
- **Buscar Elemento por Nome / Função (`role`):**
  ```powershell
  agent-desktop find --app "Notepad" --role button --name "Salvar"
  ```
- **Ler Propriedade de um Elemento:**
  ```powershell
  agent-desktop get '@s8f3k2p9:e5' --property text
  ```
- **Capturar Screenshot da Janela:**
  ```powershell
  agent-desktop screenshot --app "Notepad" janela.png
  ```

### 2. Interação
- **Clicar:**
  ```powershell
  agent-desktop click '@s8f3k2p9:e5'
  ```
- **Definir Valor de Texto (Semântico e Rápido):**
  ```powershell
  agent-desktop set-value '@s8f3k2p9:e7' "Olá Mundo"
  ```
- **Digitar Texto (Simulação de Teclas, requer `--headed` no Windows):**
  ```powershell
  agent-desktop --headed type '@s8f3k2p9:e7' "Olá Mundo"
  ```
- **Pressionar Atalho de Teclado:**
  ```powershell
  agent-desktop press ctrl+s
  ```
- **Marcar / Desmarcar / Alternar Checkbox:**
  ```powershell
  agent-desktop check '@s8f3k2p9:e9'
  agent-desktop uncheck '@s8f3k2p9:e9'
  agent-desktop toggle '@s8f3k2p9:e9'
  ```

### 3. Ciclo de Vida de Aplicativos e Sistema
- **Iniciar Aplicativo:**
  ```powershell
  agent-desktop launch notepad.exe --activate
  ```
- **Fechar Aplicativo:**
  ```powershell
  agent-desktop close-app notepad.exe
  ```
- **Área de Transferência (Clipboard):**
  ```powershell
  agent-desktop clipboard-get
  agent-desktop clipboard-set "Texto de exemplo"
  ```
- **Aguardar Elemento ou Evento:**
  ```powershell
  agent-desktop wait --element '@s8f3k2p9:e5' --predicate actionable --timeout 5000
  ```

---

## Referências Detalhadas

Carregue apenas a referência necessária para a tarefa em questão:

| Referência | Quando abrir |
|------------|--------------|
| [agent-desktop-windows.md](./references/agent-desktop-windows.md) | Guia da plataforma Windows: tabela de capacidades, aspas no PowerShell, janelas minimizadas, atalhos bloqueados e diferenças do Windows |
| [commands-observation.md](./references/commands-observation.md) | Semântica detalhada de `snapshot`, `find`, `get`, `is`, `screenshot`, `list-surfaces`, árvores parciais e regras de `--root` |
| [commands-interaction.md](./references/commands-interaction.md) | Escolha entre `click`, `type`, `set-value`, `select`, `toggle`, `scroll`, `press` e comandos de mouse, ou depuração de erros de ação |
| [commands-system.md](./references/commands-system.md) | Abrir ou fechar apps (`launch`, `--cdp`, `close-app`), gerenciar janelas, área de transferência, `wait`, `batch`, sessões, cursores multiagente e traces |
| [workflows.md](./references/workflows.md) | Padrões práticos passo a passo (formulários, menus, diálogos, aguardar nova janela, rolagem com busca, arrastar e soltar) e lista de antipadrões |
| [permissions-and-elevation.md](./references/permissions-and-elevation.md) | Níveis de integridade do Windows, isolamento UIPI, atalhos bloqueados, processos protegidos e lease de interação entre processos |
| [chromium-and-electron.md](./references/chromium-and-electron.md) | Tempo de estabilização (*settle*) em apps Chromium/Electron, janelas cobertas, armadilha de provider em WPF e conteúdo web sem nome |
| [troubleshooting.md](./references/troubleshooting.md) | Mapa de sintomas e causas no Windows, verificação pós-ação, salvamento de documento em modo headless e avisos de binário não assinado |
| [shell-and-overlay.md](./references/shell-and-overlay.md) | Superfícies do shell (`open-system-surface`), bandeja do sistema, barra de tarefas, notificações do Action Center, cursor overlay e janelas UWP |
