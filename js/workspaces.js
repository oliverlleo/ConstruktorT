/**
 * Módulo de gerenciamento de áreas de trabalho
 * Responsável por criar, gerenciar e alternar entre diferentes workspaces
 */

import {
  getUsuarioAtual,
  getUsuarioId,
  getUsuarioNome,
  getUsuarioEmail,
} from "./autenticacao.js";
import {
  showSuccess,
  showError,
  showLoading,
  hideLoading,
  showInputDialog,
  showConfirmDialog,
} from "./ui.js";
import { getUserProfileData } from "./user/userProfile.js";

// Variáveis do módulo
let db;
let currentWorkspace = null;
let userWorkspaces = [];
let sharedWorkspaces = [];

/**
 * Inicializa o módulo de áreas de trabalho
 * @param {Object} database - Referência ao banco de dados Firebase
 */
export async function initWorkspaces(database) {
  console.log("Inicializando módulo de áreas de trabalho...");
  db = database;

  setupWorkspaceSelector();

  // Carrega as áreas de trabalho próprias e compartilhadas
  await loadUserWorkspaces();
  await _loadSharedWorkspaces(); // CORREÇÃO: Chamada da função que estava em falta

  // Configura listener para mudanças no controle de acesso
  const userId = getUsuarioId();
  if (userId) {
    db.ref(`accessControl/${userId}`).on("value", (snapshot) => {
      console.log("Mudança detectada no controle de acesso:", snapshot.val());
      _loadSharedWorkspaces(); // CORREÇÃO: Ação a ser tomada quando as permissões mudam
    });
  }
}

/**
 * Configura o seletor de área de trabalho
 */
function setupWorkspaceSelector() {
  const addWorkspaceBtn = document.getElementById("add-workspace-btn");
  const workspaceSelect = document.getElementById("workspace-select");

  if (addWorkspaceBtn) {
    addWorkspaceBtn.addEventListener("click", createNewWorkspace);
  }

  if (workspaceSelect) {
    workspaceSelect.addEventListener("change", switchWorkspace);
  }

  // Configurar botão de compartilhamento
  const shareWorkspaceBtn = document.getElementById("share-workspace-btn");
  if (shareWorkspaceBtn) {
    shareWorkspaceBtn.addEventListener("click", shareCurrentWorkspace);
  }

  // Configurar botão de atualizar recursos compartilhados
  const refreshSharedBtn = document.getElementById("refresh-shared-resources");
  if (refreshSharedBtn) {
    refreshSharedBtn.addEventListener("click", async () => {
      showLoading("Atualizando recursos compartilhados...");
      try {
        await _loadSharedWorkspaces();
        showSuccess(
          "Atualizado!",
          "Recursos compartilhados atualizados com sucesso."
        );
      } catch (error) {
        showError("Erro", "Falha ao atualizar recursos compartilhados.");
        console.error("Erro ao atualizar recursos compartilhados:", error);
      } finally {
        hideLoading();
      }
    });
  }
}

/**
 * Carrega as áreas de trabalho do usuário
 */
async function loadUserWorkspaces() {
  try {
    const userId = getUsuarioId();
    if (!userId) return;

    const snapshot = await db.ref(`users/${userId}/workspaces`).get();
    userWorkspaces = [];

    if (snapshot.exists()) {
      const workspaces = snapshot.val();
      for (const workspaceId in workspaces) {
        userWorkspaces.push({
          id: workspaceId,
          ...workspaces[workspaceId],
          isOwner: true,
        });
      }
    }

    // Se não houver workspaces, cria um padrão
    if (userWorkspaces.length === 0) {
      await createDefaultWorkspace();
    }

    updateWorkspaceSelector();

    // Define o workspace atual como o primeiro se não houver um selecionado
    if (!currentWorkspace && userWorkspaces.length > 0) {
      currentWorkspace = userWorkspaces[0];
    }

    return userWorkspaces;
  } catch (error) {
    console.error("Erro ao carregar áreas de trabalho:", error);
    return [];
  }
}

/**
 * Carrega as áreas de trabalho compartilhadas com o usuário
 */
async function _loadSharedWorkspaces() {
  try {
    const userId = getUsuarioId();
    if (!userId) return [];

    console.log("Carregando áreas de trabalho compartilhadas para:", userId);
    sharedWorkspaces = [];

    // 1. Lê a lista de permissões do próprio utilizador (isto é seguro)
    const accessSnapshot = await db.ref(`accessControl/${userId}`).get();
    if (!accessSnapshot.exists()) {
      console.log("Nenhum recurso compartilhado encontrado.");
      updateSharedWorkspacesDisplay();
      updateWorkspaceSelector();
      return [];
    }

    const accessControl = accessSnapshot.val();
    const promises = [];

    // 2. Para cada ID de recurso que o utilizador tem acesso...
    for (const resourceId in accessControl) {
      if (resourceId === "updatedAt") continue;

      const role = accessControl[resourceId];

      // 3. ...lê a informação pública desse recurso a partir do novo nó /sharedWorkspaces
      const promise = db
        .ref(`sharedWorkspaces/${resourceId}`)
        .get()
        .then((workspaceSnapshot) => {
          if (workspaceSnapshot.exists()) {
            const workspaceData = workspaceSnapshot.val();
            sharedWorkspaces.push({
              id: resourceId,
              name: workspaceData.name,
              isShared: true,
              isOwner: false,
              ownerId: workspaceData.ownerId,
              ownerName: workspaceData.ownerName,
              role: role,
            });
          } else {
            console.warn(
              `Informação para o workspace partilhado ${resourceId} não encontrada.`
            );
          }
        })
        .catch((error) => {
          console.warn(
            `Erro ao carregar informações do workspace ${resourceId}:`,
            error
          );
        });
      promises.push(promise);
    }

    // Aguarda que todas as leituras terminem
    await Promise.all(promises);

    console.log(
      "Áreas de trabalho compartilhadas carregadas:",
      sharedWorkspaces
    );
    updateSharedWorkspacesDisplay();
    updateWorkspaceSelector();
    return sharedWorkspaces;
  } catch (error) {
    console.error("Erro ao carregar áreas de trabalho compartilhadas:", error);
    // Não mostrar o erro ao utilizador se for apenas uma negação de permissão inicial, o que é normal.
    if (error.code !== "PERMISSION_DENIED") {
      showError(
        "Erro",
        "Ocorreu um erro ao carregar as áreas de trabalho compartilhadas."
      );
    }
    updateSharedWorkspacesDisplay();
    updateWorkspaceSelector();
    return [];
  }
}

/**
 * Cria uma área de trabalho padrão
 */
async function createDefaultWorkspace() {
  try {
    const userId = getUsuarioId();
    if (!userId) return;

    const workspaceRef = db.ref(`users/${userId}/workspaces`).push();
    const defaultWorkspace = {
      name: "Minha Área de Trabalho",
      description: "Área de trabalho principal",
      createdAt: firebase.database.ServerValue.TIMESTAMP,
      updatedAt: firebase.database.ServerValue.TIMESTAMP,
    };

    await workspaceRef.set(defaultWorkspace);

    userWorkspaces.push({
      id: workspaceRef.key,
      ...defaultWorkspace,
      isOwner: true,
    });

    return workspaceRef.key;
  } catch (error) {
    console.error("Erro ao criar área de trabalho padrão:", error);
    throw error;
  }
}

/**
 * Cria uma nova área de trabalho
 */
async function createNewWorkspace() {
  const result = await showInputDialog(
    "Nova Área de Trabalho",
    "Nome da Área de Trabalho",
    "Ex: Projeto Vendas, Área Financeira..."
  );

  if (result.confirmed && result.value) {
    showLoading("Criando área de trabalho...");

    try {
      const userId = getUsuarioId();
      if (!userId) {
        throw new Error("Usuário não autenticado");
      }

      const workspaceRef = db.ref(`users/${userId}/workspaces`).push();
      const newWorkspace = {
        name: result.value,
        description: "",
        createdAt: firebase.database.ServerValue.TIMESTAMP,
        updatedAt: firebase.database.ServerValue.TIMESTAMP,
      };

      await workspaceRef.set(newWorkspace);

      // Adiciona à lista local
      const workspace = {
        id: workspaceRef.key,
        ...newWorkspace,
        isOwner: true,
      };
      userWorkspaces.push(workspace);

      updateWorkspaceSelector();

      // Seleciona a nova área de trabalho
      await switchToWorkspace(workspace);

      hideLoading();
      showSuccess(
        "Área de Trabalho Criada!",
        `"${result.value}" foi criada com sucesso.`
      );
    } catch (error) {
      hideLoading();
      showError("Erro", "Ocorreu um erro ao criar a área de trabalho.");
      console.error("Erro ao criar área de trabalho:", error);
    }
  }
}

/**
 * Alterna para uma área de trabalho específica
 */
async function switchToWorkspace(workspace) {
  showLoading("Carregando área de trabalho...");

  try {
    currentWorkspace = workspace;

    // Atualiza o seletor
    const workspaceSelect = document.getElementById("workspace-select");
    if (workspaceSelect) {
      workspaceSelect.value = workspace.id;
    }

    // Atualiza o título da área de trabalho
    const workspaceTitle = document.getElementById("current-workspace-title");
    if (workspaceTitle) {
      workspaceTitle.textContent = workspace.name;
    }

    // Mostra/esconde botão de compartilhamento baseado na propriedade
    const shareBtn = document.getElementById("share-workspace-btn");
    if (shareBtn) {
      if (workspace.isOwner) {
        shareBtn.classList.remove("hidden");
      } else {
        shareBtn.classList.add("hidden");
      }
    }

    // Dispara evento para outros módulos atualizarem
    window.dispatchEvent(
      new CustomEvent("workspaceChanged", {
        detail: { workspace: currentWorkspace },
      })
    );

    hideLoading();
  } catch (error) {
    hideLoading();
    console.error("Erro ao alternar área de trabalho:", error);
    showError("Erro", "Ocorreu um erro ao carregar a área de trabalho.");
  }
}

/**
 * Manipula a mudança no seletor de área de trabalho
 */
async function switchWorkspace(event) {
  const workspaceId = event.target.value;
  if (!workspaceId) return;

  // Busca a área de trabalho nas listas
  let workspace = userWorkspaces.find((w) => w.id === workspaceId);
  if (!workspace) {
    workspace = sharedWorkspaces.find((w) => w.id === workspaceId);
  }

  if (workspace) {
    await switchToWorkspace(workspace);
  }
}

/**
 * Compartilha a área de trabalho atual
 */
async function shareCurrentWorkspace() {
  if (!currentWorkspace || !currentWorkspace.isOwner) {
    showError("Erro", "Você só pode compartilhar áreas de trabalho que criou.");
    return;
  }

  // HTML para o formulário de compartilhamento
  const formHtml = `
        <div class="text-left">
            <div class="mb-4">
                <label for="swal-email" class="block text-sm font-medium text-slate-700 mb-1">Email do usuário</label>
                <input id="swal-email" type="email" class="w-full px-3 py-2 border border-slate-300 rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500" placeholder="usuario@exemplo.com">
            </div>
            <div class="mb-4">
                <label for="swal-permission" class="block text-sm font-medium text-slate-700 mb-1">Nível de permissão</label>
                <select id="swal-permission" class="w-full px-3 py-2 border border-slate-300 rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500">
                    <option value="viewer">Leitor - Apenas visualizar</option>
                    <option value="editor">Editor - Criar e editar</option>
                    <option value="admin">Administrador - Controle total</option>
                </select>
            </div>
        </div>
    `;

  if (typeof Swal !== "undefined") {
    const { value: formValues, isConfirmed } = await Swal.fire({
      title: `Compartilhar "${currentWorkspace.name}"`,
      html: formHtml,
      showCancelButton: true,
      confirmButtonText: "Compartilhar",
      cancelButtonText: "Cancelar",
      focusConfirm: false,
      customClass: {
        popup: "shadow-xl rounded-xl",
      },
      preConfirm: () => {
        const email = document.getElementById("swal-email").value;
        const permission = document.getElementById("swal-permission").value;

        if (!email) {
          Swal.showValidationMessage("O email é obrigatório.");
          return false;
        }

        // Validação de email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          Swal.showValidationMessage("Por favor, informe um email válido.");
          return false;
        }

        // Não permite compartilhar consigo mesmo
        if (email.toLowerCase() === getUsuarioEmail()?.toLowerCase()) {
          Swal.showValidationMessage(
            "Você não pode compartilhar consigo mesmo."
          );
          return false;
        }

        return { email, permission };
      },
    });

    if (isConfirmed && formValues) {
      await sendWorkspaceInvitation(formValues.email, formValues.permission);
    }
  }
}

/**
 * Envia convite para área de trabalho
 */
async function sendWorkspaceInvitation(email, permission) {
  showLoading("Enviando convite...");

  try {
    const currentUser = getUsuarioAtual();
    const userId = getUsuarioId();

    if (!currentUser || !userId || !currentWorkspace) {
      throw new Error("Dados necessários não encontrados.");
    }

    // Busca o perfil do usuário atual
    const userProfile = (await getUserProfileData()) || {};
    const senderName =
      userProfile.displayName ||
      getUsuarioNome() ||
      getUsuarioEmail() ||
      "Usuário";

    // Cria o convite
    const inviteRef = db.ref("invitations").push();

    await inviteRef.set({
      fromUserId: userId,
      fromUserName: senderName,
      toEmail: email.toLowerCase(),
      resourceType: "workspace",
      resourceId: currentWorkspace.id,
      resourceName: currentWorkspace.name,
      role: permission,
      status: "pending",
      createdAt: firebase.database.ServerValue.TIMESTAMP,
    });

    hideLoading();
    showSuccess(
      "Convite enviado!",
      `Um convite para "${currentWorkspace.name}" foi enviado para ${email}.`
    );
  } catch (error) {
    hideLoading();
    console.error("Erro ao enviar convite:", error);
    showError("Erro", "Ocorreu um erro ao enviar o convite.");
  }
}

/**
 * Atualiza o seletor de área de trabalho
 */
function updateWorkspaceSelector() {
    const container = document.getElementById("workspace-selector");
    if (!container) return;

    // Limpa o container
    container.innerHTML = '';

    // Cria e adiciona o título
    const titleHtml = `
        <div class="flex items-center justify-between mb-2">
            <h3 class="text-sm font-semibold text-slate-700 flex items-center gap-1">
                <i class="fa-solid fa-briefcase h-4 w-4 text-purple-500"></i> Área de Trabalho
            </h3>
            <button id="share-workspace-btn" class="text-xs bg-purple-50 text-purple-700 px-2 py-1 rounded-full hover:bg-purple-100 transition-all hidden">
                <i class="fa-solid fa-share-nodes h-3 w-3 inline-block mr-1"></i>Compartilhar
            </button>
        </div>
    `;
    container.insertAdjacentHTML('beforeend', titleHtml);

    // Cria o container para o select e o botão de adicionar
    const controlsContainer = document.createElement('div');
    controlsContainer.className = 'flex gap-1';

    // Cria o select
    const workspaceSelect = document.createElement('select');
    workspaceSelect.id = 'workspace-select';
    workspaceSelect.className = 'flex-1 text-sm border border-slate-300 rounded-lg px-2 py-1.5 text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-purple-500';

    // Adiciona as optgroups
    if (userWorkspaces.length > 0) {
        const ownGroup = document.createElement("optgroup");
        ownGroup.label = "Minhas Áreas de Trabalho";
        userWorkspaces.forEach(workspace => {
            const option = document.createElement("option");
            option.value = workspace.id;
            option.textContent = workspace.name;
            ownGroup.appendChild(option);
        });
        workspaceSelect.appendChild(ownGroup);
    }

    if (sharedWorkspaces.length > 0) {
        const sharedGroup = document.createElement("optgroup");
        sharedGroup.label = "Compartilhadas Comigo";
        sharedWorkspaces.forEach(workspace => {
            const option = document.createElement("option");
            option.value = workspace.id;
            option.textContent = `${workspace.name} (${workspace.ownerName})`;
            sharedGroup.appendChild(option);
        });
        workspaceSelect.appendChild(sharedGroup);
    }

    controlsContainer.appendChild(workspaceSelect);

    // Cria e adiciona o botão de "Criar Novo Workspace"
    const addWorkspaceBtn = document.createElement('button');
    addWorkspaceBtn.id = 'add-workspace-btn';
    addWorkspaceBtn.className = 'bg-purple-50 text-purple-600 px-2 py-1.5 rounded-lg hover:bg-purple-100 transition-all';
    addWorkspaceBtn.innerHTML = '<i class="fa-solid fa-plus h-4 w-4"></i>';
    controlsContainer.appendChild(addWorkspaceBtn);

    container.appendChild(controlsContainer);

    // Adiciona o título do workspace atual
    const currentWorkspaceTitle = document.createElement('div');
    currentWorkspaceTitle.id = 'current-workspace-title';
    currentWorkspaceTitle.className = 'mt-1 text-xs text-slate-500 truncate';
    if (currentWorkspace) {
        currentWorkspaceTitle.textContent = currentWorkspace.name;
    }
    container.appendChild(currentWorkspaceTitle);

    // Reatribui os eventos de clique, pois os elementos foram recriados
    setupWorkspaceSelector();

    // Seleciona a área de trabalho atual no dropdown
    if (currentWorkspace) {
        workspaceSelect.value = currentWorkspace.id;
    }

    // Atualiza a visibilidade do botão de compartilhar
    const shareBtn = document.getElementById("share-workspace-btn");
    if (shareBtn && currentWorkspace && currentWorkspace.isOwner) {
        shareBtn.classList.remove("hidden");
    }
}

/**
 * Atualiza a exibição das áreas de trabalho compartilhadas
 */
function updateSharedWorkspacesDisplay() {
  const container = document.getElementById("shared-resources-list");
  const emptyMessage = document.getElementById("no-shared-resources");

  if (!container || !emptyMessage) return;

  console.log(
    "Atualizando exibição de workspaces compartilhados:",
    sharedWorkspaces.length
  );
  container.innerHTML = "";

  if (sharedWorkspaces.length === 0) {
    container.classList.add("hidden");
    emptyMessage.classList.remove("hidden");
    console.log(
      "Nenhum workspace compartilhado encontrado, mostrando mensagem vazia"
    );
  } else {
    container.classList.remove("hidden");
    emptyMessage.classList.add("hidden");

    sharedWorkspaces.forEach((workspace) => {
      console.log("Renderizando workspace compartilhado:", workspace);
      renderSharedWorkspace(workspace, container);
    });

    // Atualiza os ícones para garantir que eles sejam renderizados
    setTimeout(() => {
      if (window.lucide) {
        lucide.createIcons();
      }
    }, 100);
  }
}

/**
 * Renderiza uma área de trabalho compartilhada
 */
function renderSharedWorkspace(workspace, container) {
  const itemHtml = `
        <div class="shared-workspace-item bg-white rounded-lg border border-emerald-100 shadow-sm p-3 hover:shadow-md transition-shadow" 
             data-workspace-id="${workspace.id}" data-owner-id="${
    workspace.ownerId
  }">
            <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                    <div class="h-8 w-8 rounded-md bg-emerald-100 flex items-center justify-center text-emerald-600">
                        <i data-lucide="briefcase" class="h-5 w-5"></i>
                    </div>
                    <div>
                        <span class="font-medium text-slate-700 block text-sm">${
                          workspace.name
                        }</span>
                        <span class="text-xs text-slate-500">Por ${
                          workspace.ownerName
                        } • ${formatRoleText(workspace.role)}</span>
                    </div>
                </div>
                <button class="access-shared-workspace-btn bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-md hover:bg-emerald-100 transition-colors text-sm flex items-center gap-1">
                    <i data-lucide="log-in" class="h-4 w-4"></i>
                    <span>Acessar</span>
                </button>
            </div>
        </div>
    `;

  const tempDiv = document.createElement("div");
  tempDiv.innerHTML = itemHtml.trim();
  const item = tempDiv.firstChild;

  // Adiciona evento de clique
  item
    .querySelector(".access-shared-workspace-btn")
    .addEventListener("click", () => {
      switchToWorkspace(workspace);
    });

  container.appendChild(item);

  // Atualiza ícones
  if (window.lucide) {
    lucide.createIcons();
  }
}

/**
 * Formata o texto da permissão
 */
function formatRoleText(role) {
  switch (role) {
    case "admin":
      return "Administrador";
    case "editor":
      return "Editor";
    case "viewer":
      return "Leitor";
    default:
      return role || "Desconhecido";
  }
}

/**
 * Obtém a área de trabalho atual
 */
export function getCurrentWorkspace() {
  return currentWorkspace;
}

/**
 * Obtém todas as áreas de trabalho do usuário
 */
export function getUserWorkspaces() {
  return userWorkspaces;
}

/**
 * Obtém áreas de trabalho compartilhadas
 */
export function getSharedWorkspaces() {
  return sharedWorkspaces;
}

/**
 * Carrega as áreas de trabalho compartilhadas com o usuário
 * Exposta para que possa ser chamada de outros módulos
 */
export async function loadSharedWorkspaces() {
  return await _loadSharedWorkspaces();
}

/**
 * Atualiza as listas de áreas de trabalho
 */
export async function refreshWorkspaces() {
  console.log("Atualizando todas as áreas de trabalho...");
  await loadUserWorkspaces();
  await _loadSharedWorkspaces();
}
