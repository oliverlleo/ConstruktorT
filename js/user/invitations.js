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
        
        const pendingCount = await checkPendingInvitations();
        
        if (pendingCount > 0 && activeTab !== 'received') {
            activeTab = 'received';
            updateInvitesTabUI();
        }
        
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
        const inviteCard = event.target.closest('.invite-card, .shared-access-item');
        if (!inviteCard) return;

        const inviteId = inviteCard.dataset.inviteId;

        // Cancelar convite enviado
        if (event.target.closest('.cancel-invite-btn')) {
            await manageInvite(inviteId, 'cancel');
            return;
        }
        
        // Aceitar convite recebido
        if (event.target.closest('.accept-invite-btn')) {
            await manageInvite(inviteId, 'accept');
            return;
        }
        
        // Recusar convite recebido
        if (event.target.closest('.decline-invite-btn')) {
            await manageInvite(inviteId, 'decline');
            return;
        }
        
        // Salvar alteração de permissão
        if (event.target.closest('.save-permission-btn')) {
            const permissionSelect = inviteCard.querySelector('.permission-select');
            const newRole = permissionSelect.value;
            await updateUserPermission(inviteId, newRole);
            event.target.closest('.save-permission-btn').classList.add('hidden');
            return;
        }
        
        // Remover acesso de usuário
        if (event.target.closest('.remove-access-btn')) {
            const email = inviteCard.dataset.email;
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
        const newInviteRef = db.ref('invitations').push();
        const inviteData = {
            fromUserId: getUsuarioId(),
            fromUserName: senderName,
            toEmail: email,
            toUserId: null, // Será preenchido quando o convite for aceite
            resourceType: 'workspace',
            resourceId: currentWorkspace.id,
            resourceName: currentWorkspace.name,
            role: permission,
            status: 'pending',
            createdAt: firebase.database.ServerValue.TIMESTAMP
        };

        await newInviteRef.set(inviteData);
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

    try {
        const inviteRef = db.ref(`invitations/${inviteId}`);
        const updates = {};
        
        const inviteSnapshot = await inviteRef.once('value');
        if (!inviteSnapshot.exists()) throw new Error("Convite não encontrado.");
        const inviteData = inviteSnapshot.val();
        
        if (action === 'accept') {
            const acceptedByUserId = getUsuarioId();
            updates[`invitations/${inviteId}/status`] = 'accepted';
            updates[`invitations/${inviteId}/acceptedAt`] = firebase.database.ServerValue.TIMESTAMP;
            // **CORREÇÃO CRÍTICA**: Guarda o ID do utilizador que aceitou
            updates[`invitations/${inviteId}/toUserId`] = acceptedByUserId;
            updates[`accessControl/${acceptedByUserId}/${inviteData.resourceId}`] = inviteData.role;
            
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
            // **CORREÇÃO CRÍTICA**: Usa o `toUserId` guardado em vez de pesquisar
            const invitedUserId = inviteData.toUserId;
            if (invitedUserId) {
                 updates[`accessControl/${invitedUserId}/${inviteData.resourceId}`] = null; // Remove a permissão
            }
            updates[`invitations/${inviteId}/status`] = 'revoked';
            updates[`invitations/${inviteId}/revokedAt`] = firebase.database.ServerValue.TIMESTAMP;
        }

        await db.ref().update(updates);

        hideLoading();
        showSuccess('Sucesso!', `O convite foi processado.`);

        // Recarrega a lista apropriada
        if (action === 'accept' || action === 'decline') {
            loadInvites('received');
            checkPendingInvitations();
        } else {
            loadInvites('sent');
            loadSharedAccess();
        }

    } catch (error) {
        console.error(`Erro ao executar a ação '${action}':`, error);
        hideLoading();
        showError('Erro', 'Ocorreu um erro ao processar o convite.');
    }
}

/**
 * Atualiza a permissão de um utilizador.
 * @param {string} inviteId - O ID do convite original aceite
 * @param {string} newRole - A nova permissão
 */
async function updateUserPermission(inviteId, newRole) {
    showLoading('Atualizando permissão...');
    try {
        const inviteSnapshot = await db.ref(`invitations/${inviteId}`).once('value');
        if (!inviteSnapshot.exists()) throw new Error("Convite não encontrado");
        
        const inviteData = inviteSnapshot.val();
        if (inviteData.fromUserId !== getUsuarioId()) throw new Error("Você não tem permissão para alterar este convite");
        if (inviteData.status !== 'accepted') throw new Error("Só é possível alterar permissões de convites aceitos");
        
        // **CORREÇÃO CRÍTICA**: Usa o `toUserId` guardado em vez de pesquisar
        const invitedUserId = inviteData.toUserId;
        if (!invitedUserId) throw new Error("Não foi possível encontrar o usuário para atualizar a permissão");

        const updates = {};
        updates[`invitations/${inviteId}/role`] = newRole;
        updates[`invitations/${inviteId}/updatedAt`] = firebase.database.ServerValue.TIMESTAMP;
        updates[`accessControl/${invitedUserId}/${inviteData.resourceId}`] = newRole;

        await db.ref().update(updates);
        
        hideLoading();
        showSuccess('Permissão atualizada', 'A permissão do usuário foi alterada com sucesso.');
        loadSharedAccess();
        
    } catch (error) {
        console.error('Erro ao atualizar permissão:', error);
        hideLoading();
        showError('Erro na Atualização', 'Não foi possível atualizar a permissão: ' + error.message);
    }
}


// O resto do ficheiro (loadInvites, renderInvites, etc.) continua igual...
// ...
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
    
    if (window.lucide) {
        lucide.createIcons();
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
    
    clone.querySelector('.invite-email').textContent = invite.toEmail;
    clone.querySelector('.invite-date').textContent = formatDate(invite.createdAt);
    
    const statusBadge = clone.querySelector('.invite-status-badge');
    const { badgeClass, statusText } = getStatusBadgeInfo(invite.status);
    statusBadge.className = `inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${badgeClass}`;
    statusBadge.textContent = statusText;
    
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
    
    clone.querySelector('.invite-sender').textContent = invite.fromUserName || 'Usuário';
    clone.querySelector('.invite-date').textContent = formatDate(invite.createdAt);
    clone.querySelector('.invite-permission').textContent = formatPermission(invite.role);
    
    container.appendChild(clone);
}

/**
 * Verifica se há convites pendentes para o usuário atual
 * @returns {Promise<number>} Número de convites pendentes
 */
export async function checkPendingInvitations() {
    const userEmail = getUsuarioEmail()?.toLowerCase();
    if (!userEmail) return 0;
    
    try {
        const query = db.ref('invitations').orderByChild('toEmail').equalTo(userEmail);
        const snapshot = await query.once('value');
        let pendingCount = 0;
        
        snapshot.forEach(childSnapshot => {
            if (childSnapshot.val().status === 'pending') {
                pendingCount++;
            }
        });
        
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
    const tabBadge = document.getElementById('received-invites-badge');
    const menuBadge = document.getElementById('menu-invites-badge');
    
    const badges = [tabBadge, menuBadge];
    badges.forEach(badge => {
        if (badge) {
            if (count > 0) {
                badge.textContent = count > 9 ? '9+' : count.toString();
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        }
    });
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
        const query = db.ref('invitations').orderByChild('fromUserId').equalTo(userId);
        const snapshot = await query.once('value');
        
        if (!snapshot.exists()) {
            renderSharedAccess([]);
            hideLoading();
            return;
        }
        
        const sharedAccess = [];
        snapshot.forEach(childSnapshot => {
            const invite = childSnapshot.val();
            if (invite.status === 'accepted') {
                sharedAccess.push({
                    id: childSnapshot.key,
                    email: invite.toEmail,
                    resourceId: invite.resourceId,
                    role: invite.role,
                    acceptedAt: invite.acceptedAt
                });
            }
        });
        
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
    
    accessList.sort((a, b) => (b.acceptedAt || 0) - (a.acceptedAt || 0));
    
    accessList.forEach(access => {
        renderSharedAccessItem(access, container);
    });
    
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
    
    clone.querySelector('.user-email').textContent = access.email || 'Email desconhecido';
    
    const permissionSelect = clone.querySelector('.permission-select');
    permissionSelect.value = access.role || 'viewer';
    
    permissionSelect.addEventListener('change', function() {
        accessItem.querySelector('.save-permission-btn').classList.remove('hidden');
    });
    
    container.appendChild(clone);
}

// Funções auxiliares

function getStatusBadgeInfo(status) {
    switch (status) {
        case 'pending': return { badgeClass: 'bg-yellow-100 text-yellow-800', statusText: 'Pendente' };
        case 'accepted': return { badgeClass: 'bg-green-100 text-green-800', statusText: 'Aceito' };
        case 'declined': return { badgeClass: 'bg-red-100 text-red-800', statusText: 'Recusado' };
        case 'canceled': return { badgeClass: 'bg-slate-100 text-slate-800', statusText: 'Cancelado' };
        case 'revoked': return { badgeClass: 'bg-slate-100 text-slate-800', statusText: 'Revogado' };
        default: return { badgeClass: 'bg-slate-100 text-slate-800', statusText: 'Desconhecido' };
    }
}

function formatPermission(role) {
    switch (role) {
        case 'admin': return 'Administrador';
        case 'editor': return 'Editor';
        case 'viewer': return 'Leitor';
        default: return role || 'Desconhecido';
    }
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
            year: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    }
}
