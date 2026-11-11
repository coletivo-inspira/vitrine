# Solução de Problemas (Troubleshooting)

Mapa de sintomas para causas no adaptador do Windows. Cada entrada descreve primeiro o sintoma observável.

## Árvore Vazia ou Muito Pequena

| Sintoma | Causa | Solução |
|---------|-------|---------|
| Aplicativo Chromium/Electron retorna muito menos nós do que a interface exibe | A primeira leitura ocorreu antes da árvore de acessibilidade do renderizador estabilizar (*settle*) | Execute `snapshot --timeout-ms 30000`. A estabilização a frio pode levar de 10 a 25 segundos. Veja [chromium-and-electron.md](./chromium-and-electron.md) |
| Contagem de nós congelada em um número pequeno, não importa quanto tempo espere | Outras janelas cobrem totalmente a janela alvo durante a estabilização | Traga o aplicativo alvo para o primeiro plano ou minimize as janelas que o cobrem e tire um novo snapshot |
| Aplicativo WPF: apenas um nó, `ClassName` como `HwndWrapper[...]`, zero filhos | Uma leitura feita antes de o *automation peer* existir vinculou permanentemente o provedor HWND genérico | Tire um novo snapshot em uma nova execução. Novas tentativas dentro do mesmo processo nunca recuperam a árvore |
| Interface renderizada de forma customizada (canvas/DirectX) ou jogo não retorna nada útil | Nenhuma exposição de acessibilidade implementada pelo app | Fora do escopo da árvore de acessibilidade. Use capturas de tela (`screenshot`) apenas para verificação visual |

## `PERM_DENIED` com Detalhe `E_ACCESSDENIED`

```json
"code": "PERM_DENIED",
"platform_detail": "COM HRESULT 0x80070005 (E_ACCESSDENIED: Access is denied)"
```

- **Causa:** o aplicativo alvo roda em um nível de integridade estritamente superior (tipicamente um aplicativo executado como Administrador sendo controlado a partir de um terminal com privilégio padrão *Medium*). O isolamento UIPI bloqueia entradas sintetizadas através dessa fronteira, embora as leituras continuem funcionando.
- **Solução:** execute seu terminal elevado ao mesmo nível do aplicativo alvo (Executar como Administrador). Veja [permissions-and-elevation.md](./permissions-and-elevation.md).

## Erro de COM Apartment

```json
"message": "... COM multithreaded apartment ..."
```

- **Causa:** o UI Automation exige que a thread chamadora pertença a um *COM apartment*. Como a CLI já ingressa automaticamente no *multithreaded apartment* (MTA), esse erro significa que o modelo de threads de um processo host que incorpora a biblioteca via FFI está em conflito.
- **Solução:** em um consumidor FFI, inicialize por meio dos pontos de entrada de *bootstrap* da biblioteca em vez de chamar o UIA a partir de threads arbitrárias. O defeito está no processo chamador, não no aplicativo alvo.

## Coordenadas Deslocadas por Escala de DPI

- **Sintoma:** ações por coordenadas em modo `--headed` (`mouse-click --xy`, pontos finais de `drag`) caem deslocadas em relação ao elemento visível em monitores com escala de DPI (>100%) ou múltiplos monitores.
- **Causa:** sem ciência de DPI por monitor (*per-monitor DPI awareness*), o Windows reporta coordenadas virtualizadas. O adaptador aplica `Per-Monitor V2` na inicialização, portanto todos os valores de `bounds` e `--xy` estão em pixels físicos.
  - Um processo host que já tenha definido um contexto de DPI incompatível é tolerado (`ERROR_ACCESS_DENIED` na segunda chamada significa que o contexto já foi travado).
  - Se a inicialização reportar `INTERNAL` com detalhe Win32 `SetProcessDpiAwarenessContext`, o processo host travou o contexto antes. Execute a partir de um terminal comum em vez de um host embutido.
  - Sempre prefira referências (`@ref`) a coordenadas brutas (`--xy`).

## O Binário Não Inicia

O `agent-desktop` é distribuído sem assinatura digital (*unsigned*) no Windows. Três mecanismos de controle do sistema tratam isso de maneiras distintas:

- **SmartScreen:** um download feito pelo navegador recebe a marca da web (*Mark-of-the-Web*), portanto clicar duas vezes nele pode exibir "O Windows protegeu o computador". Clique em *Mais informações* e depois em *Executar assim mesmo*. O pacote npm já inclui o binário empacotado sem anexar essa marca, evitando o bloqueio do SmartScreen.
- **Quarentena de Antivírus:** o Microsoft Defender ou outro antivírus pode colocar um executável novo não assinado em quarentena. Restaure-o ou adicione-o à lista de permissões após conferir o hash SHA-256 oficial publicado.
- **Controle Inteligente de Aplicativos (Smart App Control):** em instalações limpas do Windows 11 com o recurso ativo, ele bloqueia executáveis não assinados desconhecidos na criação do processo, inclusive pela linha de comando. Desative o *Smart App Control* ou utilize uma compilação assinada.

## `POLICY_DENIED` em Comandos de Superfície do Shell ou Notificações

- **Sintoma:** `open-system-surface`, `list-notifications`, `wait --notification` ou uma ação sobre notificação retorna `POLICY_DENIED` sem tocar na área de trabalho.
- **Causa:** o comando precisa abrir elementos visuais do shell e assumir o primeiro plano, o que o modo estritamente headless recusa por segurança.
- **Solução:** passe a flag global `--headed`, ou abra a superfície manualmente antes. `snapshot --surface <tipo>` lê em modo headless uma superfície que já esteja visível na tela, e `list-notifications` / `wait --notification` adotam uma Central de Ações que já esteja aberta.

## `wait --notification` Esgota o Tempo Limite Enquanto Banners (Toasts) São Exibidos

- **Causa:** a Central de Ações só coleta um *toast* na sua lista interna enquanto está aberta, e o comando `wait` abre e fecha a central a cada sondagem (*poll*); assim, um *toast* disparado entre duas sondagens pode ser perdido.
- **Solução:** mantenha a Central de Ações aberta durante a janela de espera para que as sondagens a adotem sem fechá-la, ou confirme a notificação com um `list-notifications` executado enquanto a central estiver aberta.

## Aplicativo UWP Hospedado Aparece como `ApplicationFrameHost`

- **Sintoma:** `focused_window` ou `list-windows` reporta um aplicativo UWP (como Configurações do Windows) sob a identidade do host de frame, ou uma identidade verificada contra o PID do aplicativo para de resolver.
- **Causa:** o aplicativo entrou em suspensão (*suspended*), o que descarta sua `CoreWindow` enquanto o frame externo permanece aberto. Veja "Identidade de Janelas Hospedadas (UWP)" em [shell-and-overlay.md](./shell-and-overlay.md).
- **Solução:** ative a janela do aplicativo para que ele saia da suspensão e liste novamente.

## `INTERNAL`: "private file parent is owned by a foreign principal"

```json
"code": "INTERNAL",
"message": "private file parent is owned by a foreign principal, not this process's token user, token owner, or an owner-eligible token group; if a different principal owns this path intentionally, relocate the state root with AGENT_DESKTOP_HOME instead of reusing it"
```

- **Causa:** um processo com um proprietário de token diferente criou o diretório de estado (`~/.agent-desktop`). No Windows, isso quase sempre ocorre quando um terminal elevado (Executar como Administrador) reutiliza um diretório criado por uma sessão não elevada, ou vice-versa. Essa verificação protege os mapas de referências e segmentos de trace contra substituição indevida.
- **Solução:** execute sempre no mesmo nível de elevação, ou defina `$env:AGENT_DESKTOP_HOME` apontando para um diretório absoluto exclusivo para aquela sessão/nível de elevação. Não altere o proprietário nem abra as permissões (ACL) da pasta existente para contornar o erro.

## Verificação Pós-Ação (`Action Verification`)

Toda ação que altera estado (`set-value`, `clear`, `type`, `toggle`, `check`, `uncheck`, `expand`, `collapse`) é executada **exatamente uma vez** e, em seguida, relê o estado ao vivo. O loop de verificação consulta a cada 50 ms até o limite de 400 ms e para assim que a pós-condição se confirma. Ele nunca reexecuta a ação automaticamente.

Os três resultados possíveis têm significados distintos:

1. **A releitura correspondeu (`delivered_verified`):** uma escrita de valor também traz `details.verification_scope: "element_value"` com `application_commit: "not_verified"` — o controle contém o seu valor, mas não é possível afirmar se a lógica interna do aplicativo já o salvou/processou.
2. **A releitura contradiz a solicitação (`ACTION_FAILED` com `details.kind: "post_action_verification"` e `details.post_state`):** **leia `post_state` antes de fazer qualquer outra coisa.** A ação foi entregue ao aplicativo, portanto `disposition.retry` é `unsafe`.
3. **A evidência não pôde ser observada (`delivered_unverified` com `details.verification_scope: "unavailable"`):** isso não é uma falha nem prova de que nada mudou. O elemento não expõe a propriedade UIA necessária para a confirmação (como `TogglePattern` ou `ExpandCollapsePattern`), ou a leitura falhou. **O comando `type` só é verificado quando o campo focado expõe uma seleção legível via padrão Text.** Sem isso, `type` retorna `delivered_unverified`; confirme o valor com um `get` se necessário.

**Um `set-value` reformatado pelo próprio aplicativo aparece como falha:** se o aplicativo remove espaços, aplica máscara de data/CPF/telefone ou normaliza um número (ex.: transforma `42` em `42,00`), a releitura difere do texto exato enviado e o envelope reporta `ACTION_FAILED` mesmo com a escrita tendo funcionado. Compare `details.post_state.value` com o que você enviou: se o valor estiver lá no formato próprio do aplicativo, a escrita foi bem-sucedida e você não deve repetir a ação.

## Salvando um Documento em Modo Headless (Sem Teclado)

Não existe um comando dedicado `save`. Salvar um arquivo é uma sequência de menu seguida de uma caixa de diálogo, e toda a cadeia é semântica — não requer `--headed` nem simulação de teclas. O mesmo padrão funciona para qualquer aplicativo cujo fluxo seja *Arquivo -> Salvar como*.

O script abaixo funciona diretamente contra um Bloco de Notas aberto (ajustando os nomes dos controles conforme o idioma do seu Windows, ex.: `"Arquivo"` / `"File"` e `"Salvar como..."` / `"Save As..."`):

```powershell
$out = "$env:TEMP\notepad-save-demo.txt"

agent-desktop restore --app notepad.exe                 # necessário apenas se estiver minimizado
$doc = (agent-desktop find --app notepad.exe --role textfield | ConvertFrom-Json).data.matches[0]
agent-desktop set-value $doc.ref_id "conteúdo do documento"

$file = (agent-desktop find --app notepad.exe --role menuitem --name "File" | ConvertFrom-Json).data.matches[0]
agent-desktop expand $file.ref_id
agent-desktop wait --menu --app notepad.exe             # o menu aberto é sua própria superfície
$menu = (agent-desktop snapshot --app notepad.exe --surface menu | ConvertFrom-Json).data.tree
agent-desktop click ($menu.children | Where-Object name -eq 'Save As...').ref_id

agent-desktop wait --window "Save As" --app notepad.exe # a caixa de diálogo é uma nova janela
$dialog = (agent-desktop list-windows --app notepad.exe | ConvertFrom-Json).data |
    Where-Object title -eq 'Save As'
$name = (agent-desktop find --name "File name" --window-id $dialog.id | ConvertFrom-Json).data.matches |
    Where-Object role -eq 'textfield'
agent-desktop set-value $name.ref_id $out               # o caminho completo vai no campo de nome do arquivo

$save = (agent-desktop find --role button --name "Save" --window-id $dialog.id | ConvertFrom-Json).data.matches[0]
agent-desktop click $save.ref_id
agent-desktop wait --window "notepad-save-demo - Notepad" --app notepad.exe
Get-Content $out
```

Três pontos importantes que costumam surpreender na primeira vez:

- **`find --name "File name"` (ou `"Nome:"`) retorna três correspondências:** um rótulo `statictext`, um `combobox` e o `textfield` dentro do combobox. Apenas o `textfield` aceita `set-value`, portanto filtre sempre por `role` além do nome.
- **Passar o caminho absoluto completo no campo de nome já seleciona o diretório.** Não é necessário navegar pelas pastas na árvore de arquivos.
- **O arquivo ainda não existe no disco no exato milissegundo em que o clique em Salvar retorna.** O diálogo do shell pode levar alguns segundos até gravar o arquivo e atualizar a janela. Aguarde a mudança de título com `wait --window` em vez de usar um `sleep` fixo curto.
