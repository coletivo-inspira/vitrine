# Revisão do app (App Review) da AutoResposta

Estado: **não enviado**. Só enviar depois de: configuração da AutoResposta no console, rotas no ar em HTTPS, URLs de privacidade e termos publicadas, piloto interno com testadores e Verificação da empresa iniciada. Nunca tratar como aprovado sem a resposta da Meta; até lá, só testadores conectam.

## Permissões pedidas

| Permissão | Acesso | Para quê |
| --- | --- | --- |
| `instagram_basic` | Avançado | Identificar a conta profissional conectada (id, @usuário, nome) |
| `instagram_manage_messages` | Avançado | Receber o aviso de mensagem nova e enviar uma resposta com o endereço da vitrine |

Não pedir: Human Agent, comentários, publicação, insights, anúncios, `business_management`, `pages_show_list` (só se o contorno da limitação de webhooks for adotado, com nova decisão).

## Textos em inglês (para o formulário)

**App description**

> Vitrine Inspira lets small businesses publish a simple online storefront (menu, products or services). With the optional "Auto-reply" feature, a business owner connects their Instagram professional account and writes a short greeting. When a customer sends a new direct message, Vitrine replies once with the business's storefront link. The conversation then continues in the Instagram app with the business. Vitrine does not store message text, does not run chatbots and never sends unsolicited messages.

**instagram_manage_messages — how it is used**

> We subscribe the connected Instagram professional account to the `messages` webhook. When a customer sends a new message, we send exactly one text reply within the standard messaging window, containing the owner's greeting and the public storefront URL. Owners choose a minimum interval per customer (once, every 24 hours or every 7 days). Echoes, reads, reactions, edits and postbacks are ignored. We do not read or store message content, attachments or customer profiles; we keep only a keyed hash of the sender id to respect the interval. Owners can turn the reply off or disconnect at any time.

**instagram_basic — how it is used**

> We read the id, username and name of the Instagram professional account shared during login, to show the owner which account is connected and to address API calls to the right account.

**User benefit**

> Customers who ask "do you have a menu?" get the storefront link immediately, even outside business hours, and the business keeps answering personally in Instagram.

## Passos para o revisor

1. Abrir `https://painel.inspira.dev.br` e entrar com a conta de revisão (credenciais no campo seguro do formulário, nunca neste repositório).
2. Abrir a vitrine de teste "Pizzaria Exemplo" > aba **Canais** > **Resposta automática**.
3. Tocar em **Conectar Instagram**, entrar com a conta de teste do Instagram, escolher o portfólio e a conta e voltar ao painel.
4. Conferir a conta conectada, manter a mensagem padrão, escolher "No máximo uma vez a cada 24 horas", ligar **Responder automaticamente** e **Salvar**.
5. De outra conta do Instagram, mandar "Olá! Gostaria de conhecer o cardápio." para a conta conectada e ver a resposta com o link.
6. Desligar o interruptor, mandar outra mensagem e ver que nada é respondido.
7. Tocar em **Desconectar** e confirmar.

## Roteiro de gravação (screencast)

1. Login no painel (sem mostrar senhas).
2. Abrir a seção e mostrar os requisitos e as permissões explicadas.
3. Fluxo da Meta: escolha de portfólio e conta, tela de permissões com `instagram_basic` e `instagram_manage_messages`.
4. Volta ao painel: conta conectada, mensagem, endereço, frequência, prévia, ligar e salvar.
5. Celular com outra conta mandando mensagem; resposta automática chegando.
6. Segunda mensagem dentro de 24 h: sem nova resposta.
7. Desligar e mostrar que não responde; desconectar e mostrar o estado "Desconectado".
8. Página de privacidade com a seção da resposta automática e instruções de exclusão.

## Checklist antes do envio

- [ ] Ícone 1024×1024, categoria, e-mail comercial.
- [ ] Política de privacidade e termos publicados com os textos da AutoResposta.
- [ ] Callback de exclusão e desautorização cadastrados e testados.
- [ ] Conta de revisão no painel e conta de teste do Instagram funcionando.
- [ ] Verificação da empresa concluída ou em andamento.
- [ ] Vídeo seguindo o roteiro, sem dados pessoais reais além das contas de teste.
