# Árvores Chromium e Electron

Aplicativos baseados em Chromium (Electron ou navegadores) são a causa mais comum da conclusão incorreta de que "a árvore está vazia" no Windows. A árvore é real: o renderizador a constrói após a conexão do primeiro cliente UIA.

## Exposição Não Requer Flag no Chromium Moderno

O Chromium 138 e versões posteriores expõem uma árvore UIA completa para qualquer cliente UIA sem necessidade da flag `--force-renderer-accessibility`. A árvore estabilizada (*settled*) é a mesma com ou sem a flag. Não reinicie um aplicativo em execução apenas para adicionar flags de acessibilidade; conecte-se ao que já está aberto.

## O Primeiro Contato é Raso; Aguarde a Estabilização (Settle)

A primeira leitura após a conexão inicia a construção da árvore de acessibilidade pelo renderizador, retornando cerca de um décimo terceiro da árvore final. Em uma inicialização a frio (*cold launch*), a estabilização leva de 10 a 25 segundos.

- Passe `--timeout-ms` para `snapshot` para que o orçamento de tempo cubra a estabilização. O adaptador conecta, aguarda a árvore estabilizar e percorre novamente dentro desse tempo limite.
- Uma árvore expandida fica visível para uma **nova** leitura. O cliente que iniciou a construção pode continuar recebendo apenas a casca inicial. Se um comando ainda reportar uma árvore rasa após o tempo de estabilização, execute um novo `snapshot` em vez de tentar novamente no mesmo processo.
- A flag do renderizador não elimina a necessidade de estabilização. Mesmo com ela, o primeiro contato é uma condição de corrida que retorna desde uma fração da árvore até quase tudo.

## Uma Árvore Rasa com Grupos na Fronteira é Efeito de Profundidade, Não de Estabilização

O Chromium aninha seus controles sob uma longa cadeia de grupos intermediários sem nome, de modo que uma árvore já estabilizada pode não exibir botões, campos de texto ou links na profundidade padrão (`--max-depth 10`). Os grupos na fronteira de profundidade trazem `children_count` e referências (`@ref`), permitindo aprofundar neles.

Quando um snapshot estabilizado possui referências mas nenhum controle operável visível, e seus nós de fronteira trazem `children_count`, não espere mais nem aumente `--timeout-ms`. Aumente `--max-depth` ou aprofunde em uma referência de fronteira com `snapshot --root <ref>`.

## Janelas Cobertas Mantêm a Contagem Inicial Indefinidamente

Uma janela Chromium totalmente coberta por outras janelas pode manter a contagem inicial de nós durante todo o período de estabilização. Não deixe outra janela sobreposta ao alvo durante a inicialização e estabilização. Se a contagem parecer congelada em um número pequeno, traga o aplicativo alvo para o primeiro plano ou minimize as janelas que o cobrem e tire um novo snapshot.

## WPF: Ler Cedo Demais Vincula o Provedor Incorreto

Um cliente UIA que lê uma janela WPF antes de seu *automation peer* existir vincula o provedor HWND genérico **permanentemente**. A janela passa então a reportar `ClassName HwndWrapper[...]` com zero filhos, e nenhuma nova tentativa dentro do mesmo processo consegue recuperá-la. Uma leitura feita alguns segundos após a inicialização obtém a árvore real.

Tire um novo snapshot em uma nova execução para que o adaptador resolva a partir de um novo handle. Após iniciar um aplicativo WPF, use `wait --event window-opened` ou um `wait` curto antes do primeiro snapshot.

## Conteúdo Web Sem Nome

Uma referência para conteúdo web **sem nome acessível** é identificada por seu `role` somado a qualquer `AutomationId` ou descrição que possua, e só é resolvida se essa combinação era única na janela no momento da captura e continuar sendo única ao vivo. Coordenadas (`bounds`) nunca contam como identidade. Uma referência para um dentre vários elementos sem nome que compartilham `role`, `AutomationId` e descrição retorna `AMBIGUOUS_TARGET`; nesse caso, use entrada por coordenadas em modo `--headed` a partir dos limites (`bounds`) de um elemento pai, ou um cliente CDP (`launch --cdp`).
