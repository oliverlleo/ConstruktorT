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
    // Log inicial para verificar a presença dos templates
    console.log("[main.js] Verificando templates no início de initApp:", {
        'module-template': document.getElementById('module-template'),
        'entity-card-template': document.getElementById('entity-card-template'),
        'dropped-entity-card-template': document.getElementById('dropped-entity-card-template'),
        'toolbox-field-template': document.getElementById('toolbox-field-template'),
        'form-field-template': document.getElementById('form-field-template'),
        'loading-overlay': document.getElementById('loading-overlay'), // Adicionado para verificação
        'app': document.getElementById('app') // Adicionado para verificação
    });

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
        db = firebase.database();
        
        // Inicializa a interface do usuário
        console.log("[main.js] Antes de initUI, user-menu-button:", document.getElementById('user-menu-button')); 
        initUI();
        console.log("[main.js] Depois de initUI, user-menu-button:", document.getElementById('user-menu-button'));
        
        // Inicializa o sistema de gerenciamento de usuário
        console.log("[main.js] Antes de initUserProfile, user-menu-button:", document.getElementById('user-menu-button'));
        initUserProfile(db);
        console.log("[main.js] Depois de initUserProfile, user-menu-button:", document.getElementById('user-menu-button'));
        
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
        await loadDroppedEntitiesIntoModules(renderDroppedEntity, workspaceId, ownerId);
        
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
        console.error("[main.js] Elemento 'entity-list' não encontrado! Não é possível renderizar entidade na biblioteca.");
        return;
    }
    
    const template = document.getElementById('entity-card-template');
    if (!template) {
        console.error("CRÍTICO: O <template id='entity-card-template'> não foi encontrado no DOM. Não é possível renderizar entidade na biblioteca.");
        return;
    }
    if (!template.content) {
        console.error("CRÍTICO: O <template id='entity-card-template'> não possui 'content'. Verifique se é uma tag <template> válida.");
        return;
    }
    
    const clone = template.content.cloneNode(true);
    const card = clone.querySelector('.entity-card');
    if (!card) {
        console.error("CRÍTICO: Elemento '.entity-card' não encontrado dentro do 'entity-card-template'.");
        return;
    }
    card.dataset.entityId = entity.id;
    card.dataset.entityName = entity.name;
    card.dataset.entityIcon = entity.icon; 
    
    const iconEl = clone.querySelector('.entity-icon');
    if (iconEl) {
        iconEl.setAttribute('data-lucide', entity.icon || 'box'); 
    } else {
        console.warn("[main.js] Elemento '.entity-icon' não encontrado no 'entity-card-template'.");
    }

    const entityNameEl = clone.querySelector('.entity-name');
    if (entityNameEl) {
        entityNameEl.textContent = entity.name;
    } else {
        console.warn("[main.js] Elemento '.entity-name' não encontrado no 'entity-card-template'.");
    }
    
    const deleteBtn = clone.querySelector('.delete-custom-entity-btn');
    if (entity.id.startsWith('-')) {
        if (deleteBtn) {
            deleteBtn.classList.remove('hidden');
        } else {
            console.warn("[main.js] Elemento '.delete-custom-entity-btn' não encontrado no 'entity-card-template'.");
        }
    }
    
    list.appendChild(clone);
    
    if (window.lucide) {
        lucide.createIcons();
    } else {
        createIcons();
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
    if (!container) {
        console.error("CRÍTICO: Elemento 'module-container' não encontrado. Não é possível renderizar módulos.");
        return null;
    }

    const template = document.getElementById('module-template');
    if (!template) {
        console.error("CRÍTICO: O <template id='module-template'> não foi encontrado no DOM. A renderização de módulos não pode continuar.");
        // Considerar mostrar um erro ao usuário aqui também, se apropriado, ou deixar que a falha de loadWorkspaceData lide com isso.
        // showError('Erro Crítico de Interface', 'Um componente essencial da página (module-template) não pôde ser carregado.');
        return null; 
    }

    if (!template.content) {
        console.error("CRÍTICO: O elemento <template id='module-template'> não possui uma propriedade 'content'. Verifique se é uma tag <template> válida.");
        return null;
    }

    const clone = template.content.cloneNode(true);
    const moduleEl = clone.querySelector('.module-quadro');

    if (!moduleEl) {
        console.error("CRÍTICO: Elemento '.module-quadro' não encontrado dentro do 'module-template'. Verifique a estrutura do template.");
        return null;
    }
    
    moduleEl.dataset.moduleId = moduleData.id;
    const moduleTitleEl = clone.querySelector('.module-title');
    if (moduleTitleEl) {
        moduleTitleEl.textContent = moduleData.name;
    } else {
        console.warn("Elemento '.module-title' não encontrado dentro do 'module-template'. O título do módulo não será definido.");
    }
    
    container.appendChild(clone);
    // É mais seguro referenciar moduleEl diretamente se ele foi encontrado,
    // em vez de fazer querySelector novamente no container, especialmente se múltiplos módulos puderem ser adicionados rapidamente.
    // No entanto, o código original faz querySelector, então vamos manter por enquanto, mas cientes do risco.
    const newModuleEl = container.querySelector(`[data-module-id="${moduleData.id}"]`); 
    
    if (newModuleEl) {
        setupDragAndDropForModule(newModuleEl); // Assumindo que esta função é robusta ou será revisada
        createIcons(); // Assumindo que esta função é robusta
        
        newModuleEl.classList.add('animate-pulse');
        setTimeout(() => newModuleEl.classList.remove('animate-pulse'), 2000);
    } else {
        // Isso não deveria acontecer se moduleEl foi encontrado e adicionado corretamente.
        console.error(`Falha ao encontrar o módulo recém-adicionado com ID ${moduleData.id} no container.`);
    }
    
    return newModuleEl; // Pode ser null se newModuleEl não for encontrado
}

function renderDroppedEntity(moduleId, entityId, entityData, entityInfo) {
    const moduleEl = document.querySelector(`.module-quadro[data-module-id="${moduleId}"]`);
    if (!moduleEl) {
        console.warn(`[renderDroppedEntity] Módulo com ID '${moduleId}' não encontrado.`);
        return;
    }
    
    const dropzone = moduleEl.querySelector('.entities-dropzone');
    if (!dropzone) {
        console.warn(`[renderDroppedEntity] Dropzone '.entities-dropzone' não encontrado no módulo '${moduleId}'.`);
        return;
    }

    const template = document.getElementById('dropped-entity-card-template');
    if (!template) {
        console.error("CRÍTICO: O <template id='dropped-entity-card-template'> não foi encontrado no DOM.");
        return;
    }
    if (!template.content) {
        console.error("CRÍTICO: O <template id='dropped-entity-card-template'> não possui 'content'.");
        return;
    }

    const clone = template.content.cloneNode(true);
    const card = clone.querySelector('.dropped-entity-card');

    if (!card) {
        console.error("CRÍTICO: Elemento '.dropped-entity-card' não encontrado dentro do 'dropped-entity-card-template'.");
        return;
    }

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
    if (!toolbox) {
        console.warn("[main.js] Elemento 'fields-toolbox' não encontrado. Caixa de ferramentas de campos não será populada.");
        return;
    }
    
    toolbox.innerHTML = ''; // Limpa o conteúdo existente
    const template = document.getElementById('toolbox-field-template');
    if (!template) {
        console.error("CRÍTICO: O <template id='toolbox-field-template'> não foi encontrado no DOM.");
        return;
    }
    if (!template.content) {
        console.error("CRÍTICO: O <template id='toolbox-field-template'> não possui 'content'.");
        return;
    }

    fieldTypes.forEach(field => {
        const clone = template.content.cloneNode(true);
        const item = clone.querySelector('.toolbox-item');
        if (!item) {
            console.warn("[main.js] Elemento '.toolbox-item' não encontrado no 'toolbox-field-template'. Pulando este tipo de campo.");
            return; // continue para o próximo fieldType (dentro de forEach, 'return' funciona como 'continue')
        }
        item.dataset.fieldType = field.type;
        const iconEl = clone.querySelector('.field-icon');
        if (iconEl) {
            iconEl.setAttribute('data-lucide', field.icon);
        } else {
            console.warn("[main.js] Elemento '.field-icon' não encontrado no 'toolbox-field-template'.");
        }
        const fieldNameEl = clone.querySelector('.field-name');
        if (fieldNameEl) {
            fieldNameEl.textContent = field.name;
        } else {
            console.warn("[main.js] Elemento '.field-name' não encontrado no 'toolbox-field-template'.");
        }
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
    if (!dropzone) {
        console.error("[main.js] Elemento 'form-builder-dropzone' não encontrado. Não é possível renderizar campo de formulário.");
        return null;
    }
    
    const template = document.getElementById('form-field-template');
    if (!template) {
        console.error("CRÍTICO: O <template id='form-field-template'> não foi encontrado no DOM.");
        return null;
    }
    if (!template.content) {
        console.error("CRÍTICO: O <template id='form-field-template'> não possui 'content'.");
        return null;
    }
    
    const clone = template.content.cloneNode(true);
    const card = clone.querySelector('.form-field-card');
    if (!card) {
        console.error("CRÍTICO: Elemento '.form-field-card' não encontrado dentro do 'form-field-template'.");
        return null;
    }
    
    const domId = `field-card-${fieldData.id}`;
    card.id = domId;
    
    card.dataset.fieldId = fieldData.id;
    card.dataset.fieldData = JSON.stringify(fieldData);
    const fieldInfo = fieldTypes.find(f => f.type === fieldData.type); // fieldInfo pode ser undefined
    
    const iconEl = clone.querySelector('.field-icon');
    if (iconEl && fieldInfo) {
        iconEl.setAttribute('data-lucide', fieldInfo.icon);
    } else if (!iconEl) {
        console.warn("[main.js] Elemento '.field-icon' não encontrado no 'form-field-template'.");
    } else if (!fieldInfo) { // Apenas loga se fieldInfo for o problema, e iconEl existir
        console.warn(`[main.js] Tipo de campo '${fieldData.type}' desconhecido em renderFormField. Ícone não definido.`);
    }
    
    const fieldLabelEl = clone.querySelector('.field-label');
    if (fieldLabelEl) {
        fieldLabelEl.textContent = fieldData.label;
    } else {
        console.warn("[main.js] Elemento '.field-label' não encontrado no 'form-field-template'.");
    }
    
    const fieldTypeEl = clone.querySelector('.field-type');
    const editSubEntityBtn = clone.querySelector('.edit-sub-entity-btn');
    const editFieldBtn = clone.querySelector('.edit-field-btn');

    if (fieldTypeEl) {
        if (fieldData.type === 'sub-entity') {
            fieldTypeEl.textContent = fieldData.subType === 'independent' ? 
                `Sub-Entidade` : 
                `Relação → ${fieldData.targetEntityName || 'Entidade Alvo Desconhecida'}`;
            if (editSubEntityBtn) editSubEntityBtn.classList.remove('hidden');
            else console.warn("[main.js] '.edit-sub-entity-btn' não encontrado em 'form-field-template'.");
            
            if (editFieldBtn) editFieldBtn.style.display = 'none';
            // Não logar se editFieldBtn não for encontrado aqui, pois seu display:none é uma modificação
        } else {
            if(fieldInfo) {
                fieldTypeEl.textContent = fieldInfo.name;
            } else {
                fieldTypeEl.textContent = fieldData.type; // Fallback para o tipo bruto se fieldInfo não for encontrado
                console.warn(`[main.js] Informações para tipo de campo '${fieldData.type}' não encontradas. Usando nome bruto.`);
            }
            
            // A lógica para adicionar ' (Configurado)' ou ' *' ao fieldLabelEl precisa que fieldLabelEl exista.
            if (fieldLabelEl && fieldData.config && Object.keys(fieldData.config).length > 0) {
                if (!fieldData.config.required) {
                    // Se fieldLabelEl já tem "(Configurado)" ou "*", evite adicionar de novo.
                    // Esta lógica pode precisar de mais refinamento para evitar duplicatas se chamada múltiplas vezes.
                    // Por agora, a proteção é que fieldLabelEl exista.
                    if (!fieldLabelEl.textContent.includes('*') && !fieldLabelEl.textContent.includes('(Configurado)')) {
                        fieldLabelEl.textContent += ' (Configurado)';
                    }
                } else {
                     if (!fieldLabelEl.textContent.includes('*')) {
                        fieldLabelEl.textContent += ' *';
                     }
                }
            }
        }
    } else {
        console.warn("[main.js] Elemento '.field-type' não encontrado no 'form-field-template'.");
    }
    
    dropzone.appendChild(clone);
    
    // O elemento recém-adicionado é o 'card', não necessariamente o último filho se houver concorrência.
    // Usar 'card' diretamente é mais seguro.
    card.classList.add('animate-pulse');
    setTimeout(() => card.classList.remove('animate-pulse'), 2000);
    
    createIcons();
    
    const emptyFormState = document.getElementById('empty-form-state');
    if (emptyFormState) {
        if (dropzone.children.length > 0) {
            emptyFormState.classList.add('hidden');
        } else {
            emptyFormState.classList.remove('hidden');
        }
    }
    
    return card; // Retorna o card criado, que é o 'newField'
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
    
    if (window.lucide) {
        lucide.createIcons();
    } else {
        createIcons();
    }
    
    const entityCard = to.querySelector(`.dropped-entity-card[data-entity-id="${entityId}"]`);
    if (entityCard) {
        setTimeout(() => {
            entityCard.classList.remove('animate-pulse');
        }, 2000);
    }
    
    const currentWorkspace = getCurrentWorkspace();
    const workspaceId = currentWorkspace ? currentWorkspace.id : 'default';
    const ownerId = currentWorkspace && currentWorkspace.isShared ? currentWorkspace.ownerId : null;
    await saveEntityToModule(moduleId, entityId, entityName, workspaceId, ownerId);
    
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


    // Original check - this might prevent editors on shared workspaces from creating entities
    // if (ownerId && !currentWorkspace.isOwner) { //Simplified from !currentWorkspace.isOwner
    // This check seems to contradict the goal of allowing editors to create entities.
    // Let's assume the Firebase rules will handle permissions.
    // The original code had:
    // if (!currentWorkspace.isOwner) {
    //     showError('Erro', 'Você não tem permissão para criar entidades nesta área de trabalho.');
    //     return;
    // }
    // This check will be re-evaluated after seeing if Firebase correctly denies based on rules for viewers.

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
    
    // Similar to handleAddNewEntity, this frontend check might be too restrictive
    // if editors/admins should be allowed to create modules.
    // Firebase rules are now in place to allow this.
    // if (!currentWorkspace.isOwner) {
    //     showError('Erro', 'Você não tem permissão para criar módulos nesta área de trabalho.');
    //     return;
    // }
    
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
