-- Migração 20261126003000_site_team_invitations.sql
-- Equipe da vitrine por link (spec 018, User Story 5): convite de uso único, guardado só
-- como hash SHA-256 do token gerado no Worker, válido por 7 dias e aceito com a sessão da
-- pessoa convidada. A tabela já aceita o tipo demo_owner da spec 018, mas aqui só o tipo
-- team é criado e aceito; demonstração e cortesia entram em migração própria.
-- Migração append-only: nunca modifique migrações anteriores.
begin;

create table if not exists private.site_invitations (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  kind text not null check (kind in ('demo_owner', 'team')),
  site_id uuid not null references public.sites(id) on delete cascade,
  role text null check (role in ('admin', 'editor', 'viewer')),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  first_opened_at timestamptz null,
  status text not null default 'open' check (status in ('open', 'accepted', 'declined', 'revoked', 'expired')),
  resolved_at timestamptz null,
  accepted_by uuid null references auth.users(id) on delete set null,
  constraint site_invitations_team_role check ((kind = 'team') = (role is not null)),
  constraint site_invitations_expiry check (
    expires_at > created_at and expires_at <= created_at + interval '7 days'
  ),
  constraint site_invitations_resolution check ((status = 'open') = (resolved_at is null))
);

-- No máximo um convite de dono aberto por demonstração (FR-008).
create unique index if not exists site_invitations_open_demo_owner_idx
  on private.site_invitations(site_id) where kind = 'demo_owner' and status = 'open';
create index if not exists site_invitations_open_expires_idx
  on private.site_invitations(expires_at) where status = 'open';
create index if not exists site_invitations_open_site_idx
  on private.site_invitations(site_id, created_at) where status = 'open';

alter table private.site_invitations enable row level security;
revoke all on private.site_invitations from public, anon, authenticated;

-- Geração: proprietário convida admin, editor ou viewer; admin da vitrine só editor ou viewer.
-- O limite de 20 convites abertos é conferido com a vitrine travada, para dois pedidos
-- simultâneos não passarem do limite.
create or replace function public.create_team_invitation(
  target_site uuid,
  target_role text,
  target_token_hash text
)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  created private.site_invitations;
  open_count integer;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'UNAUTHORIZED';
  end if;
  if target_role is null or target_role not in ('admin', 'editor', 'viewer') then
    raise exception using errcode = '22023', message = 'INVALID_ROLE';
  end if;
  if target_token_hash is null or target_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'INVALID_TOKEN_HASH';
  end if;
  if not private.has_site_role(target_site, array['owner', 'admin']) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  if target_role = 'admin' and not private.has_site_role(target_site, array['owner']) then
    raise exception using errcode = '42501', message = 'ADMIN_INVITE_OWNER_ONLY';
  end if;

  perform 1 from public.sites s where s.id = target_site for no key update;
  select count(*) into open_count
  from private.site_invitations i
  where i.site_id = target_site and i.kind = 'team' and i.status = 'open' and i.expires_at > now();
  if open_count >= 20 then
    raise exception using errcode = 'P0001', message = 'TEAM_INVITATIONS_LIMIT';
  end if;

  insert into private.site_invitations (token_hash, kind, site_id, role, created_by)
  values (target_token_hash, 'team', target_site, target_role, (select auth.uid()))
  returning * into created;
  perform private.record_audit_log(
    target_site, 'invitation_created', 'invitation', created.id::text,
    jsonb_build_object('kind', created.kind, 'role', created.role, 'expires_at', created.expires_at)
  );
  return jsonb_build_object('id', created.id, 'role', created.role, 'expires_at', created.expires_at);
end;
$$;
revoke all on function public.create_team_invitation(uuid, text, text) from public, anon;
grant execute on function public.create_team_invitation(uuid, text, text) to authenticated;

-- Revogação de convite aberto. Quem não gere a vitrine recebe o mesmo erro de convite
-- inexistente; o admin da vitrine não revoga convite de admin.
create or replace function public.revoke_invitation(target_invitation uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  invitation private.site_invitations;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'UNAUTHORIZED';
  end if;
  select * into invitation from private.site_invitations i where i.id = target_invitation for update;
  if invitation.id is null or invitation.kind <> 'team'
    or not private.has_site_role(invitation.site_id, array['owner', 'admin']) then
    raise exception using errcode = 'P0002', message = 'INVITATION_NOT_FOUND';
  end if;
  if invitation.role = 'admin' and not private.has_site_role(invitation.site_id, array['owner']) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  if invitation.status <> 'open' or invitation.expires_at <= now() then
    raise exception using errcode = 'P0002', message = 'INVITATION_NOT_FOUND';
  end if;

  update private.site_invitations
  set status = 'revoked', resolved_at = now()
  where id = invitation.id;
  perform private.record_audit_log(
    invitation.site_id, 'invitation_revoked', 'invitation', invitation.id::text,
    jsonb_build_object('kind', invitation.kind, 'role', invitation.role)
  );
  return jsonb_build_object('id', invitation.id, 'site_id', invitation.site_id, 'role', invitation.role);
end;
$$;
revoke all on function public.revoke_invitation(uuid) from public, anon;
grant execute on function public.revoke_invitation(uuid) to authenticated;

-- Aba Equipe: só proprietário e admin. Nome de exibição do perfil (ou nulo), nunca e-mail,
-- telefone ou hash. O proprietário vem de sites.owner_user_id.
create or replace function public.list_site_team(target_site uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.has_site_role(target_site, array['owner', 'admin']) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  return jsonb_build_object(
    'members', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'user_id', team.user_id,
          'display_name', nullif(trim(p.display_name), ''),
          'role', team.role
        )
        order by team.sort_order, team.joined_at, team.user_id
      )
      from (
        select s.owner_user_id as user_id, 'owner'::text as role, 0 as sort_order, s.created_at as joined_at
        from public.sites s
        where s.id = target_site and s.owner_user_id is not null
        union all
        select m.user_id, m.role, 1, m.created_at
        from public.site_memberships m
        where m.site_id = target_site
      ) team
      left join public.profiles p on p.user_id = team.user_id
    ), '[]'::jsonb),
    'invitations', coalesce((
      select jsonb_agg(
        jsonb_build_object('id', i.id, 'role', i.role, 'expires_at', i.expires_at)
        order by i.created_at, i.id
      )
      from private.site_invitations i
      where i.site_id = target_site and i.kind = 'team' and i.status = 'open' and i.expires_at > now()
    ), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.list_site_team(uuid) from public, anon;
grant execute on function public.list_site_team(uuid) to authenticated;

-- Abertura do convite (página /convite/<token> e confirmação no painel), sem sessão.
-- Só responde a convite aberto e no prazo; a primeira abertura fica registrada uma vez,
-- sem IP nem contagem (research R2).
create or replace function private.read_invitation(target_token_hash text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  invitation private.site_invitations;
  site public.sites;
begin
  if target_token_hash is null or target_token_hash !~ '^[0-9a-f]{64}$' then
    return null;
  end if;
  select * into invitation
  from private.site_invitations i
  where i.token_hash = target_token_hash and i.status = 'open' and i.expires_at > now();
  if invitation.id is null then
    return null;
  end if;
  select * into site from public.sites s where s.id = invitation.site_id;
  if invitation.kind = 'demo_owner'
    and (site.owner_user_id is not null or site.demo_expires_at is null or site.demo_expires_at <= now()) then
    return null;
  end if;
  if invitation.first_opened_at is null then
    update private.site_invitations
    set first_opened_at = now()
    where id = invitation.id and first_opened_at is null;
    if found then
      perform private.record_audit_log(
        invitation.site_id, 'invitation_opened', 'invitation', invitation.id::text,
        jsonb_build_object('kind', invitation.kind)
      );
    end if;
  end if;
  return jsonb_build_object(
    'kind', invitation.kind,
    'site_name', site.name,
    'role', invitation.role,
    'expires_at', invitation.expires_at
  );
end;
$$;
revoke all on function private.read_invitation(text) from public, anon, authenticated;

-- O PostgREST só expõe o schema public: o Worker chama esta casca com a chave de serviço.
create or replace function public.service_read_invitation(target_token_hash text)
returns jsonb language sql security definer set search_path = ''
as $$
  select private.read_invitation(target_token_hash);
$$;
revoke all on function public.service_read_invitation(text) from public, anon, authenticated;

-- Aceite com o JWT da pessoa. A linha do convite fica travada até o fim da transação:
-- de dois aceites simultâneos, o segundo encontra o convite já usado.
create or replace function public.accept_invitation(target_token_hash text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  invitation private.site_invitations;
  site public.sites;
begin
  if actor is null then
    raise exception using errcode = '42501', message = 'UNAUTHORIZED';
  end if;
  if target_token_hash is null or target_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = 'P0002', message = 'INVITATION_UNAVAILABLE';
  end if;
  select * into invitation
  from private.site_invitations i
  where i.token_hash = target_token_hash
  for update;
  -- demo_owner: o aceite do dono entra com a parte de demonstração da spec 018.
  if invitation.id is null or invitation.status <> 'open' or invitation.expires_at <= now()
    or invitation.kind <> 'team' then
    raise exception using errcode = 'P0002', message = 'INVITATION_UNAVAILABLE';
  end if;
  select * into site from public.sites s where s.id = invitation.site_id;
  if site.owner_user_id = actor or exists (
    select 1 from public.site_memberships m where m.site_id = invitation.site_id and m.user_id = actor
  ) then
    raise exception using errcode = '23505', message = 'ALREADY_MEMBER';
  end if;

  insert into public.site_memberships (site_id, user_id, role)
  values (invitation.site_id, actor, invitation.role);
  update private.site_invitations
  set status = 'accepted', resolved_at = now(), accepted_by = actor
  where id = invitation.id;
  perform private.record_audit_log(
    invitation.site_id, 'invitation_accepted', 'invitation', invitation.id::text,
    jsonb_build_object('kind', invitation.kind, 'role', invitation.role)
  );
  return jsonb_build_object('site_id', invitation.site_id, 'slug', site.slug, 'role', invitation.role);
end;
$$;
revoke all on function public.accept_invitation(text) from public, anon;
grant execute on function public.accept_invitation(text) to authenticated;

-- Limpeza agendada (Worker, chave de serviço): grava "vencido" nos convites abertos fora
-- do prazo e apaga convites resolvidos há mais de 90 dias.
create or replace function public.purge_expired_invitations()
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  expired_count integer;
  deleted_count integer;
begin
  update private.site_invitations
  set status = 'expired', resolved_at = expires_at
  where status = 'open' and expires_at <= now();
  get diagnostics expired_count = row_count;
  delete from private.site_invitations
  where status <> 'open' and resolved_at < now() - interval '90 days';
  get diagnostics deleted_count = row_count;
  return jsonb_build_object('expired', expired_count, 'deleted', deleted_count);
end;
$$;
revoke all on function public.purge_expired_invitations() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function private.read_invitation(text) to service_role;
    grant execute on function public.service_read_invitation(text) to service_role;
    grant execute on function public.purge_expired_invitations() to service_role;
  end if;
end;
$$;

commit;
