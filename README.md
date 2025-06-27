# Construktor - Sistema de Construção Visual de ERP/CRM

**VERSÃO CORRIGIDA E ATUALIZADA**  
Exportada em: 27/06/2025 às 07:04:21

## ✅ Correções Aplicadas Nesta Versão

### Problemas de Performance Resolvidos
- **Corrigido**: Erros infinitos de ícones Lucide que travavam o sistema
- **Implementado**: Sistema de debounce para atualização de ícones
- **Otimizado**: MutationObserver com verificação inteligente de mudanças

### Funcionalidades de Convites Corrigidas
- **✅ Cancelar convites**: Agora funciona corretamente na aba "Enviados"
- **✅ Editar permissões**: Dropdown para alterar permissões (Admin/Editor/Leitor)
- **✅ Remover acesso**: Funcionalidade completa de remoção de usuários
- **✅ Interface melhorada**: Botões com texto e estilo consistente

### Melhorias na Interface
- **Botões padronizados**: Todos os botões de ação seguem o mesmo padrão visual
- **Feedback visual**: Melhor indicação de ações disponíveis
- **Responsividade**: Interface otimizada para diferentes tamanhos de tela

## Descrição
O Construktor é um sistema visual para construção de ERP/CRM, permitindo criar e gerenciar módulos, entidades e campos de formulários.

## Funcionalidades Principais
- ✨ Criação de módulos personalizados
- 🎯 Arrastar e soltar entidades nos módulos
- ⚙️ Configuração avançada de campos de formulário
- 👥 Sistema completo de convites e permissões
- 🔄 Áreas de trabalho compartilhadas
- 🛡️ Controle granular de acesso (Admin/Editor/Leitor)

## Estrutura de Arquivos
### Arquivos Principais
- `index.html` - Página principal da aplicação (CORRIGIDA)
- `js/main.js` - Arquivo JavaScript principal
- `js/user/invitations.js` - Sistema de convites (TOTALMENTE REESCRITO)
- `js/config.js` - Configurações da aplicação

### Configuração e Documentação
- `firebase_rules.json` - Regras de segurança do Firebase
- `database-rules-guide.md` - Guia para configuração das regras
- `YOUWARE.md` - Documentação técnica completa

## 🔧 Tecnologias Utilizadas
- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **Styles**: Tailwind CSS
- **Icons**: Lucide Icons (com sistema otimizado)
- **Backend**: Firebase (Auth, Realtime Database, Storage)
- **UI**: SweetAlert2, Sortable.js

## 📝 Notas Importantes
Esta versão inclui todas as correções críticas para:
1. Performance e estabilidade do sistema
2. Funcionalidades de gerenciamento de convites
3. Interface de usuário consistente e intuitiva

Para mais informações técnicas, consulte `YOUWARE.md`.
