-- Pré-orçamento com webhook assinado (issue #121).
-- Append-only. Guarda, por vitrine, o endereço do webhook, o segredo cifrado pelo
-- Worker (AES-GCM com a chave de ambiente QUOTE_WEBHOOK_ENCRYPTION_KEY; o banco nunca
-- vê o segredo em claro), o último status de entrega e contadores agregados. Nenhum
-- dado do pré-orçamento (campos, itens, visitante) é gravado.
-- O endereço pode carregar um token do CRM no caminho: só o dono e os admins da vitrine
-- o leem, e a auditoria registra apenas o host.
begin;

create table if not exists private.quote_webhooks (
  site_id uuid primary key references public.sites(id) on delete cascade,
  url text null check (url is null or (url ~ '^https://' and length(url) <= 2048)),
  secret_ciphertext text null check (
    secret_ciphertext is null or (secret_ciphertext ~ '^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$' and length(secret_ciphertext) <= 512)
  ),
  secret_created_at timestamptz null,
  last_kind text null check (last_kind is null or last_kind in ('lead', 'test')),
  last_ok boolean null,
  last_http_status integer null check (last_http_status is null or last_http_status between 100 and 599),
  last_attempts integer null check (last_attempts is null or last_attempts between 1 and 3),
  last_delivery_at timestamptz null,
  delivered_count integer not null default 0 check (delivered_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  updated_at timestamptz not null default now()
);

alter table private.quote_webhooks enable row level security;
revoke all on table private.quote_webhooks from public, anon, authenticated;

create or replace function private.quote_webhook_status(target_site uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select jsonb_build_object(
      'url', w.url,
      'hasSecret', w.secret_ciphertext is not null,
      'secretCreatedAt', w.secret_created_at,
      'lastDelivery', case when w.last_delivery_at is null then null else jsonb_build_object(
        'kind', w.last_kind,
        'ok', w.last_ok,
        'httpStatus', w.last_http_status,
        'attempts', w.last_attempts,
        'at', w.last_delivery_at
      ) end,
      'totals', jsonb_build_object('delivered', w.delivered_count, 'failed', w.failed_count)
    )
    from private.quote_webhooks w
    where w.site_id = target_site
  ), jsonb_build_object(
    'url', null, 'hasSecret', false, 'secretCreatedAt', null, 'lastDelivery', null,
    'totals', jsonb_build_object('delivered', 0, 'failed', 0)
  ));
$$;

revoke all on function private.quote_webhook_status(uuid) from public, anon, authenticated;

create or replace function private.quote_webhook_host(raw_url text)
returns text
language sql
immutable
set search_path = ''
as $$
  select substring(raw_url from '^https://([^/:?#]+)');
$$;

revoke all on function private.quote_webhook_host(text) from public, anon, authenticated;

-- Leitura do dono ou admin (editor do painel e, depois, a central de canais #125).
-- Nunca devolve o segredo nem o texto cifrado.
create or replace function public.read_quote_webhook(target_site uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.has_site_role(target_site, array['owner', 'admin']) then
    raise exception using errcode = '42501', message = 'SITE_NOT_FOUND';
  end if;
  return private.quote_webhook_status(target_site);
end;
$$;

revoke all on function public.read_quote_webhook(uuid) from public, anon;
grant execute on function public.read_quote_webhook(uuid) to authenticated;

-- O Worker valida a URL (HTTPS pública, sem IP privado nem localhost) antes de chamar.
create or replace function public.save_quote_webhook_url(target_site uuid, target_url text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_site_role(target_site, array['owner', 'admin']) then
    raise exception using errcode = '42501', message = 'SITE_NOT_FOUND';
  end if;
  insert into private.quote_webhooks (site_id, url)
  values (target_site, target_url)
  on conflict (site_id) do update set url = excluded.url, updated_at = now();
  perform private.record_audit_log(
    target_site, 'quote_webhook_url', 'quote_webhook', target_site::text,
    jsonb_build_object('host', private.quote_webhook_host(target_url))
  );
  return private.quote_webhook_status(target_site);
end;
$$;

revoke all on function public.save_quote_webhook_url(uuid, text) from public, anon;
grant execute on function public.save_quote_webhook_url(uuid, text) to authenticated;

-- Recebe só o texto cifrado; o segredo em claro aparece uma única vez, na resposta do
-- Worker a quem o gerou.
create or replace function public.save_quote_webhook_secret(target_site uuid, target_ciphertext text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_site_role(target_site, array['owner', 'admin']) then
    raise exception using errcode = '42501', message = 'SITE_NOT_FOUND';
  end if;
  insert into private.quote_webhooks (site_id, secret_ciphertext, secret_created_at)
  values (target_site, target_ciphertext, now())
  on conflict (site_id) do update
    set secret_ciphertext = excluded.secret_ciphertext,
        secret_created_at = excluded.secret_created_at,
        updated_at = now();
  perform private.record_audit_log(
    target_site, 'quote_webhook_secret', 'quote_webhook', target_site::text, '{}'::jsonb
  );
  return private.quote_webhook_status(target_site);
end;
$$;

revoke all on function public.save_quote_webhook_secret(uuid, text) from public, anon;
grant execute on function public.save_quote_webhook_secret(uuid, text) to authenticated;

create or replace function public.delete_quote_webhook(target_site uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_site_role(target_site, array['owner', 'admin']) then
    raise exception using errcode = '42501', message = 'SITE_NOT_FOUND';
  end if;
  delete from private.quote_webhooks where site_id = target_site;
  perform private.record_audit_log(
    target_site, 'quote_webhook_delete', 'quote_webhook', target_site::text, '{}'::jsonb
  );
  return private.quote_webhook_status(target_site);
end;
$$;

revoke all on function public.delete_quote_webhook(uuid) from public, anon;
grant execute on function public.delete_quote_webhook(uuid) to authenticated;

-- Rota pública e "Enviar teste": só o service_role lê o destino e o texto cifrado.
create or replace function public.service_quote_webhook_target(target_slug text)
returns table (site_id uuid, url text, secret_ciphertext text)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, w.url, w.secret_ciphertext
  from public.sites s
  join private.quote_webhooks w on w.site_id = s.id
  where s.slug = target_slug
    and w.url is not null
    and w.secret_ciphertext is not null;
$$;

revoke all on function public.service_quote_webhook_target(text) from public, anon, authenticated;

create or replace function public.service_record_quote_webhook_delivery(
  target_site uuid,
  delivery_kind text,
  delivery_ok boolean,
  delivery_http_status integer,
  delivery_attempts integer
)
returns void
language sql
security definer
set search_path = ''
as $$
  update private.quote_webhooks
  set last_kind = delivery_kind,
      last_ok = delivery_ok,
      last_http_status = delivery_http_status,
      last_attempts = delivery_attempts,
      last_delivery_at = now(),
      delivered_count = delivered_count + case when delivery_kind = 'lead' and delivery_ok then 1 else 0 end,
      failed_count = failed_count + case when delivery_kind = 'lead' and not delivery_ok then 1 else 0 end
  where site_id = target_site;
$$;

revoke all on function public.service_record_quote_webhook_delivery(uuid, text, boolean, integer, integer)
  from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.service_quote_webhook_target(text) to service_role;
    grant execute on function public.service_record_quote_webhook_delivery(uuid, text, boolean, integer, integer)
      to service_role;
  end if;
end;
$$;

commit;
