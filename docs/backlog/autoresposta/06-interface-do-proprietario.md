---
titulo: "[AutoResposta 06] Interface do proprietário: Canais > Resposta automática"
rotulos: autoresposta, enhancement, painel
depende: 02, 05
---
**Épico**: {{issue:00}} · **Prioridade**: P1 · **Complexidade**: M · **Tipo**: produto + técnico

## Contexto

Pessoa sem conhecimento técnico precisa conectar, configurar, conferir a prévia e ligar.

## Objetivo

Seção na aba Canais com os estados desconectado, conectado, reconexão necessária, configuração e avisos.

## Escopo

`web/portal/auto-reply-panel.mjs` e `.css`; avisos do retorno da Meta; contador; prévia; frequência; desconectar com confirmação; papéis.

## Fora do escopo

Foto do perfil (CSP `img-src 'self'`); tela de administração (issue 07).

## Requisitos

US1, US2, US4; DESIGN.md (Portal); alvos de 44 px; tema escuro; sem jargão.

## Critérios de aceite

- [x] Testes de módulo (`test/auto-reply-panel.test.mjs`).
- [x] Capturas locais 1280 e 375 px (claro e escuro) com dados simulados.
- [ ] Teste com uma pessoa proprietária real (SC-001: até 3 minutos).
- [ ] Revisão de acessibilidade com leitor de tela.

## Dependências

{{issue:02}}, {{issue:05}}.

## Riscos

Termos da Meta (portfólio empresarial) confundem; reforçar ajuda.

## Cenários de teste

`test/auto-reply-panel.test.mjs`.

## Evidências para conclusão

Capturas em staging e registro do teste de usabilidade.

## Referências

`specs/019-autoresposta/spec.md` (US1, US2, US4).
