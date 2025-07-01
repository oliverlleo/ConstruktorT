/**
 * Conjunto de funções para manipulação da interface do usuário
 * Gerencia animações, notificações, modais e interações
 */

import { TIPS_STATE } from './config.js';
import { getUserPreference, saveUserPreference } from './database.js';

// Variável para controle do estado da interface
let mobileSidebarOpen = false;
let modalSidebarOpen = false;
let isLoading = false;

// Exportações centralizadas
export {
    initUI,
    openMobileSidebar,
    closeMobileSidebar,
    createIcons,
    checkEmptyStates,
    showLoading,
    hideLoading,
    showSuccess,
    showError,
    showConfirmDialog,
    showInputDialog,
    setupTips, // Adicionada setupTips
    setupMobileInteractions, // Adicionada setupMobileInteractions
    showNotification, // Adicionada showNotification
    setupModal, // Adicionada setupModal
    openModal, // Adicionada openModal
    closeModal // Adicionada closeModal
};

/**
 * Inicializa elementos e comportamentos da interface do usuário
 */
function initUI() {
    // Font Awesome já é inicializado automaticamente
    
    setupMobileInteractions();
    setupTips();
    checkEmptyStates();
}

/**
 * Abre a sidebar em dispositivos móveis.
 */
function openMobileSidebar() {
    const sidebar = document.getElementById('desktop-sidebar');
    if (sidebar) {
        sidebar.classList.remove('-translate-x-full');
        sidebar.classList.add('translate-x-0');
        mobileSidebarOpen = true; // Atualiza a variável de estado
    }
}

/**
 * Fecha a sidebar em dispositivos móveis.
 */
function closeMobileSidebar() {
    const sidebar = document.getElementById('desktop-sidebar');
    if (sidebar) {
        sidebar.classList.remove('translate-x-0');
        sidebar.classList.add('-translate-x-full');
        mobileSidebarOpen = false; // Atualiza a variável de estado
    }
}

/**
 * Função para inicializar ícones
 * Agora também inicializa os ícones Lucide, quando disponíveis
 */
function createIcons() {
    // Font Awesome é inicializado automaticamente
    
    // Também inicializa ícones Lucide, se disponíveis
    if (window.lucide) {
        try {
            // Tentativa de criar ícones Lucide
            lucide.createIcons();
        } catch (error) {
            console.warn('Erro ao criar ícones Lucide:', error);
        }
    }
}

/**
 * Configura interações específicas para dispositivos móveis
 */
function setupMobileInteractions() {
    // Toggle menu mobile
    const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
    const closeMobileMenu = document.getElementById('close-mobile-menu');
    
    if (mobileMenuToggle) {
        mobileMenuToggle.addEventListener('click', openMobileSidebar);
    }
    
    if (closeMobileMenu) {
        closeMobileMenu.addEventListener('click', closeMobileSidebar);
    }
    
    // Fechar menu ao clicar fora (overlay)
    document.addEventListener('click', (e) => {
        const sidebar = document.getElementById('desktop-sidebar');
        if (mobileSidebarOpen && sidebar && !sidebar.contains(e.target) && !e.target.closest('#mobile-menu-toggle')) {
            closeMobileSidebar();
        }
    });
    
    // Toggle para a sidebar do modal em dispositivos móveis
    const toggleModalSidebar = document.getElementById('toggle-modal-sidebar');
    const modalSidebarContent = document.getElementById('modal-sidebar-content');
    
    if (toggleModalSidebar && modalSidebarContent) {
        toggleModalSidebar.addEventListener('click', () => {
            modalSidebarContent.classList.toggle('hidden');
            modalSidebarOpen = !modalSidebarOpen;
            
            // Rotacionar ícone
            const icon = toggleModalSidebar.querySelector('i');
            if (icon) {
                if (modalSidebarOpen) {
                    icon.setAttribute('data-lucide', 'chevron-up');
                } else {
                    icon.setAttribute('data-lucide', 'chevron-down');
                }
                createIcons();
            }
        });
    }
    
    // Botão flutuante para adicionar módulo em dispositivos móveis
    const mobileAddModuleBtn = document.getElementById('mobile-add-module-btn');
    if (mobileAddModuleBtn) {
        mobileAddModuleBtn.addEventListener('click', () => {
            // A ação específica será conectada no módulo principal
        });
    }
}

/**
 * Configura o sistema de dicas
 */
function setupTips() {
    // Verifica o estado das dicas (primeiro no Firebase, depois no localStorage como fallback)
    const welcomeTipClosed = getUserPreference(TIPS_STATE.WELCOME_TIP, false);
    const quickTipClosed = getUserPreference(TIPS_STATE.QUICK_TIP, false);
    const modulesTipClosed = getUserPreference(TIPS_STATE.MODULES_TIP, false);
    
    const welcomeTip = document.getElementById('welcome-tip');
    const quickTip = document.getElementById('quick-tip');
    const modulesTip = document.getElementById('modules-tip');
    
    // Mostra ou esconde as dicas baseado nas preferências do usuário
    if (welcomeTip) {
        if (welcomeTipClosed) {
            welcomeTip.classList.add('hidden');
        } else {
            welcomeTip.classList.remove('hidden');
        }
    }
    
    if (quickTip) {
        if (quickTipClosed) {
            quickTip.classList.add('hidden');
        } else {
            quickTip.classList.remove('hidden');
        }
    }
    
    if (modulesTip) {
        if (modulesTipClosed) {
            modulesTip.classList.add('hidden');
        } else {
            modulesTip.classList.remove('hidden');
        }
    }
    
    // Configura os botões de fechar
    document.querySelectorAll('.close-tip-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const tipId = btn.dataset.tipId;
            const tipElement = document.getElementById(tipId);
            
            if (tipElement) {
                tipElement.classList.add('hidden');
                
                // Salva a preferência do usuário no Firebase
                if (tipId === 'welcome-tip') {
                    saveUserPreference(TIPS_STATE.WELCOME_TIP, true);
                } else if (tipId === 'quick-tip') {
                    saveUserPreference(TIPS_STATE.QUICK_TIP, true);
                } else if (tipId === 'modules-tip') {
                    saveUserPreference(TIPS_STATE.MODULES_TIP, true);
                }
            }
        });
    });
    
    // Configura o botão de ajuda para mostrar as dicas novamente
    const helpButton = document.getElementById('help-button');
    if (helpButton) {
        helpButton.addEventListener('click', () => {
            // Limpa as preferências para mostrar as dicas novamente
            saveUserPreference(TIPS_STATE.WELCOME_TIP, false);
            saveUserPreference(TIPS_STATE.QUICK_TIP, false);
            saveUserPreference(TIPS_STATE.MODULES_TIP, false);
            
            // Mostra as dicas quando o botão de ajuda é clicado
            if (welcomeTip) welcomeTip.classList.remove('hidden');
            if (quickTip) quickTip.classList.remove('hidden');
            if (modulesTip) modulesTip.classList.remove('hidden');
            
            // Exibe uma animação sutil para chamar atenção para as dicas
            if (welcomeTip) {
                welcomeTip.classList.add('animate-pulse');
                setTimeout(() => welcomeTip.classList.remove('animate-pulse'), 1000);
            }
            if (quickTip) {
                quickTip.classList.add('animate-pulse');
                setTimeout(() => quickTip.classList.remove('animate-pulse'), 1000);
            }
            if (modulesTip) {
                modulesTip.classList.add('animate-pulse');
                setTimeout(() => modulesTip.classList.remove('animate-pulse'), 1000);
            }
        });
    }
}

/**
 * Verifica e atualiza os estados vazios
 */
function checkEmptyStates() {
    // Verifica se existem módulos
    const moduleContainer = document.getElementById('module-container');
    const emptyState = document.getElementById('empty-state');
    
    if (moduleContainer && emptyState) {
        if (moduleContainer.children.length === 0) {
            emptyState.classList.remove('hidden');
        } else {
            emptyState.classList.add('hidden');
        }
    }
}

/**
 * Mostra uma notificação
 * @param {string} title - Título da notificação 
 * @param {string} message - Mensagem da notificação
 * @param {string} type - Tipo da notificação (success, error, warning, info)
 * @param {number} duration - Duração em ms (default: 3000)
 */
function showNotification(title, message, type = 'info', duration = 3000) {
    if (typeof Swal !== 'undefined') {
        const Toast = Swal.mixin({
            toast: true,
            position: 'bottom-end',
            showConfirmButton: false,
            timer: duration,
            timerProgressBar: true,
            customClass: {
                popup: 'shadow-xl rounded-xl'
            }
        });
        
        Toast.fire({
            icon: type,
            title: title,
            text: message
        });
    } else {
        // Fallback para alert se SweetAlert não estiver disponível
        alert(`${title}: ${message}`);
    }
}

/**
 * Mostra uma mensagem de sucesso
 * @param {string} title - Título da mensagem
 * @param {string} message - Texto da mensagem
 */
function showSuccess(title, message) {
    if (typeof Swal !== 'undefined') {
        Swal.fire({
            icon: 'success',
            title: title,
            text: message,
            timer: 2000,
            showConfirmButton: false,
            customClass: {
                popup: 'shadow-xl rounded-xl'
            }
        });
    } else {
        // Fallback para alert se SweetAlert não estiver disponível
        alert(`${title}: ${message}`);
    }
}

/**
 * Mostra uma mensagem de erro
 * @param {string} title - Título do erro
 * @param {string} message - Mensagem de erro
 */
function showError(title, message) {
    if (typeof Swal !== 'undefined') {
        Swal.fire({
            icon: 'error',
            title: title,
            text: message,
            customClass: {
                popup: 'shadow-xl rounded-xl'
            }
        });
    } else {
        // Fallback para alert se SweetAlert não estiver disponível
        alert(`Erro - ${title}: ${message}`);
    }
}

/**
 * Mostra uma caixa de diálogo de confirmação
 * @param {string} title - Título da confirmação
 * @param {string} message - Mensagem da confirmação
 * @param {string} confirmText - Texto do botão de confirmação
 * @param {string} cancelText - Texto do botão de cancelamento
 * @param {string} type - Tipo da confirmação (warning, danger, info)
 * @returns {Promise<boolean>} - True se confirmado, False se cancelado
 */
async function showConfirmDialog(title, message, confirmText = 'Confirmar', cancelText = 'Cancelar', type = 'warning') {
    if (typeof Swal !== 'undefined') {
        const result = await Swal.fire({
            title: title,
            text: message,
            icon: type,
            showCancelButton: true,
            confirmButtonColor: type === 'danger' ? '#d33' : '#6366f1',
            cancelButtonColor: '#64748b',
            confirmButtonText: confirmText,
            cancelButtonText: cancelText,
            customClass: {
                popup: 'shadow-xl rounded-xl'
            }
        });
        
        return result.isConfirmed;
    } else {
        // Fallback para confirm se SweetAlert não estiver disponível
        return confirm(`${title}\n${message}`);
    }
}

/**
 * Mostra um diálogo de entrada de texto
 * @param {string} title - Título do diálogo
 * @param {string} inputLabel - Label do campo de entrada
 * @param {string} placeholder - Texto de placeholder
 * @param {string} confirmText - Texto do botão de confirmação
 * @param {string} cancelText - Texto do botão de cancelamento
 * @returns {Promise<{confirmed: boolean, value: string}>} - Resultado da entrada
 */
async function showInputDialog(title, inputLabel, placeholder = '', confirmText = 'Confirmar', cancelText = 'Cancelar') {
    if (typeof Swal !== 'undefined') {
        const result = await Swal.fire({
            title: title,
            input: 'text',
            inputLabel: inputLabel,
            inputPlaceholder: placeholder,
            showCancelButton: true,
            confirmButtonText: confirmText,
            cancelButtonText: cancelText,
            inputValidator: (value) => {
                if (!value) {
                    return 'Este campo é obrigatório!';
                }
            },
            customClass: {
                popup: 'shadow-xl rounded-xl',
                input: 'rounded-lg border-slate-300 focus:border-indigo-500 focus:ring-indigo-500'
            }
        });
        
        return {
            confirmed: result.isConfirmed,
            value: result.value
        };
    } else {
        // Fallback para prompt se SweetAlert não estiver disponível
        const value = prompt(`${title}\n${inputLabel}`, '');
        return {
            confirmed: value !== null,
            value: value || ''
        };
    }
}

/**
 * Mostra um indicador de carregamento
 * @param {string} message - Mensagem a ser exibida durante o carregamento
 */
function showLoading(message = 'Carregando...') {
    if (isLoading) return;
    isLoading = true;
    
    if (typeof Swal !== 'undefined') {
        Swal.fire({
            title: message,
            allowOutsideClick: false,
            allowEscapeKey: false,
            showConfirmButton: false,
            didOpen: () => {
                Swal.showLoading();
            },
            customClass: {
                popup: 'shadow-xl rounded-xl'
            }
        });
    } else {
        // Fallback para caso SweetAlert não esteja disponível
        const loadingOverlay = document.createElement('div');
        loadingOverlay.id = 'loading-overlay-manual';
        loadingOverlay.style.position = 'fixed';
        loadingOverlay.style.inset = '0';
        loadingOverlay.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
        loadingOverlay.style.display = 'flex';
        loadingOverlay.style.justifyContent = 'center';
        loadingOverlay.style.alignItems = 'center';
        loadingOverlay.style.zIndex = '9999';
        
        loadingOverlay.innerHTML = `
            <div style="text-align: center;">
                <div class="spinner" style="margin-bottom: 1rem;"></div>
                <p>${message}</p>
            </div>
        `;
        
        document.body.appendChild(loadingOverlay);
    }
}

/**
 * Esconde o indicador de carregamento
 */
function hideLoading() {
    if (!isLoading) return;
    isLoading = false;
    
    if (typeof Swal !== 'undefined') {
        Swal.close();
    } else {
        // Remove o overlay manual se ele existir
        const loadingOverlay = document.getElementById('loading-overlay-manual');
        if (loadingOverlay) {
            loadingOverlay.remove();
        }
    }
}

/**
 * Configura um modal
 * @param {string} modalId - ID do elemento modal
 * @param {Function} onOpenCallback - Função a ser chamada quando o modal abrir
 * @param {Function} onCloseCallback - Função a ser chamada quando o modal fechar
 */
function setupModal(modalId, onOpenCallback = null, onCloseCallback = null) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    
    // Botões para abrir o modal
    document.querySelectorAll(`[data-modal-target="${modalId}"]`).forEach(btn => {
        btn.addEventListener('click', () => {
            openModal(modalId);
            if (onOpenCallback) onOpenCallback();
        });
    });
    
    // Botões para fechar o modal
    modal.querySelectorAll('[data-modal-close]').forEach(btn => {
        btn.addEventListener('click', () => {
            closeModal(modalId);
            if (onCloseCallback) onCloseCallback();
        });
    });
    
    // Fechar ao clicar fora do modal
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal(modalId);
            if (onCloseCallback) onCloseCallback();
        }
    });
}

/**
 * Abre um modal
 * @param {string} modalId - ID do elemento modal
 */
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('hidden');
        
        // Se houver um elemento interno com transição
        const innerModal = modal.querySelector('.bg-white, .modal-content');
        if (innerModal) {
            setTimeout(() => {
                innerModal.classList.remove('scale-95', 'opacity-0');
            }, 10);
        }
    }
}

/**
 * Fecha um modal
 * @param {string} modalId - ID do elemento modal
 */
function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        // Se houver um elemento interno com transição
        const innerModal = modal.querySelector('.bg-white, .modal-content');
        if (innerModal) {
            innerModal.classList.add('scale-95', 'opacity-0');
            setTimeout(() => {
                modal.classList.add('hidden');
            }, 300);
        } else {
            modal.classList.add('hidden');
        }
    }
}