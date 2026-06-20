/**
 * =========================================================================
 * CAMPUSONE — STUDENT DASHBOARD CONTROLLER
 * =========================================================================
 * Built only "Dashboard Home" with real content for this pass (per the
 * Phase 2 roadmap). Every other sidebar module renders a translated
 * placeholder view that lists its planned sub-features and phase, instead
 * of a dead link to a page that doesn't exist yet.
 */

import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";
import {
  doc, getDoc,
  collection, query, orderBy, limit, where, getDocs
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

// ⚠️ ADJUST THIS PATH if firebase-config.js doesn't live one folder above
// student-dashboard/ in your real project tree. It currently assumes:
//   /<login-folder>/firebase-config.js
//   /student-dashboard/index.html  (this file's folder)
// Consider moving firebase-config.js into a shared folder (e.g. /assets/js/)
// once you build the teacher/parent/admin dashboards too, so it's imported
// from one place instead of duplicated/guessed per dashboard.
import { auth, db } from "../firebase-config.js";

document.addEventListener("DOMContentLoaded", () => {

    // --- 1. SIDEBAR NAV DATA (data-driven so the 16-module tree stays
    // translatable and maintainable instead of 16 hand-written HTML blocks) ---
    const ICONS = {
        home: '<path d="M3 9l9-7 9 7"/><path d="M9 22V12h6v10"/>',
        user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
        book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
        checkSquare: '<polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
        clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M9 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3"/>',
        fileText: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/>',
        clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
        creditCard: '<rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>',
        bookOpen: '<path d="M2 4h7a4 4 0 0 1 4 4v12a3 3 0 0 0-3-3H2z"/><path d="M22 4h-7a4 4 0 0 0-4 4v12a3 3 0 0 1 3-3h8z"/>',
        bell: '<path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
        messageCircle: '<path d="M21 11.5a8.38 8.38 0 0 1-3.8 7.6L3 21l1.9-5.7A8.38 8.38 0 0 1 21 11.5z"/>',
        briefcase: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
        users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
        sparkles: '<path d="M12 2l1.5 4.5L18 8l-4.5 1.5L12 14l-1.5-4.5L6 8l4.5-1.5z"/><path d="M19 15l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>',
        calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
        shield: '<path d="M12 2 4 5v6c0 5.25 3.4 9.74 8 11 4.6-1.26 8-5.75 8-11V5z"/>'
    };

    const NAV_CONFIG = [
        { id: "dashboard-home", labelKey: "sidebarDashboard", icon: ICONS.home, phase: 2, isHome: true },
        { id: "profile", labelKey: "sidebarProfile", icon: ICONS.user, phase: 2, children: [
            { id: "personal-details", labelKey: "personalDetails" },
            { id: "guardian-details", labelKey: "guardianDetails" },
            { id: "documents", labelKey: "documents" },
            { id: "id-card", labelKey: "idCard" },
            { id: "settings", labelKey: "settings" }
        ]},
        { id: "academics", labelKey: "sidebarAcademics", icon: ICONS.book, phase: 3, children: [
            { id: "courses", labelKey: "courses" },
            { id: "subjects", labelKey: "subjects" },
            { id: "syllabus", labelKey: "syllabus" },
            { id: "study-materials", labelKey: "studyMaterials" },
            { id: "notes-pdfs", labelKey: "notesPdfs" },
            { id: "recorded-lectures", labelKey: "recordedLectures" }
        ]},
        { id: "attendance", labelKey: "sidebarAttendance", icon: ICONS.checkSquare, phase: 2, children: [
            { id: "overall-attendance", labelKey: "overallAttendance" },
            { id: "subject-wise-attendance", labelKey: "subjectWiseAttendance" },
            { id: "monthly-report", labelKey: "monthlyReport" },
            { id: "attendance-analytics", labelKey: "attendanceAnalytics" }
        ]},
        { id: "assignments", labelKey: "sidebarAssignments", icon: ICONS.clipboard, phase: 3, children: [
            { id: "active-assignments", labelKey: "activeAssignments" },
            { id: "submission-upload", labelKey: "submissionUpload" },
            { id: "submitted-work", labelKey: "submittedWork" },
            { id: "teacher-feedback", labelKey: "teacherFeedback" }
        ]},
        { id: "examinations", labelKey: "sidebarExaminations", icon: ICONS.fileText, phase: 4, children: [
            { id: "exam-schedule", labelKey: "examSchedule" },
            { id: "admit-card", labelKey: "admitCard" },
            { id: "exam-results", labelKey: "examResults" },
            { id: "marksheets", labelKey: "marksheets" },
            { id: "performance-analysis", labelKey: "performanceAnalysis" }
        ]},
        { id: "timetable", labelKey: "sidebarTimetable", icon: ICONS.clock, phase: 3, children: [
            { id: "daily-schedule", labelKey: "dailySchedule" },
            { id: "weekly-schedule", labelKey: "weeklySchedule" },
            { id: "upcoming-classes", labelKey: "upcomingClasses" }
        ]},
        { id: "fees-finance", labelKey: "sidebarFeesFinance", icon: ICONS.creditCard, phase: 4, children: [
            { id: "fee-status", labelKey: "feeStatus" },
            { id: "payment-history", labelKey: "paymentHistory" },
            { id: "receipts", labelKey: "receipts" },
            { id: "scholarship-status", labelKey: "scholarshipStatus" }
        ]},
        { id: "library", labelKey: "sidebarLibrary", icon: ICONS.bookOpen, phase: 5, children: [
            { id: "issued-books", labelKey: "issuedBooks" },
            { id: "due-books", labelKey: "dueBooks" },
            { id: "digital-library", labelKey: "digitalLibrary" },
            { id: "book-search", labelKey: "bookSearch" }
        ]},
        { id: "notices", labelKey: "sidebarNotices", icon: ICONS.bell, phase: 2, children: [
            { id: "campus-notices", labelKey: "campusNotices" },
            { id: "department-notices", labelKey: "departmentNotices" },
            { id: "emergency-alerts", labelKey: "emergencyAlerts" }
        ]},
        { id: "communication", labelKey: "sidebarCommunication", icon: ICONS.messageCircle, phase: 5, children: [
            { id: "messages", labelKey: "messages" },
            { id: "teacher-chat", labelKey: "teacherChat" },
            { id: "discussion-forum", labelKey: "discussionForum" },
            { id: "support-tickets", labelKey: "supportTickets" }
        ]},
        { id: "career-placement", labelKey: "sidebarCareerPlacement", icon: ICONS.briefcase, phase: 6, children: [
            { id: "internships", labelKey: "internships" },
            { id: "job-opportunities", labelKey: "jobOpportunities" },
            { id: "resume-builder", labelKey: "resumeBuilder" },
            { id: "certifications", labelKey: "certifications" },
            { id: "skill-development", labelKey: "skillDevelopment" }
        ]},
        { id: "campus-activities", labelKey: "sidebarCampusActivities", icon: ICONS.users, phase: 5, children: [
            { id: "events", labelKey: "events" },
            { id: "clubs", labelKey: "clubs" },
            { id: "competitions", labelKey: "competitions" },
            { id: "event-registration", labelKey: "eventRegistration" }
        ]},
        { id: "ai-assistant", labelKey: "sidebarAiAssistant", icon: ICONS.sparkles, phase: 6, children: [
            { id: "academic-help", labelKey: "academicHelp" },
            { id: "study-planner", labelKey: "studyPlanner" },
            { id: "ai-performance-analysis", labelKey: "aiPerformanceAnalysis" },
            { id: "personalized-suggestions", labelKey: "personalizedSuggestions" }
        ]},
        { id: "calendar", labelKey: "sidebarCalendar", icon: ICONS.calendar, phase: 3, children: [
            { id: "exams-cal", labelKey: "examsCal" },
            { id: "assignment-deadlines", labelKey: "assignmentDeadlines" },
            { id: "events-cal", labelKey: "eventsCal" },
            { id: "reminders", labelKey: "reminders" }
        ]},
        { id: "security", labelKey: "sidebarSecurity", icon: ICONS.shield, phase: 2, children: [
            { id: "login-history", labelKey: "loginHistory" },
            { id: "active-sessions", labelKey: "activeSessions" },
            { id: "device-management", labelKey: "deviceManagement" },
            { id: "password-settings", labelKey: "passwordSettings" },
            { id: "two-factor-auth", labelKey: "twoFactorAuth" }
        ]}
    ];

    // Role → its own dashboard route, mirroring CampusOS.roleContexts on the login screen.
    const ROLE_ROUTES = {
        student: "./index.html",
        teacher: "../teacher-dashboard/index.html",
        parent: "../parent-dashboard/index.html",
        admin: "../admin-dashboard/index.html"
    };
    // ⚠️ ADJUST to match your real login folder name.
    const LOGIN_ROUTE = "../login/index.html";

    const state = {
        currentLanguage: localStorage.getItem("campusone-language") || "en",
        currentUid: null,
        currentRole: "student"
    };

    const translations = {
        en: {
            sidebarDashboard: "Dashboard Home", logout: "Log Out", searchMenu: "Search menu",
            studentWorkspace: "Student Workspace", student: "Student",
            attendanceRate: "Attendance Rate", currentCgpa: "CGPA",
            pendingAssignments: "Pending Assignments", feesStatus: "Fees Status",
            newNotifications: "New Notifications", welcomeBackName: "Welcome back!",
            welcomeBannerSub: "Here's what's happening with your academics today.",
            academicProgress: "Academic Progress", cgpaBySemester: "CGPA by semester",
            noProgressData: "No academic history yet — this will populate once semester results are added.",
            recentActivities: "Recent Activities", noRecentActivity: "No recent activity yet.",
            backToDashboard: "Back to Dashboard", comingSoon: "Coming Soon",
            phaseLabel: "Phase {n} · Coming Soon", modulePlaceholderDesc: "This module isn't built yet. Here's what's planned for it:"
        },
        hi: {}
    };

    async function loadLocale(lang) {
        try {
            const res = await fetch(`./locales/${lang}.json`, { cache: "no-cache" });
            if (!res.ok) throw new Error(`Locale responded ${res.status}`);
            translations[lang] = await res.json();
        } catch (err) {
            console.warn(`[StudentDashboard i18n] Could not load locales/${lang}.json, using fallback strings.`, err);
        }
    }

    function t(key, fallback) {
        const pack = translations[state.currentLanguage] || {};
        return pack[key] || translations.en[key] || fallback || key;
    }

    function applyTranslations() {
        document.documentElement.setAttribute("lang", state.currentLanguage);
        document.querySelectorAll("[data-i18n]").forEach(el => {
            const key = el.dataset.i18n;
            const val = t(key, null);
            if (val) el.textContent = val;
        });
        document.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
            const key = el.dataset.i18nPlaceholder;
            const val = t(key, null);
            if (val) el.placeholder = val;
        });
        renderSidebarNav(); // labels live inside generated nodes, so re-render on language change
    }

    async function switchLanguage(lang) {
        if (!translations[lang] || Object.keys(translations[lang]).length === 0) {
            await loadLocale(lang);
        }
        state.currentLanguage = lang;
        localStorage.setItem("campusone-language", lang);
        applyTranslations();
    }

    // --- 2. DOM REFS ---
    const DOM = {
        shell: document.getElementById("app-shell"),
        sidebar: document.getElementById("app-sidebar"),
        navList: document.getElementById("sidebar-nav-list"),
        navFilter: document.getElementById("sidebar-nav-filter"),
        collapseBtn: document.getElementById("sidebar-collapse-btn"),
        toggleBtn: document.getElementById("sidebar-toggle-btn"),
        scrim: document.getElementById("sidebar-scrim"),
        logoutBtn: document.getElementById("sidebar-logout-btn"),
        themeTrigger: document.getElementById("theme-toggle-trigger"),
        pageTitle: document.getElementById("page-title"),
        userAvatar: document.getElementById("topbar-user-avatar"),
        userName: document.getElementById("topbar-user-name"),
        userMeta: document.getElementById("topbar-user-meta"),
        bellBtn: document.getElementById("notif-bell-btn"),
        bellBadge: document.getElementById("notif-bell-badge"),
        homeView: document.getElementById("view-dashboard-home"),
        genericView: document.getElementById("view-generic-module"),
        placeholderIcon: document.getElementById("module-placeholder-icon"),
        placeholderTitle: document.getElementById("module-placeholder-title"),
        placeholderDesc: document.getElementById("module-placeholder-desc"),
        placeholderPhase: document.getElementById("module-placeholder-phase"),
        placeholderSublist: document.getElementById("module-placeholder-sublist"),
        greeting: document.getElementById("welcome-banner-greeting"),
        bannerDate: document.getElementById("welcome-banner-date"),
        bannerRolePill: document.getElementById("welcome-banner-role-pill"),
        statAttendance: document.getElementById("stat-attendance-value"),
        statCgpa: document.getElementById("stat-cgpa-value"),
        statAssignments: document.getElementById("stat-assignments-value"),
        statFees: document.getElementById("stat-fees-value"),
        statNotifications: document.getElementById("stat-notifications-value"),
        chartMount: document.getElementById("progress-chart-mount"),
        activityList: document.getElementById("recent-activity-list")
    };

    // --- 3. THEME (shares the same localStorage key as the login screen) ---
    function initTheme() {
        const saved = localStorage.getItem("co-gateway-theme") || "dark";
        document.documentElement.setAttribute("data-theme", saved);
        if (DOM.themeTrigger) DOM.themeTrigger.setAttribute("data-current-theme", saved);
        DOM.themeTrigger?.addEventListener("click", () => {
            const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
            document.documentElement.setAttribute("data-theme", next);
            localStorage.setItem("co-gateway-theme", next);
            DOM.themeTrigger.setAttribute("data-current-theme", next);
        });
    }

    // --- 4. LANGUAGE TOGGLE BUTTONS (topbar) ---
    function initLanguageButtons() {
        document.querySelectorAll(".lang-node").forEach(btn => {
            btn.addEventListener("click", () => {
                document.querySelectorAll(".lang-node").forEach(b => {
                    b.classList.toggle("state-active", b === btn);
                    if (b === btn) b.setAttribute("aria-current", "true"); else b.removeAttribute("aria-current");
                });
                switchLanguage(btn.dataset.langTarget);
            });
            if (btn.dataset.langTarget === state.currentLanguage) {
                btn.classList.add("state-active");
                btn.setAttribute("aria-current", "true");
            }
        });
    }

    // --- 5. SIDEBAR: render, collapse, mobile toggle, filter ---
    let activeViewKey = "dashboard-home"; // "<groupId>" or "<groupId>/<childId>"

    function renderSidebarNav() {
        DOM.navList.innerHTML = "";
        NAV_CONFIG.forEach(group => {
            const groupEl = document.createElement("div");
            groupEl.className = "nav-group";
            groupEl.dataset.groupId = group.id;

            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "nav-group-btn";
            btn.innerHTML = `
                <span class="nav-group-icon"><svg viewBox="0 0 24 24">${group.icon}</svg></span>
                <span class="nav-group-label-text">${escapeHtml(t(group.labelKey, group.id))}</span>
                ${group.children ? '<svg class="nav-group-chevron" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>' : ""}
            `;
            btn.addEventListener("click", () => {
                if (group.isHome) { openHomeView(); return; }
                if (!group.children) return;
                groupEl.classList.toggle("is-open");
            });
            groupEl.appendChild(btn);

            if (group.children) {
                const childWrap = document.createElement("div");
                childWrap.className = "nav-children";
                group.children.forEach(child => {
                    const childBtn = document.createElement("button");
                    childBtn.type = "button";
                    childBtn.className = "nav-child-btn";
                    childBtn.textContent = t(child.labelKey, child.id);
                    childBtn.dataset.viewKey = `${group.id}/${child.id}`;
                    childBtn.addEventListener("click", () => openModuleView(group, child));
                    childWrap.appendChild(childBtn);
                });
                groupEl.appendChild(childWrap);
            }

            DOM.navList.appendChild(groupEl);
        });
        highlightActiveNav();
    }

    function highlightActiveNav() {
        document.querySelectorAll(".nav-group-btn").forEach(b => b.classList.remove("is-current"));
        document.querySelectorAll(".nav-child-btn").forEach(b => b.classList.remove("is-current"));
        if (activeViewKey === "dashboard-home") {
            DOM.navList.querySelector('.nav-group[data-group-id="dashboard-home"] .nav-group-btn')?.classList.add("is-current");
            return;
        }
        const activeChild = DOM.navList.querySelector(`.nav-child-btn[data-view-key="${activeViewKey}"]`);
        if (activeChild) {
            activeChild.classList.add("is-current");
            activeChild.closest(".nav-group")?.classList.add("is-open");
        }
    }

    function escapeHtml(str) {
        return String(str).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    }

    function initSidebarChrome() {
        const collapsedSaved = localStorage.getItem("co-sidebar-collapsed") === "true";
        if (collapsedSaved) DOM.shell.classList.add("is-sidebar-collapsed");

        DOM.collapseBtn?.addEventListener("click", () => {
            DOM.shell.classList.toggle("is-sidebar-collapsed");
            localStorage.setItem("co-sidebar-collapsed", DOM.shell.classList.contains("is-sidebar-collapsed"));
        });

        DOM.toggleBtn?.addEventListener("click", () => {
            DOM.shell.classList.add("is-sidebar-open");
            DOM.scrim.hidden = false;
        });
        DOM.scrim?.addEventListener("click", closeMobileSidebar);

        DOM.navFilter?.addEventListener("input", (e) => {
            const term = e.target.value.trim().toLowerCase();
            document.querySelectorAll(".nav-group").forEach(groupEl => {
                const groupText = groupEl.querySelector(".nav-group-label-text")?.textContent.toLowerCase() || "";
                const childButtons = Array.from(groupEl.querySelectorAll(".nav-child-btn"));
                const childMatches = childButtons.filter(c => c.textContent.toLowerCase().includes(term));
                const groupMatches = groupText.includes(term);
                const anyMatch = !term || groupMatches || childMatches.length > 0;
                groupEl.style.display = anyMatch ? "" : "none";
                childButtons.forEach(c => { c.style.display = (!term || c.textContent.toLowerCase().includes(term) || groupMatches) ? "" : "none"; });
                if (term && childMatches.length > 0) groupEl.classList.add("is-open");
            });
        });

        DOM.logoutBtn?.addEventListener("click", handleLogout);
    }

    function closeMobileSidebar() {
        DOM.shell.classList.remove("is-sidebar-open");
        DOM.scrim.hidden = true;
    }

    // --- 6. VIEW ROUTING ---
    function openHomeView() {
        activeViewKey = "dashboard-home";
        DOM.homeView.classList.add("is-active-view");
        DOM.genericView.classList.remove("is-active-view");
        DOM.pageTitle.textContent = t("sidebarDashboard", "Dashboard Home");
        history.replaceState(null, "", "#dashboard-home");
        highlightActiveNav();
        closeMobileSidebar();
    }

    function openModuleView(group, child) {
        activeViewKey = `${group.id}/${child.id}`;
        DOM.homeView.classList.remove("is-active-view");
        DOM.genericView.classList.add("is-active-view");

        const groupLabel = t(group.labelKey, group.id);
        DOM.pageTitle.textContent = groupLabel;
        DOM.placeholderIcon.innerHTML = `<svg viewBox="0 0 24 24">${group.icon}</svg>`;
        DOM.placeholderTitle.textContent = groupLabel;
        DOM.placeholderDesc.textContent = t("modulePlaceholderDesc", "This module isn't built yet. Here's what's planned for it:");
        DOM.placeholderPhase.textContent = t("phaseLabel", "Phase {n} · Coming Soon").replace("{n}", group.phase);

        DOM.placeholderSublist.innerHTML = "";
        group.children.forEach(c => {
            const li = document.createElement("li");
            li.textContent = t(c.labelKey, c.id);
            if (c.id === child.id) li.style.color = "var(--brand-accent)";
            DOM.placeholderSublist.appendChild(li);
        });

        history.replaceState(null, "", `#${activeViewKey}`);
        highlightActiveNav();
        closeMobileSidebar();
    }

    function restoreViewFromHash() {
        const hash = location.hash.replace("#", "");
        if (!hash || hash === "dashboard-home") { openHomeView(); return; }
        const [groupId, childId] = hash.split("/");
        const group = NAV_CONFIG.find(g => g.id === groupId);
        const child = group?.children?.find(c => c.id === childId);
        if (group && child) openModuleView(group, child);
        else openHomeView();
    }

    document.querySelectorAll('[data-action="go-home"]').forEach(btn => btn.addEventListener("click", openHomeView));

    // --- 7. AUTH GUARD + PROFILE LOADING ---
    function initAuthGuard() {
        onAuthStateChanged(auth, async (user) => {
            if (!user) {
                window.location.href = LOGIN_ROUTE;
                return;
            }
            state.currentUid = user.uid;
            await loadUserProfile(user);
        });
    }

    async function loadUserProfile(firebaseUser) {
        // "users" doc carries the role + shared identity fields, same pattern
        // the login screen relies on for role routing.
        let userData = {};
        try {
            const userSnap = await getDoc(doc(db, "users", firebaseUser.uid));
            if (userSnap.exists()) userData = userSnap.data();
        } catch (err) {
            console.warn("[StudentDashboard] Could not read users/{uid}:", err);
        }

        state.currentRole = userData.role || "student";

        // Guard rail: if this account's role isn't student, send them to their own dashboard
        // instead of letting them sit on a screen meant for someone else.
        if (state.currentRole !== "student" && ROLE_ROUTES[state.currentRole]) {
            window.location.href = ROLE_ROUTES[state.currentRole];
            return;
        }

        const displayName = userData.name || firebaseUser.displayName || firebaseUser.email?.split("@")[0] || "Student";
        DOM.userName.textContent = displayName;
        DOM.userMeta.textContent = userData.rollNumber ? `#${userData.rollNumber}` : (firebaseUser.email || "");
        DOM.greeting.textContent = `${t("welcomeBackName", "Welcome back")}, ${displayName.split(" ")[0]}!`;

        const photo = userData.photoURL || firebaseUser.photoURL;
        if (photo) {
            DOM.userAvatar.innerHTML = `<img src="${photo}" alt="${escapeHtml(displayName)}">`;
        } else {
            DOM.userAvatar.textContent = displayName.charAt(0).toUpperCase();
        }

        DOM.bannerDate.textContent = new Intl.DateTimeFormat(state.currentLanguage === "hi" ? "hi-IN" : "en-IN", {
            weekday: "long", day: "numeric", month: "long"
        }).format(new Date());

        // "students" collection: assumed to hold a denormalized summary doc keyed
        // by uid (cgpa, attendancePercent, pendingAssignmentsCount, feesStatus,
        // semesterHistory[]). Adjust field names below, or replace with real
        // aggregation queries over attendance/submissions/fees, to match your schema.
        let studentData = {};
        try {
            const studentSnap = await getDoc(doc(db, "students", firebaseUser.uid));
            if (studentSnap.exists()) studentData = studentSnap.data();
        } catch (err) {
            console.warn("[StudentDashboard] Could not read students/{uid}:", err);
        }

        renderStatCards(studentData);
        renderProgressChart(studentData.semesterHistory || []);
        loadRecentActivity(firebaseUser.uid);
    }

    function renderStatCards(s) {
        DOM.statAttendance.textContent = isFinite(s.attendancePercent) ? `${s.attendancePercent}%` : "--";
        DOM.statCgpa.textContent = s.cgpa != null ? s.cgpa : "--";
        DOM.statAssignments.textContent = s.pendingAssignmentsCount != null ? s.pendingAssignmentsCount : "--";
        DOM.statFees.textContent = s.feesStatus || "--";
        // Notification count gets filled in by loadRecentActivity() once notices resolve.
    }

    function renderProgressChart(history) {
        if (!Array.isArray(history) || history.length === 0) return; // keep the empty-state markup already in the HTML
        const w = 560, h = 200, pad = 28;
        const cgpas = history.map(p => Number(p.cgpa) || 0);
        const max = Math.max(10, ...cgpas);
        const stepX = (w - pad * 2) / Math.max(1, history.length - 1);

        const points = history.map((p, i) => {
            const x = pad + i * stepX;
            const y = h - pad - ((Number(p.cgpa) || 0) / max) * (h - pad * 2);
            return `${x},${y}`;
        }).join(" ");

        const dots = history.map((p, i) => {
            const x = pad + i * stepX;
            const y = h - pad - ((Number(p.cgpa) || 0) / max) * (h - pad * 2);
            return `<circle cx="${x}" cy="${y}" r="4" fill="#2563EB"/><text x="${x}" y="${h - 6}" font-size="10" fill="var(--text-muted)" text-anchor="middle">${escapeHtml(p.semester ?? i + 1)}</text>`;
        }).join("");

        DOM.chartMount.innerHTML = `
            <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
                <polyline points="${points}" fill="none" stroke="#2563EB" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                ${dots}
            </svg>`;
    }

    async function loadRecentActivity(uid) {
        const items = [];

        // "notices" collection: campus-wide notices, newest first.
        try {
            const noticesQuery = query(collection(db, "notices"), orderBy("createdAt", "desc"), limit(5));
            const noticesSnap = await getDocs(noticesQuery);
            noticesSnap.forEach(d => {
                const n = d.data();
                items.push({ text: n.title || n.message || "New notice", time: n.createdAt, type: "notice" });
            });
        } catch (err) {
            console.warn("[StudentDashboard] Could not read notices:", err);
        }

        // "results" collection: scoped to this student, newest first.
        try {
            const resultsQuery = query(collection(db, "results"), where("studentId", "==", uid), orderBy("issuedAt", "desc"), limit(3));
            const resultsSnap = await getDocs(resultsQuery);
            resultsSnap.forEach(d => {
                const r = d.data();
                items.push({ text: `Result published: ${r.examName || "Exam"}`, time: r.issuedAt, type: "result" });
            });
        } catch (err) {
            console.warn("[StudentDashboard] Could not read results:", err);
        }

        DOM.statNotifications.textContent = items.length || "0";
        if (items.length > 0 && items.length <= 9) {
            DOM.bellBadge.textContent = items.length;
            DOM.bellBadge.hidden = false;
        }

        items.sort((a, b) => (toMillis(b.time)) - (toMillis(a.time)));
        renderActivityList(items.slice(0, 6));
    }

    function toMillis(ts) {
        if (!ts) return 0;
        if (typeof ts.toMillis === "function") return ts.toMillis(); // Firestore Timestamp
        return new Date(ts).getTime() || 0;
    }

    function renderActivityList(items) {
        DOM.activityList.innerHTML = "";
        if (items.length === 0) {
            DOM.activityList.innerHTML = `<li class="empty-state-text" style="padding:10px 0;">${escapeHtml(t("noRecentActivity", "No recent activity yet."))}</li>`;
            return;
        }
        items.forEach(item => {
            const li = document.createElement("li");
            li.className = "activity-item";
            const ms = toMillis(item.time);
            const timeLabel = ms ? new Date(ms).toLocaleDateString(state.currentLanguage === "hi" ? "hi-IN" : "en-IN", { day: "numeric", month: "short" }) : "";
            li.innerHTML = `<span class="activity-dot"></span><span class="activity-text">${escapeHtml(item.text)}<span class="activity-time">${escapeHtml(timeLabel)}</span></span>`;
            DOM.activityList.appendChild(li);
        });
    }

    async function handleLogout() {
        try {
            await signOut(auth);
        } finally {
            window.location.href = LOGIN_ROUTE;
        }
    }

    // --- 8. BOOT ---
    async function boot() {
        initTheme();
        await loadLocale(state.currentLanguage);
        applyTranslations();
        initLanguageButtons();
        initSidebarChrome();
        renderSidebarNav();
        restoreViewFromHash();
        window.addEventListener("hashchange", restoreViewFromHash);
        initAuthGuard();
        console.log("[CampusOne] Student dashboard initialized.");
    }

    boot();
});
