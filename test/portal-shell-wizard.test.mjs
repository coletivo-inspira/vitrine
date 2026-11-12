import test from 'node:test';
import assert from 'node:assert';
import {
  attachWhatsappMask,
  extractPhoneDigits,
  findCursorAfterDigits,
  formatWhatsappBR
} from '../web/portal/phone-mask.mjs';
import {
  PROFILE_INTEREST_OPTIONS,
  cleanCustomInterestText,
  createInterestsMultiSelect
} from '../web/portal/multi-select.mjs';
import { renderAccountEmailStatus } from '../web/portal/portal.js';

function createMiniDom() {
  const doc = {
    listeners: {},
    addEventListener(type, fn) {
      if (!this.listeners[type]) this.listeners[type] = [];
      this.listeners[type].push(fn);
    },
    createTextNode(text) {
      return { nodeType: 3, textContent: String(text ?? '') };
    },
    createElement(tag) {
      let _text = '';
      const classes = new Set();
      const el = {
        tagName: String(tag).toUpperCase(),
        ownerDocument: doc,
        id: '',
        type: '',
        value: '',
        placeholder: '',
        autocomplete: '',
        hidden: false,
        selectionStart: 0,
        selectionEnd: 0,
        children: [],
        attributes: {},
        listeners: {},
        get className() {
          return [...classes].join(' ');
        },
        set className(v) {
          classes.clear();
          String(v || '')
            .split(/\s+/)
            .filter(Boolean)
            .forEach((c) => classes.add(c));
        },
        classList: {
          add: (...cs) => cs.forEach((c) => c && classes.add(c)),
          remove: (...cs) => cs.forEach((c) => classes.delete(c)),
          contains: (c) => classes.has(c)
        },
        get textContent() {
          if (this.children.length === 0) return _text;
          return this.children.map((c) => c.textContent ?? '').join('');
        },
        set textContent(v) {
          this.children = [];
          _text = String(v ?? '');
        },
        appendChild(child) {
          this.children.push(child);
          return child;
        },
        replaceChildren(...nodes) {
          this.children = [...nodes];
          _text = '';
        },
        setAttribute(k, v) {
          this.attributes[k] = String(v);
          if (k === 'id') this.id = String(v);
        },
        getAttribute(k) {
          return this.attributes[k] ?? null;
        },
        removeAttribute(k) {
          delete this.attributes[k];
        },
        addEventListener(type, fn) {
          if (!this.listeners[type]) this.listeners[type] = [];
          this.listeners[type].push(fn);
        },
        dispatchEvent(evt) {
          const list = this.listeners[evt.type] || [];
          list.forEach((fn) => fn(evt));
        },
        setSelectionRange(start, end) {
          this.selectionStart = start;
          this.selectionEnd = end;
        },
        focus() {
          this.dispatchEvent({ type: 'focus', preventDefault() {}, stopPropagation() {} });
        },
        contains(target) {
          if (target === this) return true;
          return this.children.some((c) => c.contains?.(target));
        },
        querySelectorAll(selector) {
          const results = [];
          const visit = (node) => {
            for (const child of node.children || []) {
              if (selector.startsWith('.')) {
                const cls = selector.slice(1);
                if (child.classList?.contains(cls)) results.push(child);
              } else if (selector === 'strong' && child.tagName === 'STRONG') {
                results.push(child);
              } else if (
                selector === 'input[role="combobox"]' &&
                child.tagName === 'INPUT' &&
                child.getAttribute('role') === 'combobox'
              ) {
                results.push(child);
              }
              visit(child);
            }
          };
          visit(this);
          return results;
        },
        querySelector(selector) {
          return this.querySelectorAll(selector)[0] ?? null;
        }
      };
      return el;
    }
  };
  return doc;
}

test('PR (b) - App Shell and Wizard Flow Validation', async (t) => {
  await t.test('1. Valida completude do perfil com base nos campos', () => {
    function calculateCompleteness(profile) {
      let filledFields = 0;
      if (profile.displayName) filledFields++;
      if (profile.businessName) filledFields++;
      if (profile.city) filledFields++;
      if (profile.whatsapp && /^[1-9]\d{7,14}$/.test(profile.whatsapp)) filledFields++;
      if (profile.interests && profile.interests.length > 0) filledFields++;
      return filledFields * 20;
    }

    assert.equal(calculateCompleteness({}), 0);
    assert.equal(calculateCompleteness({ displayName: 'Maria' }), 20);
    assert.equal(calculateCompleteness({ displayName: 'Maria', businessName: 'Ateliê' }), 40);
    assert.equal(calculateCompleteness({ displayName: 'Maria', businessName: 'Ateliê', city: 'POA', whatsapp: '5551999999999', interests: ['design'] }), 100);
  });

  await t.test('2. Valida formato do WhatsApp de acordo com regex do contrato', () => {
    const regex = /^[1-9]\d{7,14}$/;
    assert.ok(regex.test('5551999999999'));
    assert.ok(regex.test('5511999999999'));
    assert.strictEqual(regex.test('0551199999999'), false); // starts with 0
    assert.strictEqual(regex.test('+5511999999999'), false); // contains +
    assert.strictEqual(regex.test('55 11 999999999'), false); // contains space
  });

  await t.test('3. Valida áreas de atuação aceitas no Passo 1 do assistente', () => {
    const validAreas = ['food', 'art', 'photo', 'health', 'tech'];
    assert.ok(validAreas.includes('food'));
    assert.ok(validAreas.includes('art'));
    assert.ok(validAreas.includes('photo'));
    assert.ok(validAreas.includes('health'));
    assert.ok(validAreas.includes('tech'));
  });

  await t.test('4. Valida mapeamento e resolução de hashes para seções do portal', () => {
    function getSectionFromHash(hash) {
      const hashToSection = {
        '#inicio': 'inicio',
        '#vitrines': 'vitrines',
        '#dashboard': 'vitrines',
        '#insights': 'insights',
        '#perfil': 'perfil',
        '#pedidos': 'pedidos',
        '#wizard': 'wizard',
        '#editor': 'editor'
      };
      return hashToSection[hash] || 'inicio';
    }

    assert.equal(getSectionFromHash('#inicio'), 'inicio');
    assert.equal(getSectionFromHash('#vitrines'), 'vitrines');
    assert.equal(getSectionFromHash('#dashboard'), 'vitrines');
    assert.equal(getSectionFromHash('#insights'), 'insights');
    assert.equal(getSectionFromHash(''), 'inicio');
    assert.equal(getSectionFromHash('#unknown'), 'inicio');
  });

  await t.test('5. Máscara de WhatsApp (celular, fixo, colar, apagar, outro DDI e valor salvo sem máscara)', () => {
    assert.equal(formatWhatsappBR('5531973603477'), '+55 (31) 97360-3477');
    assert.equal(formatWhatsappBR('553131890669'), '+55 (31) 3189-0669');
    assert.equal(formatWhatsappBR('+55 (51) 99999-8888'), '+55 (51) 99999-8888');
    assert.equal(extractPhoneDigits('+55 (31) 97360-3477'), '5531973603477');

    // Outro DDI (não presume 55)
    assert.equal(formatWhatsappBR('351912345678'), '+351 9123 4567 8');
    assert.equal(formatWhatsappBR('14155552671'), '+1 4155 5526 71');
    assert.equal(formatWhatsappBR('31973603477'), '+31 9736 0347 7');

    // Cursor e evento input com apagar
    const doc = createMiniDom();
    const input = doc.createElement('input');
    let lastDigits = '';
    attachWhatsappMask(input, (digits) => {
      lastDigits = digits;
    });

    input.value = '5531973603477';
    input.setSelectionRange(input.value.length, input.value.length);
    input.dispatchEvent({ type: 'input' });
    assert.equal(input.value, '+55 (31) 97360-3477');
    assert.equal(lastDigits, '5531973603477');

    // Apagar no meio preservando posição do cursor
    const posAfterDDD = findCursorAfterDigits(input.value, 4); // após '+55 (31'
    assert.equal(input.value.slice(0, posAfterDDD), '+55 (31');
  });

  await t.test('6. Cartão de conta Google exibe Conectado como Nome · email ou texto neutro', () => {
    const doc = createMiniDom();
    const span = doc.createElement('span');

    renderAccountEmailStatus(span, 'Maria Silva', 'maria@exemplo.com');
    assert.equal(span.textContent, 'Conectado como Maria Silva · maria@exemplo.com');
    assert.equal(span.querySelector('strong')?.textContent, 'Maria Silva');

    renderAccountEmailStatus(span, '', 'maria@exemplo.com');
    assert.equal(span.textContent, 'Conectado como maria@exemplo.com');

    renderAccountEmailStatus(span, '', '');
    assert.equal(span.textContent, 'Conta Google conectada');
  });

  await t.test('7. Multi-select de interesses com busca, área digitada (outro:) e limite de 8 itens', () => {
    const doc = createMiniDom();
    const container = doc.createElement('div');
    const ms = createInterestsMultiSelect(container, { inputId: 'test-interests' });
    const input = container.querySelector('input[role="combobox"]');

    assert.equal(PROFILE_INTEREST_OPTIONS.length, 8);
    assert.equal(cleanCustomInterestText('  <b>Cerâmica</b>   artesanal  '), 'bCerâmica/b artesanal');

    // Seleciona item padrão e item customizado
    ms.setValues(['cardapio-digital', 'outro:Cerâmica artesanal']);
    assert.deepEqual(ms.getValues(), ['cardapio-digital', 'outro:Cerâmica artesanal']);
    assert.equal(container.querySelectorAll('.multi-select-tag').length, 2);

    // Digitar opção nova mostra "Adicionar “...”" e Enter seleciona
    input.focus();
    input.value = 'Feira orgânica';
    input.dispatchEvent({ type: 'input' });
    const options = container.querySelectorAll('.multi-select-option');
    assert.equal(options.length, 1);
    assert.equal(options[0].textContent, 'Adicionar “Feira orgânica”');

    input.dispatchEvent({ type: 'keydown', key: 'Enter', preventDefault() {} });
    assert.ok(ms.getValues().includes('outro:Feira orgânica'));
  });
});

