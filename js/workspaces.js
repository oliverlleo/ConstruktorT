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
  db = database; // This should be the Firestore db instance

  setupWorkspaceSelector();

  // Carrega as áreas de trabalho próprias e compartilhadas
  await loadUserWorkspaces();
  await _loadSharedWorkspaces();

  // REMOVED: Realtime listener for accessControl changes.
  // Firestore listeners for dynamic accessControl changes across all potential workspaces
  // are more complex to set up here. Rely on manual refresh or event-driven reloads
  // (e.g., after an invitation is accepted).
  // const userId = getUsuarioId();
  // if (userId) {
    // Example for Firestore (complex to listen to all relevant accessControl docs):
    // This would require knowing all workspaceIds user might have access to,
    // or querying 'invitations' and then listening to 'accessControl' for those.
    // For simplicity, this listener is removed as per common Firestore patterns
    // where direct listeners on widely distributed access rights are less common.
  // }
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
    if (!userId) {
        console.warn("[loadUserWorkspaces] User not authenticated.");
        return [];
    }
    const workspacesPath = `users/${userId}/workspaces`;
    console.log(`[loadUserWorkspaces] Loading from Firestore path: ${workspacesPath}`);
    userWorkspaces = []; // Reset local cache

    try {
        const snapshot = await db.collection(workspacesPath).get();

        if (snapshot.empty) {
            console.log("[loadUserWorkspaces] No workspaces found for this user. Creating default.");
            // If no workspaces, create a default one
            await createDefaultWorkspace(); // This function also needs refactoring for Firestore
                                          // and will add to userWorkspaces itself.
        } else {
            snapshot.forEach(doc => {
                userWorkspaces.push({
                    id: doc.id,
                    ...doc.data(),
                    isOwner: true, // These are user's own workspaces
                });
            });
        }

        updateWorkspaceSelector();

        // Define the current workspace as the first one if none is selected
        // and if createDefaultWorkspace didn't already set it.
        if (!currentWorkspace && userWorkspaces.length > 0) {
            // currentWorkspace = userWorkspaces[0]; // This might trigger a load
            // Let's call switchToWorkspace to ensure all logic runs
            await switchToWorkspace(userWorkspaces[0]);
        } else if (currentWorkspace && !userWorkspaces.find(ws => ws.id === currentWorkspace.id)) {
            // If current workspace is no longer in the list (e.g. deleted elsewhere)
            currentWorkspace = userWorkspaces.length > 0 ? userWorkspaces[0] : null;
            if (currentWorkspace) await switchToWorkspace(currentWorkspace);
            else {
                 window.dispatchEvent( new CustomEvent("workspaceChanged", { detail: { workspace: null } }) );
            }
        }


        console.log("[loadUserWorkspaces] User workspaces loaded:", userWorkspaces);
        return userWorkspaces;
    } catch (error) {
        console.error("[loadUserWorkspaces] Error loading workspaces:", error);
        showError("Erro de Carregamento", "Não foi possível carregar suas áreas de trabalho.");
        return [];
    }
}

/**
 * Carrega as áreas de trabalho compartilhadas com o usuário
 */
async function _loadSharedWorkspaces() {
    const currentUserId = getUsuarioId();
    const currentUserEmail = getUsuarioEmail()?.toLowerCase();

    if (!currentUserId || !currentUserEmail) {
        console.warn("[_loadSharedWorkspaces] User not authenticated.");
        sharedWorkspaces = [];
        updateSharedWorkspacesDisplay();
        updateWorkspaceSelector();
        return [];
    }

    console.log(`[_loadSharedWorkspaces] Loading shared workspaces for user: ${currentUserId}, email: ${currentUserEmail}`);
    sharedWorkspaces = []; // Reset local cache

    try {
        // 1. Query 'invitations' for accepted invites for the current user
        const invitationsSnapshot = await db.collection('invitations')
            .where('toEmail', '==', currentUserEmail)
            .where('status', '==', 'accepted')
            .get();

        if (invitationsSnapshot.empty) {
            console.log("[_loadSharedWorkspaces] No accepted invitations found.");
            updateSharedWorkspacesDisplay();
            updateWorkspaceSelector();
            return [];
        }

        const workspacePromises = [];
        invitationsSnapshot.forEach(inviteDoc => {
            const inviteData = inviteDoc.data();
            const workspaceId = inviteData.resourceId;
            const ownerId = inviteData.fromUserId;
            // const roleFromInvite = inviteData.role; // Role from invite

            if (!workspaceId || !ownerId) {
                console.warn("[_loadSharedWorkspaces] Skipping invitation with missing resourceId or fromUserId", inviteData);
                return; // Skips this iteration
            }

            // For each accepted invite, construct a promise to fetch access control, then owner & workspace details
            const promise = (async () => {
                try {
                    // 2. Verify access and get role from accessControl/{workspaceId}
                    const accessControlRef = db.doc(`accessControl/${workspaceId}`);
                    const accessDoc = await accessControlRef.get();

                    if (!accessDoc.exists) {
                        console.warn(`[_loadSharedWorkspaces] accessControl document for workspace ${workspaceId} not found.`);
                        return null;
                    }
                    const accessData = accessDoc.data();
                    const userRole = accessData[currentUserId];

                    if (!userRole) {
                        console.warn(`[_loadSharedWorkspaces] User ${currentUserId} role not found in accessControl/${workspaceId}. Access might have been revoked.`);
                        return null;
                    }

                    // 3. Fetch workspace details from users/{ownerId}/workspaces/{workspaceId}
                    const workspaceDocRef = db.doc(`users/${ownerId}/workspaces/${workspaceId}`);
                    const workspaceDoc = await workspaceDocRef.get();

                    if (!workspaceDoc.exists()) {
                        console.warn(`[_loadSharedWorkspaces] Shared workspace document users/${ownerId}/workspaces/${workspaceId} not found.`);
                        return null;
                    }
                    const workspaceData = workspaceDoc.data();

                    // 4. Fetch owner's name (optional, for display)
                    let ownerName = inviteData.fromUserName || ownerId; // Use from invite or fallback to ID
                    if (!inviteData.fromUserName) { // If not on invite, try to fetch
                        try {
                            const userDoc = await db.doc(`users/${ownerId}`).get();
                            if (userDoc.exists && userDoc.data().displayName) {
                                ownerName = userDoc.data().displayName;
                            }
                        } catch (e) {
                            console.warn(`[_loadSharedWorkspaces] Could not fetch owner display name for ${ownerId}`, e);
                        }
                    }

                    return {
                        id: workspaceId,
                        name: workspaceData.name,
                        description: workspaceData.description || "",
                        // ... other workspace fields if needed for display or context
                        isShared: true,
                        isOwner: false, // By definition, these are shared TO the user
                        ownerId: ownerId,
                        ownerName: ownerName,
                        role: userRole, // Role from accessControl
                    };
                } catch (error) {
                    console.error(`[_loadSharedWorkspaces] Error processing shared workspace ${workspaceId} from owner ${ownerId}:`, error);
                    return null; // Return null for this item on error
                }
            })();
            workspacePromises.push(promise);
        });

        const resolvedWorkspaces = await Promise.all(workspacePromises);
        sharedWorkspaces = resolvedWorkspaces.filter(ws => ws !== null); // Filter out any nulls from errors

        console.log("[_loadSharedWorkspaces] Shared workspaces loaded:", sharedWorkspaces);
        updateSharedWorkspacesDisplay(); // Update UI
        updateWorkspaceSelector();       // Update dropdown
        return sharedWorkspaces;

    } catch (error) {
        console.error("[_loadSharedWorkspaces] General error loading shared workspaces:", error);
        showError("Erro", "Ocorreu um erro ao carregar as áreas de trabalho compartilhadas.");
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
    if (!userId) {
        console.error("[createDefaultWorkspace] User not authenticated.");
        throw new Error("User not authenticated, cannot create default workspace.");
    }
    const workspacesPath = `users/${userId}/workspaces`;

    const defaultWorkspaceData = {
      name: "Minha Área de Trabalho",
      description: "Área de trabalho principal",
      createdAt: firebase.firestore.FieldValue.serverTimestamp(), // Firestore timestamp
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(), // Firestore timestamp
      ownerId: userId // Explicitly set ownerId
    };

    try {
        const docRef = await db.collection(workspacesPath).add(defaultWorkspaceData);
        console.log("[createDefaultWorkspace] Default workspace created with ID:", docRef.id);

        const newWorkspace = {
            id: docRef.id,
            ...defaultWorkspaceData, // Note: server timestamps will be null until server processes
            isOwner: true,
        };
        userWorkspaces.push(newWorkspace); // Add to local cache

        // If this is the only workspace, set it as current
        if (!currentWorkspace) {
           // currentWorkspace = newWorkspace; // This might be set by loadUserWorkspaces calling switchToWorkspace
           await switchToWorkspace(newWorkspace);
        }
        updateWorkspaceSelector(); // Ensure selector is updated

        return docRef.id;
    } catch (error) {
        console.error("[createDefaultWorkspace] Error creating default workspace:", error);
        showError("Erro Crítico", "Não foi possível criar a área de trabalho padrão.");
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
        const userId = getUsuarioId();
        if (!userId) {
            hideLoading();
            showError("Erro de Autenticação", "Usuário não autenticado.");
            console.error("[createNewWorkspace] User not authenticated.");
            return;
        }
        const workspacesPath = `users/${userId}/workspaces`;

        const newWorkspaceData = {
            name: result.value,
            description: "", // Default empty description
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            ownerId: userId // Explicitly set ownerId
        };

        try {
            const docRef = await db.collection(workspacesPath).add(newWorkspaceData);
            console.log("[createNewWorkspace] New workspace created with ID:", docRef.id);

            const workspaceForCache = {
                id: docRef.id,
                ...newWorkspaceData, // Timestamps will be processed by server
                isOwner: true,
            };
            userWorkspaces.push(workspaceForCache);

            updateWorkspaceSelector();
            await switchToWorkspace(workspaceForCache); // Switch to the new workspace

            hideLoading();
            showSuccess(
                "Área de Trabalho Criada!",
                `"${result.value}" foi criada com sucesso.`
            );
        } catch (error) {
            hideLoading();
            showError("Erro", "Ocorreu um erro ao criar a área de trabalho.");
            console.error("[createNewWorkspace] Error creating new workspace:", error);
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

    // Cria o convite no Firestore
    const newInviteData = {
        fromUserId: userId,
        fromUserName: senderName, // This should ideally be fetched fresh or use a reliable source
        toEmail: email.toLowerCase(),
        resourceType: "workspace", // Type of resource being shared
        resourceId: currentWorkspace.id, // ID of the workspace
        resourceName: currentWorkspace.name, // Name of the workspace, for display in invite
        role: permission, // Role being granted (e.g., "viewer", "editor")
        status: "pending", // Initial status of the invitation
        createdAt: firebase.firestore.FieldValue.serverTimestamp(), // Firestore timestamp
    };

    await db.collection("invitations").add(newInviteData);
    console.log("[sendWorkspaceInvitation] Invitation sent:", newInviteData);

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
  const workspaceSelect = document.getElementById("workspace-select");
  if (!workspaceSelect) return;

  workspaceSelect.innerHTML = "";

  // Adiciona áreas de trabalho próprias
  if (userWorkspaces.length > 0) {
    const ownGroup = document.createElement("optgroup");
    ownGroup.label = "Minhas Áreas de Trabalho";

    userWorkspaces.forEach((workspace) => {
      const option = document.createElement("option");
      option.value = workspace.id;
      option.textContent = workspace.name;
      ownGroup.appendChild(option);
    });

    workspaceSelect.appendChild(ownGroup);
  }

  // Adiciona áreas de trabalho compartilhadas
  if (sharedWorkspaces.length > 0) {
    const sharedGroup = document.createElement("optgroup");
    sharedGroup.label = "Compartilhadas Comigo";

    sharedWorkspaces.forEach((workspace) => {
      const option = document.createElement("option");
      option.value = workspace.id;
      option.textContent = `${workspace.name} (${workspace.ownerName})`;
      sharedGroup.appendChild(option);
    });

    workspaceSelect.appendChild(sharedGroup);
  }

  // Seleciona a área de trabalho atual
  if (currentWorkspace) {
    workspaceSelect.value = currentWorkspace.id;
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
             data-workspace-id="${workspace.id}" data-owner-id="${workspace.ownerId}">
            <div class="flex items-center justify-between gap-2">

                <div class="flex items-center gap-2 flex-1 min-w-0">
                    <div class="h-8 w-8 rounded-md bg-emerald-100 flex items-center justify-center text-emerald-600 flex-shrink-0">
                        <i data-lucide="briefcase" class="h-5 w-5"></i>
                    </div>
                    <div class="min-w-0">
                        <span class="font-medium text-slate-700 block text-sm truncate">${workspace.name}</span>
                        <span class="text-xs text-slate-500 block truncate">Por ${workspace.ownerName} • ${formatRoleText(workspace.role)}</span>
                    </div>
                </div>

                <button class="access-shared-workspace-btn bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-md hover:bg-emerald-100 transition-colors text-sm flex items-center gap-1 flex-shrink-0">
                    <i data-lucide="log-in" class="h-4 w-4"></i>
                    <span>Acessar</span>
                </button>
            </div>
        </div>
    `;

  const tempDiv = document.createElement("div");
  tempDiv.innerHTML = itemHtml.trim();
  const item = tempDiv.firstChild;

  item
    .querySelector(".access-shared-workspace-btn")
    .addEventListener("click", () => {
      switchToWorkspace(workspace);
    });

  container.appendChild(item);

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
