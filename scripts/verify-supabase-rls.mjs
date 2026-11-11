import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = fileURLToPath(new URL('../', import.meta.url));
const MIGRATION_PATH = resolve(ROOT_DIR, 'supabase/migrations/202611070001_site_access.sql');
const PROTECTED_TABLES = ['sites', 'site_memberships', 'drafts'];

export function redactSecrets(input, extraSecrets = []) {
  let text = String(input ?? '');
  for (const secret of extraSecrets) {
    if (secret && typeof secret === 'string' && secret.length >= 6) {
      text = text.replaceAll(secret, '[REDACTED]');
    }
  }
  return text
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[REDACTED_JWT]')
    .replace(/\bsb_(?:secret|publishable)_[A-Za-z0-9_-]+/g, '[REDACTED_SUPABASE_KEY]')
    .replace(/\bsbp_[A-Za-z0-9_-]+/g, '[REDACTED_SUPABASE_TOKEN]')
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, '$1[REDACTED]');
}

export function parseVerifyArgs(argv) {
  const options = {
    selfTest: false,
  };

  for (const arg of argv) {
    if (
      /^--(?:key|token|secret|service-role|password|apikey)(?:=|$)/i.test(arg) ||
      /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(arg) ||
      /\bsb_secret_[A-Za-z0-9_-]+/.test(arg) ||
      /\bsbp_[A-Za-z0-9_-]+/.test(arg)
    ) {
      throw new Error(
        'Security violation (Principle III): Never pass keys or tokens via CLI arguments. Use environment variables SUPABASE_URL and SUPABASE_ANON_KEY.',
      );
    }

    if (arg === '--self-test') {
      options.selfTest = true;
    } else {
      throw new Error(`Unsupported argument: ${redactSecrets(arg)}`);
    }
  }

  return options;
}

export function validateRemoteConfig(env = process.env) {
  const rawUrl = env.SUPABASE_URL;
  const anonKey = env.SUPABASE_ANON_KEY;

  if (!rawUrl || typeof rawUrl !== 'string') {
    throw new Error('Missing SUPABASE_URL environment variable (or pass --self-test for local PGlite verification)');
  }
  if (!anonKey || typeof anonKey !== 'string' || anonKey.trim().length < 16) {
    throw new Error('Missing SUPABASE_ANON_KEY environment variable (or pass --self-test for local PGlite verification)');
  }
  if (/\bsb_secret_/.test(anonKey) || env.SUPABASE_SERVICE_ROLE_KEY === anonKey) {
    throw new Error('Security violation: SUPABASE_ANON_KEY must be the public anonymous key, never the service_role key');
  }

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('Invalid SUPABASE_URL format');
  }
  if (parsed.username || parsed.password) {
    throw new Error('Security violation (Principle III): SUPABASE_URL must not contain embedded credentials');
  }
  const allowLocalHttp = env.SUPABASE_ALLOW_LOCAL_HTTP === '1';
  const isLoopback = parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost';
  if (parsed.protocol !== 'https:' && !(allowLocalHttp && parsed.protocol === 'http:' && isLoopback)) {
    throw new Error('SUPABASE_URL must use https: protocol');
  }

  return {
    baseUrl: new URL(parsed.pathname.replace(/\/+$/, '') || '/', parsed.origin).toString().replace(/\/$/, ''),
    anonKey: anonKey.trim(),
  };
}

export async function runLocalSelfTest(migrationPath = MIGRATION_PATH) {
  const db = new PGlite();
  try {
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

    const migrationSql = await readFile(migrationPath, 'utf8');
    await db.exec(migrationSql);

    const ownerId = '10000000-0000-0000-0000-000000000001';
    const memberId = '10000000-0000-0000-0000-000000000002';
    const strangerId = '10000000-0000-0000-0000-000000000003';
    const siteId = '20000000-0000-0000-0000-000000000001';

    await db.query('insert into auth.users values ($1), ($2), ($3)', [ownerId, memberId, strangerId]);
    await db.query(
      "insert into public.sites(id, owner_user_id, slug, name) values ($1, $2, 'pizzaria-verificacao', 'Pizzaria Verificacao')",
      [siteId, ownerId],
    );
    await db.query('insert into public.site_memberships(site_id, user_id) values ($1, $2)', [siteId, memberId]);
    await db.query("insert into public.drafts(site_id, content) values ($1, '{\"businessName\":\"Pizzaria Verificacao\"}')", [
      siteId,
    ]);

    const rlsCheck = await db.query(
      `select tablename, rowsecurity
       from pg_tables
       where schemaname = 'public' and tablename = any($1::text[])
       order by tablename`,
      [PROTECTED_TABLES],
    );
    if (rlsCheck.rows.length !== PROTECTED_TABLES.length || rlsCheck.rows.some(r => r.rowsecurity !== true)) {
      throw new Error('RLS verification failed: not all protected tables have row level security enabled');
    }

    async function asRole(role, userId, fn) {
      await db.exec('begin');
      try {
        await db.exec(`set local role ${role}`);
        await db.query("select set_config('request.jwt.claim.sub', $1, true)", [userId ?? '']);
        return await fn();
      } finally {
        await db.exec('rollback');
      }
    }

    const anonBlockedStatements = [
      { label: 'anon SELECT public.sites', sql: 'select * from public.sites' },
      { label: 'anon SELECT public.site_memberships', sql: 'select * from public.site_memberships' },
      { label: 'anon SELECT public.drafts', sql: 'select * from public.drafts' },
      {
        label: 'anon INSERT public.sites',
        sql: "insert into public.sites(owner_user_id, slug, name) values ('10000000-0000-0000-0000-000000000001', 'inv', 'Inv')",
      },
      {
        label: 'anon INSERT public.site_memberships',
        sql: "insert into public.site_memberships(site_id, user_id) values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003')",
      },
      {
        label: 'anon INSERT public.drafts',
        sql: "insert into public.drafts(site_id, content) values ('20000000-0000-0000-0000-000000000001', '{}')",
      },
      { label: 'anon UPDATE public.sites', sql: "update public.sites set name = 'Hacked'" },
      {
        label: 'anon UPDATE public.site_memberships',
        sql: "update public.site_memberships set user_id = '10000000-0000-0000-0000-000000000003'",
      },
      { label: 'anon UPDATE public.drafts', sql: "update public.drafts set content = '{}'" },
      { label: 'anon DELETE public.sites', sql: 'delete from public.sites' },
      { label: 'anon DELETE public.site_memberships', sql: 'delete from public.site_memberships' },
      { label: 'anon DELETE public.drafts', sql: 'delete from public.drafts' },
      { label: 'anon EXECUTE private.accessible_site_ids()', sql: 'select private.accessible_site_ids()' },
    ];

    const results = [];
    for (const check of anonBlockedStatements) {
      let blockedWithCode = null;
      try {
        await asRole('anon', null, () => db.query(check.sql));
      } catch (err) {
        blockedWithCode = err?.code || 'ERROR';
      }
      if (blockedWithCode !== '42501') {
        throw new Error(`Expected SQLSTATE 42501 for "${check.label}", but got ${blockedWithCode ?? 'SUCCESS'}`);
      }
      results.push({ check: check.label, status: 'blocked', sqlstate: blockedWithCode });
    }

    await asRole('authenticated', strangerId, async () => {
      for (const table of PROTECTED_TABLES) {
        const res = await db.query(`select count(*)::int as total from public.${table}`);
        if (res.rows[0].total !== 0) {
          throw new Error(`RLS isolation failure: unassociated authenticated user saw rows in public.${table}`);
        }
        results.push({ check: `stranger SELECT public.${table}`, status: 'isolated', rows: 0 });
      }
    });

    return {
      ok: true,
      mode: 'self-test',
      tablesProtected: PROTECTED_TABLES,
      checksPassed: results.length,
    };
  } finally {
    await db.close();
  }
}

export async function runRemoteVerification(config, fetchImpl = fetch) {
  const { baseUrl, anonKey } = config;
  const headers = {
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
    Accept: 'application/json',
  };

  const checks = [];
  for (const table of PROTECTED_TABLES) {
    const readRes = await fetchImpl(`${baseUrl}/rest/v1/${table}?select=*&limit=1`, {
      method: 'GET',
      headers,
    });

    if (readRes.status === 401 || readRes.status === 403) {
      checks.push({ table, operation: 'GET', status: 'blocked', httpStatus: readRes.status });
    } else if (readRes.ok) {
      const body = await readRes.json();
      if (Array.isArray(body) && body.length > 0) {
        throw new Error(`Security breach: anonymous GET on /rest/v1/${table} returned ${body.length} row(s)`);
      }
      throw new Error(
        `Grant mismatch on /rest/v1/${table}: expected HTTP 401/403 (SQLSTATE 42501 revoke on anon), got HTTP ${readRes.status}`,
      );
    } else {
      checks.push({ table, operation: 'GET', status: 'blocked', httpStatus: readRes.status });
    }

    const writeRes = await fetchImpl(`${baseUrl}/rest/v1/${table}`, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    if (writeRes.ok) {
      throw new Error(`Security breach: anonymous POST on /rest/v1/${table} succeeded with HTTP ${writeRes.status}`);
    }
    checks.push({ table, operation: 'POST', status: 'blocked', httpStatus: writeRes.status });
  }

  const rpcRes = await fetchImpl(`${baseUrl}/rest/v1/rpc/accessible_site_ids`, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });
  if (rpcRes.ok) {
    throw new Error('Security breach: private function accessible_site_ids is publicly callable via anon RPC');
  }
  checks.push({ rpc: 'accessible_site_ids', operation: 'POST', status: 'blocked', httpStatus: rpcRes.status });

  return {
    ok: true,
    mode: 'remote',
    projectHost: new URL(baseUrl).host,
    tablesProtected: PROTECTED_TABLES,
    checksPassed: checks.length,
  };
}

export async function runVerify(argv = process.argv.slice(2), deps = {}) {
  const options = parseVerifyArgs(argv);
  const summary = options.selfTest
    ? await runLocalSelfTest(deps.migrationPath || MIGRATION_PATH)
    : await runRemoteVerification(validateRemoteConfig(deps.env || process.env), deps.fetchImpl || fetch);

  console.log(JSON.stringify(summary));
  return summary;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  runVerify().catch(error => {
    const secrets = [process.env.SUPABASE_ANON_KEY, process.env.SUPABASE_SERVICE_ROLE_KEY, process.env.SUPABASE_ADMIN_KEY];
    console.error(redactSecrets(error?.message || String(error), secrets));
    process.exitCode = 1;
  });
}
