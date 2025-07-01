import { getUsuarioId, getUsuarioEmail } from './autenticacao.js';
import { showError, showLoading, hideLoading } from './ui.js';
import { TIPS_STATE } from './config.js';

// Variáveis do módulo
let firestoreDB; // Firestore instance, renamed for clarity
let db; // Keep db for now as it's widely used, will point to firestoreDB. TODO: consolidate later.
let allEntities = []; // Cache for entities
let modulesOrder = []; // Cache for modules order (less critical with Firestore queries)
let userPreferences = {}; // Cache for user preferences
let sharedResources = []; // Cache for shared resources access info

// Helper function to get basic paths. Specific paths to collections/documents
// will be constructed directly in the functions or with more specific helpers if needed.
// function getDbPath(workspaceId, ownerId, path = '') { //  ELIMINATED - Old RealtimeDB helper
//     const currentUserId = getUsuarioId();
//     const targetUserId = ownerId || currentUserId;
//     if (!targetUserId) {
//         console.error("Error: Target user ID is null in getDbPath.");
//     }
//     let basePath = `users/${targetUserId}/workspaces/${workspaceId}`;
//     if (path) {
//         basePath += `/${path}`;
//     }
//     return basePath;
// }

function getWorkspaceBasePath(workspaceId, ownerId) {
    const currentUserId = getUsuarioId();
    const targetUserId = ownerId || currentUserId;
    if (!targetUserId) {
        // This should ideally not happen if user is authenticated and workspace context is clear.
        console.error("Error: Target user ID is null for workspace path.");
        throw new Error("Target user ID is required to build workspace path.");
    }
    return `users/${targetUserId}/workspaces/${workspaceId}`;
}


/**
 * Inicializa o módulo de banco de dados com Firestore
 * @param {Object} firebase - Instância do Firebase (com Firestore inicializado)
 * @returns {Promise<void>}
 */
export async function initDatabase(firebase) {
    try {
        firestoreDB = firebase.firestore();
        db = firestoreDB; // Ensure module-scoped db used by other functions points to Firestore

        await loadUserPreferences();
        // loadSharedResources is called by initWorkspaces after db is set,
        // or should be called here if it's a general init step.
        // Based on workspaces.js, it seems _loadSharedWorkspaces is called there.
        // Let's ensure it uses the correct 'db' (Firestore instance).
    } catch (error) {
        console.error("Erro ao inicializar banco de dados:", error);
        showError('Erro de Conexão', 'Não foi possível conectar ao banco de dados.');
        throw error;
    }
}

export function getFirestoreInstance() {
    if (!firestoreDB) {
        console.error("Firestore DB instance has not been initialized in database.js. Call initDatabase first.");
        // Potentially throw an error or handle Firebase not being initialized yet.
        // For now, assume initDatabase is called successfully before this.
    }
    return firestoreDB;
}


/**
 * Carrega todas as entidades do banco de dados para a área de trabalho atual
 * @param {string} workspaceId - ID da área de trabalho
 * @param {string} ownerId - ID do dono da área de trabalho (opcional, para workspaces compartilhados)
 * @returns {Promise<Array>} - Array com todas as entidades
 */
export async function loadAllEntities(workspaceId = 'default', ownerId = null) {
    const userId = ownerId || getUsuarioId();
    if (!userId) {
        console.error("[loadAllEntities] User ID not found.");
        showError('Erro de Autenticação', 'Usuário não identificado.');
        return [];
    }
    const entitiesPath = `users/${userId}/workspaces/${workspaceId}/entities`;
    console.log(`[loadAllEntities] Firestore path: ${entitiesPath}`);

    try {
        const snapshot = await db.collection(entitiesPath).get();
        allEntities = []; // Reset local cache
        
        if (snapshot.empty) {
            console.log("[loadAllEntities] No entities found in Firestore at this path.");
        } else {
            snapshot.forEach(doc => {
                allEntities.push({ id: doc.id, ...doc.data() });
            });
            console.log(`[loadAllEntities] Success. Total entities loaded: ${allEntities.length}`);
        }
        return allEntities;
    } catch (error) {
        console.error(`[loadAllEntities] Failed to load entities from path: ${entitiesPath}`, error);
        showError('Erro de Dados', 'Não foi possível carregar as entidades. Verifique as permissões e a conexão.');
        // Consider re-throwing or returning empty array based on how errors should propagate
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
    if (!userId) {
        console.error("[loadAndRenderModules] User ID not found.");
        showError('Erro de Autenticação', 'Usuário não identificado.');
        return [];
    }
    const modulesPath = `users/${userId}/workspaces/${workspaceId}/modules`;
    console.log(`[loadAndRenderModules] Firestore path: ${modulesPath}`);
    
    try {
        const snapshot = await db.collection(modulesPath).orderBy('order').get();
        
        const loadedModules = [];
        if (snapshot.empty) {
            console.log("[loadAndRenderModules] No modules found.");
            modulesOrder = []; // Clear local cache
        } else {
            snapshot.forEach(doc => {
                loadedModules.push({ id: doc.id, ...doc.data() });
            });
            // The modulesOrder cache might not be strictly necessary if always fetching ordered,
            // but can be kept if other parts of the app rely on it synchronously.
            modulesOrder = loadedModules.map(m => m.id);
        }
        
        if (renderCallback) {
            loadedModules.forEach(module => {
                renderCallback(module); // Pass the whole module object
            });
        }
        
        return loadedModules;
    } catch (error) {
        console.error(`[loadAndRenderModules] Error loading modules from ${modulesPath}:`, error);
        showError('Erro de Dados', 'Não foi possível carregar os módulos.');
        throw error;
    }
}

/**
 * ELIMINATED: loadDroppedEntitiesIntoModules
 * This function is no longer needed. The rendering of entities within modules
 * will be handled in main.js by filtering the allEntities list by moduleId.
 */
// export async function loadDroppedEntitiesIntoModules(renderCallback, workspaceId = 'default', ownerId = null) { ... }
// The above comment was from a previous attempt. The function below is the one to be removed.

/**
 * ELIMINATED: loadDroppedEntitiesIntoModules (for real this time)
 * This function is no longer needed. The rendering of entities within modules
 * will be handled in main.js by filtering the allEntities list by moduleId.
 * The old logic relied on a 'schemas' path which stored entity info per module.
 * This is superseded by entities having a 'moduleId' field directly.
 */
// export async function loadDroppedEntitiesIntoModules(renderCallback, workspaceId = 'default', ownerId = null) {
//     // const schemasPath = getDbPath(workspaceId, ownerId, 'schemas'); // Old usage
//     // console.log(`[loadDroppedEntitiesIntoModules] Carregando de: ${schemasPath}`);
//
//     try {
//         // const snapshot = await db.ref(schemasPath).get(); // Old usage
//         if (!snapshot.exists()) return {};
//
//         const schemas = snapshot.val();
//
//         if (renderCallback) {
//             for (const moduleId in schemas) {
//                 for (const entityId in schemas[moduleId]) {
//                     if (!schemas[moduleId][entityId]) continue;
//
//                     const entityInfo = allEntities.find(e => e.id === entityId);
//                     if (entityInfo) {
//                         renderCallback(moduleId, entityId, schemas[moduleId][entityId], entityInfo);
//                     }
//                 }
//             }
//         }
//
//         return schemas;
//     } catch (error) {
//         console.error(`[loadDroppedEntitiesIntoModules] Erro ao carregar schemas de ${schemasPath}:`, error);
//         showError('Erro de Dados', 'Não foi possível carregar as entidades dos módulos.');
//         throw error;
//     }
// }

/**
 * ELIMINATED: loadStructureForEntity
 * This function is no longer needed. The entity's structure (attributes)
 * will be loaded directly with the entity document itself from Firestore.
 */
// export async function loadStructureForEntity(moduleId, entityId, workspaceId = 'default', ownerId = null) { ... }


/**
 * Cria uma nova entidade na área de trabalho atual
 * @param {Object} entityData - Dados da nova entidade
 * @param {string} workspaceId - ID da área de trabalho
 * @param {string} ownerId - ID do dono da área de trabalho (opcional)
 * @returns {Promise<string>} - ID da entidade criada
 */
export async function createEntity(entityData, workspaceId = 'default', ownerId = null) {
    const userId = ownerId || getUsuarioId();
    if (!userId) {
        console.error("[createEntity] User ID not found.");
        showError('Erro de Autenticação', 'Usuário não identificado.');
        throw new Error('User ID not found for createEntity');
    }
    const entitiesPath = `users/${userId}/workspaces/${workspaceId}/entities`;

    try {
        showLoading('Criando entidade...');
        
        const entityToCreate = {
            ...entityData,
            attributes: [], // Initialize with empty attributes array as per new model
            moduleId: entityData.moduleId || null, // Ensure moduleId is set, default to null
            // Firestore will auto-generate timestamp if using FieldValue.serverTimestamp()
            // createdAt: new Date().toISOString(), // Or manage client-side if preferred
        };

        const docRef = await db.collection(entitiesPath).add(entityToCreate);
        
        // Update local cache if it's the current user's workspace
        if (!ownerId || ownerId === getUsuarioId()) {
            allEntities.push({ ...entityToCreate, id: docRef.id });
        }
        
        hideLoading();
        return docRef.id;
    } catch (error) {
        hideLoading();
        console.error(`[createEntity] Error creating entity at ${entitiesPath}:`, error);
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
    const userId = ownerId || getUsuarioId();
    if (!userId) {
        console.error("[createModule] User ID not found.");
        showError('Erro de Autenticação', 'Usuário não identificado.');
        throw new Error('User ID not found for createModule');
    }
    const modulesPath = `users/${userId}/workspaces/${workspaceId}/modules`;

    try {
        showLoading('Criando módulo...');

        // Get current number of modules to set the order
        // This is a simplification. In a concurrent environment, this could lead to issues.
        // A more robust way would be a transaction or a Cloud Function to manage order.
        // For client-side, this is a common approach.
        const modulesSnapshot = await db.collection(modulesPath).get();
        const currentModulesCount = modulesSnapshot.size;

        const newModuleData = {
            name: name,
            order: currentModulesCount // Order is 0-indexed, so this is effectively count + 1
            // createdAt: firebase.firestore.FieldValue.serverTimestamp() // Optional
        };
        
        const docRef = await db.collection(modulesPath).add(newModuleData);
        
        // Update local cache if it's the current user's workspace
        // And if modulesOrder is still actively used for synchronous access
        if (!ownerId || ownerId === getUsuarioId()) {
            // To maintain local order, ideally refetch or insert sorted
            // For simplicity, just adding the ID. UI should rely on fetched ordered data.
            modulesOrder.push(docRef.id);
        }
        
        hideLoading();
        return docRef.id;
    } catch (error) {
        hideLoading();
        console.error(`[createModule] Error creating module at ${modulesPath}:`, error);
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
    // entityName is not strictly needed here if we are just updating the reference,
    // but keeping it in signature if it might be used for logging or future enhancements.
    const userId = ownerId || getUsuarioId();
    if (!userId) {
        console.error("[saveEntityToModule] User ID not found.");
        showError('Erro de Autenticação', 'Usuário não identificado.');
        throw new Error('User ID not found for saveEntityToModule');
    }
    const entityPath = `users/${userId}/workspaces/${workspaceId}/entities/${entityId}`;

    try {
        showLoading('Associando entidade ao módulo...');
        await db.doc(entityPath).update({ moduleId: moduleId });

        // Update local cache if necessary
        const entityInCache = allEntities.find(e => e.id === entityId);
        if (entityInCache && (!ownerId || ownerId === getUsuarioId())) {
            entityInCache.moduleId = moduleId;
        }
        hideLoading();
        console.log(`[saveEntityToModule] Entity ${entityId} successfully associated with module ${moduleId}`);
    } catch (error) {
        hideLoading();
        console.error(`[saveEntityToModule] Error updating entity ${entityId} at ${entityPath}:`, error);
        showError('Erro ao Salvar', 'Não foi possível associar a entidade ao módulo.');
        throw error;
    }
}

/**
 * Removes an entity from a module by setting its moduleId to null.
 * @param {string} entityId - ID da entidade.
 * @param {string} workspaceId - ID da área de trabalho.
 * @param {string} ownerId - ID do dono da área de trabalho (opcional).
 * @returns {Promise<void>}
 */
export async function deleteEntityFromModule(entityId, workspaceId = 'default', ownerId = null) {
    // moduleId is not strictly needed as param if we always set to null.
    // Kept original signature pattern somewhat, but action is fixed.
    const userId = ownerId || getUsuarioId();
    if (!userId) {
        console.error("[deleteEntityFromModule] User ID not found.");
        showError('Erro de Autenticação', 'Usuário não identificado.');
        throw new Error('User ID not found for deleteEntityFromModule');
    }
    const entityPath = `users/${userId}/workspaces/${workspaceId}/entities/${entityId}`;

    try {
        showLoading('Removendo entidade do módulo...');
        await db.doc(entityPath).update({ moduleId: null });

        // Update local cache if necessary
        if (!ownerId || ownerId === getUsuarioId()) {
            const entityInCache = allEntities.find(e => e.id === entityId);
            if (entityInCache) {
                entityInCache.moduleId = null;
            }
        }
        hideLoading();
        console.log(`[deleteEntityFromModule] Entity ${entityId} disassociated from any module (moduleId set to null).`);
    } catch (error) {
        hideLoading();
        console.error(`[deleteEntityFromModule] Error updating entity ${entityId} at ${entityPath}:`, error);
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
    const userId = ownerId || getUsuarioId();
    if (!userId) {
        console.error("[deleteEntity] User ID not found.");
        showError('Erro de Autenticação', 'Usuário não identificado.');
        throw new Error('User ID not found for deleteEntity');
    }
    const entityPath = `users/${userId}/workspaces/${workspaceId}/entities/${entityId}`;

    try {
        showLoading('Excluindo entidade...');
        
        await db.doc(entityPath).delete();
        
        // Note: Deleting an entity document in Firestore does NOT automatically delete its subcollections (e.g., 'records').
        // A Cloud Function triggered by this deletion is required to clean up the 'records' subcollection.
        // This has been noted in the plan (Step 4).

        // Update local cache
        if (!ownerId || ownerId === getUsuarioId()) {
            allEntities = allEntities.filter(e => e.id !== entityId);
        }
        
        hideLoading();
        console.log(`[deleteEntity] Entity ${entityId} deleted from ${entityPath}. Associated records subcollection should be deleted by a Cloud Function.`);
    } catch (error) {
        hideLoading();
        console.error(`[deleteEntity] Error deleting entity ${entityId} from ${entityPath}:`, error);
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
    const userId = ownerId || getUsuarioId();
    if (!userId) {
        console.error("[deleteModule] User ID not found.");
        showError('Erro de Autenticação', 'Usuário não identificado.');
        throw new Error('User ID not found for deleteModule');
    }
    const modulePath = `users/${userId}/workspaces/${workspaceId}/modules/${moduleId}`;
    const entitiesPath = `users/${userId}/workspaces/${workspaceId}/entities`;

    try {
        showLoading('Excluindo módulo...');
        
        // 1. Delete the module document
        await db.doc(modulePath).delete();
        console.log(`[deleteModule] Module ${moduleId} deleted from ${modulePath}.`);

        // 2. Find and update entities associated with this module
        // Set their moduleId to null. This should ideally be a batched write.
        const entitiesToUpdateSnapshot = await db.collection(entitiesPath).where("moduleId", "==", moduleId).get();

        if (!entitiesToUpdateSnapshot.empty) {
            const batch = db.batch();
            entitiesToUpdateSnapshot.forEach(doc => {
                batch.update(doc.ref, { moduleId: null });
            });
            await batch.commit();
            console.log(`[deleteModule] Updated ${entitiesToUpdateSnapshot.size} entities, removed association with module ${moduleId}.`);
        }

        // 3. Update local caches
        if (!ownerId || ownerId === getUsuarioId()) {
            modulesOrder = modulesOrder.filter(id => id !== moduleId);
            allEntities.forEach(entity => {
                if (entity.moduleId === moduleId) {
                    entity.moduleId = null;
                }
            });
        }
        
        // Note: The 'order' of remaining modules might need to be re-calculated if they are dense (0,1,2,3...).
        // However, if order is just a sort key, this is not strictly necessary after a delete.
        // The `saveModulesOrder` function can be called separately if a re-ordering UI exists.

        hideLoading();
    } catch (error) {
        hideLoading();
        console.error(`[deleteModule] Error deleting module ${moduleId} or updating associated entities:`, error);
        showError('Erro ao Excluir', 'Não foi possível excluir o módulo ou atualizar entidades associadas.');
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
export async function saveEntityStructure(entityId, attributes, workspaceId = 'default', ownerId = null, entityName = null) {
    const userId = ownerId || getUsuarioId();
    if (!userId) {
        console.error("[saveEntityStructure] User ID not found.");
        showError('Erro de Autenticação', 'Usuário não identificado.');
        throw new Error('User ID not found for saveEntityStructure');
    }
    const entityPath = `users/${userId}/workspaces/${workspaceId}/entities/${entityId}`;

    try {
        showLoading('Salvando estrutura...');
        
        const dataToUpdate = { attributes: attributes };
        if (entityName !== null) { // If entityName is provided and needs to be updated
            dataToUpdate.name = entityName; // Assuming 'name' is the field for entity name
        }

        console.log(`[saveEntityStructure] Saving structure to Firestore: ${entityPath}`, dataToUpdate);
        
        await db.doc(entityPath).update(dataToUpdate);
        
        // Update local cache
        if (!ownerId || ownerId === getUsuarioId()) {
            const entityInCache = allEntities.find(e => e.id === entityId);
            if (entityInCache) {
                entityInCache.attributes = attributes;
                if (entityName !== null) {
                    entityInCache.name = entityName;
                }
            }
        }
        
        console.log("[saveEntityStructure] Structure saved successfully to Firestore.");
        hideLoading();
    } catch (error) {
        hideLoading();
        console.error(`[saveEntityStructure] Error saving structure for entity ${entityId} at ${entityPath}:`, error);
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
// export async function saveSubEntityStructure(moduleId, entityId, parentFieldId, attributes, workspaceId = 'default', ownerId = null) { ... }
/**
 * ELIMINATED: saveSubEntityStructure
 * This function's purpose is to update a nested structure within an entity's attributes.
 * With Firestore, the entire `attributes` array (which includes all nested structures)
 * is part of the main entity document.
 * To update a sub-structure, the client-side logic should:
 * 1. Retrieve the entity (which includes its full `attributes` array).
 * 2. Modify the `attributes` array in memory to reflect the changes in the sub-structure.
 * 3. Call `saveEntityStructure(entityId, modifiedAttributesArray, ...)` to persist the entire
 *    updated attributes array back to Firestore.
 * This approach aligns with loading the entire entity structure at once and simplifies
 * database interaction to a single update point for entity structures.
 */

/**
 * Salva a ordem dos módulos
 * @param {Array} orderArray - Array com os IDs dos módulos na ordem desejada
 * @param {string} workspaceId - ID da área de trabalho
 * @param {string} ownerId - ID do dono da área de trabalho (opcional)
 * @returns {Promise<void>}
 */
export async function saveModulesOrder(orderArray, workspaceId = 'default', ownerId = null) {
    const userId = ownerId || getUsuarioId();
    if (!userId) {
        console.error("[saveModulesOrder] User ID not found.");
        showError('Erro de Autenticação', 'Usuário não identificado.');
        throw new Error('User ID not found for saveModulesOrder');
    }
    const modulesBasePath = `users/${userId}/workspaces/${workspaceId}/modules`;

    try {
        showLoading('Salvando ordem dos módulos...');
        const batch = db.batch();

        orderArray.forEach((moduleId, index) => {
            const moduleRef = db.doc(`${modulesBasePath}/${moduleId}`);
            batch.update(moduleRef, { order: index });
        });

        await batch.commit();
        
        // Update local cache if it's the current user's workspace
        if (!ownerId || ownerId === getUsuarioId()) {
            modulesOrder = [...orderArray]; // Update with the new order
        }
        console.log("[saveModulesOrder] Modules order saved successfully.");
        hideLoading();
    } catch (error) {
        hideLoading();
        console.error(`[saveModulesOrder] Error saving modules order at ${modulesBasePath}:`, error);
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
    const userId = getUsuarioId();
    if (!userId) {
        console.warn("[loadUserPreferences] User not authenticated. Preferences not loaded.");
        userPreferences = {}; // Reset local cache
        return {};
    }
    const preferencesPath = `users/${userId}/preferences`;
    console.log(`[loadUserPreferences] Firestore path: ${preferencesPath}`);

    try {
        const snapshot = await db.collection(preferencesPath).get();
        userPreferences = {}; // Reset before loading
        
        if (snapshot.empty) {
            console.log("[loadUserPreferences] No user preferences found in Firestore.");
        } else {
            snapshot.forEach(doc => {
                // Assuming doc.id is the preference key, and doc.data() is { value: ... }
                // Or, if the document itself is the preference, e.g. doc.id = 'welcomeTipClosed', data = { value: true }
                // The prompt says: users/{userId}/preferences/{preferenceId} (Document) -> // Campos: key, value
                // This implies preferenceId might be an auto-id, and key is a field.
                // Let's re-evaluate. If preferenceId is the key itself: users/userId/preferences/welcomeTipClosed with data {value: true}
                // This is simpler. The prompt: "db.doc('users/{userId}/preferences/{key}').set({ value: value })" for save.
                // This means the document ID *is* the key.
                const prefData = doc.data();
                if (prefData && prefData.hasOwnProperty('value')) {
                    userPreferences[doc.id] = prefData.value;
                } else {
                    // If structure is just { key: value } directly as fields in a single doc, it's different.
                    // Given the save function, doc.id is the key.
                    userPreferences[doc.id] = prefData; // Or just doc.data() if value is not nested.
                                                       // Let's assume { value: "actual_value" } to match save.
                }
            });
            console.log("[loadUserPreferences] User preferences loaded:", userPreferences);
        }
        return userPreferences;
    } catch (error) {
        console.error(`[loadUserPreferences] Error loading preferences from ${preferencesPath}:`, error);
        // Should not prevent app from loading, return empty object
        userPreferences = {};
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
    const userId = getUsuarioId();
    if (!userId) {
        console.error("[saveUserPreference] User not authenticated. Preference not saved.");
        // Optionally, still save to localStorage as a fallback like before
        localStorage.setItem(key, JSON.stringify(value));
        throw new Error('User not authenticated, preference not saved to Firestore.');
    }
    const preferencePath = `users/${userId}/preferences/${key}`;
    console.log(`[saveUserPreference] Firestore path: ${preferencePath}`);

    try {
        // Salva no Firestore
        // The model is users/{userId}/preferences/{preferenceId} with "key" and "value" fields.
        // However, the prompt for saveUserPreference says: db.doc('users/{userId}/preferences/{key}').set({ value: value })
        // This implies the document ID IS the key. This is a simpler and often effective model.
        await db.doc(preferencePath).set({ value: value });

        // Atualiza o objeto local de preferências
        userPreferences[key] = value;
        
        // Também salva no localStorage como fallback (optional, but was in original)
        localStorage.setItem(key, JSON.stringify(value));
        console.log(`[saveUserPreference] Preference '${key}' saved to Firestore and localStorage.`);

    } catch (error) {
        console.error(`[saveUserPreference] Error saving preference '${key}' to Firestore:`, error);
        // Fallback para localStorage se o Firebase falhar
        localStorage.setItem(key, JSON.stringify(value));
        showError('Erro ao Salvar Preferência', `Não foi possível salvar a preferência '${key}' no servidor.`);
        throw error; // Re-throw so caller knows Firestore save failed
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
// REFACTORING for Firestore: User Data (Records)
// These functions will now operate on the 'records' subcollection within each entity.

/**
 * Salva um novo registro de dados para uma entidade.
 * @param {string} entityId - ID da entidade.
 * @param {Object} data - Dados a serem salvos no novo registro.
 * @param {string} workspaceId - ID da área de trabalho.
 * @param {string} ownerId - ID do dono da área de trabalho (determines the user path).
 * @returns {Promise<string>} - ID do registro criado.
 */
export async function saveEntityData(entityId, data, workspaceId = 'default', ownerId = null) {
    const userIdToUse = ownerId || getUsuarioId(); // Data is stored under the workspace owner's path.
    const actingUserId = getUsuarioId(); // User performing the action.

    if (!userIdToUse) {
        console.error("[saveEntityData] Workspace owner User ID not found.");
        showError('Erro de Autenticação', 'Proprietário do workspace não identificado.');
        throw new Error('Workspace owner User ID not found for saveEntityData.');
    }
    if (!actingUserId) {
        console.error("[saveEntityData] Acting User ID not found.");
        showError('Erro de Autenticação', 'Usuário não identificado.');
        throw new Error('Acting User ID not found for saveEntityData.');
    }

    const recordsPath = `users/${userIdToUse}/workspaces/${workspaceId}/entities/${entityId}/records`;

    try {
        showLoading('Salvando dados...');
        
        const recordToCreate = {
            ...data,
            // Consider using Firestore server timestamps for better accuracy and consistency
            // createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            // updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            // createdBy: actingUserId,
            // updatedBy: actingUserId,
            // For simplicity, using client-side ISO strings as per original, but server timestamps are better.
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            createdBy: actingUserId,
            // updatedBy can be added in update function
        };

        const docRef = await db.collection(recordsPath).add(recordToCreate);
        hideLoading();
        console.log(`[saveEntityData] Record created with ID: ${docRef.id} in ${recordsPath}`);
        return docRef.id;
    } catch (error) {
        hideLoading();
        console.error(`[saveEntityData] Error saving record to ${recordsPath}:`, error);
        showError('Erro ao Salvar Dados', 'Não foi possível salvar os dados do registro.');
        throw error;
    }
}

/**
 * Atualiza dados de um registro existente.
 * @param {string} entityId - ID da entidade.
 * @param {string} recordId - ID do registro a ser atualizado.
 * @param {Object} data - Dados atualizados.
 * @param {string} workspaceId - ID da área de trabalho.
 * @param {string} ownerId - ID do dono da área de trabalho.
 * @returns {Promise<void>}
 */
export async function updateEntityData(entityId, recordId, data, workspaceId = 'default', ownerId = null) {
    const userIdToUse = ownerId || getUsuarioId();
    const actingUserId = getUsuarioId();

    if (!userIdToUse) {
        console.error("[updateEntityData] Workspace owner User ID not found.");
        showError('Erro de Autenticação', 'Proprietário do workspace não identificado.');
        throw new Error('Workspace owner User ID not found for updateEntityData.');
    }
     if (!actingUserId) {
        console.error("[updateEntityData] Acting User ID not found.");
        showError('Erro de Autenticação', 'Usuário não identificado.');
        throw new Error('Acting User ID not found for updateEntityData.');
    }

    const recordPath = `users/${userIdToUse}/workspaces/${workspaceId}/entities/${entityId}/records/${recordId}`;

    try {
        showLoading('Atualizando dados...');
        
        const dataToUpdate = {
            ...data,
            // updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            // updatedBy: actingUserId,
            updatedAt: new Date().toISOString(),
            updatedBy: actingUserId,
        };
        
        await db.doc(recordPath).update(dataToUpdate);
        hideLoading();
        console.log(`[updateEntityData] Record ${recordId} updated in ${recordPath}`);
    } catch (error) {
        hideLoading();
        console.error(`[updateEntityData] Error updating record ${recordId} at ${recordPath}:`, error);
        showError('Erro ao Atualizar Dados', 'Não foi possível atualizar os dados do registro.');
        throw error;
    }
}

/**
 * Carrega todos os registros de dados de uma entidade.
 * @param {string} entityId - ID da entidade.
 * @param {string} workspaceId - ID da área de trabalho.
 * @param {string} ownerId - ID do dono da área de trabalho.
 * @returns {Promise<Array>} - Array com os registros da entidade.
 */
export async function loadEntityData(entityId, workspaceId = 'default', ownerId = null) {
    const userIdToUse = ownerId || getUsuarioId();

    if (!userIdToUse) {
        console.error("[loadEntityData] Workspace owner User ID not found.");
        showError('Erro de Autenticação', 'Proprietário do workspace não identificado.');
        return []; // Return empty array on error
    }
    const recordsPath = `users/${userIdToUse}/workspaces/${workspaceId}/entities/${entityId}/records`;

    try {
        const snapshot = await db.collection(recordsPath).get(); // Consider adding .orderBy for consistent results
        const records = [];
        
        if (snapshot.empty) {
            console.log(`[loadEntityData] No records found in ${recordsPath}`);
        } else {
            snapshot.forEach(doc => {
                records.push({ id: doc.id, ...doc.data() });
            });
            console.log(`[loadEntityData] Loaded ${records.length} records from ${recordsPath}`);
        }
        return records;
    } catch (error) {
        console.error(`[loadEntityData] Error loading records from ${recordsPath}:`, error);
        showError('Erro ao Carregar Dados', 'Não foi possível carregar os dados dos registros.');
        throw error; // Or return empty array
    }
}

/**
 * Exclui um registro de dados específico.
 * @param {string} entityId - ID da entidade.
 * @param {string} recordId - ID do registro a ser excluído.
 * @param {string} workspaceId - ID da área de trabalho.
 * @param {string} ownerId - ID do dono da área de trabalho.
 * @returns {Promise<void>}
 */
export async function deleteEntityRecord(entityId, recordId, workspaceId = 'default', ownerId = null) {
    const userIdToUse = ownerId || getUsuarioId();

    if (!userIdToUse) {
        console.error("[deleteEntityRecord] Workspace owner User ID not found.");
        showError('Erro de Autenticação', 'Proprietário do workspace não identificado.');
        throw new Error('Workspace owner User ID not found for deleteEntityRecord.');
    }
    const recordPath = `users/${userIdToUse}/workspaces/${workspaceId}/entities/${entityId}/records/${recordId}`;

    try {
        showLoading('Excluindo registro...');
        await db.doc(recordPath).delete();
        hideLoading();
        console.log(`[deleteEntityRecord] Record ${recordId} deleted from ${recordPath}`);
    } catch (error) {
        hideLoading();
        console.error(`[deleteEntityRecord] Error deleting record ${recordId} from ${recordPath}:`, error);
        showError('Erro ao Excluir Registro', 'Não foi possível excluir o registro.');
        throw error;
    }
}

/**
 * Carrega os recursos compartilhados com o usuário atual
 * @returns {Promise<Array>} - Lista de recursos compartilhados (workspaces)
 */
export async function loadSharedResources() {
    const currentUserId = getUsuarioId();
    const currentUserEmail = getUsuarioEmail()?.toLowerCase();

    if (!currentUserId || !currentUserEmail) {
        console.warn("[loadSharedResources] User not authenticated. Cannot load shared resources.");
        sharedResources = []; // Reset local cache
        return [];
    }
    console.log(`[loadSharedResources] Loading shared resources for user: ${currentUserId}, email: ${currentUserEmail}`);

    sharedResources = []; // Reset local cache

    try {
        // 1. Query 'invitations' collection for accepted invites to the current user.
        // The new model for invitations: invitations/{inviteId} -> fromUserId, toEmail, resourceId, role, status
        const invitationsSnapshot = await db.collection('invitations')
            .where('toEmail', '==', currentUserEmail)
            .where('status', '==', 'accepted')
            .get();

        if (invitationsSnapshot.empty) {
            console.log("[loadSharedResources] No accepted invitations found for this user.");
            return [];
        }

        const processedResources = []; // Temp array to hold successfully processed shared resources
        const ownerNamePromises = []; // For fetching owner names, if necessary

        invitationsSnapshot.forEach(inviteDoc => {
            const inviteData = inviteDoc.data();
            const workspaceId = inviteData.resourceId; // resourceId in invitation is the workspaceId
            const ownerId = inviteData.fromUserId;     // fromUserId is the owner of the workspace
            const roleFromInvite = inviteData.role;    // Role specified in the invitation

            if (!workspaceId || !ownerId) {
                console.warn("[loadSharedResources] Skipping invitation with missing resourceId or fromUserId", inviteData);
                return; // continue to next iteration
            }

            // The role now comes from the invitation itself at the point of acceptance and is recorded in accessControl.
            // The critical part is that an entry in accessControl/{workspaceId} with {currentUserId: role} must exist.
            // This entry is created when an invitation is accepted (done by a Cloud Function or client logic in manageInvite).
            // So, we can trust the role from the invitation if the accessControl entry confirms access.
            
            // We still need to verify with accessControl to ensure the user *currently* has access,
            // as direct removal from accessControl is possible.
            const accessControlRef = db.doc(`accessControl/${workspaceId}`);
            ownerNamePromises.push(
                accessControlRef.get().then(async accessDoc => {
                    if (accessDoc.exists) {
                        const accessData = accessDoc.data();
                        const userRoleFromAccessControl = accessData[currentUserId];

                        if (userRoleFromAccessControl) {
                            // User has confirmed access. The role in accessControl should be the source of truth.
                            let ownerName = inviteData.fromUserName; // Use if available on invite
                            if (!ownerName) {
                                // Attempt to fetch owner's display name from users/{ownerId}
                                try {
                                    const userDoc = await db.doc(`users/${ownerId}`).get();
                                    if (userDoc.exists && userDoc.data().displayName) {
                                        ownerName = userDoc.data().displayName;
                                    } else {
                                        ownerName = ownerId; // Fallback to ownerId
                                    }
                                } catch (userFetchError) {
                                    console.warn(`[loadSharedResources] Could not fetch owner's name for ${ownerId}`, userFetchError);
                                    ownerName = ownerId; // Fallback
                                }
                            }

                            processedResources.push({
                                id: workspaceId,
                                ownerId: ownerId,
                                ownerName: ownerName,
                                type: inviteData.resourceType || "workspace",
                                role: userRoleFromAccessControl // Use role from accessControl
                            });
                        } else {
                            console.warn(`[loadSharedResources] User ${currentUserId} role not found in accessControl/${workspaceId}, though an accepted invite exists. Access might have been revoked.`);
                        }
                    } else {
                        console.warn(`[loadSharedResources] accessControl document for workspace ${workspaceId} not found, though an accepted invite exists. This implies an issue with invite acceptance logic or data integrity.`);
                    }
                }).catch(err => {
                    console.error(`[loadSharedResources] Error fetching accessControl for workspace ${workspaceId}:`, err);
                })
            );
        });

        await Promise.all(ownerNamePromises);
        sharedResources = processedResources; // Assign to global cache

        console.log("[loadSharedResources] Shared resources loaded:", sharedResources);
        return sharedResources;

    } catch (error) {
        console.error("[loadSharedResources] Error loading shared resources:", error);
        showError('Erro ao Carregar Compartilhados', 'Não foi possível carregar os recursos compartilhados.');
        sharedResources = []; // Ensure cache is clear on error
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
export async function checkResourceAccess(resourceId) { // resourceId is workspaceId
    const currentUserId = getUsuarioId();
    if (!currentUserId) {
        console.warn("[checkResourceAccess] User not authenticated.");
        return null;
    }
    if (!resourceId) {
        console.warn("[checkResourceAccess] resourceId (workspaceId) not provided.");
        return null;
    }

    const accessControlPath = `accessControl/${resourceId}`;
    console.log(`[checkResourceAccess] Checking access for user ${currentUserId} on resource ${resourceId} at path ${accessControlPath}`);

    try {
        const accessDoc = await db.doc(accessControlPath).get();
        if (accessDoc.exists) {
            const accessData = accessDoc.data();
            if (accessData && accessData.hasOwnProperty(currentUserId)) {
                console.log(`[checkResourceAccess] User ${currentUserId} has role '${accessData[currentUserId]}' for resource ${resourceId}`);
                return accessData[currentUserId]; // Returns the role (e.g., "viewer", "editor")
            } else {
                console.log(`[checkResourceAccess] User ${currentUserId} not found in accessControl for resource ${resourceId}`);
                return null; // User does not have explicit role
            }
        } else {
            console.log(`[checkResourceAccess] No accessControl document found for resource ${resourceId} at ${accessControlPath}`);
            return null; // No access control defined for this resource
        }
    } catch (error) {
        console.error(`[checkResourceAccess] Error checking access for resource ${resourceId}:`, error);
        // Depending on policy, might want to return null or rethrow
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
    if (!ownerId) {
        console.error('[loadSharedUserModules] ownerId not provided.');
        showError('Erro de Dados', 'ID do proprietário não fornecido para carregar módulos compartilhados.');
        throw new Error('ownerId is required to load shared modules.');
    }
    // This function is essentially loadAndRenderModules but targeted at a specific owner's data.
    // No renderCallback is expected here, just data loading.
    const modulesPath = `users/${ownerId}/workspaces/${workspaceId}/modules`;
    console.log(`[loadSharedUserModules] Firestore path: ${modulesPath}`);

    try {
        const snapshot = await db.collection(modulesPath).orderBy('order').get();
        const loadedModules = [];
        
        if (snapshot.empty) {
            console.log(`[loadSharedUserModules] No modules found at ${modulesPath}.`);
        } else {
            snapshot.forEach(doc => {
                loadedModules.push({
                    id: doc.id,
                    ...doc.data(),
                    isShared: true, // Mark as shared for client-side differentiation
                    ownerId: ownerId  // Include ownerId for context
                });
            });
            console.log(`[loadSharedUserModules] Loaded ${loadedModules.length} shared modules.`);
        }
        return loadedModules;
    } catch (error) {
        console.error(`[loadSharedUserModules] Error loading shared modules from ${modulesPath}:`, error);
        showError('Erro de Dados', 'Não foi possível carregar os módulos compartilhados.');
        throw error; // Or return []
    }
}

/**
 * Carrega entidades de uma área de trabalho compartilhada
 * @param {string} ownerId - ID do usuário dono dos recursos
 * @param {string} workspaceId - ID da área de trabalho compartilhada
 * @returns {Promise<Array>} - Lista de entidades compartilhadas
 */
export async function loadSharedUserEntities(ownerId, workspaceId = 'default') {
    if (!ownerId) {
        console.error('[loadSharedUserEntities] ownerId not provided.');
        showError('Erro de Dados', 'ID do proprietário não fornecido para carregar entidades compartilhadas.');
        throw new Error('ownerId is required to load shared entities.');
    }
    // Similar to loadAllEntities but for a specific owner's data.
    const entitiesPath = `users/${ownerId}/workspaces/${workspaceId}/entities`;
    console.log(`[loadSharedUserEntities] Firestore path: ${entitiesPath}`);

    try {
        const snapshot = await db.collection(entitiesPath).get();
        const loadedEntities = [];
        
        if (snapshot.empty) {
            console.log(`[loadSharedUserEntities] No entities found at ${entitiesPath}.`);
        } else {
            snapshot.forEach(doc => {
                loadedEntities.push({
                    id: doc.id,
                    ...doc.data(),
                    isShared: true, // Mark as shared for client-side differentiation
                    ownerId: ownerId  // Include ownerId for context
                });
            });
            console.log(`[loadSharedUserEntities] Loaded ${loadedEntities.length} shared entities.`);
        }
        return loadedEntities;
    } catch (error) {
        console.error(`[loadSharedUserEntities] Error loading shared entities from ${entitiesPath}:`, error);
        showError('Erro de Dados', 'Não foi possível carregar as entidades compartilhadas.');
        throw error; // Or return []
    }
}

/**
 * Carrega esquemas de uma área de trabalho compartilhada
 * @param {string} ownerId - ID do usuário dono dos recursos
 * @param {string} workspaceId - ID da área de trabalho compartilhada
 * @param {string} moduleId - ID do módulo
 * @returns {Promise<Object>} - Esquemas do módulo compartilhado
 */
// export async function loadSharedModuleSchemas(ownerId, workspaceId = 'default', moduleId) { ... }
/**
 * ELIMINATED: loadSharedModuleSchemas
 * In the new Firestore model, entity attributes (the "schema") are stored directly within each entity document.
 * There isn't a separate "schemas" collection per module.
 * To get the "schemas" for all entities within a shared module:
 * 1. Call `loadSharedUserEntities(ownerId, workspaceId)` to get all entities for the shared workspace.
 * 2. Client-side, filter these entities by `entity.moduleId === moduleId`.
 * 3. The `attributes` field of each filtered entity is its schema.
 * Alternatively, if only schemas are needed, a more targeted query could fetch entities for the module
 * and select only their 'attributes' field, but typically entities are loaded whole.
 * This function is therefore redundant if entities are already being loaded.
 */

/**
 * Carrega a estrutura de uma entidade em área de trabalho compartilhada
 * @param {string} moduleId - ID do módulo
 * @param {string} entityId - ID da entidade
 * @param {string} workspaceId - ID da área de trabalho
 * @param {string} ownerId - ID do usuário dono dos recursos
 * @returns {Promise<Object|null>} - Estrutura da entidade ou null se não encontrar
 */
// export async function loadStructureForEntityShared(moduleId, entityId, workspaceId = 'default', ownerId) { ... }
/**
 * ELIMINATED: loadStructureForEntityShared
 * Similar to `loadStructureForEntity`, this function is no longer needed.
 * In Firestore, the entity's structure (attributes) is loaded directly with the entity document.
 * To get the structure of a specific shared entity:
 * 1. Load the shared entity, for example, by calling `db.doc(\`users/\${ownerId}/workspaces/\${workspaceId}/entities/\${entityId}\`).get()`.
 *    Or, if all shared entities for a workspace are already loaded via `loadSharedUserEntities`, find the specific entity by its ID in the local list.
 * 2. Access the `attributes` field of the loaded entity document/object.
 * The `moduleId` parameter is not strictly necessary for fetching the entity if its `entityId` is known.
 */
