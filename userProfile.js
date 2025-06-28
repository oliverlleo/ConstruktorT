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
 * @param {string} userId - ID do usuário autenticado
 */
export async function initUserProfile(database, userId) { // Adicionado userId, função agora é async
    console.log('Inicializando módulo de perfil do usuário para:', userId);
    db = database; // db agora é definido aqui, antes era global não inicializado no escopo de loadUserProfileData se chamado diretamente.
    auth = firebase.auth(); // auth e storage também precisam ser inicializados se não foram antes.
    storage = firebase.storage();

    setupUserMenu(); // Pode precisar de dados do usuário, mas geralmente configura listeners
    setupProfileModal(); // Similar ao setupUserMenu

    // --- MUDANÇA CRÍTICA ---
    // Aguarde os dados antes de prosseguir
    try {
        const userData = await loadUserProfileData(userId);
        // Agora você pode passar 'userData' para outras funções se necessário
        // ou simplesmente garantir que tudo foi carregado antes de sair da função.
        console.log("Dados do perfil do usuário carregados em initUserProfile:", userData);
    } catch (error) {
        console.error("Falha ao carregar dados do perfil durante a inicialização do módulo de perfil:", error);
        // Decidir como lidar com o erro aqui, talvez mostrar uma UI de erro específica.
    }
    console.log("Módulo de perfil do usuário inicializado com sucesso.");
}

/**
 * Configura o menu do usuário
 */
function setupUserMenu() {
    const userMenuButton = document.getElementById('user-menu-button');
    const userMenuDropdown = document.getElementById('user-menu-dropdown');
    const editProfileButton = document.getElementById('edit-profile-button');
    const logoutButton = document.getElementById('logout-button');

    if (!userMenuButton || !userMenuDropdown || !editProfileButton || !logoutButton) {
        console.error("Elementos do menu do usuário não encontrados. A funcionalidade do menu pode estar comprometida.");
        return;
    }
    
    // Mostra/Esconde o menu ao clicar no botão
    userMenuButton.addEventListener('click', () => {
        userMenuDropdown.classList.toggle('hidden');
        userMenuActive = !userMenuActive;
        
        // Atualiza o ícone de chevron
        const chevronIcon = userMenuButton.querySelector('i.fa-solid'); // More specific selector
        if (chevronIcon) {
            // Toggle chevron up/down based on state
            if (userMenuActive) {
                chevronIcon.classList.remove('fa-chevron-down');
                chevronIcon.classList.add('fa-chevron-up');
            } else {
                chevronIcon.classList.remove('fa-chevron-up');
                chevronIcon.classList.add('fa-chevron-down');
            }
            // Note: Lucide icon update might be handled by a global observer or might need specific call if not auto-updating
        }
    });
    
    // Fecha o menu ao clicar fora dele
    document.addEventListener('click', (event) => {
        // Certifique-se de que os elementos existem antes de chamar contains
        if (userMenuButton && userMenuDropdown && 
            !userMenuButton.contains(event.target) && 
            !userMenuDropdown.contains(event.target)) {
            if (!userMenuDropdown.classList.contains('hidden')) {
                userMenuDropdown.classList.add('hidden');
                userMenuActive = false;
                
                // Atualiza o ícone de chevron
                const chevronIcon = userMenuButton.querySelector('i.fa-solid');
                if (chevronIcon) {
                    chevronIcon.classList.remove('fa-chevron-up');
                    chevronIcon.classList.add('fa-chevron-down');
                }
            }
        }
    });
    
    // Configura o botão de editar perfil
    editProfileButton.addEventListener('click', () => {
        if (userMenuDropdown) userMenuDropdown.classList.add('hidden');
        userMenuActive = false;
        openProfileModal(); // Ensure openProfileModal is robust
    });
    
    // Configura o botão de logout
    logoutButton.addEventListener('click', async () => {
        if (userMenuDropdown) userMenuDropdown.classList.add('hidden');
        const result = await logout();
        if (result.success) {
            // O redirecionamento será tratado pelo módulo de autenticação
        } else {
            showError('Erro ao sair', result.error);
        }
    });
}

/**
 * Configura o modal de perfil
 */
function setupProfileModal() {
    const profileModal = document.getElementById('profile-modal');
    const closeProfileModalButton = document.getElementById('close-profile-modal'); // Renamed for clarity
    const cancelProfileButton = document.getElementById('cancel-profile-button');
    const saveProfileButton = document.getElementById('save-profile-button');
    const changeAvatarButton = document.getElementById('change-avatar-button');
    const avatarUploadInput = document.getElementById('avatar-upload-input');

    if (!profileModal || !closeProfileModalButton || !cancelProfileButton || !saveProfileButton || !changeAvatarButton || !avatarUploadInput) {
        console.error("Elementos do modal de perfil não encontrados. A funcionalidade do modal pode estar comprometida.");
        return;
    }
    
    const innerModalContent = profileModal.querySelector('.bg-white'); // More robust selector
    if (!innerModalContent) {
        console.error("Conteúdo interno do modal de perfil não encontrado.");
        return;
    }

    // Fechar o modal
    const closeModal = () => {
        innerModalContent.classList.add('scale-95', 'opacity-0');
        setTimeout(() => {
            profileModal.classList.add('hidden');
        }, 300);
    };
    
    // Abrir o modal - make it globally available if needed, or call it from within this module
    window.openProfileModal = async () => { // Keep window.openProfileModal if it's called from elsewhere
        const currentUserId = getUsuarioId();
        if (!currentUserId) {
            showError("Erro", "Usuário não autenticado para abrir perfil.");
            return;
        }
        try {
            await loadUserProfileData(currentUserId); // Load data when opening
            profileModal.classList.remove('hidden');
            setTimeout(() => {
                innerModalContent.classList.remove('scale-95', 'opacity-0');
            }, 10);
        } catch (error) {
            showError("Erro ao carregar perfil", "Não foi possível carregar os dados do perfil.");
        }
    };

    closeProfileModalButton.addEventListener('click', closeModal);
        }, 10);
    };
    
    closeProfileModalButton.addEventListener('click', closeModal);
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
 * Carrega os dados do perfil do usuário nos elementos da UI e retorna os dados.
 * Chamado ao abrir o modal de perfil e na inicialização.
 * @param {string} userId - ID do usuário para carregar os dados.
 * @returns {Promise<Object>} Os dados do usuário carregados.
 */
async function loadUserProfileData(userId) { // Modificada para aceitar userId
    if (!userId) {
        console.warn("userId não fornecido para loadUserProfileData.");
        throw new Error("User ID is required to load profile data.");
    }
    // db deve ser inicializado antes desta função ser chamada, o que agora acontece em initUserProfile
    if (!db) {
        console.error("Firebase DB não inicializado em loadUserProfileData. Isso não deveria acontecer.");
        throw new Error("Database not initialized.");
    }

    try {
        // Tenta buscar os dados do usuário no Firebase
        const snapshot = await db.ref(`users/${userId}`).once('value');
        const userData = snapshot.val() || {}; // Garante que userData seja um objeto

        // Verificação dos elementos da UI (ainda é uma boa prática)
        const userDisplayNameElement = document.getElementById('user-display-name');
        const userAvatarPreviewElement = document.getElementById('user-avatar-preview');
        const modalAvatarPreviewElement = document.getElementById('modal-avatar-preview');
        const nicknameInputElement = document.getElementById('nickname-input');
        const emailInputElement = document.getElementById('email-input');

        // Define os valores nos elementos da UI, com verificações de existência
        const displayName = userData.displayName || getUsuarioNome() || 'Usuário'; // getUsuarioNome() pode vir do auth state
        const userEmail = getUsuarioEmail(); // Email geralmente vem do auth state, não do DB profile userData
        const photoURL = userData.photoURL || getUsuarioFoto() || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=random`;

        if (userDisplayNameElement) {
            userDisplayNameElement.textContent = displayName;
        } else {
            console.warn("Elemento 'user-display-name' não encontrado durante o carregamento dos dados do perfil.");
        }
        if (nicknameInputElement) {
            nicknameInputElement.value = displayName;
        } else {
            console.warn("Elemento 'nickname-input' não encontrado.");
        }
        if (emailInputElement) {
            emailInputElement.value = userEmail || '';
        } else {
            console.warn("Elemento 'email-input' não encontrado.");
        }
        if (userAvatarPreviewElement) {
            userAvatarPreviewElement.src = photoURL;
        } else {
            console.warn("Elemento 'user-avatar-preview' não encontrado.");
        }
        if (modalAvatarPreviewElement) {
            modalAvatarPreviewElement.src = photoURL;
        } else {
            console.warn("Elemento 'modal-avatar-preview' não encontrado.");
        }

        // --- MUDANÇA CRÍTICA ---
        // Retorne os dados carregados para quem chamou a função.
        return userData;

    } catch (error) {
        console.error('Erro ao carregar dados do usuário:', error);
        // Valores padrão em caso de erro (opcional, pois o erro será lançado)
        const userDisplayNameElement = document.getElementById('user-display-name');
        if (userDisplayNameElement) userDisplayNameElement.textContent = getUsuarioNome() || 'Usuário';
        // ... outros fallbacks se desejar antes de lançar ...

        // Lance o erro para que a função que chamou saiba que algo deu errado.
        throw error;
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