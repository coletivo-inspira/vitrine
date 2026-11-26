import { PGlite } from '@electric-sql/pglite';
import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

const owner = '10000000-0000-0000-0000-0000000000b1';
const siteAdmin = '10000000-0000-0000-0000-0000000000b2';
const editor = '10000000-0000-0000-0000-0000000000b3';
const viewer = '10000000-0000-0000-0000-0000000000b4';
const invitee = '10000000-0000-0000-0000-0000000000b5';
const stranger = '10000000-0000-0000-0000-0000000000b6';
const siteId = '20000000-0000-0000-0000-0000000000b1';
const otherSiteId = '20000000-0000-0000-0000-0000000000b2';

const hashOf = (token) => createHash('sha256').update(token).digest('hex');

async function setupDb() {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated, anon;
    grant execute on function auth.uid() to authenticated, anon;
  `);
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const migrationsDir = resolve(root, 'supabase/migrations');
  for (const file of (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort()) {
    await db.exec(await readFile(resolve(migrationsDir, file), 'utf8'));
  }
  await db.query(
    'insert into auth.users (id) values ($1), ($2), ($3), ($4), ($5), ($6)',
    [owner, siteAdmin, editor, viewer, invitee, stranger]
  );
  await db.query(
    `insert into public.profiles (user_id, display_name, whatsapp) values ($1, 'Ana Dona', '5511911111111'), ($2, '  ', '')`,
    [owner, editor]
  );
  await db.query(
    `insert into public.sites (id, owner_user_id, slug, name) values ($1, $3, 'pizza-equipe', 'Pizza Equipe'), ($2, $3, 'pizza-outra', 'Pizza Outra')`,
    [siteId, otherSiteId, owner]
  );
  await db.query(
    `insert into public.site_memberships (site_id, user_id, role) values ($1, $2, 'admin'), ($1, $3, 'editor'), ($1, $4, 'viewer')`,
    [siteId, siteAdmin, editor, viewer]
  );
  return db;
}

async function as(db, userId, fn, role = 'authenticated') {
  await db.exec('begin');
  try {
    await db.exec(`set local role ${role}`);
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [userId ?? '']);
    const result = await fn();
    await db.exec('commit');
    return result;
  } catch (error) {
    await db.exec('rollback');
    throw error;
  }
}

const createInvite = (db, user, role, token, site = siteId) => as(db, user, () => db.query(
  'select public.create_team_invitation($1, $2, $3) as row', [site, role, hashOf(token)]
).then((r) => r.rows[0].row));
const accept = (db, user, token) => as(db, user, () => db.query(
  'select public.accept_invitation($1) as row', [hashOf(token)]
).then((r) => r.rows[0].row));
const listTeam = (db, user, site = siteId) => as(db, user, () => db.query(
  'select public.list_site_team($1) as team', [site]
).then((r) => r.rows[0].team));
const revoke = (db, user, id) => as(db, user, () => db.query(
  'select public.revoke_invitation($1) as row', [id]
).then((r) => r.rows[0].row));
const readAsService = (db, token) => db.query(
  'select public.service_read_invitation($1) as row', [hashOf(token)]
).then((r) => r.rows[0].row);

test('convites de equipe: sem acesso direto à tabela e só proprietário ou admin convidam', async (t) => {
  const db = await setupDb();
  t.after(() => db.close());

  await assert.rejects(as(db, owner, () => db.query('select * from private.site_invitations')), /permission denied/);
  await assert.rejects(as(db, null, () => db.query('select * from private.site_invitations'), 'anon'), /permission denied/);
  await assert.rejects(as(db, owner, () => db.query(
    `insert into private.site_invitations (token_hash, kind, site_id, role, created_by) values ($1, 'team', $2, 'editor', $3)`,
    [hashOf('direto'), siteId, owner]
  )), /permission denied/);
  await assert.rejects(as(db, null, () => db.query(
    'select public.create_team_invitation($1, $2, $3)', [siteId, 'editor', hashOf('anon')]
  ), 'anon'), /permission denied/);
  await assert.rejects(as(db, owner, () => db.query('select public.service_read_invitation($1)', [hashOf('x')])), /permission denied/);
  await assert.rejects(as(db, owner, () => db.query('select private.read_invitation($1)', [hashOf('x')])), /permission denied/);
  await assert.rejects(as(db, owner, () => db.query('select public.purge_expired_invitations()')), /permission denied/);

  await assert.rejects(createInvite(db, editor, 'viewer', 'editor-1'), (error) => error.code === '42501' && /FORBIDDEN/.test(error.message));
  await assert.rejects(createInvite(db, viewer, 'viewer', 'viewer-1'), /FORBIDDEN/);
  await assert.rejects(createInvite(db, stranger, 'viewer', 'stranger-1'), /FORBIDDEN/);
  await assert.rejects(createInvite(db, siteAdmin, 'admin', 'admin-admin'), /ADMIN_INVITE_OWNER_ONLY/);
  await assert.rejects(createInvite(db, siteAdmin, 'viewer', 'admin-outra', otherSiteId), /FORBIDDEN/);
  await assert.rejects(createInvite(db, owner, 'owner', 'dono-dono'), /INVALID_ROLE/);
  await assert.rejects(as(db, owner, () => db.query(
    'select public.create_team_invitation($1, $2, $3)', [siteId, 'editor', 'nao-e-hash']
  )), /INVALID_TOKEN_HASH/);
  assert.equal((await db.query('select count(*)::int as n from private.site_invitations')).rows[0].n, 0);

  const byOwner = await createInvite(db, owner, 'admin', 'dono-admin');
  assert.equal(byOwner.role, 'admin');
  const byAdmin = await createInvite(db, siteAdmin, 'editor', 'admin-editor');
  assert.equal(byAdmin.role, 'editor');
  const { rows: [stored] } = await db.query(
    `select token_hash, expires_at - created_at = interval '7 days' as week, status from private.site_invitations where id = $1`,
    [byAdmin.id]
  );
  assert.deepEqual(stored, { token_hash: hashOf('admin-editor'), week: true, status: 'open' });

  for (let index = 2; index < 20; index += 1) {
    await createInvite(db, owner, 'viewer', `limite-${index}`);
  }
  await assert.rejects(createInvite(db, owner, 'viewer', 'limite-21'), /TEAM_INVITATIONS_LIMIT/);
  await db.query(`update private.site_invitations set created_at = now() - interval '1 day', expires_at = now() - interval '1 minute' where id = $1`, [byOwner.id]);
  assert.equal((await createInvite(db, owner, 'viewer', 'limite-depois-do-prazo')).role, 'viewer');
});

test('aceite cria a associação com o papel, uma vez só, e recusa quem já é da equipe', async (t) => {
  const db = await setupDb();
  t.after(() => db.close());

  const invitation = await createInvite(db, owner, 'editor', 'convite-editor');
  await assert.rejects(as(db, null, () => db.query('select public.accept_invitation($1)', [hashOf('convite-editor')]), 'anon'), /permission denied/);
  await assert.rejects(accept(db, '', 'convite-editor'), /UNAUTHORIZED/);

  await assert.rejects(accept(db, editor, 'convite-editor'), (error) => error.code === '23505' && /ALREADY_MEMBER/.test(error.message));
  await assert.rejects(accept(db, owner, 'convite-editor'), /ALREADY_MEMBER/);
  assert.equal((await db.query('select status from private.site_invitations where id = $1', [invitation.id])).rows[0].status, 'open');

  const accepted = await accept(db, invitee, 'convite-editor');
  assert.deepEqual(accepted, { site_id: siteId, slug: 'pizza-equipe', role: 'editor' });
  const { rows: [membership] } = await db.query(
    'select role from public.site_memberships where site_id = $1 and user_id = $2', [siteId, invitee]);
  assert.equal(membership.role, 'editor');
  assert.equal((await db.query('select count(*)::int as n from public.site_memberships where user_id = $1', [invitee])).rows[0].n, 1);
  const { rows: [resolved] } = await db.query(
    'select status, accepted_by, resolved_at is not null as resolved from private.site_invitations where id = $1', [invitation.id]);
  assert.deepEqual(resolved, { status: 'accepted', accepted_by: invitee, resolved: true });
  assert.equal((await as(db, invitee, () => db.query('select id from public.sites where id = $1', [otherSiteId]))).rows.length, 0);

  await assert.rejects(accept(db, stranger, 'convite-editor'), (error) => error.code === 'P0002' && /INVITATION_UNAVAILABLE/.test(error.message));
  await assert.rejects(accept(db, stranger, 'convite-inexistente'), /INVITATION_UNAVAILABLE/);
  await assert.rejects(as(db, stranger, () => db.query('select public.accept_invitation($1)', ['curto'])), /INVITATION_UNAVAILABLE/);

  const revoked = await createInvite(db, owner, 'viewer', 'convite-revogado');
  assert.equal((await revoke(db, owner, revoked.id)).id, revoked.id);
  await assert.rejects(accept(db, stranger, 'convite-revogado'), /INVITATION_UNAVAILABLE/);
  await assert.rejects(revoke(db, owner, revoked.id), /INVITATION_NOT_FOUND/);

  const expired = await createInvite(db, owner, 'viewer', 'convite-vencido');
  await db.query(`update private.site_invitations set created_at = now() - interval '8 days', expires_at = now() - interval '1 day' where id = $1`, [expired.id]);
  await assert.rejects(accept(db, stranger, 'convite-vencido'), /INVITATION_UNAVAILABLE/);
  assert.equal(await readAsService(db, 'convite-vencido'), null);

  await db.query(
    `insert into public.sites (id, owner_user_id, slug, name, demo_source, demo_expires_at) values ($1, null, 'demo-equipe', 'Demo', 'linktree', now() + interval '10 days')`,
    ['20000000-0000-0000-0000-0000000000b9']
  );
  await db.query(
    `insert into private.site_invitations (token_hash, kind, site_id, created_by) values ($1, 'demo_owner', $2, $3)`,
    [hashOf('convite-demo'), '20000000-0000-0000-0000-0000000000b9', owner]
  );
  await assert.rejects(accept(db, stranger, 'convite-demo'), /INVITATION_UNAVAILABLE/);
  assert.equal((await db.query('select owner_user_id from public.sites where slug = $1', ['demo-equipe'])).rows[0].owner_user_id, null);
});

test('revogação respeita a regra de admin e quem não gere a vitrine não enxerga o convite', async (t) => {
  const db = await setupDb();
  t.after(() => db.close());
  const adminInvite = await createInvite(db, owner, 'admin', 'revogar-admin');
  const viewerInvite = await createInvite(db, owner, 'viewer', 'revogar-viewer');

  await assert.rejects(revoke(db, siteAdmin, adminInvite.id), (error) => error.code === '42501' && /FORBIDDEN/.test(error.message));
  await assert.rejects(revoke(db, editor, viewerInvite.id), /INVITATION_NOT_FOUND/);
  await assert.rejects(revoke(db, stranger, viewerInvite.id), /INVITATION_NOT_FOUND/);
  assert.equal((await revoke(db, siteAdmin, viewerInvite.id)).id, viewerInvite.id);
  assert.equal((await revoke(db, owner, adminInvite.id)).id, adminInvite.id);
});

test('list_site_team mostra nomes e convites abertos, sem e-mail, telefone ou hash', async (t) => {
  const db = await setupDb();
  t.after(() => db.close());
  const open = await createInvite(db, owner, 'viewer', 'lista-aberto');
  const gone = await createInvite(db, owner, 'editor', 'lista-revogado');
  await revoke(db, owner, gone.id);

  await assert.rejects(listTeam(db, editor), /FORBIDDEN/);
  await assert.rejects(listTeam(db, viewer), /FORBIDDEN/);
  await assert.rejects(listTeam(db, stranger), /FORBIDDEN/);
  await assert.rejects(as(db, null, () => db.query('select public.list_site_team($1)', [siteId]), 'anon'), /permission denied/);

  const team = await listTeam(db, siteAdmin);
  assert.deepEqual(team.members, [
    { user_id: owner, display_name: 'Ana Dona', role: 'owner' },
    { user_id: siteAdmin, display_name: null, role: 'admin' },
    { user_id: editor, display_name: null, role: 'editor' },
    { user_id: viewer, display_name: null, role: 'viewer' }
  ]);
  assert.deepEqual(team.invitations.map((entry) => Object.keys(entry).sort()), [['expires_at', 'id', 'role']]);
  assert.equal(team.invitations[0].id, open.id);
  const serialized = JSON.stringify(await listTeam(db, owner));
  assert.doesNotMatch(serialized, /5511911111111|token|hash|email|whatsapp/i);
  assert.ok(!serialized.includes(hashOf('lista-aberto')));
});

test('abertura marca a primeira vez e a auditoria nunca guarda token nem hash', async (t) => {
  const db = await setupDb();
  t.after(() => db.close());
  const invitation = await createInvite(db, owner, 'viewer', 'abrir-convite');

  assert.deepEqual(await readAsService(db, 'abrir-convite'), {
    kind: 'team', site_name: 'Pizza Equipe', role: 'viewer', expires_at: invitation.expires_at
  });
  assert.ok((await readAsService(db, 'abrir-convite')).kind);
  assert.equal(await readAsService(db, 'nao-existe'), null);
  assert.equal((await db.query('select private.read_invitation($1) as row', ['nao-e-hash'])).rows[0].row, null);
  const { rows: [opened] } = await db.query(
    'select first_opened_at is not null as opened from private.site_invitations where id = $1', [invitation.id]);
  assert.equal(opened.opened, true);

  await accept(db, invitee, 'abrir-convite');
  assert.equal(await readAsService(db, 'abrir-convite'), null);

  const { rows: logs } = await db.query(
    `select action, actor_user_id, entity_type, entity_id, summary from public.audit_logs
     where entity_type = 'invitation' order by created_at, action`);
  assert.deepEqual(logs.map((row) => row.action).sort(), ['invitation_accepted', 'invitation_created', 'invitation_opened']);
  assert.ok(logs.every((row) => row.entity_id === invitation.id));
  assert.equal(logs.find((row) => row.action === 'invitation_opened').actor_user_id, null);
  assert.equal(logs.find((row) => row.action === 'invitation_accepted').actor_user_id, invitee);
  const serialized = JSON.stringify(logs);
  assert.ok(!serialized.includes(hashOf('abrir-convite')));
  assert.ok(!serialized.includes('abrir-convite'));
  assert.doesNotMatch(serialized, /token|hash/i);
});

test('limpeza grava vencidos e apaga resolvidos há mais de 90 dias', async (t) => {
  const db = await setupDb();
  t.after(() => db.close());
  const stale = await createInvite(db, owner, 'viewer', 'limpeza-vencido');
  const old = await createInvite(db, owner, 'viewer', 'limpeza-antigo');
  const fresh = await createInvite(db, owner, 'viewer', 'limpeza-novo');
  await db.query(`update private.site_invitations set created_at = now() - interval '8 days', expires_at = now() - interval '1 day' where id = $1`, [stale.id]);
  await revoke(db, owner, old.id);
  await db.query(`update private.site_invitations set resolved_at = now() - interval '91 days' where id = $1`, [old.id]);

  assert.deepEqual((await db.query('select public.purge_expired_invitations() as result')).rows[0].result, { expired: 1, deleted: 1 });
  const { rows } = await db.query('select id, status from private.site_invitations order by created_at');
  assert.deepEqual(
    Object.fromEntries(rows.map((row) => [row.id, row.status])),
    { [stale.id]: 'expired', [fresh.id]: 'open' }
  );
});
