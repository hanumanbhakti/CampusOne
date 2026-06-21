/**
 * =========================================================================
 * CAMPUSONE — TEACHER DASHBOARD CONTROLLER
 * =========================================================================
 * Mirrors the structure of student-dashboard/script.js (same NAV_CONFIG
 * pattern, same hash-routing, same i18n/theme system) so the two dashboards
 * stay maintainable side by side. Only "Dashboard Home" and "Profile" carry
 * real Firestore-backed content in this pass — every other sidebar module
 * renders a translated placeholder that lists its planned sub-features and
 * phase, exactly like the student dashboard does for its unbuilt modules.
 *
 * Firestore shape this file expects (per the agreed enterprise schema):
 *   users/{uid}              -> { role: "teacher", ... }
 *   teachers/{uid}            -> { identity{}, professional{}, contact{},
 *                                  social{}, system{} }
 *   teacherAssignments        -> docs with { teacherId, courseName,
 *                                  subjectName, sectionName, semesterName,
 *                                  batchName, isActive }
 *   notices                   -> docs with { title, message, createdAt }
 *
 * Stats (totalStudents, totalClasses, assignmentsCreated, attendancePending,
 * noticesPublished, averageFeedbackRating) are intentionally left as "--"
 * placeholders for this pass — they should be written by a Cloud Function
 * aggregator later (see teacherStats/{teacherId} in the schema discussion),
 * not computed ad-hoc on every dashboard load.
 */

import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";
import {
  doc, getDoc,
  collection, query, where, orderBy, limit, getDocs
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

// ⚠️ ADJUST THIS PATH if firebase-config.js doesn't live one folder above
// teacher-dashboard/ in your real project tree. It currently assumes:
//   /<login-folder>/firebase-config.js
//   /teacher-dashboard/index.html  (this file's folder)
import { auth, db } from "../login-screen/firebase-config.js";

document.addEventListener("DOMContentLoaded", () => {

    // --- 1. SIDEBAR NAV DATA ---
    // 12 modules per the CampusOne teacher-dashboard roadmap. Each becomes a
    // translated placeholder view until its real module is built, except
    // "profile" which routes to the real Profile view below.
    const ICONS = {
        home: '<path d="M3 9l9-7 9 7"/><path d="M9 22V12h6v10"/>',
        user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
        checkSquare: '<polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
        clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M9 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3"/>',
        edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>',
        fileText: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/>',
        calendarCheck: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M9 16l2 2 4-4"/>',
        bell: '<path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
        barChart: '<line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/>',
        sparkles: '<path d="M12 2l1.5 4.5L18 8l-4.5 1.5L12 14l-1.5-4.5L6 8l4.5-1.5z"/><path d="M19 15l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>',
        clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
        award: '<circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/>',
        building: '<rect x="4" y="2" width="16" height="20" rx="1"/><line x1="9" y1="22" x2="9" y2="18"/><line x1="15" y1="22" x2="15" y2="18"/><line x1="9" y1="6" x2="9" y2="6"/><line x1="15" y1="6" x2="15" y2="6"/><line x1="9" y1="10" x2="9" y2="10"/><line x1="15" y1="10" x2="15" y2="10"/><line x1="9" y1="14" x2="9" y2="14"/><line x1="15" y1="14" x2="15" y2="14"/>'
    };

    const NAV_CONFIG = [
        { id: "dashboard-home", labelKey: "sidebarDashboard", icon: ICONS.home, phase: 2, isHome: true },
        { id: "profile", labelKey: "sidebarProfile", icon: ICONS.user, phase: 2, isProfile: true, children: [
            { id: "personal-details", labelKey: "personalDetails" },
            { id: "professional-details", labelKey: "professionalDetails" },
            { id: "contact-details", labelKey: "contactDetails" },
            { id: "academic-load", labelKey: "academicLoad" }
        ]},
        { id: "attendance", labelKey: "sidebarAttendance", icon: ICONS.checkSquare, phase: 3, children: [
            { id: "take-attendance", labelKey: "takeAttendance" },
            { id: "attendance-history", labelKey: "attendanceHistory" },
            { id: "attendance-reports", labelKey: "attendanceReports" }
        ]},
        { id: "assignments", labelKey: "sidebarAssignments", icon: ICONS.clipboard, phase: 3, children: [
            { id: "create-assignment", labelKey: "createAssignment" },
            { id: "manage-assignments", labelKey: "manageAssignments" },
            { id: "review-submissions", labelKey: "reviewSubmissions" }
        ]},
        { id: "marks-entry", labelKey: "sidebarMarksEntry", icon: ICONS.edit, phase: 4, children: [
            { id: "enter-marks", labelKey: "enterMarks" },
            { id: "marks-history", labelKey: "marksHistory" },
            { id: "moderation-requests", labelKey: "moderationRequests" }
        ]},
        { id: "results", labelKey: "sidebarResults", icon: ICONS.fileText, phase: 4, children: [
            { id: "generate-result", labelKey: "generateResult" },
            { id: "published-results", labelKey: "publishedResults" },
            { id: "result-analytics", labelKey: "resultAnalytics" }
        ]},
        { id: "leave-approval", labelKey: "sidebarLeaveApproval", icon: ICONS.calendarCheck, phase: 3, children: [
            { id: "pending-requests", labelKey: "pendingRequests" },
            { id: "approved-leaves", labelKey: "approvedLeaves" },
            { id: "leave-history", labelKey: "leaveHistory" }
        ]},
        { id: "notices", labelKey: "sidebarNotices", icon: ICONS.bell, phase: 2, children: [
            { id: "publish-notice", labelKey: "publishNotice" },
            { id: "my-notices", labelKey: "myNotices" },
            { id: "department-notices", labelKey: "departmentNotices" }
        ]},
        { id: "student-analytics", labelKey: "sidebarStudentAnalytics", icon: ICONS.barChart, phase: 5, children: [
            { id: "performance-overview", labelKey: "performanceOverview" },
            { id: "at-risk-students", labelKey: "atRiskStudents" },
            { id: "class-comparison", labelKey: "classComparison" }
        ]},
        { id: "ai-assistant", labelKey: "sidebarAiAssistant", icon: ICONS.sparkles, phase: 6, children: [
            { id: "lesson-planner", labelKey: "lessonPlanner" },
            { id: "question-generator", labelKey: "questionGenerator" },
            { id: "grading-assistant", labelKey: "gradingAssistant" }
        ]},
        { id: "timetable", labelKey: "sidebarTimetable", icon: ICONS.clock, phase: 3, children: [
            { id: "daily-schedule", labelKey: "dailySchedule" },
            { id: "weekly-schedule", labelKey: "weeklySchedule" },
            { id: "substitution-requests", labelKey: "substitutionRequests" }
        ]},
        { id: "performance-reports", labelKey: "sidebarPerformanceReports", icon: ICONS.award, phase: 5, children: [
            { id: "my-performance", labelKey: "myPerformance" },
            { id: "feedback-summary", labelKey: "feedbackSummary" },
            { id: "appraisal-history", labelKey: "appraisalHistory" }
        ]},
        { id: "department-dashboard", labelKey: "sidebarDepartmentDashboard", icon: ICONS.building, phase: 5, children: [
            { id: "department-overview", labelKey: "departmentOverview" },
            { id: "faculty-list", labelKey: "facultyList" },
            { id: "department-notices-board", labelKey: "departmentNoticesBoard" }
        ]}
    ];

    // Role → its own dashboard route, mirroring CampusOS.roleContexts on the login screen.
    const ROLE_ROUTES = {
        student: "../student-dashboard/index.html",
        teacher: "./index.html",
        parent: "../parent-dashboard/index.html",
        admin: "../admin-dashboard/index.html"
    };
    // ⚠️ ADJUST to match your real login folder name.
    const LOGIN_ROUTE = "../login-screen/index.html";

    const state = {
        currentLanguage: localStorage.getItem("campusone-language") || "en",
        currentUid: null,
        currentRole: "teacher",
        currentDisplayName: null
    };

    const translations = {
        en: {
            sidebarDashboard: "Dashboard Home", logout: "Log Out", searchMenu: "Search menu",
            teacherWorkspace: "Teacher Workspace", teacher: "Teacher",
            totalStudents: "Total Students", totalClasses: "Total Classes",
            attendancePending: "Attendance Pending", assignmentsCreated: "Assignments Created",
            newNotifications: "New Notifications", welcomeBackName: "Welcome back!",
            welcomeBannerSub: "Here's what's happening with your classes today.",
            feedbackRating: "Feedback Rating", ratingBySemester: "Average rating trend",
            noProgressData: "No feedback history yet — this will populate once student feedback is collected.",
            recentActivities: "Recent Activities", noRecentActivity: "No recent activity yet.",
            backToDashboard: "Back to Dashboard", comingSoon: "Coming Soon",
            phaseLabel: "Phase {n} · Coming Soon", modulePlaceholderDesc: "This module isn't built yet. Here's what's planned for it:",
            sidebarProfile: "Profile", personalDetails: "Personal Details", professionalDetails: "Professional Details",
            contactDetails: "Contact Details", academicLoad: "Academic Load",
            sidebarAttendance: "Attendance", takeAttendance: "Take Attendance", attendanceHistory: "Attendance History",
            attendanceReports: "Attendance Reports",
            sidebarAssignments: "Assignments", createAssignment: "Create Assignment", manageAssignments: "Manage Assignments",
            reviewSubmissions: "Review Submissions",
            sidebarMarksEntry: "Marks Entry", enterMarks: "Enter Marks", marksHistory: "Marks History",
            moderationRequests: "Moderation Requests",
            sidebarResults: "Result Generation", generateResult: "Generate Result", publishedResults: "Published Results",
            resultAnalytics: "Result Analytics",
            sidebarLeaveApproval: "Leave Approval", pendingRequests: "Pending Requests", approvedLeaves: "Approved Leaves",
            leaveHistory: "Leave History",
            sidebarNotices: "Notices", publishNotice: "Publish Notice", myNotices: "My Notices",
            departmentNotices: "Department Notices",
            sidebarStudentAnalytics: "Student Analytics", performanceOverview: "Performance Overview",
            atRiskStudents: "At-Risk Students", classComparison: "Class Comparison",
            sidebarAiAssistant: "AI Teaching Assistant", lessonPlanner: "Lesson Planner",
            questionGenerator: "Question Generator", gradingAssistant: "Grading Assistant",
            sidebarTimetable: "Timetable", dailySchedule: "Daily Schedule", weeklySchedule: "Weekly Schedule",
            substitutionRequests: "Substitution Requests",
            sidebarPerformanceReports: "Performance Reports", myPerformance: "My Performance",
            feedbackSummary: "Feedback Summary", appraisalHistory: "Appraisal History",
            sidebarDepartmentDashboard: "Department Dashboard", departmentOverview: "Department Overview",
            facultyList: "Faculty List", departmentNoticesBoard: "Department Notices Board"
        },
        hi: {}
    };

    async function loadLocale(lang) {
        try {
            const res = await fetch(`./locales/${lang}.json`, { cache: "no-cache" });
            if (!res.ok) throw new Error(`Locale responded ${res.status}`);
            translations[lang] = await res.json();
        } catch (err) {
            console.warn(`[TeacherDashboard i18n] Could not load locales/${lang}.json, using fallback strings.`, err);
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
        renderSidebarNav();
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
        statStudents: document.getElementById("stat-students-value"),
        statClasses: document.getElementById("stat-classes-value"),
        statAttendancePending: document.getElementById("stat-attendance-pending-value"),
        statAssignments: document.getElementById("stat-assignments-value"),
        statNotifications: document.getElementById("stat-notifications-value"),
        chartMount: document.getElementById("progress-chart-mount"),
        activityList: document.getElementById("recent-activity-list"),
        profileView: document.getElementById("view-profile"),
        profileAvatarImg: document.getElementById("profileAvatarImg"),
        profileAvatarInitials: document.getElementById("profileAvatarInitials"),
        profileFullName: document.getElementById("profileFullName"),
        profileDesignationPill: document.getElementById("profileDesignation"),
        profileEmployeeId: document.getElementById("profileEmployeeId"),
        profileTeacherCode: document.getElementById("profileTeacherCode"),
        profileDepartment: document.getElementById("profileDepartment"),
        profileStatus: document.getElementById("profileStatus"),
        profileStatStudents: document.getElementById("profileStatStudents"),
        profileStatClasses: document.getElementById("profileStatClasses"),
        profileStatRating: document.getElementById("profileStatRating"),
        profileStatNotices: document.getElementById("profileStatNotices"),
        profProfDesignation: document.getElementById("profProfDesignation"),
        profProfDepartment: document.getElementById("profProfDepartment"),
        profProfSpecialization: document.getElementById("profProfSpecialization"),
        profProfQualification: document.getElementById("profProfQualification"),
        profProfExperience: document.getElementById("profProfExperience"),
        profProfEmploymentType: document.getElementById("profProfEmploymentType"),
        profProfOffice: document.getElementById("profProfOffice"),
        profContactEmail: document.getElementById("profContactEmail"),
        profContactPhone: document.getElementById("profContactPhone"),
        profContactAltPhone: document.getElementById("profContactAltPhone"),
        profContactAddress: document.getElementById("profContactAddress"),
        profContactEmergency: document.getElementById("profContactEmergency"),
        academicLoadEmpty: document.getElementById("academicLoadEmpty"),
        academicLoadList: document.getElementById("academicLoadList")
    };

    // --- 3. THEME (shares the same localStorage key as the login screen / student dashboard) ---
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
        DOM.profileView.classList.remove("is-active-view");
        DOM.pageTitle.textContent = t("sidebarDashboard", "Dashboard Home");
        history.replaceState(null, "", "#dashboard-home");
        highlightActiveNav();
        closeMobileSidebar();
    }

    function openModuleView(group, child) {
        // "profile" is the one module with a real, built-out view — every
        // other group still falls through to the generic placeholder below.
        if (group.isProfile) {
            activeViewKey = `${group.id}/${child.id}`;

            DOM.homeView.classList.remove("is-active-view");
            DOM.genericView.classList.remove("is-active-view");
            DOM.profileView.classList.add("is-active-view");

            DOM.pageTitle.textContent = state.currentDisplayName || t("sidebarProfile", "Profile");

            // Deep-linking into a specific profile tab (#profile/academic-load etc.)
            // switches the matching tab instead of always opening Overview.
            const tabMap = {
                "personal-details": "overview",
                "professional-details": "professional",
                "contact-details": "contact",
                "academic-load": "academic"
            };
            const targetTab = tabMap[child.id] || "overview";
            document.querySelectorAll(".profile-tab").forEach(tb => tb.classList.toggle("active", tb.dataset.tab === targetTab));
            document.querySelectorAll(".profile-section").forEach(sec => sec.classList.toggle("active", sec.id === `profile-${targetTab}`));

            history.replaceState(null, "", `#${activeViewKey}`);
            highlightActiveNav();
            closeMobileSidebar();
            return;
        }

        activeViewKey = `${group.id}/${child.id}`;
        DOM.homeView.classList.remove("is-active-view");
        DOM.profileView.classList.remove("is-active-view");
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

    // Profile tab buttons (Overview / Professional / Contact / Academic Load)
    document.querySelectorAll(".profile-tab").forEach(tab => {
        tab.addEventListener("click", () => {
            const targetId = `profile-${tab.dataset.tab}`;
            const targetSection = document.getElementById(targetId);
            if (!targetSection) return;
            document.querySelectorAll(".profile-tab").forEach(tb => tb.classList.remove("active"));
            document.querySelectorAll(".profile-section").forEach(sec => sec.classList.remove("active"));
            tab.classList.add("active");
            targetSection.classList.add("active");
        });
    });

    // --- 7. AUTH GUARD + PROFILE LOADING ---
    function initAuthGuard() {
        onAuthStateChanged(auth, async (user) => {
            if (!user) {
                window.location.href = LOGIN_ROUTE;
                return;
            }
            state.currentUid = user.uid;
            await loadTeacherProfile(user);
        });
    }

    async function loadTeacherProfile(firebaseUser) {

        // "users" doc carries the role, same pattern the login screen and
        // student dashboard rely on for role routing.
        let userData = {};
        try {
            const userSnap = await getDoc(doc(db, "users", firebaseUser.uid));
            if (userSnap.exists()) userData = userSnap.data();
        } catch (err) {
            console.warn("[TeacherDashboard] Could not read users/{uid}:", err);
        }

        state.currentRole = userData.role || "teacher";

        // Guard rail: if this account's role isn't teacher, send them to
        // their own dashboard instead of letting them sit on a screen meant
        // for someone else.
        if (state.currentRole !== "teacher" && ROLE_ROUTES[state.currentRole]) {
            window.location.href = ROLE_ROUTES[state.currentRole];
            return;
        }

        // "teachers" collection: the enterprise schema — identity{},
        // professional{}, contact{}, social{}, system{}. Stats are NOT
        // stored on this doc; they belong in a separate teacherStats/{uid}
        // doc maintained by a Cloud Function aggregator (not built yet),
        // so this pass renders "--" for every stat instead of guessing.
        let teacherData = {};
        try {
            const teacherSnap = await getDoc(doc(db, "teachers", firebaseUser.uid));
            if (teacherSnap.exists()) teacherData = teacherSnap.data();
        } catch (err) {
            console.warn("[TeacherDashboard] Could not read teachers/{uid}:", err);
        }

        const identity = teacherData.identity || {};
        const professional = teacherData.professional || {};
        const contact = teacherData.contact || {};

        const displayName = identity.fullName || userData.name || firebaseUser.displayName || firebaseUser.email?.split("@")[0] || "Teacher";
        state.currentDisplayName = displayName;

        DOM.userName.textContent = displayName;
        DOM.userMeta.textContent = identity.employeeId ? `#${identity.employeeId}` : (firebaseUser.email || "");
        DOM.greeting.textContent = `${t("welcomeBackName", "Welcome back")}, ${displayName.split(" ")[0]}!`;

        // Single source of truth for "does this teacher have a photo on
        // file?" — checked once, applied to both the topbar avatar and the
        // big profile-page avatar so they never disagree with each other.
        const photo = identity.photoURL || userData.photoURL || firebaseUser.photoURL;
        applyAvatar(DOM.userAvatar, photo, displayName);
        applyProfileAvatar(photo, displayName);

        // If the profile view happens to already be open (e.g. deep-linked
        // via #profile/academic-load on refresh), the title was set before
        // we knew the teacher's name — refresh it now that we do.
        if (activeViewKey?.startsWith("profile")) {
            DOM.pageTitle.textContent = displayName;
        }

        renderProfileIdentity(identity, professional);
        renderProfileProfessional(professional);
        renderProfileContact(contact);

        DOM.bannerDate.textContent = new Intl.DateTimeFormat(state.currentLanguage === "hi" ? "hi-IN" : "en-IN", {
            weekday: "long", day: "numeric", month: "long"
        }).format(new Date());

        // Dashboard stat cards stay "--" deliberately (see file header) —
        // they get wired up once teacherStats/{uid} exists.
        loadAcademicLoad(firebaseUser.uid);
        loadRecentActivity(firebaseUser.uid);
    }

    function renderProfileIdentity(identity, professional) {
        DOM.profileFullName.textContent = identity.fullName || "-";
        DOM.profileEmployeeId.textContent = identity.employeeId || "-";
        DOM.profileTeacherCode.textContent = identity.teacherCode || "-";
        DOM.profileDepartment.textContent = professional.department || "-";

        const designationLabel = professional.designation || "Teacher";
        DOM.profileDesignationPill.textContent = designationLabel;

        const status = (identity.status || "active").toLowerCase().replace(/\s+/g, "-");
        DOM.profileStatus.textContent = identity.status || "Active";
        DOM.profileDesignationPill.classList.remove("status-active", "status-on-leave", "status-inactive");
        if (status === "active") DOM.profileDesignationPill.classList.add("status-active");
        else if (status === "on-leave") DOM.profileDesignationPill.classList.add("status-on-leave");
        else if (status === "inactive") DOM.profileDesignationPill.classList.add("status-inactive");
    }

    function renderProfileProfessional(professional) {
        DOM.profProfDesignation.textContent = professional.designation || "-";
        DOM.profProfDepartment.textContent = professional.department || "-";
        DOM.profProfSpecialization.textContent = formatMaybeArray(professional.specialization);
        DOM.profProfQualification.textContent = formatMaybeArray(professional.qualification);
        DOM.profProfExperience.textContent = professional.experienceYears != null ? `${professional.experienceYears} years` : "-";
        DOM.profProfEmploymentType.textContent = professional.employmentType || "-";
        DOM.profProfOffice.textContent = professional.officeLocation || "-";
    }

    function renderProfileContact(contact) {
        DOM.profContactEmail.textContent = contact.email || "-";
        DOM.profContactPhone.textContent = contact.phone || "-";
        DOM.profContactAltPhone.textContent = contact.alternatePhone || "-";
        DOM.profContactAddress.textContent = contact.address || "-";
        DOM.profContactEmergency.textContent = contact.emergencyContact || "-";
    }

    function formatMaybeArray(val) {
        if (Array.isArray(val)) return val.length ? val.join(", ") : "-";
        return val || "-";
    }

    // Applies a photo (if present) or initials (fallback) to a topbar-style
    // avatar element that's just a container.
    function applyAvatar(el, photoUrl, displayName) {
        if (photoUrl) {
            el.innerHTML = `<img src="${photoUrl}" alt="${escapeHtml(displayName)}">`;
        } else {
            el.textContent = displayName.charAt(0).toUpperCase();
        }
    }

    // Applies a photo (if present) or initials (fallback) to the big
    // profile avatar, which uses a separate <img> + initials <div> pair.
    function applyProfileAvatar(photoUrl, displayName) {
        if (!DOM.profileAvatarImg || !DOM.profileAvatarInitials) return;
        if (photoUrl) {
            DOM.profileAvatarImg.src = photoUrl;
            DOM.profileAvatarImg.alt = displayName;
            DOM.profileAvatarImg.hidden = false;
            DOM.profileAvatarInitials.hidden = true;
        } else {
            DOM.profileAvatarImg.hidden = true;
            DOM.profileAvatarInitials.hidden = false;
            DOM.profileAvatarInitials.textContent = displayName.charAt(0).toUpperCase();
        }
    }

    // "Academic Load" tab — reads the teacherAssignments junction
    // collection (the enterprise-schema replacement for a flat
    // academic.assignedSections[] array) scoped to this teacher only.
    // Renders an empty state gracefully if the collection doesn't exist
    // yet or the query simply returns nothing.
    async function loadAcademicLoad(uid) {
        let assignments = [];
        try {
            const q = query(collection(db, "teacherAssignments"), where("teacherId", "==", uid), where("isActive", "==", true));
            const snap = await getDocs(q);
            snap.forEach(d => assignments.push(d.data()));
        } catch (err) {
            console.warn("[TeacherDashboard] Could not read teacherAssignments:", err);
        }

        if (assignments.length === 0) {
            DOM.academicLoadEmpty.hidden = false;
            DOM.academicLoadList.hidden = true;
            DOM.academicLoadList.innerHTML = "";
            return;
        }

        DOM.academicLoadEmpty.hidden = true;
        DOM.academicLoadList.hidden = false;
        DOM.academicLoadList.innerHTML = "";

        assignments.forEach(a => {
            const card = document.createElement("div");
            card.className = "academic-load-card";
            card.innerHTML = `
                <div class="academic-load-card-subject">${escapeHtml(a.subjectName || "Subject")}</div>
                <div class="academic-load-card-course">${escapeHtml(a.courseName || "")}</div>
                <div class="academic-load-card-meta">
                    ${a.sectionName ? `<span class="academic-load-chip">Sec ${escapeHtml(a.sectionName)}</span>` : ""}
                    ${a.semesterName ? `<span class="academic-load-chip">Sem ${escapeHtml(a.semesterName)}</span>` : ""}
                    ${a.batchName ? `<span class="academic-load-chip">${escapeHtml(a.batchName)}</span>` : ""}
                </div>
            `;
            DOM.academicLoadList.appendChild(card);
        });
    }

    async function loadRecentActivity(uid) {
        const items = [];

        // "notices" collection: campus-wide notices, newest first. Same
        // collection the student dashboard reads — teachers see the same
        // feed plus (eventually) their own published notices.
        try {
            const noticesQuery = query(collection(db, "notices"), orderBy("createdAt", "desc"), limit(5));
            const noticesSnap = await getDocs(noticesQuery);
            noticesSnap.forEach(d => {
                const n = d.data();
                items.push({ text: n.title || n.message || "New notice", time: n.createdAt, type: "notice" });
            });
        } catch (err) {
            console.warn("[TeacherDashboard] Could not read notices:", err);
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
        console.log("[CampusOne] Teacher dashboard initialized.");
    }

    boot();
});
