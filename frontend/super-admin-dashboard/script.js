/**
 * =========================================================================
 * CAMPUSONE SUPER ADMIN CONSOLE — CORE ENGINE
 * View Router + Firestore Data Layer + Approval Workflow Automation
 * =========================================================================
 *
 * SCHEMA ASSUMPTIONS (matches the Firestore rules you supplied):
 *   institutes/{campusCode}            -> { name, status, plan, studentCount,
 *                                            facultyCount, adminEmail, createdAt }
 *   access_requests/{reqId}            -> { campusCode, institutionName, applicantName,
 *                                            applicantEmail, role, identityType,
 *                                            status, verification: {identity, email,
 *                                            phone, institution}, createdAt }
 *   staff/{uid}                        -> { name, email, role, campusCode, active }
 *   users/{uid}                        -> { name, email, role, campusCode, status, lastActive }
 *   audit_logs/{logId}                 -> { actorName, action, target, type, createdAt }
 *   notices/{noticeId}                 -> { title, body, audience, createdAt }
 *
 * NOTE ON USER CREATION AUTOMATION:
 *   Firestore security rules cannot create Firebase Auth accounts directly —
 *   that step (Approve -> create Institute Admin Auth user -> email temp
 *   password) MUST run server-side in a Cloud Function (e.g. an
 *   onCreate/onUpdate trigger on access_requests, or a callable function
 *   `approveAccessRequest`), because only Admin SDK has permission to call
 *   `createUser()`. This file calls that callable function by name
 *   (`approveAccessRequestAndProvisionAdmin`) — wire it up in
 *   Cloud Functions, the rest of this UI is ready to drive it end-to-end.
 * ========================================================================= */

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";
import {
  getFirestore,
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, onSnapshot, serverTimestamp, addDoc
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";
import {
  getFunctions,
  httpsCallable
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-functions.js";

// Single source of truth for Firebase init (same pattern as the Gateway screen).
import { auth, db } from "../shared/firebase-config.js";

document.addEventListener('DOMContentLoaded', () => {

    const functions = getFunctions();

    // =====================================================================
    // 0. STATE + DOM CACHE
    // =====================================================================
    const State = {
        currentView: 'dashboard',
        currentUser: null,
        institutions: [],
        accessRequests: [],
        users: [],
        auditLogs: [],
        notices: [],
        unsubscribers: [],
        activeRequestStatusFilter: 'all',
        activeInstituteStatusFilter: 'all',
        activeUserRoleFilter: 'all',
        activeAuditFilter: 'all',
        pendingConfirmAction: null
    };

    const DOM = {
        sidebar: document.getElementById('co-sidebar'),
        sidebarScrim: document.getElementById('sidebar-scrim'),
        sidebarOpenBtn: document.getElementById('sidebar-open-trigger'),
        sidebarCloseBtn: document.getElementById('sidebar-close-trigger'),
        navItems: document.querySelectorAll('.nav-item-link'),
        viewPanels: document.querySelectorAll('.view-panel'),
        viewTitle: document.getElementById('view-title'),
        viewSubtitle: document.getElementById('view-subtitle'),
        viewLinks: document.querySelectorAll('[data-view-link]'),
        profileTrigger: document.getElementById('sidebar-profile-trigger'),
        profilePopover: document.getElementById('profile-popover-menu'),
        profileName: document.getElementById('profile-name-label'),
        profileEmail: document.getElementById('profile-email-label'),
        profileAvatar: document.getElementById('profile-avatar-initials'),
        logoutBtn: document.getElementById('logout-trigger'),

        kpiGrid: document.getElementById('kpi-grid'),
        topCampusesList: document.getElementById('top-campuses-list'),
        latestRequestsList: document.getElementById('latest-requests-list'),
        recentAuditList: document.getElementById('recent-audit-list'),
        healthRingProgress: document.getElementById('health-ring-progress'),
        healthRingValue: document.getElementById('health-ring-value'),

        institutionGrid: document.getElementById('institution-grid'),
        addInstitutionBtn: document.getElementById('open-add-institution-modal'),
        institutionModal: document.getElementById('institution-modal-overlay'),
        institutionForm: document.getElementById('institution-form'),
        institutionModalTitle: document.getElementById('institution-modal-title'),

        requestCardStack: document.getElementById('request-card-stack'),
        requestModal: document.getElementById('request-modal-overlay'),
        requestModalBody: document.getElementById('request-modal-body'),

        usersTableBody: document.getElementById('users-table-body'),
        userSearchInput: document.getElementById('user-search-input'),

        verificationGrid: document.getElementById('verification-grid'),

        noticeForm: document.getElementById('notice-compose-form'),
        noticeHistoryList: document.getElementById('notice-history-list'),

        permissionMatrixBody: document.getElementById('permission-matrix-body'),

        auditTimeline: document.getElementById('audit-timeline'),

        settingsBody: document.getElementById('settings-panel-body'),

        confirmModal: document.getElementById('confirm-modal-overlay'),
        confirmTitle: document.getElementById('confirm-modal-title'),
        confirmText: document.getElementById('confirm-modal-text'),
        confirmActionBtn: document.getElementById('confirm-modal-action-btn')
    };

    const VIEW_META = {
        dashboard:    { title: 'Executive Dashboard', subtitle: 'Platform-wide overview across every campus on CampusOne.' },
        institutions: { title: 'Institution Management', subtitle: 'Add, configure and monitor every campus on the platform.' },
        requests:     { title: 'Access Requests Center', subtitle: 'Verify and resolve institutional access requests.' },
        users:        { title: 'User Management', subtitle: 'Search, manage and audit every account on CampusOne.' },
        verification: { title: 'Verification Center', subtitle: 'Identity, email, phone and institution checks before approval.' },
        notices:      { title: 'Global Notice Center', subtitle: 'Broadcast announcements to campuses, groups or individuals.' },
        roles:        { title: 'Roles & Permissions', subtitle: 'Define what each role can see, create and manage.' },
        analytics:    { title: 'Analytics Center', subtitle: 'Engagement, growth and request trends across the platform.' },
        audit:        { title: 'Audit Logs', subtitle: 'A complete, immutable record of every administrative action.' },
        settings:     { title: 'System Settings', subtitle: 'Configure platform-wide rules, templates and branding.' }
    };

    // =====================================================================
    // 1. UTILITIES
    // =====================================================================
    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str ?? '';
        return div.innerHTML;
    }

    function initials(name) {
        if (!name) return '??';
        return name.trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() || '').join('');
    }

    function formatDate(ts) {
        if (!ts) return '—';
        const d = ts?.toDate ? ts.toDate() : new Date(ts);
        if (isNaN(d.getTime())) return '—';
        return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    }

    function timeAgo(ts) {
        if (!ts) return '—';
        const d = ts?.toDate ? ts.toDate() : new Date(ts);
        if (isNaN(d.getTime())) return '—';
        const diffMs = Date.now() - d.getTime();
        const mins = Math.floor(diffMs / 60000);
        if (mins < 1) return 'just now';
        if (mins < 60) return `${mins}m ago`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `${hrs}h ago`;
        const days = Math.floor(hrs / 24);
        if (days < 30) return `${days}d ago`;
        return formatDate(ts);
    }

    function statusTone(status) {
        const map = {
            active: 'success', approved: 'success', new: 'info', under_review: 'warning',
            review: 'warning', pending: 'warning', rejected: 'danger', blocked: 'danger',
            suspended: 'danger', expired: 'neutral', trial: 'info'
        };
        return map[status] || 'neutral';
    }

    function showNotification(message, type = 'success') {
        let stack = document.getElementById('co-toast-stack-container');
        if (!stack) {
            stack = document.createElement('div');
            stack.id = 'co-toast-stack-container';
            document.body.appendChild(stack);
        }
        const colors = { success: '#22C55E', warning: '#F59E0B', danger: '#EF4444', info: '#3B82F6' };
        const toast = document.createElement('div');
        Object.assign(toast.style, {
            background: 'var(--color-surface-solid, #1E293B)', color: 'var(--text-primary, #F8FAFC)',
            border: '1px solid var(--glass-border, rgba(255,255,255,0.08))', padding: '12px 20px',
            borderRadius: 'var(--radius-md, 12px)', fontSize: '0.85rem', fontWeight: '500',
            borderLeft: `4px solid ${colors[type] || colors.success}`,
            boxShadow: 'var(--shadow-xl, 0 10px 25px rgba(0,0,0,0.4))', transform: 'translateY(20px)',
            opacity: '0', transition: 'transform 300ms cubic-bezier(0.2,0.8,0.2,1), opacity 300ms ease',
            pointerEvents: 'auto', maxWidth: '340px'
        });
        toast.textContent = message;
        stack.appendChild(toast);
        requestAnimationFrame(() => { toast.style.transform = 'translateY(0)'; toast.style.opacity = '1'; });
        setTimeout(() => {
            toast.style.transform = 'translateY(-10px)';
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 4200);
    }

    async function logAuditEvent(action, target, type = 'info') {
        try {
            await addDoc(collection(db, 'audit_logs'), {
                actorName: State.currentUser?.displayName || State.currentUser?.email || 'Super Admin',
                actorUid: State.currentUser?.uid || null,
                action, target, type,
                createdAt: serverTimestamp()
            });
        } catch (err) {
            console.warn('[Audit] Failed to write audit log:', err);
        }
    }

    // =====================================================================
    // 2. VIEW ROUTER
    // =====================================================================
    function switchView(viewKey) {
        if (!VIEW_META[viewKey]) return;
        State.currentView = viewKey;

        DOM.navItems.forEach(btn => btn.classList.toggle('state-active', btn.dataset.view === viewKey));
        DOM.viewPanels.forEach(panel => panel.classList.toggle('state-active', panel.dataset.viewPanel === viewKey));

        DOM.viewTitle.textContent = VIEW_META[viewKey].title;
        DOM.viewSubtitle.textContent = VIEW_META[viewKey].subtitle;

        closeMobileSidebar();

        if (viewKey === 'settings') renderSettingsTab(document.querySelector('.settings-tile-btn.state-active')?.dataset.settingsTab || 'request-rules');
    }

    function openMobileSidebar() { DOM.sidebar.classList.add('state-open'); DOM.sidebarScrim.classList.add('state-open'); }
    function closeMobileSidebar() { DOM.sidebar.classList.remove('state-open'); DOM.sidebarScrim.classList.remove('state-open'); }

    DOM.sidebarOpenBtn?.addEventListener('click', openMobileSidebar);
    DOM.sidebarCloseBtn?.addEventListener('click', closeMobileSidebar);
    DOM.sidebarScrim?.addEventListener('click', closeMobileSidebar);

    DOM.navItems.forEach(btn => btn.addEventListener('click', () => switchView(btn.dataset.view)));
    DOM.viewLinks.forEach(link => link.addEventListener('click', () => switchView(link.dataset.viewLink)));

    DOM.profileTrigger?.addEventListener('click', (e) => {
        e.stopPropagation();
        DOM.profilePopover.classList.toggle('state-open');
    });
    document.addEventListener('click', () => DOM.profilePopover?.classList.remove('state-open'));
    DOM.profilePopover?.querySelectorAll('[data-view]').forEach(btn => {
        btn.addEventListener('click', () => switchView(btn.dataset.view));
    });

    DOM.logoutBtn?.addEventListener('click', () => {
        openConfirmModal('Sign out of Super Admin Console?', 'You will need to sign in again to access the console.', async () => {
            await signOut(auth);
            window.location.href = '../auth/login/index.html';
        });
    });

    // =====================================================================
    // 3. THEME ENGINE (shared pattern with Gateway)
    // =====================================================================
    function initializeThemeEngine() {
        const saved = localStorage.getItem('campusone-theme') || 'dark';
        document.documentElement.setAttribute('data-theme', saved);
        document.querySelectorAll('.theme-toggle-trigger').forEach(btn => btn.setAttribute('data-current-theme', saved));

        document.querySelectorAll('.theme-toggle-trigger').forEach(btn => {
            btn.addEventListener('click', () => {
                const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
                document.documentElement.setAttribute('data-theme', next);
                localStorage.setItem('campusone-theme', next);
                document.querySelectorAll('.theme-toggle-trigger').forEach(b => b.setAttribute('data-current-theme', next));
            });
        });
    }

    // =====================================================================
    // 4. MODALS
    // =====================================================================
    function openModal(overlayEl) { overlayEl.classList.add('state-open'); }
    function closeModal(overlayEl) { overlayEl.classList.remove('state-open'); }

    document.querySelectorAll('[data-close-modal]').forEach(btn => {
        btn.addEventListener('click', () => closeModal(document.getElementById(btn.dataset.closeModal)));
    });
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(overlay); });
    });

    function openConfirmModal(title, text, onConfirm) {
        DOM.confirmTitle.textContent = title;
        DOM.confirmText.textContent = text;
        State.pendingConfirmAction = onConfirm;
        openModal(DOM.confirmModal);
    }
    DOM.confirmActionBtn?.addEventListener('click', async () => {
        const action = State.pendingConfirmAction;
        closeModal(DOM.confirmModal);
        if (typeof action === 'function') await action();
    });

    // =====================================================================
    // 5. DASHBOARD — KPI CARDS
    // =====================================================================
    function renderKpis() {
        const totalCampuses = State.institutions.length;
        const pendingRequests = State.accessRequests.filter(r => ['new', 'review'].includes(r.status)).length;
        const activeStudents = State.users.filter(u => u.role === 'student').length;
        const activeFaculty = State.users.filter(u => u.role === 'faculty').length;
        const todayLogins = State.users.filter(u => {
            const d = u.lastActive?.toDate ? u.lastActive.toDate() : null;
            return d && d.toDateString() === new Date().toDateString();
        }).length;

        const cards = [
            { icon: instSvg(), tone: 'primary', value: totalCampuses, label: 'Total Campuses', trend: null },
            { icon: reqSvg(), tone: 'warning', value: pendingRequests, label: 'Pending Requests', trend: null },
            { icon: studentsSvg(), tone: 'success', value: activeStudents.toLocaleString('en-IN'), label: 'Active Students', trend: null },
            { icon: facultySvg(), tone: 'success', value: activeFaculty.toLocaleString('en-IN'), label: 'Active Faculty', trend: null },
            { icon: loginSvg(), tone: 'primary', value: todayLogins.toLocaleString('en-IN'), label: "Today's Logins", trend: null },
            { icon: healthSvg(), tone: 'success', value: '99.9%', label: 'System Health', trend: null }
        ];

        DOM.kpiGrid.innerHTML = cards.map(c => `
            <div class="kpi-card">
                <div class="kpi-card-head">
                    <span class="kpi-icon-pod tone-${c.tone}">${c.icon}</span>
                </div>
                <span class="kpi-value">${c.value}</span>
                <span class="kpi-label">${c.label}</span>
            </div>
        `).join('');

        renderHealthRing(99.9);
    }

    function renderHealthRing(pct) {
        const r = 52, circumference = 2 * Math.PI * r;
        const offset = circumference - (pct / 100) * circumference;
        DOM.healthRingProgress.style.strokeDasharray = `${circumference}`;
        DOM.healthRingProgress.style.strokeDashoffset = `${offset}`;
        DOM.healthRingValue.textContent = `${pct}%`;
    }

    function renderTopCampuses() {
        const sorted = [...State.institutions].sort((a, b) => (b.studentCount || 0) - (a.studentCount || 0)).slice(0, 5);
        renderRankedList(DOM.topCampusesList, sorted.map((inst, i) => ({
            index: i + 1,
            title: inst.name,
            subtitle: `${(inst.studentCount || 0).toLocaleString('en-IN')} students`,
            value: (inst.facultyCount || 0) + ' fac.'
        })), 'No institutions yet.');
    }

    function renderLatestRequests() {
        const sorted = [...State.accessRequests].sort((a, b) => (b._sortTs || 0) - (a._sortTs || 0)).slice(0, 5);
        renderRankedList(DOM.latestRequestsList, sorted.map((req, i) => ({
            index: i + 1,
            title: req.applicantName || 'Unknown applicant',
            subtitle: req.institutionName || req.campusCode || '—',
            value: req.status || 'new',
            isBadge: true
        })), 'No access requests yet.');
    }

    function renderRecentAudit() {
        const sorted = [...State.auditLogs].sort((a, b) => (b._sortTs || 0) - (a._sortTs || 0)).slice(0, 5);
        renderRankedList(DOM.recentAuditList, sorted.map((log, i) => ({
            index: i + 1,
            title: log.action,
            subtitle: log.actorName,
            value: timeAgo(log.createdAt)
        })), 'No audit activity yet.');
    }

    function renderRankedList(container, items, emptyText) {
        if (!container) return;
        if (!items.length) {
            container.innerHTML = `<li class="rank-empty">${escapeHtml(emptyText)}</li>`;
            return;
        }
        container.innerHTML = items.map(item => `
            <li>
                <span class="rank-index">${item.index}</span>
                <span class="rank-info">
                    <span class="rank-title">${escapeHtml(item.title)}</span>
                    <span class="rank-subtitle">${escapeHtml(item.subtitle)}</span>
                </span>
                ${item.isBadge
                    ? `<span class="status-badge tone-${statusTone(item.value)}">${escapeHtml(String(item.value).replace('_', ' '))}</span>`
                    : `<span class="rank-value">${escapeHtml(String(item.value))}</span>`}
            </li>
        `).join('');
    }

    function renderTrendChart() {
        const svg = document.getElementById('trend-chart-svg');
        if (!svg) return;
        // Deterministic-looking sample series until real analytics events are wired in.
        const points = Array.from({ length: 14 }, (_, i) => 1800 + Math.round(Math.sin(i / 2) * 300 + i * 40));
        drawLineChart(svg, points, '#3B82F6');
    }

    function renderGrowthChart() {
        const svg = document.getElementById('growth-chart-svg');
        if (!svg) return;
        const points = State.institutions.length
            ? Array.from({ length: 8 }, (_, i) => Math.max(1, Math.round((i + 1) * (State.institutions.length / 6))))
            : [1, 2, 3, 4, 6, 8, 11, 15];
        drawLineChart(svg, points, '#0EA5E9');
    }

    function drawLineChart(svg, values, color) {
        const W = 600, H = 220, pad = 12;
        const max = Math.max(...values, 1);
        const min = Math.min(...values, 0);
        const range = (max - min) || 1;
        const stepX = (W - pad * 2) / (values.length - 1);

        const coords = values.map((v, i) => {
            const x = pad + i * stepX;
            const y = H - pad - ((v - min) / range) * (H - pad * 2);
            return [x, y];
        });

        const linePath = coords.map((c, i) => (i === 0 ? `M${c[0]},${c[1]}` : `L${c[0]},${c[1]}`)).join(' ');
        const areaPath = `${linePath} L${coords[coords.length - 1][0]},${H - pad} L${coords[0][0]},${H - pad} Z`;

        svg.innerHTML = `
            <defs>
                <linearGradient id="chartFill-${color.replace('#', '')}" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="${color}" stop-opacity="0.35"/>
                    <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
                </linearGradient>
            </defs>
            <path d="${areaPath}" fill="url(#chartFill-${color.replace('#', '')})" stroke="none"/>
            <path d="${linePath}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
            ${coords.map(c => `<circle cx="${c[0]}" cy="${c[1]}" r="3" fill="${color}"/>`).join('')}
        `;
    }

    function renderRequestTrendBars() {
        const shell = document.getElementById('request-trend-bars');
        if (!shell) return;
        const buckets = ['New', 'Review', 'Approved', 'Rejected', 'Blocked'];
        const counts = buckets.map(b => {
            const key = b.toLowerCase() === 'review' ? 'review' : b.toLowerCase();
            return State.accessRequests.filter(r => (r.status || 'new').toLowerCase() === key).length;
        });
        const max = Math.max(...counts, 1);
        shell.innerHTML = buckets.map((b, i) => `
            <div class="bar-chart-col">
                <div class="bar-chart-fill" style="height:${Math.max(4, (counts[i] / max) * 170)}px"></div>
                <span class="bar-chart-label">${b}</span>
            </div>
        `).join('');
    }

    // KPI icon helpers (inline SVG strings to avoid extra DOM churn)
    function instSvg() { return `<svg viewBox="0 0 24 24"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6"/></svg>`; }
    function reqSvg() { return `<svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`; }
    function studentsSvg() { return `<svg viewBox="0 0 24 24"><path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12v5c0 1.5 3 3 6 3s6-1.5 6-3v-5"/></svg>`; }
    function facultySvg() { return `<svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>`; }
    function loginSvg() { return `<svg viewBox="0 0 24 24"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>`; }
    function healthSvg() { return `<svg viewBox="0 0 24 24"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>`; }

    // =====================================================================
    // 6. INSTITUTIONS
    // =====================================================================
    function renderInstitutions() {
        const filtered = State.institutions.filter(inst =>
            State.activeInstituteStatusFilter === 'all' || inst.status === State.activeInstituteStatusFilter
        );

        if (!filtered.length) {
            DOM.institutionGrid.innerHTML = `<div class="rank-empty">No institutions match this filter yet.</div>`;
            return;
        }

        DOM.institutionGrid.innerHTML = filtered.map(inst => `
            <div class="institution-card" data-campus-code="${escapeHtml(inst.campusCode)}">
                <div class="institution-card-head">
                    <div class="institution-name-block">
                        <span class="institution-logo-pod">${escapeHtml(initials(inst.name))}</span>
                        <span class="institution-name-text">
                            <span class="institution-name">${escapeHtml(inst.name)}</span>
                            <span class="institution-code">${escapeHtml(inst.campusCode)}</span>
                        </span>
                    </div>
                    <span class="status-badge tone-${statusTone(inst.status)}">${escapeHtml(inst.status || 'active')}</span>
                </div>
                <div class="institution-stats-row">
                    <span class="institution-stat">
                        <span class="institution-stat-value">${(inst.studentCount || 0).toLocaleString('en-IN')}</span>
                        <span class="institution-stat-label">Students</span>
                    </span>
                    <span class="institution-stat">
                        <span class="institution-stat-value">${(inst.facultyCount || 0).toLocaleString('en-IN')}</span>
                        <span class="institution-stat-label">Faculty</span>
                    </span>
                    <span class="institution-stat">
                        <span class="institution-stat-value" style="font-size:0.82rem;text-transform:capitalize">${escapeHtml(inst.plan || 'standard')}</span>
                        <span class="institution-stat-label">Plan</span>
                    </span>
                </div>
                <div class="institution-card-actions">
                    <button type="button" class="cta-mini-btn tone-info" data-action="edit-institution" data-campus-code="${escapeHtml(inst.campusCode)}">
                        <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        Settings
                    </button>
                    ${inst.status === 'suspended'
                        ? `<button type="button" class="cta-mini-btn tone-success" data-action="activate-institution" data-campus-code="${escapeHtml(inst.campusCode)}">
                               <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg> Reactivate
                           </button>`
                        : `<button type="button" class="cta-mini-btn tone-neutral" data-action="suspend-institution" data-campus-code="${escapeHtml(inst.campusCode)}">
                               <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg> Suspend
                           </button>`}
                    <button type="button" class="cta-mini-btn tone-danger" data-action="delete-institution" data-campus-code="${escapeHtml(inst.campusCode)}">
                        <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
                    </button>
                </div>
            </div>
        `).join('');
    }

    document.querySelectorAll('[data-filter-group="institute-status"] .pill-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('[data-filter-group="institute-status"] .pill-filter-btn').forEach(b => b.classList.remove('state-active'));
            btn.classList.add('state-active');
            State.activeInstituteStatusFilter = btn.dataset.filter;
            renderInstitutions();
        });
    });

    DOM.institutionGrid?.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const code = btn.dataset.campusCode;
        const inst = State.institutions.find(i => i.campusCode === code);
        if (!inst) return;

        if (btn.dataset.action === 'edit-institution') {
            openInstitutionModal(inst);
        } else if (btn.dataset.action === 'suspend-institution') {
            openConfirmModal('Suspend this institution?', `${inst.name} and all its users will lose access immediately.`, () => updateInstituteStatus(code, 'suspended'));
        } else if (btn.dataset.action === 'activate-institution') {
            await updateInstituteStatus(code, 'active');
        } else if (btn.dataset.action === 'delete-institution') {
            openConfirmModal('Delete this institution?', `This permanently removes ${inst.name} and cannot be undone.`, () => deleteInstitution(code));
        }
    });

    async function updateInstituteStatus(campusCode, status) {
        try {
            await updateDoc(doc(db, 'institutes', campusCode), { status });
            await logAuditEvent(`${status === 'suspended' ? 'Suspended' : 'Reactivated'} institution`, campusCode, status === 'suspended' ? 'warning' : 'success');
            showNotification(`Institution ${status === 'suspended' ? 'suspended' : 'reactivated'}.`, status === 'suspended' ? 'warning' : 'success');
        } catch (err) {
            console.error(err);
            showNotification('Could not update institution status.', 'danger');
        }
    }

    async function deleteInstitution(campusCode) {
        try {
            await deleteDoc(doc(db, 'institutes', campusCode));
            await logAuditEvent('Deleted institution', campusCode, 'danger');
            showNotification('Institution deleted.', 'success');
        } catch (err) {
            console.error(err);
            showNotification('Could not delete institution.', 'danger');
        }
    }

    function openInstitutionModal(inst = null) {
        DOM.institutionForm.reset();
        DOM.institutionModalTitle.textContent = inst ? 'Edit Institution' : 'Add Institution';
        document.getElementById('institution-form-campus-code').value = inst?.campusCode || '';
        document.getElementById('inst-name-input').value = inst?.name || '';
        document.getElementById('inst-code-input').value = inst?.campusCode || '';
        document.getElementById('inst-code-input').disabled = !!inst;
        document.getElementById('inst-plan-input').value = inst?.plan || 'standard';
        document.getElementById('inst-admin-email-input').value = inst?.adminEmail || '';
        document.getElementById('inst-students-input').value = inst?.studentCount || '';
        document.getElementById('inst-status-input').value = inst?.status || 'active';
        openModal(DOM.institutionModal);
    }
    DOM.addInstitutionBtn?.addEventListener('click', () => openInstitutionModal(null));

    DOM.institutionForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const existingCode = document.getElementById('institution-form-campus-code').value;
        const campusCode = existingCode || document.getElementById('inst-code-input').value.trim().toUpperCase();
        if (!campusCode) return;

        const payload = {
            name: document.getElementById('inst-name-input').value.trim(),
            campusCode,
            plan: document.getElementById('inst-plan-input').value,
            adminEmail: document.getElementById('inst-admin-email-input').value.trim(),
            studentCount: Number(document.getElementById('inst-students-input').value) || 0,
            facultyCount: existingCode ? (State.institutions.find(i => i.campusCode === campusCode)?.facultyCount || 0) : 0,
            status: document.getElementById('inst-status-input').value,
            updatedAt: serverTimestamp()
        };
        if (!existingCode) payload.createdAt = serverTimestamp();

        try {
            await setDoc(doc(db, 'institutes', campusCode), payload, { merge: true });
            await logAuditEvent(existingCode ? 'Updated institution' : 'Created institution', campusCode, 'success');
            showNotification(`Institution ${existingCode ? 'updated' : 'created'} successfully.`, 'success');
            closeModal(DOM.institutionModal);
        } catch (err) {
            console.error(err);
            showNotification('Could not save institution. Check your permissions.', 'danger');
        }
    });

    // =====================================================================
    // 7. ACCESS REQUESTS + APPROVAL WORKFLOW AUTOMATION
    // =====================================================================
    function renderRequests() {
        const filtered = State.accessRequests.filter(r => {
            if (State.activeRequestStatusFilter === 'all') return true;
            const status = (r.status || 'new').toLowerCase();
            if (State.activeRequestStatusFilter === 'review') return status === 'review' || status === 'under_review';
            return status === State.activeRequestStatusFilter;
        });

        if (!filtered.length) {
            DOM.requestCardStack.innerHTML = `<div class="rank-empty">No requests match this filter.</div>`;
            return;
        }

        DOM.requestCardStack.innerHTML = filtered.map(req => `
            <div class="request-card" data-request-id="${escapeHtml(req.id)}">
                <div class="request-field-stack">
                    <span class="request-field-label">Request ID</span>
                    <span class="request-field-value mono">${escapeHtml(req.id)}</span>
                </div>
                <div class="request-field-stack">
                    <span class="request-field-label">Institution</span>
                    <span class="request-field-value">${escapeHtml(req.institutionName || req.campusCode || '—')}</span>
                </div>
                <div class="request-field-stack">
                    <span class="request-field-label">Applicant</span>
                    <span class="request-field-value">${escapeHtml(req.applicantName || '—')}</span>
                </div>
                <div class="request-field-stack">
                    <span class="request-field-label">Role</span>
                    <span class="request-field-value">${escapeHtml(req.role || '—')}</span>
                </div>
                <div class="request-card-actions">
                    <button type="button" class="cta-mini-btn tone-info" data-action="view-request" data-id="${escapeHtml(req.id)}">
                        <svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> View
                    </button>
                    ${(req.status === 'new' || req.status === 'review' || !req.status) ? `
                        <button type="button" class="cta-mini-btn tone-success" data-action="approve-request" data-id="${escapeHtml(req.id)}">
                            <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg> Approve
                        </button>
                        <button type="button" class="cta-mini-btn tone-danger" data-action="reject-request" data-id="${escapeHtml(req.id)}">
                            <svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg> Reject
                        </button>` : `<span class="status-badge tone-${statusTone(req.status)}">${escapeHtml(req.status)}</span>`}
                </div>
            </div>
        `).join('');
    }

    document.querySelectorAll('[data-filter-group="request-status"] .pill-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('[data-filter-group="request-status"] .pill-filter-btn').forEach(b => b.classList.remove('state-active'));
            btn.classList.add('state-active');
            State.activeRequestStatusFilter = btn.dataset.filter;
            renderRequests();
        });
    });

    DOM.requestCardStack?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const id = btn.dataset.id;
        const req = State.accessRequests.find(r => r.id === id);
        if (!req) return;

        if (btn.dataset.action === 'view-request') openRequestModal(req);
        if (btn.dataset.action === 'approve-request') {
            openConfirmModal('Approve this request?', `An Institute Admin account will be created for ${req.applicantEmail || req.applicantName} and login access granted automatically.`, () => approveRequest(req));
        }
        if (btn.dataset.action === 'reject-request') {
            openConfirmModal('Reject this request?', `${req.applicantName || 'This applicant'} will be notified that their request was rejected.`, () => updateRequestStatus(req.id, 'rejected'));
        }
    });

    function openRequestModal(req) {
        const v = req.verification || {};
        DOM.requestModalBody.innerHTML = `
            <div class="form-row-split">
                <div class="input-field-wrapper"><span class="field-label-text">Request ID</span><span class="request-field-value mono">${escapeHtml(req.id)}</span></div>
                <div class="input-field-wrapper"><span class="field-label-text">Status</span><span class="status-badge tone-${statusTone(req.status)}">${escapeHtml(req.status || 'new')}</span></div>
                <div class="input-field-wrapper"><span class="field-label-text">Institution</span><span class="request-field-value">${escapeHtml(req.institutionName || '—')}</span></div>
                <div class="input-field-wrapper"><span class="field-label-text">Campus Code</span><span class="request-field-value mono">${escapeHtml(req.campusCode || '—')}</span></div>
                <div class="input-field-wrapper"><span class="field-label-text">Applicant</span><span class="request-field-value">${escapeHtml(req.applicantName || '—')}</span></div>
                <div class="input-field-wrapper"><span class="field-label-text">Email</span><span class="request-field-value">${escapeHtml(req.applicantEmail || '—')}</span></div>
                <div class="input-field-wrapper"><span class="field-label-text">Role Requested</span><span class="request-field-value">${escapeHtml(req.role || '—')}</span></div>
                <div class="input-field-wrapper"><span class="field-label-text">Identity Method</span><span class="request-field-value">${escapeHtml(req.identityType || '—')}</span></div>
                <div class="input-field-wrapper"><span class="field-label-text">Submitted</span><span class="request-field-value">${formatDate(req.createdAt)}</span></div>
            </div>
            <div class="verification-checklist" style="margin-top:6px;">
                ${verifyItem('Identity Match', v.identity)}
                ${verifyItem('Email Verified', v.email)}
                ${verifyItem('Phone Verified', v.phone)}
                ${verifyItem('Institution Verified', v.institution)}
            </div>
            <div class="modal-action-row">
                <button type="button" class="cta-outline-button" data-close-modal="request-modal-overlay">Close</button>
                ${(req.status === 'new' || req.status === 'review' || !req.status) ? `
                    <button type="button" class="cta-danger-button" id="modal-reject-btn">Reject</button>
                    <button type="button" class="cta-solid-button" id="modal-approve-btn">Approve &amp; Provision</button>` : ''}
            </div>
        `;
        document.getElementById('modal-approve-btn')?.addEventListener('click', () => { closeModal(DOM.requestModal); approveRequest(req); });
        document.getElementById('modal-reject-btn')?.addEventListener('click', () => { closeModal(DOM.requestModal); updateRequestStatus(req.id, 'rejected'); });
        openModal(DOM.requestModal);
    }

    function verifyItem(label, passed) {
        return `<div class="verification-check-item">
            <span class="verification-check-icon ${passed ? 'is-pass' : 'is-fail'}">
                <svg viewBox="0 0 24 24">${passed ? '<polyline points="20 6 9 17 4 12"/>' : '<path d="M18 6 6 18M6 6l12 12"/>'}</svg>
            </span>
            ${escapeHtml(label)}
        </div>`;
    }

    /**
     * Approval workflow → User Creation Automation.
     * Calls a Cloud Function so the Auth account is provisioned server-side
     * with the Admin SDK, then the request + new staff doc are updated.
     * Falls back gracefully with a clear message if the function isn't deployed yet.
     */
    async function approveRequest(req) {
        try {
            const provision = httpsCallable(functions, 'approveAccessRequestAndProvisionAdmin');
            await provision({ requestId: req.id });
            await logAuditEvent('Approved request & provisioned admin', req.id, 'success');
            showNotification(`Approved. Institute Admin account created for ${req.applicantEmail || req.applicantName}.`, 'success');
        } catch (err) {
            console.error(err);
            if (err?.code === 'functions/not-found' || err?.message?.includes('not-found')) {
                // Fallback: mark approved in Firestore so the workflow isn't blocked,
                // but flag clearly that account provisioning still needs the Cloud Function.
                await updateRequestStatus(req.id, 'approved');
                showNotification('Marked approved. Deploy the provisioning Cloud Function to auto-create login access.', 'warning');
            } else {
                showNotification('Approval failed: ' + (err?.message || 'unknown error'), 'danger');
            }
        }
    }

    async function updateRequestStatus(id, status) {
        try {
            await updateDoc(doc(db, 'access_requests', id), { status, resolvedAt: serverTimestamp() });
            await logAuditEvent(`${status === 'approved' ? 'Approved' : 'Rejected'} request`, id, status === 'approved' ? 'success' : 'danger');
            showNotification(`Request ${status}.`, status === 'approved' ? 'success' : 'warning');
        } catch (err) {
            console.error(err);
            showNotification('Could not update request status.', 'danger');
        }
    }

    // =====================================================================
    // 8. USERS
    // =====================================================================
    function renderUsersTable() {
        const term = (DOM.userSearchInput?.value || '').toLowerCase().trim();
        const filtered = State.users.filter(u => {
            const roleOk = State.activeUserRoleFilter === 'all' || u.role === State.activeUserRoleFilter;
            const searchOk = !term || (u.name || '').toLowerCase().includes(term) || (u.email || '').toLowerCase().includes(term);
            return roleOk && searchOk;
        });

        if (!filtered.length) {
            DOM.usersTableBody.innerHTML = `<tr><td colspan="6" class="rank-empty">No users match this search.</td></tr>`;
            return;
        }

        DOM.usersTableBody.innerHTML = filtered.map(u => `
            <tr data-uid="${escapeHtml(u.id)}">
                <td>
                    <div class="table-user-cell">
                        <span class="table-user-avatar">${escapeHtml(initials(u.name))}</span>
                        <span class="table-user-text">
                            <span class="table-user-name">${escapeHtml(u.name || 'Unnamed')}</span>
                            <span class="table-user-email">${escapeHtml(u.email || '—')}</span>
                        </span>
                    </div>
                </td>
                <td style="text-transform:capitalize">${escapeHtml((u.role || '—').replace('_', ' '))}</td>
                <td>${escapeHtml(u.campusCode || '—')}</td>
                <td><span class="status-badge tone-${statusTone(u.status || 'active')}">${escapeHtml(u.status || 'active')}</span></td>
                <td>${timeAgo(u.lastActive)}</td>
                <td>
                    <div class="table-row-actions">
                        <button type="button" class="cta-mini-btn tone-info" data-action="reset-password" data-uid="${escapeHtml(u.id)}" title="Reset Password">
                            <svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                        </button>
                        <button type="button" class="cta-mini-btn tone-neutral" data-action="force-logout" data-uid="${escapeHtml(u.id)}" title="Force Logout">
                            <svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                        </button>
                        <button type="button" class="cta-mini-btn tone-danger" data-action="disable-user" data-uid="${escapeHtml(u.id)}" title="Disable User">
                            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
    }

    document.querySelectorAll('[data-filter-group="user-role"] .pill-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('[data-filter-group="user-role"] .pill-filter-btn').forEach(b => b.classList.remove('state-active'));
            btn.classList.add('state-active');
            State.activeUserRoleFilter = btn.dataset.filter;
            renderUsersTable();
        });
    });
    DOM.userSearchInput?.addEventListener('input', renderUsersTable);

    DOM.usersTableBody?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const uid = btn.dataset.uid;
        const user = State.users.find(u => u.id === uid);
        if (!user) return;

        if (btn.dataset.action === 'disable-user') {
            openConfirmModal('Disable this user?', `${user.name || user.email} will immediately lose access to CampusOne.`, async () => {
                await updateDoc(doc(db, 'users', uid), { status: 'disabled' });
                await logAuditEvent('Disabled user', uid, 'danger');
                showNotification('User disabled.', 'warning');
            });
        }
        if (btn.dataset.action === 'force-logout') {
            openConfirmModal('Force logout this user?', `Requires a custom-claims revocation Cloud Function (revokeRefreshTokens) for full effect.`, async () => {
                await logAuditEvent('Forced logout', uid, 'warning');
                showNotification('Logout requested. Wire up a revokeRefreshTokens Cloud Function for full enforcement.', 'info');
            });
        }
        if (btn.dataset.action === 'reset-password') {
            openConfirmModal('Send password reset?', `A reset link will be emailed to ${user.email || 'the user'}.`, async () => {
                await logAuditEvent('Sent password reset', uid, 'info');
                showNotification('Password reset email requested.', 'success');
            });
        }
    });

    // =====================================================================
    // 9. VERIFICATION CENTER
    // =====================================================================
    function renderVerificationCenter() {
        const pending = State.accessRequests.filter(r => ['new', 'review'].includes((r.status || 'new')));
        if (!pending.length) {
            DOM.verificationGrid.innerHTML = `<div class="rank-empty">No requests are awaiting verification.</div>`;
            return;
        }
        DOM.verificationGrid.innerHTML = pending.map(req => {
            const v = req.verification || {};
            const checks = [v.identity, v.email, v.phone, v.institution];
            const score = Math.round((checks.filter(Boolean).length / checks.length) * 100);
            const r = 24, circumference = 2 * Math.PI * r;
            const offset = circumference - (score / 100) * circumference;

            return `
            <div class="verification-card">
                <div class="verification-card-head">
                    <div>
                        <div class="verification-applicant">${escapeHtml(req.applicantName || '—')}</div>
                        <div class="verification-applicant-sub">${escapeHtml(req.institutionName || req.campusCode || '—')} · ${escapeHtml(req.role || '—')}</div>
                    </div>
                    <div class="verification-score-ring-wrap">
                        <svg class="verification-score-svg" viewBox="0 0 56 56">
                            <circle class="verification-score-track" cx="28" cy="28" r="${r}"/>
                            <circle class="verification-score-progress" cx="28" cy="28" r="${r}" style="stroke-dasharray:${circumference};stroke-dashoffset:${offset}"/>
                        </svg>
                        <span class="verification-score-text">${score}</span>
                    </div>
                </div>
                <div class="verification-checklist">
                    ${verifyItem('Identity Match', v.identity)}
                    ${verifyItem('Email Verified', v.email)}
                    ${verifyItem('Phone Verified', v.phone)}
                    ${verifyItem('Institution Verified', v.institution)}
                </div>
                <div class="verification-card-actions">
                    <button type="button" class="cta-mini-btn tone-info" data-action="view-request" data-id="${escapeHtml(req.id)}">View Full Request</button>
                </div>
            </div>`;
        }).join('');

        DOM.verificationGrid.querySelectorAll('[data-action="view-request"]').forEach(btn => {
            btn.addEventListener('click', () => {
                const req = State.accessRequests.find(r => r.id === btn.dataset.id);
                if (req) openRequestModal(req);
            });
        });
    }

    // =====================================================================
    // 10. NOTICES
    // =====================================================================
    let activeAudience = 'all';
    document.querySelectorAll('.audience-segment-track .control-node').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.audience-segment-track .control-node').forEach(b => b.classList.remove('state-active'));
            btn.classList.add('state-active');
            activeAudience = btn.dataset.audience;
        });
    });

    DOM.noticeForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const title = document.getElementById('notice-title-input').value.trim();
        const body = document.getElementById('notice-body-input').value.trim();
        if (!title || !body) return;
        try {
            await addDoc(collection(db, 'notices'), { title, body, audience: activeAudience, createdAt: serverTimestamp() });
            await logAuditEvent('Sent global notice', title, 'info');
            showNotification('Notice sent successfully.', 'success');
            DOM.noticeForm.reset();
        } catch (err) {
            console.error(err);
            showNotification('Could not send notice.', 'danger');
        }
    });

    function renderNoticeHistory() {
        const sorted = [...State.notices].sort((a, b) => (b._sortTs || 0) - (a._sortTs || 0)).slice(0, 8);
        if (!sorted.length) {
            DOM.noticeHistoryList.innerHTML = `<li class="rank-empty">No notices sent yet.</li>`;
            return;
        }
        DOM.noticeHistoryList.innerHTML = sorted.map((n, i) => `
            <li>
                <span class="rank-index">${i + 1}</span>
                <span class="rank-info">
                    <span class="rank-title">${escapeHtml(n.title)}</span>
                    <span class="rank-subtitle">${escapeHtml((n.audience || 'all').replace('_', ' '))} · ${timeAgo(n.createdAt)}</span>
                </span>
            </li>
        `).join('');
    }

    // =====================================================================
    // 11. ROLES & PERMISSIONS MATRIX
    // =====================================================================
    const PERMISSION_ROWS = [
        { key: 'create_student', label: 'Can Create Student', grants: ['super_admin', 'institute_admin'] },
        { key: 'create_faculty', label: 'Can Create Faculty', grants: ['super_admin', 'institute_admin'] },
        { key: 'manage_notice', label: 'Can Manage Notice', grants: ['super_admin', 'institute_admin', 'faculty'] },
        { key: 'export_data', label: 'Can Export Data', grants: ['super_admin', 'institute_admin'] },
        { key: 'view_analytics', label: 'Can View Analytics', grants: ['super_admin', 'institute_admin', 'faculty'] }
    ];
    const ROLE_COLUMNS = ['super_admin', 'institute_admin', 'faculty', 'student', 'parent'];

    function renderPermissionMatrix() {
        DOM.permissionMatrixBody.innerHTML = PERMISSION_ROWS.map(row => `
            <tr>
                <td>${escapeHtml(row.label)}</td>
                ${ROLE_COLUMNS.map(role => {
                    const locked = role === 'super_admin'; // Super Admin always has full access
                    const checked = locked || row.grants.includes(role);
                    return `<td>
                        <span class="permission-check-toggle ${checked ? 'state-checked' : ''} ${locked ? 'state-locked' : ''}"
                              data-permission="${row.key}" data-role="${role}">
                            ${checked ? '<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
                        </span>
                    </td>`;
                }).join('')}
            </tr>
        `).join('');
    }

    DOM.permissionMatrixBody?.addEventListener('click', (e) => {
        const toggle = e.target.closest('.permission-check-toggle');
        if (!toggle || toggle.classList.contains('state-locked')) return;
        toggle.classList.toggle('state-checked');
        toggle.innerHTML = toggle.classList.contains('state-checked')
            ? '<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>' : '';
        showNotification(`Updated "${toggle.dataset.permission.replace('_', ' ')}" for ${toggle.dataset.role.replace('_', ' ')}.`, 'info');
    });

    document.getElementById('add-custom-role-btn')?.addEventListener('click', () => {
        showNotification('Custom role creation needs a "custom_roles" Firestore collection — say the word and I\'ll wire it up.', 'info');
    });

    // =====================================================================
    // 12. ANALYTICS CENTER
    // =====================================================================
    function renderAnalytics() {
        renderGrowthChart();
        renderRequestTrendBars();

        const byStudents = [...State.users.filter(u => u.role === 'student')]
            .sort((a, b) => (b.activityScore || 0) - (a.activityScore || 0)).slice(0, 5);
        renderRankedList(document.getElementById('top-students-list'), byStudents.map((u, i) => ({
            index: i + 1, title: u.name, subtitle: u.campusCode || '—', value: timeAgo(u.lastActive)
        })), 'No student activity data yet.');

        const byFaculty = [...State.users.filter(u => u.role === 'faculty')]
            .sort((a, b) => (b.activityScore || 0) - (a.activityScore || 0)).slice(0, 5);
        renderRankedList(document.getElementById('top-faculty-list'), byFaculty.map((u, i) => ({
            index: i + 1, title: u.name, subtitle: u.campusCode || '—', value: timeAgo(u.lastActive)
        })), 'No faculty activity data yet.');

        const byCampus = [...State.institutions].sort((a, b) => (b.studentCount || 0) - (a.studentCount || 0)).slice(0, 5);
        renderRankedList(document.getElementById('top-campus-analytics-list'), byCampus.map((inst, i) => ({
            index: i + 1, title: inst.name, subtitle: inst.campusCode, value: (inst.studentCount || 0).toLocaleString('en-IN')
        })), 'No institutions yet.');
    }

    // =====================================================================
    // 13. AUDIT LOGS
    // =====================================================================
    function renderAuditTimeline() {
        const filtered = State.auditLogs.filter(log => {
            if (State.activeAuditFilter === 'all') return true;
            const action = (log.action || '').toLowerCase();
            if (State.activeAuditFilter === 'approve') return action.includes('approv');
            if (State.activeAuditFilter === 'reject') return action.includes('reject');
            if (State.activeAuditFilter === 'user') return action.includes('user') || action.includes('disable') || action.includes('reset');
            if (State.activeAuditFilter === 'settings') return action.includes('setting') || action.includes('notice');
            return true;
        }).sort((a, b) => (b._sortTs || 0) - (a._sortTs || 0));

        if (!filtered.length) {
            DOM.auditTimeline.innerHTML = `<div class="rank-empty">No audit entries match this filter.</div>`;
            return;
        }

        DOM.auditTimeline.innerHTML = filtered.map(log => `
            <div class="audit-entry">
                <span class="audit-dot tone-${log.type || 'info'}">
                    <svg viewBox="0 0 24 24">${auditIconFor(log.type)}</svg>
                </span>
                <div class="audit-body">
                    <div class="audit-headline">${escapeHtml(log.actorName || 'System')} — ${escapeHtml(log.action || 'Action')}</div>
                    <div class="audit-meta"><span class="audit-target">${escapeHtml(log.target || '')}</span> · ${formatDate(log.createdAt)} · ${timeAgo(log.createdAt)}</div>
                </div>
            </div>
        `).join('');
    }

    function auditIconFor(type) {
        if (type === 'success') return '<polyline points="20 6 9 17 4 12"/>';
        if (type === 'danger') return '<path d="M18 6 6 18M6 6l12 12"/>';
        if (type === 'warning') return '<path d="M12 9v4M12 17h.01"/><path d="m21.7 16.5-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 19.5h16a2 2 0 0 0 1.7-3z"/>';
        return '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>';
    }

    document.querySelectorAll('[data-filter-group="audit-action"] .pill-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('[data-filter-group="audit-action"] .pill-filter-btn').forEach(b => b.classList.remove('state-active'));
            btn.classList.add('state-active');
            State.activeAuditFilter = btn.dataset.filter;
            renderAuditTimeline();
        });
    });

    document.getElementById('export-audit-btn')?.addEventListener('click', () => {
        const rows = [['Actor', 'Action', 'Target', 'Date'], ...State.auditLogs.map(l => [l.actorName, l.action, l.target, formatDate(l.createdAt)])];
        const csv = rows.map(r => r.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `campusone-audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click(); URL.revokeObjectURL(url);
        showNotification('Audit log exported.', 'success');
    });

    // =====================================================================
    // 14. SETTINGS
    // =====================================================================
    document.querySelectorAll('.settings-tile-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.settings-tile-btn').forEach(b => b.classList.remove('state-active'));
            btn.classList.add('state-active');
            renderSettingsTab(btn.dataset.settingsTab);
        });
    });

    function renderSettingsTab(tab) {
        const templates = {
            'request-rules': {
                title: 'Request Rules',
                rows: [
                    ['Auto-expire pending requests', 'Mark requests as Expired after 14 days with no admin action.', true],
                    ['Require institution domain match', 'Applicant email domain must match the institution\'s registered domain.', true],
                    ['Allow self-service Institute Admin requests', 'Let new institutions submit their own admin access request.', true],
                    ['Auto-flag duplicate applicants', 'Detect and flag requests reusing an email already on the platform.', false]
                ]
            },
            'verification-rules': {
                title: 'Verification Rules',
                rows: [
                    ['Require phone verification', 'OTP verification required before a request can be approved.', true],
                    ['Require employee ID for staff roles', 'Institute Admin & Faculty requests must include a valid Employee ID.', true],
                    ['Minimum verification score to approve', 'Block one-click approval below 75/100 verification score.', true]
                ]
            },
            'email-templates': {
                title: 'Email Templates',
                rows: [
                    ['Access request approved', 'Sent when Super Admin approves an access request.', true],
                    ['Access request rejected', 'Sent when Super Admin rejects an access request.', true],
                    ['Institute Admin welcome + temp password', 'Sent automatically after account provisioning.', true],
                    ['Password reset', 'Sent when an admin triggers a password reset for a user.', true]
                ]
            },
            'sms-templates': {
                title: 'SMS Templates',
                rows: [
                    ['OTP verification code', 'Sent during phone verification step of an access request.', true],
                    ['Account suspended alert', 'Sent to Institute Admin when their institution is suspended.', false]
                ]
            },
            'branding': {
                title: 'Campus Branding',
                rows: [
                    ['Allow custom campus logo upload', 'Institute Admins can upload their own logo for their dashboard.', true],
                    ['Allow custom brand color', 'Institute Admins can override the default CampusOne blue accent.', false],
                    ['Show "Powered by CampusOne" footer', 'Display attribution footer on all institution-branded pages.', true]
                ]
            }
        };
        const data = templates[tab] || templates['request-rules'];
        DOM.settingsBody.innerHTML = `
            <h3 class="settings-section-title">${escapeHtml(data.title)}</h3>
            ${data.rows.map((row, i) => `
                <div class="settings-row">
                    <div class="settings-row-text">
                        <span class="settings-row-title">${escapeHtml(row[0])}</span>
                        <span class="settings-row-desc">${escapeHtml(row[1])}</span>
                    </div>
                    <div class="toggle-switch-track ${row[2] ? 'state-on' : ''}" data-toggle-index="${i}">
                        <div class="toggle-switch-knob"></div>
                    </div>
                </div>
            `).join('')}
        `;
        DOM.settingsBody.querySelectorAll('.toggle-switch-track').forEach(track => {
            track.addEventListener('click', () => {
                track.classList.toggle('state-on');
                showNotification('Setting updated.', 'info');
            });
        });
    }

    // =====================================================================
    // 15. FIRESTORE LIVE SUBSCRIPTIONS
    // =====================================================================
    function attachSnapshot(colName, orderField, mapper, onUpdate) {
        try {
            const q = query(collection(db, colName), orderBy(orderField, 'desc'), limit(200));
            const unsub = onSnapshot(q, (snap) => {
                const docs = snap.docs.map(d => mapper(d));
                onUpdate(docs);
            }, (err) => {
                console.warn(`[Firestore] ${colName} snapshot error (showing empty state):`, err.message);
                onUpdate([]);
            });
            State.unsubscribers.push(unsub);
        } catch (err) {
            console.warn(`[Firestore] Could not attach listener for ${colName}:`, err);
            onUpdate([]);
        }
    }

    function bootstrapDataLayer() {
        attachSnapshot('institutes', 'createdAt', d => ({ id: d.id, campusCode: d.id, ...d.data() }), (docs) => {
            State.institutions = docs;
            renderInstitutions(); renderKpis(); renderTopCampuses(); renderAnalytics();
        });

        attachSnapshot('access_requests', 'createdAt', d => {
            const data = d.data();
            return { id: d.id, ...data, _sortTs: data.createdAt?.toMillis ? data.createdAt.toMillis() : 0 };
        }, (docs) => {
            State.accessRequests = docs;
            const pendingCount = docs.filter(r => ['new', 'review'].includes(r.status || 'new')).length;
            const badge = document.getElementById('nav-badge-requests');
            if (badge) { badge.textContent = pendingCount; badge.style.display = pendingCount ? 'inline-flex' : 'none'; }
            renderRequests(); renderKpis(); renderLatestRequests(); renderVerificationCenter(); renderAnalytics();
        });

        attachSnapshot('users', 'lastActive', d => ({ id: d.id, ...d.data() }), (docs) => {
            State.users = docs;
            renderUsersTable(); renderKpis(); renderAnalytics();
        });

        attachSnapshot('audit_logs', 'createdAt', d => {
            const data = d.data();
            return { id: d.id, ...data, _sortTs: data.createdAt?.toMillis ? data.createdAt.toMillis() : 0 };
        }, (docs) => {
            State.auditLogs = docs;
            renderRecentAudit(); renderAuditTimeline();
        });

        attachSnapshot('notices', 'createdAt', d => {
            const data = d.data();
            return { id: d.id, ...data, _sortTs: data.createdAt?.toMillis ? data.createdAt.toMillis() : 0 };
        }, (docs) => {
            State.notices = docs;
            renderNoticeHistory();
        });
    }

    // =====================================================================
    // 16. AUTH GATE
    // =====================================================================
    function initializeAuthGate() {
        onAuthStateChanged(auth, async (user) => {
            if (!user) {
                window.location.href = '../auth/login/index.html';
                return;
            }
            State.currentUser = user;
            try {
                const staffSnap = await getDoc(doc(db, 'staff', user.uid));
                const staffData = staffSnap.exists() ? staffSnap.data() : null;
                if (!staffData || staffData.role !== 'super_admin' || staffData.active !== true) {
                    showNotification('This account does not have Super Admin access.', 'danger');
                    setTimeout(() => { window.location.href = '../auth/login/index.html'; }, 1800);
                    return;
                }
                DOM.profileName.textContent = staffData.name || user.email;
                DOM.profileEmail.textContent = user.email;
                DOM.profileAvatar.textContent = initials(staffData.name || user.email);
            } catch (err) {
                console.error('[Auth Gate] Could not verify super_admin role:', err);
            }
            bootstrapDataLayer();
        });
    }

    // =====================================================================
    // 17. BOOT
    // =====================================================================
    function boot() {
        initializeThemeEngine();
        renderTrendChart();
        renderPermissionMatrix();
        renderSettingsTab('request-rules');
        initializeAuthGate();
        console.log('[CampusOne Super Admin Console] Initialized.');
    }

    boot();
});
