# Feature Specification: AutoResposta (resposta automática do Instagram com o link da vitrine)

**Feature Branch**: `cursor/autoresposta-instagram-d306`

**Created**: 2026-11-26

**Status**: Draft (proposta; depende do [ADR 0017](../../docs/adr/0017-autoresposta-canais-sociais.md), ainda proposto)

**Input**: Pedido do Lino em 2026-11-26: o proprietário de uma vitrine conecta a conta profissional do Instagram (no futuro, o WhatsApp Business) pela autorização oficial da Meta, escreve uma mensagem de apresentação com o endereço público da vitrine e, quando um consumidor manda uma mensagem, a Vitrine responde sozinha uma vez. O atendimento continua no aplicativo original. Simplicidade é requisito de produto: a Vitrine não vira sistema de atendimento. Briefing completo em `internal/autoresposta-brief.md` do Project; referência só de experiência de conexão: Manychat.

Vocabulário em [`CONTEXT.md`](../../CONTEXT.md). Decisões anteriores: [ADR 0002](../../docs/adr/0002-site-access-boundary.md) (acesso por vitrine), [ADR 0005](../../docs/adr/0005-zero-cost-mvp.md) (custo zero), [ADR 0013](../../docs/adr/0013-plans-and-recurring-billing.md) (planos) e a configuração Meta de [`docs/instagram/configuracao-meta.md`](../../docs/instagram/configuracao-meta.md) (#48). Pesquisa em [`research.md`](research.md).

## Ponto de partida

- O app Meta **ColetivoInspira** existe em modo desenvolvimento, tipo Empresa, ligado ao portfólio Coletivo Inspira (checkpoint de 12/11/2026 na issue #48). Nenhuma configuração do login unificado foi criada, não há testadores, webhooks, URLs de privacidade cadastradas, Revisão do app nem Verificação da empresa.
- A decisão de #48 usa o **login unificado** só com `instagram_basic` para ler o feed e deixa mensagens fora. A AutoResposta precisa de `instagram_manage_messages`; o ADR 0017 propõe pedir essa permissão numa configuração própria, opcional e separada da leitura do feed.
- Nenhuma rota da Meta existe no Worker (`/api/instagram/*`). A central de canais (#125) mostra "Instagram conectado: Em breve".
- O Worker já tem o padrão de integração com segredo cifrado (pré-orçamento, #121): AES-GCM com chave de ambiente, funções `service_*` só para o `service_role`, entrega em `ctx.waitUntil` e Cron horário (`17 * * * *`).
- Não existe fila, sistema de feature flags nem subdomínio `*.inspira.dev.br` por vitrine. O endereço público é o domínio próprio ativo (com o recurso `custom_domain`) ou `https://vitrine.inspira.dev.br/<endereço>`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Proprietário conecta o Instagram à vitrine (Priority: P1)

Em "Canais > Resposta automática", o proprietário (ou um administrador da vitrine) toca em "Conectar Instagram", entra na tela oficial da Meta com Instagram ou Facebook, escolhe o portfólio e a conta profissional e volta ao painel vendo a conta conectada. Ele nunca cria app, copia token ou configura webhook.

**Why this priority**: sem a conexão autorizada não há o que responder.

**Independent Test**: com a Meta simulada, iniciar a conexão de uma vitrine, voltar com um código válido e ver "@conta conectada em dd/mm" com a resposta automática ainda desligada.

**Acceptance Scenarios**:

1. **Given** uma vitrine publicada liberada para a AutoResposta, **When** o proprietário toca em "Conectar Instagram", **Then** vai para a tela oficial da Meta e, ao autorizar, volta ao painel com a conta (nome, @usuário, data da conexão e situação) e a resposta automática **desligada**.
2. **Given** a tela da Meta, **When** a pessoa cancela, **Then** volta ao painel com "A conexão foi cancelada. Nada foi alterado." e nenhuma conexão é gravada.
3. **Given** a pessoa autoriza sem a permissão de mensagens, **When** volta ao painel, **Then** vê o motivo em português e o botão "Conectar de novo"; a ativação continua bloqueada.
4. **Given** um retorno com `state` inválido, vencido, de outra pessoa ou já usado, **When** o Worker o recebe, **Then** recusa antes de qualquer chamada à Meta e nada é gravado.
5. **Given** a conta já conectada em outra vitrine, **When** a pessoa conclui a autorização, **Then** vê "Esta conta já responde por outra vitrine. Desconecte lá primeiro." e nada é gravado.
6. **Given** um editor ou leitor da vitrine, **When** abre a seção, **Then** vê o estado sem os botões de conectar, configurar ou desconectar; chamadas diretas recebem `404`.

---

### User Story 2 - Proprietário escreve a mensagem, confere a prévia e ativa (Priority: P1)

Com a conta conectada, o proprietário escreve (ou mantém) a mensagem padrão, vê o endereço público que será usado, escolhe a frequência, confere a prévia e liga a resposta automática.

**Why this priority**: conectar não ativa nada; a ativação é escolha expressa.

**Independent Test**: salvar uma mensagem sem `{{vitrine.url}}`, ver na prévia o endereço anexado uma vez, ligar o interruptor e ver "Ligada".

**Acceptance Scenarios**:

1. **Given** a conta conectada, **When** a seção abre, **Then** o campo traz a mensagem padrão, o contador mostra quanto resta do limite da Meta, o endereço público aparece em texto e a frequência padrão é "no máximo uma vez a cada 24 horas".
2. **Given** uma mensagem sem `{{vitrine.url}}`, **When** a prévia é gerada, **Then** o endereço aparece no fim, uma vez só; com a variável ou com o endereço já escrito, ele não é repetido.
3. **Given** uma mensagem acima do limite ou vazia, **When** a pessoa salva, **Then** vê o erro no campo e nada muda.
4. **Given** a vitrine sem publicação ativa, pausada ou arquivada, **When** a pessoa tenta ligar, **Then** vê "Publique a vitrine para ligar a resposta automática" e o interruptor continua desligado.
5. **Given** duas pessoas salvando ao mesmo tempo, **When** a segunda salva uma versão antiga, **Then** recebe "A configuração mudou; recarregue" e nada é sobrescrito.

---

### User Story 3 - Consumidor manda mensagem e recebe o link uma vez (Priority: P1)

Um consumidor manda "Olá! Gostaria de conhecer o cardápio." para o Instagram do negócio. A Vitrine responde uma vez com a mensagem configurada e o endereço público atual; a conversa segue no Instagram com o negócio.

**Why this priority**: é o valor entregue.

**Independent Test**: com a Meta simulada, entregar um webhook assinado de mensagem; conferir uma chamada de envio com o texto e o endereço; entregar de novo o mesmo evento e conferir que nada mais foi enviado.

**Acceptance Scenarios**:

1. **Given** a resposta ligada, **When** chega uma mensagem nova de um consumidor por webhook legítimo, **Then** sai uma resposta com o texto configurado e o endereço resolvido naquele momento.
2. **Given** o mesmo evento reentregue, **When** é processado, **Then** não sai segunda resposta.
3. **Given** duas mensagens simultâneas do mesmo consumidor, **When** processadas em paralelo, **Then** sai no máximo uma resposta.
4. **Given** uma mensagem do próprio negócio (eco), leitura, reação, edição, apagamento, mensagem não suportada, postback ou referência, **When** chega, **Then** é ignorada.
5. **Given** a frequência de 24 horas e uma resposta enviada há 3 horas, **When** o mesmo consumidor escreve de novo, **Then** nada é enviado e a execução fica registrada como "ignorada por frequência"; passadas 24 horas, uma nova mensagem gera nova resposta.
6. **Given** a frequência "uma vez por contato", **When** o consumidor escreve uma semana depois, **Then** nada é enviado.
7. **Given** o domínio próprio ativado depois da configuração, **When** a próxima resposta sai, **Then** usa o domínio novo.
8. **Given** a vitrine despublicada, pausada ou sem endereço válido, **When** chega mensagem, **Then** nada é enviado e o motivo fica registrado.
9. **Given** o texto da mensagem do consumidor, **When** a execução é registrada, **Then** nem o texto, nem anexos, nem o identificador do consumidor em claro são guardados.

---

### User Story 4 - Desligar, reconectar e desconectar (Priority: P1)

O proprietário desliga a resposta, reconecta quando a Meta pede ou desconecta a conta. Desligar barra novos envios na hora; desconectar apaga as credenciais e para tudo.

**Why this priority**: controle e reversibilidade são condição para liberar a funcionalidade.

**Independent Test**: desligar com um evento já recebido e ainda não processado e conferir que nada sai; desconectar e conferir que a credencial sumiu e um novo webhook não gera envio.

**Acceptance Scenarios**:

1. **Given** a resposta ligada e um evento em processamento, **When** o proprietário desliga, **Then** o evento é cancelado na checagem antes do envio.
2. **Given** a Meta responde que o token expirou, foi revogado ou perdeu a permissão, **When** a Vitrine tenta enviar, **Then** a conexão vai para "Reconexão necessária", a resposta é desligada e o painel mostra "Reconectar Instagram".
3. **Given** "Reconectar" com a mesma conta, **When** a autorização volta, **Then** a credencial é trocada e a conexão volta a "Conectada", ainda desligada até nova ativação.
4. **Given** "Reconectar" com outra conta, **When** a autorização volta, **Then** nada é trocado e o painel pede para desconectar antes.
5. **Given** "Desconectar", **When** confirmado, **Then** a Vitrine tenta cancelar a assinatura de webhooks da conta na Meta, apaga a credencial, desliga a resposta, cancela execuções pendentes, apaga a memória de frequência e registra a ação na auditoria.
6. **Given** a Meta chama o retorno de desautorização ou de exclusão de dados com `signed_request` válido, **When** a conexão é localizada, **Then** ela é desconectada como no item 5; a exclusão devolve o código de confirmação exigido pela Meta.

---

### User Story 5 - Administração centralizada pelo Coletivo Inspira (Priority: P2)

Um administrador da plataforma liga ou desliga a AutoResposta de forma global e por canal, libera vitrines do piloto, vê conexões ativas e com falha e métricas agregadas, e suspende uma conexão. Nunca vê token nem conteúdo de conversa.

**Why this priority**: liberação gradual e desligamento de emergência antes de qualquer cliente externo.

**Independent Test**: com o interruptor global desligado, um webhook válido não gera envio; liberar uma vitrine e ligar o global faz o envio voltar.

**Acceptance Scenarios**:

1. **Given** o interruptor global desligado (padrão), **When** chega qualquer webhook, **Then** nada é enviado e a execução registra "desligada pela plataforma".
2. **Given** uma vitrine não liberada para o piloto, **When** o proprietário abre a seção, **Then** vê "Em teste com vitrines convidadas" e não consegue conectar nem ativar.
3. **Given** a tela de administração, **When** aberta por `platform_admin`, **Then** mostra contas conectadas, ativas, com falha, eventos recebidos, enviados, ignorados por frequência, duplicados, falhas de envio e de autorização dos últimos 7 dias, sem identificadores de consumidores nem textos.
4. **Given** qualquer outro papel, **When** chama as rotas de administração, **Then** recebe `403`.
5. **Given** "Suspender" numa conexão, **When** confirmado, **Then** a resposta daquela vitrine para na hora e a ação fica auditada.

---

### User Story 6 - Arquitetura pronta para o WhatsApp (Priority: P3)

A mesma regra central (elegibilidade, frequência, endereço, mensagem, registro) serve a um canal futuro, com o provedor tratando autorização, credenciais, validação, destinatário, limites e envio. Nada do WhatsApp é implementado nesta entrega; a viabilidade fica em [`docs/integrations/auto-reply/whatsapp-discovery.md`](../../docs/integrations/auto-reply/whatsapp-discovery.md) (PR #182), que recomenda começar o WhatsApp pela saudação nativa do app Business assistida pelo painel.

**Independent Test**: os testes das regras centrais rodam sem nenhum código do Instagram.

### Edge Cases

- Lote de webhook com várias entradas e várias mensagens: cada mensagem é tratada à parte; um erro não derruba as outras.
- Evento com mais de 23 horas (reentrega tardia da Meta): ignorado por janela, sem tentativa de envio.
- Evento anterior à ativação: ignorado.
- Resultado de envio incerto (tempo esgotado depois do pedido): registrado como "inconclusivo", sem reenvio automático.
- Limite de requisições da Meta (`429`/código 4, 17, 32, 613) ou erro `5xx`: até 3 tentativas com espera crescente; depois "falhou" e a frequência é liberada para a próxima mensagem.
- Conta com "Permitir acesso às mensagens" desligado (erro `#200`): conexão continua, aviso "Ative 'Permitir acesso às mensagens' no app do Instagram".
- Conta compartilhada sem a Página do Facebook vinculada: a Meta avisa que webhooks de mensagens podem não chegar (limitação temporária oficial); o painel mostra "Aguardando a primeira mensagem" até receber um evento real.
- Outra ferramenta de automação (Manychat, Página com respostas instantâneas nativas) na mesma conta: as duas podem responder; o painel recomenda usar só uma.
- Segredo, token, código OAuth ou texto do consumidor nunca aparecem em logs, respostas JSON, auditoria ou relatórios.
- Falha da Meta ou do processamento não afeta a vitrine pública.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Só proprietário e administradores da vitrine conectam, configuram, reconectam e desconectam; editor e leitor só veem o estado (RBAC existente).
- **FR-002**: A conexão usa a autorização oficial da Meta iniciada por sessão autenticada no painel, com `state` aleatório de uso único, vinculado a pessoa, vitrine e finalidade, com prazo de 10 minutos; a troca do código acontece só no servidor.
- **FR-003**: A conexão guarda conta, @usuário, situação, permissões concedidas, datas e a credencial cifrada; a credencial nunca sai do servidor.
- **FR-004**: Uma conta social responde por no máximo uma vitrine, e uma vitrine tem no máximo uma conexão por canal (RN-009).
- **FR-005**: Conectar não ativa; ativar exige conexão "Conectada" com `instagram_manage_messages`, vitrine publicada (não pausada nem arquivada), vitrine liberada e interruptores globais ligados (RN-001 a RN-003).
- **FR-006**: A mensagem aceita só `{{vitrine.nome}}` e `{{vitrine.url}}`; sem `{{vitrine.url}}` nem o próprio endereço no texto, o endereço é anexado ao fim uma vez. O texto final respeita 1000 bytes UTF-8 (limite da Meta). Mensagem padrão: "Olá! Obrigado pelo contato. Para conhecer nossos produtos, serviços e informações, acesse nossa vitrine:\n\n{{vitrine.url}}".
- **FR-007**: O endereço é resolvido no envio: domínio próprio ativo e com SSL, se o plano incluir `custom_domain`; senão `https://vitrine.inspira.dev.br/<endereço>`. Sem publicação ativa, pausada, arquivada, demonstração ou endereço inválido: não envia e registra o motivo.
- **FR-008**: Só mensagens novas de consumidores recebidas por webhook com assinatura `X-Hub-Signature-256` válida (HMAC-SHA256 do corpo bruto com a chave do app, comparação em tempo constante) geram envio; o restante é ignorado com motivo (RN-004, RN-007).
- **FR-009**: Idempotência pelo identificador da mensagem na Meta, garantida por restrição única no banco (RN-005).
- **FR-010**: Frequência por consumidor e conexão: "uma vez por contato", "no máximo a cada 24 horas" (padrão) ou "no máximo a cada 7 dias"; a vaga é reservada de forma atômica no banco antes do envio e liberada se o envio falhar de forma definitiva antes de chegar à Meta (RN-006).
- **FR-011**: Antes de enviar, o estado atual (interruptores, ativação, conexão, publicação) é relido; mudou, cancela (RN-010, CT-029).
- **FR-012**: Erros de token, revogação ou permissão levam a conexão a "Reconexão necessária" e desligam a resposta (RN-012).
- **FR-013**: Desconectar ou receber desautorização/exclusão apaga a credencial, desliga, cancela pendentes, apaga a memória de frequência e tenta cancelar a assinatura de webhooks na Meta (RN-011).
- **FR-014**: Nenhum texto de mensagem, anexo, nome ou identificador do consumidor em claro é guardado; o consumidor vira um hash HMAC específico da conexão (RN-013).
- **FR-015**: Execuções ficam registradas com situação, motivo, código de erro, tentativas e datas, por 90 dias.
- **FR-016**: O `platform_admin` liga e desliga global e por canal, libera vitrines, suspende conexões e vê métricas agregadas; todo o resto recebe `403`. Padrão de fábrica: tudo desligado.
- **FR-017**: Elegibilidade por plano preparada mas não usada: nenhum recurso novo em `content/plans.json` nesta entrega (RN-015).
- **FR-018**: Ambientes de desenvolvimento e teste usam Meta simulada; nenhum teste envia mensagem a consumidor real (RN-016).
- **FR-019**: Logs estruturados com `correlationId`, sem tokens, segredos, códigos, textos ou identificadores de consumidores.
- **FR-020**: A falha da integração nunca afeta a vitrine pública.

### Key Entities

- **Conexão de canal**: vínculo entre uma vitrine e uma conta social (canal, conta no provedor, @usuário, situação, permissões, datas).
- **Credencial do canal**: token cifrado da conexão, tipo, validade e versão da chave.
- **Configuração da AutoResposta**: ligada ou não, mensagem, frequência, versão, quem alterou e quando.
- **Execução da AutoResposta**: um evento recebido e o que aconteceu com ele (enviada, ignorada, falhou, inconclusiva, cancelada), sem conteúdo.
- **Janela de frequência**: hash do consumidor e data do último envio por conexão.
- **Controles da plataforma**: interruptores global e por canal e lista de vitrines liberadas.

## Success Criteria *(mandatory)*

- **SC-001**: Um proprietário sem conhecimento técnico conecta a conta e ativa a resposta em até 3 minutos, sem copiar nenhum código ou identificador.
- **SC-002**: Em teste com eventos reentregues e simultâneos, 0 respostas duplicadas para o mesmo consumidor dentro da frequência.
- **SC-003**: 100% das mensagens do próprio negócio, leituras, reações e edições são ignoradas.
- **SC-004**: Desligar ou desconectar barra 100% dos envios de eventos ainda não enviados.
- **SC-005**: Nenhum token, segredo, código ou texto de consumidor aparece em logs, banco, respostas da API ou documentação (verificado por testes).
- **SC-006**: Com a integração indisponível, a vitrine pública responde normalmente.
- **SC-007**: Custo adicional de infraestrutura zero no piloto de até 10 vitrines (ADR 0005); estimativas para 100 e 1.000 vitrines em [`cost-analysis.md`](../../docs/integrations/auto-reply/cost-analysis.md).

## Fora de escopo

Chatbots, IA conversacional, editor de fluxos, palavras-chave, respostas condicionais, CRM, inbox, armazenamento de conversas, campanhas, disparos em massa, mensagens não solicitadas, atendimento humano pela Vitrine, publicações, automação de comentários, captura de seguidores, integrações não oficiais, leitura do feed (#49/#50) e a implementação do WhatsApp.

## Assumptions

- Configuração Meta: login unificado com uma configuração própria da AutoResposta (`instagram_basic` + `instagram_manage_messages`), separada da leitura do feed (ADR 0017, research R1 e R2).
- Frequência padrão "no máximo a cada 24 horas", sugerida no briefing; registrada como decisão D2 no ADR 0017.
- Elegibilidade conservadora: interruptor global desligado e liberação por vitrine pelo `platform_admin`; sem cobrança nova.
- Roteamento com outras ferramentas: a Vitrine não assume o controle da conversa (sem Handover Protocol); só envia uma mensagem e sai.
- A foto do perfil não é mostrada: a CSP do painel (`img-src 'self'`) bloqueia a CDN da Meta; o painel usa a inicial do nome.
- Sem envio a consumidores reais até homologação autorizada; mocks não são evidência de produção.
