/**
 * Arquivo principal do Construktor
 * Coordena a inicialização dos módulos e a interação entre eles
 */

import { firebaseConfig, availableEntityIcons, fieldTypes, defaultFieldConfigs } from './config.js';
import { initAutenticacao, isUsuarioLogado, getUsuarioId } from './autenticacao.js';
import { initDatabase, loadAllEntities, loadAndRenderModules, loadDroppedEntitiesIntoModules, 
         loadStructureForEntity, createEntity, createModule, saveEntityToModule, deleteEntityFromModule,
         deleteEntity, deleteModule, saveEntityStructure, saveSubEntityStructure, saveModulesOrder } from './database.js';
import { initUI, createIcons, checkEmptyStates, showLoading, hideLoading, showSuccess, 
         showError, showConfirmDialog, showInputDialog } from './ui.js';
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
            // Não precisa mostrar erro aqui pois o módulo de autenticação
            // já vai redirecionar para a página de login
            hideLoading();
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
 * Carrega dados de uma área de trabalho (própria ou compartilhada)
 * @param {Object} workspace - Dados da área de trabalho
 */
async function loadWorkspaceData(workspace) {
    try {
        console.log('Carregando dados da área de trabalho:', workspace);
        showLoading('Carregando área de trabalho...');
        
        // Limpa dados anteriores
        document.getElementById('entity-list').innerHTML = '';
        document.getElementById('module-container').innerHTML = '';
        
        if (workspace.isShared) {
            // Carrega dados de uma área de trabalho compartilhada
            await loadSharedWorkspaceData(workspace);
        } else {
            // Carrega dados da própria área de trabalho
            await loadOwnWorkspaceData(workspace);
        }
        
        hideLoading();
        checkEmptyStates();
    } catch (error) {
        console.error('Erro ao carregar dados da área de trabalho:', error);
        hideLoading();
        showError('Erro', 'Não foi possível carregar os dados da área de trabalho.');
    }
}

/**
 * Carrega dados da própria área de trabalho
 * @param {Object} workspace - Dados da área de trabalho
 */
async function loadOwnWorkspaceData(workspace) {
    const workspaceId = workspace.id || 'default';
    
    // Carrega entidades
    await loadAllEntities(workspaceId);
    
    // Carrega e renderiza módulos
    await loadAndRenderModules(workspaceId);
    
    // Carrega entidades já arrastadas para os módulos
    await loadDroppedEntitiesIntoModules(workspaceId);
}

/**
 * Carrega dados de uma área de trabalho compartilhada
 * @param {Object} workspace - Dados da área de trabalho compartilhada
 */
async function loadSharedWorkspaceData(workspace) {
    const { loadSharedUserEntities, loadSharedUserModules, loadSharedModuleSchemas } = await import('./database.js');
    
    const workspaceId = workspace.id || 'default';
    const ownerId = workspace.ownerId;
    
    // Carrega entidades compartilhadas
    const sharedEntities = await loadSharedUserEntities(ownerId, workspaceId);
    sharedEntities.forEach(entity => renderEntityInLibrary(entity));
    
    // Carrega módulos compartilhados
    const sharedModules = await loadSharedUserModules(ownerId, workspaceId);
    sharedModules.forEach(module => renderModule(module));
    
    // Carrega entidades já arrastadas para os módulos compartilhados
    for (const module of sharedModules) {
        const schemas = await loadSharedModuleSchemas(ownerId, workspaceId, module.id);
        
        for (const entityId in schemas) {
            const schema = schemas[entityId];
            const entity = sharedEntities.find(e => e.id === entityId);
            
            if (entity) {
                renderEntityInModule(module.id, entity, schema);
            }
        }
    }
}

document.addEventListener('DOMContentLoaded', initApp);

// ---- Funções de Renderização ----
function renderEntityInLibrary(entity) {
    // Verifica se a entidade já existe na lista (para evitar duplicação)
    const existingCard = document.querySelector(`.entity-card[data-entity-id="${entity.id}"]`);
    if (existingCard) {
        console.log(`Entidade ${entity.name} (${entity.id}) já existe na biblioteca. Ignorando.`);
        return; // A entidade já está na lista, sair da função
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
    
    if (entity.id.startsWith('-')) { // Assumindo que IDs do Firebase começam com '-'
        clone.querySelector('.delete-custom-entity-btn').classList.remove('hidden');
    }
    
    list.appendChild(clone);
    
    // Garantir que os ícones sejam renderizados imediatamente
    if (window.lucide) {
        lucide.createIcons();
    } else {
        createIcons();
    }
    
    // Configurar Sortable.js para arrastar entidades da biblioteca
    if (list && !list._sortable) {
        list._sortable = new Sortable(list, { 
            group: { name: 'entities', pull: 'clone', put: false }, 
            sort: false, 
            animation: 150,
            ghostClass: 'sortable-ghost',
            chosenClass: 'sortable-chosen',
            dragClass: 'sortable-drag',
            delay: 50, // Delay para dispositivos móveis
            delayOnTouchOnly: true, // Aplicar delay apenas em touch
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
    
    // Adiciona classe de animação e a remove após a animação
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
    
    // Garantir que os ícones sejam renderizados imediatamente
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
    });
    createIcons();
    
    // Configurar Sortable.js para arrastar campos da caixa de ferramentas
    if (toolbox && !toolbox._sortable) {
        toolbox._sortable = new Sortable(toolbox, { 
            group: { name: 'fields', pull: 'clone', put: false }, 
            sort: false, 
            animation: 150,
            ghostClass: 'sortable-ghost',
            chosenClass: 'sortable-chosen',
            dragClass: 'sortable-drag',
            delay: 50, // Delay para dispositivos móveis
            delayOnTouchOnly: true, // Aplicar delay apenas em touch
        });
    }
}

function renderFormField(fieldData) {
    const dropzone = document.getElementById('form-builder-dropzone');
    if (!dropzone) return;
    
    const template = document.getElementById('form-field-template');
    const clone = template.content.cloneNode(true);
    const card = clone.querySelector('.form-field-card');
    
    // Gera um ID único para o elemento do DOM
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
        
        // Adicionar indicador visual para campos com configurações avançadas
        if (fieldData.config && Object.keys(fieldData.config).length > 0) {
            const label = clone.querySelector('.field-label');
            if (!fieldData.config.required) {
                label.textContent += ' (Configurado)';
            } else {
                label.textContent += ' *';  // Asterisco para campos obrigatórios
            }
        }
    }
    
    dropzone.appendChild(clone);
    
    // Adiciona classe de animação e a remove após a animação
    const newField = dropzone.lastElementChild;
    newField.classList.add('animate-pulse');
    setTimeout(() => newField.classList.remove('animate-pulse'), 2000);
    
    createIcons();
    
    // Verifica se o formulário está vazio
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
        // Em telas pequenas, mostrar apenas o último item
        if (window.innerWidth < 640) {
            const currentContext = JSON.parse(document.getElementById('entity-builder-modal').dataset.context);
            const currentTitleSpan = document.createElement('span');
            currentTitleSpan.className = 'font-semibold text-indigo-800';
            currentTitleSpan.textContent = currentContext.label || currentContext.entityName;
            breadcrumbContainer.appendChild(currentTitleSpan);
        } else {
            // Em telas maiores, mostrar toda a navegação
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
    if (!dropzone || dropzone._sortable) return;
    
    dropzone._sortable = new Sortable(dropzone, { 
        group: 'entities', 
        animation: 150, 
        onAdd: handleEntityDrop,
        ghostClass: 'sortable-ghost',
        chosenClass: 'sortable-chosen',
        dragClass: 'sortable-drag',
        delay: 50, // Delay para dispositivos móveis
        delayOnTouchOnly: true, // Aplicar delay apenas em touch
    });
}

function setupEventListeners() {
    // Configurar listeners para o container de módulos (para organizar a ordem)
    const moduleContainer = document.getElementById('module-container');
    if (moduleContainer && !moduleContainer._sortable) {
        moduleContainer._sortable = new Sortable(moduleContainer, {
            animation: 150,
            handle: '.module-quadro',
            ghostClass: 'sortable-ghost',
            chosenClass: 'sortable-chosen',
            dragClass: 'sortable-drag',
            delay: 150, // Delay para evitar arrastar acidentalmente em dispositivos móveis
            delayOnTouchOnly: true,
            onEnd: function(evt) {
                const moduleElements = document.querySelectorAll('.module-quadro');
                const newOrder = Array.from(moduleElements).map(el => el.dataset.moduleId);
                saveModulesOrder(newOrder);
            }
        });
    }

    // Delegação de eventos para botões de entidades e módulos
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
    
    // Botões principais
    const addNewEntityBtn = document.getElementById('add-new-entity-btn');
    if (addNewEntityBtn) {
        addNewEntityBtn.addEventListener('click', handleAddNewEntity);
    }
    
    const addNewModuleBtn = document.getElementById('add-new-module-btn');
    if (addNewModuleBtn) {
        addNewModuleBtn.addEventListener('click', handleAddNewModule);
    }
    
    const closeModalBtn = document.getElementById('close-modal-btn');
    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', closeModal);
    }
    
    const saveStructureBtn = document.getElementById('save-structure-btn');
    if (saveStructureBtn) {
        saveStructureBtn.addEventListener('click', saveCurrentStructure);
    }
    
    const modalBackBtn = document.getElementById('modal-back-btn');
    if (modalBackBtn) {
        modalBackBtn.addEventListener('click', handleModalBack);
    }
    
    // Botão adicional para estado vazio
    const emptyAddModuleBtn = document.getElementById('empty-add-module-btn');
    if (emptyAddModuleBtn) {
        emptyAddModuleBtn.addEventListener('click', handleAddNewModule);
    }
    
    // Botão flutuante para adicionar módulo em dispositivos móveis
    const mobileAddModuleBtn = document.getElementById('mobile-add-module-btn');
    if (mobileAddModuleBtn) {
        mobileAddModuleBtn.addEventListener('click', handleAddNewModule);
    }

    // Gerenciamento de campos no formulário
    const formBuilderDropzone = document.getElementById('form-builder-dropzone');
    if (formBuilderDropzone) {
        // Configurar Sortable.js para o formulário
        if (!formBuilderDropzone._sortable) {
            formBuilderDropzone._sortable = new Sortable(formBuilderDropzone, { 
                group: 'fields', 
                animation: 150, 
                onAdd: handleFieldDrop, 
                handle: '[data-lucide="grip-vertical"]',
                ghostClass: 'sortable-ghost',
                chosenClass: 'sortable-chosen',
                dragClass: 'sortable-drag',
                delay: 50, // Delay para dispositivos móveis
                delayOnTouchOnly: true, // Aplicar delay apenas em touch
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
                        
                        // Verifica se o formulário está vazio
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
    
    // Adicionar ouvinte de redimensionamento para atualizar a navegação do breadcrumb
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

    // Verifica se a entidade já existe neste módulo
    if (moduleEl.querySelector(`.dropped-entity-card[data-entity-id="${entityId}"]`)) {
        item.remove();
        showError('Entidade já existe!', `A entidade "${entityName}" já está presente neste módulo.`);
        return;
    }
    
    // Remove o item original e adiciona o cartão de entidade
    item.remove();
    
    // Cria e adiciona o cartão da entidade
    const template = document.getElementById('dropped-entity-card-template');
    const clone = template.content.cloneNode(true);
    const card = clone.querySelector('.dropped-entity-card');
    card.dataset.entityId = entityId;
    card.dataset.entityName = entityName;
    card.dataset.moduleId = moduleId;
    
    const iconEl = clone.querySelector('.entity-icon');
    if (entityIcon) {
       iconEl.setAttribute('data-lucide', entityIcon);
    } else {
       iconEl.style.display = 'none';
    }

    clone.querySelector('.entity-name').textContent = entityName;
    to.appendChild(clone);
    
    // Garantir que os ícones sejam renderizados imediatamente
    if (window.lucide) {
        lucide.createIcons();
    } else {
        createIcons();
    }
    
    // Adiciona classe de animação temporária
    const entityCard = to.querySelector(`.dropped-entity-card[data-entity-id="${entityId}"]`);
    if (entityCard) {
        setTimeout(() => {
            entityCard.classList.remove('animate-pulse');
        }, 2000);
    }
    
    // Salva a entidade no módulo
    const currentWorkspace = getCurrentWorkspace();
    await saveEntityToModule(moduleId, entityId, entityName, currentWorkspace ? currentWorkspace.id : 'default');
    
    // Notificação de sucesso
    showSuccess('Entidade adicionada!', 'Clique em configurar para definir seus campos.');
}

async function handleFieldDrop(event) {
    const { item } = event;
    const fieldType = item.dataset.fieldType;
    item.remove();

    if (fieldType === 'sub-entity') {
        const choice = await showConfirmDialog(
            'Como deseja criar esta tabela?',
            'Pode criar uma sub-entidade nova ou ligar a uma que já existe.',
            'Criar Nova',
            'Ligar a Existente',
            'info'
        );

        if (choice === true) {
            // Criar nova sub-entidade
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
            }
        } else if (choice === false) {
            // Ligar a entidade existente
            // Este código precisaria ser adaptado para usar as entidades do banco de dados
            const currentEntityId = JSON.parse(document.getElementById('entity-builder-modal').dataset.context).entityId;
            const allEntities = await loadAllEntities();
            const availableEntities = allEntities.filter(e => e.id !== currentEntityId);
            
            if (availableEntities.length === 0) {
                showError('Aviso', 'Não existem outras entidades para criar uma ligação. Crie pelo menos uma outra entidade primeiro.');
                return;
            }
            
            // Implementação simplificada - na versão final usaria um modal mais elaborado
            const entityOptions = availableEntities.map(e => `<option value="${e.id}|${e.name}">${e.name}</option>`).join('');
            
            // Este é um exemplo simplificado - idealmente usaria um componente de UI mais elaborado
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
                }
            }
        }
    } else {
        // Para campos normais
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
            showSuccess('Campo adicionado!', '');
            
            // Opcional: abrir painel de propriedades após adicionar
            // openFieldPropertiesPanel(fieldData);
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
    
    // Certifique-se de que o sidebar modal esteja visível em desktop, mas escondido em mobile
    const modalSidebarContent = document.getElementById('modal-sidebar-content');
    if (modalSidebarContent) {
        if (window.innerWidth >= 640) {
            modalSidebarContent.classList.remove('hidden');
        } else {
            modalSidebarContent.classList.add('hidden');
        }
    }
    
    // Resetar o ícone do toggle da sidebar do modal
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
        // Obter a área de trabalho atual e seus parâmetros
        const currentWorkspace = getCurrentWorkspace();
        const workspaceId = currentWorkspace ? currentWorkspace.id : 'default';
        const ownerId = currentWorkspace && !currentWorkspace.isOwner ? currentWorkspace.ownerId : null;
        
        loadStructureForEntity(context.moduleId, context.entityId, workspaceId, ownerId)
            .then(schema => {
                console.log("Estrutura carregada para entidade:", context.entityId, schema);
                if (schema && schema.attributes && schema.attributes.length > 0) {
                    schema.attributes.forEach(renderFormField);
                } else {
                    console.log("Nenhuma estrutura encontrada ou estrutura vazia para entidade:", context.entityId);
                }
            })
            .catch(error => {
                console.error("Erro ao carregar estrutura da entidade:", error);
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

async function handleAddNewEntity() {
    const currentWorkspace = getCurrentWorkspace();
    if (!currentWorkspace) {
        showError('Erro', 'Nenhuma área de trabalho selecionada.');
        return;
    }
    
    if (!currentWorkspace.isOwner) {
        showError('Erro', 'Você não tem permissão para criar entidades nesta área de trabalho.');
        return;
    }
    
    // Prepara o HTML para os ícones
    const iconHtml = availableEntityIcons.map(icon => 
        `<button class="icon-picker-btn p-2 rounded-md hover:bg-indigo-100 transition-all" data-icon="${icon}">
            <div class="h-6 w-6 sm:h-8 sm:w-8 rounded-md bg-indigo-50 flex items-center justify-center text-indigo-600">
                <i data-lucide="${icon}"></i>
            </div>
         </button>`
    ).join('');
    
    // Implementação simplificada - na versão final usaria um componente de UI mais elaborado
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
                const entityId = await createEntity({ 
                    name: formValues.name, 
                    icon: formValues.icon 
                }, currentWorkspace.id);
                
                // Recarregar entidades da área de trabalho atual
                const updatedEntities = await loadAllEntities(currentWorkspace.id);
                
                // Limpar a lista atual de entidades na interface
                const entityList = document.getElementById('entity-list');
                if (entityList) {
                    entityList.innerHTML = '';
                }
                
                // Renderizar todas as entidades, incluindo a nova
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
    
    if (!currentWorkspace.isOwner) {
        showError('Erro', 'Você não tem permissão para criar módulos nesta área de trabalho.');
        return;
    }
    
    const result = await showInputDialog(
        'Criar Novo Módulo',
        'Nome do Módulo',
        'Ex: Vendas, Recursos Humanos, Financeiro...'
    );
    
    if (result.confirmed && result.value) {
        showLoading('Criando módulo...');
        
        try {
            const moduleId = await createModule(result.value, currentWorkspace.id);
            
            // Renderiza o novo módulo
            const moduleEl = renderModule({ id: moduleId, name: result.value });
            checkEmptyStates();
            
            hideLoading();
            showSuccess('Módulo Criado!', `O módulo "${result.value}" foi criado com sucesso.`);
            
            // Dica após criar o primeiro módulo
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
            moduleId: 'system', // A entidade relacionada é global, não pertence a um módulo específico neste contexto
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
            await deleteEntityFromModule(moduleId, entityId, currentWorkspace ? currentWorkspace.id : 'default');
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
            await deleteEntity(entityId, currentWorkspace ? currentWorkspace.id : 'default');
            
            // Remove os cartões das entidades dos módulos
            document.querySelectorAll(`.dropped-entity-card[data-entity-id="${entityId}"]`).forEach(c => c.remove());
            
            // Remove o cartão da entidade da biblioteca
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
            await deleteModule(moduleId, currentWorkspace ? currentWorkspace.id : 'default');
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

    console.log("Salvando estrutura:", {
        context,
        attributes,
        fieldCardsCount: fieldCards.length
    });

    showLoading('Guardando estrutura...');

    try {
        const currentWorkspace = getCurrentWorkspace();
        const workspaceId = currentWorkspace ? currentWorkspace.id : 'default';
        
        console.log("Salvando com workspaceId:", workspaceId, "isOwner:", currentWorkspace?.isOwner);
        
        if (context.isSubEntity) {
            // Guardar a estrutura da sub-entidade de volta no seu campo pai
            const parentContext = modalNavigationStack[modalNavigationStack.length - 1];
            console.log("Salvando sub-entidade para:", parentContext);
            
            // Passa o workspaceId para a função de salvamento da sub-entidade
            await saveSubEntityStructure(
                parentContext.moduleId, 
                parentContext.entityId, 
                context.parentFieldId, 
                attributes,
                workspaceId
            );
            
            hideLoading();
            showSuccess('Guardado!', 'A estrutura da sub-entidade foi guardada com sucesso.');
        } else {
            // Guardar a estrutura da entidade principal
            console.log("Salvando entidade principal:", {
                moduleId: context.moduleId,
                entityId: context.entityId,
                entityName: context.entityName,
                attributesCount: attributes.length,
                workspaceId
            });
            
            await saveEntityStructure(
                context.moduleId, 
                context.entityId, 
                context.entityName, 
                attributes, 
                workspaceId
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
    
    // Armazena referência ao cartão de campo que está sendo editado
    panel.dataset.editingFieldCard = fieldCard ? fieldCard.id : '';
    
    // Armazena os dados atuais do campo
    panel.dataset.fieldData = JSON.stringify(fieldData);
    
    // Configura o ícone e título
    const icon = document.getElementById('field-properties-icon');
    const fieldInfo = fieldTypes.find(f => f.type === fieldData.type);
    if (icon && fieldInfo) {
        icon.setAttribute('data-lucide', fieldInfo.icon);
        createIcons();
    }
    
    // Preenche os campos de informações básicas
    document.getElementById('field-label').value = fieldData.label || '';
    document.getElementById('field-description').value = fieldData.description || '';
    document.getElementById('field-required').checked = fieldData.config?.required || false;
    
    // Esconde todos os painéis de configuração específicos
    document.querySelectorAll('.field-type-config').forEach(el => {
        el.classList.add('hidden');
    });
    
    // Mostra apenas o painel relevante para este tipo de campo
    const configPanel = document.getElementById(`${fieldData.type}-field-config`);
    if (configPanel) {
        configPanel.classList.remove('hidden');
        
        // Preenche as configurações específicas de acordo com o tipo
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
            // Outros tipos podem ser adicionados conforme necessário
        }
    }
    
    // Mostra o painel
    panel.classList.remove('translate-x-full');
}

function closeFieldPropertiesPanel() {
    const panel = document.getElementById('field-properties-panel');
    if (panel) {
        panel.classList.add('translate-x-full');
    }
}

function setupDateFieldConfig(config) {
    // Formato de data
    document.querySelector(`input[name="date-format"][value="${config.dateFormat || 'DD/MM/AAAA'}"]`).checked = true;
    
    // Inclusão de horas
    document.querySelector(`input[name="time-format"][value="${config.includeTime || 'none'}"]`).checked = true;
    
    // Comportamento do campo
    document.querySelector(`input[name="date-behavior"][value="${config.behavior || 'singleDate'}"]`).checked = true;
    
    // Valor padrão
    document.querySelector(`input[name="date-default"][value="${config.defaultValue || 'none'}"]`).checked = true;
}

function setupTextFieldConfig(config) {
    // Tipo de conteúdo
    document.querySelector(`input[name="text-content-type"][value="${config.contentType || 'text'}"]`).checked = true;
    
    // Aparência
    document.querySelector(`input[name="text-appearance"][value="${config.appearance || 'singleLine'}"]`).checked = true;
    
    // Limite de caracteres
    const maxLengthInput = document.getElementById('text-max-length');
    maxLengthInput.value = config.maxLength || '';
}

function setupNumberFieldConfig(config) {
    // Formato do número
    document.querySelector(`input[name="number-format"][value="${config.format || 'plain'}"]`).checked = true;
    
    // Casas decimais
    document.getElementById('decimal-precision').value = config.precision || 2;
    
    // Símbolo de moeda
    document.getElementById('currency-symbol').value = config.symbol || 'R$';
    
    // Valor mínimo
    document.getElementById('number-min-value').value = config.minValue || '';
    
    // Valor máximo
    document.getElementById('number-max-value').value = config.maxValue || '';
    
    // Exibe/esconde campos condicionais
    const numberFormat = config.format || 'plain';
    document.getElementById('decimal-precision-container').classList.toggle('hidden', !['decimal', 'currency', 'percentage'].includes(numberFormat));
    document.getElementById('currency-symbol-container').classList.toggle('hidden', numberFormat !== 'currency');
    
    // Adiciona listeners para mostrar/esconder campos condicionais
    document.querySelectorAll('input[name="number-format"]').forEach(radio => {
        radio.addEventListener('change', function() {
            const format = this.value;
            document.getElementById('decimal-precision-container').classList.toggle('hidden', !['decimal', 'currency', 'percentage'].includes(format));
            document.getElementById('currency-symbol-container').classList.toggle('hidden', format !== 'currency');
        });
    });
}

function setupSelectFieldConfig(config) {
    // Comportamento da seleção
    document.querySelector(`input[name="select-behavior"][value="${config.allowMultiple ? 'multiple' : 'single'}"]`).checked = true;
    
    // Aparência
    document.querySelector(`input[name="select-appearance"][value="${config.appearance || 'dropdown'}"]`).checked = true;
    
    // Opções
    const optionsContainer = document.getElementById('select-options-container');
    optionsContainer.innerHTML = '';
    
    // Se não houver opções, adiciona uma padrão
    const options = config.options && config.options.length > 0 ? config.options : [{ id: 'opt1', label: 'Opção 1' }];
    
    options.forEach((option, index) => {
        const optionElement = createSelectOption(option.label, index);
        optionsContainer.appendChild(optionElement);
    });
    
    // Configura o botão para adicionar novas opções
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
    
    // Configurar botões de ação
    optionElement.querySelector('.move-option-up').addEventListener('click', function() {
        const item = this.closest('.select-option-item');
        const prev = item.previousElementSibling;
        if (prev) {
            item.parentNode.insertBefore(item, prev);
        }
    });
    
    optionElement.querySelector('.move-option-down').addEventListener('click', function() {
        const item = this.closest('.select-option-item');
        const next = item.nextElementSibling;
        if (next) {
            item.parentNode.insertBefore(next, item);
        }
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
    
    // Obtém dados do campo sendo editado
    const fieldData = JSON.parse(panel.dataset.fieldData);
    const fieldCardId = panel.dataset.editingFieldCard;
    const fieldCard = document.getElementById(fieldCardId);
    
    if (!fieldCard) return;
    
    // Atualiza informações básicas
    fieldData.label = document.getElementById('field-label').value;
    fieldData.description = document.getElementById('field-description').value;
    
    // Inicializa o objeto de configuração se não existir
    if (!fieldData.config) {
        fieldData.config = { ...defaultFieldConfigs[fieldData.type] };
    }
    
    // Atualiza campo obrigatório
    fieldData.config.required = document.getElementById('field-required').checked;
    
    // Atualiza configurações específicas do tipo
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
            
            // Coleta as opções
            const optionsContainer = document.getElementById('select-options-container');
            const options = [];
            
            Array.from(optionsContainer.children).forEach((optItem, index) => {
                const label = optItem.querySelector('input').value.trim();
                if (label) {
                    options.push({
                        id: `opt${index + 1}`,
                        label: label
                    });
                }
            });
            
            fieldData.config.options = options;
            break;
    }
    
    // Atualiza o campo no DOM
    fieldCard.querySelector('.field-label').textContent = fieldData.label;
    fieldCard.dataset.fieldData = JSON.stringify(fieldData);
    
    // Fecha o painel
    closeFieldPropertiesPanel();
    
    // Notificação de sucesso
    showSuccess('Propriedades atualizadas!', '');
}

function setupFieldPropertiesPanelEvents() {
    // Botão para fechar o painel
    const closeBtn = document.getElementById('close-properties-panel');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeFieldPropertiesPanel);
    }
    
    // Botão para cancelar
    const cancelBtn = document.getElementById('cancel-field-properties');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', closeFieldPropertiesPanel);
    }
    
    // Botão para aplicar alterações
    const applyBtn = document.getElementById('apply-field-properties');
    if (applyBtn) {
        applyBtn.addEventListener('click', applyFieldProperties);
    }
    
    // Configurar event listeners para número
    document.querySelectorAll('input[name="number-format"]').forEach(radio => {
        radio.addEventListener('change', function() {
            const format = this.value;
            document.getElementById('decimal-precision-container').classList.toggle('hidden', !['decimal', 'currency', 'percentage'].includes(format));
            document.getElementById('currency-symbol-container').classList.toggle('hidden', format !== 'currency');
        });
    });
    
    // Configurar o botão para adicionar novas opções
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

/**
 * Renderiza um recurso compartilhado na lista
 * @param {Object} resource - Dados do recurso compartilhado
 */
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
    
    // Cria o elemento a partir do HTML
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = itemHtml.trim();
    const item = tempDiv.firstChild;
    
    // Adiciona o evento de clique para acessar o recurso
    item.querySelector('.access-shared-resource-btn').addEventListener('click', () => {
        accessSharedResource(resource);
    });
    
    // Adiciona o item ao container
    container.appendChild(item);
    
    // Atualiza os ícones
    createIcons();
}

/**
 * Formata o texto do papel/permissão
 * @param {string} role - Papel/permissão
 * @returns {string} - Texto formatado
 */
function formatRoleText(role) {
    switch (role) {
        case 'admin':
            return 'Administrador';
        case 'editor':
            return 'Editor';
        case 'viewer':
            return 'Leitor';
        default:
            return role || 'Desconhecido';
    }
}

/**
 * Acessa um recurso compartilhado
 * @param {Object} resource - Dados do recurso compartilhado
 */
async function accessSharedResource(resource) {
    showLoading('Acessando recurso compartilhado...');
    
    try {
        if (resource.type === 'module_constructor') {
            // Carrega os módulos compartilhados
            const sharedModules = await loadSharedUserModules(resource.ownerId);
            
            if (sharedModules.length > 0) {
                // Mostra uma notificação de sucesso
                showSuccess('Acesso concedido', `Você agora tem acesso aos módulos de ${resource.ownerName}.`);
                
                // Implementação real: redirecionar para uma página que mostra os módulos compartilhados
                // window.location.href = `shared-modules.html?ownerId=${resource.ownerId}`;
                
                // Para demonstração, vamos simplesmente mostrar uma lista dos módulos compartilhados
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

/**
 * Carrega dados de uma área de trabalho específica
 * @param {Object} workspace - Área de trabalho a ser carregada
 */
async function loadWorkspaceData(workspace) {
    showLoading('Carregando área de trabalho...');
    
    try {
        // Limpa dados atuais
        const entityList = document.getElementById('entity-list');
        const moduleContainer = document.getElementById('module-container');
        
        if (entityList) entityList.innerHTML = '';
        if (moduleContainer) moduleContainer.innerHTML = '';
        
        const workspaceId = workspace.id;
        const ownerId = workspace.isOwner ? null : workspace.ownerId;
        
        // Carrega entidades da área de trabalho
        console.log("Carregando entidades da área de trabalho...", workspaceId);
        const entities = await loadAllEntities(workspaceId, ownerId);
        console.log(`Entidades carregadas: ${entities.length}`, entities);
        
        // Renderiza as entidades carregadas na biblioteca
        if (entityList) {
            entities.forEach(entity => {
                console.log(`Renderizando entidade: ${entity.name}`, entity);
                renderEntityInLibrary(entity);
            });
        }
        
        // Popula a caixa de ferramentas de campos
        populateFieldsToolbox();
        
        // Carrega e renderiza os módulos e suas entidades
        await loadAndRenderModules(renderModule, workspaceId, ownerId);
        await loadDroppedEntitiesIntoModules(renderDroppedEntity, workspaceId, ownerId);
        
        // Verifica os estados vazios
        checkEmptyStates();
        
        // Força a renderização dos ícones para garantir que eles apareçam
        if (window.lucide) {
            setTimeout(() => {
                console.log("Forçando renderização de ícones após carregamento de workspace");
                lucide.createIcons();
            }, 200);
        }
        
        hideLoading();
    } catch (error) {
        hideLoading();
        console.error('Erro ao carregar dados da área de trabalho:', error);
        showError('Erro', 'Ocorreu um erro ao carregar a área de trabalho.');
    }
}

/**
 * Carrega e renderiza os recursos compartilhados com o usuário
 */
async function loadAndRenderSharedResources() {
    // Esta função agora é gerenciada pelo módulo de workspaces
    // Não precisa fazer nada aqui
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