/**
 * Arquivo principal do Construktor
 * Coordena a inicialização dos módulos e a interação entre eles
 */

import { firebaseConfig, availableEntityIcons, fieldTypes, defaultFieldConfigs } from './config.js';
import { initAutenticacao, isUsuarioLogado, getUsuarioId } from './autenticacao.js';
import { 
    initDatabase, loadAllEntities, loadAndRenderModules, loadDroppedEntitiesIntoModules, 
    loadStructureForEntity, createEntity, createModule, saveEntityToModule, deleteEntityFromModule,
    deleteEntity, deleteModule, saveEntityStructure, saveSubEntityStructure, saveModulesOrder 
} from './database.js';
import { 
    initUI, createIcons, checkEmptyStates, showLoading, hideLoading, showSuccess, 
    showError, showConfirmDialog, showInputDialog 
} from './ui.js';
import { initUserProfile } from './user/userProfile.js';
import { initInvitations, checkPendingInvitations } from './user/invitations.js';
import { initWorkspaces, getCurrentWorkspace } from './workspaces.js';

// Variáveis globais
let db;
let modalNavigationStack = [];

// ==== PONTO DE ENTRADA DA APLICAÇÃO ====
async function initApp() {
    showLoading('Inicializando aplicação...');
    
    try {
        // Inicializa o Firebase
        firebase.initializeApp(firebaseConfig);
        
        // Inicializa os módulos
        await initAutenticacao();
        
        // Verifica se o usuário está autenticado
        if (!isUsuarioLogado()) {
            hideLoading();
            window.location.href = './pages/login.html'; // Redirect if not logged in
            return;
        }
        
        // Inicializa o banco de dados
        await initDatabase(firebase);
        db = firebase.database();
        
        // Inicializa a interface do usuário
        initUI();
        
        // Inicializa o sistema de gerenciamento de usuário
        initUserProfile(db);
        
        // Inicializa o sistema de convites
        initInvitations(db);
        
        // Inicializa o sistema de áreas de trabalho
        await initWorkspaces(db);
        
        // Verifica se há convites pendentes
        try {
            const pendingInvites = await checkPendingInvitations();
            if (pendingInvites > 0) {
                setTimeout(() => {
                    showSuccess('Convites Pendentes', `Você tem ${pendingInvites} convite(s) pendente(s). Acesse o menu do usuário para visualizá-los.`);
                }, 2000);
            }
        } catch (error) {
            console.error('Erro ao verificar convites pendentes:', error);
        }
        
        // Aguarda a inicialização das áreas de trabalho antes de carregar dados
        await new Promise(resolve => {
            const checkWorkspace = () => {
                const currentWorkspace = getCurrentWorkspace();
                if (currentWorkspace) {
                    resolve();
                } else {
                    setTimeout(checkWorkspace, 100);
                }
            };
            checkWorkspace();
        });
        
        // Configura listener para mudança de área de trabalho
        window.addEventListener('workspaceChanged', async (event) => {
            await loadWorkspaceData(event.detail.workspace);
        });
        
        // Carrega dados da área de trabalho atual
        const currentWorkspace = getCurrentWorkspace();
        if (currentWorkspace) {
            await loadWorkspaceData(currentWorkspace);
        }
        
        // Configura os event listeners
        setupEventListeners();
        
        // Configura o painel de propriedades dos campos
        setupFieldPropertiesPanelEvents();
        
        // Verifica os estados vazios
        checkEmptyStates();
        
        // Torna a função disponível globalmente para uso em outros módulos
        window.getCurrentWorkspace = getCurrentWorkspace;
        
        hideLoading();
        document.getElementById('loading-overlay').style.display = 'none';
        document.getElementById('app').style.display = 'flex';
    } catch (error) {
        console.error("Erro ao inicializar aplicação:", error);
        document.getElementById('loading-overlay').innerHTML = '<div class="text-center p-4 sm:p-5 bg-white rounded-lg shadow-md max-w-xs sm:max-w-sm"><div class="text-red-600 text-xl sm:text-2xl mb-3"><i data-lucide="alert-triangle"></i></div><p class="text-base sm:text-lg font-semibold text-red-700">Erro ao iniciar o sistema.</p><p class="text-slate-600 mt-2 text-sm sm:text-base">Verifique sua conexão com a internet e tente novamente.</p></div>';
        createIcons();
    }
}

/**
 * Carrega dados de uma área de trabalho específica
 * @param {Object} workspace - Área de trabalho a ser carregada
 */
async function loadWorkspaceData(workspace) {
    if (!workspace) return;
    showLoading('Carregando área de trabalho...');

    try {
        const entityList = document.getElementById('entity-list');
        const moduleContainer = document.getElementById('module-container');
        
        if (entityList) entityList.innerHTML = '';
        if (moduleContainer) moduleContainer.innerHTML = '';
        
        const workspaceId = workspace.id;
        const ownerId = workspace.isOwner ? null : workspace.ownerId;

        const entities = await loadAllEntities(workspaceId, ownerId);
        
        if (entityList) {
            entities.forEach(entity => renderEntityInLibrary(entity));
        }
        
        populateFieldsToolbox();
        
        await loadAndRenderModules(renderModule, workspaceId, ownerId);
        await loadDroppedEntitiesIntoModules(renderDroppedEntity, workspaceId, ownerId);
        
        checkEmptyStates();
        
        if (window.lucide) {
            setTimeout(() => lucide.createIcons(), 200);
        }
    } catch (error) {
        hideLoading();
        console.error('[loadWorkspaceData] Erro crítico ao carregar a área de trabalho:', error);
        showError('Erro de Carregamento', 'Ocorreu um erro ao carregar a área de trabalho. Verifique a consola para mais detalhes.');
    } finally {
        hideLoading();
    }
}

document.addEventListener('DOMContentLoaded', initApp);

// ---- Funções de Renderização ----
function renderEntityInLibrary(entity) {
    const existingCard = document.querySelector(`.entity-card[data-entity-id="${entity.id}"]`);
    if (existingCard) {
        return;
    }
    
    const list = document.getElementById('entity-list');
    if (!list) {
        return;
    }
    
    const template = document.getElementById('entity-card-template');
    if (!template) {
        return;
    }
    
    const clone = template.content.cloneNode(true);
    const card = clone.querySelector('.entity-card');
    card.dataset.entityId = entity.id;
    card.dataset.entityName = entity.name;
    card.dataset.entityIcon = entity.icon || 'box'; 
    
    const iconEl = clone.querySelector('.entity-icon');
    iconEl.setAttribute('data-lucide', entity.icon || 'box'); 

    clone.querySelector('.entity-name').textContent = entity.name;
    
    if (entity.id.startsWith('-')) {
        clone.querySelector('.delete-custom-entity-btn').classList.remove('hidden');
    }
    
    list.appendChild(clone);
    
    if (window.lucide) {
        lucide.createIcons();
    }
    
    if (list && !list._sortable) {
        list._sortable = new Sortable(list, { 
            group: { name: 'entities', pull: 'clone', put: false }, 
            sort: false, 
            animation: 150,
            ghostClass: 'sortable-ghost',
            chosenClass: 'sortable-chosen',
            dragClass: 'sortable-drag',
            delay: 50,
            delayOnTouchOnly: true,
        });
    }
}

function renderModule(moduleData) {
    const container = document.getElementById('module-container');
    const template = document.getElementById('module-template');
    const clone = template.content.cloneNode(true);
    const moduleEl = clone.querySelector('.module-quadro');
    
    moduleEl.dataset.moduleId = moduleData.id;
    clone.querySelector('.module-title').textContent = moduleData.name;
    
    container.appendChild(clone);
    const newModuleEl = container.querySelector(`[data-module-id="${moduleData.id}"]`);
    setupDragAndDropForModule(newModuleEl);
    createIcons();
    
    newModuleEl.classList.add('animate-pulse');
    setTimeout(() => newModuleEl.classList.remove('animate-pulse'), 2000);
    
    return newModuleEl;
}

function renderDroppedEntity(moduleId, entityId, entityData, entityInfo) {
    const moduleEl = document.querySelector(`.module-quadro[data-module-id="${moduleId}"]`);
    if (!moduleEl) return;
    
    const dropzone = moduleEl.querySelector('.entities-dropzone');
    const template = document.getElementById('dropped-entity-card-template');
    const clone = template.content.cloneNode(true);
    const card = clone.querySelector('.dropped-entity-card');
    card.dataset.entityId = entityId;
    card.dataset.entityName = entityData.entityName;
    card.dataset.moduleId = moduleId;
    
    const iconEl = clone.querySelector('.entity-icon');
    if (entityInfo) {
       iconEl.setAttribute('data-lucide', entityInfo.icon || 'box');
    } else {
       iconEl.style.display = 'none';
    }

    clone.querySelector('.entity-name').textContent = entityData.entityName;
    card.classList.remove('animate-pulse');
    dropzone.appendChild(clone);
    
    if (window.lucide) {
        lucide.createIcons();
    }
}

function populateFieldsToolbox() {
    const toolbox = document.getElementById('fields-toolbox');
    if (!toolbox) return;
    
    toolbox.innerHTML = '';
    fieldTypes.forEach(field => {
        const clone = document.getElementById('toolbox-field-template').content.cloneNode(true);
        const item = clone.querySelector('.toolbox-item');
        item.dataset.fieldType = field.type;
        const iconEl = clone.querySelector('.field-icon');
        iconEl.setAttribute('data-lucide', field.icon);
        clone.querySelector('.field-name').textContent = field.name;
        toolbox.appendChild(clone);
    });
    createIcons();
    
    if (toolbox && !toolbox._sortable) {
        toolbox._sortable = new Sortable(toolbox, { 
            group: { name: 'fields', pull: 'clone', put: false }, 
            sort: false, 
            animation: 150,
            ghostClass: 'sortable-ghost',
            chosenClass: 'sortable-chosen',
            dragClass: 'sortable-drag',
            delay: 50,
            delayOnTouchOnly: true,
        });
    }
}

function renderFormField(fieldData) {
    const dropzone = document.getElementById('form-builder-dropzone');
    if (!dropzone) return;
    
    const template = document.getElementById('form-field-template');
    const clone = template.content.cloneNode(true);
    const card = clone.querySelector('.form-field-card');
    
    const domId = `field-card-${fieldData.id}`;
    card.id = domId;
    
    card.dataset.fieldId = fieldData.id;
    card.dataset.fieldData = JSON.stringify(fieldData);
    const fieldInfo = fieldTypes.find(f => f.type === fieldData.type);
    
    const iconEl = clone.querySelector('.field-icon');
    iconEl.setAttribute('data-lucide', fieldInfo.icon);
    
    clone.querySelector('.field-label').textContent = fieldData.label;
    
    if (fieldData.type === 'sub-entity') {
        clone.querySelector('.field-type').textContent = fieldData.subType === 'independent' ?  
            `Sub-Entidade` : 
            `Relação → ${fieldData.targetEntityName}`;
        clone.querySelector('.edit-sub-entity-btn').classList.remove('hidden');
        clone.querySelector('.edit-field-btn').style.display = 'none';
    } else {
        clone.querySelector('.field-type').textContent = fieldInfo.name;
        
        if (fieldData.config && Object.keys(fieldData.config).length > 0) {
            const label = clone.querySelector('.field-label');
            if (!fieldData.config.required) {
                label.textContent += ' (Configurado)';
            } else {
                label.textContent += ' *';
            }
        }
    }
    
    dropzone.appendChild(clone);
    
    const newField = dropzone.lastElementChild;
    newField.classList.add('animate-pulse');
    setTimeout(() => newField.classList.remove('animate-pulse'), 2000);
    
    createIcons();
    
    const emptyFormState = document.getElementById('empty-form-state');
    if (emptyFormState) {
        if (dropzone.children.length > 0) {
            emptyFormState.classList.add('hidden');
        } else {
            emptyFormState.classList.remove('hidden');
        }
    }
    
    return newField;
}

function updateModalBreadcrumb() {
    const breadcrumbContainer = document.getElementById('modal-breadcrumb');
    const backBtn = document.getElementById('modal-back-btn');
    if (!breadcrumbContainer || !backBtn) return;
    
    breadcrumbContainer.innerHTML = '';
    
    if (modalNavigationStack.length === 0) {
        backBtn.classList.add('hidden');
        const context = JSON.parse(document.getElementById('entity-builder-modal').dataset.context);
        const titleSpan = document.createElement('span');
        titleSpan.className = 'font-bold text-indigo-800';
        titleSpan.innerHTML = `<i data-lucide="file-edit" class="inline h-4 w-4 sm:h-5 sm:w-5 mr-1 text-indigo-600"></i> <span class="text-slate-800">${context.entityName}</span>`;
        breadcrumbContainer.appendChild(titleSpan);
    } else {
        backBtn.classList.remove('hidden');
        const currentContext = JSON.parse(document.getElementById('entity-builder-modal').dataset.context);
        const currentTitleSpan = document.createElement('span');
        currentTitleSpan.className = 'font-semibold text-indigo-800 truncate';
        currentTitleSpan.textContent = currentContext.label || currentContext.entityName;
        breadcrumbContainer.appendChild(currentTitleSpan);
    }
    
    createIcons();
}

// ---- Funções de Interação ----
function setupDragAndDropForModule(moduleElement) {
    const dropzone = moduleElement.querySelector('.entities-dropzone');
    if (!dropzone || dropzone._sortable) return;
    
    dropzone._sortable = new Sortable(dropzone, { 
        group: 'entities', 
        animation: 150, 
        onAdd: handleEntityDrop,
        ghostClass: 'sortable-ghost',
        chosenClass: 'sortable-chosen',
        dragClass: 'sortable-drag',
        delay: 50,
        delayOnTouchOnly: true,
    });
}

function setupEventListeners() {
    const moduleContainer = document.getElementById('module-container');
    if (moduleContainer && !moduleContainer._sortable) {
        moduleContainer._sortable = new Sortable(moduleContainer, {
            animation: 150,
            handle: '.module-quadro',
            ghostClass: 'sortable-ghost',
            chosenClass: 'sortable-chosen',
            dragClass: 'sortable-drag',
            delay: 150,
            delayOnTouchOnly: true,
            onEnd: async function(evt) {
                const currentWorkspace = getCurrentWorkspace();
                if (!currentWorkspace) return;
                const ownerId = currentWorkspace.isOwner ? null : currentWorkspace.ownerId;
                const newOrder = Array.from(evt.to.children).map(el => el.dataset.moduleId);
                await saveModulesOrder(newOrder, currentWorkspace.id, ownerId);
            }
        });
    }

    document.body.addEventListener('click', e => {
        const configureBtn = e.target.closest('.configure-btn');
        if (configureBtn) {
            const card = configureBtn.closest('.dropped-entity-card');
            openModal({ moduleId: card.dataset.moduleId, entityId: card.dataset.entityId, entityName: card.dataset.entityName });
            return;
        }
        
        const deleteEntityBtn = e.target.closest('.delete-entity-btn');
        if (deleteEntityBtn) { 
            confirmAndRemoveEntityFromModule(deleteEntityBtn.closest('.dropped-entity-card')); 
            return; 
        }
        
        const deleteCustomEntityBtn = e.target.closest('.delete-custom-entity-btn');
        if (deleteCustomEntityBtn) { 
            confirmAndRemoveCustomEntity(deleteCustomEntityBtn.closest('.entity-card')); 
            return; 
        }
        
        const deleteModuleBtn = e.target.closest('.delete-module-btn');
        if (deleteModuleBtn) { 
            confirmAndRemoveModule(deleteModuleBtn.closest('.module-quadro')); 
            return; 
        }
        
        const editSubEntityBtn = e.target.closest('.edit-sub-entity-btn');
        if (editSubEntityBtn) { 
            handleEditSubEntity(editSubEntityBtn); 
            return; 
        }
    });
    
    document.getElementById('add-new-entity-btn')?.addEventListener('click', handleAddNewEntity);
    document.getElementById('add-new-module-btn')?.addEventListener('click', handleAddNewModule);
    document.getElementById('close-modal-btn')?.addEventListener('click', closeModal);
    document.getElementById('save-structure-btn')?.addEventListener('click', saveCurrentStructure);
    document.getElementById('modal-back-btn')?.addEventListener('click', handleModalBack);
    document.getElementById('empty-add-module-btn')?.addEventListener('click', handleAddNewModule);
    document.getElementById('mobile-add-module-btn')?.addEventListener('click', handleAddNewModule);

    const formBuilderDropzone = document.getElementById('form-builder-dropzone');
    if (formBuilderDropzone && !formBuilderDropzone._sortable) {
        formBuilderDropzone._sortable = new Sortable(formBuilderDropzone, { 
            group: 'fields', 
            animation: 150, 
            onAdd: handleFieldDrop, 
            handle: '[data-lucide="grip-vertical"]',
            ghostClass: 'sortable-ghost',
            chosenClass: 'sortable-chosen',
            dragClass: 'sortable-drag',
            delay: 50,
            delayOnTouchOnly: true,
        });
        
        formBuilderDropzone.addEventListener('click', e => {
             const deleteBtn = e.target.closest('.delete-field-btn');
             if (deleteBtn) {
                 showConfirmDialog('Tem certeza?', "Não poderá reverter esta ação!", 'Sim, eliminar!', 'Cancelar', 'warning')
                 .then(confirmed => { 
                     if (confirmed) { 
                         const fieldCard = deleteBtn.closest('.form-field-card');
                         const fieldName = fieldCard.querySelector('.field-label').textContent;
                         fieldCard.remove();
                         showSuccess('Eliminado!', `O campo "${fieldName}" foi removido.`);
                         
                         const dropzone = document.getElementById('form-builder-dropzone');
                         const emptyFormState = document.getElementById('empty-form-state');
                         if (dropzone.children.length === 0 && emptyFormState) {
                             emptyFormState.classList.remove('hidden');
                         }
                     } 
                 });
             }
             
             const editBtn = e.target.closest('.edit-field-btn');
             if (editBtn) {
                 const fieldCard = editBtn.closest('.form-field-card');
                 const fieldData = JSON.parse(fieldCard.dataset.fieldData);
                 openFieldPropertiesPanel(fieldData, fieldCard);
             }
        });
    }
    
    window.addEventListener('resize', () => {
        const entityBuilderModal = document.getElementById('entity-builder-modal');
        if (entityBuilderModal && !entityBuilderModal.classList.contains('hidden')) {
            updateModalBreadcrumb();
        }
    });
}

async function handleEntityDrop(event) {
    const { item, to } = event;
    const { entityId, entityName, entityIcon } = item.dataset;
    const moduleEl = to.closest('.module-quadro');
    const moduleId = moduleEl.dataset.moduleId;

    if (moduleEl.querySelector(`.dropped-entity-card[data-entity-id="${entityId}"]`)) {
        item.remove();
        showError('Entidade já existe!', `A entidade "${entityName}" já está presente neste módulo.`);
        return;
    }
    
    item.remove();
    
    const currentWorkspace = getCurrentWorkspace();
    if (!currentWorkspace) return;
    const ownerId = currentWorkspace.isOwner ? null : currentWorkspace.ownerId;

    try {
        await saveEntityToModule(moduleId, entityId, entityName, currentWorkspace.id, ownerId);
        showSuccess('Entidade adicionada!', 'Clique em configurar para definir seus campos.');
        const entities = await loadAllEntities(currentWorkspace.id, ownerId);
        const entityInfo = entities.find(e => e.id === entityId);
        renderDroppedEntity(moduleId, entityId, { entityName }, entityInfo);
    } catch (error) {
        showError('Permissão Negada', 'Não foi possível adicionar a entidade a este módulo.');
    }
}

async function handleFieldDrop(event) {
    const { item } = event;
    const fieldType = item.dataset.fieldType;
    item.remove();

    const currentWorkspace = getCurrentWorkspace();
    if (!currentWorkspace) return;
    const ownerId = currentWorkspace.isOwner ? null : currentWorkspace.ownerId;

    if (fieldType === 'sub-entity') {
        const choice = await showConfirmDialog(
            'Como deseja criar esta tabela?',
            'Pode criar uma sub-entidade nova ou ligar a uma que já existe.',
            'Criar Nova',
            'Ligar a Existente',
            'info'
        );

        if (choice === true) {
            const result = await showInputDialog('Nome da Nova Sub-Entidade', 'Nome', 'Ex: Endereços, Contactos');
            if (result.confirmed && result.value) {
                const fieldData = { 
                    id: `field_${Date.now()}`, 
                    type: 'sub-entity', 
                    label: result.value, 
                    subType: 'independent', 
                    subSchema: { attributes: [] } 
                };
                renderFormField(fieldData);
            }
        } else if (choice === false) {
            const currentEntityId = JSON.parse(document.getElementById('entity-builder-modal').dataset.context).entityId;
            const allEntities = await loadAllEntities(currentWorkspace.id, ownerId);
            const availableEntities = allEntities.filter(e => e.id !== currentEntityId);
            
            if (availableEntities.length === 0) {
                showError('Aviso', 'Não existem outras entidades para criar uma ligação.');
                return;
            }
            
            const entityOptions = availableEntities.map(e => `<option value="${e.id}|${e.name}">${e.name}</option>`).join('');
            
            const htmlContent = `
                <div class="mb-4">
                    <label for="swal-input-label" class="block text-sm font-medium text-slate-700 mb-1 text-left">Nome do Campo</label>
                    <input id="swal-input-label" class="w-full px-3 py-2 border border-slate-300 rounded-lg shadow-sm" placeholder="Ex: Cliente Associado">
                </div>
                <div>
                    <label for="swal-input-target-entity" class="block text-sm font-medium text-slate-700 mb-1 text-left">Ligar a qual entidade?</label>
                    <select id="swal-input-target-entity" class="w-full px-3 py-2 border border-slate-300 rounded-lg shadow-sm">${entityOptions}</select>
                </div>
            `;
            
            const { value: formValues, isConfirmed } = await Swal.fire({
                title: 'Ligar a uma Entidade Existente',
                html: htmlContent,
                showCancelButton: true,
                focusConfirm: false,
                preConfirm: () => {
                    const label = document.getElementById('swal-input-label').value;
                    const selectElement = document.getElementById('swal-input-target-entity');
                    const [targetEntityId, targetEntityName] = selectElement.value.split('|');
                    if (!label) { 
                        Swal.showValidationMessage('O nome do campo é obrigatório.'); 
                        return false; 
                    }
                    return { label, targetEntityId, targetEntityName };
                }
            });
            
            if(isConfirmed && formValues) {
                const fieldData = { 
                    id: `field_${Date.now()}`, 
                    type: 'sub-entity', 
                    ...formValues, 
                    subType: 'relationship' 
                };
                renderFormField(fieldData);
            }
        }
    } else {
        const result = await showInputDialog('Adicionar Campo', 'Nome do Campo', 'Ex: Nome Fantasia');
        if (result.confirmed && result.value) {
            const fieldData = { 
                id: `field_${Date.now()}`, 
                type: fieldType, 
                label: result.value,
                config: { ...defaultFieldConfigs[fieldType] }
            };
            renderFormField(fieldData);
            showSuccess('Campo adicionado!', '');
        }
    }
}

async function handleAddNewEntity() {
    const currentWorkspace = getCurrentWorkspace();
    if (!currentWorkspace) {
        showError('Erro', 'Nenhuma área de trabalho selecionada.');
        return;
    }
    
    const ownerId = currentWorkspace.isOwner ? null : currentWorkspace.ownerId;
    
    const iconHtml = availableEntityIcons.map(icon => 
        `<button class="icon-picker-btn p-2 rounded-md hover:bg-indigo-100 transition-all" data-icon="${icon}">
            <div class="h-6 w-6 sm:h-8 sm:w-8 rounded-md bg-indigo-50 flex items-center justify-center text-indigo-600">
                <i data-lucide="${icon}"></i>
            </div>
         </button>`
    ).join('');
    
    if (typeof Swal !== 'undefined') {
        const { value: formValues, isConfirmed } = await Swal.fire({
            title: 'Criar Nova Entidade',
            html: `
                <div class="mb-4">
                    <label for="swal-input-name" class="block text-sm font-medium text-slate-700 mb-1 text-left">Nome da Entidade</label>
                    <input id="swal-input-name" class="swal2-input w-full px-3 py-2 border border-slate-300 rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500" placeholder="Ex: Fornecedor, Produto, Funcionário...">
                </div>
                <div>
                    <p class="text-sm font-medium text-slate-700 mb-2 text-left">Escolha um ícone:</p>
                    <div class="grid grid-cols-4 sm:grid-cols-6 gap-2">${iconHtml}</div>
                </div>
            `,
            showCancelButton: true,
            confirmButtonText: 'Criar Entidade',
            cancelButtonText: 'Cancelar',
            focusConfirm: false,
            customClass: {
                popup: 'shadow-xl rounded-xl'
            },
            didOpen: () => {
                createIcons();
                document.querySelector('#swal2-html-container').addEventListener('click', e => {
                    const button = e.target.closest('.icon-picker-btn');
                    if (button) {
                        document.querySelectorAll('.icon-picker-btn').forEach(btn => btn.classList.remove('bg-indigo-200'));
                        button.classList.add('bg-indigo-200');
                    }
                });
            },
            preConfirm: () => {
                const name = document.getElementById('swal-input-name').value;
                const selectedIconEl = document.querySelector('.icon-picker-btn.bg-indigo-200');
                if (!name) { 
                    Swal.showValidationMessage('O nome da entidade é obrigatório.'); 
                    return false; 
                }
                if (!selectedIconEl) { 
                    Swal.showValidationMessage('Por favor, escolha um ícone.'); 
                    return false; 
                }
                return { name, icon: selectedIconEl.dataset.icon };
            }
        });
        
        if (isConfirmed && formValues) {
            showLoading('Criando entidade...');
            try {
                await createEntity({ 
                    name: formValues.name, 
                    icon: formValues.icon 
                }, currentWorkspace.id, ownerId);
                
                const updatedEntities = await loadAllEntities(currentWorkspace.id, ownerId);
                document.getElementById('entity-list').innerHTML = '';
                updatedEntities.forEach(renderEntityInLibrary);
                
                hideLoading();
                showSuccess('Entidade Criada!', `A entidade "${formValues.name}" está pronta para ser usada.`);
            } catch (error) {
                hideLoading();
                showError('Erro', 'Ocorreu um erro ao criar a entidade. Verifique suas permissões.');
            }
        }
    }
}

async function handleAddNewModule() {
    const currentWorkspace = getCurrentWorkspace();
    if (!currentWorkspace) {
        showError('Erro', 'Nenhuma área de trabalho selecionada.');
        return;
    }
    
    const ownerId = currentWorkspace.isOwner ? null : currentWorkspace.ownerId;
    
    const result = await showInputDialog(
        'Criar Novo Módulo',
        'Nome do Módulo',
        'Ex: Vendas, Recursos Humanos, Financeiro...'
    );
    
    if (result.confirmed && result.value) {
        showLoading('Criando módulo...');
        try {
            const moduleId = await createModule(result.value, currentWorkspace.id, ownerId);
            renderModule({ id: moduleId, name: result.value });
            checkEmptyStates();
            
            hideLoading();
            showSuccess('Módulo Criado!', `O módulo "${result.value}" foi criado com sucesso.`);
            
            if (document.querySelectorAll('.module-quadro').length === 1) {
                setTimeout(() => {
                    showSuccess('Dica', 'Agora arraste entidades da biblioteca para o seu novo módulo.');
                }, 1000);
            }
        } catch (error) {
            hideLoading();
            showError('Erro', 'Ocorreu um erro ao criar o módulo. Verifique suas permissões.');
        }
    }
}

function handleEditSubEntity(button) {
    const card = button.closest('.form-field-card');
    const fieldData = JSON.parse(card.dataset.fieldData);
    
    if (fieldData.subType === 'independent') {
        const parentContext = JSON.parse(document.getElementById('entity-builder-modal').dataset.context);
        modalNavigationStack.push(parentContext);
        
        openModal({
            isSubEntity: true,
            label: fieldData.label,
            parentFieldId: fieldData.id,
            subSchema: fieldData.subSchema,
        });
    } else if (fieldData.subType === 'relationship') {
        // This part of logic depends on a `getEntities` function which was not in the original code.
        // For now, it will likely fail silently or throw an error if not implemented elsewhere.
        // To prevent a crash, we add a check.
        if (typeof getEntities === 'function') {
            const allEntities = getEntities();
            const targetEntity = allEntities.find(e => e.id === fieldData.targetEntityId);
            if (!targetEntity) {
                showError('Erro', 'A entidade relacionada já não existe.');
                return;
            }
            const parentContext = JSON.parse(document.getElementById('entity-builder-modal').dataset.context);
            modalNavigationStack.push(parentContext);
            openModal({
                moduleId: 'system',
                entityId: targetEntity.id,
                entityName: targetEntity.name,
            });
        } else {
            showError('Funcionalidade indisponível', 'A navegação para entidades relacionadas não está implementada.');
        }
    }
}

function handleModalBack() {
    if (modalNavigationStack.length > 0) {
        const parentContext = modalNavigationStack.pop();
        openModal(parentContext);
    }
}

async function confirmAndRemoveEntityFromModule(card) {
    const { entityName, moduleId, entityId } = card.dataset;
    
    const confirmed = await showConfirmDialog(
        `Remover '${entityName}'?`,
        'Tem a certeza que deseja remover esta entidade do módulo?',
        'Sim, remover!',
        'Cancelar',
        'warning'
    );
    
    if (confirmed) { 
        const currentWorkspace = getCurrentWorkspace();
        if (!currentWorkspace) return;
        const ownerId = currentWorkspace.isOwner ? null : currentWorkspace.ownerId;
        try {
            await deleteEntityFromModule(moduleId, entityId, currentWorkspace.id, ownerId);
            card.remove();
            showSuccess('Removido!', `A entidade "${entityName}" foi removida do módulo.`);
        } catch (error) {
            showError('Erro', 'Ocorreu um erro ao remover a entidade. Verifique suas permissões.');
        }
    }
}

async function confirmAndRemoveCustomEntity(card) {
    const { entityId, entityName } = card.dataset;
    
    const confirmed = await showConfirmDialog(
        'Eliminar Entidade?',
        `Isto irá remover <strong>${entityName}</strong> da biblioteca e de <strong>todos os módulos</strong>.<br><br><span class="font-bold text-red-600">Esta ação é PERMANENTE.</span>`,
        'Sim, eliminar!',
        'Cancelar',
        'danger'
    );
    
    if (confirmed) {
        showLoading('Eliminando entidade...');
        const currentWorkspace = getCurrentWorkspace();
        if (!currentWorkspace) return;
        const ownerId = currentWorkspace.isOwner ? null : currentWorkspace.ownerId;
        try {
            await deleteEntity(entityId, currentWorkspace.id, ownerId);
            document.querySelectorAll(`.dropped-entity-card[data-entity-id="${entityId}"]`).forEach(c => c.remove());
            card.remove();
            hideLoading();
            showSuccess('Eliminado!', `A entidade "${entityName}" foi eliminada permanentemente.`);
        } catch (error) {
            hideLoading();
            showError('Erro', 'Ocorreu um erro ao eliminar a entidade. Verifique suas permissões.');
        }
    }
}

async function confirmAndRemoveModule(moduleEl) {
    const moduleId = moduleEl.dataset.moduleId;
    const moduleName = moduleEl.querySelector('.module-title').textContent;
    
    const confirmed = await showConfirmDialog(
        'Eliminar Módulo?',
        `Isto irá remover <strong>${moduleName}</strong> e <strong>TODAS as entidades</strong> dentro dele.<br><br><span class="font-bold text-red-600">Esta ação é PERMANENTE.</span>`,
        'Sim, eliminar!',
        'Cancelar',
        'danger'
    );
    
    if (confirmed) {
        showLoading('Eliminando módulo...');
        const currentWorkspace = getCurrentWorkspace();
        if (!currentWorkspace) return;
        const ownerId = currentWorkspace.isOwner ? null : currentWorkspace.ownerId;
        try {
            await deleteModule(moduleId, currentWorkspace.id, ownerId);
            moduleEl.remove();
            checkEmptyStates();
            hideLoading();
            showSuccess('Eliminado!', `O módulo "${moduleName}" foi eliminado permanentemente.`);
        } catch (error) {
            hideLoading();
            showError('Erro', 'Ocorreu um erro ao eliminar o módulo. Verifique suas permissões.');
        }
    }
}

async function saveCurrentStructure() {
    const modal = document.getElementById('entity-builder-modal');
    const context = JSON.parse(modal.dataset.context);
    const fieldCards = document.getElementById('form-builder-dropzone').querySelectorAll('.form-field-card');
    const attributes = Array.from(fieldCards).map(card => JSON.parse(card.dataset.fieldData));

    showLoading('Guardando estrutura...');
    try {
        const currentWorkspace = getCurrentWorkspace();
        if (!currentWorkspace) return;
        const workspaceId = currentWorkspace.id;
        const ownerId = currentWorkspace.isOwner ? null : currentWorkspace.ownerId;
        
        if (context.isSubEntity) {
            const parentContext = modalNavigationStack[modalNavigationStack.length - 1];
            await saveSubEntityStructure(
                parentContext.moduleId, 
                parentContext.entityId, 
                context.parentFieldId, 
                attributes,
                workspaceId,
                ownerId
            );
        } else {
            await saveEntityStructure(
                context.moduleId, 
                context.entityId, 
                context.entityName, 
                attributes, 
                workspaceId,
                ownerId
            );
        }
        hideLoading();
        showSuccess('Guardado!', `A estrutura foi guardada com sucesso.`);
    } catch (error) {
        hideLoading();
        console.error("Erro ao salvar estrutura:", error);
        showError('Erro', 'Ocorreu um erro ao guardar a estrutura. Verifique suas permissões.');
    }
}

function openModal(context) {
    const modal = document.getElementById('entity-builder-modal');
    if (!modal) return;
    
    modal.dataset.context = JSON.stringify(context);
    updateModalBreadcrumb();
    
    const dropzone = document.getElementById('form-builder-dropzone');
    if (dropzone) {
        dropzone.innerHTML = '';
    }
    
    const modalSidebarContent = document.getElementById('modal-sidebar-content');
    if (modalSidebarContent) {
        if (window.innerWidth >= 640) {
            modalSidebarContent.classList.remove('hidden');
        } else {
            modalSidebarContent.classList.add('hidden');
        }
    }
    
    const toggleModalSidebar = document.getElementById('toggle-modal-sidebar');
    if (toggleModalSidebar) {
        const icon = toggleModalSidebar.querySelector('i');
        if (icon) {
            icon.setAttribute('data-lucide', 'chevron-down');
            createIcons();
        }
    }

    const currentWorkspace = getCurrentWorkspace();
    if (!currentWorkspace) return;
    const workspaceId = currentWorkspace.id;
    const ownerId = currentWorkspace.isOwner ? null : currentWorkspace.ownerId;

    showLoading('Carregando...');
    if (context.isSubEntity) {
        (context.subSchema.attributes || []).forEach(renderFormField);
        hideLoading();
    } else {
        loadStructureForEntity(context.moduleId, context.entityId, workspaceId, ownerId)
            .then(schema => {
                if (schema && schema.attributes && schema.attributes.length > 0) {
                    schema.attributes.forEach(renderFormField);
                }
            })
            .catch(error => {
                console.error("Erro ao carregar estrutura da entidade:", error);
                showError('Erro', 'Não foi possível carregar a estrutura da entidade.');
            })
            .finally(() => {
                hideLoading();
            });
    }
    
    modal.classList.remove('hidden');
    setTimeout(() => modal.querySelector('.bg-white').classList.remove('scale-95', 'opacity-0'), 10);
}

function closeModal() {
    const modal = document.getElementById('entity-builder-modal');
    if (!modal) return;
    
    modal.querySelector('.bg-white').classList.add('scale-95', 'opacity-0');
    setTimeout(() => {
        modal.classList.add('hidden');
        modalNavigationStack = [];
    }, 300);
}

function setupFieldPropertiesPanelEvents() {
    const closeBtn = document.getElementById('close-properties-panel');
    if (closeBtn) closeBtn.addEventListener('click', closeFieldPropertiesPanel);
    
    const cancelBtn = document.getElementById('cancel-field-properties');
    if (cancelBtn) cancelBtn.addEventListener('click', closeFieldPropertiesPanel);
    
    const applyBtn = document.getElementById('apply-field-properties');
    if (applyBtn) applyBtn.addEventListener('click', applyFieldProperties);
    
    document.querySelectorAll('input[name="number-format"]').forEach(radio => {
        radio.addEventListener('change', function() {
            const format = this.value;
            document.getElementById('decimal-precision-container').classList.toggle('hidden', !['decimal', 'currency', 'percentage'].includes(format));
            document.getElementById('currency-symbol-container').classList.toggle('hidden', format !== 'currency');
        });
    });
    
    const addOptionBtn = document.getElementById('add-select-option');
    if (addOptionBtn) {
        addOptionBtn.addEventListener('click', function() {
            const optionsContainer = document.getElementById('select-options-container');
            const newOption = createSelectOption(`Opção ${optionsContainer.children.length + 1}`, optionsContainer.children.length);
            optionsContainer.appendChild(newOption);
            createIcons();
        });
    }
}

function openFieldPropertiesPanel(fieldData, fieldCard) {
    const panel = document.getElementById('field-properties-panel');
    if (!panel) return;
    
    panel.dataset.editingFieldCard = fieldCard ? fieldCard.id : '';
    panel.dataset.fieldData = JSON.stringify(fieldData);
    
    const icon = document.getElementById('field-properties-icon');
    const fieldInfo = fieldTypes.find(f => f.type === fieldData.type);
    if (icon && fieldInfo) {
        icon.setAttribute('data-lucide', fieldInfo.icon);
        createIcons();
    }
    
    document.getElementById('field-label').value = fieldData.label || '';
    document.getElementById('field-description').value = fieldData.description || '';
    document.getElementById('field-required').checked = fieldData.config?.required || false;
    
    document.querySelectorAll('.field-type-config').forEach(el => {
        el.classList.add('hidden');
    });
    
    const configPanel = document.getElementById(`${fieldData.type}-field-config`);
    if (configPanel) {
        configPanel.classList.remove('hidden');
        
        switch (fieldData.type) {
            case 'date':
                setupDateFieldConfig(fieldData.config || defaultFieldConfigs.date);
                break;
            case 'text':
            case 'textarea':
                setupTextFieldConfig(fieldData.config || defaultFieldConfigs.text);
                break;
            case 'number':
                setupNumberFieldConfig(fieldData.config || defaultFieldConfigs.number);
                break;
            case 'select':
                setupSelectFieldConfig(fieldData.config || defaultFieldConfigs.select);
                break;
        }
    }
    
    panel.classList.remove('translate-x-full');
}

function closeFieldPropertiesPanel() {
    const panel = document.getElementById('field-properties-panel');
    if (panel) {
        panel.classList.add('translate-x-full');
    }
}

function setupDateFieldConfig(config) {
    document.querySelector(`input[name="date-format"][value="${config.dateFormat || 'DD/MM/AAAA'}"]`).checked = true;
    document.querySelector(`input[name="time-format"][value="${config.includeTime || 'none'}"]`).checked = true;
    document.querySelector(`input[name="date-behavior"][value="${config.behavior || 'singleDate'}"]`).checked = true;
    document.querySelector(`input[name="date-default"][value="${config.defaultValue || 'none'}"]`).checked = true;
}

function setupTextFieldConfig(config) {
    document.querySelector(`input[name="text-content-type"][value="${config.contentType || 'text'}"]`).checked = true;
    document.querySelector(`input[name="text-appearance"][value="${config.appearance || 'singleLine'}"]`).checked = true;
    const maxLengthInput = document.getElementById('text-max-length');
    maxLengthInput.value = config.maxLength || '';
}

function setupNumberFieldConfig(config) {
    document.querySelector(`input[name="number-format"][value="${config.format || 'plain'}"]`).checked = true;
    document.getElementById('decimal-precision').value = config.precision || 2;
    document.getElementById('currency-symbol').value = config.symbol || 'R$';
    document.getElementById('number-min-value').value = config.minValue || '';
    document.getElementById('number-max-value').value = config.maxValue || '';
    
    const numberFormat = config.format || 'plain';
    document.getElementById('decimal-precision-container').classList.toggle('hidden', !['decimal', 'currency', 'percentage'].includes(numberFormat));
    document.getElementById('currency-symbol-container').classList.toggle('hidden', numberFormat !== 'currency');
    
    document.querySelectorAll('input[name="number-format"]').forEach(radio => {
        radio.addEventListener('change', function() {
            const format = this.value;
            document.getElementById('decimal-precision-container').classList.toggle('hidden', !['decimal', 'currency', 'percentage'].includes(format));
            document.getElementById('currency-symbol-container').classList.toggle('hidden', format !== 'currency');
        });
    });
}

function setupSelectFieldConfig(config) {
    document.querySelector(`input[name="select-behavior"][value="${config.allowMultiple ? 'multiple' : 'single'}"]`).checked = true;
    document.querySelector(`input[name="select-appearance"][value="${config.appearance || 'dropdown'}"]`).checked = true;
    
    const optionsContainer = document.getElementById('select-options-container');
    optionsContainer.innerHTML = '';
    
    const options = config.options && config.options.length > 0 ? config.options : [{ id: 'opt1', label: 'Opção 1' }];
    
    options.forEach((option, index) => {
        const optionElement = createSelectOption(option.label, index);
        optionsContainer.appendChild(optionElement);
    });
    
    document.getElementById('add-select-option').addEventListener('click', function() {
        const newOption = createSelectOption(`Opção ${optionsContainer.children.length + 1}`, optionsContainer.children.length);
        optionsContainer.appendChild(newOption);
        createIcons();
    });
}

function createSelectOption(label, index) {
    const optionTemplate = `
        <div class="select-option-item flex items-center gap-2 p-2 bg-white rounded-lg border border-slate-200">
            <div class="flex-1">
                <input type="text" class="w-full p-1.5 border border-slate-300 rounded text-sm" placeholder="Nome da opção" value="${label}">
            </div>
            <button class="move-option-up text-slate-500 hover:text-slate-700 p-1" ${index === 0 ? 'disabled' : ''}>
                <i data-lucide="chevron-up" class="h-4 w-4"></i>
            </button>
            <button class="move-option-down text-slate-500 hover:text-slate-700 p-1">
                <i data-lucide="chevron-down" class="h-4 w-4"></i>
            </button>
            <button class="delete-option text-slate-500 hover:text-red-500 p-1">
                <i data-lucide="trash-2" class="h-4 w-4"></i>
            </button>
        </div>
    `;
    
    const template = document.createElement('template');
    template.innerHTML = optionTemplate.trim();
    const optionElement = template.content.firstChild;
    
    optionElement.querySelector('.move-option-up').addEventListener('click', function() {
        const item = this.closest('.select-option-item');
        const prev = item.previousElementSibling;
        if (prev) item.parentNode.insertBefore(item, prev);
    });
    
    optionElement.querySelector('.move-option-down').addEventListener('click', function() {
        const item = this.closest('.select-option-item');
        const next = item.nextElementSibling;
        if (next) item.parentNode.insertBefore(next, item);
    });
    
    optionElement.querySelector('.delete-option').addEventListener('click', function() {
        const item = this.closest('.select-option-item');
        const container = item.parentNode;
        if (container.children.length > 1) {
            item.remove();
        } else {
            showError('Erro', 'Deve haver pelo menos uma opção.');
        }
    });
    
    return optionElement;
}

function applyFieldProperties() {
    const panel = document.getElementById('field-properties-panel');
    if (!panel) return;
    
    const fieldData = JSON.parse(panel.dataset.fieldData);
    const fieldCardId = panel.dataset.editingFieldCard;
    const fieldCard = document.getElementById(fieldCardId);
    
    if (!fieldCard) return;
    
    fieldData.label = document.getElementById('field-label').value;
    fieldData.description = document.getElementById('field-description').value;
    
    if (!fieldData.config) {
        fieldData.config = { ...defaultFieldConfigs[fieldData.type] };
    }
    
    fieldData.config.required = document.getElementById('field-required').checked;
    
    switch (fieldData.type) {
        case 'date':
            fieldData.config.dateFormat = document.querySelector('input[name="date-format"]:checked').value;
            fieldData.config.includeTime = document.querySelector('input[name="time-format"]:checked').value;
            fieldData.config.behavior = document.querySelector('input[name="date-behavior"]:checked').value;
            fieldData.config.defaultValue = document.querySelector('input[name="date-default"]:checked').value;
            break;
            
        case 'text':
        case 'textarea':
            fieldData.config.contentType = document.querySelector('input[name="text-content-type"]:checked').value;
            fieldData.config.appearance = document.querySelector('input[name="text-appearance"]:checked').value;
            
            const maxLength = document.getElementById('text-max-length').value;
            fieldData.config.maxLength = maxLength ? parseInt(maxLength) : null;
            break;
            
        case 'number':
            fieldData.config.format = document.querySelector('input[name="number-format"]:checked').value;
            fieldData.config.precision = parseInt(document.getElementById('decimal-precision').value || 2);
            fieldData.config.symbol = document.getElementById('currency-symbol').value || 'R$';
            
            const minValue = document.getElementById('number-min-value').value;
            fieldData.config.minValue = minValue ? parseFloat(minValue) : null;
            
            const maxValue = document.getElementById('number-max-value').value;
            fieldData.config.maxValue = maxValue ? parseFloat(maxValue) : null;
            break;
            
        case 'select':
            fieldData.config.allowMultiple = document.querySelector('input[name="select-behavior"]:checked').value === 'multiple';
            fieldData.config.appearance = document.querySelector('input[name="select-appearance"]:checked').value;
            
            const optionsContainer = document.getElementById('select-options-container');
            const options = [];
            
            Array.from(optionsContainer.children).forEach((optItem, index) => {
                const label = optItem.querySelector('input').value.trim();
                if (label) {
                    options.push({ id: `opt${index + 1}`, label: label });
                }
            });
            
            fieldData.config.options = options;
            break;
    }
    
    fieldCard.querySelector('.field-label').textContent = fieldData.label;
    fieldCard.dataset.fieldData = JSON.stringify(fieldData);
    
    closeFieldPropertiesPanel();
    
    showSuccess('Propriedades atualizadas!', '');
}

function renderSharedResource(resource) {
    const container = document.getElementById('shared-resources-list');
    if (!container) return;
    
    const itemHtml = `
        <div class="shared-resource-item bg-white rounded-lg border border-emerald-100 shadow-sm p-3 hover:shadow-md transition-shadow" 
             data-resource-id="${resource.id}" data-owner-id="${resource.ownerId}" data-resource-type="${resource.type}" data-role="${resource.role}">
            <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                    <div class="h-8 w-8 rounded-md bg-emerald-100 flex items-center justify-center text-emerald-600">
                        <i data-lucide="layout-grid" class="h-5 w-5"></i>
                    </div>
                    <div>
                        <span class="font-medium text-slate-700 block text-sm">Creator de ${resource.ownerName}</span>
                        <span class="text-xs text-slate-500">Permissão: ${formatRoleText(resource.role)}</span>
                    </div>
                </div>
                <button class="access-shared-resource-btn bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-md hover:bg-emerald-100 transition-colors text-sm flex items-center gap-1">
                    <i data-lucide="log-in" class="h-4 w-4"></i>
                    <span>Acessar</span>
                </button>
            </div>
        </div>
    `;
    
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = itemHtml.trim();
    const item = tempDiv.firstChild;
    
    item.querySelector('.access-shared-resource-btn').addEventListener('click', () => {
        accessSharedResource(resource);
    });
    
    container.appendChild(item);
    
    createIcons();
}

function formatRoleText(role) {
    switch (role) {
        case 'admin': return 'Administrador';
        case 'editor': return 'Editor';
        case 'viewer': return 'Leitor';
        default: return role || 'Desconhecido';
    }
}

async function accessSharedResource(resource) {
    showLoading('Acessando recurso compartilhado...');
    
    try {
        if (resource.type === 'module_constructor') {
            const sharedModules = await loadSharedUserModules(resource.ownerId);
            
            if (sharedModules.length > 0) {
                showSuccess('Acesso concedido', `Você agora tem acesso aos módulos de ${resource.ownerName}.`);
                
                let modulesHtml = '';
                sharedModules.forEach(module => {
                    modulesHtml += `<li class="p-2 border-b border-slate-100">${module.name}</li>`;
                });
                
                Swal.fire({
                    title: `Módulos de ${resource.ownerName}`,
                    html: `<ul class="text-left mt-4 border rounded-lg bg-slate-50">${modulesHtml}</ul>`,
                    icon: 'success',
                    confirmButtonText: 'OK'
                });
            } else {
                showError('Sem módulos', 'Este usuário não possui módulos compartilhados.');
            }
        } else {
            showError('Tipo não suportado', 'Este tipo de recurso compartilhado ainda não é suportado.');
        }
    } catch (error) {
        console.error('Erro ao acessar recurso compartilhado:', error);
        showError('Erro de acesso', 'Não foi possível acessar o recurso compartilhado. Verifique suas permissões.');
    } finally {
        hideLoading();
    }
}

async function loadAndRenderSharedResources() {
    // Esta função agora é gerenciada pelo módulo de workspaces
}

// Exporta funções públicas
export {
    renderEntityInLibrary,
    renderModule,
    renderDroppedEntity,
    renderFormField,
    openModal,
    closeModal,
    openFieldPropertiesPanel,
    closeFieldPropertiesPanel,
    setupFieldPropertiesPanelEvents,
    loadAndRenderSharedResources
};
