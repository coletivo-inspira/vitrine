import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = fileURLToPath(new URL('../', import.meta.url));
const MIGRATIONS_DIR = resolve(ROOT_DIR, 'supabase/migrations');
const DEFAULT_BACKUP_DIR = resolve(ROOT_DIR, 'supabase/.temp/backups');
const FORBIDDEN_DIRS = [
  resolve(ROOT_DIR, 'dist'),
  resolve(ROOT_DIR, 'web'),
  resolve(ROOT_DIR, 'src'),
  resolve(ROOT_DIR, 'supabase/migrations'),
];
const PROTECTED_TABLES = [
  { name: 'sites', order: 'id.asc' },
  { name: 'site_memberships', order: 'site_id.asc,user_id.asc' },
  { name: 'drafts', order: 'site_id.asc' },
];

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

export function parseCliArgs(argv) {
  const options = {
    dryRun: false,
    check: false,
    outputDir: process.env.BACKUP_OUTPUT_DIR || DEFAULT_BACKUP_DIR,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (
      /^--(?:key|token|secret|service-role|password|apikey)(?:=|$)/i.test(arg) ||
      /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(arg) ||
      /\bsb_secret_[A-Za-z0-9_-]+/.test(arg) ||
      /\bsbp_[A-Za-z0-9_-]+/.test(arg)
    ) {
      throw new Error(
        'Security violation (Principle III): Never pass credentials via CLI arguments. Use environment variables SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
      );
    }

    if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--check') {
      options.check = true;
      options.dryRun = true;
    } else if (arg === '--output-dir') {
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) {
        throw new Error('Missing value for --output-dir');
      }
      options.outputDir = next;
      i += 1;
    } else if (arg.startsWith('--output-dir=')) {
      options.outputDir = arg.slice('--output-dir='.length);
    } else {
      throw new Error(`Unsupported argument: ${redactSecrets(arg)}`);
    }
  }

  options.outputDir = validateBackupOutputDir(options.outputDir);
  return options;
}

export function validateBackupOutputDir(targetDir) {
  if (!targetDir || typeof targetDir !== 'string' || !targetDir.trim()) {
    throw new Error('Backup output directory must be a non-empty path');
  }
  const resolved = isAbsolute(targetDir) ? resolve(targetDir) : resolve(ROOT_DIR, targetDir);
  for (const forbidden of FORBIDDEN_DIRS) {
    const rel = relative(forbidden, resolved);
    if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) {
      throw new Error(
        `Security violation: Backup output directory cannot be inside public or source tree (${forbidden})`,
      );
    }
  }
  return resolved;
}

export function validateSupabaseUrl(rawUrl, allowLocalHttp = process.env.SUPABASE_ALLOW_LOCAL_HTTP === '1') {
  if (!rawUrl || typeof rawUrl !== 'string') {
    throw new Error('Missing SUPABASE_URL environment variable');
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
  if (parsed.search || parsed.hash) {
    throw new Error('SUPABASE_URL must be a base origin URL without query string or hash');
  }
  const isLoopback = parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost';
  if (parsed.protocol !== 'https:' && !(allowLocalHttp && parsed.protocol === 'http:' && isLoopback)) {
    throw new Error('SUPABASE_URL must use https: protocol');
  }
  return new URL(parsed.pathname.replace(/\/+$/, '') || '/', parsed.origin).toString().replace(/\/$/, '');
}

export async function inspectLocalMigrations(migrationsDir = MIGRATIONS_DIR) {
  const entries = (await readdir(migrationsDir)).filter(file => file.endsWith('.sql')).sort();
  if (entries.length === 0) {
    throw new Error('No SQL migrations found in supabase/migrations');
  }

  const migrations = [];
  let combinedSql = '';
  for (const filename of entries) {
    const fullPath = resolve(migrationsDir, filename);
    const content = await readFile(fullPath, 'utf8');
    const sha256 = createHash('sha256').update(content, 'utf8').digest('hex');
    migrations.push({
      filename,
      sha256,
      bytes: Buffer.byteLength(content, 'utf8'),
    });
    combinedSql += `\n${content}`;
  }

  for (const table of PROTECTED_TABLES) {
    const tablePattern = new RegExp(`create\\s+table\\s+public\\.${table.name}\\b`, 'i');
    const rlsPattern = new RegExp(
      `alter\\s+table\\s+public\\.${table.name}\\s+enable\\s+row\\s+level\\s+security`,
      'i',
    );
    if (!tablePattern.test(combinedSql)) {
      throw new Error(`Migration verification failed: table public.${table.name} not found in local migrations`);
    }
    if (!rlsPattern.test(combinedSql)) {
      throw new Error(`Migration verification failed: RLS not enabled on public.${table.name}`);
    }
  }

  return migrations;
}

export function canonicalizeValue(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalizeValue);
  }
  if (value && typeof value === 'object') {
    const sorted = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = canonicalizeValue(value[key]);
    }
    return sorted;
  }
  return value;
}

export function buildBackupArtifact({ generatedAt, projectHost, migrations, tables, mode }) {
  const payload = canonicalizeValue({
    schemaVersion: 1,
    safeguard: {
      principle: 'IV',
      inactivityPauseThresholdDays: 7,
      recommendedMaxIntervalDays: 5,
      mode,
    },
    generatedAt,
    projectHost,
    migrations,
    tables: {
      sites: tables.sites ?? [],
      site_memberships: tables.site_memberships ?? [],
      drafts: tables.drafts ?? [],
    },
    counts: {
      sites: (tables.sites ?? []).length,
      site_memberships: (tables.site_memberships ?? []).length,
      drafts: (tables.drafts ?? []).length,
    },
  });

  const payloadHash = createHash('sha256').update(JSON.stringify(payload), 'utf8').digest('hex');
  return canonicalizeValue({
    ...payload,
    integrity: {
      algorithm: 'sha256',
      digest: payloadHash,
    },
  });
}

async function fetchTableRows({ baseUrl, serviceRoleKey, table, order, fetchImpl = fetch }) {
  const pageSize = 500;
  let offset = 0;
  const rows = [];

  while (true) {
    const endpoint = `${baseUrl}/rest/v1/${encodeURIComponent(table)}?select=*&order=${encodeURIComponent(order)}&limit=${pageSize}&offset=${offset}`;
    const response = await fetchImpl(endpoint, {
      method: 'GET',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Supabase REST export failed for table "${table}" with HTTP ${response.status}`);
    }

    const batch = await response.json();
    if (!Array.isArray(batch)) {
      throw new Error(`Unexpected non-array response while exporting table "${table}"`);
    }

    rows.push(...batch);
    if (batch.length < pageSize) {
      break;
    }
    offset += pageSize;
  }

  return rows;
}

export async function runBackup(argv = process.argv.slice(2), deps = {}) {
  const options = parseCliArgs(argv);
  const migrations = await inspectLocalMigrations(deps.migrationsDir || MIGRATIONS_DIR);

  if (options.dryRun) {
    const artifact = buildBackupArtifact({
      generatedAt: '1970-01-01T00:00:00.000Z',
      projectHost: 'dry-run.local',
      migrations,
      tables: {
        sites: [],
        site_memberships: [],
        drafts: [],
      },
      mode: options.check ? 'check' : 'dry-run',
    });

    const summary = {
      ok: true,
      mode: artifact.safeguard.mode,
      migrationsVerified: migrations.length,
      tablesConfigured: PROTECTED_TABLES.map(t => t.name),
      outputDir: relative(ROOT_DIR, options.outputDir) || options.outputDir,
      integrityDigest: artifact.integrity.digest,
    };
    console.log(JSON.stringify(summary));
    return { summary, artifact };
  }

  const baseUrl = validateSupabaseUrl(process.env.SUPABASE_URL);
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ADMIN_KEY;
  if (!serviceRoleKey || typeof serviceRoleKey !== 'string' || serviceRoleKey.trim().length < 16) {
    throw new Error(
      'Missing SUPABASE_SERVICE_ROLE_KEY environment variable for remote backup execution (or run with --dry-run for local verification).',
    );
  }

  const tables = {};
  for (const table of PROTECTED_TABLES) {
    tables[table.name] = await fetchTableRows({
      baseUrl,
      serviceRoleKey,
      table: table.name,
      order: table.order,
      fetchImpl: deps.fetchImpl || fetch,
    });
  }

  const nowIso = (deps.now ? deps.now() : new Date()).toISOString();
  const projectHost = new URL(baseUrl).host;
  const artifact = buildBackupArtifact({
    generatedAt: nowIso,
    projectHost,
    migrations,
    tables,
    mode: 'live',
  });

  await mkdir(options.outputDir, { recursive: true, mode: 0o700 });
  const safeStamp = nowIso.replace(/[:.]/g, '-');
  const backupFile = resolve(options.outputDir, `supabase-backup-${safeStamp}.json`);
  await writeFile(backupFile, `${JSON.stringify(artifact, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });

  const summary = {
    ok: true,
    mode: 'live',
    projectHost,
    migrationsVerified: migrations.length,
    counts: artifact.counts,
    backupFile: relative(ROOT_DIR, backupFile) || backupFile,
    integrityDigest: artifact.integrity.digest,
  };
  console.log(JSON.stringify(summary));
  return { summary, artifact, backupFile };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  runBackup().catch(error => {
    const secrets = [process.env.SUPABASE_SERVICE_ROLE_KEY, process.env.SUPABASE_ADMIN_KEY, process.env.SUPABASE_ANON_KEY];
    console.error(redactSecrets(error?.message || String(error), secrets));
    process.exitCode = 1;
  });
}
