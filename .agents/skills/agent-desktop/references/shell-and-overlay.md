# Superfícies do Shell, Notificações e Overlay de Cursor

Consulte este arquivo para abrir superfícies do shell do Windows, ler ou interagir com notificações, usar o overlay de cursor ou lidar com a identidade de janelas hospedadas (UWP) e detecção de menus.

## Superfícies do Shell (`Shell Surfaces`)

`open-system-surface --surface <tipo>` abre uma superfície do shell e retorna a identidade `w-<hwnd>` da janela apresentada. Tipos suportados no Windows: `start-menu`, `taskbar`, `system-tray`, `system-tray-overflow` e `action-center`. Leia a superfície com `snapshot --surface <tipo>`. O comando `snapshot --window-id` recusa esse handle com `WINDOW_NOT_FOUND`, pois o inventário normal de janelas exclui janelas do shell.

- **O comando assume o primeiro plano.** O modo estritamente headless o recusa com `POLICY_DENIED` antes de abrir qualquer elemento. Passe a flag global `--headed`. Se a superfície já estiver aberta, ela é retornada sem ser aberta novamente.
- **`snapshot --surface <tipo>` não precisa de `--app` e funciona em modo headless.** Uma superfície fechada retorna `WINDOW_NOT_FOUND` com uma sugestão indicando `open-system-surface`.
- **`quick-settings` retorna `INVALID_ARGS`** e indica `action-center`, onde ficam as ações rápidas no Windows.
- **`start-menu` corresponde ao que a tecla Windows abre.** Em versões anteriores ao Windows 11, pode ser uma sobreposição de busca cuja raiz contém um `SearchTextBox`, e não uma grade de blocos. Interaja com ele como uma superfície de busca.
- **Itens da bandeja do sistema (`system-tray`) usam os comandos genéricos.** Não existem comandos exclusivos para a bandeja no Windows. `snapshot --surface system-tray` retorna os itens promovidos da área de notificação (zero itens é um retorno válido se não houver ícones promovidos). `snapshot --surface taskbar` fornece referências para os botões da bandeja na barra de tarefas. `snapshot --surface system-tray-overflow` fornece referências para os itens ocultos no menu de estouro (*overflow*): abra o flyout primeiro com `open-system-surface --surface system-tray-overflow`, caso contrário o clique falhará na verificação de oclusão. Um clique em um item de `system-tray` retorna `delivered_unverified` com `retry: unsafe`, pois um clique sintetizado não consegue confirmar o que o aplicativo dono do ícone fez em resposta.

## Notificações

Os comandos de notificação leem e controlam a Central de Ações (*Action Center*) por meio de UI Automation. O `UserNotificationListener` do WinRT nunca é utilizado, portanto configurações de consentimento por máquina não causam falha. O leitor se baseia em marcos (`AutomationId`): `MainListView` quando há notificações presentes, uma estrutura de estado vazio quando não há nenhuma, e o botão superior `ClearAllButton`.

- **A Central de Ações precisa estar aberta para leitura.** `list-notifications` lê uma central já aberta em modo headless. Quando ela está fechada, o modo estritamente headless retorna `POLICY_DENIED` antes de abri-la, enquanto `--headed` a abre e restaura a área de trabalho depois. `dismiss-notification`, `dismiss-all-notifications` e `notification-action` sempre exigem `--headed`, e `wait --notification` recusa na primeira sondagem (*poll*) sob a mesma regra se não estiver com `--headed` (ou se a central não estiver aberta).
- **Uma central vazia lista zero entradas.** Uma central que não exiba nem a lista de notificações nem os marcos de estado vazio retorna `PLATFORM_NOT_SUPPORTED` com `platform_detail` informando o marco ausente. Uma árvore irreconhecível gera erro, nunca uma lista vazia falsa.
- **O índice não é a identidade única.** Toda mutação relê a central e compara a entrada naquele índice com `--expected-app` e `--expected-title`. Se não coincidir, retorna `NOTIFICATION_NOT_FOUND`. Um nome de botão de ação que a notificação não ofereça retorna `ACTION_NOT_SUPPORTED`.
- **Um descarte (`dismiss`) que não surte efeito falha explicitamente.** O shell pode aceitar o comando no `DismissButton` sem remover o item. Quando o alvo é a única notificação presente, o controle verificado de "limpar tudo" (`ClearAllButton`) é acionado. Caso contrário, a chamada retorna `ACTION_FAILED` (`delivered_unverified`). `dismiss-all-notifications` é avaliado em relação às entradas capturadas antes da limpeza, portanto notificações que chegarem durante a execução não são contadas como falha.
- **`wait --notification` abre e fecha a central a cada sondagem (*poll*).** Cada sondagem adota uma central que já esteja aberta e restaura o estado anterior ao final. Custo medido: ~1243 ms a ~1254 ms por sondagem, além de uma pausa de até 500 ms entre sondagens — dimensione `--timeout` considerando ambos. Uma notificação que apareça e seja fechada dentro de um único intervalo pode não ser detectada. Como um banner (*toast*) só entra na lista da central enquanto ela está aberta, *toasts* disparados entre sondagens podem não aparecer até que a central seja aberta. Para monitorar chegadas contínuas, mantenha a central aberta manualmente; as sondagens a adotarão sem fechá-la.
- **Esta saída contém dados sensíveis.** A superfície da área de notificação revela nomes de agentes em segundo plano (incluindo softwares de segurança e acesso remoto), e `list-notifications` retorna títulos e textos literalmente, sem redobrar ou ocultar conteúdo.

## Overlay de Cursor (`Cursor Overlay`)

`cursor-overlay enable` funciona no Windows: um processo renderizador desacoplado desenha um cursor puramente visual em uma janela transparente a cliques (*click-through*), sempre no topo (*topmost*) e que não rouba foco.

```powershell
$env:AGENT_DESKTOP_HOME = "$env:TEMP\ad-scratch"
$start = agent-desktop session start --cursor | ConvertFrom-Json
$env:AGENT_DESKTOP_SESSION = $start.data.session_id
agent-desktop cursor-overlay enable --label "Abrindo menu" --accent "#FF3B7B"
agent-desktop cursor-overlay disable
```

- **Inicie a sessão antes de tirar o snapshot.** O overlay exige uma sessão ativa, e um snapshot tirado fora dela cai no namespace global, onde uma ação com escopo de sessão não consegue enxergá-lo (`SNAPSHOT_NOT_FOUND`). Execute `session start`, `cursor-overlay enable`, `snapshot` e então execute as ações.
- **`data.rendered` é a confirmação do renderizador.** `enable` retorna `true` somente após o renderizador conectar ao pipe de controle da sessão e confirmar o comando. Retorna `false` quando nenhum renderizador pôde ser alcançado, iniciado ou ouvido a tempo. `disable` não traz o campo `rendered`. `session start --cursor` também ativa o overlay e retorna `cursor_overlay`.
- **Ações `--headed` pulam a animação de deslocamento.** Uma ação `--headed` move o cursor físico real do Windows, portanto o overlay não anima o trajeto nem o clique para ela (embora continue desenhando o cursor em repouso se estiver ativo).
- **Custo aproximado de 355 ms por ação.** Um `click` headless leva cerca de 427 ms sem o overlay e 782 ms com ele. Ativá-lo custa cerca de 50 ms uma única vez. Cem cliques com overlay adicionam cerca de 35 segundos ao fluxo.
- **Inicia no centro da área de trabalho do monitor principal**, e não sobre o aplicativo alvo. O primeiro quadro aparece logo após o retorno de `enable`.
- **Desenha acima da barra de tarefas e de outros elementos de topo do shell.**
- **Ignora a configuração "Mostrar animações no Windows".** Como o Windows Server desativa animações por padrão, o comando explícito `enable` funciona como confirmação direta (*opt-in*).
- **O rótulo (`label`) é uma pílula preta com texto branco em Segoe UI**, dimensionada conforme o texto. `--fill` e `--rim` colorem apenas o cursor, não o rótulo.
- **O rótulo só aparece quando há algo a informar.** `enable` sem `--label` exibe uma saudação inicial única (com `--image` não há saudação). Depois disso, apenas ações que carregam descrição desenham o rótulo. Cada `enable` e cada ação substituem o texto anterior.
- **Desaparece suavemente após 6 segundos sem instruções** e reaparece imediatamente no próximo comando.
- **O cursor de texto (*caret*) vem do padrão Text.** Após inserção de texto, o *caret* do agente posiciona-se onde o padrão Text do campo indica o ponto de inserção, desaparecendo quando o cursor parte para outro elemento. Campos sem padrão Text mantêm apenas o contorno do elemento.
- **Desenha em pixels físicos**, o mesmo espaço de coordenadas reportado em `bounds`, sem aplicar reescalonamento duplicado de DPI.
- **Objetos de Job (*Job Objects*) podem encerrar o overlay.** Runners de CI ou harnesses que usam `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` encerram o processo renderizador desacoplado quando o job termina. Isso não afeta a execução das ações.
- **Encerramento (*Teardown*).** `cursor-overlay disable` encerra o renderizador da sessão, assim como `session end`. Se a sessão terminar abruptamente, o renderizador se autoencerra em até 3000 ms.

## Identidade de Janelas Hospedadas (UWP)

Um aplicativo UWP hospedado em `ApplicationFrameHost` é reportado por meio de seu quadro (*frame*): `focused_window` e `list-windows` fornecem o handle do frame como `id` da janela (usado por todas as operações de janela), enquanto `app` e `pid` identificam o aplicativo real hospedado, lidos a partir de sua `Windows.UI.Core.CoreWindow`. Quando um aplicativo UWP entra em suspensão, ele descarta sua `CoreWindow`; até que seja retomado, a entrada aparece apenas como o host de frame e verificações de identidade contra o PID hospedado falham de forma segura.

## Cobertura de Detecção de Menus

O detector da superfície `menu` cobre menus Win32 clássicos, menus de contexto e dropdowns de barra de menus em WPF, além de menus de contexto DOM em aplicativos Chromium/Electron desenhados dentro da própria janela do app. Hosts WinUI 3 e MSIX não são avaliados por esse detector: para aplicativos fora dessas famílias, interprete "nenhum menu aberto" como "não detectado", e não como prova de que o menu está fechado.
