# Fluxos de Trabalho Comuns (Workflows)

Padrões práticos para automação de desktop em múltiplas etapas. Toda referência (`@ref`) vem da saída do snapshot mais recente. No PowerShell, lembre-se de sempre colocar as referências entre aspas simples (`'@s8f3k2p9:e1'`).

## 1. Configuração Inicial (First-Time Setup)

Verifique a plataforma e as permissões antes de iniciar qualquer automação:

```powershell
$env:AGENT_DESKTOP_HOME = "$pwd\.agent-desktop"
agent-desktop status
agent-desktop permissions
```

- **No Windows:** não há diálogo de permissão para aplicativos de mesma integridade. Para enviar entradas a um aplicativo executado como Administrador (elevado), o terminal também precisa estar elevado.
- **No macOS:** o terminal precisa das permissões de Acessibilidade (*Accessibility*) e Gravação de Tela (*Screen Recording*). Se `permissions` reportar `denied`, execute `agent-desktop permissions --guide`.
- **No Linux:** a sessão precisa de um barramento AT-SPI ativo e `status` deve reportar `accessibility: granted`.

## 2. Aplicativos Densos: Esqueleto, Aprofundar, Agir e Verificar

Use este padrão para aplicativos Electron e qualquer interface com mais de ~50 elementos interativos:

```powershell
agent-desktop snapshot --skeleton --app "Slack" -i --compact
# Exemplo de saída: group "Channels" @s8f3k2p9:e2 (children_count: 42)
agent-desktop snapshot --root '@s8f3k2p9:e2' -i --compact
agent-desktop click '@s8f3k2p9:e18'
agent-desktop snapshot --root '@s8f3k2p9:e2' -i --compact
```

- Aprofundar novamente (`--root`) em uma raiz substitui as referências daquela subárvore. As referências do esqueleto fora dela e de outras regiões continuam válidas.
- Elementos interativos que já estavam dentro da profundidade do esqueleto já possuem referências prontas para uso.
- Se você já souber a função (`role`) ou o nome exato do controle, pule o mapeamento e execute `find --role <role> --name "<nome>" --exact`.

## 3. Preencher um Formulário

```powershell
agent-desktop snapshot --app "System Settings" -i --compact
agent-desktop set-value '@s8f3k2p9:e3' "Meu Computador"
agent-desktop click '@s8f3k2p9:e8'
agent-desktop snapshot --app "System Settings" -i --compact
```

- Prefira `set-value` (semântico e rápido). Use `clear` seguido de `--headed type` apenas quando o campo exigir eventos reais de teclado (como buscas com autocompletar que só disparam ao digitar).
- Confira o resultado: `delivered_verified` confirma apenas que o controle recebeu o texto, não que o aplicativo o processou. Verifique o efeito na interface.
- Para avançar de um campo para outro sem buscar a referência de cada um, use `press tab` e `--headed type`.

## 4. Navegar em Menus

```powershell
# No Windows, expanda ou clique no item de menu superior e depois fotografe a superfície 'menu'
$arq = (agent-desktop find --app notepad.exe --role menuitem --name "Arquivo" --exact --first | ConvertFrom-Json).data.matches[0]
agent-desktop expand $arq.ref_id
agent-desktop wait --menu --app notepad.exe
agent-desktop snapshot --app notepad.exe --surface menu -i
agent-desktop click '@s8f3k2p9:e5'
```

- Para percorrer um menu passo a passo: acione o item da barra de menu, execute `wait --menu`, capture `snapshot --surface menu -i`, clique na opção desejada e aguarde com `wait --menu-closed`.
- Um `press` em modo headless nunca aciona um item de menu diretamente; localize o item e use `click`.

## 5. Caixas de Diálogo, Folhas Modais (Sheets) e Alertas

```powershell
agent-desktop wait --window "Salvar como" --app notepad.exe --timeout 5000
agent-desktop snapshot --app notepad.exe --surface sheet -i
agent-desktop set-value '@s8f3k2p9:e2' "meu-documento.txt"
agent-desktop click '@s8f3k2p9:e5'
agent-desktop snapshot --app notepad.exe -i
```

Tire o snapshot da superfície (`sheet`, `alert`, `popover`) ou da janela do diálogo, e nunca use `--skeleton` em uma superfície. Depois que o diálogo fechar, tire um novo snapshot da janela principal para obter referências atualizadas. Sempre que uma ação deixar `data.surfaces` preenchido, interaja primeiro com essa sobreposição.

## 6. Menu de Contexto (Clique Direito)

```powershell
agent-desktop --headed right-click '@s8f3k2p9:e3'
agent-desktop snapshot --app "Explorer" --surface menu -i
agent-desktop click '@s8f3k2p9:e7'
agent-desktop wait --menu-closed --app "Explorer" --timeout 2000
```

Se `right-click` retornar `APP_UNRESPONSIVE`, o menu modal pode ter acabado de abrir; verifique o estado da tela antes de tentar novamente. No Windows, `right-click` exige `--headed`.

## 7. Rolar a Tela para Encontrar um Item

```powershell
agent-desktop snapshot --skeleton --app "MeuApp" -i --compact
agent-desktop snapshot --root '@s8f3k2p9:e2' -i --compact
agent-desktop scroll '@s8f3k2p9:e8' --direction down --amount 5
agent-desktop find --app "MeuApp" --name "Item Alvo" --exact
```

Repita `scroll` e `find` até que `find` retorne a referência do item, e então execute `click`. Se a lista for virtualizada (só renderiza no DOM/UIA os itens visíveis na tela), role o contêiner com `scroll` em vez de usar `scroll-to`.

## 8. Aguardar Interface Assíncrona (`Wait for Async UI`)

```powershell
agent-desktop click '@s8f3k2p9:e5'
agent-desktop wait --text "Download concluído" --app "MeuApp" --timeout 30000
agent-desktop wait --element '@s8f3k2p9:e10' --predicate actionable --timeout 10000
```

Use a primitiva `wait` correspondente ao sinal esperado: texto (`--text`), elemento (`--element`), janela (`--window`), menu (`--menu`) ou evento (`--event`). Após `launch`, abertura de diálogo ou clique em menu, sempre aguarde com `wait` antes de tirar o snapshot.

## 9. Verificar Antes de Agir (`Check Before Act`)

```powershell
agent-desktop is '@s8f3k2p9:e6' --property checked
agent-desktop check '@s8f3k2p9:e6'
```

`check` e `uncheck` são idempotentes: use-os em vez de `toggle`. Se um `toggle` retornar `delivered_unverified`, consulte o estado com `is` antes de agir novamente.

## 10. Copiar Texto de um Elemento

Leia diretamente o valor: `agent-desktop get '@s8f3k2p9:e5' --property value`. Se o elemento não expuser seu texto via acessibilidade, foque-o, selecione tudo, copie com o atalho do sistema (`press ctrl+c`) e execute `clipboard-get`.

## 11. Arrastar e Soltar (`Drag and Drop`)

```powershell
agent-desktop --headed drag --from '@s8f3k2p9:e3' --to '@s8f3k2p9:e8'
agent-desktop --headed drag --from-xy 100,200 --to-xy 500,400 --drop-delay 800
```

`drag` é uma ação física e exige `--headed`. Confirme o resultado lendo o estado do destino após soltar, e não apenas pelo `ok: true` do comando.

## 12. Múltiplas Janelas

```powershell
agent-desktop list-windows --app "notepad"
agent-desktop focus-window --window-id w-5678
agent-desktop snapshot --app "notepad" --window-id w-5678 -i
```

## 13. Iniciar, Automatizar e Fechar

```powershell
agent-desktop launch calc.exe
agent-desktop snapshot --app "Calculadora" -i
agent-desktop close-app calc.exe
```

Verifique `data.window` no resultado de `launch`. Se estiver ausente e você precisar de uma janela, use `launch --activate` ou `wait --event window-opened`.

## 14. Aplicativo Chromium: Combinando Duas Ferramentas

Aplicativos como Slack, VS Code e Discord são baseados em Chromium. Você pode usar o `agent-desktop` para superfícies nativas e um cliente CDP para conteúdos web muito densos:

```powershell
agent-desktop close-app "Slack"
agent-desktop wait --event app-terminated --app "Slack" --timeout 10000
agent-desktop launch "C:\Caminho\Para\Slack.exe" --cdp 9222
agent-browser connect 9222
```

Como `--cdp` exige inicialização a frio, feche o aplicativo antes se já estiver rodando. Caso não haja cliente CDP instalado, use normalmente o fluxo de `--skeleton` e `--root` pelo caminho de acessibilidade do `agent-desktop`, que funciona sem reiniciar o aplicativo.

## 15. Notificações

```powershell
agent-desktop --headed list-notifications --app "Slack"
agent-desktop --headed notification-action 1 "Responder" --expected-app Slack --expected-title "#geral"
agent-desktop --headed dismiss-notification 1 --expected-app Slack
```

Liste primeiro e copie `--expected-app` / `--expected-title` da listagem para garantir que não clicará na notificação errada caso a fila seja reordenada.

## 16. Execução em Lote (`Batch`)

```powershell
agent-desktop batch '[
  {"command":"click","args":{"ref_id":"@s8f3k2p9:e1"}},
  {"command":"wait","args":{"ms":200}},
  {"command":"press","args":{"combo":"return"}}
]' --stop-on-error
```

Economiza inicializações de processo. Sempre passe `--stop-on-error` para parar caso algum passo intermediário falhe.

## 17. Rastrear uma Execução de Múltiplas Etapas (`Trace`)

```powershell
$env:AGENT_DESKTOP_HOME = "$pwd\.agent-desktop"
$inicio = agent-desktop session start --name "robo-faturas" | ConvertFrom-Json
$env:AGENT_DESKTOP_SESSION = $inicio.data.session_id
agent-desktop status
agent-desktop trace show --limit 50
agent-desktop session end $env:AGENT_DESKTOP_SESSION
```

## Antipadrões (O Que Evitar)

1. **Snapshots completos de aplicativos densos:** use `--skeleton` e `--root`, aprofundando apenas na região que mudou. Uma árvore inteira consome muito mais tokens e tempo.
2. **Usar coordenadas (`--xy`) quando existe uma referência (`@ref`):** ações semânticas são muito mais confiáveis e não falham se a janela mudar de posição.
3. **Pular `status` e `permissions`:** uma falta de permissão ou fronteira de sessão parece uma árvore vazia.
4. **Tirar snapshot da janela inteira enquanto um diálogo/menu está aberto:** tire o snapshot da superfície (`--surface menu` ou `sheet`).
5. **Scripts CDP improvisados:** nunca escreva WebSockets CDP crus manualmente; use a árvore de acessibilidade do `agent-desktop` ou um cliente CDP oficial.
6. **Múltiplos agentes escrevendo simultaneamente no mesmo editor:** clicar para editar, digitar e salvar não é atômico. Execute a sequência inteira em série.
