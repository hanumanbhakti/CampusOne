/**
 * =====================================================
 * CAMPUSONE ROUTER ENGINE v1.0.0-PROD
 * Features:
 * - Hash Routing
 * - Sidebar Navigation
 * - Mobile Navigation
 * - Active State Management
 * - Breadcrumb Sync
 * - Invalid Route Protection
 * =====================================================
 */

const MODULES = [
    "dashboard",
    "students",
    "faculty",
    "parents",
    "classes",
    "notices",
    "activity",
    "settings",
    "saas-tenants",
    "saas-billing",
    "saas-subscriptions",
    "saas-admins",
    "saas-usage"
];

const BREADCRUMBS = {
    dashboard: "Dashboard",
    students: "Students",
    faculty: "Faculty",
    parents: "Parents",
    classes: "Classes",
    notices: "Notices",
    activity: "Activity",
    settings: "Settings",
    "saas-tenants": "Tenants",
    "saas-billing": "Billing",
    "saas-subscriptions": "Subscriptions",
    "saas-admins": "Admins",
    "saas-usage": "Usage"
};

/* =====================================================
   INIT
===================================================== */

export function initRouter() {

    bindSidebarNavigation();

    bindMobileNavigation();

    window.addEventListener(
        "hashchange",
        handleHashChange
    );

    const initialRoute =
        window.location.hash.replace("#", "") ||
        "dashboard";

    navigate(initialRoute);
}

/* =====================================================
   NAVIGATION
===================================================== */

export function navigate(moduleName) {

    if (!MODULES.includes(moduleName)) {
        moduleName = "dashboard";
    }

    hideAllModules();

    const target =
        document.getElementById(
            `co-module-${moduleName}`
        );

    if (target) {

        target.style.display = "block";

        target.classList.add("active");
    }

    updateSidebarState(moduleName);

    updateMobileState(moduleName);

    updateBreadcrumb(moduleName);

    closeMobileSidebar();

    if (
        window.location.hash !==
        `#${moduleName}`
    ) {
        history.replaceState(
            null,
            "",
            `#${moduleName}`
        );
    }
}

/* =====================================================
   HASH CHANGE
===================================================== */

function handleHashChange() {

    const route =
        window.location.hash.replace("#", "");

    navigate(route);
}

/* =====================================================
   HIDE ALL MODULES
===================================================== */

function hideAllModules() {

    document
        .querySelectorAll(
            ".co-spa-view-panel-container"
        )
        .forEach(module => {

            module.style.display = "none";

            module.classList.remove(
                "active"
            );
        });
}

/* =====================================================
   SIDEBAR NAV
===================================================== */

function bindSidebarNavigation() {

    document
        .querySelectorAll(
            ".co-sidebar-nav-link"
        )
        .forEach(link => {

            link.addEventListener(
                "click",
                () => {

                    const moduleName =
                        link.dataset.targetModule;

                    if (!moduleName) return;

                    navigate(moduleName);
                }
            );
        });
}

/* =====================================================
   MOBILE NAV
===================================================== */

function bindMobileNavigation() {

    document
        .querySelectorAll(
            ".mobile-nav-tab-trigger"
        )
        .forEach(link => {

            link.addEventListener(
                "click",
                () => {

                    const moduleName =
                        link.dataset.targetMobileModule;

                    if (!moduleName) return;

                    navigate(moduleName);
                }
            );
        });
}

/* =====================================================
   ACTIVE SIDEBAR STATE
===================================================== */

function updateSidebarState(
    activeModule
) {

    document
        .querySelectorAll(
            ".co-sidebar-nav-link"
        )
        .forEach(link => {

            link.classList.remove(
                "active"
            );

            link.setAttribute(
                "aria-selected",
                "false"
            );

            if (
                link.dataset.targetModule ===
                activeModule
            ) {

                link.classList.add(
                    "active"
                );

                link.setAttribute(
                    "aria-selected",
                    "true"
                );
            }
        });
}

/* =====================================================
   ACTIVE MOBILE STATE
===================================================== */

function updateMobileState(
    activeModule
) {

    document
        .querySelectorAll(
            ".mobile-nav-tab-trigger"
        )
        .forEach(link => {

            link.classList.remove(
                "active"
            );

            if (
                link.dataset.targetMobileModule ===
                activeModule
            ) {

                link.classList.add(
                    "active"
                );
            }
        });
}

/* =====================================================
   BREADCRUMB
===================================================== */

function updateBreadcrumb(
    moduleName
) {

    const node =
        document.getElementById(
            "co-breadcrumb-current-leaf"
        );

    if (!node) return;

    node.textContent =
        BREADCRUMBS[moduleName] ||
        "Dashboard";
}

/* =====================================================
   MOBILE SIDEBAR CLOSE
===================================================== */

function closeMobileSidebar() {

    const sidebar =
        document.querySelector(
            ".co-sidebar-shell"
        );

    const overlay =
        document.getElementById(
            "co-sidebar-overlay-backdrop"
        );

    sidebar?.classList.remove(
        "sidebar-open"
    );

    overlay?.classList.remove(
        "active"
    );
}
