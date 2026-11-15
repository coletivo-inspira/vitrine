import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolveVisitOrigin } from '../web/assets/metrics-source.mjs';
import {
  COMMENT_TO_VITRINE_GUIDE_URL,
  COMMENT_VARIABLE_NAME,
  buildCommentToVitrineUrl,
  buildVitrineBaseUrl,
  mountCommentToVitrinePanel,
  normalizeCommentCampaign
} from '../web/portal/comment-to-vitrine.mjs';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('nome do post vira campanha aceita pelos Insights', () => {
  assert.deepEqual(normalizeCommentCampaign('reel_01'), { value: 'reel_01', error: '' });
  assert.equal(normalizeCommentCampaign('Reel de Natal!').value, 'reel_de_natal');
  assert.equal(normalizeCommentCampaign('  Promoção Dia das Mães  ').value, 'promocao_dia_das_maes');
  assert.equal(normalizeCommentCampaign('__-post').value, 'post');
  assert.equal(normalizeCommentCampaign('a'.repeat(40)).value.length, 32);
  assert.equal(normalizeCommentCampaign(`${'a'.repeat(31)}_b`).value, 'a'.repeat(31));
  assert.match(normalizeCommentCampaign('').error, /nome curto/);
  assert.match(normalizeCommentCampaign('!!!').error, /nome curto/);
  const phone = normalizeCommentCampaign('post 119999');
  assert.equal(phone.value, '');
  assert.match(phone.error, /seis números/);
});

test('link do Direct usa ig_comment e volta igual pela leitura da vitrine', () => {
  const url = buildCommentToVitrineUrl('loja1', 'Reel 01');
  assert.equal(url, 'https://vitrine.inspira.dev.br/loja1?utm_source=ig_comment&utm_campaign=reel_01');
  assert.deepEqual(resolveVisitOrigin(new URL(url).search), { source: 'ig_comment', campaign: 'reel_01' });
  assert.equal(buildCommentToVitrineUrl('loja1', '123456'), 'https://vitrine.inspira.dev.br/loja1?utm_source=ig_comment');
  assert.equal(buildVitrineBaseUrl('loja1'), 'https://vitrine.inspira.dev.br/loja1');
  assert.equal(buildVitrineBaseUrl('a b'), 'https://vitrine.inspira.dev.br/a%20b');
});

function fakeDom() {
  const byId = new Map();
  const make = (tag) => {
    const node = {
      tagName: tag.toUpperCase(),
      attributes: {},
      children: [],
      listeners: {},
      textContent: '',
      value: '',
      hidden: false,
      setAttribute(name, value) {
        this.attributes[name] = value;
        if (name === 'id') {
          this.id = value;
          byId.set(value, this);
        }
        if (name === 'hidden') this.hidden = true;
      },
      getAttribute(name) {
        return this.attributes[name] ?? null;
      },
      append(...nodes) {
        for (const child of nodes) {
          if (typeof child === 'string') continue;
          child.parent = this;
          this.children.push(child);
        }
      },
      replaceChildren(...nodes) {
        this.children = [];
        this.append(...nodes);
      },
      addEventListener(type, handler) {
        (this.listeners[type] ??= []).push(handler);
      },
      closest(selector) {
        const attr = selector.slice(1, -1);
        for (let current = this; current; current = current.parent) {
          if (current.attributes?.[attr] !== undefined) return current;
        }
        return null;
      },
      focus() {
        doc.activeElement = this;
      },
      select() {
        this.selected = true;
      }
    };
    return node;
  };
  const doc = {
    activeElement: null,
    createElement: make,
    getElementById: (id) => byId.get(id) ?? null
  };
  const root = make('div');
  root.setAttribute('id', 'editor-comment-kit');
  return { doc, root };
}

function fire(root, type, target) {
  for (const handler of root.listeners[type] ?? []) handler({ target });
}

test('ajuda do painel monta o link, valida o nome e copia com anúncio', async (t) => {
  const { doc, root } = fakeDom();
  const copied = [];
  const previousDocument = globalThis.document;
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  globalThis.document = doc;
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { clipboard: { writeText: async (text) => copied.push(text) } }
  });
  t.after(() => {
    globalThis.document = previousDocument;
    if (navigatorDescriptor) Object.defineProperty(globalThis, 'navigator', navigatorDescriptor);
    else delete globalThis.navigator;
  });

  mountCommentToVitrinePanel({ getSlug: () => 'pizza-a' });
  const get = (id) => doc.getElementById(id);
  assert.equal(get('editor-comment-campaign').value, 'reel_01');
  assert.equal(get('editor-comment-link').value, 'https://vitrine.inspira.dev.br/pizza-a?utm_source=ig_comment&utm_campaign=reel_01');
  assert.equal(get('editor-comment-variable').value, 'https://vitrine.inspira.dev.br/pizza-a');
  assert.equal(get('editor-comment-status').attributes.role, 'status');
  assert.equal(get('editor-comment-status').attributes['aria-live'], 'polite');

  const campaign = get('editor-comment-campaign');
  campaign.value = 'Promo Dia das Mães';
  fire(root, 'input', campaign);
  assert.equal(get('editor-comment-link').value, 'https://vitrine.inspira.dev.br/pizza-a?utm_source=ig_comment&utm_campaign=promo_dia_das_maes');
  assert.equal(campaign.attributes['aria-invalid'], 'false');

  const buttons = [];
  const walk = (node) => {
    if (node.attributes?.['data-copy']) buttons.push(node);
    node.children?.forEach(walk);
  };
  walk(root);
  assert.deepEqual(buttons.map((b) => b.textContent), ['Copiar', 'Copiar']);
  assert.equal(new Set(buttons.map((b) => b.attributes['aria-label'])).size, 2);

  fire(root, 'click', buttons[0]);
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.deepEqual(copied, [get('editor-comment-link').value]);
  assert.equal(get('editor-comment-status').textContent, 'Link do Direct copiado.');

  fire(root, 'click', buttons[1]);
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.equal(copied[1], 'https://vitrine.inspira.dev.br/pizza-a');
  assert.equal(get('editor-comment-status').textContent, `Valor de ${COMMENT_VARIABLE_NAME} copiado.`);

  campaign.value = 'post 123456';
  fire(root, 'input', campaign);
  assert.equal(campaign.attributes['aria-invalid'], 'true');
  assert.equal(get('editor-comment-campaign-error').hidden, false);
  fire(root, 'click', buttons[0]);
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.equal(copied.length, 2);
  assert.equal(doc.activeElement, campaign);

  globalThis.navigator.clipboard.writeText = async () => {
    throw new Error('negado');
  };
  fire(root, 'click', buttons[1]);
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.equal(get('editor-comment-variable').selected, true);
  assert.match(get('editor-comment-status').textContent, /selecionado/);
});

test('painel só chama o módulo e nada fala com a Meta', async () => {
  const [module, editor, html, guide] = await Promise.all([
    read('web/portal/comment-to-vitrine.mjs'),
    read('web/portal/editor.js'),
    read('web/portal/index.html'),
    read('docs/aquisicao/comment-to-vitrine.md')
  ]);
  assert.doesNotMatch(module, /fetch\(|XMLHttpRequest|graph\.facebook|instagram\.com|manychat\.com\/api/);
  assert.match(editor, /import \{ mountCommentToVitrinePanel \} from '\.\/comment-to-vitrine\.mjs';/);
  assert.match(editor, /mountCommentToVitrinePanel\(\{ getSlug: \(\) => currentSite\?\.slug \}\);/);
  assert.match(html, /<div id="editor-comment-kit">/);
  assert.match(html, /href="\.\/comment-to-vitrine\.css"/);
  assert.equal(COMMENT_TO_VITRINE_GUIDE_URL.endsWith('docs/aquisicao/comment-to-vitrine.md'), true);
  assert.match(guide, /URL_VITRINE_INSPIRA/);
  assert.match(guide, /\?utm_source=ig_comment&utm_campaign=/);
  assert.match(guide, /Usar como modelo/);
  assert.match(guide, /BotConversa/);
  assert.match(guide, /vitrine-json\.md/);
  assert.match(guide, /24 h/);
});

test('guia e ajuda dizem "vitrine" e datam preços de terceiros', async () => {
  const [module, guide] = await Promise.all([
    read('web/portal/comment-to-vitrine.mjs'),
    read('docs/aquisicao/comment-to-vitrine.md')
  ]);
  for (const text of [module, guide]) {
    assert.doesNotMatch(text, /cat[aá]logo|card[aá]pio/i);
  }
  assert.doesNotMatch(guide, /garantimos|resultado garantido|vendas garantidas/i);
  for (const line of guide.split('\n').filter((l) => /US\$|R\$/.test(l))) {
    const section = guide.slice(0, guide.indexOf(line));
    assert.match(section, /2026-11-14/, `preço sem data: ${line}`);
  }
});
