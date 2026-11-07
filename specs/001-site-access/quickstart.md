# Guia de validação planejada

Estado: projeto remoto e migrações ainda inexistentes; este guia descreve o aceite
da próxima implementação, não comandos de banco já disponíveis.

Agora: Node 22+; `npm test` executa os cinco testes da projeção pública.

Na implementação:

1. Preparar ambiente Supabase local conforme documentação oficial; registrar a
   versão do CLI e runtime usados. Não vincular produção nos testes.
2. Criar migrações e testes em `supabase/migrations/` e `supabase/tests/`.
3. Preparar dono D com sites A/B, membro M só de A, usuário externo E e visitante.
4. Executar as operações do contrato com os papéis/sessões reais D, M, E e anon.
   Não usar service role como cliente dos testes de autorização.
5. Verificar listagem, leitura direta, edição, alteração de owner/site_id, autoassociação,
   remoção de vínculo e token ausente/expirado. Incluir troca manual de identificador.
6. Validar duas edições concorrentes com a mesma revisão: uma vence; outra não
   sobrescreve e recebe indicação de conflito.
7. Registrar comandos efetivos, resultados e limitações; liberar só após a matriz passar.

Ver [contrato](contracts/access.md) e [modelo](data-model.md). Autenticação de interface,
cadastro e deploy não estão incluídos nesta validação da camada de acesso.
