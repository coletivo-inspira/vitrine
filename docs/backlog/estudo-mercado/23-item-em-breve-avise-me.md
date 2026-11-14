---
titulo: "[Estudo de mercado] Item \"Em breve\" com \"Avise-me pelo WhatsApp\""
rotulos: estudo-mercado, vitrine-publica, referencia-laurapires, enhancement
depende: 20
---
## Contexto

Hoje um item inativo some da publicação (`available` é campo privado e não entra no
manifesto). Para serviços com turma, agenda ou estoque sazonal, sumir perde o link
já divulgado e a demanda.

Na referência, a turma encerrada continua no ar como "fora de estoque" e chama para
a lista de interesse. Aqui o interesse segue pelo WhatsApp, sem guardar contatos.

## Escopo

- Novo estado público por item, `availability`: `available` (padrão) ou `soon`. O
  estado privado de item inativo continua escondendo o item.
- Item `soon` aparece na grade e na página do item (issue {{issue:20}}) com o selo
  "Em breve" (ou um texto do dono de até 24 caracteres, como "Próxima turma em
  março") e sem controle de seleção.
- "Avise-me pelo WhatsApp" abre `wa.me` com "Olá! Quero ser avisado(a) quando <item>
  estiver disponível." (com o número e o código da Mila quando o modo Mila estiver
  ligado, ADR 0012).
- Editor: seletor "Disponível / Em breve / Oculto" no item, no lugar do liga/desliga
  atual, sem perder dados. Usa o controle único de visibilidade previsto em `PB-20`
  (`UX-66-012`), sem criar outro.
- Itens `soon` não entram no total nem na mensagem do pedido.
- A contagem de cliques em "Avise-me" é a métrica agregada `notify_click` da issue
  {{issue:09}}, sem tabela própria.

## Fora de escopo

- Guardar telefone ou e-mail de interessados; aviso automático quando o item voltar.
- Contagem de vagas.

## Critérios de aceite

- [ ] Item `soon` aparece com selo e sem quantidade; item oculto não aparece.
- [ ] O `href` de "Avise-me" tem o nome do item; com o modo Mila, o número da Mila e
      o código da vitrine.
- [ ] Item `soon` não entra na seleção nem por `sessionStorage` manipulado.
- [ ] `availability` está nas chaves públicas permitidas e `available` continua
      bloqueado em `assertNoPrivateLeakage`.
- [ ] Rascunhos antigos migram para "Disponível" ou "Oculto" sem perda.
- [ ] Nenhum dado pessoal vai ao servidor ao clicar em "Avise-me".

## Dependências

- {{issue:20}} `20-pagina-do-item.md` (recomendado: o endereço do item continua vivo).
- Para a contagem: {{issue:09}} `09-insights-por-origem.md`. Auditoria: `PB-20`.

## Referências

- [Referência laurapires.com](../../referencia-laurapires.md): seções 2 (Página de
  serviço/produto), 3, 6.6 e decisão 7.
