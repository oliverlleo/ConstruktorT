// Gerenciador de Modo Escuro
class DarkModeManager {
    constructor() {
        this.storageKey = 'construktor-dark-mode';
        this.init();
    }

    init() {
        // Inicializa o tema baseado na preferência salva ou preferência padrão (claro)
        const savedTheme = localStorage.getItem(this.storageKey);
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        
        // Tema padrão é claro, só muda para escuro se explicitamente salvo como 'dark'
        if (savedTheme === 'dark') {
            this.enableDarkMode();
        } else {
            this.enableLightMode();
        }

        // Escuta mudanças na preferência do sistema
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
            if (!localStorage.getItem(this.storageKey)) {
                if (e.matches) {
                    this.enableDarkMode();
                } else {
                    this.enableLightMode();
                }
            }
        });

        // Cria os seletores de tema
        this.createThemeSelectors();
    }

    enableDarkMode() {
        document.documentElement.classList.add('dark');
        document.body.classList.remove('text-slate-800', 'bg-slate-50');
        document.body.classList.add('text-slate-200', 'bg-slate-900');
        localStorage.setItem(this.storageKey, 'dark');
        this.updateSelectors('dark');
    }

    enableLightMode() {
        document.documentElement.classList.remove('dark');
        document.body.classList.remove('text-slate-200', 'bg-slate-900');
        document.body.classList.add('text-slate-800', 'bg-slate-50');
        localStorage.setItem(this.storageKey, 'light');
        this.updateSelectors('light');
    }

    toggle() {
        if (document.documentElement.classList.contains('dark')) {
            this.enableLightMode();
        } else {
            this.enableDarkMode();
        }
    }

    createThemeSelectors() {
        // Seletor para o header (menu do usuário) no index.html
        this.createHeaderSelector();
        // Seletor para a página de login
        this.createLoginSelector();
    }

    createHeaderSelector() {
        // Adiciona o seletor ao menu dropdown do usuário no index.html
        const userMenuDropdown = document.getElementById('user-menu-dropdown');
        if (userMenuDropdown) {
            // Cria o elemento de seletor de tema
            const themeSelector = document.createElement('div');
            themeSelector.className = 'flex items-center justify-between px-3 py-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300';
            themeSelector.innerHTML = `
                <div class="flex items-center gap-3">
                    <i class="fa-solid fa-palette h-4 w-4"></i>
                    <span>Tema</span>
                </div>
                <button id="theme-toggle-header" class="theme-toggle flex items-center gap-1 px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors">
                    <i class="theme-icon fa-solid fa-sun h-3 w-3 text-amber-500"></i>
                    <i class="theme-icon fa-solid fa-moon h-3 w-3 text-indigo-500 hidden"></i>
                </button>
            `;

            // Insere antes do último hr (antes do logout)
            const lastHr = userMenuDropdown.querySelector('hr:last-of-type');
            if (lastHr) {
                userMenuDropdown.insertBefore(themeSelector, lastHr);
            } else {
                userMenuDropdown.appendChild(themeSelector);
            }

            // Adiciona event listener
            const toggleButton = themeSelector.querySelector('#theme-toggle-header');
            if (toggleButton) {
                toggleButton.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.toggle();
                });
            }
        }
    }

    createLoginSelector() {
        // Adiciona o seletor à página de login no canto superior direito
        const loginPage = document.querySelector('.notion-auth-container');
        if (loginPage && window.location.pathname.includes('login.html')) {
            // Cria o seletor de tema para a página de login
            const loginThemeSelector = document.createElement('div');
            loginThemeSelector.className = 'fixed top-4 right-4 z-50';
            loginThemeSelector.innerHTML = `
                <button id="theme-toggle-login" class="theme-toggle flex items-center gap-2 px-3 py-2 rounded-lg bg-white dark:bg-slate-800 shadow-lg border border-slate-200 dark:border-slate-600 hover:shadow-xl transition-all text-slate-600 dark:text-slate-300">
                    <i class="theme-icon fa-solid fa-sun h-4 w-4 text-amber-500"></i>
                    <i class="theme-icon fa-solid fa-moon h-4 w-4 text-indigo-500 hidden"></i>
                    <span class="text-sm font-medium hidden sm:inline">Tema</span>
                </button>
            `;

            document.body.appendChild(loginThemeSelector);

            // Adiciona event listener
            const toggleButton = loginThemeSelector.querySelector('#theme-toggle-login');
            if (toggleButton) {
                toggleButton.addEventListener('click', () => {
                    this.toggle();
                });
            }
        }
    }

    updateSelectors(theme) {
        // Atualiza todos os seletores de tema na página
        const toggleButtons = document.querySelectorAll('.theme-toggle');
        
        toggleButtons.forEach(button => {
            const sunIcon = button.querySelector('.fa-sun');
            const moonIcon = button.querySelector('.fa-moon');
            
            if (theme === 'dark') {
                if (sunIcon) sunIcon.classList.add('hidden');
                if (moonIcon) moonIcon.classList.remove('hidden');
            } else {
                if (sunIcon) sunIcon.classList.remove('hidden');
                if (moonIcon) moonIcon.classList.add('hidden');
            }
        });
    }

    getCurrentTheme() {
        return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    }
}

// Inicializa o gerenciador de modo escuro quando o DOM estiver carregado
document.addEventListener('DOMContentLoaded', () => {
    window.darkModeManager = new DarkModeManager();
});

// Exporta para usar em outros módulos se necessário
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DarkModeManager;
}