# Permissões e Elevação de Privilégio

O Windows não possui um diálogo de permissão no estilo TCC (como no macOS) para UI Automation. O que controla o acesso é o **nível de integridade (integrity level)**: um agente rodando em integridade Média (*Medium*) pode observar e interagir com aplicativos de mesma integridade, e o sistema operacional bloqueia o envio de ações que cruzem essa fronteira para níveis superiores.

## Alvos de Mesma Integridade Não Exigem Concessão

- Leituras via UIA (`snapshot`, `find`, `get`, `is`, `screenshot`) e entradas em processos de mesma integridade funcionam a partir de qualquer terminal sem avisos ou diálogos de permissão.
- `agent-desktop permissions` testa o UIA ao vivo em vez de consultar um banco de políticas: `accessibility` reporta `granted` quando o UIA responde, `automation` reporta `not_required` e `screen_recording` reflete a disponibilidade de captura de tela.
- Não há diálogo `--request` para acionar no Windows; se `accessibility` reportar `denied`, a causa é uma fronteira de integridade ou política de sessão abaixo, e não uma caixa de seleção desmarcada.

## A Fronteira UIPI (User Interface Privilege Isolation)

O *User Interface Privilege Isolation* (UIPI) bloqueia entradas sintetizadas vindas de um processo de integridade inferior para um de integridade superior (ex.: de *Medium* para *High*, como um Bloco de Notas executado como Administrador):

- **Leituras cruzam a fronteira.** A partir do nível *Medium*, o UIA resolve nome, classe, tipo de controle, PID, limites (`bounds`) e contagem de nós de um alvo elevado da mesma forma que um chamador *High*, e leituras `WM_GETTEXT` funcionam normalmente. A observação nunca é recusada através da fronteira.
- **Escritas e ações não cruzam.** O adaptador compara os níveis de integridade dos tokens dos dois processos antes de sintetizar qualquer entrada, e um alvo estritamente mais elevado retorna `PERM_DENIED` cujo `platform_detail` informa `COM HRESULT 0x80070005 (E_ACCESSDENIED: Access is denied)`.
- **Solução:** execute o `agent-desktop` a partir de um terminal elevado ao mesmo nível do aplicativo alvo (Executar como Administrador), ou interaja apenas com elementos que não cruzem a fronteira.

### A Detecção é Feita pela Leitura do Token, Nunca pelo Retorno do `SendInput`

O valor de retorno de `SendInput` não comprova nada: ele reporta sucesso independentemente de os eventos terem chegado ao destino ou terem sido descartados pelo sistema. Somente a comparação de tokens acima, ou a releitura do efeito na interface, distingue uma ação entregue de uma silenciosamente descartada. Um alvo cujo nível de integridade não possa ser lido pelo processo não é presumido como igual ou inferior: a ação prossegue em modo *best-effort* e é julgada pela releitura de seu efeito.

## Ativação de Janela Cruza a Fronteira

`focus-window` funciona mesmo contra um alvo de integridade superior. `SetForegroundWindow` é controlado pela heurística de bloqueio de primeiro plano do Windows (entrada recente, `AllowSetForegroundWindow`), e não pelo nível de integridade. Quando o primeiro plano não pode ser confirmado antes de o tempo limite esgotar, um alvo estritamente superior retorna `PERM_DENIED` (indicando falha de ativação) e um alvo de mesma integridade retorna `ACTION_FAILED`.

## Combinações de Teclas Bloqueadas

O comando `press` recusa atalhos perigosos antes da síntese. Qualquer ordem de modificadores, apelido de tecla (`meta`/`cmd`/`super` mapeados para `win`) e superconjunto de modificadores é interceptado:

| Atalho Bloqueado | Motivo |
|------------------|--------|
| `alt+f4` | Fecha a janela ativa |
| `win+l` | Bloqueia a sessão do Windows |
| `win+d` | Mostra a área de trabalho (minimiza tudo) |
| `alt+tab` | Rouba o foco do primeiro plano durante a execução |
| `win+r` | Abre a janela Executar sobre o alvo |
| `win+x` | Abre o menu de Links Rápidos sobre o alvo |
| `win+e` | Abre o Explorador de Arquivos sobre o alvo |
| `ctrl+shift+esc` | Abre o Gerenciador de Tarefas sobre o alvo |

Superconjuntos como `alt+shift+tab` também são bloqueados. A flag `--force` ignora essa proteção quando realmente necessário. `ctrl+alt+delete` não está na lista porque o `SendInput` jamais consegue sintetizar a *Secure Attention Sequence* (SAS) do Windows.

## Processos Protegidos do Sistema

O comando `close-app` recusa fechar executáveis críticos da sessão e do shell (comparação exata e insensível a maiúsculas/minúsculas): `csrss.exe`, `wininit.exe`, `winlogon.exe`, `services.exe`, `lsass.exe`, `smss.exe`, `lsaiso.exe`, `dwm.exe` e `explorer.exe`. Outros nomes são fechados normalmente, incluindo nomes parecidos como `explorer++.exe`. Uma tentativa de fechar um processo protegido retorna `INVALID_ARGS`.

## Lease de Interação Entre Processos (Cross-Process Interaction Lease)

Operações interativas mantêm um arquivo de bloqueio (*lock*) exclusivo derivado do token do usuário, impedindo que dois processos concorrentes do `agent-desktop` misturem mudanças de foco, cliques e digitação na mesma área de trabalho. Um modo de herança de handle (`AGENT_DESKTOP_INTERACTION_LEASE_HANDLE`) permite que um processo pai repasse sua concessão para um processo filho após reverificar identidade e exclusividade. Se a aquisição do lease falhar, aguarde o término do outro processo; nunca tente burlar o bloqueio.

## Pipe de Controle do Overlay de Cursor

O overlay de cursor é um processo renderizador desacoplado controlado via *named pipe*.

**O que é protegido:**

- Clientes remotos são rejeitados (`PIPE_REJECT_REMOTE_CLIENTS`).
- Processos de outros usuários são recusados em ambas as direções: o SID do usuário do token de cada conexão deve coincidir.
- Antes de enviar um comando de controle, o cliente verifica se o executável do servidor do pipe se chama `agent-desktop` (insensível a maiúsculas/minúsculas, com ou sem `.exe`). Essa é uma verificação de nome de arquivo, não de assinatura digital. Uma divergência faz `enable` retornar `rendered: false`.
- Apenas um renderizador por sessão (`FILE_FLAG_FIRST_PIPE_INSTANCE`). Um segundo renderizador encerra antes de criar qualquer janela.

**O que não é protegido: outro processo do mesmo usuário na mesma máquina.** O pipe não possui descritor de segurança restritivo adicional, e seu nome deriva do diretório de estado (`state_root`), do ID da sessão e da geração do protocolo. Um processo rodando com a mesma conta de usuário pode:

- ocupar o nome do pipe primeiro, fazendo `enable` responder `rendered: false` enquanto estiver aberto (resultando em ausência de overlay, nunca em um overlay falso);
- conectar-se a um renderizador ativo e mover o cursor desenhado ou alterar o texto do cartão de rótulo.

O overlay tem finalidade exclusivamente visual/apresentacional. Ele nunca executa nem falha uma ação real e não trafega credenciais. Em máquinas compartilhadas onde terceiros executam processos sob a mesma conta de usuário, não confie no que o overlay desenha e mantenha-o desativado.
