# Oferta e customizações — proposta operacional

Data: 2026-11-07. Preços abaixo são recomendação baseada nos valores sugeridos
pelo usuário, não tabela já divulgada ou contratação. Infraestrutura segue Free.
Interpretamos a referência a “VPN” como a própria vitrine; não há produto de VPN.

## Oferta inicial

| Oferta | Valor sugerido | Inclui | Não inclui |
| --- | --- | --- | --- |
| Básica | Grátis | 1 vitrine por proprietário, template padrão, até 20 itens ativos, link WhatsApp e endereço /loja | Customização de layout, domínio próprio e atendimento de implementação |
| Endereço Inspira | R$ 10/mês por vitrine | Básica + subdomínio exclusivo disponível, como loja1.inspira.dev.br | Registro de domínio independente, alterações de código ilimitadas |
| Domínio do cliente | R$ 15/mês por vitrine | Básica + vínculo de um domínio existente tecnicamente compatível e manutenção desse vínculo | Compra/renovação, acesso ao email, migração complexa ou mudança no template |
| Projeto sob medida | Sob orçamento | Layout, integrações e funcionalidades acordadas | Serviços não descritos no orçamento |

Plano pago dá identidade de endereço e manutenção do vínculo, não promessa de
capacidade ilimitada. O limite de 20 itens vale inicialmente para todos os planos;
aumentos são avaliados, não liberados sem medir recursos. O teto técnico anterior
de 100 itens não é franquia comercial. Limite global do piloto: 10 vitrines.
Se um mesmo usuário precisar de várias vitrines, preparar o modelo para isso,
mas liberar cada vitrine adicional por análise manual durante o piloto.

Subdomínio não gera taxa de registro de domínio por loja; a mensalidade remunera
serviço, configuração e manutenção. Cobrar por customização não transforma todas
as despesas técnicas em zero: não contratar infraestrutura ou excedentes sem nova
decisão do usuário. A renovação de inspira.dev.br permanece despesa existente.

## Endereços e cancelamento

`vitrine.inspira.dev.br/loja1` permanece o endereço básico. Subdomínio ou domínio
ativo torna-se canônico; o endereço básico redireciona para ele enquanto ativo,
sem loops e sem duas cópias indexáveis. Isso atualiza o ADR 0006, que previa o
subdomínio somente como redirecionamento para o caminho.

Não prometer domínio próprio instantâneo: analisar propriedade, DNS, TLS, www/apex
e limitações do provedor antes de aceitar e cobrar. Para novo domínio, orçamento
separado e registro preferencialmente na conta do cliente, com custo de renovação
explicado. Não pedir senha da conta: usar delegação ou instruções de DNS.

Cobrança inicial manual, sem gateway, cartão, recorrência automática ou webhooks.
Registrar valor, período, confirmação e próximo vencimento no controle privado.
Não ativar apenas por clique ou comprovante enviado: confirmar recebimento.
Uma integração futura de pagamentos pode ter tarifas; não prometer processamento
gratuito. Preço público só após revisar viabilidade e publicar condições claras.

Política inicial proposta: avisar vencimento, conceder 7 dias de tolerância e
suspender somente o vínculo premium após revisão manual. Reativar endereço básico
e manter rascunhos; não apagar conteúdo automaticamente. Remover configuração de
hostname/DNS de forma coordenada. Nome antigo não é reatribuído automaticamente.

## Pedido de orçamento

No site de divulgação: seção “Feito com a Inspira” → case → “Quero algo parecido”.
O botão abre conversa com a equipe com o ID/título do case e o tipo de pedido.
Também haverá pedidos sem referência: customização, domínio existente ou novo
domínio. Telefone comercial da equipe ainda não foi informado; até configurá-lo,
o botão deve ficar indisponível, sem número inventado.

Informações mínimas: vitrine (se houver), referência escolhida e objetivo. Dados
pessoais e detalhes de orçamento seguem pelo atendimento; não colocar email,
telefone de cliente ou texto privado em URLs públicas. Orçamentos registram escopo,
entregáveis, preço, manutenção e aceite antes do trabalho. Sem prometer prazo ou
integração apenas porque existe um case semelhante.

## Portfólio administrado pela equipe

Inicialmente, editar `content/portfolio.json` no repositório e revisar no PR.
Isso dá espaço para cadastrar links agora, sem criar um painel com segurança
incompleta. O arquivo começa vazio: DNS não prova autorização de divulgação.

Campos: id, título, URL pública HTTPS, resumo do trabalho, categoria, tags,
ordem, destaque e publicado. Não adicionar credenciais, contatos privados ou
informações internas. Screenshots entram depois, com autorização e sem dados
privados. Não buscar URL arbitrária no servidor para gerar preview (evita SSRF).

Futuro painel “Portfólio” exclusivo dos operadores Inspira: cadastrar, pré-visualizar,
publicar, ordenar e arquivar cases. Ser dono de uma vitrine NÃO concede esse papel.
Papel de operador é atribuído por administração confiável, nunca por formulário ou
metadado editável. Dados públicos vêm de projeção; rascunhos ficam privados.

## Plano de implementação

1. Concluído nesta entrega: proposta, análise do DNS, catálogo editável e projeção
   de cases publicados com link de contato configurável.
2. Site de divulgação: oferta, exemplos e CTA, sem preços tratados como definitivos
   até revisão da proposta; usar contexto visual Impeccable antes de criar UI.
3. Controle privado de direitos por vitrine: gratuito/subdomínio/domínio, status,
   período pago, hostname verificado e tolerância; somente operador altera cobrança.
4. Integrar publicação e validar quotas antes de vender vínculo personalizado.
5. Implementar painel de portfólio após Auth/RLS de operadores e testes negativos.

Nenhuma cobrança, publicação de case, configuração DNS ou integração financeira
foi ativada por esta documentação.
