# Oferta e customizações — proposta operacional

Data: 2026-11-07, atualizada em 2026-11-14 com o
[estudo de mercado 2026](market-study-2026.md) e o
[ADR 0013](adr/0013-plans-and-recurring-billing.md). Os planos abaixo foram adotados
pelo Lino (escolha 2.b), mas a tabela só vai para o site público com a issue
"Plano e cobrança no painel e página de preços". Infraestrutura segue Free.
Interpretamos a referência a “VPN” como a própria vitrine; não há produto de VPN.

## Planos

| Plano | Valor | Inclui | Não inclui |
| --- | --- | --- | --- |
| Gratuito/Social | R$ 0 | 1 vitrine, até 20 itens ativos, endereço `vitrine.inspira.dev.br/<endereço>`, selo "Apoio Coletivo Me Inspira", WhatsApp e Instagram por link direto, "Aberto agora", "Traçar rota", QR Code e Insights básicos | Domínio próprio, recursos dos planos pagos e atendimento de implantação |
| Essencial | R$ 39/mês | Gratuito sem o selo obrigatório + até 100 itens ativos + domínio próprio do cliente (ou subdomínio `inspira.dev.br`) + dados estruturados de negócio local | Registro e renovação do domínio, mudanças de layout |
| Profissional | R$ 89/mês | Essencial + até 5 blocos de itens + formulário de pré-orçamento com webhook para CRM ou planilha + `vitrine.json` para robôs de conversa + Insights por origem (UTM, rota, QR) | Integração sob medida com um CRM específico |
| Equipe/Multi-Vitrine | R$ 169/mês (faixa do estudo: R$ 149 a 199) | Recursos do Profissional em até 5 vitrines do mesmo cliente | Vitrines acima de 5, sob orçamento |
| Implantação Chave na Mão | R$ 290 a 490, uma vez | DNS, preparo de imagens, Google Meu Negócio e QR Codes impressos | Mensalidade do plano |
| Projeto sob medida | A partir de R$ 950 | Design exclusivo, módulos novos e integrações acordadas | Serviços fora do orçamento aceito |
| Patrocínio | Cotas negociadas | Leitura de métricas agregadas das vitrines sociais | Acesso a dados de uma vitrine específica |

Plano pago não é promessa de capacidade ilimitada: 100 itens ativos é o teto
técnico (ADR 0005). Domínio próprio respeita a trava de 95 domínios ativos (ADR
0008); sem vaga, o Essencial usa subdomínio `inspira.dev.br` até abrir uma. Aumentos
além dos limites são avaliados, não liberados sem medir recursos.

0% de comissão sobre as vendas do negócio em todos os planos. Comparação usada na
página de preços: no Beacons, quem vende mais de R$ 433 por mês paga mais de R$ 39
só na taxa de 9%.

Subdomínio não gera taxa de registro de domínio por loja; a mensalidade remunera
serviço, configuração e manutenção. Cobrar por plano não transforma as despesas
técnicas em zero: não contratar infraestrutura ou excedentes sem nova decisão do
usuário. A renovação de inspira.dev.br permanece despesa existente.

## Endereços e cancelamento

`vitrine.inspira.dev.br/loja1` permanece o endereço básico. Subdomínio ou domínio
ativo torna-se canônico; o endereço básico redireciona para ele enquanto ativo,
sem loops e sem duas cópias indexáveis. Isso atualiza o ADR 0006, que previa o
subdomínio somente como redirecionamento para o caminho.

Não prometer domínio próprio instantâneo: analisar propriedade, DNS, TLS, www/apex
e limitações do provedor antes de aceitar e cobrar. Para novo domínio, orçamento
separado e registro preferencialmente na conta do cliente, com custo de renovação
explicado. Não pedir senha da conta: usar delegação ou instruções de DNS.

## Cobrança

Cobrança recorrente pelo Asaas (ADR 0013): Pix Automático quando disponível,
boleto e cartão na página de pagamento do Asaas. O Asaas não cobra mensalidade, mas
tem tarifa por recebimento; não prometer processamento gratuito. O Stripe entra
depois, como complemento para cartão e exterior. Não usar repasse entre contas
(Stripe Connect): as vendas do lojista seguem pelos links de pagamento dele.

O plano só muda quando o Asaas confirma o pagamento pelo webhook verificado, ou por
ação auditada de um operador. Não ativar por clique ou por comprovante enviado.
Produção só depois de o Lino abrir a conta e gerar as chaves (`BLK-ASAAS-01`).
Até lá, a cobrança continua manual: registrar valor, período, confirmação e próximo
vencimento no controle privado.

Política do ciclo: avisar o vencimento, conceder 7 dias de tolerância e suspender
somente os recursos pagos. A vitrine volta ao endereço básico, os rascunhos e a
publicação ficam intactos e nada é apagado automaticamente. Remover configuração de
hostname/DNS de forma coordenada. Nome antigo não é reatribuído automaticamente.
Pagamento confirmado depois da suspensão reativa os recursos.

## Pedido de orçamento

No site de divulgação: seção “Feito com a Inspira” → case → “Quero algo parecido”.
O botão abre conversa com a equipe com o ID/título do case e o tipo de pedido.
Também há pedidos sem referência: implantação, customização, domínio existente ou
novo domínio. O contato da equipe vem de `content/contact.json` (Mila, ADR 0012);
sem contato configurado, o botão fica indisponível, sem número inventado.

Informações mínimas: vitrine (se houver), referência escolhida e objetivo. Dados
pessoais e detalhes de orçamento seguem pelo atendimento; não colocar email,
telefone de cliente ou texto privado em URLs públicas. Orçamentos registram escopo,
entregáveis, preço, manutenção e aceite antes do trabalho. Sem prometer prazo ou
integração apenas porque existe um case semelhante.

## Portfólio administrado pela equipe

Inicialmente, editar `content/portfolio.json` no repositório e revisar no PR.
Isso dá espaço para cadastrar links agora, sem criar um painel com segurança
incompleta. DNS não prova autorização de divulgação.

Campos: id, título, URL pública HTTPS, resumo do trabalho, categoria, tags,
ordem, destaque e publicado. Não adicionar credenciais, contatos privados ou
informações internas. Screenshots entram depois, com autorização e sem dados
privados. Não buscar URL arbitrária no servidor para gerar preview (evita SSRF).

Painel “Portfólio” exclusivo dos operadores Inspira: cadastrar, pré-visualizar,
publicar, ordenar e arquivar cases. Ser dono de uma vitrine NÃO concede esse papel.
Papel de operador é atribuído por administração confiável, nunca por formulário ou
metadado editável. Dados públicos vêm de projeção; rascunhos ficam privados.

## Plano de implementação

1. Concluído: proposta, análise do DNS, portfólio editável e projeção de cases
   publicados com link de contato configurável.
2. Concluído em 2026-11-14: estudo de mercado, planos e ADR 0013.
3. Próximo: backlog [`docs/backlog/estudo-mercado/`](backlog/estudo-mercado/README.md),
   na ordem tabela de planos → direitos por plano → Asaas em sandbox → ciclo da
   assinatura → tela "Plano e cobrança" e página de preços.
4. Domínio próprio pago depende também da issue
   [#44](https://github.com/coletivo-inspira/vitrine/issues/44) (verificação DNS/SSL).

Nenhuma cobrança, publicação de case, configuração DNS ou integração financeira
foi ativada por esta documentação.
