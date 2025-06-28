/**
 * Módulo de gerenciamento de perfil do usuário
 * Responsável por exibir e atualizar informações do usuário
 */

import { getUsuarioAtual, getUsuarioId, getUsuarioNome, getUsuarioEmail, getUsuarioFoto, logout } from '../autenticacao.js';
import { showSuccess, showError, showLoading, hideLoading } from '../ui.js';

// Variáveis do módulo
let db;
let storage;
let auth;
let userMenuActive = false;

/**
 * Inicializa o módulo de perfil do usuário
 * @param {Object} database - Referência ao banco de dados Firebase
 */
export function initUserProfile(database) {
    console.log('Inicializando módulo de perfil do usuário...');
    db = database;
    auth = firebase.auth();
    storage = firebase.storage();
    
    // Chamadas síncronas restauradas para melhor tratamento de erro pelo catch de initApp
    setupUserMenu();
    setupProfileModal();
    loadUserProfileData();
}

/**
 * Configura o menu do usuário
 */
function setupUserMenu() {
    let attempts = 0;
    const maxAttempts = 15; // Tentar por ~1.5 segundos (15 * 100ms)
    const intervalDelay = 100; // ms

    const intervalId = setInterval(() => {
        const userMenuButton = document.getElementById('user-menu-button');
        const userMenuDropdown = document.getElementById('user-menu-dropdown');

        if (userMenuButton && userMenuDropdown) {
            clearInterval(intervalId);
            console.log("Elementos do menu do usuário encontrados. Configurando listeners...");

            // Configuração original dos listeners (movida para dentro do if)
            userMenuButton.addEventListener('click', () => {
                userMenuDropdown.classList.toggle('hidden');
                userMenuActive = !userMenuActive;

                const chevronIcon = userMenuButton.querySelector('[data-lucide="chevron-down"], [data-lucide="chevron-up"]');
                if (chevronIcon) {
                    chevronIcon.setAttribute('data-lucide', userMenuActive ? 'chevron-up' : 'chevron-down');
                    if (window.updateLucideIcons) window.updateLucideIcons();
                }
            });

            document.addEventListener('click', (event) => {
                if (userMenuButton && userMenuDropdown && !userMenuButton.contains(event.target) && !userMenuDropdown.contains(event.target)) {
                    if (!userMenuDropdown.classList.contains('hidden')) {
                        userMenuDropdown.classList.add('hidden');
                        userMenuActive = false;
                        const chevronIcon = userMenuButton.querySelector('[data-lucide="chevron-down"], [data-lucide="chevron-up"]');
                        if (chevronIcon) {
                            chevronIcon.setAttribute('data-lucide', 'chevron-down');
                            if (window.updateLucideIcons) window.updateLucideIcons();
                        }
                    }
                }
            });

            const editProfileButton = document.getElementById('edit-profile-button');
            if (editProfileButton) {
                editProfileButton.addEventListener('click', () => {
                    if (userMenuDropdown) userMenuDropdown.classList.add('hidden');
                    userMenuActive = false;
                    const chevronIcon = userMenuButton.querySelector('[data-lucide="chevron-up"]');
                    if (chevronIcon) {
                        chevronIcon.setAttribute('data-lucide', 'chevron-down');
                        if (window.updateLucideIcons) window.updateLucideIcons();
                    }
                    openProfileModal();
                });
            }
            // A ausência do editProfileButton não é um erro crítico para o menu em si.

            const logoutButton = document.getElementById('logout-button');
            if (logoutButton) {
                logoutButton.addEventListener('click', async () => {
                    if (userMenuDropdown) userMenuDropdown.classList.add('hidden');
                    userMenuActive = false;
                    const chevronIcon = userMenuButton.querySelector('[data-lucide="chevron-up"]');
                    if (chevronIcon) {
                        chevronIcon.setAttribute('data-lucide', 'chevron-down');
                        if (window.updateLucideIcons) window.updateLucideIcons();
                    }
                    const result = await logout();
                    if (!result.success) {
                        showError('Erro ao sair', result.error);
                    }
                });
            }
            // A ausência do logoutButton não é um erro crítico para o menu em si.

        } else {
            attempts++;
            if (attempts >= maxAttempts) {
                clearInterval(intervalId);
                console.error("Timeout: Elementos 'user-menu-button' ou 'user-menu-dropdown' não encontrados após " + (maxAttempts * intervalDelay / 1000) + "s.");
                // Lança um erro para ser pego pelo try...catch em initApp
                throw new Error("Falha ao inicializar o menu do usuário: Elementos essenciais não encontrados no DOM.");
            }
        }
    }, intervalDelay);
}

// O código duplicado abaixo foi removido.
// Ele era uma cópia da lógica de event listeners que agora está dentro do
// bloco `if (userMenuButton && userMenuDropdown)` da função setupUserMenu acima.

/**
 * Configura o modal de perfil
 */
function setupProfileModal() {
    let attempts = 0;
    const maxAttempts = 15; // Tentar por ~1.5 segundos
    const intervalDelay = 100; // ms

    const intervalId = setInterval(() => {
        const profileModal = document.getElementById('profile-modal');
        const closeProfileModal = document.getElementById('close-profile-modal');
        const cancelProfileButton = document.getElementById('cancel-profile-button');
        const saveProfileButton = document.getElementById('save-profile-button');
        const changeAvatarButton = document.getElementById('change-avatar-button');
        const avatarUploadInput = document.getElementById('avatar-upload-input');

        if (profileModal && closeProfileModal && cancelProfileButton && saveProfileButton && changeAvatarButton && avatarUploadInput) {
            clearInterval(intervalId);
            console.log("Elementos do modal de perfil encontrados. Configurando listeners...");

            // Configuração original dos listeners (movida para dentro do if)
            const closeModal = () => {
                const innerModal = profileModal.querySelector('.bg-white');
                if (innerModal) {
                    innerModal.classList.add('scale-95', 'opacity-0');
                    setTimeout(() => {
                        profileModal.classList.add('hidden');
                    }, 300);
                } else {
                    profileModal.classList.add('hidden');
                }
            };

            window.openProfileModal = () => {
                profileModal.classList.remove('hidden');
                const innerModal = profileModal.querySelector('.bg-white');
                if (innerModal) {
                    setTimeout(() => {
                        innerModal.classList.remove('scale-95', 'opacity-0');
                    }, 10);
                }
            };

            closeProfileModal.addEventListener('click', closeModal);
            cancelProfileButton.addEventListener('click', closeModal);

            changeAvatarButton.addEventListener('click', () => {
                avatarUploadInput.click();
            });

            avatarUploadInput.addEventListener('change', handleAvatarUpload);
            saveProfileButton.addEventListener('click', saveUserProfile);

        } else {
            attempts++;
            if (attempts >= maxAttempts) {
                clearInterval(intervalId);
                let missingElements = [];
                if (!profileModal) missingElements.push('profile-modal');
                if (!closeProfileModal) missingElements.push('close-profile-modal');
                if (!cancelProfileButton) missingElements.push('cancel-profile-button');
                if (!saveProfileButton) missingElements.push('save-profile-button');
                if (!changeAvatarButton) missingElements.push('change-avatar-button');
                if (!avatarUploadInput) missingElements.push('avatar-upload-input');

                console.error(`Timeout: Elementos do modal de perfil não encontrados (${missingElements.join(', ')}) após ` + (maxAttempts * intervalDelay / 1000) + "s.");
                throw new Error(`Falha ao inicializar o modal de perfil: Elementos essenciais (${missingElements.join(', ')}) não encontrados no DOM.`);
            }
        }
    }, intervalDelay);
}
    
    // Fechar o modal
    const closeModal = () => {
        // Verifica se profileModal e seu filho existem antes de manipular classes
        const innerModal = profileModal.querySelector('.bg-white');
        if (innerModal) {
            innerModal.classList.add('scale-95', 'opacity-0');
            setTimeout(() => {
                profileModal.classList.add('hidden');
            }, 300);
        } else {
            profileModal.classList.add('hidden'); // Fallback se a estrutura interna não for a esperada
        }
    };
    
    // Abrir o modal
    window.openProfileModal = () => {
        profileModal.classList.remove('hidden');
        // Verifica se profileModal e seu filho existem antes de manipular classes
        const innerModal = profileModal.querySelector('.bg-white');
        if (innerModal) {
            setTimeout(() => {
                innerModal.classList.remove('scale-95', 'opacity-0');
            }, 10);
        }
    };
    
    closeProfileModal.addEventListener('click', closeModal);
    cancelProfileButton.addEventListener('click', closeModal);
    
    // Tratamento do upload de avatar
    changeAvatarButton.addEventListener('click', () => {
        avatarUploadInput.click();
    });
    
    avatarUploadInput.addEventListener('change', handleAvatarUpload);
    
    // Salvar alterações no perfil
    saveProfileButton.addEventListener('click', saveUserProfile);
}

/**
 * Carrega os dados do perfil do usuário
 */
async function loadUserProfileData() {
    const currentUser = getUsuarioAtual();
    if (!currentUser) return;
    
    const userId = getUsuarioId();
    const userDisplayName = document.getElementById('user-display-name');
    const userAvatarPreview = document.getElementById('user-avatar-preview');
    const modalAvatarPreview = document.getElementById('modal-avatar-preview');
    const nicknameInput = document.getElementById('nickname-input');
    const emailInput = document.getElementById('email-input');
    
    try {
        // Tenta buscar os dados do usuário no Firebase
        const snapshot = await db.ref(`users/${userId}`).once('value');
        const userData = snapshot.val() || {};
        
        // Define os valores nos elementos da UI
        const displayName = userData.displayName || getUsuarioNome() || 'Usuário';
        userDisplayName.textContent = displayName;
        nicknameInput.value = displayName;
        emailInput.value = getUsuarioEmail() || '';
        
        // Define a imagem do avatar
        const photoURL = userData.photoURL || getUsuarioFoto() || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=random`;
        userAvatarPreview.src = photoURL;
        modalAvatarPreview.src = photoURL;
    } catch (error) {
        console.error('Erro ao carregar dados do usuário:', error);
        
        // Valores padrão em caso de erro
        const displayName = getUsuarioNome() || 'Usuário';
        userDisplayName.textContent = displayName;
        nicknameInput.value = displayName;
        emailInput.value = getUsuarioEmail() || '';
        
        // Avatar padrão em caso de erro
        const photoURL = getUsuarioFoto() || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=random`;
        userAvatarPreview.src = photoURL;
        modalAvatarPreview.src = photoURL;
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