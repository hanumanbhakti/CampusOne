/**
 * CampusOne — Admin Dashboard Controller (SaaS Edition)
 *
 * NEW in this version:
 *  ✅ Sidebar reordered: Dashboard → Requests → Students → Teachers → Parents
 *  ✅ Requests Module with Pending / Under Review / Approved / Rejected tabs
 *  ✅ Approve / Reject actions with status update
 *  ✅ Request Detail Modal
 *  ✅ Dashboard pending count badge on nav + stat card
 *  ✅ Dashboard mini-requests preview panel
 *  ✅ Toast notifications
 *  ✅ Section-level Create panels (toggle, not always visible)
 *  ✅ Avatar initials auto-generated
 *
 * SCHEMA (access_requests collection):
 *   access_requests/{id} → {
 *     name, email, role (student|teacher|parent),
 *     campusCode, requestedAt (timestamp),
 *     status (pending|under_review|approved|rejected),
 *     reviewedAt, reviewedBy
 *   }
 *
 * Existing schema (institutes/{campusCode}/students|teachers|parents) unchanged.
 */

import { auth, db, getCurrentTenant, waitForAuthReady } from "../shared/firebase-config.js";

import { signOut } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, query, where, orderBy, limit,
  getDocs, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

// ============ HELPERS ============
const $ = (id) => document.getElementById(id);

let activeCampus = null;
let adminProfile  = null;
let currentUser   = null;

// In-memory caches
let studentsCache = [];
let teachersCache = [];
let parentsCache  = [];
let requestsCache = [];  // all requests for this campus

// Active requests tab
let activeRequestTab = "pending";

// Avatar colour palette (cycles by index)
const AVATAR_COLORS = ["avatar-blue","avatar-green","avatar-purple","avatar-orange","avatar-pink","avatar-teal"];
function avatarColor(index) { return AVATAR_COLORS[index % AVATAR_COLORS.length]; }
function initials(name = "") {
  const parts = name.trim().split(" ");
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length-1][0]).toUpperCase()
    : (name.slice(0,2).toUpperCase() || "??");
}

// Toast
let toastTimer = null;
function showToast(msg, type = "info") {
  const toast = $("toast");
  toast.textContent = msg;
  toast.className = `toast toast-${type}`;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 3200);
}

// ============ THEME (DARK / LIGHT) ============
function initTheme() {
  const themeBtn = $("theme-toggle");
  if (!themeBtn) return;

  const savedTheme = localStorage.getItem("campusone-theme") || "dark";
  document.documentElement.setAttribute("data-theme", savedTheme);
  document.body.setAttribute("data-theme", savedTheme);
  themeBtn.textContent = savedTheme === "dark" ? "☀️" : "🌙";

  themeBtn.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme");
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    document.body.setAttribute("data-theme", next);
    localStorage.setItem("campusone-theme", next);
    themeBtn.textContent = next === "dark" ? "☀️" : "🌙";
  });
}

// ============ LANGUAGE ENGINE ============
const translations = {
  en: {
    dashboard: "Dashboard",
    requests: "Requests",
    students: "Students",
    teachers: "Teachers",
    parents: "Parents",
    settings: "Settings"
  },
  hi: {
    dashboard: "डैशबोर्ड",
    requests: "रिक्वेस्ट्स",
    students: "विद्यार्थी",
    teachers: "शिक्षक",
    parents: "अभिभावक",
    settings: "सेटिंग्स"
  }
};

function applyLanguage(lang) {
  const dict = translations[lang] || translations.en;
  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.dataset.i18n;
    if (dict[key]) el.textContent = dict[key];
  });
  localStorage.setItem("campusone-language", lang);
}

function initLanguage() {
  const langSwitcher = $("language-switcher");
  if (!langSwitcher) return;

  const savedLang = localStorage.getItem("campusone-language") || "en";
  langSwitcher.value = savedLang;
  applyLanguage(savedLang);

  langSwitcher.addEventListener("change", (e) => applyLanguage(e.target.value));
}

// ============ BOOT ============
document.addEventListener("DOMContentLoaded", () => {
  // Apply saved theme/language immediately — don't wait on auth/Firebase,
  // otherwise the UI flashes the wrong theme while login resolves.
  initTheme();
  initLanguage();

  const safetyTimer = setTimeout(() => {
    const gate = $("auth-gate");
    if (gate && !gate.hidden) {
      gate.innerHTML = `
        <p style="color:#EF4444;font-weight:600;">⚠ Could not connect to Firebase.</p>
        <p style="color:#94A3B8;font-size:0.85rem;max-width:320px;text-align:center;">
          Check that firebase-config.js is present and the console has no errors.
        </p>
        <a href="../login-screen/index.html" style="color:#3B82F6;margin-top:8px;">← Back to Login</a>`;
    }
  }, 8000);

  initDashboard()
    .catch((err) => {
      console.error("Admin dashboard init failed:", err);
      clearTimeout(safetyTimer);
      const gate = $("auth-gate");
      if (gate) {
        gate.innerHTML = `
          <p style="color:#EF4444;font-weight:600;">⚠ Something went wrong.</p>
          <p style="color:#94A3B8;font-size:0.85rem;max-width:320px;text-align:center;">${err?.message || err}</p>
          <a href="../login-screen/index.html" style="color:#3B82F6;margin-top:8px;">← Back to Login</a>`;
        gate.hidden = false;
      }
    })
    .then(() => clearTimeout(safetyTimer));
});

async function loadPendingRequestsCount() {

  const q = query(
    collection(db, "access_requests"),
    where("status", "==", "pending")
  );

  const snapshot = await getDocs(q);

  const el = document.getElementById("stat-pending");

  if (el) {
    el.textContent = snapshot.size;
  }
}

async function initDashboard() {
  const gate  = $("auth-gate");
  const shell = $("app-shell");

  const user = await waitForAuthReady();
  
  if (!user) { window.location.href = "../login-screen/index.html"; return; }
  currentUser = user;

  const adminSnap = await getDoc(doc(db, "staff", user.uid));
  adminProfile = adminSnap.exists() ? adminSnap.data() : null;

  if (
    !adminProfile ||
    adminProfile.active !== true ||
    !["super_admin", "institution_admin"].includes(adminProfile.role)
  ) {
    window.location.href = "../login-screen/index.html";
    return;
  }

  activeCampus = adminProfile.campusCode || getCurrentTenant() || "—";

  // Populate UI identity
  const adminName = adminProfile.name || user.email.split("@")[0];
  const adminInitials = initials(adminName);

  $("greeting-text").textContent    = `Welcome back, ${adminName} 👋`;
  $("user-name").textContent        = adminName;
  $("topbar-campus").textContent    = activeCampus;
  $("sidebar-campus-name").textContent = activeCampus;
  $("sidebar-admin-name").textContent  = adminName;
  $("sidebar-avatar-initials").textContent = adminInitials;
  $("topbar-avatar-initials").textContent  = adminInitials;
  $("settings-campus").textContent  = activeCampus;
  $("settings-admin-name").textContent = adminName;
  $("settings-email").textContent   = user.email;

  gate.hidden  = false; // keep visible until shell ready
  shell.hidden = false;
  gate.hidden  = true;

  // ---- NAVIGATION ----
  setupNavigation();

document.getElementById("stat-pending").textContent = "999";

await loadPendingRequestsCount();
  
  // ---- MOBILE SIDEBAR ----
  $("btn-mobile-nav").addEventListener("click", () => {
    const isOpen = $("sidebar").classList.toggle("mobile-open");
    $("sidebar-overlay").classList.toggle("show");
    $("sidebar-overlay").hidden = !isOpen;
    $("btn-mobile-nav").classList.toggle("is-open", isOpen);
    $("btn-mobile-nav").setAttribute("aria-expanded", String(isOpen));
  });
  $("sidebar-overlay").addEventListener("click", closeMobileSidebar);

  // ---- LOGOUT ----
  $("btn-logout").addEventListener("click", async () => {
    try { await signOut(auth); window.location.href = "../login-screen/index.html"; }
    catch (e) { console.error("Sign-out failed:", e); }
  });

  // ---- STUDENT PANEL TOGGLE ----
  $("btn-open-create-student").addEventListener("click", () => {
    $("create-student-panel").style.display = "block";
  });
  $("btn-cancel-create-student").addEventListener("click", () => {
    $("create-student-panel").style.display = "none";
  });

  // ---- TEACHER PANEL TOGGLE ----
  $("btn-open-create-teacher").addEventListener("click", () => {
    $("create-teacher-panel").style.display = "block";
  });
  $("btn-cancel-create-teacher").addEventListener("click", () => {
    $("create-teacher-panel").style.display = "none";
  });

  // ---- PARENT PANEL TOGGLE ----
  $("btn-open-create-parent").addEventListener("click", () => {
    $("create-parent-panel").style.display = "block";
  });
  $("btn-cancel-create-parent").addEventListener("click", () => {
    $("create-parent-panel").style.display = "none";
  });

  // ---- FORMS ----
  $("form-create-student").addEventListener("submit", handleCreateStudent);
  $("form-create-teacher").addEventListener("submit", handleCreateTeacher);
  $("form-create-parent").addEventListener("submit", handleCreateParent);

  // ---- SEARCH ----
  $("search-students").addEventListener("input", (e) => renderStudents(e.target.value));
  $("search-teachers").addEventListener("input", (e) => renderTeachers(e.target.value));
  $("search-parents").addEventListener("input", (e) => renderParents(e.target.value));

  // ---- EDIT MODAL ----
  $("edit-modal-cancel").addEventListener("click", closeEditModal);

  // ---- REQUESTS TABS ----
  setupRequestsTabs();

  // ---- DASHBOARD QUICK LINKS ----
  ["btn-view-requests","btn-view-all-requests","btn-view-all-requests-2"].forEach(id => {
    const el = $(id);
    if (el) el.addEventListener("click", () => navigateTo("requests"));
  });

  // ---- REQUEST MODAL ----
  $("req-modal-close").addEventListener("click", closeRequestModal);
  $("req-modal-cancel-btn").addEventListener("click", closeRequestModal);

  // ---- LOAD ALL DATA ----
  await Promise.all([
    loadStudents(),
    loadTeachers(),
    loadParents(),
    loadRequests()
  ]);
  renderDashboardActivity();
}

// ============ NAVIGATION ============
function setupNavigation() {
  const navItems = document.querySelectorAll(".nav-item[data-section]");
  const sections = document.querySelectorAll(".dash-section");

  navItems.forEach((item) => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      navigateTo(item.dataset.section);
    });
  });
}

function navigateTo(sectionKey) {
  const navItems = document.querySelectorAll(".nav-item[data-section]");
  const sections = document.querySelectorAll(".dash-section");

  navItems.forEach((n) => {
    n.classList.toggle("state-active", n.dataset.section === sectionKey);
  });
  sections.forEach((s) => {
    s.hidden = s.id !== `section-${sectionKey}`;
  });
  closeMobileSidebar();
}

function closeMobileSidebar() {
  $("sidebar").classList.remove("mobile-open");
  $("sidebar-overlay").classList.remove("show");
  $("sidebar-overlay").hidden = true;
  $("btn-mobile-nav").classList.remove("is-open");
  $("btn-mobile-nav").setAttribute("aria-expanded", "false");
}

// ============ REQUESTS MODULE ============
async function loadRequests() {
  try {
    // Query access_requests for this campus, newest first
    const q = query(
      collection(db, "access_requests"),
      where("campusCode", "==", activeCampus),
      orderBy("requestedAt", "desc")
    );
    const snap = await getDocs(q);
    requestsCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.warn("Could not load requests (collection may not exist yet):", err.message);
    // Use sample data for demo if Firestore unavailable
    requestsCache = getSampleRequests();
  }

  updateRequestBadges();
  renderRequestsForTab(activeRequestTab);
  renderDashboardRequestsPreview();
}

function getSampleRequests() {
  // Demo data shown when Firestore is empty / not configured
  const now = { seconds: Math.floor(Date.now()/1000), toDate: () => new Date() };
  const yesterday = { seconds: Math.floor(Date.now()/1000) - 86400, toDate: () => new Date(Date.now()-86400000) };
  return [
    { id: "r1", name: "Dilip Kumar",  email: "dilip.kumar@email.com",  role: "student", campusCode: activeCampus, status: "pending",  requestedAt: now },
    { id: "r2", name: "Pooja Rani",   email: "pooja.rani@email.com",   role: "teacher", campusCode: activeCampus, status: "pending",  requestedAt: now },
    { id: "r3", name: "Ramesh Kumar", email: "ramesh.k@email.com",     role: "parent",  campusCode: activeCampus, status: "pending",  requestedAt: yesterday },
    { id: "r4", name: "Anjali Singh", email: "anjali.s@email.com",     role: "student", campusCode: activeCampus, status: "pending",  requestedAt: yesterday },
    { id: "r5", name: "Vikash Kumar", email: "vikash.k@email.com",     role: "teacher", campusCode: activeCampus, status: "pending",  requestedAt: yesterday },
    { id: "r6", name: "Neha Sharma",  email: "neha.sharma@email.com",  role: "teacher", campusCode: activeCampus, status: "approved", requestedAt: yesterday },
    { id: "r7", name: "Aman Kumar",   email: "aman.kumar@email.com",   role: "student", campusCode: activeCampus, status: "rejected", requestedAt: yesterday },
  ];
}

function updateRequestBadges() {
  const pending = requestsCache.filter(r => r.status === "pending").length;
  const under   = requestsCache.filter(r => r.status === "under_review").length;
  const approved = requestsCache.filter(r => r.status === "approved").length;
  const rejected = requestsCache.filter(r => r.status === "rejected").length;

  // Nav badge
  const navBadge = $("nav-requests-badge");
  navBadge.textContent = pending;
  navBadge.style.display = pending === 0 ? "none" : "";

  // Stat card
  if ($("stat-pending")) $("stat-pending").textContent = pending;

  // Tab counts
  $("tab-count-pending").textContent  = pending;
  $("tab-count-review").textContent   = under;
  $("tab-count-approved").textContent = approved;
  $("tab-count-rejected").textContent = rejected;
}

function setupRequestsTabs() {
  document.querySelectorAll("#requests-tabs .tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#requests-tabs .tab-btn").forEach(b => b.classList.remove("state-active"));
      btn.classList.add("state-active");
      activeRequestTab = btn.dataset.tab;
      renderRequestsForTab(activeRequestTab);
    });
  });
}

function renderRequestsForTab(tabKey) {
  const container = $("requests-list-container");
  const filtered = requestsCache.filter(r => r.status === tabKey);

  if (!filtered.length) {
    container.innerHTML = `<div class="empty-row" style="padding:40px;text-align:center;color:var(--text-muted);">
      No ${tabKey.replace("_"," ")} requests.
    </div>`;
    return;
  }

  container.innerHTML = filtered.map((req, i) => {
    const color = avatarColor(i);
    const date = req.requestedAt?.toDate ? req.requestedAt.toDate() : new Date();
    const dateStr = date.toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric" });
    const timeStr = date.toLocaleTimeString("en-IN", { hour:"2-digit", minute:"2-digit" });
    const roleCls = `role-${req.role}`;

    const actionBtns = req.status === "pending" || req.status === "under_review"
      ? `<button class="action-btn-icon action-btn-view"   data-req-view="${req.id}" title="View details">
           <svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
         </button>
         <button class="action-btn-icon action-btn-approve" data-req-approve="${req.id}" title="Approve">
           <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
         </button>
         <button class="action-btn-icon action-btn-reject"  data-req-reject="${req.id}" title="Reject">
           <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
         </button>`
      : `<button class="action-btn-icon action-btn-view" data-req-view="${req.id}" title="View details">
           <svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
         </button>`;

    return `<div class="request-table-row">
      <div class="req-applicant">
        <div class="req-avatar ${color}">${initials(req.name)}</div>
        <div class="req-applicant-info">
          <p class="req-applicant-name">${req.name || "—"}</p>
          <p class="req-applicant-email">${req.email || "—"}</p>
        </div>
      </div>
      <div><span class="role-badge ${roleCls}">${req.role || "—"}</span></div>
      <div class="req-campus">${req.campusCode || "—"}</div>
      <div class="req-date">${dateStr}<span class="req-date-time">${timeStr}</span></div>
      <div class="req-actions">${actionBtns}</div>
    </div>`;
  }).join("");

  // Wire up actions
  container.querySelectorAll("[data-req-view]").forEach(btn => {
    btn.addEventListener("click", () => openRequestModal(btn.dataset.reqView));
  });
  container.querySelectorAll("[data-req-approve]").forEach(btn => {
    btn.addEventListener("click", () => handleRequestAction(btn.dataset.reqApprove, "approved"));
  });
  container.querySelectorAll("[data-req-reject]").forEach(btn => {
    btn.addEventListener("click", () => handleRequestAction(btn.dataset.reqReject, "rejected"));
  });
}

// Dashboard mini-preview (top 5 pending)
function renderDashboardRequestsPreview() {
  const container = $("dash-requests-list");
  const pending = requestsCache.filter(r => r.status === "pending").slice(0, 5);

  if (!pending.length) {
    container.innerHTML = `<div class="empty-row" style="text-align:center;color:var(--text-muted);padding:20px;">
      No pending requests 🎉
    </div>`;
    return;
  }

  container.innerHTML = pending.map((req, i) => {
    const color = avatarColor(i);
    const roleCls = `role-${req.role}`;
    return `<div class="request-mini-row">
      <div class="req-avatar ${color}" style="width:34px;height:34px;font-size:0.72rem;">${initials(req.name)}</div>
      <div class="req-info">
        <p class="req-name">${req.name || "—"}</p>
        <p class="req-email">${req.email || "—"}</p>
      </div>
      <span class="role-badge ${roleCls}">${req.role}</span>
      <div class="req-mini-actions">
        <button class="action-btn-icon action-btn-view" data-req-view="${req.id}" title="View">
          <svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
        </button>
        <button class="action-btn-icon action-btn-approve" data-req-approve="${req.id}" title="Approve">
          <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
        </button>
        <button class="action-btn-icon action-btn-reject" data-req-reject="${req.id}" title="Reject">
          <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    </div>`;
  }).join("");

  container.querySelectorAll("[data-req-view]").forEach(btn =>
    btn.addEventListener("click", () => openRequestModal(btn.dataset.reqView)));
  container.querySelectorAll("[data-req-approve]").forEach(btn =>
    btn.addEventListener("click", () => handleRequestAction(btn.dataset.reqApprove, "approved")));
  container.querySelectorAll("[data-req-reject]").forEach(btn =>
    btn.addEventListener("click", () => handleRequestAction(btn.dataset.reqReject, "rejected")));
}

// Open detail modal
function openRequestModal(reqId) {
  const req = requestsCache.find(r => r.id === reqId);
  if (!req) return;

  const date = req.requestedAt?.toDate ? req.requestedAt.toDate() : new Date();
  const dateStr = date.toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" });

  $("req-modal-avatar").textContent = initials(req.name);
  $("req-modal-avatar").className = `request-modal-avatar ${avatarColor(0)}`;
  $("req-modal-name").textContent = req.name || "—";
  $("req-modal-email").textContent = req.email || "—";
  $("req-modal-role").innerHTML = `<span class="role-badge role-${req.role}">${req.role}</span>`;
  $("req-modal-campus").textContent = req.campusCode || "—";
  $("req-modal-date").textContent = dateStr;
  $("req-modal-status").innerHTML = `<span class="badge badge-${req.status}">${req.status.replace("_"," ")}</span>`;

  const isPending = req.status === "pending" || req.status === "under_review";
  $("req-modal-approve-btn").style.display = isPending ? "" : "none";
  $("req-modal-reject-btn").style.display  = isPending ? "" : "none";

  $("req-modal-approve-btn").onclick = () => { closeRequestModal(); handleRequestAction(reqId, "approved"); };
  $("req-modal-reject-btn").onclick  = () => { closeRequestModal(); handleRequestAction(reqId, "rejected");  };

  $("request-modal").hidden = false;
}

function closeRequestModal() {
  $("request-modal").hidden = true;
}

// Approve / Reject
async function handleRequestAction(reqId, newStatus) {
  const req = requestsCache.find(r => r.id === reqId);
  if (!req) return;

  try {
    // Update Firestore
    await updateDoc(doc(db, "access_requests", reqId), {
      status: newStatus,
      reviewedAt: serverTimestamp(),
      reviewedBy: currentUser?.uid || "admin"
    });
  } catch (err) {
    console.warn("Could not update Firestore (demo mode):", err.message);
    // In demo mode, just update local cache
  }

  // Update local cache
  const idx = requestsCache.findIndex(r => r.id === reqId);
  if (idx !== -1) requestsCache[idx].status = newStatus;

  updateRequestBadges();
  renderRequestsForTab(activeRequestTab);
  renderDashboardRequestsPreview();
  renderDashboardActivity();

  if (newStatus === "approved") {
    showToast(`✅ ${req.name}'s request approved!`, "success");
  } else {
    showToast(`❌ ${req.name}'s request rejected.`, "error");
  }
}

// ============ DASHBOARD RECENT ACTIVITY ============
function renderDashboardActivity() {
  const list = $("list-recent-activity");

  // Combine: recent approved/rejected requests + recently added members
  const recentRequests = requestsCache
    .filter(r => r.status === "approved" || r.status === "rejected")
    .slice(0, 3)
    .map(r => ({
      type: r.status === "approved" ? "approved" : "rejected",
      title: r.status === "approved" ? "Access request approved" : "Access request rejected",
      meta: `${r.name} (${r.role?.charAt(0).toUpperCase() + r.role?.slice(1)})`,
      time: "Recently"
    }));

  const recentStudents = studentsCache.slice(0,2).map(s => ({
    type: "student", title: "New student enrolled", meta: s.name || s.email, time: "Recently"
  }));
  const recentTeachers = teachersCache.slice(0,1).map(t => ({
    type: "teacher", title: "New teacher account created", meta: t.name || t.email, time: "Recently"
  }));
  const recentParents = parentsCache.slice(0,1).map(p => ({
    type: "parent", title: "Parent account created", meta: p.name || p.email, time: "Recently"
  }));

  const combined = [...recentTeachers, ...recentStudents, ...recentParents, ...recentRequests].slice(0, 6);

  if (!combined.length) {
    list.innerHTML = `<li class="empty-row" style="padding:20px;text-align:center;">No activity yet.</li>`;
    return;
  }

  const iconMap = {
    student:  { cls: "activity-icon-student",  svg: `<path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12v5c0 1.5 3 3 6 3s6-1.5 6-3v-5"/>` },
    teacher:  { cls: "activity-icon-teacher",  svg: `<rect x="2" y="4" width="20" height="16" rx="2"/><circle cx="8" cy="11" r="2.5"/><path d="M4.5 17c.7-2 2.3-3 3.5-3s2.8 1 3.5 3"/><line x1="14" y1="9" x2="19" y2="9"/><line x1="14" y1="13" x2="19" y2="13"/>` },
    parent:   { cls: "activity-icon-parent",   svg: `<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>` },
    approved: { cls: "activity-icon-approved", svg: `<polyline points="20 6 9 17 4 12"/>` },
    rejected: { cls: "activity-icon-rejected", svg: `<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>` },
  };

  list.innerHTML = combined.map(item => {
    const ic = iconMap[item.type] || iconMap.student;
    return `<li class="activity-item">
      <div class="activity-icon ${ic.cls}">
        <svg viewBox="0 0 24 24">${ic.svg}</svg>
      </div>
      <div class="activity-body">
        <p class="activity-title">${item.title}</p>
        <p class="activity-meta">${item.meta}</p>
      </div>
      <span class="activity-time">${item.time}</span>
    </li>`;
  }).join("");
}

// ============ STUDENTS ============
async function loadStudents() {
  try {
    const snap = await getDocs(query(
      collection(db, "institutes", activeCampus, "students"),
      orderBy("createdAt", "desc")
    ));
    studentsCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.warn("Load students failed:", err.message);
    studentsCache = [];
  }
  if ($("stat-students")) $("stat-students").textContent = studentsCache.length;
  if ($("students-count-chip")) $("students-count-chip").textContent = `${studentsCache.length} records`;
  renderStudents($("search-students")?.value || "");
}

function renderStudents(filterText) {
  const list = $("list-students");
  const f = (filterText || "").trim().toLowerCase();
  const rows = studentsCache.filter(s =>
    !f || s.name?.toLowerCase().includes(f) || s.email?.toLowerCase().includes(f) ||
    s.classId?.toLowerCase().includes(f)
  );
  if (!rows.length) {
    list.innerHTML = `<li class="empty-row">${studentsCache.length ? "No students match your search." : "No students yet. Create one above."}</li>`;
    return;
  }
  list.innerHTML = rows.map((s, i) => `
    <li class="admin-row">
      <div class="req-avatar ${avatarColor(i)}" style="width:36px;height:36px;font-size:0.72rem;flex-shrink:0;">${initials(s.name)}</div>
      <div class="admin-row-info">
        <p class="row-title">${s.name || "—"} <span class="badge badge-submitted">${s.classId || ""}</span></p>
        <p class="row-meta">${s.email || "—"} ${s.rollNo ? "• Roll No: " + s.rollNo : ""}</p>
      </div>
      <div class="admin-row-actions">
        <button class="icon-btn" data-edit="student" data-id="${s.id}" aria-label="Edit ${s.name}">
          <svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
        </button>
        <button class="icon-btn icon-btn-danger" data-delete="student" data-id="${s.id}" aria-label="Delete ${s.name}">
          <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>
    </li>`).join("");
  attachRowActions();
}

// ============ TEACHERS ============
async function loadTeachers() {
  try {
    const snap = await getDocs(query(
      collection(db, "institutes", activeCampus, "teachers"),
      orderBy("createdAt", "desc")
    ));
    teachersCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.warn("Load teachers failed:", err.message);
    teachersCache = [];
  }
  if ($("stat-teachers")) $("stat-teachers").textContent = teachersCache.length;
  if ($("teachers-count-chip")) $("teachers-count-chip").textContent = `${teachersCache.length} records`;
  renderTeachers($("search-teachers")?.value || "");
}

function renderTeachers(filterText) {
  const list = $("list-teachers");
  const f = (filterText || "").trim().toLowerCase();
  const rows = teachersCache.filter(t =>
    !f || t.name?.toLowerCase().includes(f) || t.email?.toLowerCase().includes(f) ||
    (t.subjectIds || []).some(s => s.toLowerCase().includes(f))
  );
  if (!rows.length) {
    list.innerHTML = `<li class="empty-row">${teachersCache.length ? "No teachers match your search." : "No teachers yet. Create one above."}</li>`;
    return;
  }
  list.innerHTML = rows.map((t, i) => `
    <li class="admin-row">
      <div class="req-avatar ${avatarColor(i)}" style="width:36px;height:36px;font-size:0.72rem;flex-shrink:0;">${initials(t.name)}</div>
      <div class="admin-row-info">
        <p class="row-title">${t.name || "—"}</p>
        <p class="row-meta">${t.email || "—"} ${(t.subjectIds||[]).length ? "• " + t.subjectIds.join(", ") : ""}</p>
      </div>
      <div class="admin-row-actions">
        <button class="icon-btn" data-edit="teacher" data-id="${t.id}" aria-label="Edit ${t.name}">
          <svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
        </button>
        <button class="icon-btn icon-btn-danger" data-delete="teacher" data-id="${t.id}" aria-label="Delete ${t.name}">
          <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>
    </li>`).join("");
  attachRowActions();
}

// ============ PARENTS ============
async function loadParents() {
  try {
    const snap = await getDocs(query(
      collection(db, "institutes", activeCampus, "parents"),
      orderBy("createdAt", "desc")
    ));
    parentsCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.warn("Load parents failed:", err.message);
    parentsCache = [];
  }
  if ($("stat-parents")) $("stat-parents").textContent = parentsCache.length;
  if ($("parents-count-chip")) $("parents-count-chip").textContent = `${parentsCache.length} records`;
  renderParents($("search-parents")?.value || "");
}

function renderParents(filterText) {
  const list = $("list-parents");
  const f = (filterText || "").trim().toLowerCase();
  const rows = parentsCache.filter(p =>
    !f || p.name?.toLowerCase().includes(f) || p.email?.toLowerCase().includes(f)
  );
  if (!rows.length) {
    list.innerHTML = `<li class="empty-row">${parentsCache.length ? "No parents match your search." : "No parents yet. Create one above."}</li>`;
    return;
  }
  list.innerHTML = rows.map((p, i) => {
    const childNames = (p.childIds || [])
      .map(cid => studentsCache.find(s => s.id === cid)?.name)
      .filter(Boolean);
    return `<li class="admin-row">
      <div class="req-avatar ${avatarColor(i)}" style="width:36px;height:36px;font-size:0.72rem;flex-shrink:0;">${initials(p.name)}</div>
      <div class="admin-row-info">
        <p class="row-title">${p.name || "—"}</p>
        <p class="row-meta">${p.email || "—"} ${p.mobile ? "• " + p.mobile : ""} ${childNames.length ? "• Child: " + childNames.join(", ") : ""}</p>
      </div>
      <div class="admin-row-actions">
        <button class="icon-btn" data-edit="parent" data-id="${p.id}" aria-label="Edit ${p.name}">
          <svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
        </button>
        <button class="icon-btn icon-btn-danger" data-delete="parent" data-id="${p.id}" aria-label="Delete ${p.name}">
          <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>
    </li>`;
  }).join("");
  attachRowActions();
}

// ============ CREATE FORMS ============
async function findUserByEmail(email) {
  const q = query(collection(db, "users"), where("email", "==", email.trim().toLowerCase()), limit(1));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { uid: d.id, ...d.data() };
}

async function handleCreateStudent(e) {
  e.preventDefault();
  const errEl = $("student-form-error");
  errEl.hidden = true;
  const btn = e.target.querySelector("button[type=submit]");
  btn.disabled = true;

  const name   = $("student-name").value.trim();
  const email  = $("student-email").value.trim();
  const rollNo = $("student-rollno").value.trim();
  const classId = $("student-class").value.trim();

  try {
    const account = await findUserByEmail(email);
    if (!account) {
      errEl.textContent = `No account found for ${email}. Ask the student to sign up first.`;
      errEl.hidden = false; return;
    }
    if (account.role && account.role !== "student") {
      errEl.textContent = `${email} is already registered as a ${account.role}.`;
      errEl.hidden = false; return;
    }
    await setDoc(doc(db, "institutes", activeCampus, "students", account.uid), {
      uid: account.uid, name, email: email.toLowerCase(), rollNo, classId, createdAt: serverTimestamp()
    });
    e.target.reset();
    $("create-student-panel").style.display = "none";
    await loadStudents();
    renderDashboardActivity();
    showToast(`✅ Student ${name} created!`, "success");
  } catch (err) {
    errEl.textContent = err?.message || "Something went wrong.";
    errEl.hidden = false;
  } finally { btn.disabled = false; }
}

async function handleCreateTeacher(e) {
  e.preventDefault();
  const errEl = $("teacher-form-error");
  errEl.hidden = true;
  const btn = e.target.querySelector("button[type=submit]");
  btn.disabled = true;

  const name     = $("teacher-name").value.trim();
  const email    = $("teacher-email").value.trim();
  const subjects = $("teacher-subjects").value.split(",").map(s=>s.trim()).filter(Boolean);

  try {
    const account = await findUserByEmail(email);
    if (!account) {
      errEl.textContent = `No account found for ${email}.`;
      errEl.hidden = false; return;
    }
    await setDoc(doc(db, "institutes", activeCampus, "teachers", account.uid), {
      uid: account.uid, name, email: email.toLowerCase(), subjectIds: subjects, createdAt: serverTimestamp()
    });
    e.target.reset();
    $("create-teacher-panel").style.display = "none";
    await loadTeachers();
    renderDashboardActivity();
    showToast(`✅ Teacher ${name} created!`, "success");
  } catch (err) {
    errEl.textContent = err?.message || "Something went wrong.";
    errEl.hidden = false;
  } finally { btn.disabled = false; }
}

async function handleCreateParent(e) {
  e.preventDefault();
  const errEl = $("parent-form-error");
  errEl.hidden = true;
  const btn = e.target.querySelector("button[type=submit]");
  btn.disabled = true;

  const name       = $("parent-name").value.trim();
  const email      = $("parent-email").value.trim();
  const mobile     = $("parent-mobile").value.trim();
  const childEmail = $("parent-child-email").value.trim();

  try {
    const account = await findUserByEmail(email);
    if (!account) {
      errEl.textContent = `No account found for ${email}.`;
      errEl.hidden = false; return;
    }
    let childIds = [];
    if (childEmail) {
      const child = studentsCache.find(s => s.email?.toLowerCase() === childEmail.toLowerCase());
      if (!child) {
        errEl.textContent = `No student found with email ${childEmail}.`;
        errEl.hidden = false; return;
      }
      childIds = [child.id];
    }
    await setDoc(doc(db, "institutes", activeCampus, "parents", account.uid), {
      uid: account.uid, name, email: email.toLowerCase(), mobile, childIds, createdAt: serverTimestamp()
    });
    e.target.reset();
    $("create-parent-panel").style.display = "none";
    await loadParents();
    renderDashboardActivity();
    showToast(`✅ Parent ${name} created!`, "success");
  } catch (err) {
    errEl.textContent = err?.message || "Something went wrong.";
    errEl.hidden = false;
  } finally { btn.disabled = false; }
}

// ============ EDIT MODAL ============
const ENTITY_CONFIG = {
  student: {
    cache: () => studentsCache, collection: "students", reload: loadStudents,
    fields: [
      { key: "name",    label: "Full Name", type: "text" },
      { key: "rollNo",  label: "Roll No",   type: "text" },
      { key: "classId", label: "Class",     type: "text" }
    ]
  },
  teacher: {
    cache: () => teachersCache, collection: "teachers", reload: loadTeachers,
    fields: [
      { key: "name",       label: "Full Name",                 type: "text" },
      { key: "subjectIds", label: "Subjects (comma-separated)", type: "text", isArray: true }
    ]
  },
  parent: {
    cache: () => parentsCache, collection: "parents", reload: loadParents,
    fields: [
      { key: "name",   label: "Full Name", type: "text" },
      { key: "mobile", label: "Mobile",    type: "tel"  }
    ]
  }
};

function attachRowActions() {
  document.querySelectorAll("[data-edit]").forEach(btn => {
    btn.onclick = () => openEditModal(btn.dataset.edit, btn.dataset.id);
  });
  document.querySelectorAll("[data-delete]").forEach(btn => {
    btn.onclick = () => handleDelete(btn.dataset.delete, btn.dataset.id);
  });
}

function openEditModal(entityType, id) {
  const config = ENTITY_CONFIG[entityType];
  const record = config.cache().find(r => r.id === id);
  if (!record) return;

  $("edit-modal-title").textContent = `Edit ${entityType.charAt(0).toUpperCase() + entityType.slice(1)}`;
  const form = $("edit-modal-form");
  form.innerHTML = config.fields.map(f => {
    const val = f.isArray ? (record[f.key] || []).join(", ") : (record[f.key] || "");
    return `<label style="display:flex;flex-direction:column;gap:6px;font-size:0.82rem;color:var(--text-muted);">
      ${f.label}
      <input data-field="${f.key}" data-is-array="${!!f.isArray}" type="${f.type}" value="${String(val).replace(/"/g,'&quot;')}"
        style="padding:10px 12px;border-radius:var(--radius-md);border:1px solid var(--glass-border);background:var(--color-surface-input);color:var(--text-primary);font-family:inherit;font-size:0.88rem;">
    </label>`;
  }).join("");

  $("edit-modal").hidden = false;
  $("edit-modal-save").onclick = () => saveEditModal(entityType, id);
}

function closeEditModal() {
  $("edit-modal").hidden = true;
  $("edit-modal-form").innerHTML = "";
}

async function saveEditModal(entityType, id) {
  const config = ENTITY_CONFIG[entityType];
  const inputs = $("edit-modal-form").querySelectorAll("input[data-field]");
  const updates = {};
  inputs.forEach(input => {
    const isArray = input.dataset.isArray === "true";
    updates[input.dataset.field] = isArray
      ? input.value.split(",").map(s => s.trim()).filter(Boolean)
      : input.value.trim();
  });

  const saveBtn = $("edit-modal-save");
  saveBtn.disabled = true;
  try {
    await updateDoc(doc(db, "institutes", activeCampus, config.collection, id), updates);
    closeEditModal();
    await config.reload();
    showToast("✅ Changes saved!", "success");
  } catch (err) {
    console.error("Save edit failed:", err);
    showToast("Could not save: " + (err?.message || err), "error");
  } finally { saveBtn.disabled = false; }
}

// ============ DELETE ============
async function handleDelete(entityType, id) {
  const config = ENTITY_CONFIG[entityType];
  const record = config.cache().find(r => r.id === id);
  if (!record) return;

  if (!window.confirm(`Delete ${record.name || "this record"}? This cannot be undone.`)) return;

  try {
    await deleteDoc(doc(db, "institutes", activeCampus, config.collection, id));
    await config.reload();
    renderDashboardActivity();
    showToast(`🗑 ${record.name} deleted.`, "info");
  } catch (err) {
    console.error("Delete failed:", err);
    showToast("Could not delete: " + (err?.message || err), "error");
  }
}
