# Preparação do login Google

Decisão aprovada, integração ainda não implementada. Nenhum segredo deve ser
colado em documentos, commits ou exemplos.

## Configuração futura

1. Criar/configurar projeto Supabase de desenvolvimento e projeto OAuth Google
   sob controle do coletivo. Definir responsáveis e recuperação administrativa.
2. Configurar consentimento e cliente OAuth para aplicação web; solicitar apenas
   identidade básica, sem permissões Drive/Gmail ou tokens offline desnecessários.
3. No Google, registrar o callback exato fornecido pelo Supabase. Esse retorno
   Google → Supabase é diferente do retorno Supabase → portal.
4. Guardar client secret no painel seguro do provedor Supabase; não no navegador
   ou repositório. Registrar client ID conforme instruções oficiais do provedor.
5. No Supabase, definir Site URL e allowlist de retorno para localhost e domínio
   definitivo do portal. Usar URLs exatas em produção; sem retorno arbitrário
   fornecido pelo usuário e sem wildcard abrangendo vitrines de clientes.
6. Implementar fluxo de código com PKCE e callback pelo SDK mantido. Autenticação
   não concede associação: autorização continua por usuário e vitrine no banco.

## Aceite antes de liberar

- Login retorna ao portal correto e reconhece usuário existente pelo ID estável.
- Cancelamento, consentimento negado e callback inválido exibem erro recuperável.
- Código reutilizado ou retorno externo não cria sessão válida.
- Sessão inválida/expirada é recusada; logout limpa estado local e respeita os
  limites de validade de tokens já emitidos, sem prometer invalidação imediata.
- Trocar de conta não mantém dados privados da sessão anterior no estado/cache.
- Email/nome Google não alteram propriedade nem concedem acesso a outra vitrine.

Contas de teste, configuração de consentimento, domínio e ambientes são pré-requisitos
da validação real. Não reportar estes cenários como executados nesta entrega.

Fontes oficiais: [Google no Supabase](https://supabase.com/docs/guides/auth/social-sign-in/auth-google),
[URLs de retorno](https://supabase.com/docs/guides/auth/redirect-urls).
