/**
 * Módulo de gerenciamento de perfil do usuário
 * Responsável por exibir e atualizar informações do usuário
 */

import { getUsuarioAtual, getUsuarioId, getUsuarioNome, getUsuarioEmail, getUsuarioFoto, logout } from '../autenticacao.js';
import { showSuccess, showError, showLoading, hideLoading } from '../ui.js';

// Variáveis do módulo
// let db; // db will be passed as a parameter
let storage;
let auth;
let userMenuActive = false;

/**
 * Inicializa o módulo de perfil do usuário.
 * Agora espera receber 'db'.
 * @param {string} userId - O ID do usuário logado.
 * @param {Object} dbInstance - A instância do Firebase Realtime Database.
 */
export async function initUserProfile(userId, dbInstance) { 
    console.log("Módulo de perfil do usuário recebendo 'db'...");
    // db = dbInstance; // Set the module-level db if other functions not receiving it directly still rely on it.
                       // For now, we'll pass db explicitly where needed.
    auth = firebase.auth(); // Assuming global firebase object
    storage = firebase.storage(); // Assuming global firebase object

    // Setup event listeners and non-data-dependent parts of the modal first
    setupProfileModalListeners(); // Renamed to avoid confusion, sets up modal open/close/save
    setupUserMenuListeners();   // Sets up menu open/close, logout, edit profile button actions

    try {
        // Load data and then populate UI that depends on this data
        const userData = await loadUserProfileData(userId, dbInstance);
        if (userData) {
            populateUserMenu(userData); // New function to populate menu with data
            populateProfileModal(userData); // New function to populate modal fields with data
        } else {
            // Handle case where user data might not be found, e.g., set default display
            console.warn(`User data not found for ${userId}. UI will use defaults.`);
            populateUserMenu({ displayName: getUsuarioNome() || 'Usuário', photoURL: getUsuarioFoto() });
            populateProfileModal({ displayName: getUsuarioNome() || 'Usuário', photoURL: getUsuarioFoto(), email: getUsuarioEmail() });
        }
    } catch (error) {
        console.error("Erro ao carregar e popular dados do perfil do usuário:", error);
        // Fallback to default display in case of error
        populateUserMenu({ displayName: getUsuarioNome() || 'Usuário', photoURL: getUsuarioFoto() });
        populateProfileModal({ displayName: getUsuarioNome() || 'Usuário', photoURL: getUsuarioFoto(), email: getUsuarioEmail() });
    }
}

/**
 * Configura os listeners do menu do usuário (ações como abrir/fechar, logout)
 */
function setupUserMenuListeners() {
    const userMenuButton = document.getElementById('user-menu-button');
    const userMenuDropdown = document.getElementById('user-menu-dropdown');
    const profileModal = document.getElementById('profile-modal');
    const closeProfileModalButton = document.getElementById('close-profile-modal');
    const cancelProfileButton = document.getElementById('cancel-profile-button');
    const saveProfileButton = document.getElementById('save-profile-button');
    const changeAvatarButton = document.getElementById('change-avatar-button');
    const avatarUploadInput = document.getElementById('avatar-upload-input');

    if (userMenuButton && userMenuDropdown) {
        userMenuButton.addEventListener('click', () => {
            userMenuDropdown.classList.toggle('hidden');
            userMenuActive = !userMenuDropdown.classList.contains('hidden');
            const chevronIcon = userMenuButton.querySelector('i[data-lucide^="chevron-"]');
            if (chevronIcon) {
                chevronIcon.setAttribute('data-lucide', userMenuActive ? 'chevron-up' : 'chevron-down');
                if (window.lucide) window.lucide.createIcons();
            }
        });

        document.addEventListener('click', (event) => {
            if (!userMenuButton.contains(event.target) && !userMenuDropdown.contains(event.target)) {
                if (!userMenuDropdown.classList.contains('hidden')) {
                    userMenuDropdown.classList.add('hidden');
                    userMenuActive = false;
                    const chevronIcon = userMenuButton.querySelector('i[data-lucide^="chevron-"]');
                    if (chevronIcon) {
                        chevronIcon.setAttribute('data-lucide', 'chevron-down');
                        if (window.lucide) window.lucide.createIcons();
                    }
                }
            }
        });
    }

    const editProfileButton = document.getElementById('edit-profile-button');
    if (editProfileButton) {
        editProfileButton.addEventListener('click', () => {
            if(userMenuDropdown) userMenuDropdown.classList.add('hidden');
            userMenuActive = false;
            openProfileModal(); // openProfileModal will be responsible for populating with current data if needed
        });
    }

    const logoutButton = document.getElementById('logout-button');
    if (logoutButton) {
        logoutButton.addEventListener('click', async () => {
            if(userMenuDropdown) userMenuDropdown.classList.add('hidden');
            const result = await logout(); // Assuming logout is globally available or imported
            if (!result.success) {
                showError('Erro ao sair', result.error);
            }
            // Redirection is handled by auth listener in main.js or by logout function itself
        });
    }

    // Profile Modal Actions
    const closeModalHandler = () => {
        if (profileModal) {
            profileModal.querySelector('.bg-white').classList.add('scale-95', 'opacity-0');
            setTimeout(() => {
                profileModal.classList.add('hidden');
            }, 300);
        }
    };

    if (closeProfileModalButton) closeProfileModalButton.addEventListener('click', closeModalHandler);
    if (cancelProfileButton) cancelProfileButton.addEventListener('click', closeModalHandler);

    window.openProfileModal = () => {
        // Data population should happen here or be passed to setupProfileModal if called from main
        // For now, just opening. Data population will be handled by setupProfileModal(userData)
        if (profileModal) {
            profileModal.classList.remove('hidden');
            setTimeout(() => {
                profileModal.querySelector('.bg-white').classList.remove('scale-95', 'opacity-0');
            }, 10);
        }
    };
    
    if (changeAvatarButton && avatarUploadInput) {
        changeAvatarButton.addEventListener('click', () => avatarUploadInput.click());
        avatarUploadInput.addEventListener('change', handleAvatarUpload);
    }

    if (saveProfileButton) saveProfileButton.addEventListener('click', saveUserProfile);
}


/**
 * RESPONSABILIDADE: Apenas buscar dados e retornar. NENHUMA manipulação de DOM aqui.
 * @param {string} userId - O ID do usuário para buscar dados.
 * @returns {Promise<Object|null>} Dados do perfil do usuário ou null se não encontrado.
 */
export async function loadUserProfileData(userId) {
    if (!userId) {
        console.warn("[loadUserProfileData] No userId provided.");
        return null;
    }
    // Ensure db is initialized. This should be guaranteed by main.js before calling this.
    if (!db) {
        console.error("Firebase Realtime Database (db) is not initialized in userProfile.js context.");
        db = firebase.database(); // Attempt re-init, but this is a fallback.
        if(!db) throw new Error("DB not available in loadUserProfileData");
    }

    try {
        const snapshot = await db.ref(`users/${userId}`).once('value');
        if (snapshot.exists()) {
            return snapshot.val();
        } else {
            console.log(`[loadUserProfileData] No data found for user ${userId}`);
            return null; // Retorna null se não encontrar
        }
    } catch (error) {
        console.error("Erro na função loadUserProfileData:", error);
        throw error; // Lança o erro para o 'catch' do main.js pegar.
    }
}

/**
 * RESPONSABILIDADE: Apenas configurar o menu. Ela confia que os elementos já existem.
 * @param {Object} userData - Os dados do usuário carregados.
 */
export function setupUserMenu(userData) {
    const userMenuButton = document.getElementById('user-menu-button');
    const userMenuDropdown = document.getElementById('user-menu-dropdown');
    const userDisplayNameElement = document.getElementById('user-display-name');
    const userAvatarPreview = document.getElementById('user-avatar-preview');

    if (!userMenuButton || !userMenuDropdown) {
        console.error("Elementos do menu de usuário não foram encontrados no HTML!");
        return;
    }
    
    if (userData && userDisplayNameElement) {
        userDisplayNameElement.textContent = userData.displayName || getUsuarioNome() || 'Usuário';
    } else if (!userData && userDisplayNameElement){
        // Fallback if userData is somehow null after login
        userDisplayNameElement.textContent = getUsuarioNome() || 'Usuário';
    }

    if (userData && userAvatarPreview) {
        userAvatarPreview.src = userData.photoURL || getUsuarioFoto() || `https://ui-avatars.com/api/?name=${encodeURIComponent(userData.displayName || getUsuarioNome() || 'Usuário')}&background=random`;
    } else if (!userData && userAvatarPreview) {
        // Fallback
        userAvatarPreview.src = getUsuarioFoto() || `https://ui-avatars.com/api/?name=${encodeURIComponent(getUsuarioNome() || 'Usuário')}&background=random`;
    }
}

/**
 * RESPONSABILIDADE: Apenas configurar o modal de perfil.
 * @param {Object} userData - Os dados do usuário carregados.
 */
export function setupProfileModal(userData) {
    const modalAvatarPreview = document.getElementById('modal-avatar-preview');
    const nicknameInput = document.getElementById('nickname-input');
    const emailInput = document.getElementById('email-input');

    if (!modalAvatarPreview || !nicknameInput || !emailInput) {
        console.error("Elementos do modal de perfil não encontrados no HTML!");
        return;
    }

    if (userData) {
        nicknameInput.value = userData.displayName || getUsuarioNome() || '';
        // Email from auth is likely more reliable, but can be part of userData too.
        emailInput.value = getUsuarioEmail() || (userData.email || ''); 
        modalAvatarPreview.src = userData.photoURL || getUsuarioFoto() || `https://ui-avatars.com/api/?name=${encodeURIComponent(userData.displayName || getUsuarioNome() || 'Usuário')}&background=random`;
    } else {
        // Fallback if called without userData (e.g. before full load, or error)
        nicknameInput.value = getUsuarioNome() || '';
        emailInput.value = getUsuarioEmail() || '';
        modalAvatarPreview.src = getUsuarioFoto() || `https://ui-avatars.com/api/?name=${encodeURIComponent(getUsuarioNome() || 'Usuário')}&background=random`;
    }
}


/**
 * Manipula o upload do avatar
 * @param {Event} event - Evento de change do input file
 */
async function handleAvatarUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // Verifica se é uma imagem
    if (!file.type.startsWith('image/')) {
        showError('Arquivo inválido', 'Por favor, selecione uma imagem.');
        return;
    }
    
    // Verifica o tamanho da imagem (máximo 2MB)
    if (file.size > 2 * 1024 * 1024) {
        showError('Arquivo muito grande', 'O tamanho máximo permitido é 2MB.');
        return;
    }
    
    try {
        showLoading('Processando imagem...');
        
        // Exibe uma prévia da imagem
        const reader = new FileReader();
        reader.onload = (e) => {
            document.getElementById('modal-avatar-preview').src = e.target.result;
        };
        reader.readAsDataURL(file);
        
        hideLoading();
    } catch (error) {
        hideLoading();
        showError('Erro', 'Ocorreu um erro ao processar a imagem.');
    }
}

/**
 * Salva as alterações no perfil do usuário
 */
async function saveUserProfile() {
    const userId = getUsuarioId();
    if (!userId) {
        showError('Erro', 'Usuário não está autenticado.');
        return;
    }
    
    const newNickname = document.getElementById('nickname-input').value.trim();
    const avatarFile = document.getElementById('avatar-upload-input').files[0];
    
    if (!newNickname) {
        showError('Erro', 'O apelido não pode estar vazio.');
        return;
    }
    
    showLoading('Salvando perfil...');
    
    try {
        // Dados a serem atualizados
        const updateData = {
            displayName: newNickname,
            updatedAt: firebase.database.ServerValue.TIMESTAMP
        };
        
        // Se houver um arquivo de avatar, faz o upload
        if (avatarFile) {
            try {
                // Cria uma referência no storage para o avatar
                const storageRef = storage.ref(`user-avatars/${userId}`);
                const fileRef = storageRef.child(`avatar-${Date.now()}`);
                
                // Faz o upload do arquivo
                await fileRef.put(avatarFile);
                
                // Obtém a URL do arquivo
                const downloadURL = await fileRef.getDownloadURL();
                updateData.photoURL = downloadURL;
            } catch (uploadError) {
                console.error('Erro no upload do avatar:', uploadError);
                showError('Erro no upload', 'Não foi possível fazer o upload da imagem.');
                hideLoading();
                return;
            }
        }
        
        // Atualiza os dados no banco
        await db.ref(`users/${userId}`).update(updateData);
        
        // Atualiza a interface
        document.getElementById('user-display-name').textContent = newNickname;
        if (updateData.photoURL) {
            document.getElementById('user-avatar-preview').src = updateData.photoURL;
        }
        
        // Fecha o modal e exibe mensagem de sucesso
        document.getElementById('profile-modal').classList.add('hidden');
        hideLoading();
        showSuccess('Perfil atualizado', 'Suas informações foram atualizadas com sucesso.');
    } catch (error) {
        console.error('Erro ao atualizar perfil:', error);
        hideLoading();
        showError('Erro', 'Ocorreu um erro ao salvar seu perfil.');
    }
}

/**
 * Retorna os dados do perfil do usuário atual
 * @returns {Promise<Object>} Dados do perfil do usuário
 */
export async function getUserProfileData() {
    const userId = getUsuarioId();
    if (!userId) {
        return null;
    }
    
    try {
        const snapshot = await db.ref(`users/${userId}`).once('value');
        return snapshot.val() || {};
    } catch (error) {
        console.error('Erro ao obter dados do perfil:', error);
        return null;
    }
}
