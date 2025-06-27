# Construktor - Sistema de Construção Visual de ERP/CRM

## Estrutura do Projeto

### Arquivos Principais
- `index.html` - Página principal da aplicação
- `js/main.js` - Arquivo JavaScript principal que coordena todos os módulos
- `js/config.js` - Configurações da aplicação, incluindo Firebase
- `js/autenticacao.js` - Gerenciamento de autenticação
- `js/database.js` - Interação com o Firebase Database
- `js/ui.js` - Funções de interface do usuário
- `js/user/userProfile.js` - Gerenciamento de perfil de usuário
- `js/user/invitations.js` - Sistema de convites e permissões

### Estrutura de Diretórios
- `/css` - Estilos CSS
- `/js` - Scripts JavaScript
  - `/js/user` - Módulos relacionados a usuários (perfil, convites)
- `/pages` - Páginas adicionais (login, visualização de código, etc.)

## Firebase Integration

O projeto utiliza Firebase para:
- Autenticação de usuários (Firebase Auth)
- Armazenamento de dados (Firebase Realtime Database)
- Upload de arquivos (Firebase Storage)

### Estrutura de Dados no Firebase
- `/users/{uid}` - Informações de perfil de usuário
- `/invitations` - Sistema de convites entre usuários
- `/accessControl/{uid}` - Permissões de usuários para recursos
- `/modules` - Módulos criados pelos usuários
- `/entities` - Entidades disponíveis no sistema

## Funcionalidades Principais

### Gerenciamento de Módulos e Entidades
- Criação de módulos personalizados
- Arrastar e soltar entidades nos módulos
- Configuração de campos de formulário

### Sistema de Usuário e Permissões
- Menu dropdown ao clicar no logo Construktor
- Edição de perfil (nome, avatar)
- Sistema de convites para compartilhar acesso
- Diferentes níveis de permissão (admin, editor, leitor)
- Gerenciamento de convites enviados e recebidos

## Inicialização do Projeto

Para iniciar o desenvolvimento, arquivos principais a verificar:
1. `js/main.js` - Ponto de entrada principal da aplicação
2. `js/config.js` - Configuração do Firebase

## Bibliotecas Externas Utilizadas
- Tailwind CSS (via CDN)
- Lucide Icons
- SweetAlert2
- Sortable.js (para arrastar e soltar)
- Firebase SDK