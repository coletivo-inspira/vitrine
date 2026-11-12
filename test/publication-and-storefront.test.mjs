import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { publicMenu, whatsappLink } from '../src/public-menu.mjs';
import {
  FORBIDDEN_PUBLIC_KEYS,
  compilePublicStorefront,
  computeSha256Hex
} from '../src/publication-engine.mjs';
import { createApiHandler } from '../workers/api.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const siteAId = '20000000-0000-0000-0000-000000000001';
const siteBId = '20000000-0000-0000-0000-000000000002';

test('Fase 4 - Motor de Publicação Imutável e Vitrine Pública Mobile-First', async (t) => {
  await t.test('1. Autorização em POST /api/sites/:siteId/publish (401 anônimo, 404 terceiros, 200 autorizado)', async () => {
    const api = createApiHandler();

    // Visitante anônimo -> 401 UNAUTHORIZED
    const anonRes = await api.fetch(
      new Request(`http://localhost/api/sites/${siteAId}/publish`, { method: 'POST' })
    );
    assert.equal(anonRes.status, 401);
    assert.equal((await anonRes.json()).error.code, 'UNAUTHORIZED');

    // Usuário autenticado sem vínculo (stranger) -> 404 SITE_NOT_FOUND
    const strangerRes = await api.fetch(
      new Request(`http://localhost/api/sites/${siteAId}/publish`, {
        method: 'POST',
        headers: { Authorization: 'Bearer token-stranger' }
      })
    );
    assert.equal(strangerRes.status, 404);
    assert.equal((await strangerRes.json()).error.code, 'SITE_NOT_FOUND');

    // Colaborador da vitrine A tentando publicar vitrine B -> 404 SITE_NOT_FOUND
    const crossSiteRes = await api.fetch(
      new Request(`http://localhost/api/sites/${siteBId}/publish`, {
        method: 'POST',
        headers: { Authorization: 'Bearer token-member' }
      })
    );
    assert.equal(crossSiteRes.status, 404);
    assert.equal((await crossSiteRes.json()).error.code, 'SITE_NOT_FOUND');

    // Proprietário publicando vitrine A -> 200 OK com hash SHA-256 determinístico
    const publishRes = await api.fetch(
      new Request(`http://localhost/api/sites/${siteAId}/publish`, {
        method: 'POST',
        headers: { Authorization: 'Bearer token-owner' }
      })
    );
    assert.equal(publishRes.status, 200);
    const { publication } = await publishRes.json();
    assert.equal(publication.siteId, siteAId);
    assert.equal(publication.slug, 'pizza-a');
    assert.equal(publication.revision, 1);
    assert.match(publication.hash, /^[a-f0-9]{64}$/);
    assert.equal(publication.url, '/pizza-a');
    assert.equal(publication.menuUrl, '/data/vitrines/pizza-a/menu.json');
    assert.equal(
      publication.immutableMenuUrl,
      `/data/vitrines/pizza-a/releases/${publication.hash}.json`
    );

    // Determinismo do hash SHA-256 sobre o JSON canônico
    const expectedHash = await computeSha256Hex(JSON.stringify(publication.menu));
    assert.equal(publication.hash, expectedHash);
  });

  await t.test('2. Ausência total de campos privados e itens ocultos no JSON publicado', async () => {
    const api = createApiHandler();

    const draftWithPrivateFields = {
      schemaVersion: 1,
      template: 'pizzeria-v1',
      slug: 'pizza-a',
      businessName: 'Pizzaria Segredo Zero',
      whatsapp: '5511988887777',
      owner_user_id: '10000000-0000-0000-0000-000000000001',
      ownerEmail: 'dono@segredo.invalid',
      accessToken: 'jwt-secret-token',
      service_role: 'never-expose-service-role',
      internalNotes: 'Fornecedor mais barato na terça',
      categories: [
        {
          id: 'tradicionais',
          name: 'Pizzas Tradicionais',
          internalCost: 1200,
          items: [
            {
              id: 'napolitana',
              name: 'Napolitana Artesanal',
              description: 'Molho de tomate, muçarela, parmesão e alho crocante.',
              priceCents: 4990,
              active: true,
              available: true,
              internalCost: 1500,
              ownerEmail: 'item@segredo.invalid'
            },
            {
              id: 'item-secreto-inativo',
              name: 'Receita Secreta em Teste',
              description: 'Não deve sair na publicação.',
              priceCents: 9900,
              active: false,
              available: false
            }
          ]
        },
        {
          id: 'categoria-vazia-oculta',
          name: 'Categoria Somente Ocultos',
          items: [
            {
              id: 'oculto-2',
              name: 'Oculto 2',
              priceCents: 3500,
              active: false
            }
          ]
        }
      ]
    };

    const putRes = await api.fetch(
      new Request(`http://localhost/api/sites/${siteAId}/draft`, {
        method: 'PUT',
        headers: {
          Authorization: 'Bearer token-owner',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ revision: 1, content: draftWithPrivateFields })
      })
    );
    assert.equal(putRes.status, 200);

    const pubRes = await api.fetch(
      new Request(`http://localhost/api/sites/${siteAId}/publish`, {
        method: 'POST',
        headers: { Authorization: 'Bearer token-owner' }
      })
    );
    assert.equal(pubRes.status, 200);
    const { publication } = await pubRes.json();
    const menu = publication.menu;
    const rawMenuJson = JSON.stringify(menu);

    // Verifica que nenhuma chave proibida nem valor privado vazou
    for (const forbiddenKey of FORBIDDEN_PUBLIC_KEYS) {
      assert.equal(
         forbiddenKey in menu,
        false,
        `Chave privada ${forbiddenKey} não pode existir no menu publicado`
      );
      for (const item of menu.items) {
        assert.equal(
          forbiddenKey in item,
          false,
          `Chave privada ${forbiddenKey} não pode existir em item publicado`
        );
      }
    }
    assert.doesNotMatch(rawMenuJson, /dono@segredo\.invalid/);
    assert.doesNotMatch(rawMenuJson, /jwt-secret-token/);
    assert.doesNotMatch(rawMenuJson, /never-expose-service-role/);
    assert.doesNotMatch(rawMenuJson, /item-secreto-inativo/);
    assert.doesNotMatch(rawMenuJson, /categoria-vazia-oculta/);

    // Apenas o item ativo deve estar presente, e compatível com publicMenu() / whatsappLink()
    assert.equal(menu.items.length, 1);
    assert.equal(menu.items[0].id, 'napolitana');
    assert.equal(menu.categories.length, 1);
    assert.equal(menu.categories[0].name, 'Pizzas Tradicionais');
    assert.equal(menu.categories[0].items.length, 1);

    const checkedByCanonical = publicMenu({
      ...menu,
      items: menu.items.map((item) => ({ ...item, active: true }))
    });
    assert.equal(checkedByCanonical.slug, 'pizza-a');
    assert.equal(
      whatsappLink(menu, 'napolitana'),
      'https://wa.me/5511988887777?text=Ol%C3%A1!%20Tenho%20interesse%20em%20Napolitana%20Artesanal.%20Pode%20confirmar%20pre%C3%A7o%20e%20disponibilidade%3F'
    );
  });

  await t.test('3. Atomicidade: falha na publicação (422) preserva intacta a publicação anterior', async () => {
    const api = createApiHandler();

    // 1. Publica a revisão 1 válida de pizza-a
    const firstPublishRes = await api.fetch(
      new Request(`http://localhost/api/sites/${siteAId}/publish`, {
        method: 'POST',
        headers: { Authorization: 'Bearer token-owner' }
      })
    );
    assert.equal(firstPublishRes.status, 200);
    const firstPub = (await firstPublishRes.json()).publication;

    // 2. Salva revisão 2 com todos os itens desativados (válido como rascunho, inválido para publicação)
    const emptyActiveDraft = {
      schemaVersion: 1,
      template: 'pizzeria-v1',
      slug: 'pizza-a',
      businessName: 'Pizza A Em Reforma',
      whatsapp: '5511999999999',
      categories: [
        {
          name: 'Pizzas',
          items: [
            {
              id: 'margherita',
              name: 'Margherita',
              priceCents: 4500,
              active: false,
              available: false
            }
          ]
        }
      ]
    };

    const saveRev2Res = await api.fetch(
      new Request(`http://localhost/api/sites/${siteAId}/draft`, {
        method: 'PUT',
        headers: {
          Authorization: 'Bearer token-owner',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ revision: 1, content: emptyActiveDraft })
      })
    );
    assert.equal(saveRev2Res.status, 200);

    // 3. Tenta publicar o rascunho sem itens ativos -> deve retornar 422 EMPTY_PUBLIC_MENU
    const failedPublishRes = await api.fetch(
      new Request(`http://localhost/api/sites/${siteAId}/publish`, {
        method: 'POST',
        headers: { Authorization: 'Bearer token-owner' }
      })
    );
    assert.equal(failedPublishRes.status, 422);
    const failedBody = await failedPublishRes.json();
    assert.equal(failedBody.error.code, 'EMPTY_PUBLIC_MENU');

    // 4. Verifica que a publicação anterior (firstPub) continua intacta e servida sem interrupção!
    const publicMenuRes = await api.fetch(
      new Request('http://localhost/data/vitrines/pizza-a/menu.json')
    );
    assert.equal(publicMenuRes.status, 200);
    assert.equal(publicMenuRes.headers.get('etag'), `"${firstPub.hash}"`);
    const activeMenu = await publicMenuRes.json();
    assert.deepEqual(activeMenu, firstPub.menu);
    assert.equal(activeMenu.name, 'Pizza A');
    assert.equal(activeMenu.items.length, 1);

    // 5. Também testa tentativa de publicar vitrine B (que nasceu com 0 itens ativos)
    const publishEmptySiteB = await api.fetch(
      new Request(`http://localhost/api/sites/${siteBId}/publish`, {
        method: 'POST',
        headers: { Authorization: 'Bearer token-owner' }
      })
    );
    assert.equal(publishEmptySiteB.status, 422);
    assert.equal((await publishEmptySiteB.json()).error.code, 'EMPTY_PUBLIC_MENU');
  });

  await t.test('4. Cabeçalhos de Cache CDN, CSP estrita e zero chamadas ao Supabase em rotas públicas', async () => {
    let supabaseCalls = 0;
    const api = createApiHandler({
      fetch: async () => {
        supabaseCalls += 1;
        throw new Error('Rotas públicas jamais devem chamar o Supabase!');
      }
    });

    // Publica pizza-a
    const pubRes = await api.fetch(
      new Request(`http://localhost/api/sites/${siteAId}/publish`, {
        method: 'POST',
        headers: { Authorization: 'Bearer token-owner' }
      })
    );
    assert.equal(pubRes.status, 200);
    const { publication } = await pubRes.json();

    // Requisição pública à página da vitrine (/pizza-a)
    const pageRes = await api.fetch(new Request('http://localhost/pizza-a'));
    assert.equal(pageRes.status, 200);
    assert.equal(
      pageRes.headers.get('cache-control'),
      'public, max-age=300, stale-while-revalidate=86400'
    );
    const csp = pageRes.headers.get('content-security-policy');
    assert.ok(csp);
    assert.match(csp, /default-src 'self'/);
    assert.match(csp, /script-src 'self'/);
    assert.doesNotMatch(csp, /script-src[^;]*unsafe-inline/);
    assert.match(csp, /frame-ancestors 'none'/);
    assert.match(csp, /form-action 'none'/);

    const pageHtml = await pageRes.text();
    assert.match(pageHtml, /Pizza A/);
    assert.match(pageHtml, /Margherita/);
    assert.match(pageHtml, /R\$\s*45,00/);
    assert.match(pageHtml, /Pedir no WhatsApp/);

    // Requisição pública ao JSON versionado por hash (/data/vitrines/pizza-a/releases/<hash>.json)
    const immutableRes = await api.fetch(
      new Request(`http://localhost${publication.immutableMenuUrl}`)
    );
    assert.equal(immutableRes.status, 200);
    assert.equal(
      immutableRes.headers.get('cache-control'),
      'public, max-age=31536000, immutable'
    );
    assert.match(immutableRes.headers.get('content-security-policy'), /script-src 'self'/);
    assert.deepEqual(await immutableRes.json(), publication.menu);

    // Requisição pública para /loja1 (piloto pré-compilado)
    const loja1Res = await api.fetch(new Request('http://localhost/loja1'));
    assert.equal(loja1Res.status, 200);
    assert.equal(
      loja1Res.headers.get('cache-control'),
      'public, max-age=300, stale-while-revalidate=86400'
    );

    assert.equal(supabaseCalls, 0, 'Nenhuma chamada externa/Supabase deve ocorrer em rotas públicas');
  });

  await t.test('5. Peso da vitrine pública < 100 KB, isolamento de recursos e build estático de /loja1', async () => {
    await promisify(execFile)(process.execPath, ['scripts/build.mjs'], { cwd: root });

    const vitrineFiles = [
      resolve(root, 'web/vitrine/index.html'),
      resolve(root, 'web/vitrine/vitrine.css'),
      resolve(root, 'web/vitrine/vitrine.js')
    ];

    let totalBytes = 0;
    for (const filePath of vitrineFiles) {
      const info = await stat(filePath);
      totalBytes += info.size;
      const source = await readFile(filePath, 'utf8');
      assert.doesNotMatch(
        source,
        /supabase\.co|service_role|SUPABASE_SERVICE_ROLE/i,
        `Arquivo público ${filePath} não pode referenciar Supabase ou chaves`
      );
      assert.doesNotMatch(
        source,
        /https?:\/\/(?!wa\.me|inspira\.dev\.br)/i,
        `Arquivo público ${filePath} não deve carregar CDNs ou rastreadores externos`
      );
    }

    const distLoja1HtmlStat = await stat(resolve(root, 'dist/loja1/index.html'));
    assert.ok(
      totalBytes < 102400,
      `Peso total de web/vitrine/ (${totalBytes} bytes) deve ser estritamente < 100 KB (102400 bytes)`
    );
    assert.ok(
      totalBytes + distLoja1HtmlStat.size < 102400,
      `Peso somado incluindo dist/loja1/index.html (${totalBytes + distLoja1HtmlStat.size} bytes) deve ser < 100 KB`
    );

    // Verifica artefatos estáticos de /loja1 gerados em dist/
    const loja1MenuRaw = await readFile(resolve(root, 'dist/data/vitrines/loja1/menu.json'), 'utf8');
    const loja1Menu = JSON.parse(loja1MenuRaw);
    assert.equal(loja1Menu.schemaVersion, 1);
    assert.equal(loja1Menu.template, 'pizzeria-v1');
    assert.equal(loja1Menu.slug, 'loja1');
    assert.equal(loja1Menu.name, 'Forno & Praça Pizzaria Artesanal');
    assert.equal(loja1Menu.currency, 'BRL');
    assert.equal(loja1Menu.items.length, 6);
    assert.equal(loja1Menu.categories.length, 3);
    assert.ok(
      !loja1Menu.items.some((item) => item.id === 'rascunho-inverno-oculto'),
      'Item inativo de content/vitrines/loja1.json jamais deve ser exportado para dist/'
    );

    const loja1Source = JSON.parse(
      await readFile(resolve(root, 'content/vitrines/loja1.json'), 'utf8')
    );
    const compiledCheck = await compilePublicStorefront(loja1Source);
    const releaseFileStat = await stat(
      resolve(root, `dist/data/vitrines/loja1/releases/${compiledCheck.hash}.json`)
    );
    assert.ok(releaseFileStat.isFile());

    // Verifica HTML pré-renderizado de dist/loja1/index.html e links exatos de WhatsApp via whatsappLink()
    const loja1Html = await readFile(resolve(root, 'dist/loja1/index.html'), 'utf8');
    assert.match(loja1Html, /Forno &amp; Praça Pizzaria Artesanal/);
    assert.match(loja1Html, /Pizzas Clássicas de Fermentação Natural/);
    assert.match(loja1Html, /Especiais da Casa/);
    assert.match(loja1Html, /Bebidas &amp; Sodas Artesanais/);
    assert.match(loja1Html, /R\$\s*48,00/);
    assert.match(loja1Html, /R\$\s*52,00/);
    assert.match(loja1Html, /R\$\s*14,00/);
    assert.doesNotMatch(loja1Html, /rascunho-inverno-oculto/);

    for (const item of loja1Menu.items) {
      const expectedWaLink = whatsappLink(loja1Menu, item.id).replace(/&/g, '&amp;');
      assert.ok(
        loja1Html.includes(expectedWaLink),
        `dist/loja1/index.html deve conter o link exato de whatsappLink() para ${item.id}`
      );
    }

    // Verifica regras de cache e CSP em dist/_headers
    const headersText = await readFile(resolve(root, 'dist/_headers'), 'utf8');
    assert.match(headersText, /\/loja1\s+Cache-Control: public, max-age=300, stale-while-revalidate=86400/);
    assert.match(headersText, /\/data\/vitrines\/\*\/releases\/\*\s+Cache-Control: public, max-age=31536000, immutable/);
  });

  await t.test('6. Roteamento de qualquer slug publicado (/pipira rev 6), página 404 para slugs não publicados e wrangler.jsonc run_worker_first', async () => {
    const api = createApiHandler();

    // Slug desconhecido retorna 404 HTML ("Essa página não está aqui.") com status 404 e CSP estrita
    const unknownRes = await api.fetch(new Request('https://vitrine.inspira.dev.br/pipira'));
    assert.equal(unknownRes.status, 404);
    assert.match(unknownRes.headers.get('content-type') || '', /text\/html/i);
    assert.match(unknownRes.headers.get('content-security-policy') || '', /script-src 'self'/);
    assert.equal(unknownRes.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(unknownRes.headers.get('x-frame-options'), 'DENY');
    assert.match(await unknownRes.text(), /Essa página<br>não está aqui\./);

    // Cria vitrine pipira no portal
    const createRes = await api.fetch(
      new Request('https://painel.inspira.dev.br/api/sites', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer token-owner',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: 'Pipira Pizzaria',
          slug: 'pipira',
          template: 'pizzeria-v1',
          whatsapp: '5511988887777'
        })
      })
    );
    assert.equal(createRes.status, 201);
    const { site: pipiraSite } = await createRes.json();

    // Enquanto não publicada (apenas rascunho), /pipira continua retornando 404 HTML
    const unpublishedRes = await api.fetch(new Request('https://vitrine.inspira.dev.br/pipira'));
    assert.equal(unpublishedRes.status, 404);
    assert.match(await unpublishedRes.text(), /Essa página<br>não está aqui\./);

    // Avança rascunho até revisão 6 e publica
    const pipiraDraft = {
      schemaVersion: 1,
      template: 'pizzeria-v1',
      slug: 'pipira',
      businessName: 'Pipira Pizzaria',
      whatsapp: '5511988887777',
      categories: [
        {
          name: 'Clássicas',
          items: [
            {
              id: 'pipira-marg',
              name: 'Margherita Pipira',
              description: 'Molho artesanal, muçarela e manjericão.',
              priceCents: 4900,
              active: true
            }
          ]
        }
      ]
    };

    for (let rev = 1; rev < 6; rev += 1) {
      const putRes = await api.fetch(
        new Request(`https://painel.inspira.dev.br/api/sites/${pipiraSite.id}/draft`, {
          method: 'PUT',
          headers: {
            Authorization: 'Bearer token-owner',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ revision: rev, content: pipiraDraft })
        })
      );
      assert.equal(putRes.status, 200);
    }

    const pubRes = await api.fetch(
      new Request(`https://painel.inspira.dev.br/api/sites/${pipiraSite.id}/publish`, {
        method: 'POST',
        headers: { Authorization: 'Bearer token-owner' }
      })
    );
    assert.equal(pubRes.status, 200);
    const { publication } = await pubRes.json();
    assert.equal(publication.slug, 'pipira');
    assert.equal(publication.revision, 6);
    assert.equal(publication.url, '/pipira');

    // Renderiza em vitrine.inspira.dev.br/pipira, painel.inspira.dev.br/pipira e workers.dev/pipira
    for (const url of [
      'https://vitrine.inspira.dev.br/pipira',
      'https://vitrine.inspira.dev.br/pipira/',
      'https://painel.inspira.dev.br/pipira',
      'https://vitrine-inspira.inspira.workers.dev/pipira'
    ]) {
      const res = await api.fetch(new Request(url));
      assert.equal(res.status, 200, `Esperado 200 em ${url}`);
      assert.match(res.headers.get('content-type') || '', /text\/html/i);
      assert.match(res.headers.get('content-security-policy') || '', /script-src 'self'/);
      assert.doesNotMatch(res.headers.get('content-security-policy') || '', /script-src[^;]*unsafe-inline/);
      const html = await res.text();
      assert.match(html, /Pipira Pizzaria/);
      assert.match(html, /\/pipira/);
      assert.match(html, /Margherita Pipira/);
      assert.match(html, /R\$\s*49,00/);
      assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/i);
    }

    // Verifica wrangler.jsonc: run_worker_first deve rotear /* para o Worker preservando regras !/ para assets estáticos
    const wranglerConfig = JSON.parse(await readFile(resolve(root, 'wrangler.jsonc'), 'utf8'));
    assert.ok(Array.isArray(wranglerConfig.assets.run_worker_first));
    assert.ok(
      wranglerConfig.assets.run_worker_first.includes('/*'),
      'wrangler.jsonc run_worker_first deve incluir /* para que slugs dinâmicos (/pipira) invoquem o Worker'
    );
    assert.ok(
      wranglerConfig.assets.run_worker_first.includes('!/assets/*') &&
        wranglerConfig.assets.run_worker_first.includes('!/portal/*') &&
        wranglerConfig.assets.run_worker_first.includes('!/vitrine/*'),
      'wrangler.jsonc run_worker_first deve manter exclusões !/ para assets estáticos'
    );
  });
});
