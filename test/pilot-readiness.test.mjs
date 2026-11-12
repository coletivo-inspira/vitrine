import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CANONICAL_PUBLIC_BASE_URL,
  DEFAULT_PILOT_FIXTURE_PATH,
  DOMAIN_GRACE_PERIOD_DAYS,
  FREE_PLAN_MAX_ACTIVE_ITEMS,
  PILOT_MAX_VITRINES,
  TECHNICAL_MAX_TOTAL_ITEMS,
  evaluateDomainSubscriptionState,
  parsePilotCliArgs,
  simulateDomainLifecycleTransitions,
  validateCustomHostname,
  validatePilotPack,
  validatePilotVitrineEntry
} from '../scripts/validate-pilot-pack.mjs';
import {
  PORTAL_CSP_HEADER,
  STRICT_CSP_HEADER,
  SUPABASE_PUBLIC_PROJECT_URL
} from '../workers/api.mjs';

const execFileAsync = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));

test('Fase 6 - Pacote do Piloto de 10 Vitrines, Ciclo Comercial 002-US4 e Guia Operacional', async (t) => {
  const rawFixture = await readFile(DEFAULT_PILOT_FIXTURE_PATH, 'utf8');
  const canonicalPack = JSON.parse(rawFixture);

  await t.test('1. Valida o lote canônico de 10 vitrines (examples/pilot-10-vitrines.json) via API e CLI', async () => {
    const report = await validatePilotPack(canonicalPack, { requireExactCohortSize: true });

    assert.equal(report.ok, true);
    assert.equal(report.schemaVersion, 1);
    assert.equal(report.pilotLimit, 10);
    assert.equal(report.vitrineCount, 10);
    assert.equal(report.freePlanActiveItemsLimit, 20);
    assert.equal(report.technicalTotalItemsLimit, 100);
    assert.equal(report.domainGracePeriodDays, 7);
    assert.match(report.batchDigest, /^[a-f0-9]{64}$/);

    // Determinismo estrito do batchDigest em segunda execução
    const secondReport = await validatePilotPack(canonicalPack, { requireExactCohortSize: true });
    assert.equal(report.batchDigest, secondReport.batchDigest);

    // Verifica que a 10ª vitrine (estacao-da-pizza) exercita exatamente o teto de 20 itens ativos + 2 ocultos
    const tenthVitrine = report.vitrines.find((v) => v.slug === 'estacao-da-pizza');
    assert.ok(tenthVitrine);
    assert.equal(tenthVitrine.activeItems, 20);
    assert.equal(tenthVitrine.hiddenItems, 2);
    assert.equal(tenthVitrine.totalItems, 22);
    assert.match(tenthVitrine.hash, /^[a-f0-9]{64}$/);
    assert.match(tenthVitrine.sampleWhatsappLink, /^https:\/\/wa\.me\/5585999991010\?text=/);

    // Execução direta via CLI (node scripts/validate-pilot-pack.mjs) deve retornar exit code 0 e JSON estruturado
    const { stdout } = await execFileAsync(
      process.execPath,
      ['scripts/validate-pilot-pack.mjs'],
      { cwd: root }
    );
    const cliSummary = JSON.parse(stdout.trim());
    assert.equal(cliSummary.ok, true);
    assert.equal(cliSummary.vitrineCount, 10);
    assert.equal(cliSummary.pilotLimit, 10);
    assert.equal(cliSummary.batchDigest, report.batchDigest);
    assert.equal(cliSummary.slugs.length, 10);

    // Garante que a fixture em examples/ jamais vaza para dist/
    await execFileAsync(process.execPath, ['scripts/build.mjs'], { cwd: root });
    const distFiles = await readdir(resolve(root, 'dist'), { recursive: true });
    for (const rel of distFiles) {
      assert.doesNotMatch(
        rel.replace(/\\/g, '/'),
        /(?:^|\/)examples(?:\/|$)|pilot-10-vitrines\.json/i,
        `Fixture do piloto não pode vazar para dist/: ${rel}`
      );
    }

    // Impede apontar --fixture para dentro de web/ ou dist/
    assert.throws(
      () => parsePilotCliArgs(['--fixture=web/pilot.json']),
      /Security violation/
    );
    assert.throws(
      () => parsePilotCliArgs(['--fixture=dist/pilot.json']),
      /Security violation/
    );
  });

  await t.test('2. Rejeita 11ª vitrine no lote do piloto gratuito (API e CLI exit code != 0) e slugs duplicados/reservados', async () => {
    const eleventhVitrine = structuredClone(canonicalPack.vitrines[0]);
    eleventhVitrine.id = '10000000-0000-4000-8000-000000000011';
    eleventhVitrine.slug = 'pizzaria-decima-primeira';
    eleventhVitrine.name = 'Décima Primeira Pizzaria';
    eleventhVitrine.draft.slug = 'pizzaria-decima-primeira';
    eleventhVitrine.draft.businessName = 'Décima Primeira Pizzaria';

    const overflowPack = {
      ...structuredClone(canonicalPack),
      vitrines: [...structuredClone(canonicalPack.vitrines), eleventhVitrine]
    };

    await assert.rejects(
      () => validatePilotPack(overflowPack),
      (err) =>
        err.code === 'PILOT_VITRINE_LIMIT_EXCEEDED' &&
        err.status === 422 &&
        /máximo 10 vitrines/i.test(err.message)
    );

    // Verifica que a CLI retorna código de saída diferente de zero ao validar um lote com 11 vitrines
    const tmpDir = await mkdtemp(resolve(tmpdir(), 'vitrine-pilot-test-'));
    try {
      const invalidFixturePath = resolve(tmpDir, 'invalid-11-vitrines.json');
      await writeFile(invalidFixturePath, JSON.stringify(overflowPack, null, 2), 'utf8');

      let cliFailed = false;
      try {
        await execFileAsync(
          process.execPath,
          ['scripts/validate-pilot-pack.mjs', `--fixture=${invalidFixturePath}`],
          { cwd: root }
        );
      } catch (err) {
        cliFailed = true;
        assert.notEqual(err.code, 0);
        const stderrJson = JSON.parse(String(err.stderr).trim());
        assert.equal(stderrJson.ok, false);
        assert.equal(stderrJson.code, 'PILOT_VITRINE_LIMIT_EXCEEDED');
      }
      assert.equal(cliFailed, true, 'CLI deve falhar com exit code != 0 para 11 vitrines');
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }

    // Rejeita slug duplicado no mesmo lote
    const duplicateSlugPack = structuredClone(canonicalPack);
    duplicateSlugPack.vitrines[1].slug = 'loja1';
    duplicateSlugPack.vitrines[1].draft.slug = 'loja1';
    await assert.rejects(
      () => validatePilotPack(duplicateSlugPack),
      (err) => err.code === 'DUPLICATE_PILOT_SLUG' && err.status === 409
    );

    // Rejeita slug reservado
    const reservedSlugEntry = structuredClone(canonicalPack.vitrines[0]);
    reservedSlugEntry.slug = 'admin';
    reservedSlugEntry.draft.slug = 'admin';
    await assert.rejects(
      () => validatePilotVitrineEntry(reservedSlugEntry, 0, new Set(), new Set()),
      (err) => err.code === 'INVALID_SLUG'
    );
  });

  await t.test('3. Rejeita > 20 itens ativos no Plano Básico Gratuito e > 100 itens totais', async () => {
    const baseEntry = structuredClone(canonicalPack.vitrines[0]);
    baseEntry.slug = 'pizzaria-limite-ativos';
    baseEntry.draft.slug = 'pizzaria-limite-ativos';

    // 21 itens ativos -> deve falhar com ACTIVE_ITEMS_LIMIT_EXCEEDED
    const twentyOneActiveItems = [];
    for (let i = 1; i <= FREE_PLAN_MAX_ACTIVE_ITEMS + 1; i += 1) {
      twentyOneActiveItems.push({
        id: `ativo-${i}`,
        name: `Pizza Ativa ${i}`,
        priceCents: 4500,
        active: true
      });
    }
    baseEntry.draft.categories = [
      {
        id: 'todas',
        name: 'Todas as Pizzas',
        items: twentyOneActiveItems
      }
    ];

    await assert.rejects(
      () => validatePilotVitrineEntry(baseEntry, 0, new Set(), new Set()),
      (err) => err.code === 'ACTIVE_ITEMS_LIMIT_EXCEEDED' && err.status === 422
    );

    // 20 itens ativos + 81 itens ocultos = 101 itens totais -> deve falhar com TOTAL_ITEMS_LIMIT_EXCEEDED
    const overTotalEntry = structuredClone(canonicalPack.vitrines[0]);
    overTotalEntry.slug = 'pizzaria-limite-total';
    overTotalEntry.draft.slug = 'pizzaria-limite-total';
    const hundredAndOneItems = [];
    for (let i = 1; i <= FREE_PLAN_MAX_ACTIVE_ITEMS; i += 1) {
      hundredAndOneItems.push({
        id: `a-${i}`,
        name: `Pizza Ativa ${i}`,
        priceCents: 4500,
        active: true
      });
    }
    for (let i = 1; i <= TECHNICAL_MAX_TOTAL_ITEMS - FREE_PLAN_MAX_ACTIVE_ITEMS + 1; i += 1) {
      hundredAndOneItems.push({
        id: `h-${i}`,
        name: `Pizza Oculta ${i}`,
        priceCents: 4500,
        active: false
      });
    }
    overTotalEntry.draft.categories = [{ id: 'cat', name: 'Cardápio', items: hundredAndOneItems }];

    await assert.rejects(
      () => validatePilotVitrineEntry(overTotalEntry, 0, new Set(), new Set()),
      (err) => err.code === 'TOTAL_ITEMS_LIMIT_EXCEEDED' && err.status === 422
    );
  });

  await t.test('4. Simula transições da janela de 7 dias de tolerância de domínio (002-US4) sem perda de dados', () => {
    assert.equal(DOMAIN_GRACE_PERIOD_DAYS, 7);

    const draftSnapshot = {
      revision: 4,
      byteLength: 2048,
      totalItems: 18,
      activeItems: 14
    };
    const publicationSnapshot = {
      hash: 'a'.repeat(64),
      immutableMenuUrl: `/data/vitrines/forno-da-vila/releases/${'a'.repeat(64)}.json`
    };

    const subscription = {
      planTier: 'inspira_subdomain',
      customHostname: 'forno-da-vila.inspira.dev.br',
      paidUntil: '2026-12-01T23:59:59.000Z',
      graceDays: 7
    };

    const transitions = simulateDomainLifecycleTransitions({
      slug: 'forno-da-vila',
      subscription,
      draftSnapshot,
      publicationSnapshot
    });

    // 4.1 Fase ativa (antes do vencimento paidUntil)
    assert.equal(transitions.activePhase.status, 'active');
    assert.equal(transitions.activePhase.canonicalUrl, 'https://forno-da-vila.inspira.dev.br');
    assert.equal(transitions.activePhase.redirectFromBasicPathTo, 'https://forno-da-vila.inspira.dev.br');
    assert.equal(transitions.activePhase.customHostnameActive, true);
    assert.equal(transitions.activePhase.revertedToFreeAddress, false);
    assert.equal(transitions.activePhase.dataPreserved, true);

    // 4.2 Janela de tolerância no 3º dia e exatamente no limite do 7º dia após vencimento
    assert.equal(transitions.gracePeriodDay3.status, 'grace_period');
    assert.equal(transitions.gracePeriodDay3.daysPastExpiration, 3);
    assert.equal(transitions.gracePeriodDay3.canonicalUrl, 'https://forno-da-vila.inspira.dev.br');
    assert.equal(transitions.gracePeriodDay3.customHostnameActive, true);
    assert.equal(transitions.gracePeriodDay3.revertedToFreeAddress, false);
    assert.equal(transitions.gracePeriodDay3.dataPreserved, true);

    assert.equal(transitions.gracePeriodBoundaryDay7.status, 'grace_period');
    assert.equal(transitions.gracePeriodBoundaryDay7.daysPastExpiration, 7);
    assert.equal(transitions.gracePeriodBoundaryDay7.canonicalUrl, 'https://forno-da-vila.inspira.dev.br');
    assert.equal(transitions.gracePeriodBoundaryDay7.customHostnameActive, true);

    // 4.3 Expiração após o 7º dia: reversão automática para vitrine.inspira.dev.br/<slug> com 100% dos dados preservados
    assert.equal(transitions.expiredAfterDay7.status, 'suspended');
    assert.equal(
      transitions.expiredAfterDay7.canonicalUrl,
      `${CANONICAL_PUBLIC_BASE_URL}/forno-da-vila`
    );
    assert.equal(transitions.expiredAfterDay7.redirectFromBasicPathTo, null);
    assert.equal(transitions.expiredAfterDay7.customHostnameActive, false);
    assert.equal(transitions.expiredAfterDay7.verificationStatus, 'quarantined');
    assert.equal(transitions.expiredAfterDay7.revertedToFreeAddress, true);
    assert.equal(transitions.expiredAfterDay7.dataPreserved, true);
    assert.equal(transitions.expiredAfterDay7.draftRevisionPreserved, 4);
    assert.equal(transitions.expiredAfterDay7.totalItemsPreserved, 18);
    assert.equal(transitions.expiredAfterDay7.activeItemsPreserved, 14);
    assert.equal(transitions.expiredAfterDay7.hiddenItemsPreserved, 4);
    assert.equal(transitions.expiredAfterDay7.publicationHashPreserved, 'a'.repeat(64));

    // Rejeita hostnames reservados (vitrine.inspira.dev.br, painel.inspira.dev.br)
    assert.throws(
      () => validateCustomHostname('vitrine.inspira.dev.br'),
      (err) => err.code === 'INVALID_CUSTOM_HOSTNAME'
    );
    assert.throws(
      () => validateCustomHostname('painel.inspira.dev.br'),
      (err) => err.code === 'INVALID_CUSTOM_HOSTNAME'
    );
    assert.throws(
      () =>
        evaluateDomainSubscriptionState({
          slug: 'forno-da-vila',
          subscription: { ...subscription, graceDays: 5 },
          referenceDate: '2026-12-01T00:00:00.000Z'
        }),
      (err) => err.code === 'INVALID_GRACE_PERIOD'
    );
  });

  await t.test('5. Verifica seções essenciais, vocabulário CONTEXT.md e comandos qawlpsrfewosxsfgmmpm em docs/operations-guide.md e docs/supabase-provisioning.md', async () => {
    const opsGuide = await readFile(resolve(root, 'docs/operations-guide.md'), 'utf8');
    const provisioningGuide = await readFile(resolve(root, 'docs/supabase-provisioning.md'), 'utf8');
    const wranglerConfig = JSON.parse(await readFile(resolve(root, 'wrangler.jsonc'), 'utf8'));

    // Vocabulário canônico obrigatório de CONTEXT.md em docs/operations-guide.md
    for (const canonicalTerm of [
      'Operador Inspira',
      'Vitrine',
      'Proprietário',
      'Equipe da vitrine',
      'Membro',
      'Rascunho',
      'Publicação',
      'Vínculo de domínio'
    ]) {
      assert.ok(
        opsGuide.includes(canonicalTerm),
        `Termo canônico "${canonicalTerm}" deve estar presente em docs/operations-guide.md`
      );
    }

    // Regras do piloto, planos comerciais, 7 dias de tolerância e reversão segura
    assert.match(opsGuide, /10 vitrines/i);
    assert.match(opsGuide, /pizzeria-v1/);
    assert.match(opsGuide, /20 itens ativos/i);
    assert.match(opsGuide, /100 itens totais/i);
    assert.match(opsGuide, /R\$\s*10\/mês/);
    assert.match(opsGuide, /R\$\s*15\/mês/);
    assert.match(opsGuide, /7 dias/);
    assert.match(opsGuide, /vitrine\.inspira\.dev\.br\/<slug>/);
    assert.match(opsGuide, /painel\.inspira\.dev\.br/);
    assert.match(opsGuide, /__Host-vitrine_session/);

    // Referência oficial ao projeto qawlpsrfewosxsfgmmpm e comandos pré-preenchidos em ambos os guias
    for (const docText of [opsGuide, provisioningGuide]) {
      assert.match(docText, /qawlpsrfewosxsfgmmpm/);
      assert.match(docText, /https:\/\/qawlpsrfewosxsfgmmpm\.supabase\.co/);
      assert.match(
        docText,
        /npx supabase link --project-ref qawlpsrfewosxsfgmmpm && npx supabase db push/
      );
      assert.match(docText, /202611070001_site_access\.sql/);
      assert.match(docText, /202611110001_portal_schema\.sql/);
      assert.match(docText, /https:\/\/qawlpsrfewosxsfgmmpm\.supabase\.co\/auth\/v1\/callback/);
      assert.match(docText, /https:\/\/painel\.inspira\.dev\.br\/portal\//);
      assert.match(docText, /scripts\/backup-supabase\.mjs --dry-run/);
      assert.match(docText, /scripts\/backup-supabase\.mjs --check/);
      assert.match(docText, /SUPABASE_DB_URL/);
      assert.match(docText, /scripts\/verify-supabase-rls\.mjs --self-test/);
      assert.match(docText, /wrangler(?:@[0-9.]+)? secret put SUPABASE_ANON_KEY/);
      assert.match(docText, /wrangler(?:@[0-9.]+)? secret put SUPABASE_JWT_SECRET/);
    }

    // Verifica wrangler.jsonc e constantes de CSP no Worker
    assert.equal(wranglerConfig.workers_dev, true);
    assert.equal(wranglerConfig.preview_urls, false);
    assert.equal(wranglerConfig.vars.SUPABASE_URL, SUPABASE_PUBLIC_PROJECT_URL);
    assert.equal(SUPABASE_PUBLIC_PROJECT_URL, 'https://qawlpsrfewosxsfgmmpm.supabase.co');
    assert.match(STRICT_CSP_HEADER, /connect-src 'self';/);
    assert.doesNotMatch(STRICT_CSP_HEADER, /qawlpsrfewosxsfgmmpm/);
    assert.match(
      PORTAL_CSP_HEADER,
      /connect-src 'self' https:\/\/qawlpsrfewosxsfgmmpm\.supabase\.co;/
    );

    // Verifica workflows de deploy Cloudflare e migração Supabase e seção Windows pt-BR no guia operacional
    const deployWorkflow = await readFile(resolve(root, '.github/workflows/deploy.yml'), 'utf8');
    const migrateWorkflow = await readFile(resolve(root, '.github/workflows/db-migrate.yml'), 'utf8');

    assert.match(deployWorkflow, /permissions:\s*\n\s*contents:\s*read/);
    assert.match(deployWorkflow, /concurrency:\s*\n\s*group:\s*\S+\s*\n\s*cancel-in-progress:\s*false/);
    assert.match(deployWorkflow, /node-version-file:\s*['"]?\.node-version['"]?/);
    assert.match(deployWorkflow, /npm ci/);
    assert.match(deployWorkflow, /npm test/);
    assert.match(deployWorkflow, /npm run build/);
    assert.match(deployWorkflow, /npx --yes wrangler@4\.158\.0 deploy/);
    assert.match(deployWorkflow, /CLOUDFLARE_API_TOKEN:\s*\$\{\{\s*secrets\.CLOUDFLARE_API_TOKEN\s*\}\}/);
    assert.match(deployWorkflow, /CLOUDFLARE_ACCOUNT_ID:\s*\$\{\{\s*secrets\.CLOUDFLARE_ACCOUNT_ID\s*\}\}/);
    assert.match(deployWorkflow, /\/api\/auth\/config/);

    assert.match(migrateWorkflow, /on:\s*\n\s*workflow_dispatch:/);
    assert.doesNotMatch(migrateWorkflow, /\bpush:\b|\bpull_request:\b/);
    assert.match(migrateWorkflow, /dry_run:[\s\S]*?type:\s*boolean[\s\S]*?default:\s*true/);
    assert.match(migrateWorkflow, /uses:\s*supabase\/setup-cli@[a-f0-9]{40}\s+#\s*v/);
    assert.match(migrateWorkflow, /supabase link --project-ref qawlpsrfewosxsfgmmpm/);
    assert.match(migrateWorkflow, /supabase db push --remote --dry-run/);
    assert.match(migrateWorkflow, /supabase db push --remote --yes/);
    assert.match(opsGuide, /npx supabase db push --remote/);
    assert.match(migrateWorkflow, /SUPABASE_ACCESS_TOKEN:\s*\$\{\{\s*secrets\.SUPABASE_ACCESS_TOKEN\s*\}\}/);
    assert.match(migrateWorkflow, /SUPABASE_DB_PASSWORD:\s*\$\{\{\s*secrets\.SUPABASE_DB_PASSWORD\s*\}\}/);
    assert.doesNotMatch(migrateWorkflow, /--db-url|--password|-p\s+\$/);

    for (const wf of [deployWorkflow, migrateWorkflow]) {
      const usesLines = [...wf.matchAll(/uses:\s*([^\s#]+)(.*)$/gm)];
      assert.ok(usesLines.length > 0);
      for (const [, actionRef, trailingComment] of usesLines) {
        assert.match(actionRef, /^[^@]+@[a-f0-9]{40}$/, `Action deve estar fixada por SHA completo: ${actionRef}`);
        assert.match(trailingComment, /#\s*v\d+/, `Action deve ter comentário de versão: ${actionRef}${trailingComment}`);
      }
    }

    for (const secretName of [
      'CLOUDFLARE_API_TOKEN',
      'CLOUDFLARE_ACCOUNT_ID',
      'SUPABASE_ACCESS_TOKEN',
      'SUPABASE_DB_PASSWORD',
      'Edit Cloudflare Workers',
      'Settings > Secrets and variables > Actions'
    ]) {
      assert.ok(
        opsGuide.includes(secretName),
        `docs/operations-guide.md deve documentar "${secretName}"`
      );
    }
  });
});
