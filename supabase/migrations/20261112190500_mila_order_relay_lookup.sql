-- Pedidos pela Mila (ADR 0012): a vitrine publicada mostra só o WhatsApp da Mila
-- e um código (#VI-XXXXXX-XXXX). Esta função deixa apenas operadores da plataforma
-- descobrirem, a partir do código, a vitrine e o WhatsApp do dono para repassar o pedido.
-- Cada consulta fica registrada na trilha de auditoria da vitrine.
-- Append-only: não altera migrações anteriores.
begin;

create function public.lookup_mila_relay(target_code text)
returns table (slug text, name text, whatsapp text)
language plpgsql volatile security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  normalized text := upper(btrim(coalesce(target_code, '')));
  found_row record;
begin
  if not private.is_platform_admin() then
    raise exception using errcode = '42501', message = 'FORBIDDEN_PLATFORM_ADMIN';
  end if;
  if normalized !~ '^VI-[A-Z0-9]{1,6}-[0-9A-HJKMNP-TV-Z]{4}$' then
    raise exception using errcode = '22023', message = 'INVALID_MILA_CODE';
  end if;

  for found_row in
    select
      p.site_id,
      p.slug as site_slug,
      coalesce(nullif(btrim(p.menu->>'name'), ''), s.name) as site_name,
      coalesce(nullif(btrim(d.content->>'whatsapp'), ''), nullif(pr.whatsapp, '')) as owner_whatsapp
    from public.publications p
    join public.sites s on s.id = p.site_id
    left join public.drafts d on d.site_id = p.site_id
    left join public.profiles pr on pr.user_id = s.owner_user_id
    where p.menu->'orderRelay'->>'via' = 'mila'
      and p.menu->'orderRelay'->>'code' = normalized
    order by p.slug
  loop
    perform private.record_audit_log(
      found_row.site_id, 'mila_relay_lookup', 'site', found_row.site_id::text,
      jsonb_build_object('code', normalized)
    );
    slug := found_row.site_slug;
    name := found_row.site_name;
    whatsapp := found_row.owner_whatsapp;
    return next;
  end loop;
end;
$$;

revoke all on function public.lookup_mila_relay(text) from public, anon;
grant execute on function public.lookup_mila_relay(text) to authenticated;

commit;
