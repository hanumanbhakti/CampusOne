// ======================================================
// CAMPUSONE UI CORE ENGINE
// ======================================================

const loader =
    document.getElementById("co-global-loader");

const toastContainer =
    document.getElementById("co-toast-container");

const modal =
    document.getElementById("co-global-modal");

const modalTitle =
    document.getElementById("co-modal-title");

const modalBody =
    document.getElementById("co-modal-body");

const modalConfirmBtn =
    document.getElementById("co-global-modal-confirm-btn");

const sidebarOverlay =
    document.getElementById("co-sidebar-overlay-backdrop");

const commandPalette =
    document.getElementById("co-command-palette-modal");


// ======================================================
// LOADER
// ======================================================

export function toggleLoader(show = true) {

    if (!loader) return;

    loader.classList.toggle("hidden", !show);
}


// ======================================================
// TOAST
// ======================================================

export function showToast(
    message,
    type = "info",
    duration = 3000
) {

    if (!toastContainer) return;

    const toast = document.createElement("div");

    toast.className =
        `co-toast co-toast-${type}`;

    toast.textContent = message;

    toastContainer.appendChild(toast);

    setTimeout(() => {

        toast.style.opacity = "0";

        setTimeout(() => {
            toast.remove();
        }, 300);

    }, duration);
}


// ======================================================
// MODAL
// ======================================================

export function showModal(
    title = "CampusOne",
    content = ""
) {

    if (!modal) return;

    modalTitle.textContent = title;

    modalBody.innerHTML = content;

    modal.classList.remove("hidden");
}

export function closeModal() {

    modal?.classList.add("hidden");
}


// ======================================================
// CONFIRM DIALOG
// ======================================================

export function showConfirmDialog(
    title,
    message,
    onConfirm
) {

    showModal(
        title,
        `<p>${message}</p>`
    );

    const confirmBtn =
        document.getElementById(
            "co-global-modal-confirm-btn"
        );

    const handler = () => {

        closeModal();

        if (typeof onConfirm === "function") {
            onConfirm();
        }

        confirmBtn.removeEventListener(
            "click",
            handler
        );
    };

    confirmBtn.addEventListener(
        "click",
        handler
    );
}


// ======================================================
// SIDEBAR OVERLAY
// ======================================================

export function showSidebarOverlay() {

    sidebarOverlay?.classList.remove("hidden");
}

export function hideSidebarOverlay() {

    sidebarOverlay?.classList.add("hidden");
}


// ======================================================
// COMMAND PALETTE
// ======================================================

export function openCommandPalette() {

    commandPalette?.classList.remove("hidden");

    document
        .getElementById("co-command-palette-input")
        ?.focus();
}

export function closeCommandPalette() {

    commandPalette?.classList.add("hidden");
}


// ======================================================
// EMPTY STATE
// ======================================================

export function setEmptyState(
    targetId,
    message = "No records found"
) {

    const el =
        document.getElementById(targetId);

    if (!el) return;

    el.innerHTML = `
        <div class="co-empty-state">
            <p>${message}</p>
        </div>
    `;
}


// ======================================================
// SKELETON
// ======================================================

export function showSkeleton(targetId) {

    const el =
        document.getElementById(targetId);

    if (!el) return;

    el.dataset.loading = "true";
}

export function hideSkeleton(targetId) {

    const el =
        document.getElementById(targetId);

    if (!el) return;

    delete el.dataset.loading;
}


// ======================================================
// DEBOUNCE
// ======================================================

export function debounce(
    func,
    delay = 300
) {

    let timer;

    return (...args) => {

        clearTimeout(timer);

        timer = setTimeout(
            () => func(...args),
            delay
        );
    };
}


// ======================================================
// AUTO EVENTS
// ======================================================

document.addEventListener(
    "DOMContentLoaded",
    () => {

        document
            .getElementById(
                "co-global-modal-close-trigger"
            )
            ?.addEventListener(
                "click",
                closeModal
            );

        document
            .getElementById(
                "co-global-modal-cancel-btn"
            )
            ?.addEventListener(
                "click",
                closeModal
            );

        sidebarOverlay?.addEventListener(
            "click",
            hideSidebarOverlay
        );
    }
);
