// UI Enhancements - Melhorias na interface do Construktor
// Este arquivo adiciona funcionalidades avançadas à interface do sistema

// Aguarda o carregamento completo do DOM e de outros scripts
window.addEventListener('load', function() {
    console.log('UI Enhancements carregado');
    
    // Aguarda um pouco para garantir que outros scripts estejam prontos
    setTimeout(() => {
        initResizeHandle();
        initEditFunctions();
        enhanceDragAndDrop();
        fixMobileInteractions();
        console.log('UI Enhancements inicializado');
    }, 100);
});

/**
 * Corrige problemas de interação em dispositivos móveis
 */
function fixMobileInteractions() {
    // Corrigir problemas específicos de drag and drop em mobile
    if ('ontouchstart' in window) {
        console.log('Aplicando correções para dispositivos móveis');
        
        // Garantir que entidades na biblioteca sejam arrastáveis em mobile
        const entityCards = document.querySelectorAll('.entity-card');
        entityCards.forEach(card => {
            // Adicionar feedback visual para toque
            card.addEventListener('touchstart', function() {
                this.classList.add('active-touch');
            }, {passive: true});
            
            card.addEventListener('touchend', function() {
                this.classList.remove('active-touch');
            }, {passive: true});
        });
        
        // Melhorar desempenho de scroll vs drag em mobile
        document.querySelectorAll('.entities-dropzone, #entity-list').forEach(container => {
            container.addEventListener('touchmove', function(e) {
                // Não prevenir o comportamento padrão aqui para permitir o scroll normal
            }, {passive: true});
        });
    }
}

/**
 * Inicializa o redimensionamento da barra lateral
 */
function initResizeHandle() {
    const resizeHandle = document.getElementById('resize-handle');
    const sidebar = document.getElementById('desktop-sidebar');
    const content = document.querySelector('section.sm\\:ml-80');
    
    if (!resizeHandle || !sidebar || !content) {
        console.log('Elementos de redimensionamento não encontrados');
        return;
    }

    let isResizing = false;
    let startX;
    let startWidth;

    // Torna a barra visível apenas em telas maiores (desktop)
    if (window.innerWidth >= 640) {
        resizeHandle.style.opacity = '1';
    }

    // Manipulador de eventos para iniciar o redimensionamento
    resizeHandle.addEventListener('mousedown', function(e) {
        e.preventDefault();
        isResizing = true;
        startX = e.clientX;
        startWidth = parseInt(document.defaultView.getComputedStyle(sidebar).width, 10);
        
        // Adiciona classes para indicar redimensionamento ativo
        document.body.classList.add('select-none', 'cursor-col-resize');
        resizeHandle.classList.add('bg-indigo-500', 'opacity-100', 'w-2');
        
        console.log('Iniciando redimensionamento', { startX, startWidth });
    });

    // Manipuladores de eventos para o processo de redimensionamento
    document.addEventListener('mousemove', function(e) {
        if (!isResizing) return;
        
        const width = startWidth + e.clientX - startX;
        
        // Limita o tamanho mínimo e máximo
        if (width >= 200 && width <= 600) {
            sidebar.style.width = `${width}px`;
            resizeHandle.style.left = `${width}px`;
            content.style.marginLeft = `${width}px`;
            console.log('Redimensionando para:', width);
        }
    });

    document.addEventListener('mouseup', function() {
        if (!isResizing) return;
        isResizing = false;
        
        // Remove classes de redimensionamento ativo
        document.body.classList.remove('select-none', 'cursor-col-resize');
        resizeHandle.classList.remove('bg-indigo-500', 'opacity-100', 'w-2');
        
        // Salva a largura atual nas preferências do usuário
        try {
            localStorage.setItem('sidebar-width', sidebar.style.width);
            console.log('Largura salva:', sidebar.style.width);
        } catch (e) {
            console.warn('Não foi possível salvar a largura da barra lateral:', e);
        }
    });

    // Restaura a largura salva (se existir)
    try {
        const savedWidth = localStorage.getItem('sidebar-width');
        if (savedWidth) {
            sidebar.style.width = savedWidth;
            resizeHandle.style.left = savedWidth;
            content.style.marginLeft = savedWidth;
            console.log('Largura restaurada:', savedWidth);
        }
    } catch (e) {
        console.warn('Não foi possível restaurar a largura da barra lateral:', e);
    }
}

/**
 * Inicializa as funções de edição para módulos e entidades
 */
function initEditFunctions() {
    console.log('Inicializando funções de edição');
    
    // Manipuladores de eventos delegados para botões de edição
    document.addEventListener('click', function(e) {
        // Edição de módulos
        if (e.target.closest('.edit-module-btn')) {
            e.preventDefault();
            e.stopPropagation();
            const moduleCard = e.target.closest('.module-quadro');
            if (moduleCard) {
                const moduleTitle = moduleCard.querySelector('.module-title');
                editModuleName(moduleCard, moduleTitle);
            }
        }
        
        // Edição de entidades na biblioteca
        if (e.target.closest('.edit-entity-btn')) {
            e.preventDefault();
            e.stopPropagation();
            const entityCard = e.target.closest('.entity-card');
            if (entityCard) {
                const entityName = entityCard.querySelector('.entity-name');
                editEntityName(entityCard, entityName);
            }
        }
    });
}

/**
 * Função para editar o nome de um módulo
 */
function editModuleName(moduleCard, moduleTitle) {
    if (!moduleCard || !moduleTitle) return;
    
    const currentName = moduleTitle.textContent;
    const moduleId = moduleCard.dataset.moduleId;
    
    console.log('Editando módulo:', currentName);
    
    // Verifica se SweetAlert2 está disponível
    if (typeof Swal === 'undefined') {
        const newName = prompt('Digite o novo nome do módulo:', currentName);
        if (newName && newName.trim() !== '') {
            moduleTitle.textContent = newName.trim();
            console.log('Módulo renomeado para:', newName);
        }
        return;
    }
    
    // Exibe o diálogo de edição usando SweetAlert2
    Swal.fire({
        title: 'Editar Módulo',
        input: 'text',
        inputValue: currentName,
        inputAttributes: {
            autocapitalize: 'off',
            autocorrect: 'off',
            maxlength: 30
        },
        showCancelButton: true,
        confirmButtonText: 'Salvar',
        cancelButtonText: 'Cancelar',
        showLoaderOnConfirm: true,
        inputValidator: (value) => {
            if (!value || value.trim() === '') {
                return 'Por favor, digite um nome para o módulo';
            }
        },
        preConfirm: async (newName) => {
            try {
                // Atualiza visualmente o nome do módulo
                moduleTitle.textContent = newName;
                console.log('Módulo atualizado para:', newName);
                
                // Simula um atraso para mostrar loading
                await new Promise(resolve => setTimeout(resolve, 500));
                
                return { success: true, name: newName };
            } catch (error) {
                Swal.showValidationMessage(`Erro ao salvar: ${error.message}`);
            }
        },
        allowOutsideClick: () => !Swal.isLoading()
    }).then((result) => {
        if (result.isConfirmed) {
            Swal.fire({
                icon: 'success',
                title: 'Módulo atualizado!',
                text: `O módulo foi renomeado para "${result.value.name}"`,
                timer: 1500,
                showConfirmButton: false
            });
        }
    });
}

/**
 * Função para editar o nome de uma entidade
 */
function editEntityName(entityCard, entityName) {
    if (!entityCard || !entityName) return;
    
    const currentName = entityName.textContent;
    const entityId = entityCard.dataset.entityId;
    
    console.log('Editando entidade:', currentName);
    
    // Verifica se SweetAlert2 está disponível
    if (typeof Swal === 'undefined') {
        const newName = prompt('Digite o novo nome da entidade:', currentName);
        if (newName && newName.trim() !== '') {
            entityName.textContent = newName.trim();
            console.log('Entidade renomeada para:', newName);
        }
        return;
    }
    
    // Exibe o diálogo de edição usando SweetAlert2
    Swal.fire({
        title: 'Editar Entidade',
        input: 'text',
        inputValue: currentName,
        inputAttributes: {
            autocapitalize: 'off',
            autocorrect: 'off',
            maxlength: 40
        },
        showCancelButton: true,
        confirmButtonText: 'Salvar',
        cancelButtonText: 'Cancelar',
        showLoaderOnConfirm: true,
        inputValidator: (value) => {
            if (!value || value.trim() === '') {
                return 'Por favor, digite um nome para a entidade';
            }
        },
        preConfirm: async (newName) => {
            try {
                // Atualiza visualmente o nome da entidade
                entityName.textContent = newName;
                console.log('Entidade atualizada para:', newName);
                
                // Simula um atraso para mostrar loading
                await new Promise(resolve => setTimeout(resolve, 500));
                
                return { success: true, name: newName };
            } catch (error) {
                Swal.showValidationMessage(`Erro ao salvar: ${error.message}`);
            }
        },
        allowOutsideClick: () => !Swal.isLoading()
    }).then((result) => {
        if (result.isConfirmed) {
            Swal.fire({
                icon: 'success',
                title: 'Entidade atualizada!',
                text: `A entidade foi renomeada para "${result.value.name}"`,
                timer: 1500,
                showConfirmButton: false
            });
        }
    });
}

/**
 * Melhora o sistema de arrastar e soltar para permitir mover entidades entre módulos
 * e adiciona confirmação ao arrastar para fora
 */
function enhanceDragAndDrop() {
    console.log('Sistema de drag and drop melhorado desativado - usando implementação do main.js');
    
    // NOTA: Esta função foi desativada para evitar conflitos com a implementação principal
    // A configuração de drag-and-drop agora é gerenciada exclusivamente pelo main.js
    // para garantir que as entidades sejam corretamente movidas da biblioteca para os módulos
    
    return;
}