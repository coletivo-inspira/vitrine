---
titulo: "[Estudo de mercado] Pausar vitrine, desconectar domínio e arquivar com resumo do impacto"
rotulos: estudo-mercado, painel, enhancement
depende:
---
## Contexto

No Manychat, excluir o Instagram apaga assinantes sem confirmação proporcional
(estudo, seção 4). A diretriz 3 pede ações críticas reversíveis. Hoje o painel não
tem como tirar uma vitrine do ar sem apagar, nem arquivar; desconectar domínio existe
na API de domínios (#44) sem resumo do impacto. O tema `TT-12` da auditoria já prevê
um diálogo padronizado (`PB-12`, `PB-20`).

## Escopo

- **Pausar vitrine** (dono ou admin): a vitrine pública responde uma página "Esta
  vitrine está pausada" com `503` e `noindex`; rascunho, publicações e Insights ficam
  intactos; "Retomar" volta a publicação anterior sem republicar.
- **Desconectar domínio**: resumo antes de confirmar ("o endereço X deixa de abrir a
  vitrine; ela continua em `vitrine.inspira.dev.br/<endereço>`; o nome fica em
  quarentena"), reaproveitando a API de #44.
- **Arquivar** (só dono): pausa, some da lista principal (filtro "Arquivadas") e
  libera a vaga de vitrine do plano; restaurável por 90 dias. Excluir de vez só a
  partir de uma vitrine arquivada, digitando o endereço para confirmar.
- Usar o diálogo padronizado de `PB-12`: o que muda, quantos itens, "Confirmar".
- Toda ação grava em `audit_logs`; o cache da borda é invalidado na pausa.

## Fora de escopo

- Suspensão por falta de pagamento (issue {{issue:04}}), que usa o mesmo mecanismo de
  pausa só para recursos pagos.

## Critérios de aceite

- [ ] Vitrine pausada responde `503` com `X-Robots-Tag: noindex` em até 5 minutos
      (cache) e a contagem de `drafts` e `publications` não muda.
- [ ] "Retomar" serve de novo o mesmo `artifact_hash` de antes da pausa.
- [ ] `editor` e `viewer` não veem Pausar nem Arquivar; a API responde `403` (teste por papel).
- [ ] Excluir só aparece para vitrine arquivada e exige digitar o endereço.
- [ ] Vitrine arquivada não conta no limite de vitrines do plano.
- [ ] Cada ação aparece em `audit_logs`.

## Dependências

Nenhuma dentro deste backlog. Auditoria: `PB-12` (diálogo padronizado) antes.
Externa: [#44](https://github.com/coletivo-inspira/vitrine/issues/44) para desconectar domínio.

## Referências

- Estudo: [seções 4 e 7 (diretriz 3)](../../market-study-2026.md#7-diretrizes-do-painel).
- ADR 0008 (cache), ADR 0009 (versões publicadas).
