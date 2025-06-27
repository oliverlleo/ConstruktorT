// Configuração do Firebase
export const firebaseConfig = {
    apiKey: "AIzaSyAtuwWlErlNOW_c5BlBE_ktwSSmHGLjN2c",
    authDomain: "prototipoos.firebaseapp.com",
    databaseURL: "https://prototipoos-default-rtdb.firebaseio.com",
    projectId: "prototipoos",
    storageBucket: "prototipoos.firebasestorage.app",
    messagingSenderId: "969276068015",
    appId: "1:969276068015:web:ef7d8c7bfc6f8d5104445a",
    measurementId: "G-85EK8CECR5"
};

// Constantes para controle de dicas
export const TIPS_STATE = {
    WELCOME_TIP: 'welcomeTipClosed',
    QUICK_TIP: 'quickTipClosed',
    MODULES_TIP: 'modulesTipClosed'
};

// Dados de configuração inicial
export const availableEntityIcons = ['user-round', 'file-text', 'package', 'phone', 'building', 'truck', 'dollar-sign', 'tag', 'shopping-cart', 'receipt', 'landmark', 'briefcase'];

export const fieldTypes = [
    { type: 'text', name: 'Texto Curto', icon: 'type' },
    { type: 'textarea', name: 'Texto Longo', icon: 'pilcrow' },
    { type: 'number', name: 'Número', icon: 'hash' },
    { type: 'date', name: 'Data', icon: 'calendar' },
    { type: 'email', name: 'Email', icon: 'at-sign' },
    { type: 'checkbox', name: 'Caixa de Seleção', icon: 'check-square' },
    { type: 'select', name: 'Lista Suspensa', icon: 'chevron-down-square' },
    { type: 'file', name: 'Upload de Ficheiro', icon: 'upload-cloud' },
    { type: 'sub-entity', name: 'Tabela / Relação', icon: 'table-2' },
];

// Configurações padrão para tipos de campos
export const defaultFieldConfigs = {
    text: {
        contentType: 'text',       // text, email, url
        appearance: 'singleLine',  // singleLine, multiLine
        maxLength: null,           // número máximo de caracteres (null = ilimitado)
        required: false            // campo obrigatório
    },
    textarea: {
        contentType: 'text',
        appearance: 'multiLine',
        maxLength: null,
        required: false
    },
    number: {
        format: 'plain',          // plain, thousands, decimal, currency, percentage
        precision: 2,             // número de casas decimais
        symbol: 'R$',             // símbolo de moeda (para formato currency)
        minValue: null,           // valor mínimo (null = ilimitado)
        maxValue: null,           // valor máximo (null = ilimitado)
        required: false
    },
    date: {
        dateFormat: 'DD/MM/AAAA', // DD/MM/AAAA, MM/DD/AAAA, AAAA-MM-DD, complete
        includeTime: 'none',      // none, HH:mm, HH:mm:ss
        behavior: 'singleDate',   // singleDate, dateRange
        defaultValue: 'none',     // none, today
        required: false
    },
    email: {
        contentType: 'email',
        appearance: 'singleLine',
        maxLength: null,
        required: false
    },
    checkbox: {
        defaultValue: false,
        required: false
    },
    select: {
        allowMultiple: false,     // single, multiple
        appearance: 'dropdown',   // dropdown, buttons
        options: [
            { id: 'opt1', label: 'Opção 1' }
        ],
        required: false
    },
    file: {
        allowedTypes: '*',        // mime types ou extensões, * para todos
        maxSize: null,            // tamanho máximo em bytes (null = ilimitado)
        required: false
    },
    'sub-entity': {
        subType: 'independent',   // independent, relationship
        subSchema: { attributes: [] },
        required: false
    }
};