/**
 * Painel: campos opcionais da página do item (detalhes, descrição longa, perguntas
 * frequentes e galeria) dentro do cartão do item no editor da vitrine.
 * Renderizar não altera o item: só a digitação do visitante muda o rascunho.
 */
import {
  ITEM_PAGE_LIMITS,
  detailsFromText,
  detailsToText,
  hasItemPageContent,
  parseDetailLine
} from '../assets/item-page-fields.mjs';

const openItems = new Set();

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function counterText(length, max) {
  return `${length.toLocaleString('pt-BR')} de ${max.toLocaleString('pt-BR')} caracteres`;
}

/** Aviso do campo de detalhes enquanto a pessoa digita (a publicação exige o formato). */
export function describeDetailsProblem(value) {
  const lines = detailsFromText(value);
  if (lines.length > ITEM_PAGE_LIMITS.details) {
    return `Use no máximo ${ITEM_PAGE_LIMITS.details} linhas; agora são ${lines.length}.`;
  }
  const index = lines.findIndex((line) => {
    const parsed = parseDetailLine(line);
    return !parsed || !parsed.label || !parsed.value;
  });
  if (index >= 0) return `Linha ${index + 1}: escreva no formato "Rótulo: valor".`;
  const tooLong = lines.findIndex((line) => {
    const parsed = parseDetailLine(line);
    return parsed.label.length > ITEM_PAGE_LIMITS.detailLabel || parsed.value.length > ITEM_PAGE_LIMITS.detailValue;
  });
  if (tooLong >= 0) {
    return `Linha ${tooLong + 1}: rótulo até ${ITEM_PAGE_LIMITS.detailLabel} caracteres e valor até ${ITEM_PAGE_LIMITS.detailValue}.`;
  }
  return '';
}

function fieldGroup(labelText, id) {
  const group = el('div', 'form-group item-page-editor-field');
  const label = el('label', '', labelText);
  label.setAttribute('for', id);
  group.appendChild(label);
  return group;
}

function renderDetails(item, id, onChange) {
  const group = fieldGroup('Detalhes (opcional)', `item-details-${id}`);
  const input = el('textarea', 'item-input textarea-styled');
  input.id = `item-details-${id}`;
  input.rows = 4;
  input.value = detailsToText(item.details);
  input.placeholder = 'Duração: 1 hora\nLocal: on-line';
  const help = el('span', 'form-help', `Até ${ITEM_PAGE_LIMITS.details} linhas, uma por detalhe, no formato Rótulo: valor.`);
  help.id = `item-details-help-${id}`;
  const problem = el('span', 'form-error-msg item-page-editor-problem');
  problem.id = `item-details-problem-${id}`;
  problem.setAttribute('role', 'status');
  input.setAttribute('aria-describedby', `${help.id} ${problem.id}`);
  const showProblem = () => {
    problem.textContent = describeDetailsProblem(input.value);
    input.setAttribute('aria-invalid', problem.textContent ? 'true' : 'false');
  };
  showProblem();
  input.addEventListener('input', () => {
    const lines = detailsFromText(input.value);
    if (lines.length) item.details = lines;
    else delete item.details;
    showProblem();
    onChange();
  });
  group.append(input, help, problem);
  return group;
}

function renderLongDescription(item, id, onChange) {
  const max = ITEM_PAGE_LIMITS.longDescription;
  const group = fieldGroup('Descrição longa (opcional)', `item-long-${id}`);
  const input = el('textarea', 'item-input textarea-styled item-page-editor-long');
  input.id = `item-long-${id}`;
  input.rows = 6;
  input.maxLength = max;
  input.value = item.longDescription || '';
  input.placeholder = 'Conte o que a pessoa recebe, como funciona e o que levar. Deixe uma linha em branco entre parágrafos.';
  const counter = el('span', 'form-help', counterText(input.value.length, max));
  counter.id = `item-long-count-${id}`;
  input.setAttribute('aria-describedby', counter.id);
  input.addEventListener('input', () => {
    if (input.value.trim()) item.longDescription = input.value;
    else delete item.longDescription;
    counter.textContent = counterText(input.value.length, max);
    onChange();
  });
  group.append(input, counter);
  return group;
}

function renderFaq(item, id, onChange, rebuild) {
  const box = el('fieldset', 'item-page-editor-faq');
  box.appendChild(el('legend', '', `Perguntas frequentes do item (até ${ITEM_PAGE_LIMITS.faq})`));
  const entries = Array.isArray(item.faq) ? item.faq : [];
  const list = el('ol', 'item-page-editor-faq-list');
  entries.forEach((entry, index) => {
    const n = index + 1;
    const row = el('li', 'item-page-editor-faq-entry');
    const qGroup = fieldGroup(`Pergunta ${n}`, `item-faq-q-${id}-${index}`);
    const q = el('textarea', 'item-input textarea-styled item-page-editor-question');
    q.rows = 2;
    q.id = `item-faq-q-${id}-${index}`;
    q.maxLength = ITEM_PAGE_LIMITS.faqQuestion;
    q.value = entry?.q || '';
    q.placeholder = 'Ex.: Preciso levar algo?';
    q.addEventListener('input', () => {
      entry.q = q.value.replace(/\s*\n\s*/g, ' ');
      onChange();
    });
    qGroup.appendChild(q);
    const aGroup = fieldGroup(`Resposta ${n}`, `item-faq-a-${id}-${index}`);
    const a = el('textarea', 'item-input textarea-styled');
    a.id = `item-faq-a-${id}-${index}`;
    a.rows = 2;
    a.maxLength = ITEM_PAGE_LIMITS.faqAnswer;
    a.value = entry?.a || '';
    a.placeholder = `Até ${ITEM_PAGE_LIMITS.faqAnswer} caracteres`;
    a.addEventListener('input', () => {
      entry.a = a.value;
      onChange();
    });
    aGroup.appendChild(a);
    const remove = el('button', 'button button-small button-secondary button-pill', 'Remover');
    remove.type = 'button';
    remove.setAttribute('aria-label', `Remover pergunta ${n}`);
    remove.addEventListener('click', () => {
      entries.splice(index, 1);
      if (!entries.length) delete item.faq;
      onChange();
      rebuild('.item-page-editor-faq-add');
    });
    row.append(qGroup, aGroup, remove);
    list.appendChild(row);
  });
  if (entries.length) box.appendChild(list);
  const add = el('button', 'button button-small button-secondary button-pill item-page-editor-faq-add', 'Adicionar pergunta');
  add.type = 'button';
  add.disabled = entries.length >= ITEM_PAGE_LIMITS.faq;
  add.addEventListener('click', () => {
    item.faq = [...entries, { q: '', a: '' }];
    onChange();
    rebuild(`#item-faq-q-${id}-${item.faq.length - 1}`);
  });
  box.appendChild(add);
  return box;
}

function renderGallery(item, id, { onChange, rebuild, uploadImage, isOnline, notify }) {
  const box = el('div', 'form-group item-page-editor-field item-page-editor-gallery');
  const fileId = `item-gallery-file-${id}`;
  const label = el('label', '', `Galeria (até ${ITEM_PAGE_LIMITS.gallery} fotos além da foto principal)`);
  label.setAttribute('for', fileId);
  box.appendChild(label);
  const photos = Array.isArray(item.gallery) ? item.gallery : [];
  if (photos.length) {
    const list = el('ul', 'item-page-editor-gallery-list');
    photos.forEach((url, index) => {
      const row = el('li', 'item-page-editor-gallery-entry');
      const img = el('img');
      img.src = url;
      img.alt = `Foto ${index + 1} da galeria`;
      img.width = 64;
      img.height = 48;
      img.loading = 'lazy';
      const remove = el('button', 'button button-small button-secondary button-pill', 'Remover');
      remove.type = 'button';
      remove.setAttribute('aria-label', `Remover foto ${index + 1} da galeria`);
      remove.addEventListener('click', () => {
        photos.splice(index, 1);
        if (!photos.length) delete item.gallery;
        onChange();
        rebuild(`#${fileId}-button`);
      });
      row.append(img, remove);
      list.appendChild(row);
    });
    box.appendChild(list);
  }
  const group = el('div', 'file-upload-group');
  const file = el('input', 'file-input-hidden');
  file.type = 'file';
  file.id = fileId;
  file.accept = 'image/*';
  const button = el('button', 'button button-small button-secondary button-pill', 'Adicionar foto');
  button.type = 'button';
  button.id = `${fileId}-button`;
  button.disabled = photos.length >= ITEM_PAGE_LIMITS.gallery;
  button.addEventListener('click', () => file.click());
  const status = el('span', 'upload-status-text', 'WebP até 200 KB, convertida automaticamente');
  status.setAttribute('role', 'status');
  file.addEventListener('change', async () => {
    const chosen = file.files?.[0];
    if (!chosen) return;
    if (!isOnline()) {
      notify('Entre na sua conta para enviar fotos da galeria ao armazenamento.', 'info');
      return;
    }
    status.textContent = 'Convertendo e enviando...';
    try {
      const url = await uploadImage(chosen);
      item.gallery = [...photos, url].slice(0, ITEM_PAGE_LIMITS.gallery);
      onChange();
      rebuild(`#${fileId}-button`);
    } catch (error) {
      status.textContent = 'Falha ao enviar a foto';
      notify(error?.message || 'Erro ao processar ou enviar a imagem.', 'error');
    }
  });
  group.append(file, button, status);
  box.appendChild(group);
  return box;
}

/**
 * Acrescenta a seção recolhível "Página do item" ao grid de campos do cartão.
 * `deps`: `onChange` (salva e atualiza a prévia), `uploadImage(file) → url`,
 * `isOnline()` e `notify(mensagem, tipo)`.
 */
export function renderItemPageFields(item, fields, deps) {
  const id = String(item.id);
  const section = el('details', 'item-page-editor item-fields-full');
  section.open = openItems.has(id);
  section.addEventListener('toggle', () => {
    if (section.open) openItems.add(id);
    else openItems.delete(id);
  });
  const summary = el('summary', 'item-page-editor-summary');
  summary.appendChild(el('span', 'item-page-editor-title', 'Página do item (opcional)'));
  const hint = el('span', 'item-page-editor-hint');
  summary.appendChild(hint);
  section.appendChild(summary);
  const body = el('div', 'item-page-editor-body');
  section.appendChild(body);

  const refreshHint = () => {
    hint.textContent = hasItemPageContent(item)
      ? 'Com conteúdo: o cartão mostra "Ver detalhes"'
      : 'Detalhes, descrição longa, perguntas e galeria';
  };
  const onChange = () => {
    refreshHint();
    deps.onChange();
  };
  const rebuild = (focusSelector) => {
    body.replaceChildren(
      el('p', 'form-help item-page-editor-intro', 'Tudo aqui aparece na página própria do item, com endereço para compartilhar.'),
      renderDetails(item, id, onChange),
      renderLongDescription(item, id, onChange),
      renderFaq(item, id, onChange, rebuild),
      renderGallery(item, id, { ...deps, onChange, rebuild })
    );
    if (focusSelector) body.querySelector(focusSelector)?.focus();
  };
  refreshHint();
  rebuild();
  fields.appendChild(section);
  return section;
}
