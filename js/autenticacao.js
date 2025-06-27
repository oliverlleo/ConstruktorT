import { firebaseConfig } from './config.js';
import { showError, showSuccess, showLoading, hideLoading } from './ui.js';

// Variáveis do módulo
let auth;
let currentUser = null;

/**
 * Inicializa o módulo de autenticação
 * @returns {Promise<void>}
 */
export async function initAutenticacao() {
    try {
        // Inicializa o Firebase Authentication
        auth = firebase.auth();
        
        // Configura o listener para mudanças de estado de autenticação
        auth.onAuthStateChanged(handleAuthStateChanged);
        
        // Configura persistência para manter o usuário logado
        await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
    } catch (error) {
        console.error("Erro ao inicializar autenticação:", error);
        showError('Erro de Autenticação', 'Não foi possível inicializar o sistema de autenticação.');
    }
}

/**
 * Manipula as mudanças no estado de autenticação
 * @param {Object} user - Usuário atual ou null se deslogado
 */
function handleAuthStateChanged(user) {
    currentUser = user;
    
    if (user) {
        // Usuário está logado
        console.log("Usuário autenticado:", user.email);
        
        // Se estiver na página de login, redireciona para a página principal
        if (window.location.pathname.includes('login.html')) {
            window.location.href = '../index.html';
        }
    } else {
        // Usuário não está logado
        console.log("Usuário não autenticado");
        
        // Se não estiver na página de login, redireciona para login
        if (!window.location.pathname.includes('login.html')) {
            window.location.href = 'pages/login.html';
        }
    }
}

/**
 * Realiza login com email e senha
 * @param {string} email - Email do usuário
 * @param {string} senha - Senha do usuário
 * @returns {Promise<Object>} - Resultado da operação
 */
export async function loginComEmailSenha(email, senha) {
    try {
        showLoading('Entrando...');
        const userCredential = await auth.signInWithEmailAndPassword(email, senha);
        hideLoading();
        return { success: true, user: userCredential.user };
    } catch (error) {
        hideLoading();
        let mensagemErro = 'Ocorreu um erro ao fazer login. Tente novamente.';
        
        if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
            mensagemErro = 'Email ou senha incorretos.';
        } else if (error.code === 'auth/too-many-requests') {
            mensagemErro = 'Muitas tentativas de login. Tente novamente mais tarde.';
        }
        
        return { success: false, error: mensagemErro };
    }
}

/**
 * Realiza login com conta Google
 * @returns {Promise<Object>} - Resultado da operação
 */
export async function loginComGoogle() {
    try {
        showLoading('Conectando ao Google...');
        const provider = new firebase.auth.GoogleAuthProvider();
        const userCredential = await auth.signInWithPopup(provider);
        hideLoading();
        return { success: true, user: userCredential.user };
    } catch (error) {
        hideLoading();
        console.error("Erro no login com Google:", error);
        return { success: false, error: 'Ocorreu um erro ao fazer login com Google.' };
    }
}

/**
 * Inicia o processo de login com número de telefone
 * @param {string} numeroTelefone - Número de telefone completo com código do país
 * @param {Object} containerRecaptcha - Elemento DOM onde o recaptcha será renderizado
 * @returns {Promise<Object>} - Resultado da operação com confirmationResult para ser usado na verificação
 */
export async function iniciarLoginComTelefone(numeroTelefone, containerRecaptcha) {
    try {
        showLoading('Enviando código...');
        const appVerifier = new firebase.auth.RecaptchaVerifier(containerRecaptcha, {
            size: 'normal',
            callback: () => {
                // Recaptcha resolvido com sucesso
            },
            'expired-callback': () => {
                // O reCAPTCHA expirou
                showError('Tempo Expirado', 'O tempo para verificação expirou. Tente novamente.');
            }
        });
        
        const confirmationResult = await auth.signInWithPhoneNumber(numeroTelefone, appVerifier);
        hideLoading();
        return { success: true, confirmationResult };
    } catch (error) {
        hideLoading();
        console.error("Erro no login com telefone:", error);
        let mensagemErro = 'Ocorreu um erro ao enviar o código de verificação.';
        
        if (error.code === 'auth/invalid-phone-number') {
            mensagemErro = 'Número de telefone inválido. Use o formato +55DDD00000000';
        }
        
        return { success: false, error: mensagemErro };
    }
}

/**
 * Confirma o código de verificação enviado por SMS
 * @param {Object} confirmationResult - Objeto retornado pela função iniciarLoginComTelefone
 * @param {string} codigoVerificacao - Código de verificação recebido por SMS
 * @returns {Promise<Object>} - Resultado da operação
 */
export async function confirmarCodigoTelefone(confirmationResult, codigoVerificacao) {
    try {
        showLoading('Verificando código...');
        const userCredential = await confirmationResult.confirm(codigoVerificacao);
        hideLoading();
        return { success: true, user: userCredential.user };
    } catch (error) {
        hideLoading();
        console.error("Erro na confirmação do código:", error);
        let mensagemErro = 'Ocorreu um erro ao verificar o código.';
        
        if (error.code === 'auth/invalid-verification-code') {
            mensagemErro = 'Código de verificação inválido.';
        } else if (error.code === 'auth/code-expired') {
            mensagemErro = 'Código de verificação expirado. Solicite um novo código.';
        }
        
        return { success: false, error: mensagemErro };
    }
}

/**
 * Registra um novo usuário com email e senha
 * @param {string} email - Email do usuário
 * @param {string} senha - Senha do usuário
 * @returns {Promise<Object>} - Resultado da operação
 */
export async function registrarUsuario(email, senha) {
    try {
        showLoading('Criando conta...');
        const userCredential = await auth.createUserWithEmailAndPassword(email, senha);
        hideLoading();
        return { success: true, user: userCredential.user };
    } catch (error) {
        hideLoading();
        console.error("Erro no registro:", error);
        let mensagemErro = 'Ocorreu um erro ao criar a conta.';
        
        if (error.code === 'auth/email-already-in-use') {
            mensagemErro = 'Este email já está sendo usado por outra conta.';
        } else if (error.code === 'auth/weak-password') {
            mensagemErro = 'A senha é muito fraca. Use pelo menos 6 caracteres.';
        } else if (error.code === 'auth/invalid-email') {
            mensagemErro = 'Email inválido.';
        }
        
        return { success: false, error: mensagemErro };
    }
}

/**
 * Realiza o logout do usuário
 * @returns {Promise<Object>} - Resultado da operação
 */
export async function logout() {
    try {
        await auth.signOut();
        return { success: true };
    } catch (error) {
        console.error("Erro ao fazer logout:", error);
        return { success: false, error: 'Ocorreu um erro ao sair da conta.' };
    }
}

/**
 * Envia email de redefinição de senha
 * @param {string} email - Email do usuário
 * @returns {Promise<Object>} - Resultado da operação
 */
export async function enviarRedefinicaoSenha(email) {
    try {
        showLoading('Enviando email...');
        await auth.sendPasswordResetEmail(email);
        hideLoading();
        return { success: true };
    } catch (error) {
        hideLoading();
        console.error("Erro ao enviar email de redefinição:", error);
        let mensagemErro = 'Ocorreu um erro ao enviar o email de redefinição.';
        
        if (error.code === 'auth/user-not-found') {
            mensagemErro = 'Não existe conta com este email.';
        } else if (error.code === 'auth/invalid-email') {
            mensagemErro = 'Email inválido.';
        }
        
        return { success: false, error: mensagemErro };
    }
}

/**
 * Retorna o usuário atual ou null se não estiver logado
 * @returns {Object|null} - Usuário atual
 */
export function getUsuarioAtual() {
    return currentUser;
}

/**
 * Verifica se há um usuário logado
 * @returns {boolean} - True se houver usuário logado
 */
export function isUsuarioLogado() {
    return currentUser !== null;
}

/**
 * Obtém o ID do usuário atual
 * @returns {string|null} - ID do usuário ou null se não estiver logado
 */
export function getUsuarioId() {
    return currentUser ? currentUser.uid : null;
}

/**
 * Obtém o email do usuário atual
 * @returns {string|null} - Email do usuário ou null se não estiver logado
 */
export function getUsuarioEmail() {
    return currentUser ? currentUser.email : null;
}

/**
 * Obtém o número de telefone do usuário atual
 * @returns {string|null} - Número de telefone ou null se não estiver disponível
 */
export function getUsuarioTelefone() {
    return currentUser ? currentUser.phoneNumber : null;
}

/**
 * Obtém o nome de exibição do usuário atual
 * @returns {string|null} - Nome de exibição ou null se não estiver disponível
 */
export function getUsuarioNome() {
    return currentUser ? currentUser.displayName : null;
}

/**
 * Obtém a URL da foto do usuário atual
 * @returns {string|null} - URL da foto ou null se não estiver disponível
 */
export function getUsuarioFoto() {
    return currentUser ? currentUser.photoURL : null;
}