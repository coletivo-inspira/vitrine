# Quickstart: validar o convite de demonstração

Roteiro para conferir a funcionalidade **depois** de implementada. Nada disto existe ainda na `main`; esta especificação só planeja.

## Testes automáticos

```bash
npm test
```

Precisam passar, além da suíte atual:

- `test/database/site-invitations.test.mjs` (PGlite: permissões, corrida no aceite, cortesia e direitos);
- `test/demo-invitations.test.mjs` (rotas do operador);
- `test/invitation-flow.test.mjs` (página do convite, aceite e recusa);
- `test/team-invitations.test.mjs` (aba Equipe e papéis);
- `test/linktree-import.test.mjs` e `test/database/linktree-demo.test.mjs` sem mudança de comportamento, exceto o `growth_operator` passar a importar.

## Roteiro manual (Supabase de teste e `npm run preview`)

1. Como `platform_admin`, em "Administração da plataforma > Operadores", conceder `growth_operator` a uma segunda conta.
2. Com essa conta, em "Demonstrações", criar "Salão Exemplo" (`salao-exemplo`, modelo de serviços) e importar 12 serviços com `web/portal/modelo-servicos.csv` preenchido.
3. Conferir que `/salao-exemplo` responde `404` e que "Publicar" não aparece.
4. Gerar o convite, copiar o link e montar o `wa.me` com o número de teste `5511999999999`; conferir o texto.
5. Abrir o link numa janela anônima em 375 × 812 e 1280 × 900: vitrine com a faixa, sem rolagem horizontal, cabeçalhos `noindex`, `no-store` e `no-referrer` (aba Rede do navegador).
6. Tocar em "Quero esta vitrine", entrar com uma terceira conta, aceitar e conferir: papel "Proprietário", plano "Profissional (cortesia até ...)", aviso "Revise e publique quando quiser".
7. Publicar e abrir `/salao-exemplo`.
8. Abrir o mesmo link de convite de novo: "Este convite não está mais disponível".
9. Na aba "Equipe", convidar um "Funcionário", aceitar com uma quarta conta, editar um item e conferir que "Publicar" e "Equipe" não aparecem; chamar `POST /api/sites/:id/publish` com essa sessão e conferir `403`.
10. Criar outra demonstração, abrir o convite e tocar em "Não tenho interesse": conferir que ela some da lista do operador e que a auditoria tem só `demo_declined` com o endereço.
11. Com o relógio do banco adiantado 76 e 88 dias (função de teste), conferir os avisos de 15 e 3 dias; com 91 dias, conferir o Gratuito em `GET /api/sites/:id/entitlements`, a vitrine publicada ainda no ar e, ao publicar com mais de 20 itens ativos, a escolha dos itens que ficam.

## Capturas

Anexar ao PR de cada tela: página do convite, "Demonstrações" do operador e aba "Equipe", em 1280 e 375 px, claro e escuro.
