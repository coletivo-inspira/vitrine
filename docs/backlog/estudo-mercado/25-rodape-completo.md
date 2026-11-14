---
titulo: "[Estudo de mercado] Rodapé completo da vitrine"
rotulos: estudo-mercado, vitrine-publica, referencia-laurapires, enhancement
depende: 08, 18
---
## Contexto

O rodapé da vitrine mostra o logo da Vitrine Inspira, a nota de preços em reais e o
aviso de privacidade. Faltam os dados do próprio negócio. A referência não tem
rodapé (só repete o menu), e isso é o que evitar: a vitrine deve fechar a página com
as informações de confiança.

## Escopo

- Bloco do negócio: nome, frase curta opcional, "Conversar no WhatsApp" (ou pela
  Mila, ADR 0012), Instagram e e-mail quando informados, e horário e cidade vindos
  dos mesmos campos da issue {{issue:08}} (sem um segundo cadastro).
- Links de `navigation.footer`.
- Linha de apoio: nota de preços, aviso de privacidade resumido com link para
  `/privacidade/` e o crédito "Vitrine feita com Vitrine Inspira" com o logo, levando
  ao site de divulgação. O selo "Apoio Coletivo Me Inspira" do plano Gratuito (ADR
  0013) fica nesta linha.
- O selo "Vitrine /<endereço>" retirado do cabeçalho (issue {{issue:18}}) não volta aqui.
- Duas colunas no desktop e uma no celular, sem a barra de seleção cobrir o rodapé.

## Fora de escopo

- Política de privacidade própria de cada negócio, newsletter e mapa incorporado.
- O acabamento em 768–1440 px já mapeado em `PB-26` (feito junto, não duplicado).

## Critérios de aceite

- [ ] Com WhatsApp, Instagram e horário preenchidos, os três aparecem; campos vazios
      não deixam rótulos soltos.
- [ ] "Privacidade" leva a `/privacidade/` e o crédito ao site de divulgação.
- [ ] Com o modo Mila, o botão usa o número da Mila e o código da vitrine; o número
      do dono não aparece no HTML.
- [ ] Em 390 px, a barra de seleção não cobre o rodapé ao rolar até o fim.
- [ ] Links externos com nome acessível ("Instagram de <negócio>").
- [ ] Rodapé correto em 768, 1024 e 1440 px.
- [ ] Vitrine `free` mostra o selo de apoio; plano pago pode escondê-lo.

## Dependências

- {{issue:08}} `08-aberto-agora-rota-e-qr-code.md` (horário e cidade) e
  {{issue:18}} `18-cabecalho-identidade-e-sua-selecao.md`.
- Auditoria: `PB-26`.

## Referências

- [Referência laurapires.com](../../referencia-laurapires.md): seções 2 (Home, item
  5), 7.8 e decisão 1.
- ADR 0012, ADR 0013 (selo do Gratuito).
