/**
 * Módulo de gerenciamento de convites
 * Responsável por criar, aceitar e recusar convites para usuários
 */

import { getUsuarioAtual, getUsuarioId, getUsuarioNome, getUsuarioEmail } from '../autenticacao.js';
import { showSuccess, showError, showLoading, hideLoading } from '../ui.js';
import { getUserProfileData } from './userProfile.js';

// Variáveis do módulo
let db;
let activeTab = 'sent';

/**
 * Inicializa o módulo de convites
 * @param {Object} database - Referência ao banco de dados Firebase
 */
export function initInvitations(database) {
    console.log('Inicializando módulo de convites...');
    db = database;
    
    setupInviteModal();
    setupManageInvitesModal();
}

/**
 * Configura o modal de convite
 */
function setupInviteModal() {
    const inviteModal = document.getElementById('invite-modal');
    const inviteUserButton = document.getElementById('invite-user-button');
    const closeInviteModal = document.getElementById('close-invite-modal');
    const cancelInviteButton = document.getElementById('cancel-invite-button');
    const sendInviteButton = document.getElementById('send-invite-button');
    
    // Abrir o modal
    inviteUserButton.addEventListener('click', () => {
        document.getElementById('user-menu-dropdown').classList.add('hidden');
        inviteModal.classList.remove('hidden');
        setTimeout(() => {
            inviteModal.querySelector('.bg-white').classList.remove('scale-95', 'opacity-0');
        }, 10);
        
        // Limpa o campo de email
        document.getElementById('invite-email-input').value = '';
    });
    
    // Fechar o modal
    const closeModal = () => {
        inviteModal.querySelector('.bg-white').classList.add('scale-95', 'opacity-0');
        setTimeout(() => {
            inviteModal.classList.add('hidden');
        }, 300);
    };
    
    closeInviteModal.addEventListener('click', closeModal);
    cancelInviteButton.addEventListener('click', closeModal);
    
    // Enviar convite
    sendInviteButton.addEventListener('click', sendInvite);
}

/**
 * Configura o modal de gerenciamento de convites
 */
function setupManageInvitesModal() {
    const manageInvitesModal = document.getElementById('manage-invites-modal');
    const manageInvitesButton = document.getElementById('manage-invites-button');
    const closeManageInvitesModal = document.getElementById('close-manage-invites-modal');
    const tabInvitesSent = document.getElementById('tab-invites-sent');
    const tabInvitesReceived = document.getElementById('tab-invites-received');
    const tabInvitesAccess = document.getElementById('tab-invites-access');
    
    // Abrir o modal
    manageInvitesButton.addEventListener('click', async () => {
        document.getElementById('user-menu-dropdown').classList.add('hidden');
        manageInvitesModal.classList.remove('hidden');
        setTimeout(() => {
            manageInvitesModal.querySelector('.bg-white').classList.remove('scale-95', 'opacity-0');
        }, 10);
        
        // Verifica se há convites pendentes
        const pendingCount = await checkPendingInvitations();
        
        // Se houver convites pendentes e a aba ativa não for "recebidos", muda para essa aba
        if (pendingCount > 0 && activeTab !== 'received') {
            activeTab = 'received';
            updateInvitesTabUI();
        }
        
        // Carrega os convites ou acessos compartilhados
        if (activeTab === 'access') {
            loadSharedAccess();
        } else {
            loadInvites(activeTab);
        }
    });
    
    // Fechar o modal
    closeManageInvitesModal.addEventListener('click', () => {
        manageInvitesModal.querySelector('.bg-white').classList.add('scale-95', 'opacity-0');
        setTimeout(() => {
            manageInvitesModal.classList.add('hidden');
        }, 300);
    });
    
    // Alternar entre as abas
    tabInvitesSent.addEventListener('click', () => {
        if (activeTab === 'sent') return;
        
        activeTab = 'sent';
        updateInvitesTabUI();
        loadInvites('sent');
    });
    
    tabInvitesReceived.addEventListener('click', () => {
        if (activeTab === 'received') return;
        
        activeTab = 'received';
        updateInvitesTabUI();
        loadInvites('received');
    });
    
    tabInvitesAccess.addEventListener('click', () => {
        if (activeTab === 'access') return;
        
        activeTab = 'access';
        updateInvitesTabUI();
        loadSharedAccess();
    });
    
    // Delegação de eventos para os convites e acessos
    manageInvitesModal.addEventListener('click', async (event) => {
        // Cancelar convite enviado
        const cancelBtn = event.target.closest('.cancel-invite-btn');
        if (cancelBtn) {
            const inviteCard = cancelBtn.closest('.invite-card');
            const inviteId = inviteCard.dataset.inviteId;
            await manageInvite(inviteId, 'cancel');
            return;
        }
        
        // Aceitar convite recebido
        const acceptBtn = event.target.closest('.accept-invite-btn');
        if (acceptBtn) {
            const inviteCard = acceptBtn.closest('.invite-card');
            const inviteId = inviteCard.dataset.inviteId;
            await manageInvite(inviteId, 'accept');
            return;
        }
        
        // Recusar convite recebido
        const declineBtn = event.target.closest('.decline-invite-btn');
        if (declineBtn) {
            const inviteCard = declineBtn.closest('.invite-card');
            const inviteId = inviteCard.dataset.inviteId;
            await manageInvite(inviteId, 'decline');
            return;
        }
        
        // Salvar alteração de permissão
        const savePermissionBtn = event.target.closest('.save-permission-btn');
        if (savePermissionBtn) {
            const accessItem = savePermissionBtn.closest('.shared-access-item');
            const inviteId = accessItem.dataset.inviteId;
            const permissionSelect = accessItem.querySelector('.permission-select');
            const newRole = permissionSelect.value;
            
            if (inviteId && newRole) {
                await updateUserPermission(inviteId, newRole);
                savePermissionBtn.classList.add('hidden');
            }
            return;
        }
        
        // Remover acesso de usuário
        const removeAccessBtn = event.target.closest('.remove-access-btn');
        if (removeAccessBtn) {
            const accessItem = removeAccessBtn.closest('.shared-access-item');
            const inviteId = accessItem.dataset.inviteId;
            const email = accessItem.dataset.email;
            
            if (inviteId && email) {
                const confirmRemove = await Swal.fire({
                    title: 'Remover acesso',
                    text: `Tem certeza que deseja remover o acesso de ${email}?`,
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonText: 'Sim, remover',
                    cancelButtonText: 'Cancelar',
                    confirmButtonColor: '#d33',
                    cancelButtonColor: '#3085d6'
                });
                
                if (confirmRemove.isConfirmed) {
                    await manageInvite(inviteId, 'revoke');
                }
            }
            return;
        }
    });
}

/**
 * Atualiza a UI das abas de convites
 */
function updateInvitesTabUI() {
    const tabSent = document.getElementById('tab-invites-sent');
    const tabReceived = document.getElementById('tab-invites-received');
    const tabAccess = document.getElementById('tab-invites-access');
    const sentContainer = document.getElementById('sent-invites-container');
    const receivedContainer = document.getElementById('received-invites-container');
    const accessContainer = document.getElementById('access-management-container');
    
    // Primeiro, resetamos todos os estilos e ocultamos todos os containers
    [tabSent, tabReceived, tabAccess].forEach(tab => {
        tab.classList.remove('border-indigo-600', 'text-indigo-600');
        tab.classList.add('border-slate-200', 'text-slate-500');
    });
    
    [sentContainer, receivedContainer, accessContainer].forEach(container => {
        container.classList.add('hidden');
    });
    
    // Depois, configuramos a aba ativa
    if (activeTab === 'sent') {
        tabSent.classList.remove('border-slate-200', 'text-slate-500');
        tabSent.classList.add('border-indigo-600', 'text-indigo-600');
        sentContainer.classList.remove('hidden');
    } else if (activeTab === 'received') {
        tabReceived.classList.remove('border-slate-200', 'text-slate-500');
        tabReceived.classList.add('border-indigo-600', 'text-indigo-600');
        receivedContainer.classList.remove('hidden');
    } else if (activeTab === 'access') {
        tabAccess.classList.remove('border-slate-200', 'text-slate-500');
        tabAccess.classList.add('border-indigo-600', 'text-indigo-600');
        accessContainer.classList.remove('hidden');
    }
    
    // Atualiza os ícones para garantir que eles sejam renderizados corretamente
    if (window.lucide) {
        window.lucide.createIcons();
    }
}

/**
 * Envia um convite para outro usuário criando o registro diretamente no banco de dados.
 */
async function sendInvite() {
    const emailInput = document.getElementById('invite-email-input');
    const permissionSelect = document.getElementById('permission-select');
    const email = emailInput.value.trim().toLowerCase();
    const permission = permissionSelect.value;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email === getUsuarioEmail()?.toLowerCase()) {
        showError('Erro', 'Por favor, insira um e-mail válido e diferente do seu.');
        return;
    }

    const currentWorkspace = window.getCurrentWorkspace ? window.getCurrentWorkspace() : null;
    if (!currentWorkspace) {
        showError('Erro', 'Nenhuma área de trabalho selecionada para compartilhar.');
        return;
    }

    showLoading('Enviando convite...');

    try {
        const currentUserProfile = await getUserProfileData();
        const senderName = currentUserProfile.displayName || getUsuarioNome() || "Usuário Anônimo";

        // Cria a referência para o novo convite no banco de dados
        const newInviteRef = db.ref('invitations').push();

        // Monta o objeto do convite
        const inviteData = {
            fromUserId: getUsuarioId(),
            fromUserName: senderName,
            toEmail: email,
            resourceType: 'workspace',
            resourceId: currentWorkspace.id,
            resourceName: currentWorkspace.name,
            role: permission,
            status: 'pending', // A regra de segurança exige que o status inicial seja 'pending'
            createdAt: firebase.database.ServerValue.TIMESTAMP
        };

        // Salva o convite diretamente no banco de dados
        await newInviteRef.set(inviteData);

        document.getElementById('invite-modal').classList.add('hidden');
        hideLoading();
        showSuccess('Convite enviado', `Um convite foi enviado para ${email}.`);
        if (activeTab === 'sent') {
            loadInvites('sent');
        }

    } catch (error) {
        console.error('Erro ao enviar convite diretamente:', error);
        hideLoading();
        showError('Erro no Envio', 'Ocorreu um erro ao criar o convite. Verifique suas regras de segurança.');
    }
}

/**
 * Gere uma ação num convite (aceitar, recusar, cancelar, revogar).
 * @param {string} inviteId - ID do convite
 * @param {string} action - Ação a ser executada
 */
async function manageInvite(inviteId, action) {
    showLoading('Processando...');

    try {
        const inviteRef = db.ref(`invitations/${inviteId}`);
        const updates = {};
        
        if (action === 'accept') {
            const inviteSnapshot = await inviteRef.once('value');
            const inviteData = inviteSnapshot.val();

            if (!inviteData) {
                throw new Error("Convite não encontrado.");
            }

            // Atualiza o status do convite
            updates[`invitations/${inviteId}/status`] = 'accepted';
            updates[`invitations/${inviteId}/acceptedAt`] = firebase.database.ServerValue.TIMESTAMP;

            // **PASSO CRÍTICO:** Adiciona a permissão no accessControl para o usuário que aceitou
            const acceptedByUserId = getUsuarioId();
            updates[`accessControl/${acceptedByUserId}/${inviteData.resourceId}`] = inviteData.role;
            
            // **NOVO:** Adiciona informações públicas do workspace para leitura pelos usuários com acesso
            if (inviteData.resourceType === 'workspace') {
                updates[`sharedWorkspaces/${inviteData.resourceId}`] = {
                    name: inviteData.resourceName,
                    ownerId: inviteData.fromUserId,
                    ownerName: inviteData.fromUserName,
                    isShared: true,
                    updatedAt: firebase.database.ServerValue.TIMESTAMP
                };
            }

        } else if (action === 'decline') {
            updates[`invitations/${inviteId}/status`] = 'declined';
        } else if (action === 'cancel') {
            updates[`invitations/${inviteId}/status`] = 'canceled';
        } else if (action === 'revoke') {
            const inviteSnapshot = await inviteRef.once('value');
            const inviteData = inviteSnapshot.val();
            const invitedUserSnapshot = await db.ref('users').orderByChild('email').equalTo(inviteData.toEmail).once('value');
            
            let invitedUserId = null;
            invitedUserSnapshot.forEach(snapshot => {
                invitedUserId = snapshot.key;
            });
            
            if (invitedUserId) {
                 updates[`accessControl/${invitedUserId}/${inviteData.resourceId}`] = null; // Remove a permissão
            }
            updates[`invitations/${inviteId}/status`] = 'revoked';
            updates[`invitations/${inviteId}/revokedAt`] = firebase.database.ServerValue.TIMESTAMP;
            
            // Verifica se ainda há outros usuários com acesso a este workspace
            const resourceId = inviteData.resourceId;
            const allAccessSnapshot = await db.ref('accessControl').once('value');
            let hasOtherUsers = false;
            
            if (allAccessSnapshot.exists()) {
                const allAccess = allAccessSnapshot.val();
                for (const userId in allAccess) {
                    if (userId !== invitedUserId && allAccess[userId][resourceId]) {
                        hasOtherUsers = true;
                        break;
                    }
                }
            }
            
            // Se não há outros usuários com acesso, remove as informações públicas
            if (!hasOtherUsers) {
                updates[`sharedWorkspaces/${resourceId}`] = null;
            }
        }

        // Aplica todas as atualizações de uma só vez
        await db.ref().update(updates);

        hideLoading();
        showSuccess('Sucesso!', `O convite foi processado.`);

        // Recarrega a lista apropriada
        if (action === 'accept' || action === 'decline') {
            loadInvites('received');
            checkPendingInvitations();
        } else if (action === 'cancel') {
            loadInvites('sent');
        } else if (action === 'revoke') {
            loadSharedAccess();
        }

    } catch (error) {
        console.error(`Erro ao executar a ação '${action}':`, error);
        hideLoading();
        showError('Erro', 'Ocorreu um erro ao processar o convite.');
    }
}

/**
 * Atualiza a permissão de um utilizador diretamente no banco de dados.
 * @param {string} inviteId - O ID do convite original aceite
 * @param {string} newRole - A nova permissão
 */
async function updateUserPermission(inviteId, newRole) {
    showLoading('Atualizando permissão...');
    try {
        // Primeiro, verifica se o usuário atual é o dono do convite
        const inviteSnapshot = await db.ref(`invitations/${inviteId}`).once('value');
        if (!inviteSnapshot.exists()) {
            throw new Error("Convite não encontrado");
        }
        
        const inviteData = inviteSnapshot.val();
        const currentUserId = getUsuarioId();
        
        if (inviteData.fromUserId !== currentUserId) {
            throw new Error("Você não tem permissão para alterar este convite");
        }
        
        // Garante que o convite está no estado "accepted"
        if (inviteData.status !== 'accepted') {
            throw new Error("Só é possível alterar permissões de convites aceitos");
        }
        
        // Atualiza a permissão no convite (uma operação por vez)
        await db.ref(`invitations/${inviteId}`).update({
            role: newRole,
            updatedAt: firebase.database.ServerValue.TIMESTAMP
        });
        
        // Encontra o usuário convidado para atualizar o accessControl dele
        let invitedUserId = null;
        
        // Busca o usuário pelo email do convite
        const userSnapshot = await db.ref('users').orderByChild('email').equalTo(inviteData.toEmail).once('value');
        userSnapshot.forEach(snapshot => {
            invitedUserId = snapshot.key;
        });
        
        if (!invitedUserId) {
            throw new Error("Não foi possível encontrar o usuário para atualizar a permissão");
        }
        
        // Atualiza o accessControl do usuário convidado com a nova permissão
        await db.ref(`accessControl/${invitedUserId}/${inviteData.resourceId}`).set(newRole);
        
        hideLoading();
        showSuccess('Permissão atualizada', 'A permissão do usuário foi alterada com sucesso.');
        loadSharedAccess(); // Recarrega a lista de acessos
        
    } catch (error) {
        console.error('Erro ao atualizar permissão:', error);
        hideLoading();
        showError('Erro na Atualização', 'Não foi possível atualizar a permissão: ' + error.message);
    }
}

/**
 * Carrega os convites enviados ou recebidos
 * @param {string} type - Tipo de convites a carregar: 'sent' ou 'received'
 */
async function loadInvites(type) {
    const userId = getUsuarioId();
    const userEmail = getUsuarioEmail()?.toLowerCase();
    
    if (!userId || !userEmail) {
        showError('Erro', 'Usuário não autenticado.');
        return;
    }
    
    showLoading(`Carregando convites ${type === 'sent' ? 'enviados' : 'recebidos'}...`);
    
    try {
        let query;
        
        if (type === 'sent') {
            // Busca convites enviados pelo usuário atual
            query = db.ref('invitations').orderByChild('fromUserId').equalTo(userId);
        } else {
            // Busca convites recebidos pelo email do usuário atual
            query = db.ref('invitations').orderByChild('toEmail').equalTo(userEmail);
        }
        
        const snapshot = await query.once('value');
        const invites = [];
        
        snapshot.forEach(childSnapshot => {
            const invite = {
                id: childSnapshot.key,
                ...childSnapshot.val()
            };
            
            // Filtra apenas convites recebidos com status 'pending'
            if (type === 'received' && invite.status !== 'pending') {
                return;
            }
            
            invites.push(invite);
        });
        
        renderInvites(invites, type);
        hideLoading();
    } catch (error) {
        console.error(`Erro ao carregar convites ${type}:`, error);
        hideLoading();
        showError('Erro', `Ocorreu um erro ao carregar os convites ${type === 'sent' ? 'enviados' : 'recebidos'}.`);
    }
}

/**
 * Renderiza os convites na interface
 * @param {Array} invites - Lista de convites
 * @param {string} type - Tipo de convites: 'sent' ou 'received'
 */
function renderInvites(invites, type) {
    const container = document.getElementById(`${type}-invites-list`);
    const emptyContainer = document.getElementById(`no-${type}-invites`);
    
    container.innerHTML = '';
    
    if (invites.length === 0) {
        container.classList.add('hidden');
        emptyContainer.classList.remove('hidden');
        return;
    }
    
    container.classList.remove('hidden');
    emptyContainer.classList.add('hidden');
    
    invites.forEach(invite => {
        if (type === 'sent') {
            renderSentInvite(invite, container);
        } else {
            renderReceivedInvite(invite, container);
        }
    });
    
    // Atualiza os ícones
    const iconsToUpdate = document.querySelectorAll('[data-lucide]');
    if (window.lucide && iconsToUpdate) {
        lucide.createIcons({
            icons: iconsToUpdate
        });
    }
}

/**
 * Renderiza um convite enviado
 * @param {Object} invite - Dados do convite
 * @param {HTMLElement} container - Elemento container onde o convite será renderizado
 */
function renderSentInvite(invite, container) {
    const template = document.getElementById('sent-invite-template');
    const clone = document.importNode(template.content, true);
    
    const inviteCard = clone.querySelector('.invite-card');
    inviteCard.dataset.inviteId = invite.id;
    
    const emailEl = clone.querySelector('.invite-email');
    emailEl.textContent = invite.toEmail;
    
    const dateEl = clone.querySelector('.invite-date');
    dateEl.textContent = formatDate(invite.createdAt);
    
    const statusBadge = clone.querySelector('.invite-status-badge');
    const { badgeClass, statusText } = getStatusBadgeInfo(invite.status);
    statusBadge.className = `inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${badgeClass}`;
    statusBadge.textContent = statusText;
    
    // O botão de cancelar só aparece se o status for 'pending'
    const cancelContainer = clone.querySelector('.cancel-invite-container');
    if (invite.status !== 'pending') {
        cancelContainer.style.display = 'none';
    }
    
    container.appendChild(clone);
}

/**
 * Renderiza um convite recebido
 * @param {Object} invite - Dados do convite
 * @param {HTMLElement} container - Elemento container onde o convite será renderizado
 */
function renderReceivedInvite(invite, container) {
    const template = document.getElementById('received-invite-template');
    const clone = document.importNode(template.content, true);
    
    const inviteCard = clone.querySelector('.invite-card');
    inviteCard.dataset.inviteId = invite.id;
    
    const senderEl = clone.querySelector('.invite-sender');
    senderEl.textContent = invite.fromUserName || 'Usuário';
    
    const dateEl = clone.querySelector('.invite-date');
    dateEl.textContent = formatDate(invite.createdAt);
    
    const permissionEl = clone.querySelector('.invite-permission');
    permissionEl.textContent = formatPermission(invite.role);
    
    // Adiciona texto aos botões para melhorar a usabilidade
    const acceptBtn = clone.querySelector('.accept-invite-btn');
    const declineBtn = clone.querySelector('.decline-invite-btn');
    
    // Adiciona texto ao botão de aceitar e ajusta a aparência
    acceptBtn.classList.remove('p-1');
    acceptBtn.classList.add('px-3', 'py-1.5', 'flex', 'items-center', 'gap-1', 'rounded-md', 'bg-emerald-50');
    acceptBtn.innerHTML = `
        <i data-lucide="check" class="h-4 w-4"></i>
        <span class="text-sm font-medium">Aceitar</span>
    `;
    
    // Adiciona texto ao botão de recusar e ajusta a aparência
    declineBtn.classList.remove('p-1');
    declineBtn.classList.add('px-3', 'py-1.5', 'flex', 'items-center', 'gap-1', 'rounded-md', 'bg-slate-50');
    declineBtn.innerHTML = `
        <i data-lucide="x" class="h-4 w-4"></i>
        <span class="text-sm font-medium">Recusar</span>
    `;
    
    container.appendChild(clone);
}

/**
 * Verifica se há convites pendentes para o usuário atual
 * @returns {Promise<number>} Número de convites pendentes
 */
export async function checkPendingInvitations() {
    const userEmail = getUsuarioEmail()?.toLowerCase();
    
    if (!userEmail) {
        return 0;
    }
    
    try {
        const query = db.ref('invitations')
                        .orderByChild('toEmail')
                        .equalTo(userEmail);
        
        const snapshot = await query.once('value');
        let pendingCount = 0;
        
        snapshot.forEach(childSnapshot => {
            const invite = childSnapshot.val();
            if (invite.status === 'pending') {
                pendingCount++;
            }
        });
        
        // Atualiza o badge de notificação na aba de convites recebidos
        updateReceivedInvitesBadge(pendingCount);
        
        return pendingCount;
    } catch (error) {
        console.error('Erro ao verificar convites pendentes:', error);
        return 0;
    }
}

/**
 * Atualiza o badge de notificação na aba de convites recebidos
 * @param {number} count - Número de convites pendentes
 */
function updateReceivedInvitesBadge(count) {
    // Atualiza o badge na aba dentro do modal
    const tabBadge = document.getElementById('received-invites-badge');
    if (tabBadge) {
        if (count > 0) {
            tabBadge.textContent = count > 9 ? '9+' : count.toString();
            tabBadge.classList.remove('hidden');
        } else {
            tabBadge.classList.add('hidden');
        }
    }
    
    // Atualiza o badge no menu principal
    const menuBadge = document.getElementById('menu-invites-badge');
    if (menuBadge) {
        if (count > 0) {
            menuBadge.textContent = count > 9 ? '9+' : count.toString();
            menuBadge.classList.remove('hidden');
        } else {
            menuBadge.classList.add('hidden');
        }
    }
}

/**
 * Carrega e exibe os acessos compartilhados
 */
async function loadSharedAccess() {
    const userId = getUsuarioId();
    
    if (!userId) {
        showError('Erro', 'Usuário não autenticado.');
        return;
    }
    
    showLoading('Carregando usuários com acesso...');
    
    try {
        // Busca todos os convites enviados pelo usuário atual
        const query = db.ref('invitations')
            .orderByChild('fromUserId')
            .equalTo(userId);
        
        const snapshot = await query.once('value');
        
        if (!snapshot.exists()) {
            // Não há convites enviados por este usuário
            renderSharedAccess([]);
            hideLoading();
            return;
        }
        
        const sharedAccess = [];
        
        snapshot.forEach(childSnapshot => {
            const invite = childSnapshot.val();
            const inviteId = childSnapshot.key;
            
            // Considera apenas convites aceitos
            if (invite.status === 'accepted' && invite.toEmail) {
                sharedAccess.push({
                    id: inviteId,
                    email: invite.toEmail,
                    resourceId: invite.resourceId,
                    resourceType: invite.resourceType || 'workspace',
                    role: invite.role,
                    acceptedAt: invite.acceptedAt
                });
            }
        });
        
        // Renderiza os usuários com acesso
        renderSharedAccess(sharedAccess);
        hideLoading();
    } catch (error) {
        console.error('Erro ao carregar usuários com acesso:', error);
        hideLoading();
        showError('Erro', 'Ocorreu um erro ao carregar os usuários com acesso.');
    }
}

/**
 * Renderiza os usuários com acesso compartilhado
 * @param {Array} accessList - Lista de usuários com acesso
 */
function renderSharedAccess(accessList) {
    const container = document.getElementById('shared-access-list');
    const emptyContainer = document.getElementById('no-shared-access');
    
    container.innerHTML = '';
    
    if (accessList.length === 0) {
        container.classList.add('hidden');
        emptyContainer.classList.remove('hidden');
        return;
    }
    
    container.classList.remove('hidden');
    emptyContainer.classList.add('hidden');
    
    // Ordena pela data de aceitação, mais recente primeiro
    accessList.sort((a, b) => (b.acceptedAt || 0) - (a.acceptedAt || 0));
    
    accessList.forEach(access => {
        renderSharedAccessItem(access, container);
    });
    
    // Atualiza os ícones Lucide
    if (window.lucide) {
        window.lucide.createIcons();
    }
}

/**
 * Renderiza um item de acesso compartilhado
 * @param {Object} access - Dados do acesso
 * @param {HTMLElement} container - Container onde o item será renderizado
 */
function renderSharedAccessItem(access, container) {
    const template = document.getElementById('shared-access-template');
    const clone = document.importNode(template.content, true);
    
    const accessItem = clone.querySelector('.shared-access-item');
    accessItem.dataset.inviteId = access.id || '';
    accessItem.dataset.email = access.email || '';
    accessItem.dataset.resourceId = access.resourceId || '';
    accessItem.dataset.role = access.role || '';
    
    const emailEl = clone.querySelector('.user-email');
    emailEl.textContent = access.email || 'Email desconhecido';
    
    const permissionSelect = clone.querySelector('.permission-select');
    permissionSelect.value = access.role || 'viewer';
    
    // Adiciona eventos para o dropdown de permissão
    permissionSelect.addEventListener('change', function() {
        const saveBtn = accessItem.querySelector('.save-permission-btn');
        saveBtn.classList.remove('hidden');
    });
    
    container.appendChild(clone);
}

// Funções auxiliares

/**
 * Retorna informações de estilo e texto para o badge de status
 * @param {string} status - Status do convite
 * @returns {Object} Objeto com classe CSS e texto do status
 */
function getStatusBadgeInfo(status) {
    switch (status) {
        case 'pending':
            return { 
                badgeClass: 'bg-yellow-100 text-yellow-800', 
                statusText: 'Pendente' 
            };
        case 'accepted':
            return { 
                badgeClass: 'bg-green-100 text-green-800', 
                statusText: 'Aceito' 
            };
        case 'declined':
            return { 
                badgeClass: 'bg-red-100 text-red-800', 
                statusText: 'Recusado' 
            };
        case 'canceled':
            return { 
                badgeClass: 'bg-slate-100 text-slate-800', 
                statusText: 'Cancelado' 
            };
        case 'revoked':
            return { 
                badgeClass: 'bg-slate-100 text-slate-800', 
                statusText: 'Revogado' 
            };
        default:
            return { 
                badgeClass: 'bg-slate-100 text-slate-800', 
                statusText: 'Desconhecido' 
            };
    }
}

/**
 * Formata a permissão para exibição
 * @param {string} role - Papel/permissão do usuário
 * @returns {string} Permissão formatada
 */
function formatPermission(role) {
    switch (role) {
        case 'admin':
            return 'Administrador';
        case 'editor':
            return 'Editor';
        case 'viewer':
            return 'Leitor';
        default:
            return role || 'Desconhecido';
    }
}

/**
 * Formata uma data timestamp para exibição
 * @param {number} timestamp - Timestamp em milissegundos
 * @returns {string} Data formatada
 */
function formatDate(timestamp) {
    if (!timestamp) return 'Data desconhecida';
    
    const date = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    
    const isToday = date.toDateString() === today.toDateString();
    const isYesterday = date.toDateString() === yesterday.toDateString();
    
    if (isToday) {
        return `Hoje, ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } else if (isYesterday) {
        return `Ontem, ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } else {
        return date.toLocaleDateString('pt-BR', { 
            day: '2-digit', 
            month: '2-digit', 
            year: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    }
}