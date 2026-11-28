# Quickstart: Hierarquia da administração, licenças e cupons

## Testes locais

```bash
npm test
node --test test/database/platform-hierarchy.test.mjs test/admin-hierarchy-routes.test.mjs test/admin-platform-ui.test.mjs
```

## Definir o Dono da plataforma (passo humano, uma vez)

1. Aplicar a migração `20261128001000_platform_hierarchy_licenses.sql` no Supabase (fluxo normal de migrações).
2. Entrar uma vez no painel com a conta do Dono, para a conta existir em `auth.users`.
3. No SQL Editor do Supabase, rodar:

   ```sql
   select private.bootstrap_platform_owner('e-mail-da-conta@exemplo.com');
   ```

   A função recusa (`PLATFORM_OWNER_EXISTS`) se já houver Dono. Não cole tokens nem senhas em issues.
4. Trocar de Dono, se um dia for preciso, também é passo humano no SQL Editor:

   ```sql
   update public.platform_operators set role = 'platform_admin' where role = 'platform_owner';
   select private.bootstrap_platform_owner('novo-dono@exemplo.com');
   ```

## Roteiro manual

1. Dono: Administração → Equipe da plataforma → dar "Administrador" a uma conta de teste.
2. Administrador: tentar dar "Administrador" a outra conta (recusado) e "Gestor de licenças" (aceito).
3. Gestor de licenças: a Administração mostra só Usuários e Licenças e cupons.
4. Usuários → abrir uma vitrine → "Conceder licença" (Profissional, 1 mês) → o plano da vitrine muda.
5. Licenças e cupons → criar cupom de 12 meses → copiar o código → com a dona de outra vitrine, Plano e cobrança → "Tenho um cupom".
6. Conferir o relatório (resgates, meses, valor) e a atividade.
