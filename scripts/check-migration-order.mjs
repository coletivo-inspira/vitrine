#!/usr/bin/env node
// Verifica a ordem das migrações do Supabase.
// Sem argumentos: nomes válidos, versões únicas e ordem alfabética igual à numérica.
// Com uma ref base (ex.: origin/main): cada migração adicionada desde a base precisa
// ter versão maior que a última migração da base, senão `supabase db push` recusa
// ("Found local migration files to be inserted before the last migration").
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MIGRATIONS_DIR = 'supabase/migrations';
const NAME = /^(\d{12}|\d{14})_[a-z0-9_]+\.sql$/;

export function migrationVersion(file) {
  const match = NAME.exec(file);
  return match ? BigInt(match[1]) : null;
}

export function checkLocalMigrations(files) {
  const errors = [];
  const sql = files.filter((f) => f.endsWith('.sql'));
  const seen = new Map();
  for (const file of sql) {
    const version = migrationVersion(file);
    if (version === null) {
      errors.push(`${file}: nome inválido; use AAAAMMDDHHMMSS_descricao.sql`);
      continue;
    }
    const key = version.toString();
    if (seen.has(key)) errors.push(`${file}: versão ${key} repetida (também em ${seen.get(key)})`);
    else seen.set(key, file);
  }
  const valid = sql.filter((f) => migrationVersion(f) !== null);
  const byName = [...valid].sort();
  const byVersion = [...valid].sort((a, b) => {
    const diff = migrationVersion(a) - migrationVersion(b);
    return diff < 0n ? -1 : diff > 0n ? 1 : 0;
  });
  if (byName.join('\n') !== byVersion.join('\n')) {
    errors.push('a ordem alfabética dos arquivos difere da ordem numérica das versões');
  }
  return errors;
}

export function checkAddedAfterBase(baseFiles, addedFiles) {
  const baseVersions = baseFiles.map(migrationVersion).filter((v) => v !== null);
  if (baseVersions.length === 0) return [];
  const last = baseVersions.reduce((a, b) => (b > a ? b : a));
  const lastFile = baseFiles.find((f) => migrationVersion(f) === last);
  return addedFiles
    .filter((f) => {
      const version = migrationVersion(f);
      return version !== null && version <= last;
    })
    .map((f) => `${f}: versão anterior ou igual à última migração da base (${lastFile}); renomeie para uma versão maior`);
}

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).split('\n').filter(Boolean);
}

function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const baseRef = process.argv[2];
  const errors = checkLocalMigrations(readdirSync(resolve(root, MIGRATIONS_DIR)));
  if (baseRef) {
    const strip = (p) => p.slice(MIGRATIONS_DIR.length + 1);
    const baseFiles = git(['ls-tree', '--name-only', `${baseRef}:${MIGRATIONS_DIR}`], root);
    const added = git(['diff', '--no-renames', '--diff-filter=A', '--name-only', `${baseRef}...HEAD`, '--', MIGRATIONS_DIR], root).map(strip);
    errors.push(...checkAddedAfterBase(baseFiles, added));
    console.log(`Migrações adicionadas desde ${baseRef}: ${added.length ? added.join(', ') : 'nenhuma'}`);
  }
  if (errors.length) {
    for (const error of errors) console.error(`::error::${error}`);
    process.exit(1);
  }
  console.log('Ordem das migrações OK.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
