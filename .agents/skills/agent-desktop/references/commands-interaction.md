# Comandos de Interação

Comandos que alteram o estado da interface (UI). Execute `agent-desktop <comando> --help` para consultar todas as flags.

## Modo Headless vs. `--headed`

`--headed` é uma flag global (`agent-desktop --headed click '@s8f3k2p9:e5'`) e aplica-se a todas as entradas de um `batch`. Uma ação `--headed` pode focar primeiro a janela de origem exata, e ações de ponteiro exigem um ponto alvo verificado.

`press` é sempre entrada física de teclado. `hover`, `drag`, `mouse-move`, `mouse-click` e `mouse-wheel` são entradas físicas de cursor e exigem `--headed`. Coordenadas brutas (`--xy`) não carregam identidade de janela, portanto nunca focam um aplicativo automaticamente. `key-down`, `key-up`, `mouse-down` e `mouse-up` são reservados e nunca enviam entrada (retornam `ACTION_NOT_SUPPORTED`, ou `POLICY_DENIED` se chamados em modo headless). Use `press`, `mouse-click` ou `drag`.

Quais gestos possuem caminho headless:

| Comando | Suporta Headless? |
|---------|-------------------|
| `click`, `set-value`, `clear`, `select`, `check`, `uncheck`, `toggle`, `expand`, `collapse`, `scroll`, `scroll-to` | Sim, onde o elemento expõe a ação semântica correspondente (exceto `scroll` no Linux) |
| `type`, `right-click`, `focus` | Depende do SO. No Windows, `type`, `right-click` e `focus` exigem `--headed` (consulte [agent-desktop-windows.md](./agent-desktop-windows.md)) |
| `double-click`, `triple-click`, `hover`, `drag`, `mouse-*` | Não. Exigem sempre `--headed` |

Arrastar e soltar (*drag and drop*) nativo entre aplicativos diferentes pode não iniciar a partir de eventos sintéticos; funciona bem para arrastos dentro da mesma visualização e em conteúdos web.

## Lendo o Resultado da Ação

Uma ação bem-sucedida informa exatamente o que aconteceu, e não apenas que foi executada:

| Campo | Significado |
|-------|-------------|
| `data.steps` | Cada mecanismo tentado, em ordem: `label`, `outcome` (`attempted`, `skipped`, `succeeded`), `mechanism` (`semantic_api` ou `physical_synthetic`), `verified` |
| `data.disposition.delivery` | `delivered_verified` quando o efeito foi confirmado na releitura; `delivered_unverified` quando o app reportou sucesso sem mudança observável |
| `data.post_state` | O estado do elemento alvo após a ação, quando disponível |
| `data.surfaces` | Sobreposições (menus, diálogos/sheets, alertas) abertas após a estabilização da ação |

Ações com estado (`set-value`, `type`, `clear`, `check`, `uncheck`, `toggle`, `expand`, `collapse`) releem o estado após a execução. Uma contradição legível retorna `ACTION_FAILED` com `details.kind: "post_action_verification"`. Uma condição pós-ação ilegível não falha o comando: a ausência de evidência retorna sucesso com `delivered_unverified`, `details.verification_scope: "unavailable"` e `verification_reason: "insufficient_evidence"`.

- Campos de texto seguros (senhas) são ocultados: uma escrita entregue pode retornar `delivered_unverified` com `verification_reason: "secure_field"`.
- `set-value` e `type` verificam apenas o valor do elemento (`verification_scope: element_value`, `application_commit: not_verified`). Confirme efeitos em nível de documento com uma leitura independente.
- Se `data.surfaces` listar um `sheet`, `menu` ou `alert`, o aplicativo está aguardando interação nessa sobreposição. Use `find --surface sheet` (ou `menu`) e responda ao diálogo.

## Códigos de Erro

Códigos de saída do processo: `0` sucesso, `1` erro estruturado, `2` erro de argumentos. O objeto `error` pode conter `details`, `recovery` e `disposition`.

| Código | Significado | Como Recuperar |
|--------|-------------|----------------|
| `PERM_DENIED` | Permissão necessária do SO ausente ou bloqueio de elevação UIPI | Consulte o guia da plataforma ([agent-desktop-windows.md](./agent-desktop-windows.md)) |
| `ELEMENT_NOT_FOUND` | A referência não pôde ser encontrada na interface ao vivo | Tire um novo `snapshot` |
| `STALE_REF` | A referência não corresponde mais à interface atual | Tire um novo `snapshot` e use a nova referência |
| `AMBIGUOUS_TARGET` | Vários elementos ao vivo correspondem à identidade da referência, ou a unicidade não foi provada na captura | Atue em um controle único na janela; para gêmeos idênticos use `--headed mouse-click --xy` |
| `SNAPSHOT_NOT_FOUND` | ID do snapshot ausente, expirado ou de outra sessão | Tire um novo `snapshot` |
| `APP_NOT_FOUND` | Aplicativo não está em execução | Inicie-o com `launch` |
| `WINDOW_NOT_FOUND` | Nenhuma janela correspondente encontrada | Verifique o nome ou use `list-windows` |
| `ACTION_FAILED` | Ação rejeitada, bloqueada ou contradita pelo resultado | Leia `error.details`. O array `checks[]` informa qual verificação bloqueou. Após entrega, leia `disposition.retry` e `details.post_state` |
| `ACTION_NOT_SUPPORTED` | O elemento não suporta esta operação | Use outro comando (ex.: `set-value` ou `--headed type`) |
| `POLICY_DENIED` | Um caminho físico ou que toma foco foi bloqueado no modo headless | Adicione `--headed` se a entrada física for intencional. Atalhos perigosos exigem `--force` |
| `APP_UNRESPONSIVE` | O aplicativo parou de responder após uma mutação incerta | Tire um novo snapshot e aguarde a recuperação antes de tentar novamente |
| `TIMEOUT` | Condição de espera ou de acionabilidade não atingida no tempo limite | Leia `error.details.kind` |
| `INVALID_ARGS` | Argumentos inválidos, falta de aspas no `@ref` no PowerShell, ou tentativa de fechar processo protegido do sistema | Verifique a sintaxe |
| `PLATFORM_NOT_SUPPORTED` | O adaptador do SO não possui este método | Use outra abordagem |
| `NOTIFICATION_NOT_FOUND` | O índice ou assinatura da notificação não corresponde mais | Liste novamente com `list-notifications` |
| `INTERNAL` | Falha inesperada do sistema operacional | Leia `message`. Tente novamente uma vez somente se `disposition.retry` for `safe` |

Valores de `details.kind` em `TIMEOUT`:
- `actionability_timeout`: o alvo nunca se tornou acionável dentro do tempo limite.
- `wait_timeout`: uma condição do comando `wait` expirou (traz `predicate`, `timeout_ms`, `last_observed` ou `last_error`).
- `chain_deadline`: uma cadeia de ativação esgotou o tempo (traz `value_before`, `value_at_timeout`, `target`, `mutated`). Se `mutated: true`, releia o estado antes de repetir; se `mutated: false`, repetir diretamente é seguro.

## Acionabilidade (`Actionability`)

Antes de despachar uma ação por referência, o núcleo verifica o elemento alvo dentro de um orçamento de tempo definido por `--timeout-ms` (padrão `5000` ms). As verificações são: `visible`, `stable`, `enabled`, `supported_action`, `policy`, `editable` e `receives_events` (para entrega via ponteiro). Cada uma resulta em `pass`, `fail` ou `unknown`. O relatório completo vem em `error.details`: `{ "actionable": false, "checks": [ { "check", "status", "reason" } ] }`.

- Verificações transitórias (`visible`, `stable`, `enabled`, `receives_events`) são sondadas a cada ~100 ms até passarem ou esgotarem o tempo.
- Verificações terminais (`supported_action`, `policy`, `editable`) não se resolvem esperando e falham imediatamente com `ACTION_NOT_SUPPORTED` ou `POLICY_DENIED`.
- `receives_events` falha com `reason: "occluded by <role>"` e um objeto `occluder` (`{ role, name, bounds }`) quando outro elemento está cobrindo o alvo. Traga a janela para frente ou feche o elemento sobreposto antes de tentar novamente.
- Ações padrão por referência tentam primeiro rolar o elemento para a área visível (*scroll into view*). Se não houver ancestral rolável, retorna `ACTION_FAILED` com `details.kind: "scroll_into_view_unsupported"` e `retryable: false` — role o contêiner com `scroll`.

## Clique (`Click`)

```powershell
agent-desktop click '@s8f3k2p9:e5'
agent-desktop --headed double-click '@s8f3k2p9:e3'
agent-desktop --headed triple-click '@s8f3k2p9:e2'
agent-desktop --headed right-click '@s8f3k2p9:e5'
```

- `click`: é a ativação primária. Em modo headless usa a ação semântica exposta pelo elemento; com `--headed` clica fisicamente primeiro onde possível.
- `double-click` e `triple-click`: são gestos físicos e exigem `--headed`. Para coordenadas brutas, use `--headed mouse-click --xy X,Y --count 2` (ou `3`).
- `right-click`: abre o menu de contexto (requer `--headed` no Windows). Em seguida, execute `snapshot --surface menu`. Para caixas de combinação (*comboboxes*) e botões de menu, prefira `select`.

## Entrada de Texto (`Text Input`)

```powershell
agent-desktop --headed type '@s8f3k2p9:e2' "ola@exemplo.com"
agent-desktop --headed type '@s8f3k2p9:e2' "ola mundo" --interval-ms 60
agent-desktop set-value '@s8f3k2p9:e2' "novo valor"
"texto secreto" | agent-desktop set-value '@s8f3k2p9:e2' --stdin
agent-desktop clear '@s8f3k2p9:e2'
agent-desktop --headed focus '@s8f3k2p9:e2'
```

- `set-value`: escreve o valor diretamente pelo caminho semântico de acessibilidade. É muito mais rápido que `type` e funciona em modo headless no Windows, embora possa não disparar todos os eventos de teclado de máscaras dinâmicas. Use por padrão em campos de texto, áreas de texto e sliders.
- `type`: insere texto sintetizando teclas (requer `--headed` no Windows) e verifica o resultado quando o valor e a seleção são legíveis. O `--timeout-ms` padrão do `type` é `5000` mais `30` ms por caractere.
- `type --interval-ms N` (`1` a `2000`): digita uma tecla a cada `N` ms dentro de um único comando. Se o foco mudar no meio da digitação, a sequência para com erro para evitar digitar na janela errada.
- Use `--stdin` com `type` ou `set-value` para ler o texto a partir de um pipe sem expô-lo nos argumentos do processo (útil para senhas ou textos longos) e ocultando os campos `value` observados na saída JSON. Limites: 10.000 bytes para `type` e 128 KiB para `set-value`.
- `clear`: limpa o conteúdo do elemento.
- `focus`: define o foco de teclado no elemento sem clicar (requer `--headed` no Windows).

Para editores compartilhados (como células de planilhas), execute a sequência completa com um único agente: ativar a célula, tirar snapshot, mirar no editor aberto, escrever e confirmar.

## Seleção, Alternância e Expansão (`Selection, Toggle, Expand`)

```powershell
agent-desktop select '@s8f3k2p9:e4' "Opção B"
agent-desktop check '@s8f3k2p9:e6'
agent-desktop uncheck '@s8f3k2p9:e6'
agent-desktop toggle '@s8f3k2p9:e6'
agent-desktop expand '@s8f3k2p9:e7'
agent-desktop collapse '@s8f3k2p9:e7'
```

- `select`: escolhe uma opção pelo texto exibido em uma lista, dropdown ou combobox.
- `check` e `uncheck`: são idempotentes e verificam o estado final. **Prefira-os em vez de `toggle`.** Use `toggle` apenas quando o estado atual for desconhecido.
- `expand` e `collapse`: atuam em itens de árvore, menus expansíveis e acordeões, verificando o estado final.

## Rolagem (`Scroll`)

```powershell
agent-desktop scroll '@s8f3k2p9:e1' --direction down --amount 3
agent-desktop scroll-to '@s8f3k2p9:e8'
```

- `scroll`: move uma área de rolagem (`up`, `down`, `left`, `right`).
- `scroll-to`: traz um elemento referenciado para dentro da área visível.
- `mouse-wheel --x --y [--dx] [--dy]`: envia um evento bruto de roda do mouse em uma coordenada da tela (requer `--headed`). Útil para áreas customizadas como `<canvas>`.

## Teclado (`Keyboard`)

```powershell
agent-desktop press return
agent-desktop press ctrl+shift+z
agent-desktop press ctrl+s --app "Notepad" --wait-for "button:Salvar" --wait-timeout 5000
```

- Nomes de teclas: `return`, `escape`, `tab`, `space`, `delete`, `up`, `down`, `left`, `right`, `f1` a `f12`. Modificadores: `cmd`/`meta` (tecla Windows no Windows), `ctrl`, `alt`, `shift`, unidos com `+`.
- Uma letra maiúscula isolada adiciona Shift automaticamente (`press H` envia `shift+h`).
- `press` sempre reporta `delivered_unverified`, pois o envio da tecla não prova que o atalho concluiu sua função. Combine com `--wait-for` ou `--wait-for-gone` para aguardar o efeito esperado.
- Atalhos perigosos do sistema são bloqueados com `POLICY_DENIED` (use `--force` somente se tiver certeza).

## `--wait-for` e `--wait-for-gone`

Flags globais que sondam a árvore após a ação até que um seletor apareça (ou desapareça) e então retornam o envelope de snapshot atualizado:

```powershell
agent-desktop snapshot --app "Notepad" -w "button:OK"
agent-desktop click '@s8f3k2p9:e5' -w ":Salvo!"
agent-desktop click '@s8f3k2p9:e5' --wait-for-gone "progressindicator" --wait-timeout 5000
```

- O formato do seletor é `role:texto`, dividido no primeiro `:`. `"button"` filtra apenas por função; `":Salvo!"` filtra apenas por texto (busca em `name`, `value` e `description`).
- Funcionam em `snapshot`, `press` e em todas as ações por referência (`--wait-timeout` padrão é `30000` ms).

## Mouse

```powershell
agent-desktop --headed hover '@s8f3k2p9:e5'
agent-desktop --headed drag --from '@s8f3k2p9:e1' --to '@s8f3k2p9:e5'
agent-desktop --headed drag --from-xy 100,200 --to-xy 400,500 --drop-delay 800
agent-desktop --headed mouse-click --xy 500,300 --count 2
agent-desktop --headed mouse-move --xy 100,200
```

- `hover`: move o cursor até o centro do elemento ou coordenada `--xy`.
- `drag`: aceita referências, coordenadas ou uma combinação de ambos. O atraso padrão antes de soltar (`--drop-delay`) é de `500` ms; aumente para `800` a `1200` ms ao reordenar listas ou arrastar entre janelas.
- `mouse-click`: aceita `--button left|right|middle`, `--count` e `--modifiers`.

## Escolhendo o Comando Ideal

| Objetivo | Comando Principal | Alternativa (Fallback) |
|----------|-------------------|------------------------|
| Clicar em um botão | `click '@ref'` | `--headed mouse-click --xy X,Y` |
| Preencher um campo de texto | `set-value '@ref' "texto"` | `clear` seguido de `--headed type` |
| Definir um checkbox | `check` / `uncheck` | `toggle` quando o estado é desconhecido |
| Escolher opção em dropdown | `select '@ref' "Opção"` | abrir o menu e usar `snapshot --surface menu` |
| Abrir menu de contexto | `--headed right-click '@ref'` | `--headed mouse-click --button right` |
| Navegar entre campos | `press tab` | `--headed focus '@ref'` |
| Copiar texto de um campo | `get '@ref' --property value` | `press ctrl+c` seguido de `clipboard-get` |
| Encontrar item fora da tela | `scroll '@area'` e depois `find` | `scroll-to '@ref'` |
