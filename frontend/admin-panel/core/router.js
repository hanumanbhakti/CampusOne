// core/router.js

const MODULES = [
    "dashboard",
    "students",
    "faculty",
    "parents",
    "classes",
    "notices",
    "activity",
    "settings"
];

export function initRouter() {

    bindNavigation();

    const route =
        window.location.hash.replace("#", "") ||
        "dashboard";

    navigate(route);

    window.addEventListener(
        "hashchange",
        () => {

            const current =
                window.location.hash.replace("#", "");

            navigate(current);
        }
    );
}

export function navigate(moduleName) {

    if (!MODULES.includes(moduleName))
        moduleName = "dashboard";

    hideAllModules();

    const section =
        document.getElementById(
            `co-module-${moduleName}`
        );

    if (section)
        section.style.display = "block";

    updateActiveNavigation(moduleName);

    updateBreadcrumb(moduleName);

    window.location.hash = moduleName;
}
