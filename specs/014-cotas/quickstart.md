# Quickstart: validar as cotas de apoio

```bash
npm ci
npm test                          # inclui test/quota-items.test.mjs
npm run build
npx wrangler deploy --dry-run     # validação local; não há deploy remoto
npm run preview                   # http://127.0.0.1:4173
```

## Roteiro manual

1. Entre no painel (`/portal/`), abra uma vitrine de produtos e clique em **+** → **Cotas de apoio**.
2. Preencha: valor `R$ 20,00`, total `50`, confirmadas `32`, "O que cada cota garante" = `1 pão por cota`.
3. Confira na prévia ao vivo: "32 de 50 cotas confirmadas", barra, "Meta: R$ 1.000,00 · 18 cotas disponíveis", "R$ 20,00 por cota" e o aviso "Sem sorteio…".
4. Troque o nome para `Rifa do forno`: o aviso "Remova "rifa"…" aparece no cartão e o salvamento é bloqueado.
5. Publique e abra a vitrine pública. Reserve 3 cotas, avance até "Revisar e enviar" e confira:
   - linha "3 cotas de apoio: …" com R$ 60,00;
   - bloco "Total em cotas (reserva)" separado do "Total estimado";
   - mensagem com "Cotas: reserva sem sorteio; o pagamento é combinado nesta conversa."
6. Marque confirmadas = total e publique de novo: o cartão mostra "Cotas esgotadas".

## Capturas

Store do projeto, pasta `media/cotas/` (1280 px e 375 px, claro e escuro):

- `vitrine-cotas-*` — cartões de cota na vitrine pública com 3 cotas reservadas e item esgotado;
- `vitrine-revisao-cotas-*` — revisão e mensagem do WhatsApp com cotas e produto;
- `editor-cotas-*` — cartão do editor com aviso legal e campos;
- `editor-cotas-aviso-rifa-*` — aviso ao digitar "Rifa";
- `editor-menu-cotas-*` — menu "Adicionar item" com a opção "Cotas de apoio".
