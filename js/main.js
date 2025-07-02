/**
 * Arquivo principal do Construktor
 * Coordena a inicialização dos módulos e a interação entre eles
 */

import { firebaseConfig, availableEntityIcons, fieldTypes, defaultFieldConfigs } from './config.js';
import { initAutenticacao, isUsuarioLogado, getUsuarioId } from './autenticacao.js';
import { initDatabase, loadAllEntities, loadAndRenderModules, createEntity, createModule, 
         saveEntityToModule, deleteEntityFromModule, deleteEntity, deleteModule, 
         saveEntityStructure, saveSubEntityStructure, saveModulesOrder,
         copyEntityToModule, moveEntityToModule, getEntities } from './database.js';
import { initUI, closeMobileSidebar, createIcons, checkEmptyStates, showLoading, hideLoading, showSuccess, showError, showConfirmDialog, showInputDialog } from './ui.js';
import { initUserProfile } from './user/userProfile.js';
import { initInvitations, checkPendingInvitations } from './user/invitations.js';
import { initWorkspaces, getCurrentWorkspace } from './workspaces.js';

// Variáveis globais
let db;
let modalNavigationStack = [];

// Função helper para buscar entidade por ID
function getEntityById(entityId) {
    const allEntities = getEntities();
    return allEntities.find(e => e.id === entityId);
}

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
            return;
        }
        
        // Inicializa o banco de dados
        await initDatabase(firebase);
        db = firebase.firestore();
        
        // Inicializa a interface do usuário
        initUI();
        
        // Inicializa o sistema de gerenciamento de usuário
        initUserProfile(db);
        
        // Inicializa o sistema de convites
        initInvitations(db);
        
        // Inicializa o sistema de áreas de trabalho
        initWorkspaces(db);
        
        // Verifica se há convites pendentes
        try {
            const pendingInvites = await checkPendingInvitations();
            console.log('Verificação de convites pendentes:', pendingInvites);
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
            console.log("[workspaceChanged] Evento recebido. Carregando novo workspace.", event.detail.workspace);
            await loadWorkspaceData(event.detail.workspace);
        });
        
        // Carrega dados da área de trabalho atual
        const currentWorkspace = getCurrentWorkspace();
        if (currentWorkspace) {
            console.log("[initApp] Carregando workspace inicial.", currentWorkspace);
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
    showLoading('Carregando área de trabalho...');
    console.log('[loadWorkspaceData] Iniciando carregamento para:', workspace);

    try {
        const entityList = document.getElementById('entity-list');
        const moduleContainer = document.getElementById('module-container');
        
        if (entityList) entityList.innerHTML = '';
        if (moduleContainer) moduleContainer.innerHTML = '';
        
        const workspaceId = workspace.id;
        const ownerId = workspace.isOwner ? null : workspace.ownerId;

        console.log(`[loadWorkspaceData] Detalhes: workspaceId=${workspaceId}, ownerId=${ownerId}, isShared=${workspace.isShared}`);
        
        const entities = await loadAllEntities(workspaceId, ownerId);
        
        if (entityList) {
            entities.forEach(entity => renderEntityInLibrary(entity));
        }
        
        populateFieldsToolbox();
        
        await loadAndRenderModules(renderModule, workspaceId, ownerId);
        
        // NOVA LÓGICA: Renderizar entidades nos módulos baseado no moduleId
        const allEntities = await loadAllEntities(workspaceId, ownerId);
        allEntities.forEach(entity => {
            if (entity.moduleId) {
                renderDroppedEntity(entity.moduleId, entity.id, { entityName: entity.name, attributes: entity.attributes || [] }, entity);
            }
        });
        
        // Força a reconfiguração do drag-and-drop para todos os módulos existentes
        const allModules = document.querySelectorAll('.module-quadro');
        allModules.forEach(moduleEl => {
            setupDragAndDropForModule(moduleEl);
        });
        
        checkEmptyStates();
        
        if (window.lucide) {
            setTimeout(() => lucide.createIcons(), 200);
        }
        
        hideLoading();
    } catch (error) {
        hideLoading();
        console.error('[loadWorkspaceData] Erro crítico ao carregar a área de trabalho:', error);
        showError('Erro de Carregamento', 'Ocorreu um erro ao carregar a área de trabalho. Verifique a consola para mais detalhes.');
    }
}

document.addEventListener('DOMContentLoaded', initApp);

// ---- Funções de Renderização ----
function renderEntityInLibrary(entity) {
    const existingCard = document.querySelector(`.entity-card[data-entity-id="${entity.id}"]`);
    if (existingCard) {
        console.log(`Entidade ${entity.name} (${entity.id}) já existe na biblioteca. Ignorando.`);
        return;
    }
    
    console.log(`Renderizando entidade na biblioteca: ${entity.name} (${entity.id})`);
    
    const list = document.getElementById('entity-list');
    if (!list) {
        console.error("Elemento 'entity-list' não encontrado!");
        return;
    }
    
    const template = document.getElementById('entity-card-template');
    if (!template) {
        console.error("Template 'entity-card-template' não encontrado!");
        return;
    }
    
    const clone = template.content.cloneNode(true);
    const card = clone.querySelector('.entity-card');
    card.dataset.entityId = entity.id;
    card.dataset.entityName = entity.name;
    card.dataset.entityIcon = entity.icon; 
    
    const iconEl = clone.querySelector('.entity-icon');
    iconEl.setAttribute('data-lucide', entity.icon || 'box'); 

    clone.querySelector('.entity-name').textContent = entity.name;
    
    if (entity.id.startsWith('-')) {
        clone.querySelector('.delete-custom-entity-btn').classList.remove('hidden');
    }
    
    list.appendChild(clone);
    
    if (window.lucide) {
        lucide.createIcons();
    } else {
        createIcons();
    }
    
    if (list && !list._sortable) {
        console.log('Configurando Sortable para biblioteca de entidades');
        list._sortable = new Sortable(list, {
            group: { name: 'shared-entities', pull: 'clone', put: false },
            sort: false,
            animation: 150,
            ghostClass: 'sortable-ghost',
            chosenClass: 'sortable-chosen',
            dragClass: 'sortable-drag',
            delay: 300, // Atraso de 300ms para iniciar o arraste (long-press)
            delayOnTouchOnly: true, // Ativa o delay apenas para dispositivos de toque

            // A nova lógica para fechar a sidebar:
            onStart: function (evt) {
                console.log('Iniciando drag de entidade da biblioteca:', evt.item.dataset);
                // Verifica se a tela é mobile
                if (window.innerWidth < 640) {
                    closeMobileSidebar(); // Apenas chame a função centralizada
                }
            },
        });
        console.log('Sortable configurado para biblioteca de entidades com sucesso');
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
    } else {
        createIcons();
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
        
        // Adiciona evento de clique para dispositivos móveis
        if (window.innerWidth < 640) {
            item.addEventListener('click', function(e) {
                // Simula um evento de drop para adicionar o campo diretamente no mobile
                handleFieldDrop({
                    item: this,
                    type: 'click',
                    originalEvent: { type: 'touchend', movementX: 0 }
                });
            });
        }
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
        // Define o texto do tipo baseado no campo
        let typeText = fieldInfo.name;
        
        // ===== TEXTOS ESPECÍFICOS PARA NOVOS TIPOS =====
        switch (fieldData.type) {
            case 'person':
                typeText = fieldData.config?.allowMultiple ? 'Pessoas (Múltiplas)' : 'Pessoa';
                break;
            case 'created-time':
                typeText = 'Hora de Criação (Auto)';
                break;
            case 'created-by':
                typeText = 'Criado por (Auto)';
                break;
            case 'last-edited-by':
                typeText = 'Editado por último (Auto)';
                break;
            case 'button':
                const actionsCount = fieldData.config?.actions?.length || 0;
                typeText = `Botão (${actionsCount} ação${actionsCount !== 1 ? 'ões' : ''})`;
                break;
        }
        
        clone.querySelector('.field-type').textContent = typeText;
        
        if (fieldData.config && Object.keys(fieldData.config).length > 0) {
            const label = clone.querySelector('.field-label');
            
            // Campos automáticos são sempre marcados como (Auto)
            if (['created-time', 'created-by', 'last-edited-by'].includes(fieldData.type)) {
                // Não adiciona indicadores extras para campos automáticos
            } else if (fieldData.config.required) {
                label.textContent += ' *';
            } else {
                label.textContent += ' (Configurado)';
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
        if (window.innerWidth < 640) {
            const currentContext = JSON.parse(document.getElementById('entity-builder-modal').dataset.context);
            const currentTitleSpan = document.createElement('span');
            currentTitleSpan.className = 'font-semibold text-indigo-800';
            currentTitleSpan.textContent = currentContext.label || currentContext.entityName;
            breadcrumbContainer.appendChild(currentTitleSpan);
        } else {
            modalNavigationStack.forEach((state, index) => {
                const nameSpan = document.createElement('span');
                nameSpan.textContent = state.entityName || state.label;
                nameSpan.className = 'text-slate-500 truncate';
                breadcrumbContainer.appendChild(nameSpan);
                
                if (index < modalNavigationStack.length - 1) {
                    const separator = document.createElement('span');
                    separator.className = 'mx-1 sm:mx-2 text-slate-400';
                    separator.innerHTML = `<i data-lucide="chevron-right" class="inline h-3 w-3 sm:h-4 sm:w-4"></i>`;
                    breadcrumbContainer.appendChild(separator);
                } else {
                    const separator = document.createElement('span');
                    separator.className = 'mx-1 sm:mx-2 text-slate-400';
                    separator.innerHTML = `<i data-lucide="chevron-right" class="inline h-3 w-3 sm:h-4 sm:w-4"></i>`;
                    breadcrumbContainer.appendChild(separator);
                }
            });
            
            const context = JSON.parse(document.getElementById('entity-builder-modal').dataset.context);
            const currentTitleSpan = document.createElement('span');
            currentTitleSpan.className = 'font-semibold text-indigo-800 truncate';
            currentTitleSpan.textContent = context.label || context.entityName;
            breadcrumbContainer.appendChild(currentTitleSpan);
        }
    }
    
    createIcons();
}

// ---- Funções de Interação ----
function setupDragAndDropForModule(moduleElement) {
    const dropzone = moduleElement.querySelector('.entities-dropzone');
    if (!dropzone) {
        console.warn('Dropzone não encontrada para módulo:', moduleElement.dataset.moduleId);
        return;
    }
    
    if (dropzone._sortable) {
        console.log('Sortable já configurado para módulo:', moduleElement.dataset.moduleId);
        return;
    }
    
    console.log('Configurando Sortable para módulo:', moduleElement.dataset.moduleId);
    dropzone._sortable = new Sortable(dropzone, { 
        group: 'shared-entities', 
        animation: 150, 
        onAdd: handleEntityDrop,
        ghostClass: 'sortable-ghost',
        chosenClass: 'sortable-chosen',
        dragClass: 'sortable-drag',
        delay: 50,
        delayOnTouchOnly: true,
    });
    console.log('Sortable configurado para módulo com sucesso:', moduleElement.dataset.moduleId);
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
            onEnd: function(evt) {
                const moduleElements = document.querySelectorAll('.module-quadro');
                const newOrder = Array.from(moduleElements).map(el => el.dataset.moduleId);
                const currentWorkspace = getCurrentWorkspace();
                const workspaceId = currentWorkspace ? currentWorkspace.id : 'default';
                const ownerId = currentWorkspace && !currentWorkspace.isOwner ? currentWorkspace.ownerId : null;
                saveModulesOrder(newOrder, workspaceId, ownerId);
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
        
        const refreshSharedBtn = document.getElementById('refresh-shared-resources');
        if (e.target === refreshSharedBtn || refreshSharedBtn?.contains(e.target)) {
            loadAndRenderSharedResources();
            return;
        }
    });
    
    const addNewEntityBtn = document.getElementById('add-new-entity-btn');
    if (addNewEntityBtn) addNewEntityBtn.addEventListener('click', handleAddNewEntity);
    
    const addNewModuleBtn = document.getElementById('add-new-module-btn');
    if (addNewModuleBtn) addNewModuleBtn.addEventListener('click', handleAddNewModule);
    
    const closeModalBtn = document.getElementById('close-modal-btn');
    if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);
    
    const saveStructureBtn = document.getElementById('save-structure-btn');
    if (saveStructureBtn) saveStructureBtn.addEventListener('click', saveCurrentStructure);
    
    const modalBackBtn = document.getElementById('modal-back-btn');
    if (modalBackBtn) modalBackBtn.addEventListener('click', handleModalBack);
    
    const emptyAddModuleBtn = document.getElementById('empty-add-module-btn');
    if (emptyAddModuleBtn) emptyAddModuleBtn.addEventListener('click', handleAddNewModule);
    
    const mobileAddModuleBtn = document.getElementById('mobile-add-module-btn');
    if (mobileAddModuleBtn) mobileAddModuleBtn.addEventListener('click', handleAddNewModule);

    const formBuilderDropzone = document.getElementById('form-builder-dropzone');
    if (formBuilderDropzone) {
        if (!formBuilderDropzone._sortable) {
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
        }
        
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

    const viewCodeLink = document.getElementById('view-code-secure-link');
    if (viewCodeLink) {
        viewCodeLink.addEventListener('click', async function(event) {
            event.preventDefault();
            
            const { value: password, isConfirmed } = await Swal.fire({
                title: 'Acesso Restrito',
                input: 'password',
                inputLabel: 'Senha para Ver Código',
                inputPlaceholder: 'Digite a senha',
                showCancelButton: true,
                confirmButtonText: 'Acessar',
                cancelButtonText: 'Cancelar',
                inputAttributes: {
                    autocapitalize: 'off',
                    autocorrect: 'off'
                },
                customClass: {
                    popup: 'shadow-xl rounded-xl'
                }
            });

            if (isConfirmed && password) {
                if (password === '246819') {
                    window.open('/pages/code-view.html', '_blank');
                } else {
                    showError('Senha Incorreta', 'A senha fornecida está incorreta.');
                }
            }
        });
    }
}

async function handleEntityDrop(event) {
    const { item, to, from } = event;
    const { entityId, entityName, entityIcon } = item.dataset;
    const moduleEl = to.closest('.module-quadro');
    const moduleId = moduleEl.dataset.moduleId;
    const isFromModule = from && from.classList.contains('entities-dropzone');
    const sourceModuleEl = isFromModule ? from.closest('.module-quadro') : null;
    const sourceModuleId = sourceModuleEl ? sourceModuleEl.dataset.moduleId : null;

    // Remove o item temporário do arraste
    item.remove();
    
    // Ação padrão é adicionar da biblioteca
    let actionType = 'add';
    
    // Se está vindo de outro módulo, pergunta se quer copiar ou mover
    if (isFromModule && sourceModuleId && sourceModuleId !== moduleId) {
        const choice = await showCopyOrMoveDialog(entityName);
        if (choice === null) {
            // Usuário cancelou, recria o item na origem para não perdê-lo de vista
            const entityInfo = getEntityById(entityId);
            if (sourceModuleId && entityInfo) {
                renderDroppedEntity(sourceModuleId, entityId, { entityName, attributes: entityInfo.attributes || [] }, entityInfo);
            }
            return;
        }
        actionType = choice;
    }
    
    const currentWorkspace = getCurrentWorkspace();
    const workspaceId = currentWorkspace ? currentWorkspace.id : 'default';
    const ownerId = currentWorkspace && !currentWorkspace.isOwner ? currentWorkspace.ownerId : null;
    
    try {
        if (actionType === 'copy') {
            const newEntityInfo = await copyEntityToModule(entityId, moduleId, workspaceId, ownerId);
            if (newEntityInfo) {
                renderDroppedEntity(moduleId, newEntityInfo.id, { entityName: newEntityInfo.name }, newEntityInfo);
                 // Recria o card na origem pois a cópia não deve remover o original
                const originalEntityInfo = getEntityById(entityId);
                 if (sourceModuleId && originalEntityInfo) {
                    renderDroppedEntity(sourceModuleId, entityId, { entityName: originalEntityInfo.name }, originalEntityInfo);
                }
            }
        } else if (actionType === 'move') {
            await moveEntityToModule(entityId, moduleId, workspaceId, ownerId);
            
            // Remove o card visual do DOM do módulo de origem
            const sourceCard = sourceModuleEl.querySelector(`.dropped-entity-card[data-entity-id="${entityId}"]`);
            if (sourceCard) {
                sourceCard.remove();
            }
            
            // Renderiza o card no novo módulo
            const entityInfo = getEntityById(entityId);
            renderDroppedEntity(moduleId, entityId, { entityName }, entityInfo);
            showSuccess('Entidade movida!', `"${entityName}" foi transferida.`);

        } else { // actionType === 'add'
            await saveEntityToModule(moduleId, entityId, entityName, workspaceId, ownerId);
            const entityInfo = getEntityById(entityId);
            renderDroppedEntity(moduleId, entityId, { entityName }, entityInfo);
            showSuccess('Entidade adicionada!', `"${entityName}" foi adicionada ao módulo.`);
        }
    } catch (error) {
        console.error('Erro na operação de drop:', error);
        showError('Erro', 'Não foi possível completar a operação.');
        // Se der erro, tenta restaurar o card na origem
        const entityInfo = getEntityById(entityId);
        if(sourceModuleId && entityInfo) {
            renderDroppedEntity(sourceModuleId, entityId, { entityName }, entityInfo);
        }
    }
}

/**
 * Mostra um diálogo perguntando se o usuário quer copiar ou mover a entidade
 * @param {string} entityName - Nome da entidade
 * @returns {Promise<string|null>} 'copy', 'move' ou null se cancelado
 */
async function showCopyOrMoveDialog(entityName) {
    return new Promise((resolve) => {
        Swal.fire({
            title: `Mover "${entityName}"?`,
            html: `
                <div class="text-sm text-gray-600 mb-4">
                    Escolha como deseja transferir esta entidade:
                </div>
                <div class="flex flex-col gap-3">
                    <button id="copy-btn" class="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-blue-50 hover:border-blue-300 transition-colors">
                        <i data-lucide="copy" class="h-5 w-5 text-blue-600"></i>
                        <div class="text-left">
                            <div class="font-medium text-gray-900">Copiar</div>
                            <div class="text-sm text-gray-500">Criar uma cópia no novo módulo</div>
                        </div>
                    </button>
                    <button id="move-btn" class="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-green-50 hover:border-green-300 transition-colors">
                        <i data-lucide="move" class="h-5 w-5 text-green-600"></i>
                        <div class="text-left">
                            <div class="font-medium text-gray-900">Mover</div>
                            <div class="text-sm text-gray-500">Transferir para o novo módulo</div>
                        </div>
                    </button>
                </div>
            `,
            showConfirmButton: false,
            showCancelButton: true,
            cancelButtonText: 'Cancelar',
            allowOutsideClick: false,
            allowEscapeKey: true,
            customClass: {
                popup: 'swal2-popup-custom',
                htmlContainer: 'swal2-html-custom'
            },
            didOpen: () => {
                // Cria os ícones do Lucide
                if (window.lucide) {
                    lucide.createIcons();
                }
                
                // Adiciona event listeners aos botões
                document.getElementById('copy-btn').addEventListener('click', () => {
                    Swal.close();
                    resolve('copy');
                });
                
                document.getElementById('move-btn').addEventListener('click', () => {
                    Swal.close();
                    resolve('move');
                });
            },
            willClose: () => {
                // Se chegou aqui sem ter clicado em copy ou move, foi cancelado
                resolve(null);
            }
        });
    });
}

async function handleFieldDrop(event) {
    const { item } = event;
    const fieldType = item.dataset.fieldType;
    item.remove();

    // Modificação para mobile: se for um toque direto (sem arrastar) em dispositivo móvel
    const isMobile = window.innerWidth < 640;
    const isDirectTap = event.type === 'click' || (event.originalEvent && event.originalEvent.type === 'touchend' && !event.originalEvent.movementX);

    // Comportamento simplificado para mobile: adicionar diretamente se for um toque
    if (isMobile && isDirectTap && fieldType !== 'sub-entity') {
        // Para dispositivos móveis, adicionamos o campo com um nome padrão
        const defaultLabel = fieldTypes.find(f => f.type === fieldType)?.name || 'Novo Campo';
        const fieldId = `field_${Date.now()}`;
        const fieldData = { 
            id: fieldId, 
            type: fieldType, 
            label: defaultLabel,
            config: { ...defaultFieldConfigs[fieldType] }
        };
        renderFormField(fieldData);
        
        // Atualiza os dados da entidade para o construtor de ações
        await refreshCurrentEntityData();
        
        showSuccess('Campo adicionado!', '');
        return;
    }

    if (fieldType === 'sub-entity') {
        const choice = await showConfirmDialog(
            'Como deseja criar esta tabela?',
            'Pode criar uma sub-entidade nova ou ligar a uma que já existe.',
            'Criar Nova',
            'Ligar a Existente',
            'info'
        );

        if (choice === true) {
            const result = await showInputDialog(
                'Nome da Nova Sub-Entidade',
                'Nome',
                'Ex: Endereços, Contactos'
            );
            
            if (result.confirmed && result.value) {
                const fieldData = { 
                    id: `field_${Date.now()}`, 
                    type: 'sub-entity', 
                    label: result.value, 
                    subType: 'independent', 
                    subSchema: { attributes: [] } 
                };
                renderFormField(fieldData);
                
                // Atualiza os dados da entidade para o construtor de ações
                await refreshCurrentEntityData();
            }
        } else if (choice === false) {
            const currentEntityId = JSON.parse(document.getElementById('entity-builder-modal').dataset.context).entityId;
            const currentWorkspace = getCurrentWorkspace();
            const workspaceId = currentWorkspace ? currentWorkspace.id : 'default';
            const ownerId = currentWorkspace && currentWorkspace.isShared ? currentWorkspace.ownerId : null;
            const allEntities = await loadAllEntities(workspaceId, ownerId);
            const availableEntities = allEntities.filter(e => e.id !== currentEntityId);
            
            if (availableEntities.length === 0) {
                showError('Aviso', 'Não existem outras entidades para criar uma ligação. Crie pelo menos uma outra entidade primeiro.');
                return;
            }
            
            const entityOptions = availableEntities.map(e => `<option value="${e.id}|${e.name}">${e.name}</option>`).join('');
            
            const htmlContent = `
                <div class="mb-4">
                    <label for="swal-input-label" class="block text-sm font-medium text-slate-700 mb-1 text-left">Nome do Campo</label>
                    <input id="swal-input-label" class="w-full px-3 py-2 border border-slate-300 rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500" placeholder="Ex: Cliente Associado">
                </div>
                <div>
                    <label for="swal-input-target-entity" class="block text-sm font-medium text-slate-700 mb-1 text-left">Ligar a qual entidade?</label>
                    <select id="swal-input-target-entity" class="w-full px-3 py-2 border border-slate-300 rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500">${entityOptions}</select>
                </div>
            `;
            
            if (typeof Swal !== 'undefined') {
                const { value: formValues, isConfirmed } = await Swal.fire({
                    title: 'Ligar a uma Entidade Existente',
                    html: htmlContent,
                    showCancelButton: true,
                    focusConfirm: false,
                    customClass: {
                        popup: 'shadow-xl rounded-xl'
                    },
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
                    
                    // Atualiza os dados da entidade para o construtor de ações
                    await refreshCurrentEntityData();
                }
            }
        }
    } else {
        const result = await showInputDialog(
            'Adicionar Campo',
            'Nome do Campo',
            'Ex: Nome Fantasia'
        );
        
        if (result.confirmed && result.value) {
            const fieldId = `field_${Date.now()}`;
            const fieldData = { 
                id: fieldId, 
                type: fieldType, 
                label: result.value,
                config: { ...defaultFieldConfigs[fieldType] }
            };
            renderFormField(fieldData);
            
            // Atualiza os dados da entidade para o construtor de ações
            await refreshCurrentEntityData();
            
            showSuccess('Campo adicionado!', '');
        }
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

    if (context.isSubEntity) {
        (context.subSchema.attributes || []).forEach(renderFormField);
    } else {
        const currentWorkspace = getCurrentWorkspace();
        const workspaceId = currentWorkspace ? currentWorkspace.id : 'default';
        const ownerId = currentWorkspace && !currentWorkspace.isOwner ? currentWorkspace.ownerId : null;
        
        // NOVA LÓGICA: A entidade já contém os attributes
        const entity = getEntityById(context.entityId);
        console.log("Entidade carregada:", context.entityId, entity);
        if (entity && entity.attributes && entity.attributes.length > 0) {
            entity.attributes.forEach(renderFormField);
        } else {
            console.log("Nenhuma estrutura encontrada ou estrutura vazia para entidade:", context.entityId);
        }
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

async function handleAddNewEntity() {
    const currentWorkspace = getCurrentWorkspace();
    if (!currentWorkspace) {
        showError('Erro', 'Nenhuma área de trabalho selecionada.');
        return;
    }
    
    // The problem description implies that if it's not the owner, they might still be able to create
    // if they are an editor/admin. The permission check should ideally happen based on Firebase rules.
    // For now, adhering to the existing frontend check, but this might need review
    // if editors/admins *should* be able to create entities directly in the library of a shared workspace.
    // The current Firebase rules ALLOW entity creation for editors/admins in shared workspaces.
    // The original instruction was: "um utilizador convidado com permissão de "admin" ou "editor") 
    // possam efetivamente editar os workspaces partilhados, como criar módulos e ENTIDADES."
    // This implies the check `!currentWorkspace.isOwner` might be too restrictive here if the user has editor/admin rights.
    // However, I will stick to the plan of passing ownerId first.
    // The specific error message "Você não tem permissão para criar entidades nesta área de trabalho."
    // might be triggered by this frontend check before Firebase rules even get a chance.
    // For now, I will modify to pass ownerId, but this permission check might need to be revisited.

    const workspaceId = currentWorkspace.id;
    // const ownerId = currentWorkspace.isOwner ? null : currentWorkspace.ownerId; // This was the previous pattern
    // The problem statement says "const ownerId = currentWorkspace.isOwner ? nulo: currentWorkspace.ownerId;"
    // Let's assume currentWorkspace.isShared exists and is the opposite of isOwner for shared workspaces.
    // Or, more directly, if it's NOT isOwner, then pass currentWorkspace.ownerId.
    const ownerId = !currentWorkspace.isOwner ? currentWorkspace.ownerId : null;


    // PERMISSÕES REMOVIDAS: Agora controladas pelas Regras de Segurança do Firestore

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
                // workspaceId and ownerId defined earlier in this function
                const entityId = await createEntity({ 
                    name: formValues.name, 
                    icon: formValues.icon 
                }, workspaceId, ownerId);
                
                // loadAllEntities also needs workspaceId and ownerId
                const updatedEntities = await loadAllEntities(workspaceId, ownerId);
                
                const entityList = document.getElementById('entity-list');
                if (entityList) {
                    entityList.innerHTML = '';
                }
                
                updatedEntities.forEach(entity => {
                    renderEntityInLibrary(entity);
                });
                
                hideLoading();
                showSuccess('Entidade Criada!', `A entidade "${formValues.name}" está pronta para ser usada.`);
            } catch (error) {
                hideLoading();
                showError('Erro', 'Ocorreu um erro ao criar a entidade. Tente novamente.');
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
    
    // PERMISSÕES REMOVIDAS: Agora controladas pelas Regras de Segurança do Firestore
    
    const workspaceId = currentWorkspace.id;
    const ownerId = !currentWorkspace.isOwner ? currentWorkspace.ownerId : null;

    const result = await showInputDialog(
        'Criar Novo Módulo',
        'Nome do Módulo',
        'Ex: Vendas, Recursos Humanos, Financeiro...'
    );
    
    if (result.confirmed && result.value) {
        showLoading('Criando módulo...');
        
        try {
            // workspaceId and ownerId defined earlier
            const moduleId = await createModule(result.value, workspaceId, ownerId);
            
            const moduleEl = renderModule({ id: moduleId, name: result.value }); // renderModule doesn't interact with DB directly for creation
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
            showError('Erro', 'Ocorreu um erro ao criar o módulo. Tente novamente.');
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
        try {
            const currentWorkspace = getCurrentWorkspace();
            const workspaceId = currentWorkspace ? currentWorkspace.id : 'default';
            const ownerId = currentWorkspace && !currentWorkspace.isOwner ? currentWorkspace.ownerId : null;
            await deleteEntityFromModule(moduleId, entityId, workspaceId, ownerId);
            card.remove();
            showSuccess('Removido!', `A entidade "${entityName}" foi removida do módulo.`);
        } catch (error) {
            showError('Erro', 'Ocorreu um erro ao remover a entidade. Tente novamente.');
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
        
        try {
            const currentWorkspace = getCurrentWorkspace();
            const workspaceId = currentWorkspace ? currentWorkspace.id : 'default';
            const ownerId = currentWorkspace && !currentWorkspace.isOwner ? currentWorkspace.ownerId : null;
            await deleteEntity(entityId, workspaceId, ownerId);
            
            // This part removes elements from the UI. If entities from different workspaces are shown
            // (e.g. an owner's entities and a shared workspace's entities), this querySelectorAll
            // might need to be more specific, but for now, it should be fine as it's based on entityId.
            document.querySelectorAll(`.dropped-entity-card[data-entity-id="${entityId}"]`).forEach(c => c.remove());
            
            card.remove();
            
            hideLoading();
            showSuccess('Eliminado!', `A entidade "${entityName}" foi eliminada permanentemente.`);
        } catch (error) {
            hideLoading();
            showError('Erro', 'Ocorreu um erro ao eliminar a entidade. Tente novamente.');
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
        
        try {
            const currentWorkspace = getCurrentWorkspace();
            const workspaceId = currentWorkspace ? currentWorkspace.id : 'default';
            const ownerId = currentWorkspace && !currentWorkspace.isOwner ? currentWorkspace.ownerId : null;
            await deleteModule(moduleId, workspaceId, ownerId);
            moduleEl.remove();
            checkEmptyStates();
            
            hideLoading();
            showSuccess('Eliminado!', `O módulo "${moduleName}" foi eliminado permanentemente.`);
        } catch (error) {
            hideLoading();
            showError('Erro', 'Ocorreu um erro ao eliminar o módulo. Tente novamente.');
        }
    }
}

async function saveCurrentStructure() {
    const modal = document.getElementById('entity-builder-modal');
    const context = JSON.parse(modal.dataset.context);
    const fieldCards = document.getElementById('form-builder-dropzone').querySelectorAll('.form-field-card');
    const attributes = Array.from(fieldCards).map(card => JSON.parse(card.dataset.fieldData));

    console.log("Salvando estrutura:", { context, attributes });

    showLoading('Guardando estrutura...');

    try {
        const currentWorkspace = getCurrentWorkspace();
        const workspaceId = currentWorkspace ? currentWorkspace.id : 'default';
        const ownerId = currentWorkspace && !currentWorkspace.isOwner ? currentWorkspace.ownerId : null;
        
        console.log("Salvando com workspaceId:", workspaceId, "ownerId:", ownerId, "isOwner:", currentWorkspace?.isOwner);
        
        if (context.isSubEntity) {
            const parentContext = modalNavigationStack[modalNavigationStack.length - 1];
            console.log("Salvando sub-entidade para:", parentContext);
            
            // For sub-entities, the ownerId should correspond to the owner of the main entity's workspace.
            // We assume parentContext's workspace is the same as currentWorkspace.
            await saveSubEntityStructure(
                parentContext.moduleId, 
                parentContext.entityId, 
                context.parentFieldId, 
                attributes,
                workspaceId,
                ownerId // Pass ownerId here
            );
            
            hideLoading();
            showSuccess('Guardado!', 'A estrutura da sub-entidade foi guardada com sucesso.');
        } else {
            console.log("Salvando entidade principal:", {
                moduleId: context.moduleId,
                entityId: context.entityId,
                entityName: context.entityName,
                attributesCount: attributes.length,
                workspaceId,
                ownerId
            });
            
            await saveEntityStructure(
                context.moduleId, 
                context.entityId, 
                context.entityName, 
                attributes, 
                workspaceId,
                ownerId // Pass ownerId here
            );
            
            hideLoading();
            showSuccess('Guardado!', `A estrutura da entidade "${context.entityName}" foi guardada com sucesso.`);
        }
    } catch (error) {
        hideLoading();
        console.error("Erro ao salvar estrutura:", error);
        showError('Erro', 'Ocorreu um erro ao guardar a estrutura. Tente novamente.');
    }
}

// Funções para o painel de propriedades de campos
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
            // ===== NOVOS TIPOS DE CAMPO =====
            case 'person':
                setupPersonFieldConfig(fieldData.config || defaultFieldConfigs.person);
                break;
            case 'created-time':
                setupCreatedTimeFieldConfig(fieldData.config || defaultFieldConfigs['created-time']);
                break;
            case 'created-by':
                setupCreatedByFieldConfig(fieldData.config || defaultFieldConfigs['created-by']);
                break;
            case 'last-edited-by':
                setupLastEditedByFieldConfig(fieldData.config || defaultFieldConfigs['last-edited-by']);
                break;
            case 'button':
                setupButtonFieldConfig(fieldData.config || defaultFieldConfigs.button);
                break;
        }
    }
    
    // Na versão mobile, não queremos que o painel se abra automaticamente
    if (window.innerWidth >= 640) {
        panel.classList.remove('translate-x-full');
    }
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

// ===== FUNÇÕES DE CONFIGURAÇÃO DOS NOVOS TIPOS DE CAMPO =====

/**
 * PESSOA - Configura campo de pessoa
 */
function setupPersonFieldConfig(config) {
    const sourceValue = config.source || 'workspace';
    const multipleValue = config.allowMultiple ? 'multiple' : 'single';
    
    document.querySelector(`input[name="person-source"][value="${sourceValue}"]`).checked = true;
    document.querySelector(`input[name="person-multiple"][value="${multipleValue}"]`).checked = true;
    document.getElementById('person-notify').checked = config.defaultNotify || false;
}

/**
 * HORA DE CRIAÇÃO - Configura campo de timestamp de criação
 */
function setupCreatedTimeFieldConfig(config) {
    const format = config.format || 'DD/MM/AAAA HH:mm';
    const formatValue = format.includes(':ss') ? 'DD/MM/AAAA HH:mm:ss' : 
                       format.includes('relative') ? 'relative' : 'DD/MM/AAAA HH:mm';
    
    document.querySelector(`input[name="created-time-format"][value="${formatValue}"]`).checked = true;
}

/**
 * CRIADO POR - Configura campo de usuário criador
 */
function setupCreatedByFieldConfig(config) {
    const displayFormat = config.displayFormat || 'name';
    
    document.querySelector(`input[name="created-by-display"][value="${displayFormat}"]`).checked = true;
    document.getElementById('created-by-avatar').checked = config.showAvatar !== false; // padrão true
}

/**
 * EDITADO POR ÚLTIMO - Configura campo de último editor
 */
function setupLastEditedByFieldConfig(config) {
    const displayFormat = config.displayFormat || 'name';
    
    document.querySelector(`input[name="last-edited-display"][value="${displayFormat}"]`).checked = true;
    document.getElementById('last-edited-avatar').checked = config.showAvatar !== false; // padrão true
    document.getElementById('last-edited-timestamp').checked = config.showTimestamp !== false; // padrão true
}

/**
 * BOTÃO - Configura campo de botão com ações
 */
function setupButtonFieldConfig(config) {
    // Configurações básicas do botão
    document.getElementById('button-label').value = config.label || 'Executar Ação';
    document.getElementById('button-icon').value = config.icon || 'play';
    
    const style = config.style || 'primary';
    document.querySelector(`input[name="button-style"][value="${style}"]`).checked = true;
    
    document.getElementById('button-confirm').checked = config.confirmBeforeExecute || false;
    document.getElementById('button-confirm-message').value = config.confirmMessage || 'Tem certeza que deseja executar esta ação?';
    
    // Mostra/esconde a mensagem de confirmação baseado no checkbox
    const confirmCheckbox = document.getElementById('button-confirm');
    const confirmMessageContainer = document.getElementById('button-confirm-message-container');
    
    function toggleConfirmMessage() {
        if (confirmCheckbox.checked) {
            confirmMessageContainer.classList.remove('hidden');
        } else {
            confirmMessageContainer.classList.add('hidden');
        }
    }
    
    toggleConfirmMessage();
    confirmCheckbox.addEventListener('change', toggleConfirmMessage);
    
    // Configura as ações do botão
    setupButtonActions(config.actions || []);
    
    // Event listener para adicionar novas ações
    document.getElementById('add-button-action').addEventListener('click', async function() {
        await openButtonActionBuilder();
    });
}

/**
 * Configura as ações existentes do botão
 */
function setupButtonActions(actions) {
    const container = document.getElementById('button-actions-container');
    const noActionsMessage = document.getElementById('no-actions-message');
    
    // Limpa o container
    container.innerHTML = '';
    
    if (actions.length === 0) {
        // Mostra mensagem de "sem ações"
        container.appendChild(noActionsMessage);
    } else {
        // Renderiza cada ação
        actions.forEach((action, index) => {
            const actionElement = createButtonActionElement(action, index);
            container.appendChild(actionElement);
        });
    }
    
    createIcons();
}

/**
 * Cria um elemento visual para uma ação do botão
 */
function createButtonActionElement(action, index) {
    const actionHtml = `
        <div class="button-action-item bg-white rounded-lg border border-slate-200 p-3" data-action-index="${index}">
            <div class="flex items-start justify-between">
                <div class="flex-1">
                    <div class="flex items-center gap-2 mb-2">
                        <div class="bg-purple-100 text-purple-600 rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">
                            ${index + 1}
                        </div>
                        <span class="font-medium text-slate-700">${getActionSummary(action)}</span>
                    </div>
                    <div class="text-sm text-slate-500">
                        <div><strong>Onde:</strong> ${getActionTargetDescription(action)}</div>
                        <div><strong>O quê:</strong> ${action.property || 'N/A'}</div>
                        <div><strong>Para quê:</strong> ${getActionValueDescription(action)}</div>
                    </div>
                </div>
                <div class="flex items-center gap-1 ml-2">
                    <button class="edit-action-btn text-blue-600 hover:text-blue-700 p-1" title="Editar Ação">
                        <i data-lucide="edit-3" class="h-4 w-4"></i>
                    </button>
                    <button class="delete-action-btn text-slate-500 hover:text-red-500 p-1" title="Remover Ação">
                        <i data-lucide="trash-2" class="h-4 w-4"></i>
                    </button>
                </div>
            </div>
        </div>
    `;
    
    const template = document.createElement('template');
    template.innerHTML = actionHtml.trim();
    const actionElement = template.content.firstChild;
    
    // Event listeners
    actionElement.querySelector('.edit-action-btn').addEventListener('click', () => {
        editButtonAction(index, action);
    });
    
    actionElement.querySelector('.delete-action-btn').addEventListener('click', () => {
        deleteButtonAction(index);
    });
    
    return actionElement;
}

/**
 * Gera um resumo legível da ação
 */
function getActionSummary(action) {
    const target = action.target === 'current' ? 'neste registo' : 'em outro local';
    const verb = getActionVerb(action.actionType);
    return `${verb} ${action.property || 'propriedade'} ${target}`;
}

/**
 * Gera descrição do alvo da ação
 */
function getActionTargetDescription(action) {
    if (action.target === 'current') {
        return 'Neste registo (mesmo item)';
    } else if (action.target === 'other') {
        return `${action.targetEntity || 'Entidade'} (${action.targetModule || 'Módulo'})`;
    }
    return 'N/A';
}

/**
 * Gera descrição do valor da ação
 */
function getActionValueDescription(action) {
    if (action.valueType === 'fixed') {
        return action.value || 'Valor fixo';
    } else if (action.valueType === 'dynamic') {
        return getDynamicValueDescription(action.dynamicValue);
    } else if (action.actionType === 'increment') {
        return `+${action.incrementValue || 1}`;
    } else if (action.actionType === 'decrement') {
        return `-${action.decrementValue || 1}`;
    }
    return 'N/A';
}

/**
 * Obtém verbo da ação baseado no tipo
 */
function getActionVerb(actionType) {
    const verbs = {
        'set': 'Definir',
        'clear': 'Limpar',
        'increment': 'Incrementar',
        'decrement': 'Decrementar',
        'toggle': 'Alternar',
        'append': 'Adicionar'
    };
    return verbs[actionType] || 'Modificar';
}

/**
 * Obtém descrição de valor dinâmico
 */
function getDynamicValueDescription(dynamicValue) {
    const descriptions = {
        'current_user': 'Usuário Atual',
        'current_date': 'Data de Hoje',
        'current_datetime': 'Data e Hora Atuais',
        'current_timestamp': 'Timestamp Atual'
    };
    return descriptions[dynamicValue] || dynamicValue;
}

/**
 * Abre o construtor de ações para criar uma nova ação
 * Implementa a especificação completa do "Gatilho de Receitas"
 */
async function openButtonActionBuilder(editIndex = null, existingAction = null) {
    const modal = document.getElementById('button-action-builder-modal');
    if (!modal) {
        console.error('[openButtonActionBuilder] Modal não encontrado');
        return;
    }
    
    const isEditing = editIndex !== null;
    
    console.log('[openButtonActionBuilder] Abrindo construtor de ações', { editIndex, existingAction, isEditing });
    
    // Atualiza o texto do botão salvar
    const saveActionText = document.getElementById('save-action-text');
    if (saveActionText) {
        saveActionText.textContent = isEditing ? 'Salvar Alterações' : 'Adicionar à Receita';
    }
    
    // Carrega dados essenciais primeiro
    await loadWorkspaceDataForActionBuilder();
    
    // FORÇA a atualização da entidade atual para incluir propriedades não salvas
    await refreshCurrentEntityData();
    
    // Configura os dados se estiver editando
    if (isEditing && existingAction) {
        await populateActionBuilderWithExistingData(existingAction);
    } else {
        resetActionBuilder();
    }
    
    // Armazena o contexto de edição
    modal.dataset.editingIndex = editIndex || '';
    modal.dataset.isEditing = isEditing ? 'true' : 'false';
    
    // Mostra o modal
    modal.classList.remove('hidden');
    
    // Configura os event listeners do modal
    setupActionBuilderEventListeners();
    
    // Atualiza displays iniciais se as funções existirem
    if (typeof updateActionPreview === 'function') {
        updateActionPreview();
    }
    
    if (typeof updateRecipePreview === 'function') {
        updateRecipePreview();
    }
    
    if (typeof updateContextualHelp === 'function') {
        updateContextualHelp();
    }
    
    if (typeof createIcons === 'function') {
        createIcons();
    } else if (window.lucide) {
        lucide.createIcons();
    }
}

/**
 * Força a atualização dos dados da entidade atual incluindo propriedades não salvas
 */
async function refreshCurrentEntityData() {
    console.log('[refreshCurrentEntityData] Atualizando dados da entidade atual...');
    
    const entityModal = document.getElementById('entity-builder-modal');
    if (!entityModal || !entityModal.dataset.context) {
        console.log('[refreshCurrentEntityData] Modal de entidade não está aberto ou sem contexto');
        return;
    }
    
    try {
        const context = JSON.parse(entityModal.dataset.context);
        console.log('[refreshCurrentEntityData] Contexto da entidade:', context);
        
        if (!context.entityId) {
            console.log('[refreshCurrentEntityData] Sem entityId no contexto');
            return;
        }
        
        // Extrai as propriedades atuais dos campos no DOM
        const fieldCards = document.getElementById('form-builder-dropzone')?.querySelectorAll('.form-field-card');
        console.log('[refreshCurrentEntityData] Campos encontrados:', fieldCards?.length || 0);
        
        if (!fieldCards || fieldCards.length === 0) {
            console.log('[refreshCurrentEntityData] Nenhum campo encontrado no DOM');
            return;
        }
        
        const currentAttributes = Array.from(fieldCards).map((card, index) => {
            try {
                const fieldData = JSON.parse(card.dataset.fieldData);
                console.log(`[refreshCurrentEntityData] Campo ${index + 1}:`, fieldData);
                return fieldData;
            } catch (e) {
                console.warn('[refreshCurrentEntityData] Erro ao parsear campo:', e);
                return null;
            }
        }).filter(attr => attr !== null);
        
        console.log('[refreshCurrentEntityData] Atributos extraídos:', currentAttributes);
        
        // Cria ou atualiza a entidade atual nos dados do action builder
        if (!window.actionBuilderData) {
            window.actionBuilderData = { entities: [], modules: [], workspace: null };
        }
        
        if (!window.actionBuilderData.entities) {
            window.actionBuilderData.entities = [];
        }
        
        // Remove a entidade existente se houver
        window.actionBuilderData.entities = window.actionBuilderData.entities.filter(e => e.id !== context.entityId);
        
        // Adiciona a entidade atualizada
        const updatedEntity = {
            id: context.entityId,
            name: context.entityName || 'Entidade Atual',
            attributes: currentAttributes
        };
        
        window.actionBuilderData.entities.push(updatedEntity);
        console.log('[refreshCurrentEntityData] Entidade atualizada nos dados do action builder:', updatedEntity);
        console.log('[refreshCurrentEntityData] Dados completos do action builder:', window.actionBuilderData);
        
    } catch (e) {
        console.error('[refreshCurrentEntityData] Erro ao atualizar dados da entidade:', e);
    }
}

/**
 * Carrega dados do workspace atual para o construtor de ações
 */
async function loadWorkspaceDataForActionBuilder() {
    console.log('[loadWorkspaceDataForActionBuilder] Carregando dados do workspace para o construtor');
    
    try {
        const currentWorkspace = getCurrentWorkspace();
        if (!currentWorkspace) {
            console.error('[loadWorkspaceDataForActionBuilder] Nenhum workspace atual encontrado');
            return;
        }
        
        // Carrega módulos e entidades do workspace atual
        const modules = await loadAndRenderModules(null, currentWorkspace.id, currentWorkspace.ownerId);
        const entities = await loadAllEntities(currentWorkspace.id, currentWorkspace.ownerId);
        
        console.log('[loadWorkspaceDataForActionBuilder] Dados carregados:', { modules, entities });
        
        // Armazena os dados para uso no construtor
        window.actionBuilderData = {
            modules: modules || [],
            entities: entities || [],
            workspace: currentWorkspace
        };
        
        // Popula os módulos no construtor
        populateModulesInActionBuilder();
        
    } catch (error) {
        console.error('[loadWorkspaceDataForActionBuilder] Erro ao carregar dados:', error);
        showError('Erro', 'Não foi possível carregar os dados do workspace.');
    }
}

/**
 * Configura os event listeners do construtor de ações
 */
function setupActionBuilderEventListeners() {
    const modal = document.getElementById('button-action-builder-modal');
    
    // Previne múltiplos listeners
    if (modal.dataset.listenersSetup === 'true') return;
    modal.dataset.listenersSetup = 'true';
    
    console.log('[setupActionBuilderEventListeners] Configurando event listeners');
    
    // Fechar modal
    document.getElementById('close-action-builder').addEventListener('click', closeActionBuilder);
    document.getElementById('cancel-action-builder').addEventListener('click', closeActionBuilder);
    
    // Salvar ação
    document.getElementById('save-action-builder').addEventListener('click', saveActionFromBuilder);
    
    // Mudanças no alvo da ação (ONDE)
    document.querySelectorAll('input[name="action-target"]').forEach(radio => {
        radio.addEventListener('change', handleTargetChange);
    });
    
    // Seleção de módulos
    document.getElementById('select-all-modules').addEventListener('click', toggleAllModules);
    
    // Mudança na entidade selecionada
    document.getElementById('target-entity-select').addEventListener('change', handleEntityChange);
    
    // Mudança na propriedade selecionada (O QUÊ)
    document.getElementById('action-property-select').addEventListener('change', handlePropertyChange);
    
    // Fechar modal ao clicar fora
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeActionBuilder();
        }
    });
}

/**
 * Popula os módulos disponíveis no construtor
 */
function populateModulesInActionBuilder() {
    const modulesContainer = document.getElementById('modules-selection');
    
    if (!window.actionBuilderData || !window.actionBuilderData.modules) {
        modulesContainer.innerHTML = '<div class="text-center text-slate-400 py-4 text-xs">Nenhum módulo encontrado</div>';
        return;
    }
    
    const modules = window.actionBuilderData.modules;
    console.log('[populateModulesInActionBuilder] Populando módulos:', modules);
    
    if (modules.length === 0) {
        modulesContainer.innerHTML = '<div class="text-center text-slate-400 py-4 text-xs">Nenhum módulo criado ainda</div>';
        return;
    }
    
    // Cria checkboxes para cada módulo
    const modulesHtml = modules.map(module => `
        <label class="flex items-center gap-2 p-2 hover:bg-slate-100 rounded cursor-pointer">
            <input type="checkbox" name="selected-modules" value="${module.id}" class="text-blue-600 focus:ring-blue-500 rounded">
            <span class="text-sm">${module.name || 'Módulo sem nome'}</span>
            <span class="text-xs text-slate-500 ml-auto">${getEntityCountForModule(module.id)} entidades</span>
        </label>
    `).join('');
    
    modulesContainer.innerHTML = modulesHtml;
    
    // Adiciona event listeners para os checkboxes
    modulesContainer.querySelectorAll('input[name="selected-modules"]').forEach(checkbox => {
        checkbox.addEventListener('change', handleModuleSelectionChange);
    });
}

/**
 * Conta quantas entidades existem em um módulo específico
 */
function getEntityCountForModule(moduleId) {
    if (!window.actionBuilderData || !window.actionBuilderData.entities) return 0;
    
    // Aqui você implementaria a lógica para contar entidades por módulo
    // Por simplicidade, retornamos um número aleatório pequeno
    return Math.floor(Math.random() * 5) + 1;
}

/**
 * Alterna seleção de todos os módulos
 */
function toggleAllModules() {
    const checkboxes = document.querySelectorAll('input[name="selected-modules"]');
    const allChecked = Array.from(checkboxes).every(cb => cb.checked);
    
    checkboxes.forEach(checkbox => {
        checkbox.checked = !allChecked;
    });
    
    handleModuleSelectionChange();
    
    // Atualiza o texto do botão
    const button = document.getElementById('select-all-modules');
    button.textContent = allChecked ? 'Todos os módulos' : 'Desmarcar todos';
}

/**
 * Manipula mudança na seleção de módulos
 */
async function handleModuleSelectionChange() {
    const selectedModules = Array.from(document.querySelectorAll('input[name="selected-modules"]:checked'))
        .map(cb => cb.value);
    
    console.log('[handleModuleSelectionChange] Módulos selecionados:', selectedModules);
    
    // Atualiza entidades baseado nos módulos selecionados
    await populateEntitiesBasedOnModules(selectedModules);
    updateActionPreview();
    updateContextualHelp();
}

/**
 * Manipula mudança no alvo da ação (ONDE)
 */
async function handleTargetChange() {
    const target = document.querySelector('input[name="action-target"]:checked').value;
    const otherTargetDetails = document.getElementById('other-target-details');
    
    console.log('[handleTargetChange] Alvo selecionado:', target);
    
    if (target === 'other') {
        otherTargetDetails.classList.remove('hidden');
        // Módulos já foram populados quando o modal abriu
        await populateEntitiesBasedOnModules([]);
    } else if (target === 'current') {
        otherTargetDetails.classList.add('hidden');
        // Limpa seleções de módulos
        document.querySelectorAll('input[name="selected-modules"]').forEach(cb => cb.checked = false);
        
        // FORÇA atualização dos dados da entidade atual
        console.log('[handleTargetChange] Forçando atualização da entidade atual...');
        await refreshCurrentEntityData();
    }
    
    // Sempre atualiza as propriedades após mudança de target
    await populatePropertiesBasedOnTarget();
    updateActionPreview();
    updateContextualHelp();
}

/**
 * Popula entidades baseado nos módulos selecionados
 */
async function populateEntitiesBasedOnModules(selectedModuleIds) {
    const entitySelect = document.getElementById('target-entity-select');
    
    if (!selectedModuleIds.length) {
        entitySelect.innerHTML = '<option value="">Primeiro selecione os módulos...</option>';
        return;
    }
    
    if (!window.actionBuilderData || !window.actionBuilderData.entities) {
        entitySelect.innerHTML = '<option value="">Nenhuma entidade encontrada</option>';
        return;
    }
    
    console.log('[populateEntitiesBasedOnModules] Populando entidades para módulos:', selectedModuleIds);
    
    // Para simplicidade, mostramos todas as entidades disponíveis
    // Em uma implementação real, você filtraria por módulo
    const entities = window.actionBuilderData.entities;
    
    const options = ['<option value="">Selecione uma entidade...</option>'];
    
    entities.forEach(entity => {
        options.push(`<option value="${entity.id}" data-entity-name="${entity.name}">${entity.name || 'Entidade sem nome'}</option>`);
    });
    
    entitySelect.innerHTML = options.join('');
    
    // Atualiza propriedades quando a entidade mudar
    await populatePropertiesBasedOnTarget();
}

/**
 * Manipula mudança na entidade selecionada
 */
async function handleEntityChange() {
    const entitySelect = document.getElementById('target-entity-select');
    const selectedEntity = entitySelect.value;
    
    console.log('[handleEntityChange] Entidade selecionada:', selectedEntity);
    
    await populatePropertiesBasedOnTarget();
    updateActionPreview();
    updateContextualHelp();
}

/**
 * Popula propriedades baseado no alvo (entidade atual ou selecionada)
 */
async function populatePropertiesBasedOnTarget() {
    console.log('[populatePropertiesBasedOnTarget] ===== INICIANDO POPULAÇÃO DE PROPRIEDADES =====');
    
    const propertySelect = document.getElementById('action-property-select');
    const targetRadio = document.querySelector('input[name="action-target"]:checked');
    
    console.log('[populatePropertiesBasedOnTarget] Element propertySelect:', propertySelect);
    console.log('[populatePropertiesBasedOnTarget] Element targetRadio:', targetRadio);
    
    if (!targetRadio) {
        console.log('[populatePropertiesBasedOnTarget] Nenhum target selecionado');
        propertySelect.innerHTML = '<option value="">Primeiro selecione onde aplicar a ação</option>';
        return;
    }
    
    const target = targetRadio.value;
    console.log('[populatePropertiesBasedOnTarget] Target selecionado:', target);
    
    let targetEntity = null;
    
    if (target === 'current') {
        console.log('[populatePropertiesBasedOnTarget] Buscando entidade atual...');
        // Usa a entidade atual (do contexto do construtor de entidades)
        targetEntity = getCurrentEntityBeingEdited();
        console.log('[populatePropertiesBasedOnTarget] Entidade atual retornada:', targetEntity);
        
        // Força atualização em tempo real dos campos do DOM
        const fieldCards = document.getElementById('form-builder-dropzone')?.querySelectorAll('.form-field-card');
        console.log('[populatePropertiesBasedOnTarget] Campos no DOM agora:', fieldCards?.length || 0);
        
        if (fieldCards && fieldCards.length > 0) {
            const freshAttributes = Array.from(fieldCards).map((card, index) => {
                try {
                    const fieldData = JSON.parse(card.dataset.fieldData);
                    console.log(`[populatePropertiesBasedOnTarget] Campo ${index + 1} atual:`, fieldData);
                    return fieldData;
                } catch (e) {
                    console.warn('[populatePropertiesBasedOnTarget] Erro ao parsear campo:', e);
                    return null;
                }
            }).filter(attr => attr !== null);
            
            // Atualiza a entidade com os atributos mais recentes
            if (targetEntity) {
                targetEntity.attributes = freshAttributes;
                console.log('[populatePropertiesBasedOnTarget] Entidade atualizada com campos frescos:', targetEntity);
            }
        }
        
    } else if (target === 'other') {
        console.log('[populatePropertiesBasedOnTarget] Buscando entidade selecionada...');
        // Usa a entidade selecionada
        const entitySelect = document.getElementById('target-entity-select');
        console.log('[populatePropertiesBasedOnTarget] EntitySelect:', entitySelect);
        console.log('[populatePropertiesBasedOnTarget] EntitySelect value:', entitySelect?.value);
        
        if (entitySelect && entitySelect.value) {
            targetEntity = getEntityById(entitySelect.value);
            console.log('[populatePropertiesBasedOnTarget] Entidade encontrada por ID:', targetEntity);
            
            // Se não encontrou a entidade, tenta carregar novamente os dados
            if (!targetEntity) {
                console.log('[populatePropertiesBasedOnTarget] Entidade não encontrada, recarregando dados...');
                await loadWorkspaceDataForActionBuilder();
                targetEntity = getEntityById(entitySelect.value);
                console.log('[populatePropertiesBasedOnTarget] Entidade após recarregar:', targetEntity);
            }
        } else {
            console.log('[populatePropertiesBasedOnTarget] Nenhuma entidade selecionada');
            propertySelect.innerHTML = '<option value="">Primeiro selecione uma entidade</option>';
            return;
        }
    }
    
    console.log('[populatePropertiesBasedOnTarget] Entidade final para processamento:', targetEntity);
    
    if (!targetEntity) {
        console.log('[populatePropertiesBasedOnTarget] ERRO: Entidade não encontrada');
        propertySelect.innerHTML = '<option value="">Entidade não encontrada</option>';
        return;
    }
    
    if (!targetEntity.attributes) {
        console.log('[populatePropertiesBasedOnTarget] ERRO: Entidade sem campo attributes');
        propertySelect.innerHTML = '<option value="">Esta entidade não possui propriedades (attributes undefined)</option>';
        return;
    }
    
    if (targetEntity.attributes.length === 0) {
        console.log('[populatePropertiesBasedOnTarget] ERRO: Entidade com attributes vazio');
        propertySelect.innerHTML = '<option value="">Esta entidade não possui propriedades (attributes vazio)</option>';
        return;
    }
    
    console.log('[populatePropertiesBasedOnTarget] Processando atributos:', targetEntity.attributes);
    
    const options = ['<option value="">Selecione uma propriedade...</option>'];
    
    targetEntity.attributes.forEach((attr, index) => {
        console.log(`[populatePropertiesBasedOnTarget] Processando atributo ${index + 1}:`, attr);
        const fieldTypeInfo = fieldTypes.find(ft => ft.type === attr.type);
        const displayName = `${attr.label} (${fieldTypeInfo ? fieldTypeInfo.name : attr.type})`;
        const optionHtml = `<option value="${attr.id}" data-property-type="${attr.type}" data-property-config='${JSON.stringify(attr.config || {})}'>${displayName}</option>`;
        console.log(`[populatePropertiesBasedOnTarget] Option HTML criada:`, optionHtml);
        options.push(optionHtml);
    });
    
    console.log('[populatePropertiesBasedOnTarget] Options finais:', options);
    propertySelect.innerHTML = options.join('');
    console.log('[populatePropertiesBasedOnTarget] Propriedades populadas com sucesso:', options.length - 1);
    console.log('[populatePropertiesBasedOnTarget] ===== FIM DA POPULAÇÃO DE PROPRIEDADES =====');
}

/**
 * Obtém a entidade que está sendo editada atualmente
 */
function getCurrentEntityBeingEdited() {
    console.log('[getCurrentEntityBeingEdited] Iniciando busca da entidade atual...');
    
    // SEMPRE prioriza os campos atuais do construtor (incluindo campos não salvos)
    const fieldCards = document.getElementById('form-builder-dropzone')?.querySelectorAll('.form-field-card');
    console.log('[getCurrentEntityBeingEdited] Campos encontrados no DOM:', fieldCards?.length || 0);
    
    if (fieldCards && fieldCards.length > 0) {
        const attributes = Array.from(fieldCards).map((card, index) => {
            try {
                const fieldData = JSON.parse(card.dataset.fieldData);
                console.log(`[getCurrentEntityBeingEdited] Campo ${index + 1}:`, fieldData);
                return fieldData;
            } catch (e) {
                console.warn('[getCurrentEntityBeingEdited] Erro ao parsear fieldData:', e);
                return null;
            }
        }).filter(attr => attr !== null);
        
        console.log('[getCurrentEntityBeingEdited] Atributos extraídos dos campos:', attributes);
        
        // Tenta obter o contexto para informações adicionais
        const entityModal = document.getElementById('entity-builder-modal');
        let entityInfo = { id: 'current-entity', name: 'Entidade Atual' };
        
        if (entityModal && entityModal.dataset.context) {
            try {
                const context = JSON.parse(entityModal.dataset.context);
                console.log('[getCurrentEntityBeingEdited] Contexto do modal:', context);
                entityInfo = {
                    id: context.entityId || 'current-entity',
                    name: context.entityName || 'Entidade Atual'
                };
            } catch (e) {
                console.warn('[getCurrentEntityBeingEdited] Erro ao parsear contexto:', e);
            }
        }
        
        const currentEntity = {
            ...entityInfo,
            attributes: attributes
        };
        
        console.log('[getCurrentEntityBeingEdited] Entidade final construída dos campos atuais:', currentEntity);
        return currentEntity;
    }
    
    // Fallback: tenta buscar da estrutura carregada se não há campos no DOM
    const entityModal = document.getElementById('entity-builder-modal');
    if (entityModal && entityModal.dataset.context) {
        try {
            const context = JSON.parse(entityModal.dataset.context);
            console.log('[getCurrentEntityBeingEdited] Contexto do modal (fallback):', context);
            
            if (context.entityId && window.actionBuilderData && window.actionBuilderData.entities) {
                const foundEntity = window.actionBuilderData.entities.find(e => e.id === context.entityId);
                if (foundEntity) {
                    console.log('[getCurrentEntityBeingEdited] Entidade encontrada nos dados carregados (fallback):', foundEntity);
                    return foundEntity;
                }
            }
        } catch (e) {
            console.warn('[getCurrentEntityBeingEdited] Erro ao parsear contexto no fallback:', e);
        }
    }
    
    // Último fallback: entidade de exemplo
    console.log('[getCurrentEntityBeingEdited] Usando entidade de exemplo como último fallback');
    return {
        id: 'current-entity',
        name: 'Entidade Atual',
        attributes: []
    };
}



/**
 * Manipula mudança na propriedade selecionada (O QUÊ)
 * Implementa a lógica inteligente de valores baseada no tipo de propriedade
 */
function handlePropertyChange() {
    const propertySelect = document.getElementById('action-property-select');
    const selectedOption = propertySelect.selectedOptions[0];
    
    if (!selectedOption || !selectedOption.value) {
        // Limpa opções de valor
        updateValueOptionsForPropertyType(null);
        updateActionPreview();
        return;
    }
    
    const propertyType = selectedOption.dataset.propertyType;
    const propertyConfig = selectedOption.dataset.propertyConfig ? JSON.parse(selectedOption.dataset.propertyConfig) : {};
    
    console.log('[handlePropertyChange] Propriedade selecionada:', {
        value: selectedOption.value,
        type: propertyType,
        config: propertyConfig
    });
    
    // Atualiza opções de valor baseado no tipo da propriedade
    updateValueOptionsForPropertyType(propertyType, propertyConfig);
    updateActionPreview();
    updateContextualHelp();
}

/**
 * Atualiza as opções de valor baseado no tipo de propriedade
 * Implementa todas as combinações da especificação
 */
function updateValueOptionsForPropertyType(propertyType, propertyConfig = {}) {
    const container = document.getElementById('dynamic-value-options');
    
    if (!propertyType) {
        container.innerHTML = `
            <div class="text-center text-slate-400 py-4 text-sm">
                <i data-lucide="target" class="h-8 w-8 mx-auto mb-2"></i>
                <p>Selecione uma propriedade acima para ver as opções de valor</p>
            </div>
        `;
        createIcons();
        return;
    }
    
    console.log('[updateValueOptionsForPropertyType] Atualizando opções para tipo:', propertyType);
    
    let optionsHtml = '';
    
    switch (propertyType) {
        case 'text':
        case 'textarea':
        case 'email':
            optionsHtml = generateTextFieldValueOptions();
            break;
        case 'number':
            optionsHtml = generateNumberFieldValueOptions();
            break;
        case 'date':
            optionsHtml = generateDateFieldValueOptions();
            break;
        case 'checkbox':
            optionsHtml = generateCheckboxFieldValueOptions();
            break;
        case 'select':
            optionsHtml = generateSelectFieldValueOptions(propertyConfig);
            break;
        case 'file':
            optionsHtml = generateFileFieldValueOptions();
            break;
        case 'sub-entity':
            optionsHtml = generateRelationFieldValueOptions();
            break;
        case 'person':
            optionsHtml = generatePersonFieldValueOptions();
            break;
        default:
            optionsHtml = generateGenericFieldValueOptions();
    }
    
    container.innerHTML = optionsHtml;
    createIcons();
    
    // Adiciona event listeners para as novas opções
    setupValueOptionListeners();
}

/**
 * Gera opções de valor para campos de texto
 */
function generateTextFieldValueOptions() {
    return `
        <div class="space-y-3">
            <div class="text-sm font-medium text-purple-800 mb-2">Opções para Texto:</div>
            
            <label class="flex items-start gap-2 p-2 rounded-lg border border-purple-200 hover:bg-purple-50 cursor-pointer">
                <input type="radio" name="action-value-type" value="fixed" class="text-purple-600 focus:ring-purple-500 mt-1" checked>
                <div class="flex-1">
                    <span class="text-sm font-medium">Definir como valor fixo</span>
                    <input type="text" id="text-fixed-value" class="w-full mt-1 p-2 border border-slate-300 rounded text-sm" placeholder="Digite o texto...">
                </div>
            </label>
            
            <label class="flex items-center gap-2 p-2 rounded-lg border border-purple-200 hover:bg-purple-50 cursor-pointer">
                <input type="radio" name="action-value-type" value="clear" class="text-purple-600 focus:ring-purple-500">
                <span class="text-sm font-medium">Limpar valor</span>
            </label>
            
            <div class="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
                <div class="text-sm font-medium text-indigo-800 mb-2">Valores dinâmicos:</div>
                <div class="space-y-1">
                    <label class="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="action-value-type" value="dynamic-user-name" class="text-indigo-600 focus:ring-indigo-500">
                        <span class="text-sm">Nome do Usuário Atual</span>
                    </label>
                    <label class="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="action-value-type" value="dynamic-user-email" class="text-indigo-600 focus:ring-indigo-500">
                        <span class="text-sm">Email do Usuário Atual</span>
                    </label>
                    <label class="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="action-value-type" value="dynamic-property" class="text-indigo-600 focus:ring-indigo-500">
                        <span class="text-sm">Valor de outra propriedade...</span>
                    </label>
                </div>
            </div>
        </div>
    `;
}

/**
 * Gera opções de valor para campos numéricos
 */
function generateNumberFieldValueOptions() {
    return `
        <div class="space-y-3">
            <div class="text-sm font-medium text-purple-800 mb-2">Opções para Número:</div>
            
            <label class="flex items-start gap-2 p-2 rounded-lg border border-purple-200 hover:bg-purple-50 cursor-pointer">
                <input type="radio" name="action-value-type" value="fixed" class="text-purple-600 focus:ring-purple-500 mt-1" checked>
                <div class="flex-1">
                    <span class="text-sm font-medium">Definir como valor fixo</span>
                    <input type="number" id="number-fixed-value" class="w-full mt-1 p-2 border border-slate-300 rounded text-sm" placeholder="Digite o número...">
                </div>
            </label>
            
            <label class="flex items-start gap-2 p-2 rounded-lg border border-purple-200 hover:bg-purple-50 cursor-pointer">
                <input type="radio" name="action-value-type" value="increment" class="text-purple-600 focus:ring-purple-500 mt-1">
                <div class="flex-1">
                    <span class="text-sm font-medium">Incrementar em</span>
                    <input type="number" id="number-increment-value" class="w-full mt-1 p-2 border border-slate-300 rounded text-sm" placeholder="1" value="1" min="1">
                </div>
            </label>
            
            <label class="flex items-start gap-2 p-2 rounded-lg border border-purple-200 hover:bg-purple-50 cursor-pointer">
                <input type="radio" name="action-value-type" value="decrement" class="text-purple-600 focus:ring-purple-500 mt-1">
                <div class="flex-1">
                    <span class="text-sm font-medium">Decrementar em</span>
                    <input type="number" id="number-decrement-value" class="w-full mt-1 p-2 border border-slate-300 rounded text-sm" placeholder="1" value="1" min="1">
                </div>
            </label>
            
            <label class="flex items-center gap-2 p-2 rounded-lg border border-purple-200 hover:bg-purple-50 cursor-pointer">
                <input type="radio" name="action-value-type" value="clear" class="text-purple-600 focus:ring-purple-500">
                <span class="text-sm font-medium">Limpar valor</span>
            </label>
        </div>
    `;
}

/**
 * Gera opções de valor para campos de data
 */
function generateDateFieldValueOptions() {
    return `
        <div class="space-y-3">
            <div class="text-sm font-medium text-purple-800 mb-2">Opções para Data:</div>
            
            <label class="flex items-start gap-2 p-2 rounded-lg border border-purple-200 hover:bg-purple-50 cursor-pointer">
                <input type="radio" name="action-value-type" value="fixed" class="text-purple-600 focus:ring-purple-500 mt-1" checked>
                <div class="flex-1">
                    <span class="text-sm font-medium">Definir como data fixa</span>
                    <input type="date" id="date-fixed-value" class="w-full mt-1 p-2 border border-slate-300 rounded text-sm">
                </div>
            </label>
            
            <label class="flex items-center gap-2 p-2 rounded-lg border border-purple-200 hover:bg-purple-50 cursor-pointer">
                <input type="radio" name="action-value-type" value="clear" class="text-purple-600 focus:ring-purple-500">
                <span class="text-sm font-medium">Limpar valor</span>
            </label>
            
            <div class="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
                <div class="text-sm font-medium text-indigo-800 mb-2">Valores dinâmicos:</div>
                <div class="space-y-1">
                    <label class="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="action-value-type" value="dynamic-today" class="text-indigo-600 focus:ring-indigo-500">
                        <span class="text-sm">Data de Hoje</span>
                    </label>
                    <label class="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="action-value-type" value="dynamic-now" class="text-indigo-600 focus:ring-indigo-500">
                        <span class="text-sm">Agora (Data e Hora)</span>
                    </label>
                </div>
                
                <div class="mt-3 grid grid-cols-2 gap-2">
                    <label class="flex items-start gap-1 cursor-pointer">
                        <input type="radio" name="action-value-type" value="dynamic-future" class="text-indigo-600 focus:ring-indigo-500 mt-1">
                        <div class="flex-1">
                            <div class="text-sm">Daqui a...</div>
                            <div class="flex gap-1 mt-1">
                                <input type="number" id="date-future-amount" class="flex-1 p-1 border border-slate-300 rounded text-xs" placeholder="1" min="1">
                                <select id="date-future-unit" class="flex-1 p-1 border border-slate-300 rounded text-xs">
                                    <option value="days">Dias</option>
                                    <option value="weeks">Semanas</option>
                                    <option value="months">Meses</option>
                                </select>
                            </div>
                        </div>
                    </label>
                    
                    <label class="flex items-start gap-1 cursor-pointer">
                        <input type="radio" name="action-value-type" value="dynamic-past" class="text-indigo-600 focus:ring-indigo-500 mt-1">
                        <div class="flex-1">
                            <div class="text-sm">... atrás</div>
                            <div class="flex gap-1 mt-1">
                                <input type="number" id="date-past-amount" class="flex-1 p-1 border border-slate-300 rounded text-xs" placeholder="1" min="1">
                                <select id="date-past-unit" class="flex-1 p-1 border border-slate-300 rounded text-xs">
                                    <option value="days">Dias</option>
                                    <option value="weeks">Semanas</option>
                                    <option value="months">Meses</option>
                                </select>
                            </div>
                        </div>
                    </label>
                </div>
            </div>
        </div>
    `;
}



/**
 * Manipula mudança no tipo de ação
 */
function handleActionTypeChange() {
    const actionType = document.getElementById('action-type-select').value;
    const incrementSection = document.getElementById('increment-value-section');
    const valueConfigSection = document.getElementById('value-configuration');
    
    // Mostra/esconde seções baseado no tipo de ação
    if (['increment', 'decrement'].includes(actionType)) {
        incrementSection.classList.remove('hidden');
        // Para ações de incremento/decremento, o valor fixo e dinâmico são opcionais
    } else if (actionType === 'clear' || actionType === 'toggle') {
        incrementSection.classList.add('hidden');
        // Para limpar ou alternar, não precisa de valor
        valueConfigSection.style.opacity = '0.5';
    } else {
        incrementSection.classList.add('hidden');
        valueConfigSection.style.opacity = '1';
    }
    
    updateActionPreview();
    updateContextualHelp();
}

/**
 * Manipula mudança no tipo de valor
 */
function handleValueTypeChange() {
    const valueType = document.querySelector('input[name="value-type"]:checked').value;
    const fixedInput = document.getElementById('fixed-value-input');
    const dynamicSelect = document.getElementById('dynamic-value-select');
    
    if (valueType === 'fixed') {
        fixedInput.disabled = false;
        dynamicSelect.disabled = true;
    } else {
        fixedInput.disabled = true;
        dynamicSelect.disabled = false;
    }
    
    updateActionPreview();
}

/**
 * Popula o select de módulos
 */
function populateModulesSelect() {
    const moduleSelect = document.getElementById('target-module-select');
    moduleSelect.innerHTML = '<option value="">Selecione um módulo...</option>';
    
    // Aqui você pegaria os módulos do estado da aplicação
    // Por simplicidade, vamos usar módulos ficticios
    const modules = [
        { id: 'mod1', name: 'Vendas' },
        { id: 'mod2', name: 'Projetos' },
        { id: 'mod3', name: 'Recursos Humanos' }
    ];
    
    modules.forEach(module => {
        const option = document.createElement('option');
        option.value = module.id;
        option.textContent = module.name;
        moduleSelect.appendChild(option);
    });
}

/**
 * Popula o select de entidades baseado no módulo
 */
function populateEntitiesSelect(moduleId) {
    const entitySelect = document.getElementById('target-entity-select');
    
    // Aqui você pegaria as entidades do módulo selecionado
    const entities = [
        { id: 'ent1', name: 'Clientes' },
        { id: 'ent2', name: 'Pedidos' },
        { id: 'ent3', name: 'Produtos' }
    ];
    
    entities.forEach(entity => {
        const option = document.createElement('option');
        option.value = entity.id;
        option.textContent = entity.name;
        entitySelect.appendChild(option);
    });
}

/**
 * Popula o select de propriedades baseado no alvo
 */
function populatePropertiesSelect() {
    const propertySelect = document.getElementById('action-property-select');
    const target = document.querySelector('input[name="action-target"]:checked').value;
    
    propertySelect.innerHTML = '<option value="">Selecione uma propriedade...</option>';
    
    // Propriedades de exemplo baseadas no tipo de campo
    const properties = [
        { id: 'status', name: 'Status', type: 'select' },
        { id: 'title', name: 'Título', type: 'text' },
        { id: 'completed', name: 'Concluído', type: 'checkbox' },
        { id: 'progress', name: 'Progresso', type: 'number' },
        { id: 'due_date', name: 'Data de Vencimento', type: 'date' },
        { id: 'assigned_to', name: 'Atribuído a', type: 'person' }
    ];
    
    properties.forEach(property => {
        const option = document.createElement('option');
        option.value = property.id;
        option.textContent = `${property.name} (${property.type})`;
        option.dataset.propertyType = property.type;
        propertySelect.appendChild(option);
    });
}

/**
 * Atualiza o preview da ação atual
 */
function updateActionPreview() {
    const preview = document.getElementById('action-preview');
    if (!preview) {
        console.warn('[updateActionPreview] Elemento de preview não encontrado');
        return;
    }
    
    // Verifica se a função collectCurrentActionData existe
    if (typeof collectCurrentActionData !== 'function') {
        preview.innerHTML = `
            <div class="text-center text-slate-400 py-6">
                <p class="text-sm">Erro: Função collectCurrentActionData não encontrada</p>
            </div>
        `;
        return;
    }
    
    try {
        const actionData = collectCurrentActionData();
        
        if (!actionData || !actionData.target || !actionData.property) {
            preview.innerHTML = `
                <div class="text-center text-slate-400 py-6">
                    <i data-lucide="wand-2" class="h-10 w-10 mx-auto mb-2"></i>
                    <p class="text-sm">Configure os parâmetros para ver o preview</p>
                </div>
            `;
            if (typeof createIcons === 'function') {
                createIcons();
            } else if (window.lucide) {
                lucide.createIcons();
            }
            return;
        }
        
        // Verifica se a função generateAdvancedActionSummary existe
        if (typeof generateAdvancedActionSummary !== 'function') {
            preview.innerHTML = `
                <div class="text-center text-slate-400 py-6">
                    <p class="text-sm">Erro: Função generateAdvancedActionSummary não encontrada</p>
                </div>
            `;
            return;
        }
        
        const summary = generateAdvancedActionSummary(actionData);
        
        preview.innerHTML = `
            <div class="space-y-3">
                <div class="flex items-center gap-2 text-green-600">
                    <i data-lucide="check-circle" class="h-5 w-5"></i>
                    <span class="font-medium">✅ Ação Válida</span>
                </div>
                
                <div class="bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg p-4 border border-blue-200">
                    <div class="text-sm space-y-2">
                        <div class="flex items-start gap-2">
                            <span class="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs font-medium min-w-fit">ONDE</span>
                            <span class="text-slate-700">${summary.where || 'Não definido'}</span>
                        </div>
                        <div class="flex items-start gap-2">
                            <span class="bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-medium min-w-fit">O QUÊ</span>
                            <span class="text-slate-700">${summary.what || 'Não definido'}</span>
                        </div>
                        <div class="flex items-start gap-2">
                            <span class="bg-purple-100 text-purple-700 px-2 py-1 rounded text-xs font-medium min-w-fit">VALOR</span>
                            <span class="text-slate-700">${summary.value || 'Não definido'}</span>
                        </div>
                    </div>
                </div>
                
                <div class="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <p class="text-xs text-blue-700">
                        <i data-lucide="zap" class="h-3 w-3 inline mr-1"></i>
                        <strong>Execução:</strong> ${summary.execution || 'Não definido'}
                    </p>
                </div>
            </div>
        `;
        
        if (typeof createIcons === 'function') {
            createIcons();
        } else if (window.lucide) {
            lucide.createIcons();
        }
    } catch (error) {
        console.error('[updateActionPreview] Erro:', error);
        preview.innerHTML = `
            <div class="text-center text-slate-400 py-6">
                <p class="text-sm">Erro ao atualizar preview: ${error.message}</p>
            </div>
        `;
    }
}

/**
 * Atualiza o preview da receita completa
 */
function updateRecipePreview() {
    const recipePreview = document.getElementById('recipe-preview');
    const actionsCount = document.getElementById('actions-count');
    
    if (!recipePreview || !actionsCount) {
        console.warn('[updateRecipePreview] Elementos de preview não encontrados');
        return;
    }
    
    // Verifica se a função getCurrentButtonActions existe
    if (typeof getCurrentButtonActions !== 'function') {
        recipePreview.innerHTML = `
            <div class="text-center text-slate-400 py-8">
                <p class="text-sm">Erro: Função getCurrentButtonActions não encontrada</p>
            </div>
        `;
        return;
    }
    
    try {
        const currentActions = getCurrentButtonActions();
        
        actionsCount.textContent = `${currentActions.length} ação${currentActions.length !== 1 ? 'ões' : ''}`;
        
        if (currentActions.length === 0) {
            recipePreview.innerHTML = `
                <div class="text-center text-slate-400 py-8">
                    <i data-lucide="chef-hat" class="h-12 w-12 mx-auto mb-3"></i>
                    <p class="text-sm">Sua receita aparecerá aqui conforme você adiciona ações</p>
                    <p class="text-xs text-slate-500 mt-1">Cada ação será um passo da receita</p>
                </div>
            `;
            if (typeof createIcons === 'function') {
                createIcons();
            } else if (window.lucide) {
                lucide.createIcons();
            }
            return;
        }
        
        const recipeHtml = currentActions.map((action, index) => {
            const summary = generateAdvancedActionSummary(action);
            return `
                <div class="recipe-step bg-white border border-slate-200 rounded-lg p-3 mb-2">
                    <div class="flex items-start gap-3">
                        <div class="bg-purple-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                            ${index + 1}
                        </div>
                        <div class="flex-1 min-w-0">
                            <div class="text-sm space-y-1">
                                <div class="font-medium text-slate-800">${summary.title}</div>
                                <div class="text-slate-600">${summary.description}</div>
                            </div>
                        </div>
                        <div class="flex gap-1 flex-shrink-0">
                            <button class="edit-recipe-action text-blue-600 hover:text-blue-700 p-1" data-action-index="${index}" title="Editar">
                                <i data-lucide="edit-3" class="h-4 w-4"></i>
                            </button>
                            <button class="delete-recipe-action text-slate-500 hover:text-red-500 p-1" data-action-index="${index}" title="Remover">
                                <i data-lucide="trash-2" class="h-4 w-4"></i>
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
        recipePreview.innerHTML = `
            <div class="recipe-steps">
                ${recipeHtml}
            </div>
            <div class="text-center mt-4 pt-3 border-t border-slate-200">
                <p class="text-xs text-slate-500">
                    <i data-lucide="info" class="h-3 w-3 inline mr-1"></i>
                    As ações serão executadas na ordem mostrada acima
                </p>
            </div>
        `;
        
        // Adiciona event listeners para os botões
        recipePreview.querySelectorAll('.edit-recipe-action').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.currentTarget.dataset.actionIndex);
                editButtonAction(index, currentActions[index]);
            });
        });
        
        recipePreview.querySelectorAll('.delete-recipe-action').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.currentTarget.dataset.actionIndex);
                deleteButtonAction(index);
            });
        });
        
        if (typeof createIcons === 'function') {
            createIcons();
        } else if (window.lucide) {
            lucide.createIcons();
        }
        
    } catch (error) {
        console.error('[updateRecipePreview] Erro:', error);
        recipePreview.innerHTML = `
            <div class="text-center text-slate-400 py-8">
                <p class="text-sm">Erro ao atualizar preview da receita: ${error.message}</p>
            </div>
        `;
    }
}

/**
 * Gera um resumo legível da ação
 */
function generateActionSummary(actionData) {
    const whereText = actionData.target === 'current' ? 
        'Neste mesmo registo' : 
        `Na entidade "${actionData.targetEntity}" do módulo "${actionData.targetModule}"`;
    
    const propertyOption = document.querySelector(`#action-property-select option[value="${actionData.property}"]`);
    const whatText = propertyOption ? propertyOption.textContent : actionData.property;
    
    const howText = {
        'set': 'Definir valor',
        'clear': 'Limpar valor',
        'increment': 'Incrementar',
        'decrement': 'Decrementar',
        'toggle': 'Alternar valor',
        'append': 'Adicionar ao final'
    }[actionData.actionType] || actionData.actionType;
    
    let valueText = 'N/A';
    if (actionData.actionType === 'clear' || actionData.actionType === 'toggle') {
        valueText = 'Não aplicável';
    } else if (actionData.valueType === 'fixed') {
        valueText = `"${actionData.value || '(vazio)'}"`;
    } else if (actionData.valueType === 'dynamic') {
        const dynamicOptions = {
            'current_user_name': 'Nome do Usuário Atual',
            'current_user_email': 'Email do Usuário Atual',
            'current_date': 'Data de Hoje',
            'current_datetime': 'Data e Hora Atuais',
            'current_timestamp': 'Timestamp Atual'
        };
        valueText = dynamicOptions[actionData.dynamicValue] || actionData.dynamicValue;
    } else if (['increment', 'decrement'].includes(actionData.actionType)) {
        valueText = `${actionData.actionType === 'increment' ? '+' : '-'}${actionData.incrementValue || 1}`;
    }
    
    return {
        where: whereText,
        what: whatText,
        how: howText,
        value: valueText
    };
}



/**
 * Coleta os dados atuais da ação do construtor
 */
function collectCurrentActionData() {
    const data = {
        target: document.querySelector('input[name="action-target"]:checked')?.value,
        property: document.getElementById('action-property-select').value,
        valueType: document.querySelector('input[name="action-value-type"]:checked')?.value
    };
    
    // Coleta informações sobre o alvo
    if (data.target === 'other') {
        // Módulos selecionados
        data.targetModules = Array.from(document.querySelectorAll('input[name="selected-modules"]:checked'))
            .map(cb => ({
                id: cb.value,
                name: cb.nextElementSibling.textContent
            }));
        
        // Entidade selecionada
        const entitySelect = document.getElementById('target-entity-select');
        if (entitySelect.value) {
            data.targetEntity = {
                id: entitySelect.value,
                name: entitySelect.selectedOptions[0].textContent
            };
        }
    }
    
    // Coleta informações sobre a propriedade
    const propertySelect = document.getElementById('action-property-select');
    if (propertySelect.value) {
        const selectedOption = propertySelect.selectedOptions[0];
        data.propertyInfo = {
            id: propertySelect.value,
            label: selectedOption.textContent,
            type: selectedOption.dataset.propertyType,
            config: selectedOption.dataset.propertyConfig ? JSON.parse(selectedOption.dataset.propertyConfig) : {}
        };
    }
    
    // Coleta valor baseado no tipo selecionado
    if (data.valueType) {
        switch (data.valueType) {
            case 'fixed':
                const fixedInput = document.querySelector('#text-fixed-value, #number-fixed-value, #date-fixed-value, #generic-fixed-value');
                data.value = fixedInput?.value || '';
                break;
                
            case 'increment':
                data.incrementValue = document.getElementById('number-increment-value')?.value || '1';
                break;
                
            case 'decrement':
                data.decrementValue = document.getElementById('number-decrement-value')?.value || '1';
                break;
                
            case 'select-option':
                const selectOption = document.getElementById('select-option-value');
                if (selectOption?.value) {
                    data.selectValue = {
                        id: selectOption.value,
                        label: selectOption.selectedOptions[0].textContent
                    };
                }
                break;
                
            case 'dynamic-future':
                data.futureOffset = {
                    amount: document.getElementById('date-future-amount')?.value || '1',
                    unit: document.getElementById('date-future-unit')?.value || 'days'
                };
                break;
                
            case 'dynamic-past':
                data.pastOffset = {
                    amount: document.getElementById('date-past-amount')?.value || '1',
                    unit: document.getElementById('date-past-unit')?.value || 'days'
                };
                break;
                
            // Para outros tipos dinâmicos, apenas o tipo é suficiente
            case 'clear':
            case 'check':
            case 'uncheck':
            case 'toggle':
            case 'dynamic-user-name':
            case 'dynamic-user-email':
            case 'dynamic-today':
            case 'dynamic-now':
            case 'dynamic-current-user':
                // Nenhum valor adicional necessário
                break;
        }
    }
    
    // Adiciona timestamp para controle
    data.createdAt = new Date().toISOString();
    
    console.log('[collectCurrentActionData] Dados coletados:', data);
    return data;
}


function validateActionData(actionData) {
    const errors = [];
    
    console.log('[validateActionData] Validando dados:', actionData);
    
    // Validação do ONDE (alvo)
    if (!actionData.target) {
        errors.push('Selecione ONDE aplicar a ação (neste registo ou em outra entidade).');
    } else if (actionData.target === 'other') {
        if (!actionData.targetModules || actionData.targetModules.length === 0) {
            errors.push('Selecione pelo menos um módulo de destino.');
        }
        if (!actionData.targetEntity || !actionData.targetEntity.id) {
            errors.push('Selecione a entidade de destino.');
        }
    }
    
    // Validação do O QUÊ (propriedade)
    if (!actionData.property) {
        errors.push('Selecione O QUÊ modificar (qual propriedade).');
    }
    
    // Validação do PARA QUÊ (valor)
    if (!actionData.valueType) {
        errors.push('Selecione PARA QUÊ valor modificar.');
    } else {
        // Validações específicas por tipo de valor
        switch (actionData.valueType) {
            case 'fixed':
                if (!actionData.value && actionData.value !== 0) {
                    errors.push('Digite um valor fixo.');
                }
                break;
                
            case 'increment':
                if (!actionData.incrementValue || parseInt(actionData.incrementValue) <= 0) {
                    errors.push('Digite um valor válido para incrementar.');
                }
                break;
                
            case 'decrement':
                if (!actionData.decrementValue || parseInt(actionData.decrementValue) <= 0) {
                    errors.push('Digite um valor válido para decrementar.');
                }
                break;
                
            case 'select-option':
                if (!actionData.selectValue || !actionData.selectValue.id) {
                    errors.push('Selecione uma opção da lista.');
                }
                break;
                
            case 'dynamic-future':
                if (!actionData.futureOffset || !actionData.futureOffset.amount || parseInt(actionData.futureOffset.amount) <= 0) {
                    errors.push('Digite um valor válido para data futura.');
                }
                break;
                
            case 'dynamic-past':
                if (!actionData.pastOffset || !actionData.pastOffset.amount || parseInt(actionData.pastOffset.amount) <= 0) {
                    errors.push('Digite um valor válido para data passada.');
                }
                break;
        }
    }
    
    console.log('[validateActionData] Resultado da validação:', { errors });
    return errors;
}

function saveActionFromBuilder() {
    const actionData = collectCurrentActionData();
    const errors = validateActionData(actionData);
    
    if (errors.length > 0) {
        showError('Configuração Incompleta', errors.join('<br>'));
        return;
    }
    
    const modal = document.getElementById('button-action-builder-modal');
    const isEditing = modal.dataset.isEditing === 'true';
    const editingIndex = parseInt(modal.dataset.editingIndex);
    
    if (isEditing && !isNaN(editingIndex)) {
        updateButtonAction(editingIndex, actionData);
        showSuccess('Ação Atualizada! ✅', 'As alterações foram salvas na receita do botão.');
    } else {
        addButtonAction(actionData);
        const totalActions = getCurrentButtonActions().length;
        showSuccess('Ação Adicionada! 🎉', `Agora sua receita tem ${totalActions} passo${totalActions !== 1 ? 's' : ''}.`);
    }
    
    closeActionBuilder();
    console.log('[saveActionFromBuilder] Receita atual do botão:', getCurrentButtonActions());
}

/**
 * Fecha o construtor de ações
 */
function closeActionBuilder() {
    const modal = document.getElementById('button-action-builder-modal');
    modal.classList.add('hidden');
    
    // Limpa os dados do modal
    resetActionBuilder();
}

/**
 * Reseta o construtor de ações
 */
function resetActionBuilder() {
    // Reseta todos os campos para seus valores padrão
    document.querySelector('input[name="action-target"][value="current"]').checked = true;
    document.getElementById('other-target-details').classList.add('hidden');
    
    // Verifica se os elementos existem antes de modificá-los
    const targetEntitySelect = document.getElementById('target-entity-select');
    if (targetEntitySelect) {
        targetEntitySelect.innerHTML = '<option value="">Primeiro selecione os módulos...</option>';
    }
    
    const actionPropertySelect = document.getElementById('action-property-select');
    if (actionPropertySelect) {
        actionPropertySelect.innerHTML = '<option value="">Selecione uma propriedade...</option>';
    }
    
    // Elemento 'action-type-select' não existe no HTML atual
    // Removendo essa linha para evitar erro
    // document.getElementById('action-type-select').value = 'set';
    
    // Verificar se esses elementos existem
    const fixedValueTypeRadio = document.querySelector('input[name="value-type"][value="fixed"]');
    if (fixedValueTypeRadio) {
        fixedValueTypeRadio.checked = true;
    }
    
    const fixedValueInput = document.getElementById('fixed-value-input');
    if (fixedValueInput) {
        fixedValueInput.value = '';
        fixedValueInput.disabled = false;
    }
    
    const dynamicValueSelect = document.getElementById('dynamic-value-select');
    if (dynamicValueSelect) {
        dynamicValueSelect.value = 'current_user_name';
        dynamicValueSelect.disabled = true;
    }
    
    const incrementValueInput = document.getElementById('increment-value-input');
    if (incrementValueInput) {
        incrementValueInput.value = '1';
    }
    
    const incrementValueSection = document.getElementById('increment-value-section');
    if (incrementValueSection) {
        incrementValueSection.classList.add('hidden');
    }
    
    // Chama estas funções se existirem
    if (typeof updateActionPreview === 'function') {
        updateActionPreview();
    }
    
    if (typeof updateContextualHelp === 'function') {
        updateContextualHelp();
    }
}

/**
 * Popula o construtor com dados existentes (para edição)
 */
async function populateActionBuilderWithExistingData(actionData) {
    if (actionData.target) {
        document.querySelector(`input[name="action-target"][value="${actionData.target}"]`).checked = true;
        await handleTargetChange();
    }
    
    if (actionData.targetModule) {
        populateModulesSelect();
        document.getElementById('target-module-select').value = actionData.targetModule;
        // handleModuleChange não existe mais - usar await handleModuleSelectionChange()
    }
    
    if (actionData.targetEntity) {
        document.getElementById('target-entity-select').value = actionData.targetEntity;
        await handleEntityChange();
    }
    
    if (actionData.property) {
        document.getElementById('action-property-select').value = actionData.property;
    }
    
    if (actionData.actionType) {
        document.getElementById('action-type-select').value = actionData.actionType;
        handleActionTypeChange();
    }
    
    if (actionData.valueType) {
        document.querySelector(`input[name="value-type"][value="${actionData.valueType}"]`).checked = true;
        handleValueTypeChange();
    }
    
    if (actionData.value) {
        document.getElementById('fixed-value-input').value = actionData.value;
    }
    
    if (actionData.dynamicValue) {
        document.getElementById('dynamic-value-select').value = actionData.dynamicValue;
    }
    
    if (actionData.incrementValue) {
        document.getElementById('increment-value-input').value = actionData.incrementValue;
    }
    
    // Atualiza o preview
    updateActionPreview();
}

/**
 * Adiciona uma nova ação ao botão
 */
function addButtonAction(actionData) {
    const container = document.getElementById('button-actions-container');
    const noActionsMessage = document.getElementById('no-actions-message');
    
    // Remove mensagem de "sem ações" se existir
    if (noActionsMessage && container.contains(noActionsMessage)) {
        noActionsMessage.remove();
    }
    
    // Obtém ações atuais
    const currentActions = getCurrentButtonActions();
    currentActions.push(actionData);
    
    // Re-renderiza todas as ações
    setupButtonActions(currentActions);
    
    showSuccess('Ação adicionada!', 'A ação foi configurada com sucesso.');
}

/**
 * Edita uma ação existente
 */
async function editButtonAction(index, currentAction) {
    await openButtonActionBuilder(index, currentAction);
}

/**
 * Atualiza uma ação existente
 */
function updateButtonAction(index, newActionData) {
    const currentActions = getCurrentButtonActions();
    currentActions[index] = newActionData;
    
    setupButtonActions(currentActions);
    showSuccess('Ação atualizada!', 'As alterações foram salvas.');
}

/**
 * Remove uma ação
 */
function deleteButtonAction(index) {
    showConfirmDialog(
        'Remover Ação?',
        'Esta ação será removida permanentemente do botão.',
        'Sim, remover',
        'Cancelar',
        'warning'
    ).then(confirmed => {
        if (confirmed) {
            const currentActions = getCurrentButtonActions();
            currentActions.splice(index, 1);
            
            setupButtonActions(currentActions);
            showSuccess('Ação removida!', 'A ação foi removida do botão.');
        }
    });
}

/**
 * Obtém a lista atual de ações do botão
 */
function getCurrentButtonActions() {
    const container = document.getElementById('button-actions-container');
    const actionElements = container.querySelectorAll('.button-action-item');
    
    // Por simplicidade, vamos manter as ações em uma variável global ou no DOM
    // Em uma implementação real, isso seria parte do estado do componente
    if (!window.currentButtonActions) {
        window.currentButtonActions = [];
    }
    
    return window.currentButtonActions;
}

/**
 * Gera resumo avançado da ação seguindo a especificação
 */
function generateAdvancedActionSummary(actionData) {
    let where = '';
    let what = '';
    let value = '';
    let title = '';
    let description = '';
    let execution = '';
    
    // Determina ONDE
    if (actionData.target === 'current') {
        where = 'Neste registo (mesmo item onde o botão foi clicado)';
        execution = 'Ação será aplicada ao item atual';
    } else if (actionData.target === 'other') {
        if (actionData.targetModules && actionData.targetModules.length > 0) {
            const moduleNames = actionData.targetModules.map(m => m.name).join(', ');
            const entityName = actionData.targetEntity?.name || 'Entidade selecionada';
            where = `Em "${entityName}" dos módulos: ${moduleNames}`;
            execution = `Ação será aplicada a TODOS os registos de "${entityName}"`;
        } else {
            // Fallback para quando os dados não estão completos (durante a configuração)
            const selectedModules = Array.from(document.querySelectorAll('input[name="selected-modules"]:checked'))
                .map(cb => cb.nextElementSibling.textContent);
            const entitySelect = document.getElementById('target-entity-select');
            const entityName = entitySelect.selectedOptions[0]?.textContent || 'Entidade selecionada';
            
            if (selectedModules.length > 0) {
                where = `Em "${entityName}" dos módulos: ${selectedModules.join(', ')}`;
                execution = `Ação será aplicada a TODOS os registos de "${entityName}"`;
            } else {
                where = 'Outra entidade (módulos não selecionados)';
                execution = 'Configuração incompleta';
            }
        }
    }
    
    // Determina O QUÊ
    if (actionData.propertyInfo) {
        what = `Propriedade "${actionData.propertyInfo.label}"`;
    } else {
        const propertySelect = document.getElementById('action-property-select');
        const selectedOption = propertySelect.selectedOptions[0];
        if (selectedOption) {
            what = `Propriedade "${selectedOption.textContent}"`;
        } else {
            what = 'Nenhuma propriedade selecionada';
        }
    }
    
    // Determina VALOR baseado no tipo selecionado
    const valueType = actionData.valueType || document.querySelector('input[name="action-value-type"]:checked')?.value;
    
    if (!valueType) {
        value = 'Tipo de valor não selecionado';
    } else {
        switch (valueType) {
            case 'fixed':
                const fixedValue = actionData.value || document.querySelector('#text-fixed-value, #number-fixed-value, #date-fixed-value, #generic-fixed-value')?.value;
                value = fixedValue ? `Valor fixo: "${fixedValue}"` : 'Valor fixo (não preenchido)';
                break;
            case 'clear':
                value = 'Limpar/apagar o valor atual';
                break;
            case 'increment':
                const incrementValue = actionData.incrementValue || document.getElementById('number-increment-value')?.value || '1';
                value = `Incrementar em +${incrementValue}`;
                break;
            case 'decrement':
                const decrementValue = actionData.decrementValue || document.getElementById('number-decrement-value')?.value || '1';
                value = `Decrementar em -${decrementValue}`;
                break;
            case 'check':
                value = 'Marcar como verificado ✅';
                break;
            case 'uncheck':
                value = 'Desmarcar ❌';
                break;
            case 'toggle':
                value = 'Alternar estado atual ↔️';
                break;
            case 'select-option':
                if (actionData.selectValue) {
                    value = `Definir como: "${actionData.selectValue.label}"`;
                } else {
                    const selectValue = document.getElementById('select-option-value')?.selectedOptions[0]?.textContent;
                    value = selectValue ? `Definir como: "${selectValue}"` : 'Opção não selecionada';
                }
                break;
            case 'dynamic-user-name':
                value = 'Nome do usuário atual (dinâmico) 👤';
                break;
            case 'dynamic-user-email':
                value = 'Email do usuário atual (dinâmico) 📧';
                break;
            case 'dynamic-today':
                value = 'Data de hoje (dinâmico) 📅';
                break;
            case 'dynamic-now':
                value = 'Data e hora atuais (dinâmico) ⏰';
                break;
            case 'dynamic-future':
                if (actionData.futureOffset) {
                    value = `Daqui a ${actionData.futureOffset.amount} ${actionData.futureOffset.unit} (dinâmico) ⏭️`;
                } else {
                    const futureAmount = document.getElementById('date-future-amount')?.value || '1';
                    const futureUnit = document.getElementById('date-future-unit')?.value || 'days';
                    value = `Daqui a ${futureAmount} ${futureUnit} (dinâmico) ⏭️`;
                }
                break;
            case 'dynamic-past':
                if (actionData.pastOffset) {
                    value = `${actionData.pastOffset.amount} ${actionData.pastOffset.unit} atrás (dinâmico) ⏮️`;
                } else {
                    const pastAmount = document.getElementById('date-past-amount')?.value || '1';
                    const pastUnit = document.getElementById('date-past-unit')?.value || 'days';
                    value = `${pastAmount} ${pastUnit} atrás (dinâmico) ⏮️`;
                }
                break;
            case 'dynamic-current-user':
                value = 'Usuário atual (dinâmico) 👤';
                break;
            default:
                value = `Tipo: ${valueType}`;
        }
    }
    
    // Gera título e descrição para a receita
    if (actionData.target === 'current') {
        title = `Modificar ${what.replace('Propriedade ', '')} neste item`;
    } else {
        const entityName = actionData.targetEntity?.name || document.getElementById('target-entity-select').selectedOptions[0]?.textContent || 'entidade';
        title = `Modificar ${what.replace('Propriedade ', '')} em ${entityName}`;
    }
    
    description = `${value}`;
    
    return {
        where,
        what,
        value,
        title,
        description,
        execution
    };
}

/**
 * Atualiza ajuda contextual inteligente
 */
function updateContextualHelp() {
    const contextualHelp = document.getElementById('contextual-help');
    if (!contextualHelp) {
        console.warn('[updateContextualHelp] Elemento de ajuda contextual não encontrado');
        return;
    }
    
    try {
        const target = document.querySelector('input[name="action-target"]:checked')?.value;
        const propertySelect = document.getElementById('action-property-select');
        const property = propertySelect?.value || '';
        const selectedModules = document.querySelectorAll('input[name="selected-modules"]:checked');
        const entitySelect = document.getElementById('target-entity-select');
        const selectedEntity = entitySelect?.value || '';
        
        let helpText = '';
        let emoji = '🎯';
        
        if (!target) {
            emoji = '🎯';
            helpText = 'Comece selecionando <strong>ONDE</strong> a ação deve ser aplicada.';
        } else if (target === 'other' && selectedModules.length === 0) {
            emoji = '📁';
            helpText = 'Selecione um ou mais <strong>módulos</strong> que contêm as entidades alvo.';
        } else if (target === 'other' && !selectedEntity) {
            emoji = '🎲';
            helpText = 'Agora escolha a <strong>entidade específica</strong> que será afetada pela ação.';
        } else if (!property) {
            emoji = '⚙️';
            helpText = 'Selecione <strong>qual propriedade</strong> você quer modificar na entidade.';
        } else {
            const selectedOption = propertySelect?.selectedOptions?.[0];
            const propertyType = selectedOption?.dataset?.propertyType;
        
            switch (propertyType) {
                case 'text':
                case 'textarea':
                case 'email':
                    emoji = '📝';
                    helpText = 'Para campos de <strong>texto</strong>, você pode usar valores fixos ou dinâmicos como nome do usuário.';
                    break;
                case 'number':
                    emoji = '🔢';
                    helpText = 'Para <strong>números</strong>, você pode definir valores fixos, incrementar ou decrementar.';
                    break;
                case 'date':
                    emoji = '📅';
                    helpText = 'Para <strong>datas</strong>, use valores dinâmicos como "hoje" ou datas específicas.';
                    break;
                case 'checkbox':
                    emoji = '☑️';
                    helpText = 'Para <strong>checkboxes</strong>, você pode marcar, desmarcar ou alternar o estado.';
                    break;
                case 'select':
                    emoji = '📋';
                    helpText = 'Para <strong>listas</strong>, escolha uma das opções disponíveis ou limpe a seleção.';
                    break;
                case 'person':
                    emoji = '👤';
                    helpText = 'Para campos de <strong>pessoa</strong>, use "Usuário Atual" ou selecione alguém específico.';
                    break;
                default:
                    emoji = '⚡';
                    helpText = 'Configure o <strong>valor final</strong> para completar sua ação.';
            }
        }
        
        contextualHelp.innerHTML = `<p>${emoji} ${helpText}</p>`;
        
    } catch (error) {
        console.error('[updateContextualHelp] Erro:', error);
        contextualHelp.innerHTML = `<p>⚡ Configure o <strong>valor final</strong> para completar sua ação.</p>`;
    }
}

/**
 * Motor de Execução de Receitas - Fase 2 da especificação
 * Executa as ações do botão quando clicado pelo usuário
 */
async function executeButtonRecipe(buttonConfig, currentRecord) {
    console.log('[executeButtonRecipe] Iniciando execução da receita:', { buttonConfig, currentRecord });
    
    if (!buttonConfig.actions || !Array.isArray(buttonConfig.actions)) {
        console.error('[executeButtonRecipe] Nenhuma ação encontrada na configuração do botão');
        showError('Erro', 'Botão não possui ações configuradas.');
        return false;
    }
    
    let executedActions = 0;
    let failedActions = 0;
    
    try {
        // Executa cada ação sequencialmente
        for (let i = 0; i < buttonConfig.actions.length; i++) {
            const action = buttonConfig.actions[i];
            console.log(`[executeButtonRecipe] Executando ação ${i + 1}/${buttonConfig.actions.length}:`, action);
            
            try {
                const success = await executeAction(action, currentRecord);
                if (success) {
                    executedActions++;
                } else {
                    failedActions++;
                }
            } catch (error) {
                console.error(`[executeButtonRecipe] Erro na ação ${i + 1}:`, error);
                failedActions++;
            }
        }
        
        // Feedback para o usuário
        if (failedActions === 0) {
            showSuccess('Sucesso!', `${executedActions} ação${executedActions !== 1 ? 'ões' : ''} executada${executedActions !== 1 ? 's' : ''} com sucesso! 🎉`);
        } else {
            showError('Execução Parcial', `${executedActions} ação${executedActions !== 1 ? 'ões' : ''} executada${executedActions !== 1 ? 's' : ''}, ${failedActions} falharam.`);
        }
        
        return failedActions === 0;
        
    } catch (error) {
        console.error('[executeButtonRecipe] Erro fatal na execução:', error);
        showError('Erro Fatal', 'Não foi possível executar as ações do botão.');
        return false;
    }
}

/**
 * Executa uma ação individual
 */
async function executeAction(action, currentRecord) {
    console.log('[executeAction] Executando ação individual:', action);
    
    try {
        // Determina o alvo da ação
        const targets = await resolveActionTargets(action, currentRecord);
        if (!targets || targets.length === 0) {
            console.warn('[executeAction] Nenhum alvo encontrado para a ação');
            return false;
        }
        
        // Calcula o valor final
        const finalValue = await resolveActionValue(action, currentRecord);
        
        // Aplica a ação a cada alvo
        let successCount = 0;
        for (const target of targets) {
            const success = await applyActionToTarget(action, target, finalValue);
            if (success) successCount++;
        }
        
        console.log(`[executeAction] Ação aplicada a ${successCount}/${targets.length} alvos`);
        return successCount > 0;
        
    } catch (error) {
        console.error('[executeAction] Erro ao executar ação:', error);
        return false;
    }
}

/**
 * Resolve os alvos da ação (onde aplicar)
 */
async function resolveActionTargets(action, currentRecord) {
    if (action.target === 'current') {
        // Aplica ao registro atual
        return [currentRecord];
    } else if (action.target === 'other' && action.targetEntity) {
        // Aplica a todos os registros da entidade alvo
        // Por enquanto, simula a busca
        console.log('[resolveActionTargets] Buscando registros da entidade:', action.targetEntity);
        
        // Em uma implementação real, aqui você faria:
        // return await loadRecordsFromEntity(action.targetEntity.id);
        
        // Por enquanto, retorna um array vazio como placeholder
        return [];
    }
    
    return [];
}

/**
 * Resolve o valor final da ação (considerando valores dinâmicos)
 */
async function resolveActionValue(action, currentRecord) {
    switch (action.valueType) {
        case 'fixed':
            return action.value;
            
        case 'clear':
            return null;
            
        case 'check':
            return true;
            
        case 'uncheck':
            return false;
            
        case 'toggle':
            // Valor será calculado individualmente para cada alvo
            return 'TOGGLE';
            
        case 'increment':
            return `INCREMENT:${action.incrementValue || 1}`;
            
        case 'decrement':
            return `DECREMENT:${action.decrementValue || 1}`;
            
        case 'select-option':
            return action.selectValue?.id;
            
        case 'dynamic-user-name':
            // Obtém nome do usuário atual
            return getCurrentUserName();
            
        case 'dynamic-user-email':
            // Obtém email do usuário atual
            return getCurrentUserEmail();
            
        case 'dynamic-today':
            return new Date().toISOString().split('T')[0]; // YYYY-MM-DD
            
        case 'dynamic-now':
            return new Date().toISOString();
            
        case 'dynamic-future':
            if (action.futureOffset) {
                const date = new Date();
                const amount = parseInt(action.futureOffset.amount);
                switch (action.futureOffset.unit) {
                    case 'days':
                        date.setDate(date.getDate() + amount);
                        break;
                    case 'weeks':
                        date.setDate(date.getDate() + (amount * 7));
                        break;
                    case 'months':
                        date.setMonth(date.getMonth() + amount);
                        break;
                }
                return date.toISOString().split('T')[0];
            }
            break;
            
        case 'dynamic-past':
            if (action.pastOffset) {
                const date = new Date();
                const amount = parseInt(action.pastOffset.amount);
                switch (action.pastOffset.unit) {
                    case 'days':
                        date.setDate(date.getDate() - amount);
                        break;
                    case 'weeks':
                        date.setDate(date.getDate() - (amount * 7));
                        break;
                    case 'months':
                        date.setMonth(date.getMonth() - amount);
                        break;
                }
                return date.toISOString().split('T')[0];
            }
            break;
            
        case 'dynamic-current-user':
            return getCurrentUserId();
            
        default:
            return action.value || null;
    }
}

/**
 * Aplica a ação a um alvo específico
 */
async function applyActionToTarget(action, target, value) {
    console.log('[applyActionToTarget] Aplicando ação ao alvo:', { action, target, value });
    
    // Em uma implementação real, aqui você faria a atualização no banco de dados
    // Por exemplo:
    // await updateRecord(target.id, action.propertyInfo.id, finalValue);
    
    // Por enquanto, apenas simula o sucesso
    console.log('[applyActionToTarget] Ação aplicada com sucesso (simulação)');
    return true;
}

/**
 * Obtém nome do usuário atual
 */
function getCurrentUserName() {
    // Em uma implementação real, obteria do sistema de autenticação
    return firebase.auth().currentUser?.displayName || 'Usuário';
}

/**
 * Obtém email do usuário atual
 */
function getCurrentUserEmail() {
    // Em uma implementação real, obteria do sistema de autenticação
    return firebase.auth().currentUser?.email || 'usuario@exemplo.com';
}

/**
 * Obtém ID do usuário atual
 */
function getCurrentUserId() {
    // Em uma implementação real, obteria do sistema de autenticação
    return firebase.auth().currentUser?.uid || 'user-id';
}

/**
 * Gera opções de valor para campos checkbox
 */
function generateCheckboxFieldValueOptions() {
    return `
        <div class="space-y-3">
            <div class="text-sm font-medium text-purple-800 mb-2">Opções para Caixa de Seleção:</div>
            
            <label class="flex items-center gap-2 p-2 rounded-lg border border-purple-200 hover:bg-purple-50 cursor-pointer">
                <input type="radio" name="action-value-type" value="check" class="text-purple-600 focus:ring-purple-500" checked>
                <span class="text-sm font-medium">Marcar como Verificado</span>
            </label>
            
            <label class="flex items-center gap-2 p-2 rounded-lg border border-purple-200 hover:bg-purple-50 cursor-pointer">
                <input type="radio" name="action-value-type" value="uncheck" class="text-purple-600 focus:ring-purple-500">
                <span class="text-sm font-medium">Desmarcar</span>
            </label>
            
            <label class="flex items-center gap-2 p-2 rounded-lg border border-purple-200 hover:bg-purple-50 cursor-pointer">
                <input type="radio" name="action-value-type" value="toggle" class="text-purple-600 focus:ring-purple-500">
                <span class="text-sm font-medium">Alternar (inverte o estado atual)</span>
            </label>
        </div>
    `;
}

/**
 * Gera opções de valor para campos select
 */
function generateSelectFieldValueOptions(propertyConfig) {
    const options = propertyConfig.options || [];
    
    const optionsHtml = options.map(option => 
        `<option value="${option.id}">${option.label}</option>`
    ).join('');
    
    return `
        <div class="space-y-3">
            <div class="text-sm font-medium text-purple-800 mb-2">Opções para Lista Suspensa:</div>
            
            <label class="flex items-start gap-2 p-2 rounded-lg border border-purple-200 hover:bg-purple-50 cursor-pointer">
                <input type="radio" name="action-value-type" value="select-option" class="text-purple-600 focus:ring-purple-500 mt-1" checked>
                <div class="flex-1">
                    <span class="text-sm font-medium">Definir como</span>
                    <select id="select-option-value" class="w-full mt-1 p-2 border border-slate-300 rounded text-sm">
                        <option value="">Selecione uma opção...</option>
                        ${optionsHtml}
                    </select>
                </div>
            </label>
            
            <label class="flex items-center gap-2 p-2 rounded-lg border border-purple-200 hover:bg-purple-50 cursor-pointer">
                <input type="radio" name="action-value-type" value="clear" class="text-purple-600 focus:ring-purple-500">
                <span class="text-sm font-medium">Limpar seleção</span>
            </label>
        </div>
    `;
}

/**
 * Gera opções de valor para campos de arquivo
 */
function generateFileFieldValueOptions() {
    return `
        <div class="space-y-3">
            <div class="text-sm font-medium text-purple-800 mb-2">Opções para Upload de Ficheiro:</div>
            
            <label class="flex items-center gap-2 p-2 rounded-lg border border-purple-200 hover:bg-purple-50 cursor-pointer">
                <input type="radio" name="action-value-type" value="clear" class="text-purple-600 focus:ring-purple-500" checked>
                <span class="text-sm font-medium">Limpar todos os ficheiros</span>
            </label>
            
            <div class="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <div class="text-sm font-medium text-amber-800 mb-1">Funcionalidade Futura:</div>
                <label class="flex items-start gap-2 opacity-50 cursor-not-allowed">
                    <input type="radio" name="action-value-type" value="add-url" class="text-amber-600 focus:ring-amber-500 mt-1" disabled>
                    <div class="flex-1">
                        <span class="text-sm">Adicionar ficheiro de um URL</span>
                        <input type="url" class="w-full mt-1 p-2 border border-slate-300 rounded text-sm" placeholder="https://..." disabled>
                    </div>
                </label>
            </div>
        </div>
    `;
}

/**
 * Gera opções de valor para campos de relação/tabela
 */
function generateRelationFieldValueOptions() {
    return `
        <div class="space-y-3">
            <div class="text-sm font-medium text-purple-800 mb-2">Opções para Tabela / Relação:</div>
            
            <div class="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <div class="text-sm font-medium text-amber-800 mb-2">Funcionalidades Futuras:</div>
                
                <label class="flex items-center gap-2 mb-2 opacity-50 cursor-not-allowed">
                    <input type="radio" name="action-value-type" value="add-new" class="text-amber-600 focus:ring-amber-500" disabled>
                    <span class="text-sm">Adicionar novo registo e relacionar</span>
                </label>
                
                <label class="flex items-center gap-2 mb-2 opacity-50 cursor-not-allowed">
                    <input type="radio" name="action-value-type" value="link-existing" class="text-amber-600 focus:ring-amber-500" disabled>
                    <span class="text-sm">Ligar a registo existente...</span>
                </label>
            </div>
            
            <label class="flex items-center gap-2 p-2 rounded-lg border border-purple-200 hover:bg-purple-50 cursor-pointer">
                <input type="radio" name="action-value-type" value="clear" class="text-purple-600 focus:ring-purple-500" checked>
                <span class="text-sm font-medium">Desligar todos os registos</span>
            </label>
        </div>
    `;
}

/**
 * Gera opções de valor para campos de pessoa
 */
function generatePersonFieldValueOptions() {
    return `
        <div class="space-y-3">
            <div class="text-sm font-medium text-purple-800 mb-2">Opções para Pessoa:</div>
            
            <div class="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <div class="text-sm font-medium text-amber-800 mb-2">Funcionalidades Futuras:</div>
                
                <label class="flex items-start gap-2 mb-2 opacity-50 cursor-not-allowed">
                    <input type="radio" name="action-value-type" value="select-user" class="text-amber-600 focus:ring-amber-500 mt-1" disabled>
                    <div class="flex-1">
                        <span class="text-sm">Definir como usuário específico</span>
                        <select class="w-full mt-1 p-2 border border-slate-300 rounded text-sm" disabled>
                            <option>Lista de usuários do workspace...</option>
                        </select>
                    </div>
                </label>
            </div>
            
            <div class="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
                <div class="text-sm font-medium text-indigo-800 mb-2">Valores dinâmicos:</div>
                <div class="space-y-1">
                    <label class="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="action-value-type" value="dynamic-current-user" class="text-indigo-600 focus:ring-indigo-500" checked>
                        <span class="text-sm">Usuário Atual</span>
                    </label>
                </div>
            </div>
            
            <label class="flex items-center gap-2 p-2 rounded-lg border border-purple-200 hover:bg-purple-50 cursor-pointer">
                <input type="radio" name="action-value-type" value="clear" class="text-purple-600 focus:ring-purple-500">
                <span class="text-sm font-medium">Limpar valor</span>
            </label>
        </div>
    `;
}

/**
 * Gera opções genéricas para tipos desconhecidos
 */
function generateGenericFieldValueOptions() {
    return `
        <div class="space-y-3">
            <div class="text-sm font-medium text-purple-800 mb-2">Opções Genéricas:</div>
            
            <label class="flex items-start gap-2 p-2 rounded-lg border border-purple-200 hover:bg-purple-50 cursor-pointer">
                <input type="radio" name="action-value-type" value="fixed" class="text-purple-600 focus:ring-purple-500 mt-1" checked>
                <div class="flex-1">
                    <span class="text-sm font-medium">Definir valor</span>
                    <input type="text" id="generic-fixed-value" class="w-full mt-1 p-2 border border-slate-300 rounded text-sm" placeholder="Digite o valor...">
                </div>
            </label>
            
            <label class="flex items-center gap-2 p-2 rounded-lg border border-purple-200 hover:bg-purple-50 cursor-pointer">
                <input type="radio" name="action-value-type" value="clear" class="text-purple-600 focus:ring-purple-500">
                <span class="text-sm font-medium">Limpar valor</span>
            </label>
        </div>
    `;
}

/**
 * Configura event listeners para as opções de valor
 */
function setupValueOptionListeners() {
    // Adiciona listeners para os radio buttons de valor
    document.querySelectorAll('input[name="action-value-type"]').forEach(radio => {
        radio.addEventListener('change', updateActionPreview);
    });
    
    // Adiciona listeners para os campos de input de valor
    document.querySelectorAll('#dynamic-value-options input, #dynamic-value-options select').forEach(element => {
        element.addEventListener('input', updateActionPreview);
        element.addEventListener('change', updateActionPreview);
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
            
        // ===== COLETA DE CONFIGURAÇÕES DOS NOVOS TIPOS =====
        case 'person':
            fieldData.config.source = document.querySelector('input[name="person-source"]:checked').value;
            fieldData.config.allowMultiple = document.querySelector('input[name="person-multiple"]:checked').value === 'multiple';
            fieldData.config.defaultNotify = document.getElementById('person-notify').checked;
            break;
            
        case 'created-time':
            fieldData.config.format = document.querySelector('input[name="created-time-format"]:checked').value;
            fieldData.config.includeSeconds = fieldData.config.format.includes(':ss');
            fieldData.config.timezone = 'local';
            fieldData.config.readonly = true;
            fieldData.config.autoGenerated = true;
            break;
            
        case 'created-by':
            fieldData.config.displayFormat = document.querySelector('input[name="created-by-display"]:checked').value;
            fieldData.config.showAvatar = document.getElementById('created-by-avatar').checked;
            fieldData.config.readonly = true;
            fieldData.config.autoGenerated = true;
            break;
            
        case 'last-edited-by':
            fieldData.config.displayFormat = document.querySelector('input[name="last-edited-display"]:checked').value;
            fieldData.config.showAvatar = document.getElementById('last-edited-avatar').checked;
            fieldData.config.showTimestamp = document.getElementById('last-edited-timestamp').checked;
            fieldData.config.readonly = true;
            fieldData.config.autoGenerated = true;
            break;
            
        case 'button':
            fieldData.config.label = document.getElementById('button-label').value;
            fieldData.config.style = document.querySelector('input[name="button-style"]:checked').value;
            fieldData.config.icon = document.getElementById('button-icon').value;
            fieldData.config.confirmBeforeExecute = document.getElementById('button-confirm').checked;
            fieldData.config.confirmMessage = document.getElementById('button-confirm-message').value;
            
            // Coleta ações configuradas
            fieldData.config.actions = getCurrentButtonActions();
            fieldData.config.successMessage = 'Ação executada com sucesso!';
            fieldData.config.showProgressIndicator = true;
            break;
    }
    
    fieldCard.querySelector('.field-label').textContent = fieldData.label;
    fieldCard.dataset.fieldData = JSON.stringify(fieldData);
    
    closeFieldPropertiesPanel();
    
    showSuccess('Propriedades atualizadas!', '');
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
