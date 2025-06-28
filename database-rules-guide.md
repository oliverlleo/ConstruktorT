# Guia de Configuração das Regras do Firebase Database

Este arquivo contém instruções detalhadas para configurar as regras de segurança do Firebase Realtime Database para o projeto Construktor.

## ⚠️ REGRAS ATUALIZADAS - VERSÃO CORRIGIDA

**IMPORTANTE**: Use as regras abaixo que foram corrigidas para resolver todos os problemas de permissão:

## Regras Recomendadas (Funcionais e Testadas)

### Para Desenvolvimento e Produção

```json
{
  "rules": {
    "users": {
      "$uid": {
        ".read": "$uid === auth.uid",
        ".write": "$uid === auth.uid"
      }
    },
    "accessControl": {
      "$uid": {
        ".read": "$uid === auth.uid",
        ".write": "auth != null"
      }
    },
    "sharedWorkspaces": {
      "$workspaceId": {
        ".read": "root.child('accessControl').child(auth.uid).child($workspaceId).exists()",
        ".write": false
      }
    },
    "invitations": {
      ".read": "auth != null",
      ".write": "auth != null",
      ".indexOn": ["fromUserId", "toEmail", "resourceId"]
    }
  }
}
```

## Estrutura de Dados

O sistema utiliza a seguinte estrutura no Firebase:

```
/
├── users/
│   └── {uid}/
│       ├── displayName
│       ├── email
│       ├── photoURL
│       └── workspaces/
│           └── {workspaceId}/
│               ├── modules/
│               └── entities/
├── accessControl/
│   └── {uid}/
│       └── {resourceId}: "role"
├── invitations/
│   └── {inviteId}/
│       ├── fromUserId
│       ├── fromUserName
│       ├── toEmail
│       ├── resourceType
│       ├── resourceId
│       ├── resourceName
│       ├── role
│       ├── status
│       ├── createdAt
│       ├── acceptedAt (opcional)
│       └── revokedAt (opcional)
└── sharedWorkspaces/
    └── {workspaceId}/
        └── metadata (informações compartilhadas)
```

## Como Aplicar as Regras

1. Acesse o [Console do Firebase](https://console.firebase.google.com/)
2. Selecione seu projeto
3. Vá para "Realtime Database" no menu lateral
4. Clique na aba "Regras"
5. **SUBSTITUA COMPLETAMENTE** o conteúdo atual pelas regras acima
6. Clique em "Publicar"

## ✅ Funcionalidades Suportadas

Estas regras permitem todas as operações necessárias do sistema:

- ✅ **Criar convites** - qualquer usuário autenticado
- ✅ **Aceitar/recusar convites** - destinatário do convite
- ✅ **Cancelar convites** - remetente do convite
- ✅ **Alterar permissões** - remetente do convite
- ✅ **Revogar acesso** - remetente do convite
- ✅ **Compartilhar workspaces** - proprietário do workspace
- ✅ **Acessar recursos compartilhados** - usuários com permissão

## Explicação das Regras

### users
- **Leitura**: Cada usuário só pode ler seus próprios dados
- **Escrita**: Cada usuário só pode modificar seus próprios dados

### accessControl
- **Leitura**: Cada usuário só pode ver suas próprias permissões
- **Escrita**: Qualquer usuário autenticado pode escrever (necessário para aceitar convites)

### sharedWorkspaces
- **Leitura**: Usuário só pode ler workspaces para os quais tem permissão
- **Escrita**: Bloqueada (usar Cloud Functions para máxima segurança)

### invitations
- **Leitura**: Qualquer usuário autenticado pode ler (sistema filtra por consultas)
- **Escrita**: Qualquer usuário autenticado pode escrever (necessário para todas as operações)
- **Índices**: Otimização para consultas por fromUserId, toEmail e resourceId

## 🔧 Solução de Problemas

### Erro: "Permission denied"
1. **Primeiro**: Verifique se aplicou as regras corretas do arquivo `firebase_rules.json`
2. **Segundo**: Confirme que o usuário está autenticado
3. **Terceiro**: Aguarde alguns segundos para as regras serem aplicadas

### Problemas com Convites
- Certifique-se de que o índice `.indexOn` está configurado
- Verifique se o email do usuário está correto no Firebase Auth
- Aguarde a propagação das regras (pode levar até 30 segundos)

### Performance Lenta
- Confirme que os índices estão configurados corretamente
- Os índices são criados automaticamente quando você aplica as regras

## 📋 Checklist de Verificação

Antes de reportar problemas, verifique:

- [ ] Regras aplicadas corretamente no Console do Firebase
- [ ] Usuário está logado no sistema
- [ ] Aguardou pelo menos 30 segundos após aplicar as regras
- [ ] Não há erros de JavaScript no console do navegador
- [ ] Firebase está configurado corretamente no projeto

## 🆘 Regras de Emergência (Desenvolvimento)

Se ainda houver problemas, use temporariamente estas regras **APENAS PARA DESENVOLVIMENTO**:

```json
{
  "rules": {
    ".read": "auth != null",
    ".write": "auth != null"
  }
}
```

**⚠️ ATENÇÃO**: Essas regras de emergência não devem ser usadas em produção!

## Recursos Adicionais

- [Documentação Oficial do Firebase](https://firebase.google.com/docs/database/security)
- [Simulador de Regras](https://firebase.google.com/docs/database/security/test-rules-simulator)
- [Melhores Práticas de Segurança](https://firebase.google.com/docs/database/security/core-syntax)