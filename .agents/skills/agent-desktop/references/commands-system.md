# Comandos de Sistema

Ciclo de vida de aplicativos, janelas, notificações, área de transferência (*clipboard*), espera (`wait`), execução em lote (`batch`), sessões e saúde do sistema. Execute `agent-desktop <comando> --help` para consultar todas as flags.

## `launch`

```powershell
agent-desktop launch notepad.exe
agent-desktop launch notepad.exe --activate
agent-desktop launch "C:\Caminho\Para\MeuApp.exe" --arg "notas.txt" --env CHAVE=VALOR --no-attach
agent-desktop launch "C:\Caminho\Para\Obsidian.exe" --cdp
```

`launch` retorna assim que o processo está em execução. No Windows, passe um caminho absoluto ou o nome do executável presente em `System32` / diretório do Windows (com ou sem `.exe`, ex.: `notepad` ou `notepad.exe`). Por padrão, ele se conecta a uma instância já em execução. `--no-attach` exige uma nova instância: no Windows, retorna `ACTION_FAILED` se um aplicativo correspondente já estiver aberto. Para passar um `--arg` cujo valor comece com `-`, use `--arg=<valor>`.

O processo estar rodando e o aplicativo exibir uma janela são fatos distintos:

```json
{ "app": "notepad.exe", "pid": 611, "window": { "id": "w-110407", "title": "Sem título - Bloco de Notas", "visible": true } }
```

- `window` está presente quando o aplicativo já possui uma janela aberta, e omitido quando não possui. Sua ausência não é erro (`ok: true`).
- Use `--activate` para solicitar que o aplicativo apresente uma janela e aguardar por ela até `--timeout` (padrão `30000` ms). Como traz o aplicativo para frente, não é headless. Alternativamente, acione a janela e use `wait --event window-opened`.
- Um processo que encerra antes de exibir uma janela retorna `APP_UNRESPONSIVE`.

### Conteúdo Web de Aplicativos Chromium (`--cdp`)

Use `--cdp` para aplicativos Electron e Chromium cujo conteúdo web seja muito denso ou lento para percorrer via árvore de acessibilidade (Slack, VS Code, Discord, Obsidian, Notion). Ele inicia o aplicativo do zero com uma porta de depuração local (*loopback*), aguarda o endpoint responder e retorna os dados da conexão:

```json
{
  "app": "Obsidian",
  "pid": 4821,
  "cdp": {
    "port": 9229,
    "http_endpoint": "http://127.0.0.1:9229",
    "websocket_url": "ws://127.0.0.1:9229/devtools/browser/<id>",
    "product": "Chrome/142.0.7444.265"
  }
}
```

A porta CDP só existe para um processo iniciado do zero. `launch` nunca fecha um aplicativo em execução automaticamente para não perder dados do usuário. Se o alvo já estiver aberto, retorna `ACTION_FAILED` com `details.kind: "cdp_requires_fresh_launch"`. Execute `close-app`, confirme o encerramento e inicie novamente com `--cdp`.

| `details.kind` | Significado | Como Recuperar |
|----------------|-------------|----------------|
| `cdp_requires_fresh_launch` | O aplicativo já está aberto | Execute `close-app`, confirme o término e relance |
| `cdp_port_in_use` (`INVALID_ARGS`) | A porta informada já está em uso | Informe outra porta ou omita o número para escolha automática |
| `cdp_switch_conflict` (`INVALID_ARGS`) | `--arg` incluiu uma flag `--remote-debugging-*` ou `--remote-allow-origins` conflitante | Remova esse `--arg` |
| `cdp_endpoint_unavailable` | Nenhum endpoint respondeu dentro do prazo | O aplicativo continua aberto; use o caminho normal de acessibilidade |

mesmo com CDP conectado, continue usando o `agent-desktop` para: barra de menus nativa, diálogos de abrir/salvar arquivo, gerenciamento de janelas, notificações e capturas de tela.

## `close-app`

`close-app` fecha o aplicativo e todas as suas janelas. Não existe um comando `close-window` dedicado. Para fechar apenas uma dentre várias janelas, tire um snapshot daquele `--window-id`, clique na referência do seu botão Fechar (`Close`) e confirme com `wait --event window-closed`.

```powershell
agent-desktop close-app notepad.exe
agent-desktop close-app notepad.exe --force
```

O sucesso só é reportado após confirmar que o processo desapareceu. `--force` encerra o processo imediatamente. Processos críticos protegidos do sistema retornam `INVALID_ARGS` com `not_delivered`.

## `list-apps`

Lista os aplicativos gráficos (GUI) em execução como `{ name, pid, bundle_id, presentation }`. `--app` filtra por substring do nome. Aplicativos sem interface gráfica são excluídos.

## Gerenciamento de Janelas (`Windows`)

```powershell
agent-desktop list-windows --app "notepad"
agent-desktop focus-window --window-id w-4521
agent-desktop resize-window --app "notepad" --width 800 --height 600
agent-desktop move-window --app "notepad" --x 0 --y 0
agent-desktop minimize --app "notepad"
agent-desktop maximize --app "notepad"
agent-desktop restore --app "notepad"
```

- `list-windows` retorna `{ id, title, app_name, pid, bounds, is_focused, accessible }`. Use o identificador `w-<id>` com `--window-id` quando o aplicativo tiver mais de uma janela.
- `accessible: false` indica que comandos semânticos não alcançam aquela janela (ela ainda aceita screenshots e cliques por coordenada).
- `focus-window` exige ao menos um identificador (`--window-id` ou `--app`) e confirma se o SO passou a reportar a janela como focada.
- `restore` desfaz a minimização e devolve a janela à posição anterior.

## Notificações

Comandos: `list-notifications`, `dismiss-notification`, `dismiss-all-notifications`, `notification-action` e `wait --notification`. No Windows, operam sobre a Central de Ações (*Action Center*).

- Os títulos e corpos das notificações são retornados literalmente, sem censura. Trate a saída como informação potencialmente sensível.
- No Windows e no macOS, a listagem em modo headless só funciona se a Central de Ações já estiver aberta na tela; caso esteja fechada, exige `--headed`.
- Toda ação de alteração/descarte exige `--headed`. Ações em uma única notificação também exigem uma verificação de identidade obtida na listagem: `--expected-app` ou `--expected-title` (evitando clicar na notificação errada caso a lista mude de ordem).
- `list-notifications` retorna `{ index, app_name, title, body, actions }`, com índices baseados em `1`. Aceita filtros `--app`, `--text` e `--limit`.

## Área de Transferência (`Clipboard`)

```powershell
agent-desktop clipboard-get --format auto
agent-desktop clipboard-get --format image --out "$env:TEMP\clip.png"
agent-desktop clipboard-set "Olá Mundo"
"Texto via pipe" | agent-desktop clipboard-set --stdin
agent-desktop clipboard-set --image "$env:TEMP\a.png"
agent-desktop clipboard-set --file-url "C:\Temp\a.txt"
agent-desktop clipboard-clear
```

- Formatos de leitura: `text` (padrão), `auto` (arquivos, depois imagem, depois texto), `image` e `file-urls`.
- Use `clipboard-set --stdin` para enviar até 128 KiB via pipe sem expor o conteúdo nos argumentos do processo.

## `wait`

```powershell
agent-desktop wait 1000
agent-desktop wait --element '@s8f3k2p9:e5' --predicate actionable --action type --timeout 5000
agent-desktop wait --element '@s8f3k2p9:e5' --predicate value --value "Concluído"
agent-desktop wait --window "Salvar como" --app "notepad"
agent-desktop wait --text "Download concluído" --app "Chrome"
agent-desktop wait --menu --app "notepad"
agent-desktop wait --event window-opened --app "notepad"
```

Use sempre `wait` em vez de pausas fixas (`sleep`). O `--timeout` padrão é `30000` ms. Modos disponíveis:

- **Tempo:** `wait <ms>` aguarda a quantidade informada de milissegundos.
- **Elemento (`--element`):** `--predicate` pode ser `exists` (padrão), `enabled`, `visible`, `actionable` ou `value` (combinado com `--value`). `actionable` verifica se o elemento está pronto para `--action` (`click` por padrão, `type`, `set-value`, `clear`).
- **Janela (`--window`):** aguarda uma janela cujo título contenha o texto especificado (`--app` restringe ao aplicativo).
- **Texto (`--text`):** seleciona uma única janela do aplicativo e aguarda até que o texto apareça na árvore dela (`--count N` aguarda até que exatamente `N` nós correspondam). Se houver várias janelas elegíveis do mesmo app (como o documento e um diálogo aberto), retorna `AMBIGUOUS_TARGET`; para diálogos, use `wait --window <título> --app <app>`.
- **Menu (`--menu` / `--menu-closed`):** aguarda um menu abrir ou fechar.
- **Evento (`--event`):** aguarda um dos eventos `window-opened`, `window-closed`, `app-launched`, `app-terminated`, `focus-changed`, `surface-appeared` ou `surface-dismissed`, comparando o estado atual com a linha de base capturada no início da espera.

## `batch`

Executa múltiplos comandos em sequência dentro de um único processo:

```powershell
agent-desktop batch '[
  {"command":"click","args":{"ref_id":"@s8f3k2p9:e1"}},
  {"command":"wait","args":{"ms":200}},
  {"command":"set-value","args":{"ref_id":"@s8f3k2p9:e2","value":"olá"}}
]' --stop-on-error

agent-desktop batch '[
  {"command":"click","args":{"ref_id":"@s8f3k2p9:e1"}},
  {"command":"wait","args":{"event":"window-opened","app":"notepad","timeout":5000}}
]' --stop-on-error
```

O `batch` não é uma transação atômica. Passe `--stop-on-error` para interromper imediatamente na primeira falha. Use a chave `args` (não `params`). Os nomes das chaves seguem os nomes dos argumentos da CLI convertendo `-` para `_` (ex.: `ref_id`, `timeout_ms`, `interactive_only`).

## Sessões e Rastreamento (`Sessions and Traces`)

Uma sessão é um contêiner em disco sob `<state_root>/sessions/<id>/` que armazena um manifesto, os mapas de referências de snapshots e, quando o rastreamento (*tracing*) está ativo, um diretório `trace/`. O diretório raiz padrão é `~/.agent-desktop`, podendo ser realocado com a variável de ambiente `AGENT_DESKTOP_HOME` (deve ser um caminho absoluto).

```powershell
$env:AGENT_DESKTOP_HOME = "$pwd\.agent-desktop"
$sessao = (agent-desktop session start --name "meu-fluxo" | ConvertFrom-Json).data.session_id
$env:AGENT_DESKTOP_SESSION = $sessao
agent-desktop status
agent-desktop trace show --limit 50
agent-desktop trace export --out "$pwd\trace.html"
agent-desktop session end $env:AGENT_DESKTOP_SESSION
```

- `session start` cria a sessão e retorna `{ session_id, name, trace, created_at }`. Passe o ID nos comandos seguintes usando `--session <id>` ou definindo `$env:AGENT_DESKTOP_SESSION`.
- `trace show [--limit N] [--event PREFIX]` exibe a linha do tempo de eventos mesclada. `trace export [--out caminho.html]` gera um visualizador HTML autocontido. Os registros de trace ocultam automaticamente campos sensíveis (`text`, `value`, `name`, `title`, `url`) como `{ "redacted": true }`.
- `--screenshots` grava capturas PNG antes e depois das ações (sem censura; requer `trace` ativo).

### Overlay de Cursor e Cursores Multiagente

`cursor-overlay enable` desenha um cursor visual do agente e efeitos de clique na tela (apenas para apresentação). `session start --cursor` já o ativa desde o início da sessão.

Para múltiplos subagentes compartilhando a mesma sessão no Windows ou macOS:
1. Inicie com `agent-desktop session start --cursor --multi-agent`.
2. Passe o `session_id` retornado para cada subagente.
3. Cada subagente deve informar seu identificador único (`1` a `64` caracteres alfanuméricos, `-` ou `_`) via `--agent-id <id>` ou `$env:AGENT_DESKTOP_AGENT_ID` ao executar ações na interface. Cada ID recebe seu próprio cursor visual na tela, enquanto o lease de interação garante que as ações reais ocorram uma por vez sem conflito.

## `status`, `permissions`, `version` e `skills`

- `status`: retorna a saúde do adaptador, plataforma, relatório de permissões, `supported_surfaces`, último snapshot (`snapshot_id`, `ref_count`), `session_id`, `tracing` e `state_root`.
- `permissions`: retorna o estado (`granted`, `denied`, `not_required`, `unknown`) para `accessibility`, `screen_recording` e `automation`.
- `version`: retorna `{ version, target, os }`.
- `skills`: lista e extrai as documentações embutidas diretamente no binário (`agent-desktop skills list`, `agent-desktop skills get desktop`, `agent-desktop skills get platform`).
