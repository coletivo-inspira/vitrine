-- Issue #120: vitrine.json para robôs de conversa.
-- O Worker decide pelo snapshot (features.publicJson, gravado na publicação) e só
-- confere a suspensão por esta função, uma vez por falta no cache da borda. Ela devolve
-- apenas se o vitrine.json está ligado, informação que a própria rota já torna pública;
-- nenhum dado do plano ou da assinatura sai daqui.
begin;

create or replace function public.public_json_enabled(target_slug text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select 'public_json' = any(e.features)
    from public.sites s
    left join lateral private.site_entitlements(s.id) e on true
    where s.slug = target_slug and s.paused_at is null and s.archived_at is null
  ), false);
$$;

revoke all on function public.public_json_enabled(text) from public;
grant execute on function public.public_json_enabled(text) to anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.public_json_enabled(text) to service_role;
  end if;
end;
$$;

commit;
