/**
 * =====================================================
 * CAMPUSONE MASTER BOOT ENGINE
 * v1.0.0-PROD
 * =====================================================
 */

import { initRouter } from "./core/router.js";
import {
    showToast,
    toggleLoader,
    openCommandPalette,
    closeCommandPalette
} from "./core/ui.js";

/* =====================================================
   GLOBAL DOM REGISTRY
===================================================== */

const DOM = {

    loader:
        document.getElementById("co-global-loader"),

    body:
        document.body,

    html:
        document.documentElement,

    themeToggle:
        document.getElementById("co-theme-mutation-toggle"),

    sidebarToggle:
        document.getElementById("mobile-menu-toggle"),

    sidebarClose:
        document.getElementById("co-mobile-menu-close-btn"),

    sidebar:
        document.getElementById("co-sidebar-navigation-rail"),

    sidebarOverlay:
        document.getElementById("co-sidebar-overlay-backdrop"),

    commandPalette:
        document.getElementById("co-command-palette-modal"),

    commandInput:
        document.getElementById("co-command-palette-input"),

    commandTrigger:
        document.getElementById(
            "co-trigger-omni-palette-click-zone"
        ),

    profileTrigger:
        document.getElementById(
            "co-header-profile-trigger-node"
        ),

    profileDropdown:
        document.getElementById(
            "co-admin-profile-floating-overlay-card"
        ),

    notificationTrigger:
        document.getElementById(
            "co-notification-bell-trigger-btn"
        ),

    notificationDrawer:
        document.getElementById(
            "co-notification-drawer"
        )
};

/* =====================================================
   BOOT
===================================================== */

document.addEventListener(
    "DOMContentLoaded",
    async () => {

        try {

            toggleLoader(true);

            initThemeEngine();

            initRouter();

            await bootSystem();

            toggleLoader(false);

            console.log(
                "CampusOne Boot Completed"
            );

        } catch (err) {

            console.error(err);

            toggleLoader(false);

            showToast(
                "System boot failed",
                "error"
            );
        }
    }
);

/* =====================================================
   SYSTEM BOOT PIPELINE
===================================================== */

async function bootSystem() {

    initSidebarSystem();

    initProfileMenu();

    initNotificationCenter();

    initCommandPalette();

    initPaletteNavigation();

    initGlobalShortcuts();

    initGlobalSearch();

    initModuleObserver();

    initHealthMonitor();
}

/* =====================================================
   THEME ENGINE
===================================================== */

const STORAGE_THEME_KEY =
    "campusone-theme";

function initThemeEngine() {

    const savedTheme =
        localStorage.getItem(
            STORAGE_THEME_KEY
        ) || "dark";

    applyTheme(savedTheme);

    DOM.themeToggle?.addEventListener(
        "click",
        toggleTheme
    );
}

function toggleTheme() {

    const current =
        DOM.html.getAttribute(
            "data-theme"
        ) || "dark";

    const next =
        current === "dark"
            ? "light"
            : "dark";

    applyTheme(next);

    localStorage.setItem(
        STORAGE_THEME_KEY,
        next
    );

    showToast(
        `Theme switched to ${next}`,
        "info"
    );
}

function applyTheme(theme) {

    DOM.html.setAttribute(
        "data-theme",
        theme
    );

    const icon =
        DOM.themeToggle?.querySelector(
            ".theme-icon-slot"
        );

    if (!icon) return;

    icon.textContent =
        theme === "dark"
            ? "🌙"
            : "☀️";
}

/* =====================================================
   MOBILE SIDEBAR SYSTEM
===================================================== */

function initSidebarSystem() {

    DOM.sidebarToggle?.addEventListener(
        "click",
        openSidebar
    );

    DOM.sidebarClose?.addEventListener(
        "click",
        closeSidebar
    );

    DOM.sidebarOverlay?.addEventListener(
        "click",
        closeSidebar
    );
}

function openSidebar() {

    DOM.sidebar?.classList.add(
        "sidebar-open"
    );

    DOM.sidebarOverlay?.classList.add(
        "active"
    );

    document.body.style.overflow =
        "hidden";
}

function closeSidebar() {

    DOM.sidebar?.classList.remove(
        "sidebar-open"
    );

    DOM.sidebarOverlay?.classList.remove(
        "active"
    );

    document.body.style.overflow =
        "";
}


/* =====================================================
   PROFILE MENU
===================================================== */

function initProfileMenu() {

    DOM.profileTrigger?.addEventListener(
        "click",
        (e) => {

            e.stopPropagation();

            DOM.profileDropdown?.classList.toggle(
                "hidden"
            );
        }
    );
}


/* =====================================================
   NOTIFICATION CENTER
===================================================== */

function initNotificationCenter() {

    DOM.notificationTrigger?.addEventListener(
        "click",
        (e) => {

            e.stopPropagation();

            DOM.notificationDrawer?.classList.toggle(
                "hidden"
            );
        }
    );
}


/* =====================================================
   OUTSIDE CLICK DETECTION
===================================================== */

document.addEventListener(
    "click",
    (e) => {

        // Profile Dropdown
        if (
            DOM.profileDropdown &&
            !DOM.profileDropdown.contains(e.target) &&
            !DOM.profileTrigger?.contains(e.target)
        ) {

            DOM.profileDropdown.classList.add(
                "hidden"
            );
        }

        // Notification Drawer
        if (
            DOM.notificationDrawer &&
            !DOM.notificationDrawer.contains(e.target) &&
            !DOM.notificationTrigger?.contains(e.target)
        ) {

            DOM.notificationDrawer.classList.add(
                "hidden"
            );
        }
    }
);

/* =====================================================
   COMMAND PALETTE ENGINE v2
===================================================== */

function initCommandPalette() {

    DOM.commandTrigger?.addEventListener(
        "click",
        openPalette
    );

    DOM.commandInput?.addEventListener(
        "input",
        filterPaletteItems
    );
}

function openPalette() {

    openCommandPalette();

    setTimeout(() => {
        DOM.commandInput?.focus();
    }, 100);
}

function closePalette() {

    closeCommandPalette();

    if (DOM.commandInput) {
        DOM.commandInput.value = "";
    }

    resetPaletteFilter();
}

/* =====================================================
   FILTER EXISTING PALETTE ITEMS
===================================================== */

function filterPaletteItems(e) {

    const query =
        (e.target.value || "")
        .trim()
        .toLowerCase();

    const items =
        document.querySelectorAll(
            ".palette-item"
        );

    items.forEach(item => {

        const text =
            item.textContent
            .trim()
            .toLowerCase();

        item.style.display =
            text.includes(query)
            ? ""
            : "none";
    });
}

function resetPaletteFilter() {

    document
        .querySelectorAll(".palette-item")
        .forEach(item => {

            item.style.display = "";
        });
}

/* =====================================================
   PALETTE NAVIGATION
===================================================== */

function initPaletteNavigation() {

    document
        .querySelectorAll(
            ".palette-item"
        )
        .forEach(item => {

            item.addEventListener(
                "click",
                () => {

                    const route =
                        item.dataset.navTarget;

                    if (route) {

                        navigate(route);

                        closePalette();
                    }
                }
            );
        });
}

/* =====================================================
   GLOBAL SHORTCUTS
===================================================== */

function initGlobalShortcuts() {

    document.addEventListener(
        "keydown",
        (e) => {

            // CTRL + K
            if (
                (e.ctrlKey || e.metaKey) &&
                e.key.toLowerCase() === "k"
            ) {

                e.preventDefault();

                openPalette();

                return;
            }

            // ESC
            if (e.key === "Escape") {

                closePalette();

                closeSidebar();

                DOM.profileDropdown
                    ?.classList.add("hidden");

                DOM.notificationDrawer
                    ?.classList.add("hidden");
            }
        }
    );
}

/* =====================================================
   MODULE REGISTRY ENGINE
===================================================== */

const MODULE_REGISTRY = {

    dashboard: {
        initialized: false,
        init: () => {
            console.log(
                "[MODULE] Dashboard Booted"
            );
        }
    },

    students: {
        initialized: false,
        init: () => {
            console.log(
                "[MODULE] Students Booted"
            );
        }
    },

    faculty: {
        initialized: false,
        init: () => {
            console.log(
                "[MODULE] Faculty Booted"
            );
        }
    },

    parents: {
        initialized: false,
        init: () => {
            console.log(
                "[MODULE] Parents Booted"
            );
        }
    },

    classes: {
        initialized: false,
        init: () => {
            console.log(
                "[MODULE] Classes Booted"
            );
        }
    },

    notices: {
        initialized: false,
        init: () => {
            console.log(
                "[MODULE] Notices Booted"
            );
        }
    },

    activity: {
        initialized: false,
        init: () => {
            console.log(
                "[MODULE] Activity Booted"
            );
        }
    },

    settings: {
        initialized: false,
        init: () => {
            console.log(
                "[MODULE] Settings Booted"
            );
        }
    }
};

/* =====================================================
   MODULE BOOT OBSERVER
===================================================== */

function initModuleObserver() {

    bootCurrentModule();

    window.addEventListener(
        "hashchange",
        bootCurrentModule
    );
}

function bootCurrentModule() {

    const route =
        window.location.hash
            .replace("#", "") ||
        "dashboard";

    const module =
        MODULE_REGISTRY[route];

    if (!module) return;

    if (module.initialized)
        return;

    try {

        module.init();

        module.initialized = true;

        console.log(
            `[BOOT] ${route}`
        );

    } catch (err) {

        console.error(
            `[BOOT FAILED] ${route}`,
            err
        );
    }
}

/* =====================================================
   SYSTEM HEALTH
===================================================== */

function initHealthMonitor() {

    const health =
        document.getElementById(
            "co-health-live-percentage"
        );

    if (!health) return;

    health.textContent = "100%";
}


