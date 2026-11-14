---
titulo: "[Estudo de mercado] \"Aberto agora\", botão \"Traçar rota\" e QR Code da vitrine"
rotulos: estudo-mercado, vitrine-publica, enhancement
depende:
---
## Contexto

Serviços locais precisam dizer se estão abertos e como chegar. O estudo pede
relatórios de "Traçar rota" e de leituras de QR (diretriz 6) e QR Codes impressos na
implantação. Hoje a vitrine não tem horário, endereço público nem QR Code.

## Escopo

- Editor: horário por dia da semana (até 2 faixas por dia), fuso
  `America/Sao_Paulo`, exceções simples ("fechado hoje") e endereço público opcional.
  Validação no servidor com mensagens por campo (padrão de `PB-13`).
- Vitrine pública: selo "Aberto agora" ou "Fechado · abre às 18h", calculado no
  navegador a partir do horário publicado (o snapshot continua imutável).
- Botão "Traçar rota" com link `https://www.google.com/maps/dir/?api=1&destination=…`
  a partir do endereço público; sem endereço, o botão não aparece. Sem API paga nem
  chave de mapas.
- QR Code da vitrine gerado no painel (no navegador, sem biblioteca nova se possível)
  em PNG e SVG, apontando para o endereço canônico com `?utm_source=qr`.
- Disponível em todos os planos (ADR 0013).

## Fora de escopo

- Agenda com disponibilidade em tempo real (fora de escopo também no spec 008).
- Contagem dos cliques e leituras (issue {{issue:09}}).

## Critérios de aceite

- [ ] Com horário 18h–23h, às 17h59 a vitrine mostra "Fechado · abre às 18h" e às
      18h00 "Aberto agora" (teste com relógio simulado e fuso de São Paulo).
- [ ] Faixa que passa da meia-noite (18h–02h) funciona.
- [ ] Sem endereço público, não há botão "Traçar rota"; com endereço, o link abre o
      destino certo e tem `rel="noopener"`.
- [ ] O QR Code baixado, lido por um celular, abre a vitrine com `utm_source=qr`.
- [ ] Horário inválido (fim antes do início na mesma faixa sem virar o dia) é recusado
      pelo servidor com erro no campo.
- [ ] Capturas em 1280 e 375 px no PR.

## Dependências

Nenhuma.

## Referências

- Estudo: [seções 5 e 7 (diretriz 6)](../../market-study-2026.md#7-diretrizes-do-painel).
- Auditoria: `PB-13` (validação por campo), `PB-09` (foco e erros acessíveis).
