---
name: agent-desktop-windows
tags: automacao-windows, acessibilidade, uia, agente-ia, automacao-gui, cli, windows-automation
requirements:
  - agent-desktop
description: >-
  Guia da plataforma Windows para a CLI agent-desktop. Lista por grupo de comandos o que funciona no Windows e o que é recusado, os cuidados essenciais de primeiro contato (aspas em referências no PowerShell, janelas minimizadas, entrada exclusiva em modo headed), e onde encontrar superfícies do shell, notificações, overlay de cursor, elevação UIPI, comportamento de estabilização (settle) em Chromium/Electron e solução de problemas.
  Gatilhos: "automação de desktop no Windows", "árvore UIA", "automatizar aplicativo Windows", "agent-desktop no Windows", "entrada bloqueada em janela elevada", "E_ACCESSDENIED", ou qualquer tarefa de interação gráfica (GUI) no Windows.
---

# Guia da Plataforma Windows (`agent-desktop-windows`)

Este arquivo aborda apenas o que difere no Windows. O ciclo observar-agir-verificar, referências (`@ref`), envelope JSON, sessões e rastreamento (*tracing*) funcionam da mesma maneira em todas as plataformas.

Requer Windows 10 1809+ ou Windows Server 2019+ (x64 ou ARM64). Deve ser executado na sessão de área de trabalho interativa do usuário conectado. A Sessão 0 (serviços e tarefas SYSTEM), Server Core, a área de trabalho segura (prompts do UAC, tela de login), uma área de trabalho bloqueada e a sessão de outro usuário **não são suportados**: observações, ações e capturas nesses contextos falham ou não retornam nada.

## Tabela de Capacidades no Windows

| Grupo | Comandos | Status no Windows |
|-------|----------|-------------------|
| Observação | `snapshot`, `find`, `get`, `is`, `screenshot` | Funciona. As superfícies são `window`, `focused`, um modal Chromium como `sheet`, e um menu de aplicativo aberto como `menu` |
| Superfícies | `list-surfaces` | Funciona. Lista `window`, `focused` e `sheet` por processo, além de `menu` com `item_count` enquanto um menu estiver aberto |
| Superfícies do Shell | `open-system-surface` | Funciona para `start-menu`, `taskbar`, `system-tray`, `system-tray-overflow` e `action-center`, retornando a janela lida por `snapshot --surface <tipo>`. `quick-settings` retorna `INVALID_ARGS` indicando `action-center` |
| Interação por Ref | `click`, `right-click`, `type`, `set-value`, `clear`, `select`, `toggle`, `check`, `uncheck`, `expand`, `collapse`, `scroll`, `scroll-to` | Funciona, semântico em modo headless e `--headed`. `right-click` e `type` exigem `--headed` e retornam `POLICY_DENIED` em modo headless |
| Multiclique e Foco | `double-click`, `triple-click`, `focus` | Funciona somente com a flag global `--headed` |
| Teclado e Mouse | `press`, `hover`, `drag`, `mouse-click`, `mouse-move`, `mouse-wheel` | Funciona. Entradas que movem o cursor exigem `--headed`. Veja "Primeiro Contato" sobre `press --app` |
| Entrada Mantida | `key-down`, `key-up`, `mouse-down`, `mouse-up` | Falha de forma segura (*fails closed*) em todas as plataformas com `ACTION_NOT_SUPPORTED`. Em modo headless, `mouse-down` ou `mouse-up` retorna `POLICY_DENIED` primeiro |
| App e Janela | `launch`, `close-app`, `list-windows`, `list-apps`, `focus-window`, `resize-window`, `move-window`, `minimize`, `maximize`, `restore` | Funciona. Veja "Primeiro Contato" sobre o formato de nome aceito por `launch` |
| Monitores | `list-displays` | Funciona |
| Área de Transferência | `clipboard-get`, `clipboard-set`, `clipboard-clear` | Funciona; conteúdo de texto tipado e imagem |
| Espera (`wait`) | `wait` | Funciona para ms, `--element`, `--window`, `--text`, `--menu`, `--menu-closed`, `--event` e `--notification` |
| Notificações | `list-notifications`, `dismiss-notification`, `dismiss-all-notifications`, `notification-action` | Funciona sobre a Central de Ações (Action Center). Passe `--headed` quando a central estiver fechada |
| Overlay de Cursor | `cursor-overlay` | Funciona. `enable` retorna `data.rendered: true` somente após o renderizador confirmar pelo pipe. Veja [shell-and-overlay.md](./shell-and-overlay.md) |
| Sistema | `status`, `permissions`, `version`, `batch`, `skills`, `session`, `trace` | Funciona |

## Cuidados de Primeiro Contato

- **Coloque todas as referências entre aspas no PowerShell.** O PowerShell interpreta um `@token` sem aspas como seu operador de *splatting* e apaga o argumento antes que o binário o receba, fazendo `set-value @s8f3k2p9:e1 oi` falhar com `INVALID_ARGS`. Escreva `set-value '@s8f3k2p9:e1' oi`. No `cmd.exe` e no `bash` não é necessário usar aspas.
- **Uma janela atrás de outra pode ser controlada; uma janela minimizada não.** Todos os elementos de uma janela minimizada reportam `offscreen` e ações por referência falham. Execute `restore --app <imagem>` e tire um novo snapshot. Não use `focus-window` por reflexo, pois ele rouba o foco da janela ativa do usuário.
- **Não há diálogo de permissão do sistema.** `permissions` reporta `automation` como `not_required`. As fronteiras de elevação de privilégio (UIPI) são o único controle de acesso.
- **Aplicativos Chromium e Electron retornam árvores incompletas antes de estabilizarem (*settle*).** Passe um `--timeout-ms` maior para `snapshot` em vez de concluir prematuramente que a árvore está vazia.
- **Atalhos bloqueados.** `alt+f4`, `win+l`, `win+d`, `alt+tab`, `win+r`, `win+x`, `win+e`, `ctrl+shift+esc` e suas combinações adicionais de modificadores são recusados sem `--force`. Em combinações de teclas, `cmd` e `meta` correspondem à tecla Windows, portanto `meta+c` é um atalho do shell. Escreva `ctrl+c` para copiar.
- **`type` requer `--headed`.** Ele sintetiza teclas via `SendInput`, portanto um `type` estritamente headless retorna `POLICY_DENIED`. Use `set-value` ou passe `--headed`. Ele termina como `delivered_unverified` (`verification_scope: "unavailable"`) quando o campo não expõe seleção de texto legível via padrão Text, e pode verificar quando expõe: confirme com um novo `get`.
- **`press --app` envia para a fila de primeiro plano** sem direcionamento por processo em segundo plano. Um `press` headless para um aplicativo que não está em primeiro plano falha de forma segura. Um chamador não interativo (serviço, tarefa agendada, job de CI) recebe `delivered_unverified`.
- **`launch` aceita um caminho absoluto ou o nome do executável** dentro de `System32` ou do diretório do Windows, com ou sem `.exe` (`notepad` ou `notepad.exe`), e não um nome de exibição amigável. Use `list-apps` para localizar um aplicativo em execução.
- **Notificações:** `list-notifications` com a Central de Ações fechada requer `--headed`. Comandos de item único (`dismiss-notification` e `notification-action`) requerem `--headed` e `--expected-app` ou `--expected-title` para a entrada no `INDEX` informado.
- **Superfícies:** um menu aberto ou menu de contexto é a superfície `menu`. O Windows não expõe uma superfície `menubar` separada.
- **Comandos que abrem elementos visuais do shell assumem o primeiro plano.** O modo estritamente headless os recusa com `POLICY_DENIED` antes que qualquer coisa seja exibida.
- **Ações com estado executam uma única vez e verificam relendo o elemento.** `delivered_verified` significa que a releitura correspondeu ao esperado. `ACTION_FAILED` com `details.kind: "post_action_verification"` significa que a ação foi entregue, mas a releitura divergiu: leia `details.post_state` e **não** repita a ação. Um `set-value` que o próprio aplicativo reformata (ex.: máscara de data ou número) aparece como falha de verificação. Veja [troubleshooting.md](./troubleshooting.md).
- **Avisos de binário não assinado são esperados.** Veja [troubleshooting.md](./troubleshooting.md).

## O que Difere no Windows

- As ações por referência são chamadas semânticas de UI Automation tanto em modo headless quanto em `--headed`, exceto `right-click`, `double-click`, `triple-click`, `type` e `focus`, que são físicas ou tomam foco e exigem `--headed`.
- Uma referência só é resolvida quando era o único elemento na janela capturada pelo snapshot com seu `role`, ID nativo, `name` e `description`, e exatamente um elemento ao vivo continua correspondendo. A unicidade considera a janela inteira, e não apenas a árvore rasa apresentada por `--skeleton` ou `--max-depth`, de modo que um elemento gêmeo abaixo do corte ainda recusa a referência. Gêmeos idênticos, como vários botões `Excluir` iguais, são recusados com `AMBIGUOUS_TARGET` (`details.kind: identity_not_unique`) antes que qualquer comando chegue ao aplicativo; uma segunda correspondência ao vivo gera `saved_ref_ambiguous`, e um elemento removido gera `STALE_REF` (`saved_ref_absent`). Tire um novo snapshot após alterações em listas e use `--headed mouse-click --xy` quando precisar escolher entre dois controles idênticos.
- O overlay de cursor anima o deslocamento por ação apenas para ações semânticas em modo headless. Uma ação com `--headed` move o cursor real do sistema.

## Referências Adicionais do Windows

- [shell-and-overlay.md](./shell-and-overlay.md): consulte para `open-system-surface`, superfícies de bandeja e barra de tarefas, notificações, overlay de cursor, identidade de janelas hospedadas (UWP) e cobertura de detecção de menus.
- [permissions-and-elevation.md](./permissions-and-elevation.md): níveis de integridade, UIPI, combinações de teclas bloqueadas, processos protegidos e o lease de interação entre processos.
- [chromium-and-electron.md](./chromium-and-electron.md): tempo de estabilização (*settle*), problema de janelas cobertas, armadilha do provedor incorreto em WPF e conteúdo web sem nome.
- [troubleshooting.md](./troubleshooting.md): mapa de sintomas para causas, resultados de verificação de ações, salvamento de documento em modo headless e avisos de instalação.
