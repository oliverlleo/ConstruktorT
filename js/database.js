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
 * Inicializa o módulo de banco de dados
 * @param {Object} firebase - Instância do Firebase
 * @returns {Promise<void>}
 */
export async function initDatabase(firebase) {
    try {
        db = firebase.database();
        
        // Carrega preferências do usuário
        await loadUserPreferences();
        
        // Carrega recursos compartilhados com o usuário
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
    try {
        const userId = ownerId || getUsuarioId();
        if (!userId) {
            throw new Error('Usuário não autenticado');
        }
        
        console.log(`Buscando entidades para a área de trabalho: ${workspaceId} do usuário: ${userId}`);
        const snapshot = await db.ref(`users/${userId}/workspaces/${workspaceId}/entities`).get();
        allEntities = [];
        
        if (snapshot.exists()) {
            console.log("Entidades encontradas no Firebase");
            const customEntities = snapshot.val();
            for (const entityId in customEntities) {
                console.log(`Processando entidade: ${entityId}`, customEntities[entityId]);
                allEntities.push({ ...customEntities[entityId], id: entityId });
            }
        } else {
            console.log("Nenhuma entidade encontrada no Firebase");
        }
        
        console.log(`Total de entidades carregadas: ${allEntities.length}`);
        return allEntities;
    } catch (error) {
        console.error("Erro ao carregar entidades:", error);
        showError('Erro de Dados', 'Não foi possível carregar as entidades.');
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
    try {
        const userId = ownerId || getUsuarioId();
        if (!userId) {
            throw new Error('Usuário não autenticado');
        }
        
        const snapshot = await db.ref(`users/${userId}/workspaces/${workspaceId}/modules`).get();
        if (!snapshot.exists()) {
            return [];
        }
        
        const modules = snapshot.val();
        
        // Verifica se há uma ordem personalizada salva
        const orderSnapshot = await db.ref(`users/${userId}/workspaces/${workspaceId}/modules_order`).get();
        if (orderSnapshot.exists()) {
            modulesOrder = orderSnapshot.val();
            
            // Filtra IDs inválidos (módulos que não existem mais)
            modulesOrder = modulesOrder.filter(id => modules[id]);
            
            // Adiciona quaisquer novos módulos que não estejam na ordem
            Object.keys(modules).forEach(moduleId => {
                if (!modulesOrder.includes(moduleId)) {
                    modulesOrder.push(moduleId);
                }
            });
        } else {
            // Se não houver ordem personalizada, usa a ordem padrão
            modulesOrder = Object.keys(modules);
        }
        
        // Renderiza os módulos na ordem salva
        if (renderCallback) {
            modulesOrder.forEach(moduleId => {
                if (modules[moduleId]) { // Verifica se o módulo ainda existe
                    renderCallback({ ...modules[moduleId], id: moduleId });
                }
            });
        }
        
        return modulesOrder.map(moduleId => ({...modules[moduleId], id: moduleId}));
    } catch (error) {
        console.error("Erro ao carregar módulos:", error);
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
    try {
        const userId = ownerId || getUsuarioId();
        if (!userId) {
            throw new Error('Usuário não autenticado');
        }
        
        const snapshot = await db.ref(`users/${userId}/workspaces/${workspaceId}/schemas`).get();
        if (!snapshot.exists()) {
            return {};
        }
        
        const schemas = snapshot.val();
        
        if (renderCallback) {
            for (const moduleId in schemas) {
                for (const entityId in schemas[moduleId]) {
                    if (!schemas[moduleId][entityId]) continue;
                    
                    const entityInfo = allEntities.find(e => e.id === entityId);
                    if (!entityInfo) continue;
                    
                    renderCallback(moduleId, entityId, schemas[moduleId][entityId], entityInfo);
                }
            }
        }
        
        return schemas;
    } catch (error) {
        console.error("Erro ao carregar entidades dos módulos:", error);
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
    try {
        const userId = ownerId || getUsuarioId();
        if (!userId) {
            throw new Error('Usuário não autenticado');
        }
        
        const path = `users/${userId}/workspaces/${workspaceId}/schemas/${moduleId}/${entityId}`;
        
        console.log("Carregando estrutura do Firebase:", {
            path,
            userId,
            workspaceId,
            moduleId,
            entityId,
            ownerId
        });
        
        const snapshot = await db.ref(path).get();
        if (!snapshot.exists()) {
            console.log("Nenhuma estrutura encontrada no Firebase para:", path);
            return { attributes: [] };
        }
        
        const structure = snapshot.val();
        console.log("Estrutura carregada do Firebase:", structure);
        
        return structure;
    } catch (error) {
        console.error("Erro ao carregar estrutura da entidade:", error);
        showError('Erro de Dados', 'Não foi possível carregar a estrutura da entidade.');
        throw error;
    }
}

/**
 * Cria uma nova entidade na área de trabalho atual
 * @param {Object} entityData - Dados da nova entidade
 * @param {string} workspaceId - ID da área de trabalho
 * @returns {Promise<string>} - ID da entidade criada
 */
export async function createEntity(entityData, workspaceId = 'default') {
    try {
        showLoading('Criando entidade...');
        
        const userId = getUsuarioId();
        if (!userId) {
            throw new Error('Usuário não autenticado');
        }
        
        const newEntityRef = db.ref(`users/${userId}/workspaces/${workspaceId}/entities`).push();
        await newEntityRef.set(entityData);
        
        // Atualiza a lista local
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
 * @returns {Promise<string>} - ID do módulo criado
 */
export async function createModule(name, workspaceId = 'default') {
    try {
        showLoading('Criando módulo...');
        
        const userId = getUsuarioId();
        if (!userId) {
            throw new Error('Usuário não autenticado');
        }
        
        const newModuleRef = db.ref(`users/${userId}/workspaces/${workspaceId}/modules`).push();
        const newModuleData = { id: newModuleRef.key, name };
        await newModuleRef.set(newModuleData);
        
        // Adiciona à ordem de módulos
        modulesOrder.push(newModuleRef.key);
        await db.ref(`users/${userId}/workspaces/${workspaceId}/modules_order`).set(modulesOrder);
        
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
 * @returns {Promise<void>}
 */
export async function saveEntityToModule(moduleId, entityId, entityName, workspaceId = 'default') {
    try {
        const userId = getUsuarioId();
        if (!userId) {
            throw new Error('Usuário não autenticado');
        }
        
        // Caminho corrigido para incluir workspaceId
        const path = `users/${userId}/workspaces/${workspaceId}/schemas/${moduleId}/${entityId}`;
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
 * @returns {Promise<void>}
 */
export async function deleteEntityFromModule(moduleId, entityId, workspaceId = 'default') {
    try {
        const userId = getUsuarioId();
        if (!userId) {
            throw new Error('Usuário não autenticado');
        }
        
        // Caminho corrigido para incluir workspaceId
        await db.ref(`users/${userId}/workspaces/${workspaceId}/schemas/${moduleId}/${entityId}`).remove();
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
 * @returns {Promise<void>}
 */
export async function deleteEntity(entityId, workspaceId = 'default') {
    try {
        showLoading('Excluindo entidade...');
        
        const userId = getUsuarioId();
        if (!userId) {
            throw new Error('Usuário não autenticado');
        }
        
        // Remove a entidade da lista de entidades
        await db.ref(`users/${userId}/workspaces/${workspaceId}/entities/${entityId}`).remove();
        
        // Remove a entidade de todos os módulos
        const snapshot = await db.ref(`users/${userId}/workspaces/${workspaceId}/schemas`).get();
        if (snapshot.exists()) {
            const updates = {};
            for (const moduleId in snapshot.val()) { 
                updates[`/users/${userId}/workspaces/${workspaceId}/schemas/${moduleId}/${entityId}`] = null;
            }
            await db.ref().update(updates);
        }
        
        // Atualiza a lista local
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
 * @returns {Promise<void>}
 */
export async function deleteModule(moduleId, workspaceId = 'default') {
    try {
        showLoading('Excluindo módulo...');
        
        const userId = getUsuarioId();
        if (!userId) {
            throw new Error('Usuário não autenticado');
        }
        
        // Remove o módulo
        await db.ref(`users/${userId}/workspaces/${workspaceId}/modules/${moduleId}`).remove();
        
        // Remove os schemas associados ao módulo
        await db.ref(`users/${userId}/workspaces/${workspaceId}/schemas/${moduleId}`).remove();
        
        // Atualiza a ordem de módulos
        modulesOrder = modulesOrder.filter(id => id !== moduleId);
        await db.ref(`users/${userId}/workspaces/${workspaceId}/modules_order`).set(modulesOrder);
        
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
 * @returns {Promise<void>}
 */
export async function saveEntityStructure(moduleId, entityId, entityName, attributes, workspaceId = 'default') {
    try {
        showLoading('Salvando estrutura...');
        
        const userId = getUsuarioId();
        if (!userId) {
            throw new Error('Usuário não autenticado');
        }
        
        const schema = { entityName, attributes };
        const path = `users/${userId}/workspaces/${workspaceId}/schemas/${moduleId}/${entityId}`;
        
        console.log("Salvando estrutura no Firebase:", {
            path,
            schema,
            userId,
            workspaceId,
            moduleId,
            entityId,
            attributesCount: attributes.length
        });
        
        // Caminho corrigido para incluir workspaceId
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
 * @returns {Promise<void>}
 */
export async function saveSubEntityStructure(moduleId, entityId, parentFieldId, attributes, workspaceId = 'default') {
    try {
        showLoading('Salvando estrutura...');
        
        const userId = getUsuarioId();
        if (!userId) {
            throw new Error('Usuário não autenticado');
        }
        
        // Caminho corrigido para incluir workspaceId
        const parentSchemaSnapshot = await db.ref(`users/${userId}/workspaces/${workspaceId}/schemas/${moduleId}/${entityId}`).get();
        if (parentSchemaSnapshot.exists()) {
            const parentSchema = parentSchemaSnapshot.val();
            const parentField = parentSchema.attributes.find(attr => attr.id === parentFieldId);
            
            if (parentField) {
                parentField.subSchema.attributes = attributes;
                await db.ref(`users/${userId}/workspaces/${workspaceId}/schemas/${moduleId}/${entityId}`).set(parentSchema);
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
 * @returns {Promise<void>}
 */
export async function saveModulesOrder(orderArray) {
    try {
        const userId = getUsuarioId();
        if (!userId) {
            throw new Error('Usuário não autenticado');
        }
        
        // Atualiza a variável global
        modulesOrder = orderArray;
        
        // Salva no Firebase
        await db.ref(`users/${userId}/modules_order`).set(modulesOrder);
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
        
        // Atualiza o objeto local de preferências
        userPreferences[key] = value;
        
        // Salva no Firebase
        await db.ref(`users/${userId}/preferences/${key}`).set(value);
        
        // Também salva no localStorage como fallback
        localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
        console.error("Erro ao salvar preferência do usuário:", error);
        // Fallback para localStorage se o Firebase falhar
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
    // Primeiro verifica no objeto carregado do Firebase
    if (userPreferences && userPreferences.hasOwnProperty(key)) {
        return userPreferences[key];
    }
    
    // Depois tenta do localStorage como fallback
    try {
        const localValue = localStorage.getItem(key);
        if (localValue !== null) {
            return JSON.parse(localValue);
        }
    } catch (e) {
        // Se não conseguir ler do localStorage, ignora
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
        
        // Adiciona timestamp
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
        
        // Adiciona timestamp de atualização
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
        
        console.log("Carregando recursos compartilhados para o usuário:", userId);
        
        // Verifica permissões do usuário
        const accessControlSnapshot = await db.ref(`accessControl/${userId}`).get();
        if (!accessControlSnapshot.exists()) {
            console.log("Nenhum recurso compartilhado encontrado para o usuário:", userId);
            sharedResources = [];
            return [];
        }
        
        const accessControl = accessControlSnapshot.val();
        console.log("Permissões encontradas:", accessControl);
        
        // Lista para armazenar os recursos compartilhados
        sharedResources = [];
        
        try {
            // Busca todos os convites aceitos enviados para este usuário
            const invitationsSnapshot = await db.ref('invitations')
                .orderByChild('toEmail')
                .equalTo(userEmail)
                .once('value');
            
            if (!invitationsSnapshot.exists()) {
                console.log("Nenhum convite encontrado para o usuário:", userEmail);
                return [];
            }
            
            // Processa cada convite
            invitationsSnapshot.forEach(childSnapshot => {
                const invite = childSnapshot.val();
                const resourceId = invite.resourceId;
                
                // Verifica se é um convite aceito e se o usuário tem permissão no accessControl
                if (invite.status === 'accepted' && accessControl[resourceId]) {
                    // Adiciona o recurso à lista
                    sharedResources.push({
                        id: resourceId,
                        ownerId: invite.fromUserId,
                        ownerName: invite.fromUserName || "Usuário",
                        type: invite.resourceType || "workspace",
                        role: accessControl[resourceId]
                    });
                }
            });
            
            console.log("Recursos compartilhados carregados:", sharedResources);
            return sharedResources;
        } catch (inviteError) {
            console.error("Erro ao buscar convites:", inviteError);
            return [];
        }
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
        if (!ownerId) {
            throw new Error('ID do usuário dono não fornecido');
        }
        
        console.log(`Carregando módulos compartilhados do usuário ${ownerId}, workspace ${workspaceId}`);
        
        const snapshot = await db.ref(`users/${ownerId}/workspaces/${workspaceId}/modules`).get();
        if (!snapshot.exists()) {
            console.log(`Nenhum módulo encontrado para ${ownerId}/workspaces/${workspaceId}/modules`);
            return [];
        }
        
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
        if (!ownerId) {
            throw new Error('ID do usuário dono não fornecido');
        }
        
        console.log(`Carregando entidades compartilhadas do usuário ${ownerId}, workspace ${workspaceId}`);
        
        const snapshot = await db.ref(`users/${ownerId}/workspaces/${workspaceId}/entities`).get();
        if (!snapshot.exists()) {
            console.log(`Nenhuma entidade encontrada para ${ownerId}/workspaces/${workspaceId}/entities`);
            return [];
        }
        
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
        if (!ownerId || !moduleId) {
            throw new Error('Parâmetros necessários não fornecidos');
        }
        
        console.log(`Carregando esquemas compartilhados: ${ownerId}/workspaces/${workspaceId}/schemas/${moduleId}`);
        
        const snapshot = await db.ref(`users/${ownerId}/workspaces/${workspaceId}/schemas/${moduleId}`).get();
        if (!snapshot.exists()) {
            console.log(`Nenhum esquema encontrado para o módulo ${moduleId}`);
            return {};
        }
        
        return snapshot.val();
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
        if (!ownerId) {
            throw new Error('ID do usuário dono não fornecido');
        }
        
        console.log(`Carregando estrutura compartilhada para entidade: ${moduleId}/${entityId} do usuário ${ownerId}`);
        
        const snapshot = await db.ref(`users/${ownerId}/workspaces/${workspaceId}/schemas/${moduleId}/${entityId}`).get();
        if (!snapshot.exists()) {
            console.log(`Estrutura não encontrada para ${moduleId}/${entityId} do usuário ${ownerId}`);
            return null;
        }
        
        return snapshot.val();
    } catch (error) {
        console.error("Erro ao carregar estrutura da entidade compartilhada:", error);
        return null;
    }
}