import { showFeedback } from './portal.js';

// Active editor state
let currentSite = null;
let currentIsOnline = false;
let currentDraft = null; // { siteId, revision, updatedAt, content }

// DOM Elements
const editorSiteTitle = document.getElementById('editor-site-title');
const editorSiteSlug = document.getElementById('editor-site-slug');
const editorRevisionIndicator = document.getElementById('editor-revision-indicator');
const saveDraftButton = document.getElementById('save-draft-button');
const publishSiteButton = document.getElementById('publish-site-button');
const publicationStatusBar = document.getElementById('publication-status-bar');
const publicationStatusText = document.getElementById('publication-status-text');
const publicationViewLink = document.getElementById('publication-view-link');
const conflictBanner = document.getElementById('conflict-banner');
const reloadConflictButton = document.getElementById('reload-conflict-button');
const copyConflictButton = document.getElementById('copy-conflict-button');

// Meters & warnings
const activeItemsCount = document.getElementById('active-items-count');
const activeItemsProgress = document.getElementById('active-items-progress');
const activeItemsWarning = document.getElementById('active-items-warning');

const totalItemsCount = document.getElementById('total-items-count');
const totalItemsProgress = document.getElementById('total-items-progress');
const totalItemsWarning = document.getElementById('total-items-warning');

const draftSizeCount = document.getElementById('draft-size-count');
const draftSizeProgress = document.getElementById('draft-size-progress');
const draftSizeWarning = document.getElementById('draft-size-warning');

// Form & Container
const editorSettingsForm = document.getElementById('editor-settings-form');
const editorWhatsapp = document.getElementById('editor-whatsapp');
const editorWhatsappError = document.getElementById('editor-whatsapp-error');
const addCategoryButton = document.getElementById('add-category-button');
const categoriesContainer = document.getElementById('categories-container');
const liveStorefrontPreview = document.getElementById('live-storefront-preview');

// Entrypoint exported to portal.js
export async function loadEditor(site, isOnline) {
  currentSite = site;
  currentIsOnline = isOnline;
  currentDraft = null;
  conflictBanner.hidden = true;
  if (publicationStatusBar) {
    publicationStatusBar.hidden = true;
  }

  editorSiteTitle.textContent = site.name;
  editorSiteSlug.textContent = `vitrine.inspira.dev.br/${site.slug}`;

  // Clear workspace
  categoriesContainer.innerHTML = '<p class="loading-msg">Carregando cardápio...</p>';

  if (isOnline) {
    try {
      const res = await fetch(`/api/sites/${site.id}/draft`);
      if (res.ok) {
        const data = await res.json();
        currentDraft = data.draft;
        initializeEditorWorkspace();
      } else {
        showFeedback('Erro ao carregar o rascunho remoto.', 'error');
      }
    } catch (err) {
      showFeedback('Falha de rede ao buscar o rascunho.', 'error');
    }
  } else {
    // Offline local storage draft lookup
    const saved = localStorage.getItem(`vitrine_local_draft_${site.id}`);
    if (saved) {
      currentDraft = JSON.parse(saved);
    } else {
      // Create empty fallback
      currentDraft = {
        siteId: site.id,
        revision: 1,
        updatedAt: new Date().toISOString(),
        content: {
          schemaVersion: 1,
          template: "pizzeria-v1",
          slug: site.slug,
          businessName: site.name,
          whatsapp: "5511999999999",
          categories: []
        }
      };
      localStorage.setItem(`vitrine_local_draft_${site.id}`, JSON.stringify(currentDraft));
    }
    initializeEditorWorkspace();
  }
}

// Bind event listeners specific to the editor
function setupEditorEvents() {
  // Only register these once
  if (window.editorEventsBound) return;
  window.editorEventsBound = true;

  saveDraftButton.addEventListener('click', async () => {
    await handleSaveDraft();
  });

  if (publishSiteButton) {
    publishSiteButton.addEventListener('click', async () => {
      await handlePublishSite();
    });
  }

  if (editorSettingsForm) {
    editorSettingsForm.addEventListener('submit', (e) => {
      e.preventDefault();
    });
  }

  addCategoryButton.addEventListener('click', () => {
    addCategory();
  });

  editorWhatsapp.addEventListener('input', () => {
    const rawPhone = editorWhatsapp.value.replace(/\D/g, ''); // allow only digits
    editorWhatsapp.value = rawPhone;
    
    if (rawPhone && !/^[1-9]\d{7,14}$/.test(rawPhone)) {
      editorWhatsappError.hidden = false;
    } else {
      editorWhatsappError.hidden = true;
    }
    updateDraftAndPreview();
  });

  // Conflict actions
  reloadConflictButton.addEventListener('click', async () => {
    conflictBanner.hidden = true;
    await loadEditor(currentSite, currentIsOnline);
  });

  copyConflictButton.addEventListener('click', async () => {
    try {
      const serialized = JSON.stringify(currentDraft.content, null, 2);
      await navigator.clipboard.writeText(serialized);
      showFeedback('Conteúdo do rascunho copiado para a área de transferência!', 'success');
    } catch (err) {
      showFeedback('Erro ao copiar rascunho local.', 'error');
    }
  });
}

// Initial paint
function initializeEditorWorkspace() {
  setupEditorEvents();

  editorRevisionIndicator.textContent = `Revisão: ${currentDraft.revision}`;
  
  // Fill settings
  editorWhatsapp.value = currentDraft.content.whatsapp || '';
  editorWhatsappError.hidden = true;

  // Ensure categories is initialized
  if (!currentDraft.content.categories) {
    currentDraft.content.categories = [];
  }

  renderCategories();
  updateDraftAndPreview();
}

// Currency Formatter / Mask helpers
function formatCentsToReais(cents) {
  if (typeof cents !== 'number' || isNaN(cents)) return 'R$ 0,00';
  const reais = cents / 100;
  return reais.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function maskMoneyInput(inputEl) {
  let value = inputEl.value.replace(/\D/g, ''); // only digits
  if (!value) {
    inputEl.value = '';
    return;
  }
  let integerPart = value.slice(0, -2) || '0';
  let decimalPart = value.slice(-2).padStart(2, '0');
  integerPart = parseInt(integerPart, 10).toString();
  
  inputEl.value = `R$ ${integerPart},${decimalPart}`;
}

function parseReaisToCents(valStr) {
  const digits = valStr.replace(/\D/g, '');
  return parseInt(digits, 10) || 0;
}

// Render the entire categories builder workspace
function renderCategories() {
  categoriesContainer.innerHTML = '';
  
  const categories = currentDraft.content.categories;
  if (categories.length === 0) {
    categoriesContainer.innerHTML = '<p class="empty-msg">Nenhuma categoria adicionada. Clique em "+ Categoria" para começar.</p>';
    return;
  }

  categories.forEach((category, catIndex) => {
    const block = document.createElement('div');
    block.className = 'category-block';
    block.dataset.index = catIndex;

    // Header
    const header = document.createElement('div');
    header.className = 'category-header';

    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.className = 'category-title-input';
    titleInput.value = category.name || '';
    titleInput.placeholder = 'Nome da Categoria (ex: Pizzas Tradicionais)';
    titleInput.addEventListener('input', () => {
      category.name = titleInput.value;
      updateDraftAndPreview();
    });

    const controls = document.createElement('div');
    controls.className = 'category-controls';

    // Move Up
    const moveUpBtn = document.createElement('button');
    moveUpBtn.type = 'button';
    moveUpBtn.className = 'button button-small button-secondary';
    moveUpBtn.textContent = '▲';
    moveUpBtn.disabled = catIndex === 0;
    moveUpBtn.setAttribute('aria-label', 'Mover Categoria para Cima');
    moveUpBtn.addEventListener('click', () => {
      moveCategory(catIndex, -1);
    });

    // Move Down
    const moveDownBtn = document.createElement('button');
    moveDownBtn.type = 'button';
    moveDownBtn.className = 'button button-small button-secondary';
    moveDownBtn.textContent = '▼';
    moveDownBtn.disabled = catIndex === categories.length - 1;
    moveDownBtn.setAttribute('aria-label', 'Mover Categoria para Baixo');
    moveDownBtn.addEventListener('click', () => {
      moveCategory(catIndex, 1);
    });

    // Add Item
    const addItemBtn = document.createElement('button');
    addItemBtn.type = 'button';
    addItemBtn.className = 'button button-small';
    addItemBtn.textContent = '+ Item';
    addItemBtn.addEventListener('click', () => {
      addItemToCategory(catIndex);
    });

    // Delete Category
    const deleteCatBtn = document.createElement('button');
    deleteCatBtn.type = 'button';
    deleteCatBtn.className = 'button button-small button-secondary';
    deleteCatBtn.textContent = 'Excluir';
    deleteCatBtn.addEventListener('click', () => {
      deleteCategory(catIndex);
    });

    controls.appendChild(moveUpBtn);
    controls.appendChild(moveDownBtn);
    controls.appendChild(addItemBtn);
    controls.appendChild(deleteCatBtn);

    header.appendChild(titleInput);
    header.appendChild(controls);

    // Items list
    const itemsList = document.createElement('div');
    itemsList.className = 'category-items-list';

    if (!category.items) category.items = [];

    category.items.forEach((item, itemIndex) => {
      const itemBlock = renderItemBlock(catIndex, itemIndex, item);
      itemsList.appendChild(itemBlock);
    });

    block.appendChild(header);
    block.appendChild(itemsList);
    categoriesContainer.appendChild(block);
  });
}

function renderItemBlock(catIndex, itemIndex, item) {
  const itemBlock = document.createElement('div');
  itemBlock.className = 'item-block';

  const fields = document.createElement('div');
  fields.className = 'item-fields';

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'item-input';
  nameInput.value = item.name || '';
  nameInput.placeholder = 'Nome do Produto (ex: Margherita)';
  nameInput.addEventListener('input', () => {
    item.name = nameInput.value;
    updateDraftAndPreview();
  });

  const priceInput = document.createElement('input');
  priceInput.type = 'text';
  priceInput.className = 'item-input';
  priceInput.placeholder = 'Preço (ex: R$ 49,90)';
  if (item.priceCents) {
    priceInput.value = formatCentsToReais(item.priceCents);
  } else {
    priceInput.value = '';
  }
  priceInput.addEventListener('input', () => {
    maskMoneyInput(priceInput);
    item.priceCents = parseReaisToCents(priceInput.value);
    updateDraftAndPreview();
  });

  const descInput = document.createElement('input');
  descInput.type = 'text';
  descInput.className = 'item-input item-fields-full';
  descInput.value = item.description || '';
  descInput.placeholder = 'Descrição opcional (ex: Molho fresca, mozzarella...)';
  descInput.addEventListener('input', () => {
    item.description = descInput.value;
    updateDraftAndPreview();
  });

  fields.appendChild(nameInput);
  fields.appendChild(priceInput);
  fields.appendChild(descInput);

  const controls = document.createElement('div');
  controls.className = 'item-controls';

  // Toggle Ocultar / Ativo
  const activeLabel = document.createElement('label');
  activeLabel.className = 'toggle-container';
  
  const activeCheckbox = document.createElement('input');
  activeCheckbox.type = 'checkbox';
  activeCheckbox.checked = item.active !== false; // default is true
  activeCheckbox.addEventListener('change', () => {
    item.active = activeCheckbox.checked;
    updateDraftAndPreview();
  });

  const activeText = document.createTextNode('Ativo');
  activeLabel.appendChild(activeCheckbox);
  activeLabel.appendChild(activeText);

  const removeItemBtn = document.createElement('button');
  removeItemBtn.type = 'button';
  removeItemBtn.className = 'button button-small button-secondary';
  removeItemBtn.textContent = 'Excluir';
  removeItemBtn.addEventListener('click', () => {
    removeItem(catIndex, itemIndex);
  });

  controls.appendChild(activeLabel);
  controls.appendChild(removeItemBtn);

  itemBlock.appendChild(fields);
  itemBlock.appendChild(controls);

  return itemBlock;
}

// Actions of categories list
function addCategory() {
  currentDraft.content.categories.push({
    name: '',
    items: []
  });
  renderCategories();
  updateDraftAndPreview();
}

function deleteCategory(catIndex) {
  currentDraft.content.categories.splice(catIndex, 1);
  renderCategories();
  updateDraftAndPreview();
}

function moveCategory(catIndex, direction) {
  const categories = currentDraft.content.categories;
  const targetIndex = catIndex + direction;
  if (targetIndex >= 0 && targetIndex < categories.length) {
    const temp = categories[catIndex];
    categories[catIndex] = categories[targetIndex];
    categories[targetIndex] = temp;
    renderCategories();
    updateDraftAndPreview();
  }
}

function addItemToCategory(catIndex) {
  const category = currentDraft.content.categories[catIndex];
  if (!category.items) category.items = [];

  category.items.push({
    id: `item-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    name: '',
    description: '',
    priceCents: 0,
    active: true
  });

  renderCategories();
  updateDraftAndPreview();
}

function removeItem(catIndex, itemIndex) {
  currentDraft.content.categories[catIndex].items.splice(itemIndex, 1);
  renderCategories();
  updateDraftAndPreview();
}

// Reactively calculate size and counts and render live preview
function updateDraftAndPreview() {
  if (!currentDraft) return;

  // Sync WhatsApp from form input
  currentDraft.content.whatsapp = editorWhatsapp.value;

  // Update categories array structure to match actual edited workspace content
  // Since inputs mutate objects in-place directly, currentDraft.content contains the latest state

  // Size measurement
  const textEncoder = new TextEncoder();
  const serialized = JSON.stringify(currentDraft.content);
  const sizeInBytes = textEncoder.encode(serialized).length;

  draftSizeCount.textContent = `${(sizeInBytes / 1024).toFixed(2)} KiB / 256 KiB`;
  draftSizeProgress.value = sizeInBytes;
  draftSizeWarning.hidden = sizeInBytes <= 262144;

  // Counts measurement
  let totalCount = 0;
  let activeCount = 0;

  currentDraft.content.categories.forEach(cat => {
    if (cat.items) {
      cat.items.forEach(item => {
        totalCount++;
        if (item.active !== false) {
          activeCount++;
        }
      });
    }
  });

  // Display active item count
  activeItemsCount.textContent = `${activeCount} / 20`;
  activeItemsProgress.value = activeCount;
  activeItemsWarning.hidden = activeCount <= 20;

  // Display total item count
  totalItemsCount.textContent = `${totalCount} / 100`;
  totalItemsProgress.value = totalCount;
  totalItemsWarning.hidden = totalCount <= 100;

  // Disable save button if technically invalid size or limits exceeded
  const isInvalid = sizeInBytes > 262144;
  saveDraftButton.disabled = isInvalid;

  renderLivePreview();
}

// Render dynamic instant visual storefront mock
function renderLivePreview() {
  liveStorefrontPreview.innerHTML = '';

  const { businessName, whatsapp, categories } = currentDraft.content;

  // Header
  const headerDiv = document.createElement('div');
  headerDiv.className = 'pizza-header';
  
  const logoStrong = document.createElement('strong');
  logoStrong.textContent = businessName || 'Sua Pizzaria';
  
  const spanSubtitle = document.createElement('span');
  spanSubtitle.textContent = 'MODELO CARDÁPIO';
  logoStrong.appendChild(spanSubtitle);

  const contactDiv = document.createElement('div');
  contactDiv.className = 'pizza-contact';
  contactDiv.textContent = whatsapp ? `WhatsApp: +${whatsapp}` : 'WhatsApp não configurado';

  headerDiv.appendChild(logoStrong);
  headerDiv.appendChild(contactDiv);
  liveStorefrontPreview.appendChild(headerDiv);

  // Categories & Items
  if (!categories || categories.length === 0) {
    const emptyMsg = document.createElement('p');
    emptyMsg.className = 'empty-msg pizza-empty-msg';
    emptyMsg.textContent = 'Adicione categorias e produtos para ver a prévia ao vivo do seu cardápio de delivery.';
    liveStorefrontPreview.appendChild(emptyMsg);
    return;
  }

  categories.forEach(cat => {
    // Only show categories that have name or items
    if (!cat.name && (!cat.items || cat.items.length === 0)) return;

    const catSection = document.createElement('section');
    catSection.className = 'pizza-category-sec';

    const catTitle = document.createElement('h4');
    catTitle.textContent = cat.name || 'Categoria sem nome';
    catSection.appendChild(catTitle);

    let hasVisibleItems = false;

    if (cat.items && cat.items.length > 0) {
      cat.items.forEach(item => {
        // In the live preview, we display all items, but highlight/indicate if they are inactive or draft
        const itemRow = document.createElement('div');
        itemRow.className = item.active === false ? 'pizza-item-row is-inactive' : 'pizza-item-row';

        const infoCol = document.createElement('div');
        infoCol.className = 'pizza-item-info';

        const nameStrong = document.createElement('strong');
        nameStrong.textContent = item.name || 'Produto sem nome';
        if (item.active === false) {
          nameStrong.textContent += ' (Oculto)';
        }
        
        const descP = document.createElement('p');
        descP.textContent = item.description || '';

        infoCol.appendChild(nameStrong);
        infoCol.appendChild(descP);

        const priceCol = document.createElement('div');
        priceCol.className = 'pizza-item-price-col';

        const priceSpan = document.createElement('span');
        priceSpan.className = 'pizza-price-text';
        priceSpan.textContent = formatCentsToReais(item.priceCents);

        priceCol.appendChild(priceSpan);

        // Pedir no Whatsapp button
        if (whatsapp && item.active !== false && item.name && item.priceCents > 0) {
          const msg = `Olá! Tenho interesse em ${item.name}. Pode confirmar preço e disponibilidade?`;
          const waLink = document.createElement('a');
          waLink.className = 'pizza-link-btn';
          waLink.href = `https://wa.me/${whatsapp}?text=${encodeURIComponent(msg)}`;
          waLink.target = '_blank';
          waLink.rel = 'noopener noreferrer';
          waLink.textContent = 'Pedir';
          priceCol.appendChild(waLink);
        }

        itemRow.appendChild(infoCol);
        itemRow.appendChild(priceCol);
        catSection.appendChild(itemRow);
        hasVisibleItems = true;
      });
    }

    if (!hasVisibleItems) {
      const noItems = document.createElement('p');
      noItems.className = 'pizza-no-items';
      noItems.textContent = 'Nenhum item nesta categoria.';
      catSection.appendChild(noItems);
    }

    liveStorefrontPreview.appendChild(catSection);
  });
}

// Validate catalog draft payload locally before saving
function validateCatalogLocal() {
  const { whatsapp, categories } = currentDraft.content;

  if (!whatsapp) {
    showFeedback('Digite o número de WhatsApp comercial.', 'error');
    return false;
  }

  if (!/^[1-9]\d{7,14}$/.test(whatsapp)) {
    showFeedback('Número de WhatsApp comercial inválido. Exemplo: 5511999999999', 'error');
    return false;
  }

  let totalCount = 0;
  let activeCount = 0;
  let hasValidationErrors = false;

  categories.forEach((cat, catIndex) => {
    if (!cat.name || !cat.name.trim()) {
      showFeedback(`Preencha o nome da categoria na posição ${catIndex + 1}.`, 'error');
      hasValidationErrors = true;
    }

    if (cat.items) {
      cat.items.forEach((item, itemIndex) => {
        totalCount++;
        if (item.active !== false) {
          activeCount++;
        }

        if (!item.name || !item.name.trim()) {
          showFeedback(`O item na categoria "${cat.name}" e posição ${itemIndex + 1} precisa ter um nome.`, 'error');
          hasValidationErrors = true;
        }

        if (!Number.isSafeInteger(item.priceCents) || item.priceCents <= 0) {
          showFeedback(`O preço do item "${item.name || `Item ${itemIndex + 1}`}" precisa ser um valor maior que R$ 0,00.`, 'error');
          hasValidationErrors = true;
        }
      });
    }
  });

  if (hasValidationErrors) return false;

  // Plan rules
  if (activeCount > 20) {
    showFeedback('O plano básico gratuito permite no máximo 20 itens ativos. Oculte alguns itens antes de salvar.', 'error');
    return false;
  }

  if (totalCount > 100) {
    showFeedback('O limite técnico total é de 100 itens (ativos e ocultos). Remova alguns itens antes de salvar.', 'error');
    return false;
  }

  return true;
}

// Handle save draft
async function handleSaveDraft() {
  if (!validateCatalogLocal()) return;

  if (currentIsOnline) {
    try {
      const res = await fetch(`/api/sites/${currentSite.id}/draft`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          revision: currentDraft.revision,
          content: currentDraft.content
        })
      });

      if (res.ok) {
        const data = await res.json();
        currentDraft = data.draft;
        editorRevisionIndicator.textContent = `Revisão: ${currentDraft.revision}`;
        showFeedback('Rascunho salvo com sucesso!', 'success');
        conflictBanner.hidden = true;
      } else if (res.status === 409) {
        const data = await res.json();
        conflictBanner.hidden = false;
        showFeedback('Conflito de revisão detectado. Salve suas alterações locais ou recarregue.', 'error');
        if (data.error && data.error.currentRevision) {
          editorRevisionIndicator.textContent = `Revisão (Conflito): ${currentDraft.revision} (Atual no Servidor: ${data.error.currentRevision})`;
        }
      } else {
        const data = await res.json();
        showFeedback(data.error?.message || 'Erro ao salvar rascunho.', 'error');
      }
    } catch (err) {
      showFeedback('Erro de rede ao salvar rascunho.', 'error');
    }
  } else {
    // Offline / Local save
    currentDraft.revision += 1;
    currentDraft.updatedAt = new Date().toISOString();
    localStorage.setItem(`vitrine_local_draft_${currentSite.id}`, JSON.stringify(currentDraft));
    editorRevisionIndicator.textContent = `Revisão: ${currentDraft.revision}`;
    showFeedback('Rascunho local salvo com sucesso (revisão incrementada)!', 'success');
    conflictBanner.hidden = true;
  }
  updateDraftAndPreview();
}

// Handle publish storefront
async function handlePublishSite() {
  if (!validateCatalogLocal()) return;

  if (currentIsOnline) {
    try {
      const saveRes = await fetch(`/api/sites/${currentSite.id}/draft`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          revision: currentDraft.revision,
          content: currentDraft.content
        })
      });

      if (saveRes.ok) {
        const savedData = await saveRes.json();
        currentDraft = savedData.draft;
        editorRevisionIndicator.textContent = `Revisão: ${currentDraft.revision}`;
      } else if (saveRes.status === 409) {
        conflictBanner.hidden = false;
        showFeedback('Conflito de revisão detectado antes de publicar. Recarregue o rascunho.', 'error');
        return;
      } else {
        const errData = await saveRes.json().catch(() => ({}));
        showFeedback(errData.error?.message || 'Erro ao salvar rascunho antes de publicar.', 'error');
        return;
      }

      const pubRes = await fetch(`/api/sites/${currentSite.id}/publish`, {
        method: 'POST'
      });

      if (pubRes.ok) {
        const pubData = await pubRes.json();
        const pub = pubData.publication;
        if (publicationStatusBar && publicationStatusText && publicationViewLink) {
          const shortHash = String(pub.hash || '').slice(0, 12);
          publicationStatusText.textContent = `Revisão ${pub.revision} publicada em ${pub.url} (SHA-256: ${shortHash}…)`;
          publicationViewLink.href = pub.url;
          publicationStatusBar.hidden = false;
        }
        showFeedback(`Vitrine publicada com sucesso em ${pub.url}!`, 'success');
      } else {
        const errData = await pubRes.json().catch(() => ({}));
        showFeedback(
          errData.error?.message || 'Falha ao publicar vitrine. A publicação anterior foi preservada.',
          'error'
        );
      }
    } catch {
      showFeedback('Erro de rede ao publicar vitrine.', 'error');
    }
  } else {
    let activeCount = 0;
    (currentDraft.content.categories || []).forEach((cat) => {
      (cat.items || []).forEach((item) => {
        if (item.active !== false) activeCount += 1;
      });
    });

    if (activeCount === 0) {
      showFeedback('O rascunho precisa ter ao menos 1 item ativo para ser publicado.', 'error');
      return;
    }

    if (publicationStatusBar && publicationStatusText && publicationViewLink) {
      publicationStatusText.textContent = `Prévia publicada no modo local (revisão ${currentDraft.revision}). Exemplo estático disponível em /loja1.`;
      publicationViewLink.href = '/loja1';
      publicationStatusBar.hidden = false;
    }
    showFeedback('Publicação validada com sucesso no modo local!', 'success');
  }
}
