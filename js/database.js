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
        db = firebase.firestore();
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
    const collectionPath = `users/${targetUserId}/workspaces/${workspaceId}/entities`;
    console.log(`[loadAllEntities] Caminho de leitura: ${collectionPath}`);

    try {
        const snapshot = await db.collection(collectionPath).get();
        allEntities = [];
        
        if (!snapshot.empty) {
            console.log("[loadAllEntities] Entidades encontradas no Firestore.");
            snapshot.forEach(doc => {
                allEntities.push({ id: doc.id, ...doc.data() });
            });
        } else {
            console.log("[loadAllEntities] Nenhuma entidade encontrada no Firestore neste caminho.");
        }
        
        console.log(`[loadAllEntities] Sucesso. Total de entidades carregadas: ${allEntities.length}`);
        return allEntities;
    } catch (error) {
        console.error(`[loadAllEntities] Falha ao carregar entidades do caminho: ${collectionPath}`, error);
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
    const currentUserId = getUsuarioId();
    const targetUserId = ownerId || currentUserId;
    const collectionPath = `users/${targetUserId}/workspaces/${workspaceId}/modules`;
    console.log(`[loadAndRenderModules] Carregando de: ${collectionPath}`);
    
    try {
        const snapshot = await db.collection(collectionPath).orderBy('order').get();
        if (snapshot.empty) {
            console.log("[loadAndRenderModules] Nenhum módulo encontrado.");
            return [];
        }
        
        const modules = {};
        const orderedModules = [];
        
        snapshot.forEach(doc => {
            const moduleData = { id: doc.id, ...doc.data() };
            modules[doc.id] = moduleData;
            orderedModules.push(moduleData);
        });
        
        modulesOrder = orderedModules.map(m => m.id);
        
        if (renderCallback) {
            orderedModules.forEach(module => {
                renderCallback(module);
            });
        }
        
        return orderedModules;
    } catch (error) {
        console.error(`[loadAndRenderModules] Erro ao carregar módulos de ${collectionPath}:`, error);
        showError('Erro de Dados', 'Não foi possível carregar os módulos.');
        throw error;
    }
}

// FUNÇÃO ELIMINADA: loadDroppedEntitiesIntoModules
// No novo modelo Firestore, as entidades já contêm o moduleId e attributes
// A renderização será feita no main.js filtrando as entidades por moduleId

// FUNÇÃO ELIMINADA: loadStructureForEntity  
// No novo modelo Firestore, a estrutura (attributes) já vem carregada com a entidade

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
        
        const currentUserId = getUsuarioId();
        const targetUserId = ownerId || currentUserId;
        const collectionPath = `users/${targetUserId}/workspaces/${workspaceId}/entities`;
        
        // Adiciona campos obrigatórios para o novo modelo
        const entityDataWithDefaults = {
            ...entityData,
            attributes: entityData.attributes || [],
            moduleId: entityData.moduleId || null
        };
        
        const docRef = await db.collection(collectionPath).add(entityDataWithDefaults);
        
        // Atualiza a lista local apenas se for do usuário atual
        if (!ownerId || ownerId === currentUserId) {
            allEntities.push({ ...entityDataWithDefaults, id: docRef.id });
        }
        
        hideLoading();
        return docRef.id;
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
        
        const currentUserId = getUsuarioId();
        const targetUserId = ownerId || currentUserId;
        const collectionPath = `users/${targetUserId}/workspaces/${workspaceId}/modules`;
        
        // Primeiro, pega o número atual de módulos para definir a ordem
        const existingModules = await db.collection(collectionPath).get();
        const nextOrder = existingModules.size;
        
        const newModuleData = { 
            name: name,
            order: nextOrder
        };
        
        const docRef = await db.collection(collectionPath).add(newModuleData);
        
        // Atualiza a ordem local apenas se for do usuário atual
        if (!ownerId || ownerId === currentUserId) {
            modulesOrder.push(docRef.id);
        }
        
        hideLoading();
        return docRef.id;
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
        const currentUserId = getUsuarioId();
        const targetUserId = ownerId || currentUserId;
        const docPath = `users/${targetUserId}/workspaces/${workspaceId}/entities/${entityId}`;
        
        // Atualiza o campo moduleId na entidade
        await db.doc(docPath).update({ moduleId: moduleId });
        
        console.log(`Entidade ${entityId} associada ao módulo ${moduleId}`);
    } catch (error) {
        console.error("Erro ao salvar entidade no módulo:", error);
        showError('Erro ao Salvar', 'Não foi possível adicionar a entidade ao módulo.');
        throw error;
    }
}

/**
 * Copia uma entidade para outro módulo (cria uma nova instância)
 * @param {string} sourceEntityId - ID da entidade origem
 * @param {string} targetModuleId - ID do módulo de destino
 * @param {string} workspaceId - ID da área de trabalho
 * @param {string} ownerId - ID do dono da área de trabalho (opcional)
 * @returns {Promise<string>} ID da nova entidade criada
 */
export async function copyEntityToModule(sourceEntityId, targetModuleId, workspaceId = 'default', ownerId = null) {
    try {
        showLoading('Copiando entidade e dados...');
        const currentUserId = getUsuarioId();
        const targetUserId = ownerId || currentUserId;
        const entitiesCollectionPath = `users/${targetUserId}/workspaces/${workspaceId}/entities`;
        const sourceEntityRef = db.doc(`${entitiesCollectionPath}/${sourceEntityId}`);

        // 1. Obter a entidade original
        const sourceEntityDoc = await sourceEntityRef.get();
        if (!sourceEntityDoc.exists) {
            throw new Error("Entidade de origem não encontrada.");
        }
        const sourceData = sourceEntityDoc.data();

        // 2. Preparar dados para a nova entidade
        const newEntityData = {
            ...sourceData,
            moduleId: targetModuleId,
            name: `${sourceData.name} (Cópia)`,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };

        // 3. Criar a nova entidade e obter sua referência
        const newEntityRef = await db.collection(entitiesCollectionPath).add(newEntityData);
        const newEntityId = newEntityRef.id;

        // 4. Obter todos os registros da subcoleção da entidade original
        const recordsSnapshot = await sourceEntityRef.collection('records').get();

        // 5. Copiar todos os registros para a nova entidade usando um batch write para eficiência
        if (!recordsSnapshot.empty) {
            const batch = db.batch();
            recordsSnapshot.docs.forEach(doc => {
                const newRecordRef = newEntityRef.collection('records').doc(); // Cria um novo doc com ID automático
                batch.set(newRecordRef, doc.data());
            });
            await batch.commit();
            console.log(`${recordsSnapshot.size} registros copiados com sucesso.`);
        }

        // 6. Atualizar a lista local de entidades
        if (!ownerId || ownerId === currentUserId) {
            if (typeof allEntities !== 'undefined' && allEntities) {
                allEntities.push({ ...newEntityData, id: newEntityId });
            }
        }
        
        hideLoading();
        showSuccess('Copiado!', `A entidade e todos os seus dados foram copiados.`);

        // Retorna os dados da nova entidade para a UI
        return { id: newEntityId, name: newEntityData.name, icon: newEntityData.icon };

    } catch (error) {
        hideLoading();
        console.error("Erro ao copiar entidade e seus dados:", error);
        showError('Erro ao Copiar', 'Não foi possível copiar a entidade e seus dados.');
        throw error;
    }
}

/**
 * Move uma entidade para outro módulo (transfere completamente)
 * @param {string} entityId - ID da entidade
 * @param {string} targetModuleId - ID do módulo de destino
 * @param {string} workspaceId - ID da área de trabalho
 * @param {string} ownerId - ID do dono da área de trabalho (opcional)
 * @returns {Promise<void>}
 */
export async function moveEntityToModule(entityId, targetModuleId, workspaceId = 'default', ownerId = null) {
    try {
        const currentUserId = getUsuarioId();
        const targetUserId = ownerId || currentUserId;
        const entityPath = `users/${targetUserId}/workspaces/${workspaceId}/entities/${entityId}`;
        
        // Atualiza o moduleId da entidade para o novo módulo
        await db.doc(entityPath).update({ 
            moduleId: targetModuleId,
            updatedAt: new Date().toISOString()
        });
        
        console.log(`Entidade ${entityId} movida para o módulo ${targetModuleId}`);
    } catch (error) {
        console.error("Erro ao mover entidade:", error);
        showError('Erro ao Mover', 'Não foi possível mover a entidade para o módulo.');
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
        const currentUserId = getUsuarioId();
        const targetUserId = ownerId || currentUserId;
        const docPath = `users/${targetUserId}/workspaces/${workspaceId}/entities/${entityId}`;
        
        // Remove a associação com o módulo (define moduleId como null)
        await db.doc(docPath).update({ moduleId: null });
        
        console.log(`Entidade ${entityId} removida do módulo ${moduleId}`);
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
        
        const currentUserId = getUsuarioId();
        const targetUserId = ownerId || currentUserId;
        const entityPath = `users/${targetUserId}/workspaces/${workspaceId}/entities/${entityId}`;
        
        // Exclui a entidade (isso NÃO exclui automaticamente a subcoleção records no Firestore)
        await db.doc(entityPath).delete();
        
        // ATENÇÃO: A exclusão das subcoleções 'records' deve ser feita via Cloud Function
        // pois o Firestore não exclui subcoleções automaticamente
        console.warn('ATENÇÃO: Records da entidade devem ser excluídos via Cloud Function');
        
        // Atualiza a lista local apenas se a operação for no workspace do usuário atual
        if (!ownerId || ownerId === currentUserId) {
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
        
        const currentUserId = getUsuarioId();
        const targetUserId = ownerId || currentUserId;
        const modulePath = `users/${targetUserId}/workspaces/${workspaceId}/modules/${moduleId}`;
        
        // Exclui o módulo
        await db.doc(modulePath).delete();
        
        // Remove a associação das entidades com este módulo (define moduleId como null)
        const entitiesPath = `users/${targetUserId}/workspaces/${workspaceId}/entities`;
        const entitiesSnapshot = await db.collection(entitiesPath)
            .where('moduleId', '==', moduleId)
            .get();
        
        if (!entitiesSnapshot.empty) {
            const batch = db.batch();
            entitiesSnapshot.forEach(doc => {
                batch.update(doc.ref, { moduleId: null });
            });
            await batch.commit();
        }
        
        // Atualiza a ordem local apenas se for o workspace do usuário atual
        if (!ownerId || ownerId === currentUserId) {
            modulesOrder = modulesOrder.filter(id => id !== moduleId);
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
        
        const currentUserId = getUsuarioId();
        const targetUserId = ownerId || currentUserId;
        const docPath = `users/${targetUserId}/workspaces/${workspaceId}/entities/${entityId}`;
        
        console.log("Salvando estrutura no Firestore:", {
            docPath,
            entityName,
            workspaceId,
            moduleId,
            entityId,
            ownerId,
            attributesCount: attributes.length
        });
        
        // Atualiza o campo attributes na entidade
        await db.doc(docPath).update({ 
            name: entityName,
            attributes: attributes 
        });
        
        console.log("Estrutura salva com sucesso no Firestore");
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
        
        const currentUserId = getUsuarioId();
        const targetUserId = ownerId || currentUserId;
        const docPath = `users/${targetUserId}/workspaces/${workspaceId}/entities/${entityId}`;
        
        // Migrado para Firestore: busca a entidade
        const docRef = db.doc(docPath);
        const docSnap = await docRef.get();
        
        if (docSnap.exists) {
            const entityData = docSnap.data();
            const parentField = entityData.attributes?.find(attr => attr.id === parentFieldId);
            
            if (parentField) {
                // Certifique-se de que subSchema existe
                if (!parentField.subSchema) {
                    parentField.subSchema = {};
                }
                parentField.subSchema.attributes = attributes;
                
                // Atualiza a entidade com a nova estrutura de sub-entidade
                await docRef.update({ attributes: entityData.attributes });
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
        const currentUserId = getUsuarioId();
        const targetUserId = ownerId || currentUserId;
        const collectionPath = `users/${targetUserId}/workspaces/${workspaceId}/modules`;
        
        // Atualiza a variável global somente se estiver operando no workspace do usuário logado
        if (!ownerId || ownerId === currentUserId) {
            modulesOrder = orderArray;
        }
        
        // Usa batch write para atualizar a ordem de todos os módulos
        const batch = db.batch();
        orderArray.forEach((moduleId, index) => {
            const moduleRef = db.doc(`${collectionPath}/${moduleId}`);
            batch.update(moduleRef, { order: index });
        });
        await batch.commit();
        
        console.log("Ordem dos módulos salva com sucesso no Firestore");
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
        
        const snapshot = await db.collection(`users/${userId}/preferences`).get();
        userPreferences = {};
        
        if (!snapshot.empty) {
            snapshot.forEach(doc => {
                userPreferences[doc.id] = doc.data().value;
            });
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
        
        // Salva no Firestore
        await db.doc(`users/${userId}/preferences/${key}`).set({ value: value });
        
        // Também salva no localStorage como fallback
        localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
        console.error("Erro ao salvar preferência do usuário:", error);
        // Fallback para localStorage se o Firestore falhar
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
        
        const currentUserId = getUsuarioId();
        const targetUserId = ownerId || currentUserId;
        
        if (!currentUserId) {
            throw new Error('Usuário não autenticado');
        }
        
        // Dados com metadados do sistema
        const recordData = {
            ...data,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            created_by: currentUserId
        };
        
        // Nova estrutura: users/{userId}/workspaces/{workspaceId}/entities/{entityId}/records
        const recordsPath = `users/${targetUserId}/workspaces/${workspaceId}/entities/${entityId}/records`;
        
        const docRef = await db.collection(recordsPath).add(recordData);
        
        hideLoading();
        return docRef.id;
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
        
        const currentUserId = getUsuarioId();
        const targetUserId = ownerId || currentUserId;

        if (!currentUserId) {
            throw new Error('Usuário não autenticado');
        }
        
        // Adiciona timestamp de atualização
        const updateData = {
            ...data,
            updated_at: new Date().toISOString()
        };
        
        // Nova estrutura: users/{userId}/workspaces/{workspaceId}/entities/{entityId}/records/{recordId}
        const recordPath = `users/${targetUserId}/workspaces/${workspaceId}/entities/${entityId}/records/${recordId}`;
        
        await db.doc(recordPath).update(updateData);
        
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
        const currentUserId = getUsuarioId();
        const targetUserId = ownerId || currentUserId; 

        if (!targetUserId) {
            throw new Error('Usuário não autenticado ou ID do dono não especificado para recurso compartilhado.');
        }
        
        // Nova estrutura: users/{userId}/workspaces/{workspaceId}/entities/{entityId}/records
        const recordsPath = `users/${targetUserId}/workspaces/${workspaceId}/entities/${entityId}/records`;
        const snapshot = await db.collection(recordsPath).get();
        
        if (snapshot.empty) {
            return [];
        }
        
        const records = [];
        snapshot.forEach(doc => {
            records.push({
                id: doc.id,
                ...doc.data()
            });
        });
        
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
        
        const currentUserId = getUsuarioId();
        const targetUserId = ownerId || currentUserId;

        if (!currentUserId) {
            throw new Error('Usuário não autenticado');
        }
        
        // Nova estrutura: users/{userId}/workspaces/{workspaceId}/entities/{entityId}/records/{recordId}
        const recordPath = `users/${targetUserId}/workspaces/${workspaceId}/entities/${entityId}/records/${recordId}`;
        
        await db.doc(recordPath).delete();
        
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
        
        // Migrado para Firestore: Verifica permissões do usuário
        const accessControlDocRef = db.collection('accessControl').doc(userId);
        const accessControlSnap = await accessControlDocRef.get();
        
        // CORREÇÃO: Usar .exists em vez de .exists()
        if (!accessControlSnap.exists) {
            console.log("Nenhum recurso compartilhado encontrado para o usuário:", userId);
            sharedResources = [];
            return [];
        }
        
        const accessControl = accessControlSnap.data();
        console.log("Permissões encontradas:", accessControl);
        
        // Lista para armazenar os recursos compartilhados
        sharedResources = [];
        
        try {
            // Migrado para Firestore: Busca todos os convites aceitos enviados para este usuário
            const invitationsSnapshot = await db.collection('invitations')
                .where('toEmail', '==', userEmail)
                .where('status', '==', 'accepted')
                .get();
            
            if (invitationsSnapshot.empty) {
                console.log("Nenhum convite aceito encontrado para o usuário:", userEmail);
                return [];
            }
            
            // Processa cada convite
            invitationsSnapshot.forEach(doc => {
                const invite = doc.data();
                const resourceId = invite.resourceId;
                
                // Verifica se o usuário tem permissão no accessControl
                if (accessControl[resourceId]) {
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
        
        // Migrado para Firestore: usando db.collection() e db.doc()
        const docRef = db.collection('accessControl').doc(userId);
        const docSnap = await docRef.get();
        
        // CORREÇÃO: Usar .exists em vez de .exists()
        if (docSnap.exists && docSnap.data()[resourceId]) {
            return docSnap.data()[resourceId];
        }
        return null;
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
        const collectionPath = `users/${ownerId}/workspaces/${workspaceId}/modules`;
        console.log(`Carregando módulos compartilhados de: ${collectionPath}`);
        
        // Migrado para Firestore: usando db.collection()
        const snapshot = await db.collection(collectionPath).orderBy('order').get();
        if (snapshot.empty) {
            console.log(`Nenhum módulo encontrado em ${collectionPath}`);
            return [];
        }
        
        const modulesList = [];
        
        snapshot.forEach(doc => {
            modulesList.push({
                id: doc.id,
                ...doc.data(),
                isShared: true,
                ownerId: ownerId
            });
        });
        
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
        const collectionPath = `users/${ownerId}/workspaces/${workspaceId}/entities`;
        console.log(`Carregando entidades compartilhadas de: ${collectionPath}`);
        
        // Migrado para Firestore: usando db.collection()
        const snapshot = await db.collection(collectionPath).get();
        if (snapshot.empty) {
            console.log(`Nenhuma entidade encontrada em ${collectionPath}`);
            return [];
        }
        
        const entitiesList = [];
        
        snapshot.forEach(doc => {
            entitiesList.push({
                id: doc.id,
                ...doc.data(),
                isShared: true,
                ownerId: ownerId
            });
        });
        
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
        const collectionPath = `users/${ownerId}/workspaces/${workspaceId}/entities`;
        console.log(`Carregando esquemas compartilhados de: ${collectionPath} (módulo: ${moduleId})`);
        
        // Migrado para Firestore: busca entidades do módulo específico
        const snapshot = await db.collection(collectionPath)
            .where('moduleId', '==', moduleId)
            .get();
        
        if (snapshot.empty) {
            console.log(`Nenhum esquema encontrado para o módulo ${moduleId}`);
            return {};
        }
        
        const schemas = {};
        snapshot.forEach(doc => {
            schemas[doc.id] = {
                id: doc.id,
                ...doc.data()
            };
        });
        
        return schemas;
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
        const docPath = `users/${ownerId}/workspaces/${workspaceId}/entities/${entityId}`;
        console.log(`Carregando estrutura compartilhada de: ${docPath}`);
        
        // Migrado para Firestore: usando db.doc()
        const docRef = db.doc(docPath);
        const docSnap = await docRef.get();
        
        // CORREÇÃO: Usar .exists em vez de .exists()
        if (!docSnap.exists) {
            console.log(`Estrutura não encontrada em ${docPath}`);
            return null;
        }
        
        return docSnap.data();
    } catch (error) {
        console.error("Erro ao carregar estrutura da entidade compartilhada:", error);
        return null;
    }
}
