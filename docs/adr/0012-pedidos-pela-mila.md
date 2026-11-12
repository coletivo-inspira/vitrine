---
status: accepted
---
# Pedidos pela Mila sem expor o WhatsApp do dono

Data: 2026-11-12. Decidido pelo agente conforme a preferência do projeto de não devolver perguntas em aberto ao Lino; revisável por ele.

## Contexto

Até aqui o telefone comercial do dono ia para o artefato público da vitrine (`menu.json`, HTML e links `wa.me`), com ciência do proprietário. Alguns donos não querem que o número pessoal apareça na internet. A Mila já é o atendimento da equipe Inspira no WhatsApp (`content/contact.json`, `+55 31 3189-0669`), com ilustração e cartão em `/orcamento/`, e o fluxo atual é "a Mila faz a triagem, o Lino assume".

A pergunta em aberto era se a Mila é pessoa ou robô.

## Opções consideradas

1. **Robô na API oficial do WhatsApp (Cloud API da Meta).** O robô recebe a mensagem do cliente e repassa sozinho para o dono. A resposta dentro da janela de 24 horas é gratuita, mas o repasse para o dono é uma mensagem iniciada pela empresa fora dessa janela. Ela exige um modelo aprovado e é cobrada por mensagem, conforme a tabela da Meta. Também exige verificação da empresa na Meta, registrar o número na plataforma oficial e um webhook sempre disponível. Isso fere o custo zero (ADR 0005).
2. **Robô não oficial (automação do WhatsApp Web ou do aplicativo).** Gratuito, mas viola os termos do WhatsApp e arrisca o banimento do número da equipe. Descartado.
3. **Mila como pessoa da equipe, com apoio do painel.** A Mila atende no aplicativo WhatsApp Business (gratuito) com o número que já existe. Para saber de quem é o pedido, ela usa um código impresso na mensagem e consulta o painel, que monta o repasse.

## Decisão

Adotamos a **opção 3**. A Mila é uma pessoa: a assistente da equipe Vitrine Inspira.

1. **Chave no editor.** Em Configurações, abaixo do WhatsApp do negócio, a chave "Receber pedidos pela Mila (meu número não aparece na vitrine)" grava `orderRelay: "mila"` no rascunho. Sem a chave, ou com `"direct"`, nada muda. O número do dono continua obrigatório no rascunho, porque é para ele que a Mila repassa.
2. **Projeção pública.** Com a chave ligada, `projectPublicStorefrontMenu` troca o `whatsapp` do artefato pelo da Mila e acrescenta `orderRelay: { via: "mila", code }`. `assertNoPrivateLeakage` recusa um artefato com `orderRelay` cujo `whatsapp` não seja o da Mila, ou cujo código não corresponda ao slug. O número do dono não aparece em `menu.json`, nas versões imutáveis, no HTML, na prévia nem nos links.
3. **Código da vitrine.** `#VI-<até 6 letras do slug>-<4 caracteres>`, por exemplo `#VI-PIZZAR-7F3K`. Os 4 caracteres vêm de um hash (FNV-1a de 32 bits, em base32 Crockford) do slug. É gerado no servidor na publicação, é estável, não depende do telefone e não precisa de coluna nova. A mesma função (`web/assets/mila-relay.mjs`) roda no editor, então a prévia mostra o mesmo código. Duas vitrines só repetem o código se tiverem os mesmos 6 primeiros caracteres no slug e coincidirem num hash de 20 bits. Para esse caso raro, a consulta devolve todas as vitrines encontradas, e a mensagem também traz o nome do negócio.
4. **Mensagem do cliente.** Começa com `#CÓDIGO · Pedido para <Nome do negócio>`, uma linha em branco e o pedido normal, tanto no carrinho em etapas quanto nos links por item. A vitrine avisa que o pedido vai para a Mila, que repassa ao negócio (transparência para o cliente, LGPD).
5. **Como a Mila descobre o dono.** Em "Administração da plataforma › Pedidos pela Mila", a Mila cola a mensagem recebida e, se quiser, o WhatsApp do cliente. O painel extrai o código, chama `GET /api/admin/mila-relay?code=…` (só `platform_admin`, `cache-control: no-store`) e mostra a vitrine, o número do dono e o botão "Repassar ao dono no WhatsApp", com a mensagem pronta. Nada do que ela cola é enviado ao servidor além do código, e nada é salvo.
6. **Banco.** A migração `20261112190500_mila_order_relay_lookup.sql` cria `public.lookup_mila_relay(code)`, `security definer`, que exige `private.is_platform_admin()`, valida o formato, procura a publicação ativa com esse código e devolve slug, nome e o WhatsApp do rascunho (ou do perfil do dono). Cada consulta grava `mila_relay_lookup` na trilha de auditoria da vitrine. `anon` não executa a função.

## Consequências

- Custo zero: nenhuma API paga e nenhum serviço novo. O limite passa a ser a atenção humana. Com o piloto de até 10 vitrines (ADR 0006), cabe. Se o volume crescer, revisitar a opção 1 com o custo por mensagem em mãos.
- O repasse não é instantâneo nem garantido: depende de uma pessoa. O editor avisa que pode levar alguns minutos. Não há SLA (constituição, princípio IV).
- O dono passa a ver o contato do cliente quando a Mila repassa. A partir daí, a conversa pode seguir direto entre os dois. A proteção vale para a vitrine pública (raspagem e spam), não para quem já fez um pedido.
- Só contas `platform_admin` usam a consulta. Uma conta `support_operator` com acesso só a ela fica para depois.
- **Ação humana:** aplicar a migração no Supabase de produção (SQL Editor). Até lá, a vitrine com a chave ligada já esconde o número, mas a consulta do painel responde com erro.
- A vitrine só muda depois de uma nova publicação. Ligar ou desligar a chave não altera a versão que já está no ar.
