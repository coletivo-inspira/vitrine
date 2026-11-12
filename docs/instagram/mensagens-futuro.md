# Evolução Futura: Mensagens no Instagram

Este documento mapeia o tratamento de mensagens no Instagram como uma evolução futura e registra o backlog de perguntas e dependências para quando esta evolução for priorizada. 

Closes #52

## Objetivo

Mapear as necessidades, limites, restrições e regras da API de mensagens do Instagram (Instagram Messaging API) para uma futura integração com a Vitrine, garantindo que esta trilha permaneça isolada do fluxo inicial de leitura de perfil e mídias, sem solicitar permissões ou realizar implementações neste momento.

Para o contexto geral da integração, consulte o [Caminho das pedras](../instagram-integration-roadmap.md).

---

## Dependências Críticas

A evolução de mensagens possui dependências técnicas, operacionais e de privacidade que precisam ser sanadas antes de qualquer esforço de desenvolvimento:

1. **OAuth e Conexão Base (Vitrine #49)**
   - O fluxo de conexão da conta do Instagram à vitrine no painel deve estar operando de forma estável. Sem a infraestrutura de consentimento, renovação de tokens e armazenamento seguro das credenciais por vitrine estabelecidos em `docs/instagram/conectar-por-vitrine.md` (a confirmar), não é possível iniciar o recebimento ou envio de mensagens.

2. **Separação de Consentimento**
   - É mandatório separar o consentimento para acesso a mensagens do consentimento de leitura do feed de mídias.
   - O proprietário da vitrine não deve ser obrigado a fornecer permissão de acesso a mensagens privadas (`instagram_manage_messages`) na conexão padrão do feed. A autorização para mensagens deve ser um fluxo opcional e explicitamente ativado no painel.

3. **App Review da Meta e Verificação Empresarial**
   - A permissão `instagram_manage_messages` exige que o aplicativo Meta passe por um processo de **App Review avançado** no console Meta for Developers.
   - Esse processo requer a submissão de vídeos de demonstração detalhados que justifiquem a necessidade da permissão e a comprovação de que o aplicativo atende às políticas de privacidade da plataforma.
   - Além disso, a empresa proprietária do aplicativo Meta da Vitrine deve passar por **Verificação de Empresa (Business Verification)** na Meta.

4. **Webhooks e Infraestrutura Cloudflare Workers Free**
   - Para receber notificações de novas mensagens dos usuários em tempo real, o servidor precisa expor e cadastrar um endpoint de webhook assinado pela Meta.
   - É essencial garantir que o processamento dessas mensagens recebidas se encaixe nos limites de uso do plano grátis do Cloudflare Workers (CPU time limite de 10ms por requisição e limite de requisições diárias), sem gerar custos de infraestrutura adicionais para a plataforma.

---

## Regras da Plataforma e Limites de Envio

O envio de mensagens via API não é livre e segue diretrizes rígidas da Meta que protegem os usuários contra spam:

1. **Janela de Interação de 24 horas (24-Hour Messaging Window)**
   - A API de mensagens do Instagram opera sob a regra estrita de uma janela de 24 horas. O aplicativo só pode enviar mensagens gratuitas de resposta para um usuário se este usuário tiver enviado uma mensagem nas últimas 24 horas.
   - Fora dessa janela, o envio de mensagens padrão é bloqueado pela Meta. Mensagens adicionais fora da janela requerem tags específicas aprovadas ou canais específicos, os quais não se aplicam ao modelo simplificado da Vitrine.

2. **Restrições de Formato**
   - O envio está limitado a textos, mídias estruturadas (imagens/vídeos hospedados), modelos de botões (templates) e respostas rápidas (Quick Replies).

3. **Taxa de Limite de Requisições (Rate Limiting)**
   - A Meta aplica limites estritos de requisições (Rate Limits) para chamadas de API baseados no número de usuários ativos mensais do aplicativo, exigindo uma estratégia de fila (queue) e tratamento adequado de erros de limitação (HTTP 429).

---

## Custos e Viabilidade Econômica

Um princípio fundamental do projeto Vitrine Inspira é operar dentro da gratuidade de infraestrutura no piloto:

1. **Nenhum Plano Pago Meta**
   - A API do Instagram Graph API e Instagram Messaging API em si é gratuita fornecida pela Meta. Porém, o desenvolvimento de funcionalidades extras não deve depender de soluções de terceiros ou intermediadores de APIs pagos (como Twilio, ManyChat, etc.).

2. **Impacto nos Bancos de Dados e Hospedagem**
   - O recebimento constante de webhooks pode sobrecarregar o banco de dados Supabase e estourar as cotas gratuitas de conexões e armazenamento de logs. Qualquer implementação futura deve focar em processamento sem persistência excessiva ou apenas no encaminhamento direto do evento para o destino necessário.

---

## Perguntas em Aberto para o Futuro Backlog

Quando a evolução for priorizada, as seguintes questões estratégicas e técnicas precisarão ser respondidas pela equipe:

1. **Quem é o destinatário das mensagens?**
   - A intenção é encaminhar as mensagens enviadas no Instagram direto para o WhatsApp do proprietário da vitrine, ou criar um painel simples de chat (Inbox unificado) dentro do portal da Vitrine?
2. **Como lidar com mensagens iniciadas pela Vitrine?**
   - Sendo que a Meta não permite iniciar conversas via API sem que o usuário tome a iniciativa, qual será a chamada para ação (CTA) na vitrine publicada do proprietário para direcionar o visitante a enviar a primeira mensagem no Instagram?
3. **Qual é o comportamento esperado para mídias recebidas?**
   - Se um visitante enviar fotos ou arquivos de áudio por mensagem direta no Instagram, como a Vitrine deve processar ou descartar esse conteúdo, considerando que a plataforma adota a premissa de não hospedar imagens pesadas na base de dados?
4. **Como tratar múltiplos membros da equipe da vitrine?**
   - Caso mais de um membro da equipe esteja acessando o painel de uma mesma vitrine, como será o controle de concorrência e visualização das mensagens?
5. **Como assegurar o total isolamento entre vitrines?**
   - Se o app Meta for único, como garantir de forma totalmente segura que as mensagens recebidas via webhook global sejam roteadas exclusivamente para a vitrine correta, sem qualquer risco de vazamento de dados privados entre inquilinos (tenants) concorrentes?

---

## Condição de Conclusão e Próximos Passos

Este documento cumpre o objetivo de documentar e planejar as diretrizes futuras de mensagens. Nenhuma chamada de API, credencial, fluxo de permissão Meta ou código de deploy está sendo introduzido na entrega atual. A trilha permanece puramente em nível de especificação para planejamento estratégico futuro.
