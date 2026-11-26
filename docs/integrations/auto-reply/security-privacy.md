# Segurança e privacidade (LGPD) da AutoResposta

Estado: controles implementados no código e testados com a Meta simulada; base legal e textos públicos **pendentes de revisão jurídica**.

## Controles

| Risco | Controle | Evidência |
| --- | --- | --- |
| Acesso entre vitrines | Tabelas em `private` sem grants; `has_site_role` nas funções de usuário; `service_*` só para `service_role`; 404 para quem não é da equipe | `test/database/auto-reply.test.mjs`, `test/auto-reply.test.mjs` (CT-019) |
| Elevação de papel | Só `owner`/`admin` conectam e configuram; editor e leitor só leem | Testes de rota e de banco |
| Token exposto | AES-GCM (HKDF da `AUTO_REPLY_ENCRYPTION_KEY`), dados associados vitrine + canal + conta; nunca em resposta, log ou auditoria | Teste de cifra em outra vitrine; teste de resposta sem token |
| Segredos | `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN`, `AUTO_REPLY_ENCRYPTION_KEY` só no cofre; nenhum valor no repositório | Revisão do PR; teste de logs |
| CSRF no OAuth | `state` de uso único no banco, vinculado à pessoa e à vitrine; `Origin` nas mutações | CT-004, CT-005 |
| Open redirect | Retorno sempre para `PORTAL_ORIGIN/` | Teste do callback |
| Webhook forjado | HMAC do corpo bruto em tempo constante; limite de 1 MiB | CT-018 |
| Replay | Idempotência por `mid`; eventos com mais de 23 h descartados | CT-007 |
| Injeção | Mensagem do dono validada (bytes, controles, variáveis) e enviada como texto pela API; nada vira HTML; SQL só por funções parametrizadas | Testes de mensagem |
| URL maliciosa na resposta | Endereço resolvido no servidor (HTTPS, sem credenciais, slug validado, domínio só ativo com SSL e recurso) | Testes de endereço |
| Logs | Só `event`, `correlationId`, motivos, contagens e códigos de erro | Teste "logs" |
| Auditoria | Conectar, reconectar, configurar, desconectar, controles, liberação e suspensão em `audit_logs` (sem token nem texto) | Testes de banco |
| Revogação e exclusão | Desconexão, desautorização e exclusão apagam credencial e janelas | CT-023 e teste dos callbacks |
| Rotação de chave | `key_version` na credencial; rotação = nova chave + reconexão (sem recifragem automática no MVP) | Pendência registrada |

## Dados pessoais

| Dado | Titular | Finalidade | Guardado? | Retenção |
| --- | --- | --- | --- | --- |
| Conta, @usuário e nome do negócio no Instagram | Proprietário (pessoa jurídica ou criador) | Mostrar a conexão e enviar | Sim | Até desconectar |
| Token da conta | Proprietário | Enviar a resposta | Cifrado | Até desconectar |
| IGSID do consumidor | Consumidor | Responder e aplicar a frequência | **Não em claro**; só HMAC da conexão | Janelas: 37 dias (24 h/7 dias) ou até desconectar ("uma vez"); execuções: 90 dias |
| Texto, anexos, nome, foto do consumidor | Consumidor | — | **Não** | — |
| Datas e situação das execuções | — | Operação e métricas | Sim | 90 dias |

Base legal proposta (a confirmar com o jurídico): execução do contrato com o proprietário para conexão e envio; legítimo interesse do proprietário, com dados mínimos e pseudônimos, para a memória de frequência do consumidor. Direitos dos titulares: o proprietário desconecta pelo painel; a Meta aciona o callback de exclusão; pedidos de consumidores vão ao canal de privacidade da Vitrine, que pode apagar a conexão (e com ela todos os hashes daquela conta).

## Texto proposto para a política de privacidade (não publicado)

> **Resposta automática no Instagram.** Se o negócio ligar a resposta automática, a Vitrine Inspira recebe da Meta um aviso quando alguém manda mensagem para o Instagram do negócio e responde uma vez com o endereço da vitrine. Não guardamos o texto das mensagens, anexos, nome ou foto de quem escreveu. Para não responder várias vezes à mesma pessoa, guardamos um código que não permite identificá-la e a data da última resposta, por até 37 dias (ou enquanto o negócio mantiver a opção "uma vez por contato"). O negócio pode desligar ou desconectar a qualquer momento; ao desconectar, apagamos a autorização e esses códigos.

## Texto proposto para os termos (não publicado)

> O proprietário que liga a resposta automática declara ter direito de usar a conta do Instagram conectada, é responsável pelo conteúdo da mensagem e concorda em não usá-la para mensagens enganosas, publicidade não solicitada ou qualquer uso contrário às políticas da Meta. A resposta só é enviada a quem escreveu primeiro, dentro das regras da Meta.

## Pendências

- [ ] Revisão jurídica da base legal, dos textos acima e do aviso de automação (Meta recomenda informar; lei exige em alguns mercados).
- [ ] Página de acompanhamento do pedido de exclusão por código (hoje a URL leva à seção de exclusão da política).
- [ ] Procedimento de rotação de `AUTO_REPLY_ENCRYPTION_KEY` com recifragem.
- [ ] Teste integrado de RLS na Data API do Supabase (como as demais migrações).
