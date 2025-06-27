import { getUsuarioId, getUsuarioEmail } from './autenticacao.js';
import { showError, showLoading, hideLoading } from './ui.js';
import { TIPS_STATE } from './config.js';

// Variáveis do módulo
let db;
let allEntities = [];
let modulesOrder = []; // Armazena a ordem dos módulos
let userPreferences = {}; // Armazena preferências do usuário
let sharedResources = []; // Armazena recursos compartilhados com o usuário

// Função auxiliar para determinar o caminho do banco de dados
function getDbPath(workspaceId, ownerId, path = '') {
    const currentUserId = getUsuarioId();
    const targetUserId = ownerId || currentUserId;
    if (!targetUserId) {
        console.error("Error: Target user ID is null in getDbPath.");
        // Potentially throw an error or return a clearly invalid path
        // For now, this matches existing behavior of functions that would fail later.
    }
    let basePath = `users/${targetUserId}/workspaces/${workspaceId}`;
    if (path) {
        basePath += `/${path}`;
    }
    return basePath;
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
    const readPath = getDbPath(workspaceId, ownerId, 'entities');
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
    const modulesPath = getDbPath(workspaceId, ownerId, 'modules');
    console.log(`[loadAndRenderModules] Carregando de: ${modulesPath}`);
    
    try {
        const snapshot = await db.ref(modulesPath).get();
        if (!snapshot.exists()) {
            console.log("[loadAndRenderModules] Nenhum módulo encontrado.");
            return [];
        }
        
        const modules = snapshot.val();
        
        const orderPath = getDbPath(workspaceId, ownerId, 'modules_order');
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
    const schemasPath = getDbPath(workspaceId, ownerId, 'schemas');
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
    try {
        const path = getDbPath(workspaceId, ownerId, `schemas/${moduleId}/${entityId}`);
        
        console.log("Carregando estrutura do Firebase:", {
            path,
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
 * @param {string} ownerId - ID do dono da área de trabalho (opcional)
 * @returns {Promise<string>} - ID da entidade criada
 */
export async function createEntity(entityData, workspaceId = 'default', ownerId = null) {
    try {
        showLoading('Criando entidade...');
        
        const path = getDbPath(workspaceId, ownerId, 'entities');
        const newEntityRef = db.ref(path).push();
        await newEntityRef.set(entityData);
        
        // Atualiza a lista local apenas se não for uma operação em workspace compartilhado (ou se ownerId for o do usuário atual)
        // A lógica de atualização de 'allEntities' pode precisar ser mais sofisticada
        // se entidades de múltiplos workspaces (próprios e compartilhados) forem gerenciadas centralmente.
        // Por ora, só atualiza se ownerId não for fornecido (implica ser do usuário atual).
        if (!ownerId || ownerId === getUsuarioId()) {
            allEntities.push({ ...entityData, id: newEntityRef.key });
        }
        
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
 * @param {string} ownerId - ID do dono da área de trabalho (opcional)
 * @returns {Promise<string>} - ID do módulo criado
 */
export async function createModule(name, workspaceId = 'default', ownerId = null) {
    try {
        showLoading('Criando módulo...');
        
        const modulesPath = getDbPath(workspaceId, ownerId, 'modules');
        const newModuleRef = db.ref(modulesPath).push();
        const newModuleData = { id: newModuleRef.key, name }; // Ensure id is part of the data written
        await newModuleRef.set(newModuleData);
        
        // Adiciona à ordem de módulos - esta lógica pode precisar de ajuste
        // Se ownerId for diferente do usuário atual, a atualização de modulesOrder local pode ser incorreta.
        // A ordem dos módulos deve ser salva no caminho do proprietário.
        if (!ownerId || ownerId === getUsuarioId()) {
            modulesOrder.push(newModuleRef.key);
        }
        // Sempre salva a ordem no caminho correto (do dono ou do usuário atual)
        const orderPath = getDbPath(workspaceId, ownerId, 'modules_order');
        // Para ler a ordem atual antes de modificar, precisamos de uma leitura assíncrona.
        // Temporariamente, se for compartilhado, vamos apenas adicionar, o que pode levar a duplicatas se não for tratado corretamente no carregamento.
        // Uma solução mais robusta seria ler a ordem, adicionar e depois salvar.
        const currentOrderSnapshot = await db.ref(orderPath).get();
        let currentOrder = [];
        if (currentOrderSnapshot.exists()) {
            currentOrder = currentOrderSnapshot.val();
        }
        if (!currentOrder.includes(newModuleRef.key)) {
            currentOrder.push(newModuleRef.key);
        }
        await db.ref(orderPath).set(currentOrder);
        
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
 * @param {string} ownerId - ID do dono da área de trabalho (opcional)
 * @returns {Promise<void>}
 */
export async function saveEntityToModule(moduleId, entityId, entityName, workspaceId = 'default', ownerId = null) {
    try {
        const path = getDbPath(workspaceId, ownerId, `schemas/${moduleId}/${entityId}`);
        const snapshot = await db.ref(path).get();
        
        if (!snapshot.exists()) {
            // Garante que, ao salvar, estamos usando o entityName fornecido, e inicializamos 'attributes' como um array vazio.
            await db.ref(path).set({ entityName: entityName, attributes: [] });
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
 * @param {string} ownerId - ID do dono da área de trabalho (opcional)
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
 * @param {string} ownerId - ID do dono da área de trabalho (opcional)
 * @returns {Promise<void>}
 */
export async function deleteEntity(entityId, workspaceId = 'default', ownerId = null) {
    try {
        showLoading('Excluindo entidade...');
        
        const entityPath = getDbPath(workspaceId, ownerId, `entities/${entityId}`);
        await db.ref(entityPath).remove();
        
        // Remove a entidade de todos os módulos no caminho correto
        const schemasPath = getDbPath(workspaceId, ownerId, 'schemas');
        const snapshot = await db.ref(schemasPath).get();
        if (snapshot.exists()) {
            const updates = {};
            snapshot.forEach(moduleSnapshot => {
                const moduleId = moduleSnapshot.key;
                if (moduleSnapshot.hasChild(entityId)) {
                    updates[`${schemasPath}/${moduleId}/${entityId}`] = null;
                }
            });
            if (Object.keys(updates).length > 0) {
                await db.ref().update(updates);
            }
        }
        
        // Atualiza a lista local apenas se a operação for no workspace do usuário atual
        if (!ownerId || ownerId === getUsuarioId()) {
            allEntities = allEntities.filter(e => e.id !== entityId);
        }
        
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
 * @param {string} ownerId - ID do dono da área de trabalho (opcional)
 * @returns {Promise<void>}
 */
export async function deleteModule(moduleId, workspaceId = 'default', ownerId = null) {
    try {
        showLoading('Excluindo módulo...');
        
        const modulePath = getDbPath(workspaceId, ownerId, `modules/${moduleId}`);
        await db.ref(modulePath).remove();
        
        const schemaPath = getDbPath(workspaceId, ownerId, `schemas/${moduleId}`);
        await db.ref(schemaPath).remove();
        
        // Atualiza a ordem de módulos
        // Esta parte precisa ler a ordem atual do DB, remover o ID e salvar.
        const orderPath = getDbPath(workspaceId, ownerId, 'modules_order');
        const orderSnapshot = await db.ref(orderPath).get();
        if (orderSnapshot.exists()) {
            let currentOrder = orderSnapshot.val();
            currentOrder = currentOrder.filter(id => id !== moduleId);
            await db.ref(orderPath).set(currentOrder);
            // Atualiza a ordem local apenas se for o workspace do usuário atual
            if (!ownerId || ownerId === getUsuarioId()) {
                modulesOrder = currentOrder;
            }
        }
        
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
 * @param {string} ownerId - ID do dono da área de trabalho (opcional)
 * @returns {Promise<void>}
 */
export async function saveEntityStructure(moduleId, entityId, entityName, attributes, workspaceId = 'default', ownerId = null) {
    try {
        showLoading('Salvando estrutura...');
        
        const schema = { entityName, attributes };
        const path = getDbPath(workspaceId, ownerId, `schemas/${moduleId}/${entityId}`);
        
        console.log("Salvando estrutura no Firebase:", {
            path,
            schema,
            workspaceId,
            moduleId,
            entityId,
            ownerId,
            attributesCount: attributes.length
        });
        
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
 * @param {string} ownerId - ID do dono da área de trabalho (opcional)
 * @returns {Promise<void>}
 */
export async function saveSubEntityStructure(moduleId, entityId, parentFieldId, attributes, workspaceId = 'default', ownerId = null) {
    try {
        showLoading('Salvando estrutura...');
        
        const schemaPath = getDbPath(workspaceId, ownerId, `schemas/${moduleId}/${entityId}`);
        const parentSchemaSnapshot = await db.ref(schemaPath).get();
        
        if (parentSchemaSnapshot.exists()) {
            const parentSchema = parentSchemaSnapshot.val();
            const parentField = parentSchema.attributes.find(attr => attr.id === parentFieldId);
            
            if (parentField) {
                // Certifique-se de que subSchema existe
                if (!parentField.subSchema) {
                    parentField.subSchema = {};
                }
                parentField.subSchema.attributes = attributes;
                await db.ref(schemaPath).set(parentSchema);
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
 * @param {string} ownerId - ID do dono da área de trabalho (opcional)
 * @returns {Promise<void>}
 */
export async function saveModulesOrder(orderArray, workspaceId = 'default', ownerId = null) {
    try {
        const orderPath = getDbPath(workspaceId, ownerId, 'modules_order');
        
        // Atualiza a variável global somente se estiver operando no workspace do usuário logado
        if (!ownerId || ownerId === getUsuarioId()) {
            modulesOrder = orderArray;
        }
        
        // Salva no Firebase
        await db.ref(orderPath).set(orderArray);
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
 * @param {string} workspaceId - ID da área de trabalho (necessário para getDbPath, mas dados são salvos fora de workspaces)
 * @param {string} ownerId - ID do dono da área de trabalho (opcional, para consistência, mas dados são salvos fora de workspaces)
 * @returns {Promise<string>} - ID do registro criado
 */
// Nota: A estrutura de 'data' parece ser global para o usuário, não por workspace.
// Se a intenção for salvar dados *dentro* de um workspace, a lógica de getDbPath e o caminho do DB precisam mudar aqui.
// Assumindo que 'users/${userId}/data/' é o caminho correto e não depende de workspaceId/ownerId para o path em si,
// mas ownerId pode ser usado para determinar o 'userId' no caminho se a lógica de 'created_by' for diferente para dados em workspaces compartilhados.
// Por ora, mantendo a lógica original de usar getUsuarioId() para o caminho, pois 'data' está fora de 'workspaces'.
// Se 'data' DEVE ser por workspace, esta função e as relacionadas (update, load, deleteEntityRecord) precisam de uma revisão maior.
export async function saveEntityData(moduleId, entityId, data, workspaceId = 'default', ownerId = null) {
    try {
        showLoading('Salvando dados...');
        
        const currentUserId = getUsuarioId(); // Quem está realizando a ação
        const targetUserId = ownerId || currentUserId; // Onde os dados do workspace "original" estão.
                                                  // No entanto, a estrutura 'data' está em users/${userId}/data, não users/${userId}/workspaces/.../data

        if (!currentUserId) {
            throw new Error('Usuário não autenticado');
        }
        
        data['created_at'] = new Date().toISOString();
        data['updated_at'] = new Date().toISOString();
        data['created_by'] = currentUserId; // Quem criou o registro
        
        // O caminho para 'data' não parece ser por workspace na estrutura atual.
        // Se for para ser por workspace, o path `users/${targetUserId}/workspaces/${workspaceId}/data/...` seria mais apropriado.
        // Mantendo o path original por enquanto:
        const dataPath = `users/${currentUserId}/data/${moduleId}/${entityId}`;
        // Se a intenção é que os dados fiquem sob o ownerId:
        // const dataPath = `users/${targetUserId}/data/${moduleId}/${entityId}`; // <-- Revisar esta decisão.
                                                                            // Se um editor adiciona dados a um workspace compartilhado,
                                                                            // onde esses dados devem residir? Sob o editor ou sob o dono?
                                                                            // As regras de segurança atuais não cobrem 'data'.
                                                                            // Vamos assumir por agora que os dados são sempre do usuário que os cria.

        const newRef = db.ref(dataPath).push();
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
 * @param {string} workspaceId - ID da área de trabalho (para consistência, ver nota em saveEntityData)
 * @param {string} ownerId - ID do dono (para consistência, ver nota em saveEntityData)
 * @returns {Promise<void>}
 */
export async function updateEntityData(moduleId, entityId, recordId, data, workspaceId = 'default', ownerId = null) {
    try {
        showLoading('Atualizando dados...');
        
        const currentUserId = getUsuarioId(); // Quem está realizando a ação
        // const targetUserId = ownerId || currentUserId; // Para referência se a lógica de path mudar.

        if (!currentUserId) {
            throw new Error('Usuário não autenticado');
        }
        
        data['updated_at'] = new Date().toISOString();
        
        // Mantendo a lógica original de path para 'data' (sob o usuário que executa a ação)
        const dataPath = `users/${currentUserId}/data/${moduleId}/${entityId}/${recordId}`;
        // Se a intenção for que os dados fiquem sob o ownerId:
        // const dataPath = `users/${targetUserId}/data/${moduleId}/${entityId}/${recordId}`;
        await db.ref(dataPath).update(data);
        
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
 * @param {string} workspaceId - ID da área de trabalho (para consistência)
 * @param {string} ownerId - ID do dono (para determinar de qual usuário carregar os dados)
 * @returns {Promise<Array>} - Array com os dados da entidade
 */
export async function loadEntityData(moduleId, entityId, workspaceId = 'default', ownerId = null) {
    try {
        // Para carregar dados, precisamos saber de qual usuário carregar.
        // Se for um workspace compartilhado, idealmente carregaríamos os dados do ownerId.
        // Se for o workspace próprio do usuário, usamos o currentUserId.
        const currentUserId = getUsuarioId();
        const targetUserId = ownerId || currentUserId; 

        if (!targetUserId) {
            throw new Error('Usuário não autenticado ou ID do dono não especificado para recurso compartilhado.');
        }
        
        // Assumindo que os dados estão em users/${targetUserId}/data/...
        const dataPath = `users/${targetUserId}/data/${moduleId}/${entityId}`;
        const snapshot = await db.ref(dataPath).get();
        
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
 * @param {string} workspaceId - ID da área de trabalho (para consistência)
 * @param {string} ownerId - ID do dono (para consistência, ver nota em saveEntityData)
 * @returns {Promise<void>}
 */
export async function deleteEntityRecord(moduleId, entityId, recordId, workspaceId = 'default', ownerId = null) {
    try {
        showLoading('Excluindo registro...');
        
        const currentUserId = getUsuarioId(); // Quem está realizando a ação
        // const targetUserId = ownerId || currentUserId; // Para referência se a lógica de path mudar.

        if (!currentUserId) {
            throw new Error('Usuário não autenticado');
        }
        
        // Mantendo a lógica original de path para 'data' (sob o usuário que executa a ação)
        const dataPath = `users/${currentUserId}/data/${moduleId}/${entityId}/${recordId}`;
        // Se a intenção for que os dados fiquem sob o ownerId:
        // const dataPath = `users/${targetUserId}/data/${moduleId}/${entityId}/${recordId}`;
        await db.ref(dataPath).remove();
        
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
        const modulesPath = getDbPath(workspaceId, ownerId, 'modules');
        console.log(`Carregando módulos compartilhados de: ${modulesPath}`);
        
        const snapshot = await db.ref(modulesPath).get();
        if (!snapshot.exists()) {
            console.log(`Nenhum módulo encontrado em ${modulesPath}`);
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
        const entitiesPath = getDbPath(workspaceId, ownerId, 'entities');
        console.log(`Carregando entidades compartilhadas de: ${entitiesPath}`);
        
        const snapshot = await db.ref(entitiesPath).get();
        if (!snapshot.exists()) {
            console.log(`Nenhuma entidade encontrada em ${entitiesPath}`);
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
        const schemasPath = getDbPath(workspaceId, ownerId, `schemas/${moduleId}`);
        console.log(`Carregando esquemas compartilhados de: ${schemasPath}`);
        
        const snapshot = await db.ref(schemasPath).get();
        if (!snapshot.exists()) {
            console.log(`Nenhum esquema encontrado em ${schemasPath}`);
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
        const structurePath = getDbPath(workspaceId, ownerId, `schemas/${moduleId}/${entityId}`);
        console.log(`Carregando estrutura compartilhada de: ${structurePath}`);
        
        const snapshot = await db.ref(structurePath).get();
        if (!snapshot.exists()) {
            console.log(`Estrutura não encontrada em ${structurePath}`);
            return null;
        }
        
        return snapshot.val();
    } catch (error) {
        console.error("Erro ao carregar estrutura da entidade compartilhada:", error);
        return null;
    }
}
