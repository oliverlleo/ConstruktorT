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
        const target = event.target;
        const card = target.closest('.invite-card, .shared-access-item');
        if (!card) return;

        const inviteId = card.dataset.inviteId;

        if (target.closest('.cancel-invite-btn')) await manageInvite(inviteId, 'cancel');
        if (target.closest('.accept-invite-btn')) await manageInvite(inviteId, 'accept');
        if (target.closest('.decline-invite-btn')) await manageInvite(inviteId, 'decline');
        
        if (target.closest('.save-permission-btn')) {
            const newRole = card.querySelector('.permission-select').value;
            await updateUserPermission(inviteId, newRole);
            target.closest('.save-permission-btn').classList.add('hidden');
        }

        if (target.closest('.remove-access-btn')) {
            const email = card.dataset.email;
            const confirmRemove = await Swal.fire({
                title: 'Remover acesso?',
                text: `Tem a certeza que deseja remover o acesso de ${email}?`,
                icon: 'warning', showCancelButton: true, confirmButtonText: 'Sim, remover',
                cancelButtonText: 'Cancelar', confirmButtonColor: '#d33'
            });
            if (confirmRemove.isConfirmed) await manageInvite(inviteId, 'revoke');
        }
    });
}

/**
 * Atualiza a UI das abas de convites
 */
function updateInvitesTabUI() {
    const tabs = {
        sent: document.getElementById('tab-invites-sent'),
        received: document.getElementById('tab-invites-received'),
        access: document.getElementById('tab-invites-access')
    };
    const containers = {
        sent: document.getElementById('sent-invites-container'),
        received: document.getElementById('received-invites-container'),
        access: document.getElementById('access-management-container')
    };
    
    for (const key in tabs) {
        const isTabActive = key === activeTab;
        tabs[key].classList.toggle('border-indigo-600', isTabActive);
        tabs[key].classList.toggle('text-indigo-600', isTabActive);
        tabs[key].classList.toggle('border-slate-200', !isTabActive);
        tabs[key].classList.toggle('text-slate-500', !isTabActive);
        containers[key].classList.toggle('hidden', !isTabActive);
    }
    
    if (window.lucide) {
        window.lucide.createIcons();
    }
}

/**
 * Envia um convite para outro usuário.
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

        const inviteData = {
            fromUserId: getUsuarioId(),
            fromUserName: senderName,
            toEmail: email,
            // toUserId: null, // Not needed at creation, will be set on accept if they register through invite.
            resourceType: 'workspace',
            resourceId: currentWorkspace.id,
            resourceName: currentWorkspace.name, // For display in the invitation list
            role: permission,
            status: 'pending',
            createdAt: firebase.firestore.FieldValue.serverTimestamp() // Firestore timestamp
        };

        await db.collection('invitations').add(inviteData);
        console.log("[sendInvite] Invitation created in Firestore:", inviteData);

        document.getElementById('invite-modal').classList.add('hidden');
        hideLoading();
        showSuccess('Convite enviado', `Um convite foi enviado para ${email}.`);
        if (activeTab === 'sent') {
            loadInvites('sent');
        }

    } catch (error) {
        console.error('Erro ao enviar convite:', error);
        hideLoading();
        showError('Erro no Envio', 'Ocorreu um erro ao criar o convite.');
    }
}

/**
 * Gere uma ação num convite (aceitar, recusar, cancelar, revogar).
 * @param {string} inviteId - ID do convite
 * @param {string} action - Ação a ser executada
 */
async function manageInvite(inviteId, action) {
    showLoading('Processando...');
    const inviteRef = db.doc(`invitations/${inviteId}`);
    const batch = db.batch(); // Use a batch for atomic writes

    try {
        const inviteSnapshot = await inviteRef.get();
        if (!inviteSnapshot.exists) {
            throw new Error("Convite não encontrado.");
        }
        const inviteData = inviteSnapshot.data();
        const acceptedByUserId = getUsuarioId(); // User performing the action

        if (action === 'accept') {
            if (!acceptedByUserId) throw new Error("Usuário não autenticado para aceitar o convite.");

            batch.update(inviteRef, {
                status: 'accepted',
                acceptedAt: firebase.firestore.FieldValue.serverTimestamp(),
                toUserId: acceptedByUserId // Store the ID of the user who accepted
            });

            // Update accessControl: accessControl/{workspaceId} -> { userId: role }
            const accessControlRef = db.doc(`accessControl/${inviteData.resourceId}`);
            batch.set(accessControlRef, {
                [acceptedByUserId]: inviteData.role
            }, { merge: true });
            
            // The old `sharedWorkspaces` update is removed as it's not part of the Firestore model.
            // Workspace data is fetched directly from users/{ownerId}/workspaces/{workspaceId}.

        } else if (action === 'revoke') {
            // This action is typically performed by the sender (owner of the resource)
            // It means removing access from someone who previously accepted.
            const userToRevokeAccessFrom = inviteData.toUserId;
            if (!userToRevokeAccessFrom) {
                console.warn("[manageInvite] Cannot revoke access: toUserId not found on the accepted invite.", inviteData);
                throw new Error("Não é possível revogar o acesso: informações do destinatário ausentes.");
            }

            batch.update(inviteRef, { status: 'revoked' });

            // Remove from accessControl
            const accessControlRef = db.doc(`accessControl/${inviteData.resourceId}`);
            batch.update(accessControlRef, {
                [userToRevokeAccessFrom]: firebase.firestore.FieldValue.delete()
            });

        } else if (action === 'cancel') { // Sender cancels a pending invite
            if (inviteData.fromUserId !== acceptedByUserId) throw new Error("Apenas quem enviou pode cancelar o convite.");
            if (inviteData.status !== 'pending') throw new Error("Apenas convites pendentes podem ser cancelados.");
            batch.update(inviteRef, { status: 'canceled' });

        } else if (action === 'decline') { // Recipient declines a pending invite
            if (inviteData.toEmail.toLowerCase() !== getUsuarioEmail()?.toLowerCase() && inviteData.toUserId !== acceptedByUserId) {
                 // Check either email if toUserId not yet set, or toUserId if it was set (e.g. direct assignment)
                throw new Error("Você só pode recusar convites endereçados a você.");
            }
            if (inviteData.status !== 'pending') throw new Error("Apenas convites pendentes podem ser recusados.");
            batch.update(inviteRef, {
                status: 'declined',
                declinedByUserId: acceptedByUserId // Optionally store who declined
            });
        } else {
            throw new Error(`Ação desconhecida: ${action}`);
        }

        await batch.commit();
        hideLoading();
        showSuccess('Sucesso!', `O convite foi ${action === 'accept' ? 'aceito' : (action === 'revoke' ? 'revogado' : (action === 'cancel' ? 'cancelado' : 'recusado'))}.`);

        // Recarrega a aba atual
        if (activeTab === 'access') loadSharedAccess();
        else loadInvites(activeTab);
        
        if (action === 'accept' || action === 'decline') checkPendingInvitations();

    } catch (error) {
        console.error(`Erro ao executar a ação '${action}':`, error);
        hideLoading();
        showError('Erro', `Ocorreu um erro ao processar o convite: ${error.message}`);
    }
}

/**
 * Atualiza a permissão de um utilizador.
 * @param {string} inviteId - O ID do convite original aceite
 * @param {string} newRole - A nova permissão
 */
async function updateUserPermission(inviteId, newRole) {
    showLoading('Atualizando permissão...');
    const inviteRef = db.doc(`invitations/${inviteId}`);
    const batch = db.batch();

    try {
        const inviteSnapshot = await inviteRef.get();
        if (!inviteSnapshot.exists()) {
            throw new Error("Convite não encontrado para atualizar permissão.");
        }
        const inviteData = inviteSnapshot.data();

        if (inviteData.fromUserId !== getUsuarioId()) {
            throw new Error("Apenas o proprietário do recurso (quem enviou o convite) pode alterar a permissão.");
        }
        if (inviteData.status !== 'accepted') {
            throw new Error("Só é possível alterar permissões de convites que já foram aceitos.");
        }
        
        const invitedUserId = inviteData.toUserId;
        if (!invitedUserId) {
            throw new Error("O ID do usuário convidado (toUserId) não foi encontrado no convite. A permissão não pode ser alterada.");
        }

        // Update role in the invitation document
        batch.update(inviteRef, { role: newRole });

        // Update role in accessControl/{workspaceId}
        const accessControlRef = db.doc(`accessControl/${inviteData.resourceId}`);
        batch.update(accessControlRef, {
            [invitedUserId]: newRole
            // Note: Using update assumes the accessControl doc and invitedUserId field exist.
            // If it's possible they don't (e.g., data inconsistency), set with merge might be safer:
            // batch.set(accessControlRef, { [invitedUserId]: newRole }, { merge: true });
            // However, for an accepted invite, these should exist.
        });

        await batch.commit();
        hideLoading();
        showSuccess('Permissão atualizada!', 'A permissão do usuário foi atualizada com sucesso.');

        // Recarrega a aba de acessos compartilhados para refletir a mudança
        if (activeTab === 'access') {
            loadSharedAccess();
        }
        
    } catch (error) {
        console.error('[updateUserPermission] Erro ao atualizar permissão:', error);
        hideLoading();
        showError('Erro na Atualização', error.message);
    }
}

/**
 * Carrega os convites enviados ou recebidos
 * @param {string} type - Tipo de convites a carregar: 'sent' ou 'received'
 */
async function loadInvites(type) {
    const userId = getUsuarioId();
    const userEmail = getUsuarioEmail()?.toLowerCase();
    if (!userId || !userEmail) return;
    
    showLoading(`Carregando convites...`);
    
    try {
        let query;
        if (type === 'sent') {
            query = db.collection('invitations')
                      .where('fromUserId', '==', userId)
                      .orderBy('createdAt', 'desc'); // Order by creation time
        } else { // 'received'
            query = db.collection('invitations')
                      .where('toEmail', '==', userEmail)
                      // For received, we typically only care about pending ones in this view
                      .where('status', '==', 'pending')
                      .orderBy('createdAt', 'desc');
        }
        
        const snapshot = await query.get();
        const invites = [];
        snapshot.forEach(doc => {
            invites.push({ id: doc.id, ...doc.data() });
        });
        
        // The filtering for 'pending' for received invites is now done in the query itself.
        // Sorting by createdAt is also done in the query.
        renderInvites(invites, type);
        hideLoading();
    } catch (error) {
        console.error(`[loadInvites] Error loading ${type} invites:`, error);
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
    const containerId = `${type}-invites-list`;
    const emptyId = `no-${type}-invites`;
    const container = document.getElementById(containerId);
    const emptyContainer = document.getElementById(emptyId);
    
    container.innerHTML = '';
    container.classList.toggle('hidden', invites.length === 0);
    emptyContainer.classList.toggle('hidden', invites.length > 0);

    if(invites.length > 0) {
        const templateId = type === 'sent' ? 'sent-invite-template' : 'received-invite-template';
        const template = document.getElementById(templateId);
        invites.forEach(invite => {
            const clone = document.importNode(template.content, true);
            const card = clone.querySelector('.invite-card');
            card.dataset.inviteId = invite.id;

            if (type === 'sent') {
                card.querySelector('.invite-email').textContent = invite.toEmail;
                const statusBadge = card.querySelector('.invite-status-badge');
                const { badgeClass, statusText } = getStatusBadgeInfo(invite.status);
                statusBadge.className = `inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${badgeClass}`;
                statusBadge.textContent = statusText;
                card.querySelector('.cancel-invite-container').style.display = invite.status === 'pending' ? '' : 'none';
            } else {
                card.querySelector('.invite-sender').textContent = invite.fromUserName || 'Usuário';
                card.querySelector('.invite-permission').textContent = formatPermission(invite.role);
                 // Adiciona texto aos botões para melhorar a usabilidade
                const acceptBtn = clone.querySelector('.accept-invite-btn');
                const declineBtn = clone.querySelector('.decline-invite-btn');
                
                acceptBtn.innerHTML = `<i data-lucide="check" class="h-4 w-4"></i><span class="text-sm font-medium">Aceitar</span>`;
                declineBtn.innerHTML = `<i data-lucide="x" class="h-4 w-4"></i><span class="text-sm font-medium">Recusar</span>`;
            }
            card.querySelector('.invite-date').textContent = formatDate(invite.createdAt);
            container.appendChild(clone);
        });
    }
    if (window.lucide) window.lucide.createIcons();
}

/**
 * Verifica se há convites pendentes para o usuário atual
 * @returns {Promise<number>} Número de convites pendentes
 */
export async function checkPendingInvitations() {
    const userEmail = getUsuarioEmail()?.toLowerCase();
    if (!userEmail) {
        console.warn("[checkPendingInvitations] User email not available.");
        updateReceivedInvitesBadge(0); // Ensure badge is cleared
        return 0;
    }
    
    try {
        const query = db.collection('invitations')
                        .where('toEmail', '==', userEmail)
                        .where('status', '==', 'pending');

        const snapshot = await query.get();
        const pendingCount = snapshot.size; // Firestore snapshots have a .size property

        updateReceivedInvitesBadge(pendingCount);
        console.log(`[checkPendingInvitations] Found ${pendingCount} pending invitations for ${userEmail}`);
        return pendingCount;
    } catch (error) {
        console.error('[checkPendingInvitations] Erro ao verificar convites pendentes:', error);
        updateReceivedInvitesBadge(0); // Clear badge on error
        return 0;
    }
}

/**
 * Atualiza o badge de notificação na aba de convites recebidos
 * @param {number} count - Número de convites pendentes
 */
function updateReceivedInvitesBadge(count) {
    [document.getElementById('received-invites-badge'), document.getElementById('menu-invites-badge')].forEach(badge => {
        if (badge) {
            badge.classList.toggle('hidden', count === 0);
            if (count > 0) badge.textContent = count > 9 ? '9+' : count.toString();
        }
    });
}

/**
 * Carrega e exibe os acessos compartilhados
 */
async function loadSharedAccess() {
    const userId = getUsuarioId();
    if (!userId) return;
    
    showLoading('Carregando usuários com acesso...');
    
    try {
        const query = db.collection('invitations')
                        .where('fromUserId', '==', userId) // Invites sent by the current user
                        .where('status', '==', 'accepted') // That have been accepted
                        .orderBy('acceptedAt', 'desc'); // Show most recently accepted first
        
        const snapshot = await query.get();

        const sharedAccess = [];
        snapshot.forEach(doc => {
            sharedAccess.push({ id: doc.id, ...doc.data() });
        });
        
        renderSharedAccess(sharedAccess); // Already sorted by query
        hideLoading();
        console.log(`[loadSharedAccess] Loaded ${sharedAccess.length} accepted invites sent by user ${userId}`);
    } catch (error) {
        hideLoading();
        console.error('[loadSharedAccess] Erro ao carregar usuários com acesso:', error);
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
    container.classList.toggle('hidden', accessList.length === 0);
    emptyContainer.classList.toggle('hidden', accessList.length > 0);

    if (accessList.length > 0) {
        const template = document.getElementById('shared-access-template');
        accessList.forEach(access => {
            const clone = document.importNode(template.content, true);
            const item = clone.querySelector('.shared-access-item');
            item.dataset.inviteId = access.id;
            item.dataset.email = access.toEmail;
            
            item.querySelector('.user-email').textContent = access.toEmail;
            
            const permissionSelect = item.querySelector('.permission-select');
            permissionSelect.value = access.role;
            permissionSelect.addEventListener('change', () => item.querySelector('.save-permission-btn').classList.remove('hidden'));
            
            container.appendChild(clone);
        });
    }
    if (window.lucide) window.lucide.createIcons();
}

// Funções auxiliares
function getStatusBadgeInfo(status) {
    const statuses = {
        pending: { badgeClass: 'bg-yellow-100 text-yellow-800', statusText: 'Pendente' },
        accepted: { badgeClass: 'bg-green-100 text-green-800', statusText: 'Aceito' },
        declined: { badgeClass: 'bg-red-100 text-red-800', statusText: 'Recusado' },
        canceled: { badgeClass: 'bg-slate-100 text-slate-800', statusText: 'Cancelado' },
        revoked: { badgeClass: 'bg-slate-100 text-slate-800', statusText: 'Revogado' }
    };
    return statuses[status] || { badgeClass: 'bg-slate-100 text-slate-800', statusText: 'Desconhecido' };
}

function formatPermission(role) {
    const roles = { admin: 'Administrador', editor: 'Editor', viewer: 'Leitor' };
    return roles[role] || role;
}

function formatDate(timestamp) {
    if (!timestamp) return 'Data desconhecida';
    const date = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    
    if (date.toDateString() === today.toDateString()) {
        return `Hoje, ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } else if (date.toDateString() === yesterday.toDateString()) {
        return `Ontem, ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } else {
        return date.toLocaleDateString('pt-BR', { 
            day: '2-digit', 
            month: '2-digit', 
            year: 'numeric'
        });
    }
}
