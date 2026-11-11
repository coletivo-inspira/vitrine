# Comandos de Observação

Comandos que leem o estado da interface (UI) e nunca o alteram. Execute `agent-desktop <comando> --help` para consultar todas as flags.

## `snapshot`

Captura a árvore de acessibilidade em formato JSON. Elementos interativos recebem referências qualificadas (`@s8f3k2p9:e1`) que embutem o ID do snapshot. Uma referência simples sem ID de snapshot (`@e1`) falha com `INVALID_ARGS`.

```powershell
agent-desktop snapshot --app "System Settings" -i --compact
agent-desktop snapshot --app "Notepad" --skeleton -i --compact
agent-desktop snapshot --root '@s8f3k2p9:e3' -i --compact
agent-desktop snapshot --app "Notepad" --surface menu -i
agent-desktop snapshot --app "Notepad" --window-id w-1234 -i
```

Formato da saída:

```json
{
  "ok": true,
  "command": "snapshot",
  "data": {
    "app": "Notepad",
    "window": { "id": "w-4521", "title": "Sem título - Bloco de Notas" },
    "ref_count": 14,
    "snapshot_id": "s8f3k2p9",
    "complete": true,
    "tree": {
      "role": "window",
      "name": "Sem título - Bloco de Notas",
      "children": [
        { "ref_id": "@s8f3k2p9:e1", "role": "button", "name": "Arquivo", "states": ["focused"] }
      ]
    }
  }
}
```

`data.window` é omitido quando o macOS lê um aplicativo sem janelas através de seu processo. No Windows e no Linux, um aplicativo sem janelas retorna `WINDOW_NOT_FOUND`.

Cada referência inclui o ID do snapshot ao qual pertence, de modo que ela continua resolvendo corretamente contra seu próprio snapshot mesmo quando você alterna leituras entre vários aplicativos ou janelas.

### Escolhendo o Escopo

- `-i --compact`: mantém apenas elementos interativos e descarta contêineres vazios. **Use ambos por padrão.**
- `-i`: mantém nós interativos e contêineres cortados, omitindo rótulos de texto estático (`statictext`). Para associar um botão repetido ao texto da sua linha, aprofunde no contêiner da linha com `--root` e **omita** `-i`. No Windows e no Linux isso identifica o texto da linha, mas um botão repetido identicamente em várias linhas continua sendo um gêmeo idêntico e sua referência será recusada ao tentar agir (veja **Reidentificação de Referências**).
- `--skeleton`: limita a profundidade a 3 níveis e adiciona `children_count` aos contêineres cortados. Cada ramo cortado expõe seu alvo mais profundo seguro para aprofundamento (`--root`), ou seu ancestral resolvível mais próximo.
- `--root <REF>`: inicia a captura a partir de uma referência obtida anteriormente. Aprofundar novamente na mesma raiz substitui as referências daquele aprofundamento anterior e de qualquer sub-aprofundamento abaixo dele. Referências fora da subárvore aprofundada continuam válidas, e as novas referências passam a fazer parte do mesmo `snapshot_id`. `--root` não pode ser combinado com `--surface` nem com `--wait-for`.
- `--max-depth` (padrão `10`): limita a profundidade máxima da árvore. Alcance subárvores mais profundas usando `--root`.
- `--include-bounds`: inclui coordenadas retangulares (`bounds`). Use apenas quando realmente precisar de coordenadas.
- Com `--app` e sem `--window-id`, `snapshot` e `find` selecionam a única janela visível do aplicativo ou, na falta dela, sua única janela focada; caso haja ambiguidade entre várias janelas, retornam `AMBIGUOUS_TARGET` listando as candidatas. Passe `--window-id` quando um aplicativo tiver mais de uma janela aberta.

### Árvores Parciais

O campo `data.complete` está presente em todo snapshot. Quando o orçamento de tempo de observação se esgota, o comando ainda retorna sucesso (`ok: true`), porém com `"complete": false`, `"truncated": true`, `"nodes_observed"` e a árvore parcial capturada até então. Cada nó cujos descendentes foram cortados traz `"subtree_truncated": true`. Sempre verifique `complete` em vez de esperar por um erro `TIMEOUT`. Aumente `--timeout-ms` (padrão `3000`) ou aprofunde com `--root` para ler o restante. Um aprofundamento com `--root` é tudo-ou-nada: uma leitura incompleta retorna `TIMEOUT`.

`"identity_unproven": true` significa que o snapshot não conseguiu ler a janela inteira a tempo de comprovar a unicidade de suas referências. No Windows e no Linux (e no macOS para elementos sem endereço nativo), essas referências falharão com `identity_not_unique`; portanto, tire um novo snapshot com um `--timeout-ms` maior antes de executar ações.

Um aplicativo Chromium ou Electron recém-aberto pode levar de 10 a 25 segundos para expor sua árvore web completa. Se um snapshot inicial vier quase vazio, aumente `--timeout-ms` e capture novamente.

### Quais Elementos Recebem Referências (`@ref`)

Um elemento recebe um `ref_id` quando seu `role` é interativo ou quando anuncia uma ação primária. Elementos `scrollarea` e `disclosure` recebem referências porque `scroll`, `expand` e `collapse` precisam delas. Textos estáticos e contêineres inertes permanecem na árvore sem `ref_id`. Conteúdos web costumam anunciar foco, clique direito e rolagem em quase todos os nós, mas isso por si só não gera referência; `find` retorna `bounds` para essas correspondências de contexto, permitindo interagir via `--xy` (`right-click`, `hover`, `drag`) ou rolando o contêiner pai.

### Reidentificação de Referências

Antes de executar qualquer ação, o comando reidentifica o elemento a partir da referência. No macOS a referência guarda o endereço nativo do objeto, permitindo distinguir gêmeos idênticos. No Windows e no Linux uma referência só resolve quando era o **único** elemento na janela capturada com aquela combinação de `role`, ID nativo, `name` e `description`, e exatamente um elemento ao vivo continua correspondendo. Valores (`value`) e coordenadas (`bounds`) nunca contam como identidade.

- `STALE_REF` (`details.kind: saved_ref_absent`): nenhum elemento ao vivo corresponde à identidade salva. Tire um novo snapshot.
- `AMBIGUOUS_TARGET` (`details.kind: saved_ref_ambiguous`): um elemento idêntico surgiu na tela, fazendo dois elementos ao vivo corresponderem. Se for `identity_not_unique`, a referência já não era única no momento da captura (ex.: botões gêmeos idênticos em uma lista, ou uma janela que não pôde ser lida por completo no tempo limite).
- `TIMEOUT` (`details.kind: resolution_identity_unknown`): a leitura ao vivo não respondeu a tempo; nada foi enviado e é seguro tentar novamente.

Fora do macOS, controles gêmeos idênticos não podem ser acionados por `@ref`: somente `--headed mouse-click --xy X,Y` pode clicar em um deles especificamente.

### Superfícies (`Surfaces`)

Superfícies são sobreposições (*overlays*): `menu`, `menubar`, `sheet`, `popover`, `alert`, `focused`, além das superfícies de shell específicas de cada sistema operacional. Consulte `supported_surfaces` no comando `status` antes de solicitar uma superfície. Uma superfície fechada retorna `WINDOW_NOT_FOUND`; abra superfícies do sistema com `open-system-surface`.

Sempre tire o snapshot da superfície (`--surface sheet`, `--surface menu`) quando um diálogo modal ou menu estiver aberto, em vez de tirar snapshot da janela inteira.

## `find`

Busca elementos por `role`, `name`, `value`, `text`, `description` ou ID nativo. Use-o diretamente quando já souber o que procura.

```powershell
agent-desktop find --app "Notepad" --role button --name "OK" --exact
agent-desktop find --root '@s8f3k2p9:e4' --role textfield --first
agent-desktop find --app "Notepad" --surface menu --name "Salvar" --exact --first
agent-desktop find --app "Notepad" --role button --count
```

- Restrinja o escopo sempre que possível: `--root` busca apenas na subárvore de uma referência; `--surface` busca apenas em uma sobreposição aberta. Ambos economizam tokens e tempo em comparação com um dump completo (não podem ser usados juntos).
- `--name` e `--text` fazem busca parcial (*fuzzy*). Adicione `--exact` para igualdade exata (insensível a maiúsculas/minúsculas). Use `--limit 2` antes de uma alteração quando precisar confirmar que existe apenas uma correspondência única.
- `--text` também encontra elementos ancestrais cujo texto interno contenha o termo buscado. Use `--name` para buscar diretamente no próprio nó.
- `--role` é insensível a maiúsculas/minúsculas; `textarea`, `textbox` e `searchfield` são normalizados para `textfield`. Quando um filtro de `role` não encontra nada, `data.roles_present` lista quais funções existem na árvore pesquisada.
- Elementos sem nome omitem `name`; seu conteúdo fica em `value`, portanto busque com `--value`.

Toda resposta (exceto `--count`) retorna o `snapshot_id` dono das referências encontradas:

```json
{
  "data": {
    "snapshot_id": "s8f3k2p9",
    "matches": [
      { "ref_id": "@s8f3k2p9:e5", "role": "button", "name": "OK", "states": ["enabled"] }
    ]
  }
}
```

Uma correspondência sem `ref_id` é uma correspondência de contexto (texto legível sem alvo de ação direta) e traz `bounds` quando disponível. Correspondências com `ref_id` não trazem `bounds` por padrão; leia-os com `get --property bounds`.

## `get`

Lê uma propriedade de uma referência: `text` (padrão), `value`, `title`, `bounds`, `role` ou `states`.

- `title`: é o nome acessível (responde "o que está escrito neste botão?").
- `text`: é o que uma pessoa lê. Retorna o conteúdo para `textfield`, `combobox`, `listbox`, `datefield` e `timefield`, e o nome nos demais casos (se um estiver vazio, retorna o outro). Para um checkbox, retorna seu rótulo, e não `1`.
- `value`: é o valor bruto independentemente do `role` (texto digitado, posição de um slider).
- Apenas `bounds` informa se a leitura foi ao vivo por meio de `data.live`. Quando `data.live` for `false`, o retângulo veio do cache do snapshot e pode estar desatualizado — verifique isso antes de passar coordenadas para `mouse-click`.

## `is`

Verifica uma condição booleana de um elemento: `visible` (padrão), `enabled`, `checked`, `focused`, `expanded` ou `selected`. Saída: `{ "ref", "property", "result" }`. Para `enabled`, um valor nativo desconhecido retorna `result: false` com `applicable: false` (significa desconhecido, não desabilitado).

## `screenshot`

```powershell
agent-desktop screenshot --app "Notepad" out.png
agent-desktop screenshot --screen 0 display.png
```

Sem caminho de arquivo, o PNG é retornado em base64 dentro de `data`. `--screen` recebe o índice do monitor obtido em `list-displays` (`0` é o monitor principal). Lembre-se: um screenshot é evidência visual para análise, não prova semântica de que uma ação funcionou.

## `list-displays`

Lista os monitores conectados como `{ id, bounds, is_primary, scale }`, com o monitor principal primeiro. Use o índice do array (e não o `id`) ao chamar `screenshot --screen`.

## `list-surfaces`

```powershell
agent-desktop list-surfaces --app "Notepad"
```

Lista as superfícies de sobreposição que um aplicativo apresenta no momento (os valores aceitos por `snapshot --surface`). Superfícies do shell pertencem ao sistema operacional e não aparecem aqui.

## `open-system-surface`

```powershell
agent-desktop --headed open-system-surface --surface action-center
```

Abre uma superfície do shell do sistema operacional (`start-menu`, `taskbar`, `system-tray`, `system-tray-overflow`, `action-center` no Windows). Como assume o primeiro plano no Windows e no Linux, exige `--headed` (em modo headless retorna `POLICY_DENIED`). Retorna o identificador de janela `w-<id>`, mas você deve ler a superfície usando `snapshot --surface <tipo>`.

## Aplicativos Chromium e Electron

O caminho via árvore de acessibilidade é o padrão e o único disponível para aplicativos que já estão em execução, bem como para menus nativos, caixas de diálogo de arquivo e gerenciamento de janelas. Para inspecionar conteúdos web muito densos de um aplicativo que você possa iniciar do zero, `launch --cdp` combinado a um cliente CDP pode ser mais rápido que percorrer esqueletos profundos. Veja [commands-system.md](./commands-system.md).
