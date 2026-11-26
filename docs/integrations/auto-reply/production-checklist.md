# Checklist de produção da AutoResposta

Nenhum item abaixo está concluído em ambiente real. Marcar só com evidência (link, data, responsável).

## Etapas

1. **Desenvolvimento** (este PR): código, migração e testes com Meta simulada. ✅ no repositório; sem deploy.
2. **Piloto interno**: contas do Coletivo como testadores; app em desenvolvimento; staging.
3. **Homologação**: callbacks próprios, segredos isolados, contas autorizadas, testes reais controlados.
4. **Aprovação Meta**: Revisão do app e Verificação da empresa.
5. **Liberação controlada**: interruptores ligados e poucas vitrines liberadas.
6. **Produção**: liberação gradual com monitoramento.

## Antes do piloto interno

- [ ] ADR 0017 ratificado.
- [ ] Autenticação Cloudflare e deploy de staging autorizados (hoje não configurados).
- [ ] Migração `20261126001000_auto_reply.sql` aplicada em staging; teste de RLS pela Data API.
- [ ] Segredos de staging no cofre: `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN`, `AUTO_REPLY_ENCRYPTION_KEY`, `SUPABASE_SERVICE_ROLE_KEY`; vars `META_APP_ID`, `META_IG_AUTOREPLY_CONFIG_ID`.
- [ ] Configuração da AutoResposta, URL de redirecionamento e webhook no console (`meta-setup.md`).
- [ ] Contas testadoras convidadas e aceitas.

## Antes da homologação

- [ ] Primeiro evento real recebido de uma conta testadora (e registro de qual identificador chega nos callbacks, item 16 de #48).
- [ ] Teste da limitação de webhooks com conta sem Página vinculada; decidir sobre o contorno.
- [ ] Desconectar, reconectar, revogar no portfólio e conferir `reconnect_required`.
- [ ] Logs revisados em staging: sem token, segredo, texto ou identificador.

## Antes da liberação

- [ ] Política de privacidade e termos publicados com a AutoResposta (revisão jurídica).
- [ ] Callbacks de exclusão e desautorização cadastrados.
- [ ] Revisão do app aprovada para `instagram_basic` e `instagram_manage_messages` (Acesso avançado).
- [ ] Verificação da empresa concluída; app em modo Live.
- [ ] Tela de administração (issue 07) ou procedimento por `curl` treinado.
- [ ] Alertas: `auto_reply_webhook_rejected` em volume, `auth_failures` > 0, execuções `uncertain`.
- [ ] Plano de contingência testado (`operational-runbook.md`).

## Critérios de aceite do MVP (estado em 2026-11-26)

| Critério | Estado |
| --- | --- |
| Conectar sem conhecimento técnico | Fluxo implementado; sem teste com pessoa real |
| Mecanismo oficial | Login unificado da Meta; não configurado no console |
| Dados protegidos | Cifra, RLS e logs testados localmente |
| Conta associada à vitrine | Testado (memória e PGlite) |
| Mensagem configurável, URL automática, ativar/desativar | Testado |
| Interação elegível gera envio, sem duplicados, frequência | Testado com Meta simulada |
| Não responde a si mesma | Testado (eco, `is_self`) |
| Atendimento continua no Instagram | Por construção (uma mensagem só); sem teste real |
| Domínio novo refletido; despublicada não gera link | Testado |
| Token inválido interrompe; reconexão; desconexão | Testado |
| Isolamento validado | Testado em PGlite e rotas; falta Data API |
| Conversas não armazenadas | Testado (banco e logs) |
| Falhas monitoradas | Logs e métricas agregadas; sem alertas configurados |
| Docs atualizadas | Este PR |
| Issues com evidências | Backlog em markdown (sem permissão de escrita no GitHub) |
| Piloto executado | **Não** |
| Requisitos Meta atendidos | **Não** |
| Contingência | Documentada; não exercitada |
| Desligável sem afetar vitrines | Interruptores testados; rotas isoladas da vitrine pública |
