---
titulo: "[Estudo de mercado] Central de canais: links diretos separados de integrações, com status e diagnóstico"
rotulos: estudo-mercado, painel, enhancement
depende: 02
---
## Contexto

O Manychat mistura login pelo Instagram e pela Meta, desabilita botões sem explicar e
revela limites depois do clique (estudo, seção 4). A diretriz 1 pede uma central de
canais transparente. Hoje WhatsApp, Instagram, Mila, domínio e (no futuro) webhook e
`vitrine.json` ficam espalhados entre Configurações e outras abas do editor.

## Escopo

- Seção "Canais" no editor da vitrine com dois grupos:
  - **Links diretos** (sem login de terceiros): WhatsApp (`wa.me`), modo Mila
    (ADR 0012), perfil do Instagram e outros links. Mostra o link final e um botão "Testar".
  - **Integrações**: domínio próprio (#44), `vitrine.json` (issue {{issue:10}}),
    webhook de pré-orçamento (issue {{issue:11}}) e, quando existir, Instagram
    conectado (#49). Cada uma com status (desligada, ativa, com erro, exige plano),
    titular, permissões pedidas e último diagnóstico ("último envio às 17:34: 200").
- Antes de ligar uma integração: pré-requisitos e plano necessário visíveis, sem clique.
- Mensagens de erro com o que fazer ("o DNS ainda não aponta para…"), nunca botão
  desabilitado sem motivo.
- Respeitar a tabela de ações por papel de `PB-05` (`viewer` só lê).

## Fora de escopo

- Implementar as integrações em si (cada uma tem sua issue).
- Conectar Instagram ([#49](https://github.com/coletivo-inspira/vitrine/issues/49)).

## Critérios de aceite

- [ ] Cada canal mostra estado e próximo passo em texto, sem depender de cor (WCAG 1.4.1).
- [ ] Integração que exige plano mostra o plano antes de qualquer clique.
- [ ] `viewer` vê a central sem botões de alteração (teste por papel).
- [ ] "Testar" do WhatsApp abre o link em nova aba com aviso, sem enviar mensagem.
- [ ] Em 375 px, nenhum controle abaixo de 44 px (`PB-14`).

## Dependências

- {{issue:02}} `02-direitos-por-plano.md`.
- Desejável: {{issue:10}} e {{issue:11}} para os status reais. Auditoria: `PB-05`, `PB-14`.

## Referências

- Estudo: [seções 4 e 7 (diretriz 1)](../../market-study-2026.md#7-diretrizes-do-painel).
- ADR 0012, `docs/instagram/conectar-por-vitrine.md`.
