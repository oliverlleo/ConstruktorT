import { getUsuarioId, getUsuarioEmail } from './autenticacao.js';
import { showError, showLoading, hideLoading } from './ui.js';
import { TIPS_STATE } from './config.js';

// Variáveis do módulo
let db;
let allEntities = [];
let modulesOrder = []; // Armazena a ordem dos módulos
let userPreferences = {}; // Armazena preferências do usuário
let sharedResources = []; // Armazena recursos compartilhados com o usuário

/**
 * Função auxiliar para construir o caminho correto para a base de dados.
 * @param {string} workspaceId - ID do workspace.
 * @param {string} ownerId - ID do dono (null se for do próprio utilizador).
 * @param {string} path - O caminho do recurso (ex: 'entities', 'modules').
 * @returns {string} - O caminho completo na base de dados.
 */
function getDbPath(workspaceId, ownerId, path) {
    const targetUserId = ownerId || getUsuarioId();
    return `users/${targetUserId}/workspaces/${workspaceId}/${path}`;
}


/**
 * Inicializa o módulo de banco de dados
 * @param {Object} firebase - Instância do Firebase
 * @returns {Promise<void>}
 */
export async function initDatabase(firebase) {
    try {
        db = firebase.database();
        await loadUserPreferences();
        await loadSharedResources();
    } catch (error) {
        console.error("Erro ao inicializar banco de dados:", error);
        showError('Erro de Conexão', 'Não foi possível conectar ao banco de dados.');
        throw error;
    }
}

/**
 * Carrega todas as entidades do banco de dados para a área de trabalho atual
 * @param {string} workspaceId - ID da área de trabalho
 * @param {string} ownerId - ID do dono da área de trabalho (opcional, para workspaces compartilhados)
 * @returns {Promise<Array>} - Array com todas as entidades
 */
export async function loadAllEntities(workspaceId = 'default', ownerId = null) {
    const currentUserId = getUsuarioId();
    const targetUserId = ownerId || currentUserId;

    console.log(`[loadAllEntities] Tentando carregar entidades. Solicitado por: ${currentUserId}, Dono do Recurso: ${targetUserId}, Workspace: ${workspaceId}`);
    
    if (!targetUserId) {
        console.error("[loadAllEntities] ERRO: ID do usuário alvo é nulo.");
        showError('Erro de Autenticação', 'Não foi possível identificar o usuário.');
        return [];
    }
    
    const readPath = `users/${targetUserId}/workspaces/${workspaceId}/entities`;
    console.log(`[loadAllEntities] Caminho de leitura: ${readPath}`);

    try {
        const snapshot = await db.ref(readPath).get();
        allEntities = [];
        
        if (snapshot.exists()) {
            console.log("[loadAllEntities] Entidades encontradas no Firebase.", snapshot.val());
            const customEntities = snapshot.val();
            for (const entityId in customEntities) {
                allEntities.push({ ...customEntities[entityId], id: entityId });
            }
        } else {
            console.log("[loadAllEntities] Nenhuma entidade encontrada no Firebase neste caminho.");
        }
        
        console.log(`[loadAllEntities] Sucesso. Total de entidades carregadas: ${allEntities.length}`);
        return allEntities;
    } catch (error) {
        console.error(`[loadAllEntities] Falha ao carregar entidades do caminho: ${readPath}`, error);
        showError('Erro de Dados', 'Não foi possível carregar as entidades. Verifique as permissões.');
        throw error;
    }
}


/**
 * Obtém todas as entidades já carregadas
 * @returns {Array} - Array com todas as entidades
 */
export function getEntities() {
    return allEntities;
}

/**
 * Carrega e renderiza todos os módulos para a área de trabalho atual
 * @param {Function} renderCallback - Função para renderizar cada módulo
 * @param {string} workspaceId - ID da área de trabalho
 * @param {string} ownerId - ID do dono da área de trabalho (opcional, para workspaces compartilhados)
 * @returns {Promise<Array>} - Array com todos os módulos
 */
export async function loadAndRenderModules(renderCallback, workspaceId = 'default', ownerId = null) {
    const userId = ownerId || getUsuarioId();
    if (!userId) throw new Error('Usuário não autenticado');
    
    const modulesPath = `users/${userId}/workspaces/${workspaceId}/modules`;
    console.log(`[loadAndRenderModules] Carregando de: ${modulesPath}`);
    
    try {
        const snapshot = await db.ref(modulesPath).get();
        if (!snapshot.exists()) {
            console.log("[loadAndRenderModules] Nenhum módulo encontrado.");
            return [];
        }
        
        const modules = snapshot.val();
        
        const orderPath = `users/${userId}/workspaces/${workspaceId}/modules_order`;
        const orderSnapshot = await db.ref(orderPath).get();
        if (orderSnapshot.exists()) {
            modulesOrder = orderSnapshot.val().filter(id => modules[id]);
            Object.keys(modules).forEach(moduleId => {
                if (!modulesOrder.includes(moduleId)) modulesOrder.push(moduleId);
            });
        } else {
            modulesOrder = Object.keys(modules);
        }
        
        if (renderCallback) {
            modulesOrder.forEach(moduleId => {
                if (modules[moduleId]) renderCallback({ ...modules[moduleId], id: moduleId });
            });
        }
        
        return modulesOrder.map(moduleId => ({...modules[moduleId], id: moduleId}));
    } catch (error) {
        console.error(`[loadAndRenderModules] Erro ao carregar módulos de ${modulesPath}:`, error);
        showError('Erro de Dados', 'Não foi possível carregar os módulos.');
        throw error;
    }
}

/**
 * Carrega as entidades adicionadas em cada módulo
 * @param {Function} renderCallback - Função para renderizar cada entidade em seu módulo
 * @param {string} workspaceId - ID da área de trabalho
 * @param {string} ownerId - ID do dono da área de trabalho (opcional, para workspaces compartilhados)
 * @returns {Promise<Object>} - Objeto com os schemas carregados
 */
export async function loadDroppedEntitiesIntoModules(renderCallback, workspaceId = 'default', ownerId = null) {
    const userId = ownerId || getUsuarioId();
    if (!userId) throw new Error('Usuário não autenticado');

    const schemasPath = `users/${userId}/workspaces/${workspaceId}/schemas`;
    console.log(`[loadDroppedEntitiesIntoModules] Carregando de: ${schemasPath}`);

    try {
        const snapshot = await db.ref(schemasPath).get();
        if (!snapshot.exists()) return {};
        
        const schemas = snapshot.val();
        
        if (renderCallback) {
            for (const moduleId in schemas) {
                for (const entityId in schemas[moduleId]) {
                    if (!schemas[moduleId][entityId]) continue;
                    
                    const entityInfo = allEntities.find(e => e.id === entityId);
                    if (entityInfo) {
                        renderCallback(moduleId, entityId, schemas[moduleId][entityId], entityInfo);
                    }
                }
            }
        }
        
        return schemas;
    } catch (error) {
        console.error(`[loadDroppedEntitiesIntoModules] Erro ao carregar schemas de ${schemasPath}:`, error);
        showError('Erro de Dados', 'Não foi possível carregar as entidades dos módulos.');
        throw error;
    }
}

/**
 * Carrega a estrutura de uma entidade específica
 * @param {string} moduleId - ID do módulo
 * @param {string} entityId - ID da entidade
 * @param {string} workspaceId - ID da área de trabalho
 * @param {string} ownerId - ID do dono da área de trabalho (opcional, para workspaces compartilhados)
 * @returns {Promise<Object>} - Estrutura da entidade
 */
export async function loadStructureForEntity(moduleId, entityId, workspaceId = 'default', ownerId = null) {
    const path = getDbPath(workspaceId, ownerId, `schemas/${moduleId}/${entityId}`);
    try {
        const snapshot = await db.ref(path).get();
        return snapshot.exists() ? snapshot.val() : { attributes: [] };
    } catch (error) {
        console.error(`Erro ao carregar estrutura da entidade de ${path}:`, error);
        showError('Erro de Dados', 'Não foi possível carregar a estrutura da entidade.');
        throw error;
    }
}


/**
 * Cria uma nova entidade na área de trabalho atual
 * @param {Object} entityData - Dados da nova entidade
 * @param {string} workspaceId - ID da área de trabalho
 * @param {string} ownerId - ID do dono do workspace (para escrita em workspaces partilhados)
 * @returns {Promise<string>} - ID da entidade criada
 */
export async function createEntity(entityData, workspaceId = 'default', ownerId = null) {
    showLoading('Criando entidade...');
    try {
        const path = getDbPath(workspaceId, ownerId, 'entities');
        const newEntityRef = db.ref(path).push();
        await newEntityRef.set(entityData);
        
        allEntities.push({ ...entityData, id: newEntityRef.key });
        
        hideLoading();
        return newEntityRef.key;
    } catch (error) {
        hideLoading();
        console.error("Erro ao criar entidade:", error);
        showError('Erro ao Criar', 'Não foi possível criar a entidade.');
        throw error;
    }
}

/**
 * Cria um novo módulo na área de trabalho atual
 * @param {string} name - Nome do módulo
 * @param {string} workspaceId - ID da área de trabalho
 * @param {string} ownerId - ID do dono do workspace (para escrita em workspaces partilhados)
 * @returns {Promise<string>} - ID do módulo criado
 */
export async function createModule(name, workspaceId = 'default', ownerId = null) {
    showLoading('Criando módulo...');
    try {
        const modulesPath = getDbPath(workspaceId, ownerId, 'modules');
        const newModuleRef = db.ref(modulesPath).push();
        const newModuleData = { id: newModuleRef.key, name };
        await newModuleRef.set(newModuleData);
        
        modulesOrder.push(newModuleRef.key);
        const orderPath = getDbPath(workspaceId, ownerId, 'modules_order');
        await db.ref(orderPath).set(modulesOrder);
        
        hideLoading();
        return newModuleRef.key;
    } catch (error) {
        hideLoading();
        console.error("Erro ao criar módulo:", error);
        showError('Erro ao Criar', 'Não foi possível criar o módulo.');
        throw error;
    }
}

/**
 * Adiciona uma entidade a um módulo
 * @param {string} moduleId - ID do módulo
 * @param {string} entityId - ID da entidade
 * @param {string} entityName - Nome da entidade
 * @param {string} workspaceId - ID da área de trabalho
 * @param {string} ownerId - ID do dono do workspace (para escrita em workspaces partilhados)
 * @returns {Promise<void>}
 */
export async function saveEntityToModule(moduleId, entityId, entityName, workspaceId = 'default', ownerId = null) {
    try {
        const path = getDbPath(workspaceId, ownerId, `schemas/${moduleId}/${entityId}`);
        const snapshot = await db.ref(path).get();
        
        if (!snapshot.exists()) {
            await db.ref(path).set({ entityName, attributes: [] });
        }
    } catch (error) {
        console.error("Erro ao salvar entidade no módulo:", error);
        showError('Erro ao Salvar', 'Não foi possível adicionar a entidade ao módulo.');
        throw error;
    }
}

/**
 * Remove uma entidade de um módulo
 * @param {string} moduleId - ID do módulo
 * @param {string} entityId - ID da entidade
 * @param {string} workspaceId - ID da área de trabalho
 * @param {string} ownerId - ID do dono do workspace (para escrita em workspaces partilhados)
 * @returns {Promise<void>}
 */
export async function deleteEntityFromModule(moduleId, entityId, workspaceId = 'default', ownerId = null) {
    try {
        const path = getDbPath(workspaceId, ownerId, `schemas/${moduleId}/${entityId}`);
        await db.ref(path).remove();
    } catch (error) {
        console.error("Erro ao remover entidade do módulo:", error);
        showError('Erro ao Remover', 'Não foi possível remover a entidade do módulo.');
        throw error;
    }
}

/**
 * Remove uma entidade permanentemente
 * @param {string} entityId - ID da entidade
 * @param {string} workspaceId - ID da área de trabalho
 * @param {string} ownerId - ID do dono do workspace (para escrita em workspaces partilhados)
 * @returns {Promise<void>}
 */
export async function deleteEntity(entityId, workspaceId = 'default', ownerId = null) {
    showLoading('Excluindo entidade...');
    try {
        const entityPath = getDbPath(workspaceId, ownerId, `entities/${entityId}`);
        await db.ref(entityPath).remove();
        
        const schemasPath = getDbPath(workspaceId, ownerId, 'schemas');
        const snapshot = await db.ref(schemasPath).get();
        if (snapshot.exists()) {
            const updates = {};
            for (const moduleId in snapshot.val()) { 
                updates[`${schemasPath}/${moduleId}/${entityId}`] = null;
            }
            await db.ref().update(updates);
        }
        
        allEntities = allEntities.filter(e => e.id !== entityId);
        hideLoading();
    } catch (error) {
        hideLoading();
        console.error("Erro ao excluir entidade:", error);
        showError('Erro ao Excluir', 'Não foi possível excluir a entidade.');
        throw error;
    }
}

/**
 * Remove um módulo permanentemente
 * @param {string} moduleId - ID do módulo
 * @param {string} workspaceId - ID da área de trabalho
 * @param {string} ownerId - ID do dono do workspace (para escrita em workspaces partilhados)
 * @returns {Promise<void>}
 */
export async function deleteModule(moduleId, workspaceId = 'default', ownerId = null) {
    showLoading('Excluindo módulo...');
    try {
        const modulePath = getDbPath(workspaceId, ownerId, `modules/${moduleId}`);
        await db.ref(modulePath).remove();

        const schemaPath = getDbPath(workspaceId, ownerId, `schemas/${moduleId}`);
        await db.ref(schemaPath).remove();
        
        modulesOrder = modulesOrder.filter(id => id !== moduleId);
        const orderPath = getDbPath(workspaceId, ownerId, 'modules_order');
        await db.ref(orderPath).set(modulesOrder);
        
        hideLoading();
    } catch (error) {
        hideLoading();
        console.error("Erro ao excluir módulo:", error);
        showError('Erro ao Excluir', 'Não foi possível excluir o módulo.');
        throw error;
    }
}

/**
 * Salva a estrutura de uma entidade
 * @param {string} moduleId - ID do módulo
 * @param {string} entityId - ID da entidade
 * @param {string} entityName - Nome da entidade
 * @param {Array} attributes - Atributos da entidade
 * @param {string} workspaceId - ID da área de trabalho
 * @param {string} ownerId - ID do dono do workspace (para escrita em workspaces partilhados)
 * @returns {Promise<void>}
 */
export async function saveEntityStructure(moduleId, entityId, entityName, attributes, workspaceId = 'default', ownerId = null) {
    showLoading('Salvando estrutura...');
    try {
        const schema = { entityName, attributes };
        const path = getDbPath(workspaceId, ownerId, `schemas/${moduleId}/${entityId}`);
        await db.ref(path).set(schema);
        
        console.log("Estrutura salva com sucesso no Firebase");
        hideLoading();
    } catch (error) {
        hideLoading();
        console.error("Erro ao salvar estrutura:", error);
        showError('Erro ao Salvar', 'Não foi possível salvar a estrutura da entidade.');
        throw error;
    }
}

/**
 * Salva a estrutura de uma sub-entidade
 * @param {string} moduleId - ID do módulo
 * @param {string} entityId - ID da entidade pai
 * @param {string} parentFieldId - ID do campo pai
 * @param {Array} attributes - Atributos da sub-entidade
 * @param {string} workspaceId - ID da área de trabalho
 * @param {string} ownerId - ID do dono do workspace (para escrita em workspaces partilhados)
 * @returns {Promise<void>}
 */
export async function saveSubEntityStructure(moduleId, entityId, parentFieldId, attributes, workspaceId = 'default', ownerId = null) {
    showLoading('Salvando estrutura...');
    try {
        const path = getDbPath(workspaceId, ownerId, `schemas/${moduleId}/${entityId}`);
        const parentSchemaSnapshot = await db.ref(path).get();
        if (parentSchemaSnapshot.exists()) {
            const parentSchema = parentSchemaSnapshot.val();
            const parentField = parentSchema.attributes.find(attr => attr.id === parentFieldId);
            if (parentField) {
                parentField.subSchema.attributes = attributes;
                await db.ref(path).set(parentSchema);
            }
        }
        
        hideLoading();
    } catch (error) {
        hideLoading();
        console.error("Erro ao salvar estrutura da sub-entidade:", error);
        showError('Erro ao Salvar', 'Não foi possível salvar a estrutura da sub-entidade.');
        throw error;
    }
}

/**
 * Salva a ordem dos módulos
 * @param {Array} orderArray - Array com os IDs dos módulos na ordem desejada
 * @param {string} workspaceId - ID da área de trabalho
 * @param {string} ownerId - ID do dono do workspace (para escrita em workspaces partilhados)
 * @returns {Promise<void>}
 */
export async function saveModulesOrder(orderArray, workspaceId = 'default', ownerId = null) {
    try {
        const path = getDbPath(workspaceId, ownerId, 'modules_order');
        modulesOrder = orderArray;
        await db.ref(path).set(modulesOrder);
    } catch (error) {
        console.error("Erro ao salvar ordem dos módulos:", error);
        showError('Erro ao Salvar', 'Não foi possível salvar a ordem dos módulos.');
        throw error;
    }
}

/**
 * Obtém a ordem atual dos módulos
 * @returns {Array} - Array com os IDs dos módulos na ordem atual
 */
export function getModulesOrder() {
    return modulesOrder;
}

/**
 * Carrega preferências do usuário do Firebase
 * @returns {Promise<Object>} - Objeto com as preferências do usuário
 */
export async function loadUserPreferences() {
    try {
        const userId = getUsuarioId();
        if (!userId) {
            throw new Error('Usuário não autenticado');
        }
        
        const snapshot = await db.ref(`users/${userId}/preferences`).get();
        if (snapshot.exists()) {
            userPreferences = snapshot.val();
        } else {
            userPreferences = {};
        }
        
        return userPreferences;
    } catch (error) {
        console.error("Erro ao carregar preferências do usuário:", error);
        return {};
    }
}

/**
 * Salva uma preferência do usuário no Firebase
 * @param {string} key - Chave da preferência
 * @param {any} value - Valor da preferência
 * @returns {Promise<void>}
 */
export async function saveUserPreference(key, value) {
    try {
        const userId = getUsuarioId();
        if (!userId) {
            throw new Error('Usuário não autenticado');
        }
        userPreferences[key] = value;
        await db.ref(`users/${userId}/preferences/${key}`).set(value);
        localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
        console.error("Erro ao salvar preferência do usuário:", error);
        localStorage.setItem(key, JSON.stringify(value));
    }
}

/**
 * Obtém uma preferência do usuário
 * @param {string} key - Chave da preferência
 * @param {any} defaultValue - Valor padrão caso a preferência não exista
 * @returns {any} - Valor da preferência
 */
export function getUserPreference(key, defaultValue = null) {
    if (userPreferences && userPreferences.hasOwnProperty(key)) {
        return userPreferences[key];
    }
    try {
        const localValue = localStorage.getItem(key);
        if (localValue !== null) {
            return JSON.parse(localValue);
        }
    } catch (e) {
        // Ignora
    }
    return defaultValue;
}

/**
 * Salva dados de uma entidade
 * @param {string} moduleId - ID do módulo
 * @param {string} entityId - ID da entidade
 * @param {Object} data - Dados a serem salvos
 * @returns {Promise<string>} - ID do registro criado
 */
export async function saveEntityData(moduleId, entityId, data) {
    try {
        showLoading('Salvando dados...');
        const userId = getUsuarioId();
        if (!userId) {
            throw new Error('Usuário não autenticado');
        }
        data['created_at'] = new Date().toISOString();
        data['updated_at'] = new Date().toISOString();
        data['created_by'] = userId;
        const newRef = db.ref(`users/${userId}/data/${moduleId}/${entityId}`).push();
        await newRef.set(data);
        hideLoading();
        return newRef.key;
    } catch (error) {
        hideLoading();
        console.error("Erro ao salvar dados:", error);
        showError('Erro ao Salvar', 'Não foi possível salvar os dados.');
        throw error;
    }
}

/**
 * Atualiza dados de um registro existente
 * @param {string} moduleId - ID do módulo
 * @param {string} entityId - ID da entidade
 * @param {string} recordId - ID do registro
 * @param {Object} data - Dados atualizados
 * @returns {Promise<void>}
 */
export async function updateEntityData(moduleId, entityId, recordId, data) {
    try {
        showLoading('Atualizando dados...');
        const userId = getUsuarioId();
        if (!userId) {
            throw new Error('Usuário não autenticado');
        }
        data['updated_at'] = new Date().toISOString();
        await db.ref(`users/${userId}/data/${moduleId}/${entityId}/${recordId}`).update(data);
        hideLoading();
    } catch (error) {
        hideLoading();
        console.error("Erro ao atualizar dados:", error);
        showError('Erro ao Atualizar', 'Não foi possível atualizar os dados.');
        throw error;
    }
}

/**
 * Carrega dados de uma entidade
 * @param {string} moduleId - ID do módulo
 * @param {string} entityId - ID da entidade
 * @returns {Promise<Array>} - Array com os dados da entidade
 */
export async function loadEntityData(moduleId, entityId) {
    try {
        const userId = getUsuarioId();
        if (!userId) {
            throw new Error('Usuário não autenticado');
        }
        const snapshot = await db.ref(`users/${userId}/data/${moduleId}/${entityId}`).get();
        if (!snapshot.exists()) {
            return [];
        }
        const data = snapshot.val();
        const records = [];
        for (const id in data) {
            records.push({
                id,
                ...data[id]
            });
        }
        return records;
    } catch (error) {
        console.error("Erro ao carregar dados:", error);
        showError('Erro ao Carregar', 'Não foi possível carregar os dados.');
        throw error;
    }
}

/**
 * Exclui um registro de dados
 * @param {string} moduleId - ID do módulo
 * @param {string} entityId - ID da entidade
 * @param {string} recordId - ID do registro
 * @returns {Promise<void>}
 */
export async function deleteEntityRecord(moduleId, entityId, recordId) {
    try {
        showLoading('Excluindo registro...');
        const userId = getUsuarioId();
        if (!userId) {
            throw new Error('Usuário não autenticado');
        }
        await db.ref(`users/${userId}/data/${moduleId}/${entityId}/${recordId}`).remove();
        hideLoading();
    } catch (error) {
        hideLoading();
        console.error("Erro ao excluir registro:", error);
        showError('Erro ao Excluir', 'Não foi possível excluir o registro.');
        throw error;
    }
}

/**
 * Carrega os recursos compartilhados com o usuário atual
 * @returns {Promise<Array>} - Lista de recursos compartilhados
 */
export async function loadSharedResources() {
    try {
        const userId = getUsuarioId();
        const userEmail = getUsuarioEmail()?.toLowerCase();
        if (!userId || !userEmail) {
            throw new Error('Usuário não autenticado');
        }
        
        const accessControlSnapshot = await db.ref(`accessControl/${userId}`).get();
        if (!accessControlSnapshot.exists()) {
            sharedResources = [];
            return [];
        }
        
        const accessControl = accessControlSnapshot.val();
        sharedResources = [];
        
        const invitationsSnapshot = await db.ref('invitations').orderByChild('toEmail').equalTo(userEmail).once('value');
        if (invitationsSnapshot.exists()) {
            invitationsSnapshot.forEach(childSnapshot => {
                const invite = childSnapshot.val();
                if (invite.status === 'accepted' && accessControl[invite.resourceId]) {
                    sharedResources.push({
                        id: invite.resourceId,
                        ownerId: invite.fromUserId,
                        ownerName: invite.fromUserName || "Usuário",
                        type: invite.resourceType || "workspace",
                        role: accessControl[invite.resourceId]
                    });
                }
            });
        }
        return sharedResources;
    } catch (error) {
        console.error("Erro ao carregar recursos compartilhados:", error);
        return [];
    }
}

/**
 * Obtém os recursos compartilhados carregados
 * @returns {Array} - Lista de recursos compartilhados
 */
export function getSharedResources() {
    return sharedResources;
}

/**
 * Verifica se o usuário tem acesso a um recurso específico
 * @param {string} resourceId - ID do recurso
 * @returns {Promise<string|null>} - Tipo de acesso ou null se não tiver acesso
 */
export async function checkResourceAccess(resourceId) {
    try {
        const userId = getUsuarioId();
        if (!userId) return null;
        const snapshot = await db.ref(`accessControl/${userId}/${resourceId}`).get();
        return snapshot.exists() ? snapshot.val() : null;
    } catch (error) {
        console.error("Erro ao verificar acesso ao recurso:", error);
        return null;
    }
}

/**
 * Carrega módulos compartilhados de outro usuário
 * @param {string} ownerId - ID do usuário dono dos recursos
 * @param {string} workspaceId - ID da área de trabalho compartilhada
 * @returns {Promise<Array>} - Lista de módulos compartilhados
 */
export async function loadSharedUserModules(ownerId, workspaceId = 'default') {
    try {
        if (!ownerId) throw new Error('ID do usuário dono não fornecido');
        const snapshot = await db.ref(`users/${ownerId}/workspaces/${workspaceId}/modules`).get();
        if (!snapshot.exists()) return [];
        
        const modules = snapshot.val();
        const modulesList = [];
        for (const moduleId in modules) {
            modulesList.push({
                id: moduleId,
                ...modules[moduleId],
                isShared: true,
                ownerId: ownerId
            });
        }
        return modulesList;
    } catch (error) {
        console.error("Erro ao carregar módulos compartilhados:", error);
        showError('Erro de Dados', 'Não foi possível carregar os módulos compartilhados.');
        return [];
    }
}

/**
 * Carrega entidades de uma área de trabalho compartilhada
 * @param {string} ownerId - ID do usuário dono dos recursos
 * @param {string} workspaceId - ID da área de trabalho compartilhada
 * @returns {Promise<Array>} - Lista de entidades compartilhadas
 */
export async function loadSharedUserEntities(ownerId, workspaceId = 'default') {
    try {
        if (!ownerId) throw new Error('ID do usuário dono não fornecido');
        const snapshot = await db.ref(`users/${ownerId}/workspaces/${workspaceId}/entities`).get();
        if (!snapshot.exists()) return [];

        const entities = snapshot.val();
        const entitiesList = [];
        for (const entityId in entities) {
            entitiesList.push({
                id: entityId,
                ...entities[entityId],
                isShared: true,
                ownerId: ownerId
            });
        }
        return entitiesList;
    } catch (error) {
        console.error("Erro ao carregar entidades compartilhadas:", error);
        showError('Erro de Dados', 'Não foi possível carregar as entidades compartilhadas.');
        return [];
    }
}

/**
 * Carrega esquemas de uma área de trabalho compartilhada
 * @param {string} ownerId - ID do usuário dono dos recursos
 * @param {string} workspaceId - ID da área de trabalho compartilhada
 * @param {string} moduleId - ID do módulo
 * @returns {Promise<Object>} - Esquemas do módulo compartilhado
 */
export async function loadSharedModuleSchemas(ownerId, workspaceId = 'default', moduleId) {
    try {
        if (!ownerId || !moduleId) throw new Error('Parâmetros necessários não fornecidos');
        const snapshot = await db.ref(`users/${ownerId}/workspaces/${workspaceId}/schemas/${moduleId}`).get();
        return snapshot.exists() ? snapshot.val() : {};
    } catch (error) {
        console.error("Erro ao carregar esquemas compartilhados:", error);
        return {};
    }
}

/**
 * Carrega a estrutura de uma entidade em área de trabalho compartilhada
 * @param {string} moduleId - ID do módulo
 * @param {string} entityId - ID da entidade
 * @param {string} workspaceId - ID da área de trabalho
 * @param {string} ownerId - ID do usuário dono dos recursos
 * @returns {Promise<Object|null>} - Estrutura da entidade ou null se não encontrar
 */
export async function loadStructureForEntityShared(moduleId, entityId, workspaceId = 'default', ownerId) {
    try {
        if (!ownerId) throw new Error('ID do usuário dono não fornecido');
        const snapshot = await db.ref(`users/${ownerId}/workspaces/${workspaceId}/schemas/${moduleId}/${entityId}`).get();
        return snapshot.exists() ? snapshot.val() : null;
    } catch (error) {
        console.error("Erro ao carregar estrutura da entidade compartilhada:", error);
        return null;
    }
}
