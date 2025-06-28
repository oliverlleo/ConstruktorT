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
    
    setupUserMenu();
    setupProfileModal();
    loadUserProfileData();
}

/**
 * Configura o menu do usuário
 */
function setupUserMenu() {
    console.log("[userProfile.js] Início de setupUserMenu, user-menu-button:", document.getElementById('user-menu-button'));
    const userMenuButton = document.getElementById('user-menu-button');
    const userMenuDropdown = document.getElementById('user-menu-dropdown');
    const mobileMenuToggle = document.getElementById('mobile-menu-toggle'); // Get the mobile toggle

    if (userMenuButton && userMenuDropdown) {
        // Verificar se o mobile-menu-toggle está presente e visível
        // offsetWidth > 0 é uma forma de checar se o elemento está visível (não display:none, etc.)
        const isMobileLayout = mobileMenuToggle && mobileMenuToggle.offsetWidth > 0 && mobileMenuToggle.offsetHeight > 0;

        if (!isMobileLayout) { // Só configurar o dropdown do user-menu-button se NÃO estivermos no layout mobile onde o toggle é rei
            console.log("[userProfile.js] Configurando listeners para user-menu-button (layout não móvel ou mobile-menu-toggle não visível)");
            userMenuButton.addEventListener('click', () => {
                userMenuDropdown.classList.toggle('hidden');
                userMenuActive = !userMenuActive;
                
                const chevronIcon = userMenuButton.querySelector('[data-lucide="chevron-down"], [data-lucide="chevron-up"]');
                if (chevronIcon) {
                    chevronIcon.setAttribute('data-lucide', userMenuActive ? 'chevron-up' : 'chevron-down');
                    if (window.lucide) {
                        lucide.createIcons();
                    }
                }
            });

            // Fecha o menu ao clicar fora dele
            document.addEventListener('click', (event) => {
                if (!userMenuButton.contains(event.target) && !userMenuDropdown.contains(event.target)) {
                    if (!userMenuDropdown.classList.contains('hidden')) {
                        userMenuDropdown.classList.add('hidden');
                        userMenuActive = false;
                        const chevronIcon = userMenuButton.querySelector('[data-lucide="chevron-down"], [data-lucide="chevron-up"]');
                        if (chevronIcon) {
                            chevronIcon.setAttribute('data-lucide', 'chevron-down');
                            if (window.lucide) {
                                lucide.createIcons();
                            }
                        }
                    }
                }
            });
        } else {
            console.log("[userProfile.js] Layout móvel detectado (mobile-menu-toggle visível). Listeners do user-menu-button para dropdown não serão anexados.");
            // No layout móvel, o user-menu-dropdown associado ao user-menu-button principal
            // provavelmente não deve ser usado, pois mobile-menu-toggle controla a desktop-sidebar.
            // Podemos até explicitamente garantir que o user-menu-dropdown esteja oculto.
            if (userMenuDropdown) { // Check if dropdown exists before adding class
                userMenuDropdown.classList.add('hidden');
            }
        }

        // Configurações de perfil e logout ainda podem ser vinculadas aos botões dentro do dropdown,
        // mas o dropdown em si só abriria no desktop.
        // No mobile, esses links estariam na desktop-sidebar (se ela for populada com eles).
        // Esta parte do código original assume que user-menu-dropdown é o container:

        const editProfileButton = document.getElementById('edit-profile-button');
        if (editProfileButton) { // Não depende mais do userMenuDropdown para ser encontrado
            editProfileButton.addEventListener('click', () => {
                if (userMenuDropdown && !userMenuDropdown.classList.contains('hidden')) { // Se o dropdown estiver aberto (desktop)
                    userMenuDropdown.classList.add('hidden');
                    userMenuActive = false;
                }
                // Em mobile, o openProfileModal pode vir de um botão na sidebar
                openProfileModal(); 
            });
        }
    
        const logoutButton = document.getElementById('logout-button');
        if (logoutButton) { // Não depende mais do userMenuDropdown
            logoutButton.addEventListener('click', async () => {
                if (userMenuDropdown && !userMenuDropdown.classList.contains('hidden')) { // Se o dropdown estiver aberto (desktop)
                    userMenuDropdown.classList.add('hidden');
                }
                const result = await logout();
                if (result.success) {
                    // O redirecionamento será tratado pelo módulo de autenticação
                } else {
                    showError('Erro ao sair', result.error);
                }
            });
        }

    } else {
        if (!userMenuButton) {
            console.warn("[userProfile.js] user-menu-button não encontrado. Menu do usuário não configurado.");
        }
        if (!userMenuDropdown) {
            console.warn("[userProfile.js] user-menu-dropdown não encontrado. Menu do usuário não configurado.");
        }
    }
}

/**
 * Configura o modal de perfil
 */
function setupProfileModal() {
    const profileModal = document.getElementById('profile-modal');
    const closeProfileModal = document.getElementById('close-profile-modal');
    const cancelProfileButton = document.getElementById('cancel-profile-button');
    const saveProfileButton = document.getElementById('save-profile-button');
    const changeAvatarButton = document.getElementById('change-avatar-button');
    const avatarUploadInput = document.getElementById('avatar-upload-input');
    
    // Fechar o modal
    const closeModal = () => {
        profileModal.querySelector('.bg-white').classList.add('scale-95', 'opacity-0');
        setTimeout(() => {
            profileModal.classList.add('hidden');
        }, 300);
    };
    
    // Abrir o modal
    window.openProfileModal = () => {
        profileModal.classList.remove('hidden');
        setTimeout(() => {
            profileModal.querySelector('.bg-white').classList.remove('scale-95', 'opacity-0');
        }, 10);
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
