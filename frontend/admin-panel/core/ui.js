// ======================================================
// CAMPUSONE UI CORE ENGINE
// ======================================================

export const UI = {

    // -------------------------
    // DOM SELECTORS
    // -------------------------

    loader: document.getElementById("co-global-loader"),
    toastContainer: document.getElementById("co-toast-container"),
    modal: document.getElementById("co-global-modal"),
    modalTitle: document.getElementById("co-modal-title"),
    modalBody: document.getElementById("co-modal-body"),

    // -------------------------
    // LOADER
    // -------------------------

    showLoader() {
        if (!this.loader) return;
        this.loader.classList.remove("hidden");
    },

    hideLoader() {
        if (!this.loader) return;
        this.loader.classList.add("hidden");
    },

    // -------------------------
    // TOAST
    // -------------------------

    toast(message, type = "info", duration = 3000) {

        if (!this.toastContainer) return;

        const toast = document.createElement("div");

        toast.className = `co-toast co-toast-${type}`;

        toast.innerHTML = `
            <span>${message}</span>
        `;

        this.toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = "0";

            setTimeout(() => {
                toast.remove();
            }, 300);

        }, duration);
    },

    // -------------------------
    // MODAL
    // -------------------------

    openModal(title, content) {

        if (!this.modal) return;

        this.modalTitle.textContent = title;
        this.modalBody.innerHTML = content;

        this.modal.classList.remove("hidden");
    },

    closeModal() {

        if (!this.modal) return;

        this.modal.classList.add("hidden");
    },

    // -------------------------
    // COMMAND PALETTE
    // -------------------------

    openCommandPalette() {

        const palette = document.getElementById(
            "co-command-palette-modal"
        );

        if (!palette) return;

        palette.classList.remove("hidden");
    },

    closeCommandPalette() {

        const palette = document.getElementById(
            "co-command-palette-modal"
        );

        if (!palette) return;

        palette.classList.add("hidden");
    },

    // -------------------------
    // HELPERS
    // -------------------------

    qs(selector) {
        return document.querySelector(selector);
    },

    qsa(selector) {
        return document.querySelectorAll(selector);
    }
};

// ======================================================
// MODAL EVENTS
// ======================================================

document.addEventListener("DOMContentLoaded", () => {

    const closeBtn =
        document.getElementById(
            "co-global-modal-close-trigger"
        );

    const cancelBtn =
        document.getElementById(
            "co-global-modal-cancel-btn"
        );

    closeBtn?.addEventListener("click", () => {
        UI.closeModal();
    });

    cancelBtn?.addEventListener("click", () => {
        UI.closeModal();
    });

});
