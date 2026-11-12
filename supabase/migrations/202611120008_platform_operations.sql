begin;

create function public.read_platform_overview()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_platform_admin() then
    raise exception using errcode = '42501', message = 'FORBIDDEN_PLATFORM_ADMIN';
  end if;
  return jsonb_build_object(
    'databaseBytes', pg_database_size(current_database()),
    'databaseLimitBytes', 500000000,
    'siteCount', (select count(*) from public.sites),
    'assetCount', (select count(*) from public.assets where upload_state = 'ready'),
    'activeDomainCount', (select count(*) from public.custom_domains where status = 'active'),
    'reservedDomainCount', (select reserved from private.custom_domain_quota),
    'domainLimit', 95
  );
end;
$$;
revoke all on function public.read_platform_overview() from public, anon;
grant execute on function public.read_platform_overview() to authenticated;

create function private.audit_customization_status()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if (old.status, new.status) not in (
    ('novo', 'em_analise'), ('em_analise', 'respondido'), ('respondido', 'encerrado')
  ) then
    raise exception using errcode = '23514', message = 'INVALID_CUSTOMIZATION_TRANSITION';
  end if;
  perform private.record_audit_log(
    new.site_id, 'status_changed', 'customization_request', new.id::text,
    jsonb_build_object('from', old.status, 'to', new.status)
  );
  return new;
end;
$$;
revoke all on function private.audit_customization_status() from public, anon, authenticated;
create trigger audit_customization_status
after update of status on public.customization_requests
for each row when (old.status is distinct from new.status)
execute function private.audit_customization_status();

create function private.audit_template_change()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is not null then
    perform private.record_audit_log(null, 'template_updated', 'template', new.code, '{}'::jsonb);
  end if;
  return new;
end;
$$;
revoke all on function private.audit_template_change() from public, anon, authenticated;
create trigger audit_template_change
after update on public.templates
for each row when (old is distinct from new)
execute function private.audit_template_change();

commit;
