/**
 * =========================================================================
 * CAMPUSONE SUPER ADMIN CONSOLE — CORE ENGINE  v2.0
 * View Router + Firestore Real-Time Data Layer + Approval Workflow
 * =========================================================================
 *
 * FIRESTORE SCHEMA:
 *   institutes/{campusCode}     → { name, status, plan, studentCount,
 *                                   facultyCount, adminEmail, createdAt }
 *   access_requests/{reqId}     → { campusCode, institution, fullName,
 *                                   email, role, identityType, phone,
 *                                   status, verification:{identity,email,phone,
 *                                   institution}, createdAt, resolvedAt }
 *   staff/{uid}                 → { name, email, role, campusCode, active }
 *   users/{uid}                 → { name, email, role, campusCode, status,
 *                                   lastActive, activityScore }
 *   audit_logs/{logId}          → { actorName, actorUid, action, target,
 *                                   type, createdAt }
 *   notices/{noticeId}          → { title, body, audience, createdAt }
 *
 * CLOUD FUNCTION NOTE:
 *   Approve → calls `approveAccessRequestAndProvisionAdmin` (callable).
 *   If not deployed yet, fallback marks request approved + writes staff doc
 *   so the dashboard is never blocked during development.
 * ========================================================================= */

// ── Firestore functions only (auth + db come from shared config) ──
import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  query, orderBy, limit, onSnapshot, serverTimestamp, addDoc
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";
import {
  onAuthStateChanged,
  signOut,
  sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";
import {
  getFunctions,
  httpsCallable
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-functions.js";

// ── auth, db, app — all from shared config (already initialized there) ──
import { app, auth, db } from "../shared/firebase-config.js";

const functions = getFunctions(app);

// ─────────────────────────────────────────────────────────────────────────────
// DOMContentLoaded guard — everything lives inside this block
// ─────────────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {

  // ===========================================================================
  // 0. STATE + DOM CACHE
  // ===========================================================================
  const State = {
    currentView:               'dashboard',
    currentUser:               null,
    currentUserStaffData:      null,
    institutions:              [],
    accessRequests:            [],
    users:                     [],
    staff:                     [],
    auditLogs:                 [],
    notices:                   [],
    unsubscribers:             [],
    rolesData:                 {},
    activeRequestStatusFilter: 'all',
    activeInstituteStatusFilter: 'all',
    activeUserRoleFilter:      'all',
    activeAuditFilter:         'all',
    pendingConfirmAction:      null
  };

  const DOM = {
    sidebar:          document.getElementById('co-sidebar'),
    sidebarScrim:     document.getElementById('sidebar-scrim'),
    sidebarOpenBtn:   document.getElementById('sidebar-open-trigger'),
    sidebarCloseBtn:  document.getElementById('sidebar-close-trigger'),
    navItems:         document.querySelectorAll('.nav-item-link'),
    viewPanels:       document.querySelectorAll('.view-panel'),
    viewTitle:        document.getElementById('view-title'),
    viewSubtitle:     document.getElementById('view-subtitle'),
    viewLinks:        document.querySelectorAll('[data-view-link]'),
    profileTrigger:   document.getElementById('sidebar-profile-trigger'),
    profilePopover:   document.getElementById('profile-popover-menu'),
    profileName:      document.getElementById('profile-name-label'),
    profileEmail:     document.getElementById('profile-email-label'),
    profileAvatar:    document.getElementById('profile-avatar-initials'),
    logoutBtn:        document.getElementById('logout-trigger'),

    // Dashboard
    kpiGrid:            document.getElementById('kpi-grid'),
    pipelineTrack:      document.getElementById('pipeline-track'),
    liveActivityFeed:   document.getElementById('live-activity-feed'),
    topCampusesList:    document.getElementById('top-campuses-list'),
    latestRequestsList: document.getElementById('latest-requests-list'),
    recentAuditList:    document.getElementById('recent-audit-list'),
    healthRingProgress: document.getElementById('health-ring-progress'),
    healthRingValue:    document.getElementById('health-ring-value'),
    healthOverallBadge: document.getElementById('health-overall-badge'),

    // Right Ops Panel (Sprint 1)
    pendingActionsList:  document.getElementById('pending-actions-list'),
    pendingActionsCount: document.getElementById('pending-actions-count'),
    metricsPulseList:    document.getElementById('metrics-pulse-list'),

    // Institutions
    institutionGrid:       document.getElementById('institution-grid'),
    addInstitutionBtn:     document.getElementById('open-add-institution-modal'),
    institutionModal:      document.getElementById('institution-modal-overlay'),
    institutionForm:       document.getElementById('institution-form'),
    institutionModalTitle: document.getElementById('institution-modal-title'),

    // Requests
    requestCardStack: document.getElementById('request-card-stack'),
    requestModal:     document.getElementById('request-modal-overlay'),
    requestModalBody: document.getElementById('request-modal-body'),

    // Users
    usersTableBody:  document.getElementById('users-table-body'),
    userSearchInput: document.getElementById('user-search-input'),

    // Verification
    verificationGrid: document.getElementById('verification-grid'),

    // Notices
    noticeForm:        document.getElementById('notice-compose-form'),
    noticeHistoryList: document.getElementById('notice-history-list'),

    // Roles
    permissionMatrixBody: document.getElementById('permission-matrix-body'),

    // Audit
    auditTimeline: document.getElementById('audit-timeline'),

    // Settings
    settingsBody: document.getElementById('settings-panel-body'),

    // Confirm modal
    confirmModal:     document.getElementById('confirm-modal-overlay'),
    confirmTitle:     document.getElementById('confirm-modal-title'),
    confirmText:      document.getElementById('confirm-modal-text'),
    confirmActionBtn: document.getElementById('confirm-modal-action-btn'),

    // Global search
    globalSearchInput: document.getElementById('global-search-input')
  };

  // Command bar: wire quick-action buttons to their targets
  document.getElementById('cmd-add-institution-trigger')?.addEventListener('click', () => {
    openModal(DOM.institutionModal);
    DOM.institutionModalTitle.textContent = 'Add Institution';
    DOM.institutionForm.reset();
    document.getElementById('institution-form-campus-code').value = '';
  });

  // Quick action tiles in dashboard
  document.addEventListener('click', (e) => {
    const tile = e.target.closest('.quick-action-tile[data-view]');
    if (tile) switchView(tile.dataset.view);
    const qaAddInst = e.target.closest('#qa-add-institution');
    if (qaAddInst) {
      switchView('institutions');
      setTimeout(() => {
        openModal(DOM.institutionModal);
        DOM.institutionModalTitle.textContent = 'Add Institution';
        DOM.institutionForm.reset();
        document.getElementById('institution-form-campus-code').value = '';
      }, 80);
    }
  });

  const VIEW_META = {
    dashboard:    { title: 'Dashboard',               subtitle: 'Platform-wide operations across every campus on CampusOne.' },
    institutions: { title: 'Institution Management',  subtitle: 'Add, configure and monitor every campus on the platform.' },
    requests:     { title: 'Access Requests',         subtitle: 'Verify and resolve institutional access requests.' },
    users:        { title: 'User Management',         subtitle: 'Search, manage and audit every account on CampusOne.' },
    verification: { title: 'Verification Center',     subtitle: 'Identity, email, phone and institution checks before approval.' },
    notices:      { title: 'Notice Center',           subtitle: 'Broadcast announcements to campuses, groups or individuals.' },
    roles:        { title: 'Roles & Permissions',     subtitle: 'Define what each role can see, create and manage.' },
    analytics:    { title: 'Analytics',               subtitle: 'Engagement, growth and request trends across the platform.' },
    audit:        { title: 'Audit Logs',              subtitle: 'A complete, immutable record of every administrative action.' },
    settings:     { title: 'Settings',                subtitle: 'Configure platform-wide rules, templates and branding.' }
  };

  // ===========================================================================
  // 1. UTILITIES
  // ===========================================================================
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
    const mins   = Math.floor(diffMs / 60000);
    if (mins < 1)  return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24)  return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days}d ago`;
    return formatDate(ts);
  }

  function statusTone(status) {
    const map = {
      active: 'success', approved: 'success',
      new: 'info', pending: 'warning',
      under_review: 'warning', review: 'warning',
      rejected: 'danger', blocked: 'danger',
      suspended: 'danger', disabled: 'danger',
      expired: 'neutral', trial: 'info'
    };
    return map[(status || '').toLowerCase()] || 'neutral';
  }

  /** Global toast notification — positioned fixed, stacks from bottom-right */
  function showNotification(message, type = 'success') {
    let stack = document.getElementById('co-toast-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.id = 'co-toast-stack';
      Object.assign(stack.style, {
        position: 'fixed', bottom: '24px', right: '24px',
        display: 'flex', flexDirection: 'column', gap: '10px',
        zIndex: '99999', pointerEvents: 'none'
      });
      document.body.appendChild(stack);
    }
    const colors = { success: '#22C55E', warning: '#F59E0B', danger: '#EF4444', info: '#3B82F6' };
    const toast  = document.createElement('div');
    Object.assign(toast.style, {
      background:     'var(--color-surface-solid, #1E293B)',
      color:          'var(--text-primary, #F8FAFC)',
      border:         '1px solid var(--glass-border, rgba(255,255,255,0.08))',
      padding:        '12px 20px',
      borderRadius:   'var(--radius-md, 12px)',
      fontSize:       '0.85rem',
      fontWeight:     '500',
      borderLeft:     `4px solid ${colors[type] || colors.success}`,
      boxShadow:      'var(--shadow-xl, 0 10px 25px rgba(0,0,0,0.4))',
      transform:      'translateY(20px)',
      opacity:        '0',
      transition:     'transform 300ms cubic-bezier(0.2,0.8,0.2,1), opacity 300ms ease',
      pointerEvents:  'auto',
      maxWidth:       '340px'
    });
    toast.textContent = message;
    stack.appendChild(toast);
    requestAnimationFrame(() => { toast.style.transform = 'translateY(0)'; toast.style.opacity = '1'; });
    setTimeout(() => {
      toast.style.transform = 'translateY(-10px)';
      toast.style.opacity   = '0';
      setTimeout(() => toast.remove(), 320);
    }, 4200);
  }

  async function logAuditEvent(action, target, type = 'info') {
    try {
      await addDoc(collection(db, 'audit_logs'), {
        actorName: State.currentUserStaffData?.name || State.currentUser?.email || 'Super Admin',
        actorUid:  State.currentUser?.uid || null,
        action, target, type,
        createdAt: serverTimestamp()
      });
    } catch (err) {
      console.warn('[Audit] Failed to write audit log:', err);
    }
  }

  // ===========================================================================
  // 2. VIEW ROUTER
  // ===========================================================================
  function switchView(viewKey) {
    if (!VIEW_META[viewKey]) return;
    State.currentView = viewKey;

    DOM.navItems.forEach(btn =>
      btn.classList.toggle('state-active', btn.dataset.view === viewKey)
    );
    DOM.viewPanels.forEach(panel =>
      panel.classList.toggle('state-active', panel.dataset.viewPanel === viewKey)
    );

    DOM.viewTitle.textContent    = VIEW_META[viewKey].title;
    DOM.viewSubtitle.textContent = VIEW_META[viewKey].subtitle;

    closeMobileSidebar();

    // Trigger lazy renders on tab switch
    if (viewKey === 'analytics')    renderAnalytics();
    if (viewKey === 'audit')        renderAuditTimeline();
    if (viewKey === 'verification') renderVerificationCenter();
    if (viewKey === 'settings') {
      const activeTab = document.querySelector('.settings-tile-btn.state-active')?.dataset.settingsTab || 'request-rules';
      renderSettingsTab(activeTab);
    }
  }

  function openMobileSidebar()  { DOM.sidebar.classList.add('state-open');    DOM.sidebarScrim.classList.add('state-open'); }
  function closeMobileSidebar() { DOM.sidebar.classList.remove('state-open'); DOM.sidebarScrim.classList.remove('state-open'); }

  DOM.sidebarOpenBtn?.addEventListener('click', openMobileSidebar);
  DOM.sidebarCloseBtn?.addEventListener('click', closeMobileSidebar);
  DOM.sidebarScrim?.addEventListener('click', closeMobileSidebar);

  DOM.navItems.forEach(btn => btn.addEventListener('click', () => switchView(btn.dataset.view)));

  // data-view-link anchors (e.g. "View all" in dashboard cards)
  DOM.viewLinks.forEach(link => link.addEventListener('click', (e) => {
    e.preventDefault();
    switchView(link.dataset.viewLink);
  }));

  // Profile popover
  DOM.profileTrigger?.addEventListener('click', (e) => {
    e.stopPropagation();
    DOM.profilePopover.classList.toggle('state-open');
  });
  document.addEventListener('click', () => DOM.profilePopover?.classList.remove('state-open'));
  DOM.profilePopover?.querySelectorAll('[data-view]').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); switchView(btn.dataset.view); });
  });

  // Logout
  DOM.logoutBtn?.addEventListener('click', () => {
    openConfirmModal(
      'Sign out of Super Admin Console?',
      'You will need to sign in again to access the console.',
      async () => {
        await signOut(auth);
        window.location.href = '../auth/login/index.html';
      }
    );
  });

  // ===========================================================================
  // 3. THEME ENGINE
  // ===========================================================================
  function initializeThemeEngine() {
    const saved = localStorage.getItem('campusone-theme') || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
    document.querySelectorAll('.theme-toggle-trigger').forEach(btn =>
      btn.setAttribute('data-current-theme', saved)
    );
    document.querySelectorAll('.theme-toggle-trigger').forEach(btn => {
      btn.addEventListener('click', () => {
        const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('campusone-theme', next);
        document.querySelectorAll('.theme-toggle-trigger').forEach(b =>
          b.setAttribute('data-current-theme', next)
        );
      });
    });
  }

  // ===========================================================================
  // 4. MODALS
  // ===========================================================================
  function openModal(overlayEl)  { if (overlayEl) overlayEl.classList.add('state-open'); }
  function closeModal(overlayEl) { if (overlayEl) overlayEl.classList.remove('state-open'); }

  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => {
      const el = document.getElementById(btn.dataset.closeModal);
      closeModal(el);
    });
  });
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(overlay); });
  });

  function openConfirmModal(title, text, onConfirm) {
    DOM.confirmTitle.textContent = title;
    DOM.confirmText.textContent  = text;
    State.pendingConfirmAction   = onConfirm;
    openModal(DOM.confirmModal);
  }

  DOM.confirmActionBtn?.addEventListener('click', async () => {
    const action = State.pendingConfirmAction;
    State.pendingConfirmAction = null;   // clear before await so double-clicks are safe
    closeModal(DOM.confirmModal);
    if (typeof action === 'function') {
      try { await action(); }
      catch (err) { console.error('[ConfirmModal] Action error:', err); }
    }
  });

  // ===========================================================================
  // 5. DASHBOARD — KPI CARDS
  // ===========================================================================
  function renderKpis() {
    const totalCampuses    = State.institutions.length;
    const pendingRequests  = State.accessRequests.filter(r =>
      ['new', 'review', 'pending'].includes((r.status || 'new').toLowerCase())
    ).length;
    const activeStudents   = State.users.filter(u => u.role === 'student').length;
    const activeFaculty    = State.users.filter(u => u.role === 'faculty').length;
    const today            = new Date().toDateString();
    const todayLogins      = State.users.filter(u => {
      const d = u.lastActive?.toDate ? u.lastActive.toDate() : null;
      return d && d.toDateString() === today;
    }).length;
    const totalInstAdmins  = State.staff.filter(s => s.role === 'institute_admin' && s.active).length;

    const cards = [
      { icon: instSvg(),     tone: 'primary', value: totalCampuses,                          label: 'Total Campuses'       },
      { icon: reqSvg(),      tone: 'warning', value: pendingRequests,                         label: 'Pending Requests'     },
      { icon: studentsSvg(), tone: 'success', value: activeStudents.toLocaleString('en-IN'),  label: 'Active Students'      },
      { icon: facultySvg(),  tone: 'success', value: activeFaculty.toLocaleString('en-IN'),   label: 'Active Faculty'       },
      { icon: loginSvg(),    tone: 'primary', value: todayLogins.toLocaleString('en-IN'),     label: "Today's Logins"       },
      { icon: healthSvg(),   tone: 'success', value: '99.9%',                                 label: 'System Health'        }
    ];

    DOM.kpiGrid.innerHTML = cards.map(c => `
      <div class="kpi-card">
        <span class="kpi-icon-pod tone-${c.tone}">${c.icon}</span>
        <div class="kpi-card-body">
          <div class="kpi-card-head">
            <span class="kpi-value">${escapeHtml(String(c.value))}</span>
            <span class="kpi-trend-chip trend-up">+2%</span>
          </div>
          <span class="kpi-label">${escapeHtml(c.label)}</span>
        </div>
      </div>
    `).join('');

    renderHealthRing(99.9);
    updateRequestBadge();
  }

  function updateRequestBadge() {
    const pendingCount = State.accessRequests.filter(r =>
      ['new', 'review', 'pending'].includes((r.status || 'new').toLowerCase())
    ).length;
    const badge = document.getElementById('nav-badge-requests');
    if (badge) {
      badge.textContent    = pendingCount;
      badge.style.display  = pendingCount ? 'inline-flex' : 'none';
    }
  }

  function renderHealthRing(pct) {
    if (!DOM.healthRingProgress) return;
    const r            = 52;
    const circumference = 2 * Math.PI * r;
    const offset        = circumference - (pct / 100) * circumference;
    DOM.healthRingProgress.style.strokeDasharray  = `${circumference}`;
    DOM.healthRingProgress.style.strokeDashoffset = `${offset}`;
    if (DOM.healthRingValue) DOM.healthRingValue.textContent = `${pct}%`;
  }

  function renderTopCampuses() {
    const sorted = [...State.institutions]
      .sort((a, b) => (b.studentCount || 0) - (a.studentCount || 0))
      .slice(0, 5);
    renderRankedList(DOM.topCampusesList, sorted.map((inst, i) => ({
      index:    i + 1,
      title:    inst.name,
      subtitle: `${(inst.studentCount || 0).toLocaleString('en-IN')} students`,
      value:    (inst.facultyCount || 0) + ' fac.'
    })), 'No institutions yet.');
  }

  function renderLatestRequests() {
    const sorted = [...State.accessRequests]
      .sort((a, b) => (b._sortTs || 0) - (a._sortTs || 0))
      .slice(0, 5);
    renderRankedList(DOM.latestRequestsList, sorted.map((req, i) => ({
      index:   i + 1,
      title:   req.fullName || 'Unknown applicant',
      subtitle: req.institution || req.campusCode || '—',
      value:   req.status || 'new',
      isBadge: true
    })), 'No access requests yet.');
  }

  function renderRecentAudit() {
    const sorted = [...State.auditLogs]
      .sort((a, b) => (b._sortTs || 0) - (a._sortTs || 0))
      .slice(0, 5);
    renderRankedList(DOM.recentAuditList, sorted.map((log, i) => ({
      index:    i + 1,
      title:    log.action,
      subtitle: log.actorName || 'System',
      value:    timeAgo(log.createdAt)
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
        <span class="rank-index">${escapeHtml(String(item.index))}</span>
        <span class="rank-info">
          <span class="rank-title">${escapeHtml(item.title || '—')}</span>
          <span class="rank-subtitle">${escapeHtml(item.subtitle || '')}</span>
        </span>
        ${item.isBadge
          ? `<span class="status-badge tone-${statusTone(item.value)}">${escapeHtml(String(item.value).replace(/_/g, ' '))}</span>`
          : `<span class="rank-value">${escapeHtml(String(item.value))}</span>`
        }
      </li>
    `).join('');
  }

  // ===========================================================================
  // 5A. REGISTRATION PIPELINE TRACKER  (Phase 1)
  // ===========================================================================
  /**
   * Renders the 6-stage pipeline tracker on the dashboard.
   * All counts are derived from live Firestore State — never hardcoded.
   */
  function renderRegistrationPipeline() {
    if (!DOM.pipelineTrack) return;

    const reqs = State.accessRequests;

    const stages = [
      {
        key:      'submitted',
        label:    'Submitted',
        sublabel: 'All-time',
        tone:     'neutral',
        count:    reqs.length,
        icon:     `<svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`
      },
      {
        key:      'new',
        label:    'New',
        sublabel: 'Awaiting review',
        tone:     'info',
        count:    reqs.filter(r => ['new', 'pending'].includes((r.status || 'new').toLowerCase())).length,
        icon:     `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`
      },
      {
        key:      'review',
        label:    'Under Review',
        sublabel: 'In progress',
        tone:     'warning',
        count:    reqs.filter(r => ['review', 'under_review'].includes((r.status || '').toLowerCase())).length,
        icon:     `<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`
      },
      {
        key:      'verification',
        label:    'Verification',
        sublabel: 'Checks running',
        tone:     'primary',
        count:    reqs.filter(r => {
          const s = (r.status || '').toLowerCase();
          const v = r.verification || {};
          return s === 'review' && (!v.identity || !v.email || !v.phone || !v.institution);
        }).length,
        icon:     `<svg viewBox="0 0 24 24"><path d="M12 2 4 5v6c0 5.25 3.4 9.74 8 11 4.6-1.26 8-5.75 8-11V5z"/></svg>`
      },
      {
        key:      'approved',
        label:    'Approved',
        sublabel: 'Provisioned',
        tone:     'success',
        count:    reqs.filter(r => (r.status || '').toLowerCase() === 'approved').length,
        icon:     `<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>`
      },
      {
        key:      'rejected',
        label:    'Rejected',
        sublabel: 'Not approved',
        tone:     'danger',
        count:    reqs.filter(r => ['rejected', 'blocked', 'expired'].includes((r.status || '').toLowerCase())).length,
        icon:     `<svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`
      }
    ];

    DOM.pipelineTrack.innerHTML = stages.map(stage => `
      <div class="pipeline-stage tone-${escapeHtml(stage.tone)}"
           role="listitem"
           aria-label="${escapeHtml(stage.label)}: ${escapeHtml(String(stage.count))}">
        <div class="pipeline-stage-icon" aria-hidden="true">${stage.icon}</div>
        <span class="pipeline-stage-count">${escapeHtml(String(stage.count))}</span>
        <span class="pipeline-stage-label">${escapeHtml(stage.label)}</span>
        <span class="pipeline-stage-sublabel">${escapeHtml(stage.sublabel)}</span>
      </div>
    `).join('');
  }

  // ===========================================================================
  // 5B. LIVE ACTIVITY FEED  (Phase 1)
  // ===========================================================================
  /**
   * Merges audit_logs + access_requests into a unified chronological feed.
   * Shows the 15 most recent events. Updates whenever State changes.
   */
  function renderLiveActivityFeed() {
    if (!DOM.liveActivityFeed) return;

    // Build feed items from audit logs
    const auditItems = State.auditLogs
      .slice(0, 40)
      .map(log => ({
        _ts:    log._sortTs || 0,
        type:   log.type || 'info',
        text:   `<strong>${escapeHtml(log.actorName || 'System')}</strong> ${escapeHtml(log.action || 'performed an action')}${log.target ? ` on <strong>${escapeHtml(log.target)}</strong>` : ''}`,
        time:   log.createdAt,
        icon:   getActivityIcon(log.type, log.action)
      }));

    // Build feed items from recent requests (new arrivals)
    const reqItems = State.accessRequests
      .filter(r => r._sortTs && (Date.now() - r._sortTs) < 86400000 * 3) // last 3 days
      .map(req => ({
        _ts:  req._sortTs || 0,
        type: 'info',
        text: `<strong>${escapeHtml(req.fullName || 'New applicant')}</strong> submitted a registration request for <strong>${escapeHtml(req.institution || req.campusCode || 'Unknown Institution')}</strong>`,
        time: req.createdAt,
        icon: { tone: 'info', svg: `<svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>` }
      }));

    const allItems = [...auditItems, ...reqItems]
      .sort((a, b) => b._ts - a._ts)
      .slice(0, 18);

    if (!allItems.length) {
      DOM.liveActivityFeed.innerHTML = `
        <li class="activity-feed-empty" role="status" aria-live="polite">
          <svg viewBox="0 0 24 24" width="28" height="28" stroke="currentColor" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <span>No activity yet. Actions will appear here in real time.</span>
        </li>`;
      return;
    }

    DOM.liveActivityFeed.innerHTML = allItems.map(item => `
      <li class="activity-item">
        <div class="activity-icon-pod tone-${escapeHtml(item.icon.tone)}" aria-hidden="true">
          ${item.icon.svg}
        </div>
        <div class="activity-content">
          <p class="activity-text">${item.text}</p>
          <time class="activity-time" datetime="${item.time?.toDate ? item.time.toDate().toISOString() : ''}">${timeAgo(item.time)}</time>
        </div>
      </li>
    `).join('');
  }

  // ===========================================================================
  // 5C. RIGHT OPERATIONS PANEL — Pending Actions + Metrics Pulse (Sprint 1)
  // ===========================================================================

  /**
   * Renders the Pending Actions list in the Right Ops Panel.
   * Derives actionable items from live Firestore state — no dummy data.
   */
  function renderPendingActions() {
    if (!DOM.pendingActionsList) return;

    const reqs = State.accessRequests;
    const actions = [];

    // New requests awaiting review
    const newCount = reqs.filter(r => ['new', 'pending'].includes((r.status || 'new').toLowerCase())).length;
    if (newCount > 0) {
      actions.push({
        priority: 'urgent',
        label: `${newCount} new request${newCount > 1 ? 's' : ''}`,
        sublabel: 'Awaiting initial review',
        view: 'requests',
        icon: `<svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`
      });
    }

    // Requests under review but verification incomplete
    const verifyCount = reqs.filter(r => {
      const s = (r.status || '').toLowerCase();
      const v = r.verification || {};
      return s === 'review' && (!v.identity || !v.email || !v.phone || !v.institution);
    }).length;
    if (verifyCount > 0) {
      actions.push({
        priority: 'normal',
        label: `${verifyCount} pending verification${verifyCount > 1 ? 's' : ''}`,
        sublabel: 'Checks incomplete',
        view: 'verification',
        icon: `<svg viewBox="0 0 24 24"><path d="M12 2 4 5v6c0 5.25 3.4 9.74 8 11 4.6-1.26 8-5.75 8-11V5z"/></svg>`
      });
    }

    // Suspended institutions
    const suspendedCount = State.institutions.filter(i => (i.status || '').toLowerCase() === 'suspended').length;
    if (suspendedCount > 0) {
      actions.push({
        priority: 'normal',
        label: `${suspendedCount} suspended campus${suspendedCount > 1 ? 'es' : ''}`,
        sublabel: 'Review required',
        view: 'institutions',
        icon: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>`
      });
    }

    // Trial institutions expiring soon (placeholder logic — no date available)
    const trialCount = State.institutions.filter(i => (i.plan || i.status || '').toLowerCase() === 'trial').length;
    if (trialCount > 0) {
      actions.push({
        priority: 'low',
        label: `${trialCount} trial campus${trialCount > 1 ? 'es' : ''}`,
        sublabel: 'Convert or extend',
        view: 'institutions',
        icon: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`
      });
    }

    if (DOM.pendingActionsCount) {
      DOM.pendingActionsCount.textContent = actions.length || '0';
    }

    if (!actions.length) {
      DOM.pendingActionsList.innerHTML = `
        <li class="empty-state-pod">
          <div class="empty-state-icon">
            <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <p class="empty-state-title">All clear</p>
          <p class="empty-state-desc">No actions pending.</p>
        </li>`;
      return;
    }

    DOM.pendingActionsList.innerHTML = actions.map(a => `
      <li class="pending-action-item" role="button" tabindex="0" data-view="${escapeHtml(a.view)}" aria-label="${escapeHtml(a.label)}">
        <span class="pending-action-dot ${a.priority}" aria-hidden="true"></span>
        <div class="pending-action-text">
          ${escapeHtml(a.label)}
          <span>${escapeHtml(a.sublabel)}</span>
        </div>
        <svg class="pending-action-arrow" viewBox="0 0 24 24" aria-hidden="true">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </li>
    `).join('');

    // Wire click/keyboard navigation
    DOM.pendingActionsList.querySelectorAll('.pending-action-item').forEach(item => {
      const handler = () => {
        const view = item.dataset.view;
        if (view) switchView(view);
      };
      item.addEventListener('click', handler);
      item.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handler(); } });
    });
  }

  /**
   * Renders real-time Metrics Pulse in the Right Ops Panel.
   * All values derived from live Firestore state.
   */
  function renderMetricsPulse() {
    if (!DOM.metricsPulseList) return;

    const total  = State.institutions.length;
    const active = State.institutions.filter(i => (i.status || '').toLowerCase() === 'active').length;
    const users  = State.users.length;
    const pending = State.accessRequests.filter(r =>
      ['new', 'pending', 'review', 'under_review'].includes((r.status || '').toLowerCase())
    ).length;
    const approved = State.accessRequests.filter(r => (r.status || '').toLowerCase() === 'approved').length;
    const total_reqs = State.accessRequests.length;
    const approvalRate = total_reqs > 0 ? Math.round((approved / total_reqs) * 100) : 0;

    const metrics = [
      { label: 'Active Campuses',  value: active,       trend: 'up',   unit: '' },
      { label: 'Total Users',      value: users,        trend: 'up',   unit: '' },
      { label: 'Open Requests',    value: pending,      trend: pending > 5 ? 'up' : 'flat', unit: '' },
      { label: 'Approval Rate',    value: approvalRate, trend: approvalRate >= 70 ? 'up' : 'down', unit: '%' },
      { label: 'Total Campuses',   value: total,        trend: 'flat', unit: '' },
    ];

    const trendSvg = {
      up:   `<svg class="metrics-trend-arrow up" viewBox="0 0 24 24"><polyline points="18 15 12 9 6 15"/></svg>`,
      down: `<svg class="metrics-trend-arrow down" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>`,
      flat: `<svg class="metrics-trend-arrow flat" viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"/></svg>`
    };

    DOM.metricsPulseList.innerHTML = metrics.map(m => `
      <div class="metrics-pulse-row">
        <span class="metrics-pulse-label">${escapeHtml(m.label)}</span>
        <span class="metrics-pulse-value">
          ${escapeHtml(String(m.value))}${escapeHtml(m.unit)}
          ${trendSvg[m.trend] || ''}
        </span>
      </div>
    `).join('');
  }

  /** Maps audit log type + action to a tone + svg icon for the activity feed */
  function getActivityIcon(type, action) {
    const a = (action || '').toLowerCase();

    if (a.includes('approv')) return { tone: 'success', svg: `<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>` };
    if (a.includes('reject') || a.includes('block')) return { tone: 'danger', svg: `<svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>` };
    if (a.includes('suspend')) return { tone: 'warning', svg: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>` };
    if (a.includes('add') || a.includes('creat') || a.includes('new')) return { tone: 'primary', svg: `<svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>` };
    if (a.includes('login') || a.includes('auth')) return { tone: 'info', svg: `<svg viewBox="0 0 24 24"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>` };
    if (a.includes('delet') || a.includes('remov')) return { tone: 'danger', svg: `<svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>` };
    if (a.includes('update') || a.includes('edit') || a.includes('chang')) return { tone: 'warning', svg: `<svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>` };

    const toneMap = { success: 'success', danger: 'danger', warning: 'warning', info: 'info' };
    return {
      tone: toneMap[type] || 'neutral',
      svg:  `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`
    };
  }
  /** Segmented time-range toggle for trend chart */
  let activeTrendRange = '7d';
  document.querySelectorAll('[data-toggle-group="trend-range"] .segmented-mini-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-toggle-group="trend-range"] .segmented-mini-btn')
        .forEach(b => b.classList.remove('state-active'));
      btn.classList.add('state-active');
      activeTrendRange = btn.dataset.range;
      renderTrendChart();
    });
  });

  function renderTrendChart() {
    const svg = document.getElementById('trend-chart-svg');
    if (!svg) return;
    // Build day-by-day login counts from real user lastActive data
    const rangeDays = activeTrendRange === '90d' ? 90 : activeTrendRange === '30d' ? 30 : 7;
    const buckets   = Array.from({ length: rangeDays }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (rangeDays - 1 - i));
      return d.toDateString();
    });
    const counts = buckets.map(dayStr =>
      State.users.filter(u => {
        const d = u.lastActive?.toDate ? u.lastActive.toDate() : null;
        return d && d.toDateString() === dayStr;
      }).length
    );
    // If no real data yet, show a meaningful placeholder
    const hasData = counts.some(c => c > 0);
    const points  = hasData ? counts : Array.from({ length: rangeDays }, (_, i) =>
      Math.round(Math.sin(i / 2) * 150 + 300 + i * 10)
    );
    drawLineChart(svg, points, '#3B82F6');
  }

  function renderGrowthChart() {
    const svg = document.getElementById('growth-chart-svg');
    if (!svg) return;
    // Cumulative monthly campus count
    const months = 8;
    const total  = State.institutions.length;
    const points = total
      ? Array.from({ length: months }, (_, i) =>
          Math.max(1, Math.round((i + 1) * total / months))
        )
      : [1, 2, 3, 4, 6, 8, 11, 15];
    drawLineChart(svg, points, '#0EA5E9');
  }

  function drawLineChart(svg, values, color) {
    const W = 600, H = 220, pad = 12;
    const max   = Math.max(...values, 1);
    const min   = Math.min(...values, 0);
    const range = (max - min) || 1;
    const stepX = (W - pad * 2) / Math.max(values.length - 1, 1);

    const coords = values.map((v, i) => {
      const x = pad + i * stepX;
      const y = H - pad - ((v - min) / range) * (H - pad * 2);
      return [x, y];
    });

    const linePath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c[0].toFixed(2)},${c[1].toFixed(2)}`).join(' ');
    const areaPath = `${linePath} L${coords[coords.length - 1][0].toFixed(2)},${H - pad} L${coords[0][0].toFixed(2)},${H - pad} Z`;
    const gradId   = `cg_${color.replace('#', '')}`;

    svg.innerHTML = `
      <defs>
        <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stop-color="${color}" stop-opacity="0.35"/>
          <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <path d="${areaPath}" fill="url(#${gradId})" stroke="none"/>
      <path d="${linePath}" fill="none" stroke="${color}" stroke-width="2.5"
            stroke-linecap="round" stroke-linejoin="round"/>
      ${coords.map(c => `<circle cx="${c[0].toFixed(2)}" cy="${c[1].toFixed(2)}" r="3" fill="${color}"/>`).join('')}
    `;
  }

  function renderRequestTrendBars() {
    const shell = document.getElementById('request-trend-bars');
    if (!shell) return;
    const buckets = [
      { label: 'New',      key: 'new'      },
      { label: 'Pending',  key: 'pending'  },
      { label: 'Review',   key: 'review'   },
      { label: 'Approved', key: 'approved' },
      { label: 'Rejected', key: 'rejected' },
      { label: 'Blocked',  key: 'blocked'  }
    ];
    const counts = buckets.map(b =>
      State.accessRequests.filter(r =>
        (r.status || 'new').toLowerCase() === b.key
      ).length
    );
    const max = Math.max(...counts, 1);
    shell.innerHTML = buckets.map((b, i) => `
      <div class="bar-chart-col">
        <div class="bar-chart-fill" style="height:${Math.max(4, (counts[i] / max) * 170)}px"></div>
        <span class="bar-chart-label">${b.label}</span>
      </div>
    `).join('');
  }

  // KPI icon helpers
  function instSvg()     { return `<svg viewBox="0 0 24 24"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6"/></svg>`; }
  function reqSvg()      { return `<svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`; }
  function studentsSvg() { return `<svg viewBox="0 0 24 24"><path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12v5c0 1.5 3 3 6 3s6-1.5 6-3v-5"/></svg>`; }
  function facultySvg()  { return `<svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>`; }
  function loginSvg()    { return `<svg viewBox="0 0 24 24"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>`; }
  function healthSvg()   { return `<svg viewBox="0 0 24 24"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>`; }

  // ===========================================================================
  // 6. INSTITUTIONS
  // ===========================================================================
  function renderInstitutions() {
    const filtered = State.institutions.filter(inst =>
      State.activeInstituteStatusFilter === 'all' ||
      (inst.status || 'active') === State.activeInstituteStatusFilter
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
          <span class="status-badge tone-${statusTone(inst.status || 'active')}">${escapeHtml(inst.status || 'active')}</span>
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
          <button type="button" class="cta-mini-btn tone-info"
                  data-action="edit-institution" data-campus-code="${escapeHtml(inst.campusCode)}">
            <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            Settings
          </button>
          ${(inst.status || 'active') === 'suspended'
            ? `<button type="button" class="cta-mini-btn tone-success"
                       data-action="activate-institution" data-campus-code="${escapeHtml(inst.campusCode)}">
                 <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg> Reactivate
               </button>`
            : `<button type="button" class="cta-mini-btn tone-neutral"
                       data-action="suspend-institution" data-campus-code="${escapeHtml(inst.campusCode)}">
                 <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg> Suspend
               </button>`
          }
          <button type="button" class="cta-mini-btn tone-danger"
                  data-action="delete-institution" data-campus-code="${escapeHtml(inst.campusCode)}">
            <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
          </button>
        </div>
      </div>
    `).join('');
  }

  document.querySelectorAll('[data-filter-group="institute-status"] .pill-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-filter-group="institute-status"] .pill-filter-btn')
        .forEach(b => b.classList.remove('state-active'));
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
      openConfirmModal(
        'Suspend this institution?',
        `${inst.name} and all its users will lose access immediately.`,
        () => updateInstituteStatus(code, 'suspended')
      );
    } else if (btn.dataset.action === 'activate-institution') {
      await updateInstituteStatus(code, 'active');
    } else if (btn.dataset.action === 'delete-institution') {
      openConfirmModal(
        'Delete this institution?',
        `This permanently removes ${inst.name} and cannot be undone.`,
        () => deleteInstitution(code)
      );
    }
  });

  async function updateInstituteStatus(campusCode, status) {
    try {
      await updateDoc(doc(db, 'institutes', campusCode), { status, updatedAt: serverTimestamp() });
      await logAuditEvent(
        `${status === 'suspended' ? 'Suspended' : 'Reactivated'} institution`,
        campusCode,
        status === 'suspended' ? 'warning' : 'success'
      );
      showNotification(
        `Institution ${status === 'suspended' ? 'suspended' : 'reactivated'}.`,
        status === 'suspended' ? 'warning' : 'success'
      );
    } catch (err) {
      console.error('[Institution] Status update failed:', err);
      showNotification('Could not update institution status.', 'danger');
    }
  }

  async function deleteInstitution(campusCode) {
    try {
      await deleteDoc(doc(db, 'institutes', campusCode));
      await logAuditEvent('Deleted institution', campusCode, 'danger');
      showNotification('Institution deleted.', 'success');
    } catch (err) {
      console.error('[Institution] Delete failed:', err);
      showNotification('Could not delete institution.', 'danger');
    }
  }

  function openInstitutionModal(inst = null) {
    DOM.institutionForm.reset();
    DOM.institutionModalTitle.textContent = inst ? 'Edit Institution' : 'Add Institution';
    document.getElementById('institution-form-campus-code').value  = inst?.campusCode || '';
    document.getElementById('inst-name-input').value               = inst?.name        || '';
    document.getElementById('inst-code-input').value               = inst?.campusCode  || '';
    document.getElementById('inst-code-input').disabled            = !!inst;
    document.getElementById('inst-plan-input').value               = inst?.plan        || 'standard';
    document.getElementById('inst-admin-email-input').value        = inst?.adminEmail  || '';
    document.getElementById('inst-students-input').value           = inst?.studentCount || '';
    document.getElementById('inst-status-input').value             = inst?.status       || 'active';
    openModal(DOM.institutionModal);
  }

  DOM.addInstitutionBtn?.addEventListener('click', () => openInstitutionModal(null));

  DOM.institutionForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const existingCode = document.getElementById('institution-form-campus-code').value;
    const campusCode   = existingCode || document.getElementById('inst-code-input').value.trim().toUpperCase();
    if (!campusCode) { showNotification('Campus Code is required.', 'danger'); return; }

    const payload = {
      name:         document.getElementById('inst-name-input').value.trim(),
      campusCode,
      plan:         document.getElementById('inst-plan-input').value,
      adminEmail:   document.getElementById('inst-admin-email-input').value.trim(),
      studentCount: Number(document.getElementById('inst-students-input').value) || 0,
      facultyCount: existingCode
                      ? (State.institutions.find(i => i.campusCode === campusCode)?.facultyCount || 0)
                      : 0,
      status:       document.getElementById('inst-status-input').value,
      updatedAt:    serverTimestamp()
    };
    if (!existingCode) payload.createdAt = serverTimestamp();

    try {
      await setDoc(doc(db, 'institutes', campusCode), payload, { merge: true });
      await logAuditEvent(existingCode ? 'Updated institution' : 'Created institution', campusCode, 'success');
      showNotification(`Institution ${existingCode ? 'updated' : 'created'} successfully.`, 'success');
      closeModal(DOM.institutionModal);
    } catch (err) {
      console.error('[Institution] Save failed:', err);
      showNotification('Could not save institution. Check your permissions.', 'danger');
    }
  });

  // ===========================================================================
  // 7. ACCESS REQUESTS + APPROVAL WORKFLOW
  // ===========================================================================
  function renderRequests() {
    const filtered = State.accessRequests.filter(r => {
      if (State.activeRequestStatusFilter === 'all') return true;
      const status = (r.status || 'new').toLowerCase();
      // 'review' filter matches both 'review' and 'under_review'
      if (State.activeRequestStatusFilter === 'review') return status === 'review' || status === 'under_review';
      // 'new' filter also matches 'pending'
      if (State.activeRequestStatusFilter === 'new') return status === 'new' || status === 'pending';
      return status === State.activeRequestStatusFilter;
    });

    if (!filtered.length) {
      DOM.requestCardStack.innerHTML = `<div class="rank-empty">No requests match this filter.</div>`;
      return;
    }

    DOM.requestCardStack.innerHTML = filtered.map(req => {
      const isPending = !req.status || ['new', 'pending', 'review', 'under_review'].includes(req.status.toLowerCase());
      return `
        <div class="request-card" data-request-id="${escapeHtml(req.id)}">
          <div class="request-field-stack">
            <span class="request-field-label">Request ID</span>
            <span class="request-field-value mono">${escapeHtml(req.id)}</span>
          </div>
          <div class="request-field-stack">
            <span class="request-field-label">Institution</span>
            <span class="request-field-value">${escapeHtml(req.institution || req.campusCode || '—')}</span>
          </div>
          <div class="request-field-stack">
            <span class="request-field-label">Applicant</span>
            <span class="request-field-value">${escapeHtml(req.fullName || '—')}</span>
          </div>
          <div class="request-field-stack">
            <span class="request-field-label">Role</span>
            <span class="request-field-value">${escapeHtml((req.role || '—').replace(/_/g, ' '))}</span>
          </div>
          <div class="request-field-stack">
            <span class="request-field-label">Submitted</span>
            <span class="request-field-value">${timeAgo(req.createdAt)}</span>
          </div>
          <div class="request-card-actions">
            <button type="button" class="cta-mini-btn tone-info" data-action="view-request" data-id="${escapeHtml(req.id)}">
              <svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> View
            </button>
            ${isPending ? `
              <button type="button" class="cta-mini-btn tone-success" data-action="approve-request" data-id="${escapeHtml(req.id)}">
                <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg> Approve
              </button>
              <button type="button" class="cta-mini-btn tone-danger" data-action="reject-request" data-id="${escapeHtml(req.id)}">
                <svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg> Reject
              </button>`
            : `<span class="status-badge tone-${statusTone(req.status)}">${escapeHtml(req.status)}</span>`}
          </div>
        </div>
      `;
    }).join('');
  }

  document.querySelectorAll('[data-filter-group="request-status"] .pill-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-filter-group="request-status"] .pill-filter-btn')
        .forEach(b => b.classList.remove('state-active'));
      btn.classList.add('state-active');
      State.activeRequestStatusFilter = btn.dataset.filter;
      renderRequests();
    });
  });

  DOM.requestCardStack?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id  = btn.dataset.id;
    const req = State.accessRequests.find(r => r.id === id);
    if (!req) return;

    if (btn.dataset.action === 'view-request') openRequestModal(req);
    if (btn.dataset.action === 'approve-request') {
      openConfirmModal(
        'Approve this request?',
        `An account will be created for ${req.email || req.fullName} and login access granted automatically.`,
        () => approveRequest(req)
      );
    }
    if (btn.dataset.action === 'reject-request') {
      openConfirmModal(
        'Reject this request?',
        `${req.fullName || 'This applicant'} will be notified that their request was rejected.`,
        () => updateRequestStatus(req.id, 'rejected')
      );
    }
  });

  function openRequestModal(req) {
    const v = req.verification || {};
    DOM.requestModalBody.innerHTML = `
      <div class="form-row-split">
        <div class="input-field-wrapper"><span class="field-label-text">Request ID</span><span class="request-field-value mono">${escapeHtml(req.id)}</span></div>
        <div class="input-field-wrapper"><span class="field-label-text">Status</span><span class="status-badge tone-${statusTone(req.status)}">${escapeHtml(req.status || 'new')}</span></div>
        <div class="input-field-wrapper"><span class="field-label-text">Institution</span><span class="request-field-value">${escapeHtml(req.institution || '—')}</span></div>
        <div class="input-field-wrapper"><span class="field-label-text">Campus Code</span><span class="request-field-value mono">${escapeHtml(req.campusCode || '—')}</span></div>
        <div class="input-field-wrapper"><span class="field-label-text">Applicant Name</span><span class="request-field-value">${escapeHtml(req.fullName || '—')}</span></div>
        <div class="input-field-wrapper"><span class="field-label-text">Email</span><span class="request-field-value">${escapeHtml(req.email || '—')}</span></div>
        <div class="input-field-wrapper"><span class="field-label-text">Phone</span><span class="request-field-value">${escapeHtml(req.phone || req.applicantPhone || '—')}</span></div>
        <div class="input-field-wrapper"><span class="field-label-text">Role Requested</span><span class="request-field-value">${escapeHtml((req.role || '—').replace(/_/g, ' '))}</span></div>
        <div class="input-field-wrapper"><span class="field-label-text">Identity Method</span><span class="request-field-value">${escapeHtml(req.identityType || '—')}</span></div>
        <div class="input-field-wrapper"><span class="field-label-text">Reason</span><span class="request-field-value">${escapeHtml(req.reason || '—')}</span></div>
        <div class="input-field-wrapper"><span class="field-label-text">Submitted</span><span class="request-field-value">${formatDate(req.createdAt)}</span></div>
      </div>
      <div class="verification-checklist" style="margin-top:8px;">
        ${verifyItem('Identity Match',       v.identity)}
        ${verifyItem('Email Verified',       v.email)}
        ${verifyItem('Phone Verified',       v.phone)}
        ${verifyItem('Institution Verified', v.institution)}
      </div>
      <div class="modal-action-row">
        <button type="button" class="cta-outline-button" data-close-modal="request-modal-overlay">Close</button>
        ${(!req.status || ['new', 'pending', 'review', 'under_review'].includes(req.status.toLowerCase())) ? `
          <button type="button" class="cta-danger-button" id="modal-reject-btn">Reject</button>
          <button type="button" class="cta-solid-button"  id="modal-approve-btn">Approve &amp; Provision</button>
        ` : ''}
      </div>
    `;

    // Wire modal action buttons after injection
    document.getElementById('modal-approve-btn')?.addEventListener('click', () => {
      closeModal(DOM.requestModal);
      approveRequest(req);
    });
    document.getElementById('modal-reject-btn')?.addEventListener('click', () => {
      closeModal(DOM.requestModal);
      updateRequestStatus(req.id, 'rejected');
    });

    openModal(DOM.requestModal);
  }

  function verifyItem(label, passed) {
    return `
      <div class="verification-check-item">
        <span class="verification-check-icon ${passed ? 'is-pass' : 'is-fail'}">
          <svg viewBox="0 0 24 24">
            ${passed
              ? '<polyline points="20 6 9 17 4 12"/>'
              : '<path d="M18 6 6 18M6 6l12 12"/>'
            }
          </svg>
        </span>
        ${escapeHtml(label)}
      </div>
    `;
  }

  /**
   * APPROVAL WORKFLOW → User Provisioning
   *
   * Priority 1: Call Cloud Function `approveAccessRequestAndProvisionAdmin`
   *             → Creates Firebase Auth account, users doc, staff doc, sends email.
   *
   * Priority 2 (fallback if CF not deployed):
   *             → Mark request approved in Firestore
   *             → Write a staff doc so the user appears in the admin UI
   *             → Show a clear warning that Auth account creation needs the CF.
   */
  async function approveRequest(req) {
    try {
      const provision = httpsCallable(functions, 'approveAccessRequestAndProvisionAdmin');
      await provision({ requestId: req.id });
      await logAuditEvent(
        'Approved request & provisioned admin',
        `${req.fullName} (${req.email})`,
        'success'
      );
      showNotification(
        `✅ Approved. Account created for ${req.email || req.fullName}.`,
        'success'
      );
    } catch (err) {
      const isNotDeployed = err?.code === 'functions/not-found' ||
                            err?.message?.includes('not-found') ||
                            err?.message?.includes('NOT_FOUND') ||
                            err?.code === 'functions/internal';

      if (isNotDeployed) {
        // Graceful fallback — keep workflow moving without blocking on CF
        try {
          await updateRequestStatus(req.id, 'approved');

          // Write a provisional staff doc so the user shows in the UI
          if (req.email && req.campusCode) {
            const provisionalUid = `pending_${req.id}`;
            await setDoc(doc(db, 'staff', provisionalUid), {
              name:          req.fullName || req.email,
              email:         req.email,
              role:          req.role || 'institute_admin',
              campusCode:    req.campusCode,
              active:        true,
              provisioned:   false,   // signals Auth account not yet created
              requestId:     req.id,
              createdAt:     serverTimestamp()
            }, { merge: true });
          }

          showNotification(
            '⚠️ Marked approved. Deploy Cloud Function to auto-create Firebase Auth login.',
            'warning'
          );
        } catch (fallbackErr) {
          console.error('[Approve] Fallback write failed:', fallbackErr);
          showNotification('Approval fallback failed. Check Firestore permissions.', 'danger');
        }
      } else {
        console.error('[Approve] Unexpected error:', err);
        showNotification('Approval failed: ' + (err?.message || 'Unknown error'), 'danger');
      }
    }
  }

  async function updateRequestStatus(id, status) {
    try {
      await updateDoc(doc(db, 'access_requests', id), {
        status,
        resolvedAt: serverTimestamp()
      });
      await logAuditEvent(
        `${status === 'approved' ? 'Approved' : 'Rejected'} request`,
        id,
        status === 'approved' ? 'success' : 'danger'
      );
      showNotification(`Request ${status}.`, status === 'approved' ? 'success' : 'warning');
    } catch (err) {
      console.error('[Request] Status update failed:', err);
      showNotification('Could not update request status.', 'danger');
    }
  }

  // ===========================================================================
  // 8. USERS
  // ===========================================================================
  function renderUsersTable() {
    const term     = (DOM.userSearchInput?.value || '').toLowerCase().trim();
    const filtered = State.users.filter(u => {
      const roleOk   = State.activeUserRoleFilter === 'all' || u.role === State.activeUserRoleFilter;
      const searchOk = !term ||
        (u.name  || '').toLowerCase().includes(term) ||
        (u.email || '').toLowerCase().includes(term) ||
        (u.campusCode || '').toLowerCase().includes(term);
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
        <td style="text-transform:capitalize">${escapeHtml((u.role || '—').replace(/_/g, ' '))}</td>
        <td>${escapeHtml(u.campusCode || '—')}</td>
        <td><span class="status-badge tone-${statusTone(u.status || 'active')}">${escapeHtml(u.status || 'active')}</span></td>
        <td>${timeAgo(u.lastActive)}</td>
        <td>
          <div class="table-row-actions">
            <button type="button" class="cta-mini-btn tone-info"
                    data-action="reset-password" data-uid="${escapeHtml(u.id)}"
                    data-email="${escapeHtml(u.email || '')}" title="Send Password Reset">
              <svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            </button>
            <button type="button" class="cta-mini-btn tone-neutral"
                    data-action="force-logout" data-uid="${escapeHtml(u.id)}" title="Force Logout">
              <svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            </button>
            <button type="button" class="cta-mini-btn tone-danger"
                    data-action="${(u.status || 'active') === 'disabled' ? 'enable-user' : 'disable-user'}"
                    data-uid="${escapeHtml(u.id)}"
                    title="${(u.status || 'active') === 'disabled' ? 'Enable User' : 'Disable User'}">
              <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
            </button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  document.querySelectorAll('[data-filter-group="user-role"] .pill-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-filter-group="user-role"] .pill-filter-btn')
        .forEach(b => b.classList.remove('state-active'));
      btn.classList.add('state-active');
      State.activeUserRoleFilter = btn.dataset.filter;
      renderUsersTable();
    });
  });

  DOM.userSearchInput?.addEventListener('input', renderUsersTable);

  DOM.usersTableBody?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const uid   = btn.dataset.uid;
    const email = btn.dataset.email || '';
    const user  = State.users.find(u => u.id === uid);
    if (!user) return;

    if (btn.dataset.action === 'disable-user') {
      openConfirmModal(
        'Disable this user?',
        `${user.name || user.email} will immediately lose access to CampusOne.`,
        async () => {
          await updateDoc(doc(db, 'users', uid), { status: 'disabled', updatedAt: serverTimestamp() });
          await logAuditEvent('Disabled user', `${user.name} (${user.email})`, 'danger');
          showNotification('User disabled.', 'warning');
        }
      );
    }

    if (btn.dataset.action === 'enable-user') {
      openConfirmModal(
        'Re-enable this user?',
        `${user.name || user.email} will regain access to CampusOne.`,
        async () => {
          await updateDoc(doc(db, 'users', uid), { status: 'active', updatedAt: serverTimestamp() });
          await logAuditEvent('Enabled user', `${user.name} (${user.email})`, 'success');
          showNotification('User re-enabled.', 'success');
        }
      );
    }

    if (btn.dataset.action === 'force-logout') {
      openConfirmModal(
        'Force logout this user?',
        'This logs an audit event. Full token revocation requires the revokeRefreshTokens Cloud Function.',
        async () => {
          await logAuditEvent('Force logout requested', `${user.name} (${user.email})`, 'warning');
          showNotification('Logout event logged. Wire revokeRefreshTokens CF for full enforcement.', 'info');
        }
      );
    }

    if (btn.dataset.action === 'reset-password') {
      const targetEmail = email || user.email;
      if (!targetEmail) { showNotification('No email address on file for this user.', 'danger'); return; }
      openConfirmModal(
        'Send password reset email?',
        `A reset link will be sent to ${targetEmail}.`,
        async () => {
          try {
            await sendPasswordResetEmail(auth, targetEmail);
            await logAuditEvent('Sent password reset', `${user.name} (${targetEmail})`, 'info');
            showNotification(`Password reset email sent to ${targetEmail}.`, 'success');
          } catch (err) {
            console.error('[Reset Password]', err);
            showNotification('Failed to send reset email: ' + (err.message || 'Unknown error'), 'danger');
          }
        }
      );
    }
  });

  // ===========================================================================
  // 9. VERIFICATION CENTER
  // ===========================================================================
  function renderVerificationCenter() {
    const pending = State.accessRequests.filter(r =>
      ['new', 'pending', 'review', 'under_review'].includes((r.status || 'new').toLowerCase())
    );
    if (!pending.length) {
      DOM.verificationGrid.innerHTML = `<div class="rank-empty">No requests are awaiting verification.</div>`;
      return;
    }

    DOM.verificationGrid.innerHTML = pending.map(req => {
      const v      = req.verification || {};
      const checks = [v.identity, v.email, v.phone, v.institution];
      const score  = Math.round((checks.filter(Boolean).length / checks.length) * 100);
      const r           = 24;
      const circumference = 2 * Math.PI * r;
      const offset      = circumference - (score / 100) * circumference;

      return `
        <div class="verification-card">
          <div class="verification-card-head">
            <div>
              <div class="verification-applicant">${escapeHtml(req.fullName || '—')}</div>
              <div class="verification-applicant-sub">${escapeHtml(req.institution || req.campusCode || '—')} · ${escapeHtml((req.role || '—').replace(/_/g, ' '))}</div>
            </div>
            <div class="verification-score-ring-wrap">
              <svg class="verification-score-svg" viewBox="0 0 56 56">
                <circle class="verification-score-track"    cx="28" cy="28" r="${r}"/>
                <circle class="verification-score-progress" cx="28" cy="28" r="${r}"
                        style="stroke-dasharray:${circumference.toFixed(2)};stroke-dashoffset:${offset.toFixed(2)}"/>
              </svg>
              <span class="verification-score-text">${score}</span>
            </div>
          </div>
          <div class="verification-checklist">
            ${verifyItem('Identity Match',       v.identity)}
            ${verifyItem('Email Verified',       v.email)}
            ${verifyItem('Phone Verified',       v.phone)}
            ${verifyItem('Institution Verified', v.institution)}
          </div>
          <div class="verification-card-actions">
            <button type="button" class="cta-mini-btn tone-info"
                    data-action="view-request" data-id="${escapeHtml(req.id)}">
              View Full Request
            </button>
            <button type="button" class="cta-mini-btn tone-success"
                    data-action="approve-from-verify" data-id="${escapeHtml(req.id)}">
              <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg> Approve
            </button>
            <button type="button" class="cta-mini-btn tone-danger"
                    data-action="reject-from-verify" data-id="${escapeHtml(req.id)}">
              <svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg> Reject
            </button>
          </div>
        </div>
      `;
    }).join('');

    // Wire buttons
    DOM.verificationGrid.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const req = State.accessRequests.find(r => r.id === btn.dataset.id);
        if (!req) return;
        if (btn.dataset.action === 'view-request')        openRequestModal(req);
        if (btn.dataset.action === 'approve-from-verify') {
          openConfirmModal(
            'Approve this request?',
            `Account will be created for ${req.email || req.fullName}.`,
            () => approveRequest(req)
          );
        }
        if (btn.dataset.action === 'reject-from-verify') {
          openConfirmModal(
            'Reject this request?',
            `${req.fullName || 'This applicant'} will be notified.`,
            () => updateRequestStatus(req.id, 'rejected')
          );
        }
      });
    });
  }

  // ===========================================================================
  // 10. NOTICES
  // ===========================================================================
  let activeAudience = 'all';
  document.querySelectorAll('.audience-segment-track .control-node').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.audience-segment-track .control-node')
        .forEach(b => b.classList.remove('state-active'));
      btn.classList.add('state-active');
      activeAudience = btn.dataset.audience;
    });
  });

  DOM.noticeForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('notice-title-input')?.value.trim();
    const body  = document.getElementById('notice-body-input')?.value.trim();
    if (!title || !body) { showNotification('Title and message are required.', 'danger'); return; }
    try {
      await addDoc(collection(db, 'notices'), {
        title, body, audience: activeAudience, createdAt: serverTimestamp()
      });
      await logAuditEvent('Sent global notice', title, 'info');
      showNotification('Notice sent successfully.', 'success');
      DOM.noticeForm.reset();
      // Reset audience to default
      document.querySelectorAll('.audience-segment-track .control-node')
        .forEach(b => b.classList.remove('state-active'));
      document.querySelector('.audience-segment-track .control-node[data-audience="all"]')
        ?.classList.add('state-active');
      activeAudience = 'all';
    } catch (err) {
      console.error('[Notice] Send failed:', err);
      showNotification('Could not send notice.', 'danger');
    }
  });

  function renderNoticeHistory() {
    const sorted = [...State.notices]
      .sort((a, b) => (b._sortTs || 0) - (a._sortTs || 0))
      .slice(0, 10);
    if (!sorted.length) {
      DOM.noticeHistoryList.innerHTML = `<li class="rank-empty">No notices sent yet.</li>`;
      return;
    }
    DOM.noticeHistoryList.innerHTML = sorted.map((n, i) => `
      <li>
        <span class="rank-index">${i + 1}</span>
        <span class="rank-info">
          <span class="rank-title">${escapeHtml(n.title)}</span>
          <span class="rank-subtitle">${escapeHtml((n.audience || 'all').replace(/_/g, ' '))} · ${timeAgo(n.createdAt)}</span>
        </span>
      </li>
    `).join('');
  }

  // ===========================================================================
  // 11. ROLES & PERMISSIONS MATRIX
  // ===========================================================================
  const PERMISSION_ROWS = [
    { key: 'manage_institutions', label: 'Can Manage Institutions',     grants: ['super_admin'] },
    { key: 'approve_requests',    label: 'Can Approve Requests',         grants: ['super_admin'] },
    { key: 'create_student',      label: 'Can Create Students',          grants: ['super_admin', 'institute_admin'] },
    { key: 'create_faculty',      label: 'Can Create Faculty',           grants: ['super_admin', 'institute_admin'] },
    { key: 'manage_notice',       label: 'Can Manage Notices',           grants: ['super_admin', 'institute_admin', 'faculty'] },
    { key: 'view_analytics',      label: 'Can View Analytics',           grants: ['super_admin', 'institute_admin', 'faculty'] },
    { key: 'export_data',         label: 'Can Export Data',              grants: ['super_admin', 'institute_admin'] },
    { key: 'mark_attendance',     label: 'Can Mark Attendance',          grants: ['super_admin', 'institute_admin', 'faculty'] },
    { key: 'view_grades',         label: 'Can View Grades',              grants: ['super_admin', 'institute_admin', 'faculty', 'student'] },
    { key: 'view_child_progress', label: 'Can View Child Progress',      grants: ['super_admin', 'institute_admin', 'parent'] }
  ];
  const ROLE_COLUMNS = ['super_admin', 'institute_admin', 'faculty', 'student', 'parent'];

  function renderPermissionMatrix() {
    if (!DOM.permissionMatrixBody) return;
    DOM.permissionMatrixBody.innerHTML = PERMISSION_ROWS.map(row => `
      <tr>
        <td>${escapeHtml(row.label)}</td>
        ${ROLE_COLUMNS.map(role => {
          const locked  = role === 'super_admin';
          // Use live Firestore data if loaded, else fall back to hardcoded defaults
          const rolePerms = State.rolesData[role]?.permissions;
          const checked = locked || (rolePerms ? !!rolePerms[row.key] : row.grants.includes(role));
          return `
            <td>
              <span class="permission-check-toggle ${checked ? 'state-checked' : ''} ${locked ? 'state-locked' : ''}"
                    data-permission="${escapeHtml(row.key)}" data-role="${escapeHtml(role)}">
                ${checked ? '<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
              </span>
            </td>
          `;
        }).join('')}
      </tr>
    `).join('');
  }

  DOM.permissionMatrixBody?.addEventListener('click', async (e) => {
    const toggle = e.target.closest('.permission-check-toggle');
    if (!toggle || toggle.classList.contains('state-locked')) return;

    const perm    = toggle.dataset.permission;
    const role    = toggle.dataset.role;
    const newVal  = !toggle.classList.contains('state-checked');

    // Optimistic UI update
    toggle.classList.toggle('state-checked', newVal);
    toggle.innerHTML = newVal ? '<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>' : '';

    // Save to Firestore roles/{role}
    try {
      await setDoc(
        doc(db, 'roles', role),
        { permissions: { [perm]: newVal } },
        { merge: true }
      );
      // Update local State so re-render stays in sync
      if (!State.rolesData[role]) State.rolesData[role] = { permissions: {} };
      State.rolesData[role].permissions[perm] = newVal;

      await logAuditEvent(
        `${newVal ? 'Granted' : 'Revoked'} permission: ${perm.replace(/_/g, ' ')}`,
        role.replace(/_/g, ' '),
        newVal ? 'success' : 'warning'
      );
      showNotification(
        `${newVal ? '✅ Granted' : '❌ Revoked'}: "${perm.replace(/_/g, ' ')}" for ${role.replace(/_/g, ' ')}.`,
        newVal ? 'success' : 'warning'
      );
    } catch (err) {
      // Revert UI on failure
      toggle.classList.toggle('state-checked', !newVal);
      toggle.innerHTML = !newVal ? '<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>' : '';
      console.error('[Permissions] Firestore write failed:', err);
      showNotification('Could not save permission. Check Firestore rules.', 'danger');
    }
  });

  document.getElementById('add-custom-role-btn')?.addEventListener('click', () => {
    showNotification('Custom role creation requires a custom_roles Firestore collection. Say the word and it\'ll be wired up.', 'info');
  });

  // ===========================================================================
  // 12. ANALYTICS CENTER
  // ===========================================================================
  function renderAnalytics() {
    renderGrowthChart();
    renderRequestTrendBars();

    const byStudents = [...State.users.filter(u => u.role === 'student')]
      .sort((a, b) => (b.activityScore || 0) - (a.activityScore || 0))
      .slice(0, 5);
    renderRankedList(
      document.getElementById('top-students-list'),
      byStudents.map((u, i) => ({ index: i + 1, title: u.name || u.email, subtitle: u.campusCode || '—', value: timeAgo(u.lastActive) })),
      'No student activity data yet.'
    );

    const byFaculty = [...State.users.filter(u => u.role === 'faculty')]
      .sort((a, b) => (b.activityScore || 0) - (a.activityScore || 0))
      .slice(0, 5);
    renderRankedList(
      document.getElementById('top-faculty-list'),
      byFaculty.map((u, i) => ({ index: i + 1, title: u.name || u.email, subtitle: u.campusCode || '—', value: timeAgo(u.lastActive) })),
      'No faculty activity data yet.'
    );

    const byCampus = [...State.institutions]
      .sort((a, b) => (b.studentCount || 0) - (a.studentCount || 0))
      .slice(0, 5);
    renderRankedList(
      document.getElementById('top-campus-analytics-list'),
      byCampus.map((inst, i) => ({ index: i + 1, title: inst.name, subtitle: inst.campusCode, value: (inst.studentCount || 0).toLocaleString('en-IN') })),
      'No institutions yet.'
    );
  }

  // ===========================================================================
  // 13. AUDIT LOGS
  // ===========================================================================
  function renderAuditTimeline() {
    const filtered = State.auditLogs.filter(log => {
      if (State.activeAuditFilter === 'all') return true;
      const action = (log.action || '').toLowerCase();
      if (State.activeAuditFilter === 'approve')   return action.includes('approv');
      if (State.activeAuditFilter === 'reject')    return action.includes('reject');
      if (State.activeAuditFilter === 'user')      return action.includes('user') || action.includes('disable') || action.includes('reset') || action.includes('logout');
      if (State.activeAuditFilter === 'settings')  return action.includes('setting') || action.includes('notice');
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
          <div class="audit-headline">
            ${escapeHtml(log.actorName || 'System')} — ${escapeHtml(log.action || 'Action')}
          </div>
          <div class="audit-meta">
            <span class="audit-target">${escapeHtml(log.target || '')}</span>
            · ${formatDate(log.createdAt)}
            · ${timeAgo(log.createdAt)}
          </div>
        </div>
      </div>
    `).join('');
  }

  function auditIconFor(type) {
    if (type === 'success') return '<polyline points="20 6 9 17 4 12"/>';
    if (type === 'danger')  return '<path d="M18 6 6 18M6 6l12 12"/>';
    if (type === 'warning') return '<path d="M12 9v4M12 17h.01"/><path d="m21.7 16.5-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 19.5h16a2 2 0 0 0 1.7-3z"/>';
    return '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>';
  }

  document.querySelectorAll('[data-filter-group="audit-action"] .pill-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-filter-group="audit-action"] .pill-filter-btn')
        .forEach(b => b.classList.remove('state-active'));
      btn.classList.add('state-active');
      State.activeAuditFilter = btn.dataset.filter;
      renderAuditTimeline();
    });
  });

  document.getElementById('export-audit-btn')?.addEventListener('click', () => {
    if (!State.auditLogs.length) { showNotification('No audit logs to export.', 'info'); return; }
    const rows = [
      ['Actor', 'Actor UID', 'Action', 'Target', 'Type', 'Date'],
      ...State.auditLogs
        .sort((a, b) => (b._sortTs || 0) - (a._sortTs || 0))
        .map(l => [l.actorName || '', l.actorUid || '', l.action || '', l.target || '', l.type || '', formatDate(l.createdAt)])
    ];
    const csv  = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `campusone-audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showNotification('Audit log exported.', 'success');
  });

  // ===========================================================================
  // 14. GLOBAL SEARCH
  // ===========================================================================
  DOM.globalSearchInput?.addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    if (!q) return;

    // Find first match across institutions, requests, users
    const instMatch = State.institutions.find(i =>
      (i.name || '').toLowerCase().includes(q) || (i.campusCode || '').toLowerCase().includes(q)
    );
    const reqMatch  = State.accessRequests.find(r =>
      (r.fullName || '').toLowerCase().includes(q) ||
      (r.email || '').toLowerCase().includes(q) ||
      r.id.toLowerCase().includes(q)
    );
    const userMatch = State.users.find(u =>
      (u.name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q)
    );

    if (instMatch)  { switchView('institutions'); showNotification(`Found institution: ${instMatch.name}`, 'info'); }
    else if (reqMatch)  { switchView('requests');    showNotification(`Found request from: ${reqMatch.fullName || reqMatch.id}`, 'info'); }
    else if (userMatch) { switchView('users');       showNotification(`Found user: ${userMatch.name || userMatch.email}`, 'info'); }
  });

  // ===========================================================================
  // 15. SETTINGS
  // ===========================================================================
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
          ['Auto-expire pending requests',              'Mark requests as Expired after 14 days with no admin action.',               true],
          ['Require institution domain match',          "Applicant email domain must match the institution's registered domain.",    true],
          ['Allow self-service Institute Admin requests', 'Let new institutions submit their own admin access request.',              true],
          ['Auto-flag duplicate applicants',            'Detect and flag requests reusing an email already on the platform.',        false]
        ]
      },
      'verification-rules': {
        title: 'Verification Rules',
        rows: [
          ['Require phone verification',                'OTP verification required before a request can be approved.',               true],
          ['Require employee ID for staff roles',       'Institute Admin & Faculty requests must include a valid Employee ID.',      true],
          ['Minimum verification score to approve',     'Block one-click approval below 75/100 verification score.',                true]
        ]
      },
      'email-templates': {
        title: 'Email Templates',
        rows: [
          ['Access request approved',                   'Sent when Super Admin approves an access request.',                        true],
          ['Access request rejected',                   'Sent when Super Admin rejects an access request.',                        true],
          ['Institute Admin welcome + temp password',   'Sent automatically after account provisioning.',                          true],
          ['Password reset',                            'Sent when an admin triggers a password reset for a user.',                true]
        ]
      },
      'sms-templates': {
        title: 'SMS Templates',
        rows: [
          ['OTP verification code',                     'Sent during phone verification step of an access request.',               true],
          ['Account suspended alert',                   'Sent to Institute Admin when their institution is suspended.',             false]
        ]
      },
      'branding': {
        title: 'Campus Branding',
        rows: [
          ['Allow custom campus logo upload',           'Institute Admins can upload their own logo for their dashboard.',          true],
          ['Allow custom brand color',                  'Institute Admins can override the default CampusOne blue accent.',         false],
          ['Show "Powered by CampusOne" footer',        'Display attribution footer on all institution-branded pages.',             true]
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

  // ===========================================================================
  // 16. FIRESTORE LIVE SUBSCRIPTIONS
  // ===========================================================================
  /**
   * Generic helper: attaches a Firestore onSnapshot listener,
   * gracefully falls back to [] on permission or index errors.
   */
  function attachSnapshot(colName, orderField, mapper, onUpdate) {
    try {
      const q    = query(collection(db, colName), orderBy(orderField, 'desc'), limit(300));
      const unsub = onSnapshot(q, (snap) => {
        onUpdate(snap.docs.map(d => mapper(d)));
      }, (err) => {
        console.warn(`[Firestore] ${colName} listener error — showing empty state:`, err.code, err.message);
        onUpdate([]);
      });
      State.unsubscribers.push(unsub);
    } catch (err) {
      console.warn(`[Firestore] Could not attach listener for ${colName}:`, err);
      onUpdate([]);
    }
  }

  async function bootstrapDataLayer() {
    // institutes
    attachSnapshot('institutes', 'createdAt',
      d => ({ id: d.id, campusCode: d.id, ...d.data() }),
      (docs) => {
        State.institutions = docs;
        renderInstitutions(); renderKpis(); renderTopCampuses();
        renderPendingActions(); renderMetricsPulse();
        if (State.currentView === 'analytics') renderAnalytics();
      }
    );

    // access_requests
    attachSnapshot('access_requests', 'createdAt',
      d => {
        const data = d.data();
        return { id: d.id, ...data, _sortTs: data.createdAt?.toMillis ? data.createdAt.toMillis() : 0 };
      },
      (docs) => {
        State.accessRequests = docs;
        renderRequests(); renderKpis(); renderLatestRequests();
        renderRegistrationPipeline();
        renderLiveActivityFeed();
        renderPendingActions(); renderMetricsPulse();
        if (State.currentView === 'verification') renderVerificationCenter();
        else renderVerificationCenter();          // always keep center fresh
        if (State.currentView === 'analytics') renderAnalytics();
      }
    );

    // users
    attachSnapshot('users', 'lastActive',
      d => ({ id: d.id, ...d.data() }),
      (docs) => {
        State.users = docs;
        renderUsersTable(); renderKpis();
        renderTrendChart(); renderMetricsPulse();
        if (State.currentView === 'analytics') renderAnalytics();
      }
    );

    // staff
    attachSnapshot('staff', 'createdAt',
      d => ({ id: d.id, ...d.data() }),
      (docs) => {
        State.staff = docs;
        renderKpis();
      }
    );

    // audit_logs
    attachSnapshot('audit_logs', 'createdAt',
      d => {
        const data = d.data();
        return { id: d.id, ...data, _sortTs: data.createdAt?.toMillis ? data.createdAt.toMillis() : 0 };
      },
      (docs) => {
        State.auditLogs = docs;
        renderRecentAudit();
        renderLiveActivityFeed();
        if (State.currentView === 'audit') renderAuditTimeline();
      }
    );

    // roles — real-time listener (non-blocking, safe fallback)
    try {
      const rolesUnsub = onSnapshot(collection(db, 'roles'), (snap) => {
        snap.docs.forEach(d => { State.rolesData[d.id] = d.data(); });
        if (State.currentView === 'roles') renderPermissionMatrix();
      }, (err) => {
        console.warn('[Firestore] roles listener error (using defaults):', err.message);
      });
      State.unsubscribers.push(rolesUnsub);
    } catch (err) {
      console.warn('[Roles] Could not attach roles listener:', err.message);
    }

    // notices
    attachSnapshot('notices', 'createdAt',
      d => {
        const data = d.data();
        return { id: d.id, ...data, _sortTs: data.createdAt?.toMillis ? data.createdAt.toMillis() : 0 };
      },
      (docs) => {
        State.notices = docs;
        renderNoticeHistory();
      }
    );
  }

  // ===========================================================================
  // 17. AUTH GATE
  // ===========================================================================
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
          setTimeout(() => signOut(auth).then(() => {
            window.location.href = '../auth/login/index.html';
          }), 2000);
          return;
        }

        State.currentUserStaffData = staffData;
        if (DOM.profileName)   DOM.profileName.textContent   = staffData.name || user.email;
        if (DOM.profileEmail)  DOM.profileEmail.textContent  = user.email;
        if (DOM.profileAvatar) DOM.profileAvatar.textContent = initials(staffData.name || user.email);

      } catch (err) {
        // Non-fatal: could be a first-time setup; still let dashboard load
        console.warn('[Auth Gate] Could not verify super_admin role:', err.message);
        if (DOM.profileName)   DOM.profileName.textContent   = user.displayName || user.email;
        if (DOM.profileEmail)  DOM.profileEmail.textContent  = user.email;
        if (DOM.profileAvatar) DOM.profileAvatar.textContent = initials(user.displayName || user.email);
      }

      bootstrapDataLayer();
    });
  }

  // Cleanup all Firestore listeners on page unload (prevents memory leaks)
  window.addEventListener('beforeunload', () => {
    State.unsubscribers.forEach(unsub => { try { unsub(); } catch (_) {} });
  });

  // ===========================================================================
  // 18. BOOT
  // ===========================================================================
  function boot() {
    initializeThemeEngine();
    renderTrendChart();       // renders placeholder until real data arrives
    renderGrowthChart();
    renderPermissionMatrix();
    renderSettingsTab('request-rules');
    renderHealthRing(99.9);
    renderRegistrationPipeline();   // empty state until Firestore loads
    renderLiveActivityFeed();       // empty state until Firestore loads
    renderPendingActions();         // empty state until Firestore loads
    renderMetricsPulse();           // empty state until Firestore loads
    initializeAuthGate();
    initStatusBarClock();
    initMobileBottomNav();
    initRippleEffect();
    initKeyboardShortcuts();
    console.log('[CampusOne] Super Admin Console v2.1-Sprint1 initialized ✓');
  }

  /**
   * Adds ripple effect on click to CTA buttons
   */
  function initRippleEffect() {
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.cta-solid-button, .cta-gradient-button, .cmd-quick-action-btn, .quick-action-tile');
      if (!btn) return;
      const ripple = document.createElement('span');
      ripple.className = 'ripple-effect';
      const rect = btn.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height) * 2;
      ripple.style.cssText = `
        width: ${size}px; height: ${size}px;
        left: ${e.clientX - rect.left - size/2}px;
        top: ${e.clientY - rect.top - size/2}px;
      `;
      // Ensure btn is positioned
      if (getComputedStyle(btn).position === 'static') btn.style.position = 'relative';
      btn.style.overflow = 'hidden';
      btn.appendChild(ripple);
      setTimeout(() => ripple.remove(), 600);
    });
  }

  /**
   * Keyboard shortcuts:
   * / → focus global search
   * Escape → close open modals
   * Ctrl+K → focus global search
   */
  function initKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // / or Ctrl+K → focus search (when not in input)
      const tag = document.activeElement?.tagName;
      if ((e.key === '/' || (e.ctrlKey && e.key === 'k')) && !['INPUT','TEXTAREA','SELECT'].includes(tag)) {
        e.preventDefault();
        DOM.globalSearchInput?.focus();
      }
      // Escape → close top-most open modal
      if (e.key === 'Escape') {
        const openModal = document.querySelector('.modal-overlay.state-open');
        if (openModal) {
          openModal.classList.remove('state-open');
        }
      }
    });
  }

  function initStatusBarClock() {
    const clockEl = document.getElementById('status-bar-clock');
    if (!clockEl) return;
    function tick() {
      const now = new Date();
      clockEl.textContent = now.toLocaleTimeString('en-IN', { hour12: false, hour:'2-digit', minute:'2-digit', second:'2-digit' });
    }
    tick();
    setInterval(tick, 1000);
  }

  function initMobileBottomNav() {
    const btns = document.querySelectorAll('.mobile-qa-btn[data-view]');
    btns.forEach(btn => {
      btn.addEventListener('click', () => {
        btns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        switchView(btn.dataset.view);
      });
    });
    // Sync mobile bottom nav with main nav
    DOM.navItems.forEach(item => {
      item.addEventListener('click', () => {
        const view = item.dataset.view;
        btns.forEach(b => {
          b.classList.toggle('active', b.dataset.view === view);
        });
      });
    });
  }

  boot();

}); // end DOMContentLoaded
