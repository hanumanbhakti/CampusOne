/**
 * CampusOne — Student Dashboard Controller (v1: Dashboard, Attendance, Assignments,
 * Results, Fees, Notices, Profile, Logout)
 *
 * Connects to the SAME Firebase project as the login screen (firebase-config.js).
 * Nothing here is mocked — every section renders only what Firestore actually returns.
 * Empty collections show "No records yet" until real documents are added.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * EXPECTED FIRESTORE SHAPE — create these collections in Firebase console:
 * ───────────────────────────────────────────────────────────────────────────
 *
 * users/{uid}
 *   name, email, mobile, address, bloodGroup, rollNo, class, section,
 *   tenant, photoURL, cgpa (number, optional fallback for dashboard card)
 *
 * attendance/{autoId}
 *   studentId: uid, date: "YYYY-MM-DD", status: "present" | "absent",
 *   subject: "DBMS" (optional — omit for a general daily record), tenant
 *
 * assignments/{autoId}
 *   studentId: uid  (or omit + use class/tenant to broadcast to a whole class)
 *   title, subject, dueDate: "YYYY-MM-DD", status: "pending" | "submitted",
 *   remarks (teacher remarks, optional), tenant
 *
 * results/{autoId}
 *   studentId: uid, semester: "III", sgpa: 8.4, cgpa: 8.2,
 *   subjects: [ { name: "DBMS", internal: 18, external: 62, grade: "A" }, ... ],
 *   tenant
 *
 * fees/{autoId}
 *   studentId: uid, amount: 25000, status: "paid" | "pending",
 *   date: "YYYY-MM-DD", method: "Online", receiptUrl: "https://...", tenant
 *
 * notices/{autoId}
 *   title, message, date: "YYYY-MM-DD" or Timestamp, tenant, audience: "student" | "all"
 */

import { auth, db, getCurrentTenant, waitForAuthReady } from "./firebase-config.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  doc, getDoc, collection, query, where, orderBy, limit, getDocs
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const $ = (id) => document.getElementById(id);
let assignmentsCache = [];

console.log("[CampusOne] student-dashboard.js module loaded ✓");

document.addEventListener("DOMContentLoaded", () => {
  console.log("[CampusOne] DOM ready, starting init...");
  // Safety net: if nothing has resolved this within 8s, something failed to import/connect.
  // Show a real error instead of hanging forever on "Verifying your session...".
  const safetyTimer = setTimeout(() => {
    const gate = document.getElementById("auth-gate");
    if (gate && !gate.hidden) {
      gate.innerHTML = `
        <p style="color:#EF4444;font-weight:600;">⚠ Could not connect to Firebase.</p>
        <p style="color:#94A3B8;font-size:0.85rem;max-width:320px;text-align:center;">
          This usually means <code>firebase-config.js</code> is missing from this folder,
          or there's a network/script error. Open the browser console (or DevTools) for details.
        </p>
        <a href="index.html" style="color:#3B82F6;margin-top:8px;">← Back to Login</a>
      `;
    }
  }, 8000);

  initDashboard().catch((err) => {
    console.error("Dashboard init failed:", err);
    clearTimeout(safetyTimer);
    const gate = document.getElementById("auth-gate");
    if (gate) {
      gate.innerHTML = `
        <p style="color:#EF4444;font-weight:600;">⚠ Something went wrong.</p>
        <p style="color:#94A3B8;font-size:0.85rem;max-width:320px;text-align:center;">${err?.message || err}</p>
        <a href="index.html" style="color:#3B82F6;margin-top:8px;">← Back to Login</a>
      `;
      gate.hidden = false;
    }
  }).then(() => clearTimeout(safetyTimer));
});

async function initDashboard() {
  console.log("[CampusOne] initDashboard started, waiting for auth...");
  const gate = $("auth-gate");
  const shell = $("app-shell");

  // --- AUTH GUARD ---
  const user = await waitForAuthReady();
  console.log("[CampusOne] auth resolved:", user ? user.email : "no user");
  if (!user) { window.location.href = "index.html"; return; }

  let profile = null;
  try {
    const snap = await getDoc(doc(db, "users", user.uid));
    profile = snap.exists() ? snap.data() : null;
  } catch (e) { console.error("Profile fetch failed:", e); }

  if (profile && profile.role && profile.role !== "student") {
    window.location.href = "index.html";
    return;
  }

  gate.hidden = true;
  shell.hidden = false;

  const tenant = profile?.tenant || getCurrentTenant() || "—";
  const displayName = profile?.name || user.displayName || user.email.split("@")[0];
  const classLabel = [profile?.class, profile?.section].filter(Boolean).join(" - ") || "—";

  $("greeting-text").textContent = `Welcome, ${displayName} 👋`;
  $("user-class").textContent = `Class: ${classLabel}`;
  $("user-roll").textContent = profile?.rollNo || "—";
  $("user-name").textContent = displayName;
  $("user-meta").textContent = user.email;

  $("p-name").textContent = displayName;
  $("p-email").textContent = user.email;
  $("p-mobile").textContent = profile?.mobile || "—";
  $("p-roll").textContent = profile?.rollNo || "—";
  $("p-class").textContent = classLabel;
  $("p-address").textContent = profile?.address || "—";
  $("p-blood").textContent = profile?.bloodGroup || "—";
  $("p-tenant").textContent = tenant;

  if (profile?.photoURL) {
    $("user-avatar").src = profile.photoURL;
    $("user-avatar").hidden = false;
  }

  // --- NAVIGATION ---
  const navItems = document.querySelectorAll(".nav-item");
  const sections = document.querySelectorAll(".dash-section");
  navItems.forEach((item) => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      const target = item.dataset.section;
      navItems.forEach((n) => n.classList.remove("state-active"));
      item.classList.add("state-active");
      sections.forEach((s) => (s.hidden = s.id !== `section-${target}`));
      document.getElementById("sidebar").classList.remove("mobile-open");
      document.getElementById("sidebar-overlay").classList.remove("show");
      document.getElementById("sidebar-overlay").hidden = true;
    });
  });

  $("btn-mobile-nav").addEventListener("click", () => {
    document.getElementById("sidebar").classList.toggle("mobile-open");
    document.getElementById("sidebar-overlay").classList.toggle("show");
    document.getElementById("sidebar-overlay").hidden = !document.getElementById("sidebar-overlay").classList.contains("show");
  });

  document.getElementById("sidebar-overlay").addEventListener("click", () => {
    document.getElementById("sidebar").classList.remove("mobile-open");
    document.getElementById("sidebar-overlay").classList.remove("show");
    document.getElementById("sidebar-overlay").hidden = true;
  });

  // --- LOGOUT ---
  $("btn-logout").addEventListener("click", async () => {
    try { await signOut(auth); window.location.href = "index.html"; }
    catch (e) { console.error("Sign-out failed:", e); }
  });

  // --- ASSIGNMENT FILTER TABS ---
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("state-active"));
      btn.classList.add("state-active");
      renderAssignments(btn.dataset.filter);
    });
  });

  // --- LOAD EVERYTHING ---
  loadAttendance(user.uid);
  loadAssignments(user.uid, tenant);
  loadResults(user.uid, tenant, profile);
  loadFees(user.uid, tenant);
  loadNotices(tenant);
}

// =================== ATTENDANCE ===================
async function loadAttendance(uid) {
  const fullList = $("list-attendance-full");
  const subjectList = $("list-attendance-subject");
  try {
    const q = query(collection(db, "attendance"), where("studentId", "==", uid), orderBy("date", "desc"), limit(30));
    const snap = await getDocs(q);

    if (snap.empty) {
      fullList.innerHTML = subjectList.innerHTML = `<li class="empty-row">No attendance records yet.</li>`;
      $("stat-attendance").textContent = "--%";
      $("attendance-overall-big").textContent = "--%";
      $("today-attendance-pill").textContent = "Today: —";
      return;
    }

    let presentCount = 0;
    const rows = [];
    const bySubject = {};
    let todayRecord = null;
    const todayStr = new Date().toISOString().slice(0, 10);

    snap.forEach((d) => {
      const r = d.data();
      if (r.status === "present") presentCount++;
      if (r.date === todayStr) todayRecord = r;

      if (r.subject) {
        bySubject[r.subject] = bySubject[r.subject] || { present: 0, total: 0 };
        bySubject[r.subject].total++;
        if (r.status === "present") bySubject[r.subject].present++;
      }

      rows.push(`<li><p class="row-title">${r.date || "—"}${r.subject ? ` · ${r.subject}` : ""}<span class="badge ${r.status === "present" ? "badge-present" : "badge-absent"}">${(r.status || "unknown").toUpperCase()}</span></p></li>`);
    });

    fullList.innerHTML = rows.join("");

    const pct = Math.round((presentCount / snap.size) * 100);
    $("stat-attendance").textContent = `${pct}%`;
    $("attendance-overall-big").textContent = `${pct}%`;
    $("attendance-overall-meta").textContent = `${presentCount} present out of ${snap.size} recorded days`;

    if (todayRecord) {
      const pill = $("today-attendance-pill");
      pill.textContent = `Today: ${todayRecord.status === "present" ? "Present ✅" : "Absent ❌"}`;
      pill.className = `pill ${todayRecord.status === "present" ? "pill-present" : "pill-absent"}`;
    }

    const subjectRows = Object.entries(bySubject).map(([subj, v]) => {
      const subjPct = Math.round((v.present / v.total) * 100);
      return `<li><p class="row-title">${subj}<span class="badge badge-present">${subjPct}%</span></p><p class="row-meta">${v.present}/${v.total} classes attended</p></li>`;
    });
    subjectList.innerHTML = subjectRows.length ? subjectRows.join("") : `<li class="empty-row">No subject-wise data tagged yet.</li>`;

  } catch (e) {
    console.error("Attendance fetch failed:", e);
    const msg = `<li class="empty-row">Could not load attendance.${e.code === "permission-denied" ? " Check Firestore security rules." : ""}</li>`;
    fullList.innerHTML = subjectList.innerHTML = msg;
  }
}

// =================== ASSIGNMENTS ===================
async function loadAssignments(uid, tenant) {
  try {
    let q;
    if (tenant && tenant !== "—") {
      q = query(collection(db, "assignments"), where("tenant", "==", tenant), orderBy("dueDate", "asc"), limit(50));
    } else {
      q = query(collection(db, "assignments"), orderBy("dueDate", "asc"), limit(50));
    }
    const snap = await getDocs(q);
    assignmentsCache = [];
    snap.forEach((d) => {
      const r = d.data();
      if (!r.studentId || r.studentId === uid) assignmentsCache.push(r);
    });

    const pending = assignmentsCache.filter((a) => a.status !== "submitted").length;
    $("stat-assignments").textContent = String(pending);

    renderAssignments("all");

    const previewList = $("list-assignments-preview");
    const upcoming = assignmentsCache.filter((a) => a.status !== "submitted").slice(0, 4);
    previewList.innerHTML = upcoming.length
      ? upcoming.map(assignmentRow).join("")
      : `<li class="empty-row">No pending assignments. 🎉</li>`;

  } catch (e) {
    console.error("Assignments fetch failed:", e);
    $("list-assignments-full").innerHTML = `<li class="empty-row">Could not load assignments.</li>`;
    $("list-assignments-preview").innerHTML = `<li class="empty-row">Could not load assignments.</li>`;
  }
}

function assignmentRow(r) {
  const badgeClass = r.status === "submitted" ? "badge-submitted" : "badge-pending";
  return `<li>
    <p class="row-title">${r.title || "Untitled"}<span class="badge ${badgeClass}">${r.status || "pending"}</span></p>
    <p class="row-meta">${r.subject || ""} • Due ${r.dueDate || "—"}</p>
    ${r.remarks ? `<p class="row-meta">Teacher remarks: ${r.remarks}</p>` : ""}
  </li>`;
}

function renderAssignments(filter) {
  const fullList = $("list-assignments-full");
  let items = assignmentsCache;
  if (filter === "pending") items = items.filter((a) => a.status !== "submitted");
  if (filter === "submitted") items = items.filter((a) => a.status === "submitted");

  fullList.innerHTML = items.length ? items.map(assignmentRow).join("") : `<li class="empty-row">No assignments in this view.</li>`;
}

// =================== RESULTS ===================
async function loadResults(uid, tenant, profile) {
  const internalList = $("list-internal-marks");
  const fullList = $("list-results-full");
  try {
    const q = query(collection(db, "results"), where("studentId", "==", uid), orderBy("semester", "desc"), limit(10));
    const snap = await getDocs(q);

    if (snap.empty) {
      const fallbackCgpa = profile?.cgpa ?? "--";
      $("stat-cgpa").textContent = fallbackCgpa;
      $("results-cgpa-big").textContent = fallbackCgpa;
      internalList.innerHTML = fullList.innerHTML = `<li class="empty-row">No results published yet.</li>`;
      return;
    }

    let latestCgpa = profile?.cgpa ?? "--";
    const semesterRows = [];
    const internalRows = [];

    snap.forEach((d, idx) => {
      const r = d.data();
      if (idx === 0 && r.cgpa) latestCgpa = r.cgpa;

      const subjectsHtml = (r.subjects || []).map((s) =>
        `<span class="badge badge-pending">${s.name}: ${s.grade || "—"}</span>`
      ).join(" ");

      semesterRows.push(`<li>
        <p class="row-title">Semester ${r.semester || "—"} <span class="badge badge-submitted">SGPA ${r.sgpa ?? "—"}</span></p>
        <p class="row-meta">${subjectsHtml}</p>
      </li>`);

      (r.subjects || []).forEach((s) => {
        internalRows.push(`<li><p class="row-title">${s.name}<span class="badge badge-pending">Internal: ${s.internal ?? "—"}</span></p><p class="row-meta">External: ${s.external ?? "—"} • Grade: ${s.grade || "—"}</p></li>`);
      });
    });

    $("stat-cgpa").textContent = latestCgpa;
    $("results-cgpa-big").textContent = latestCgpa;
    fullList.innerHTML = semesterRows.join("");
    internalList.innerHTML = internalRows.length ? internalRows.slice(0, 8).join("") : `<li class="empty-row">No internal marks recorded yet.</li>`;

  } catch (e) {
    console.error("Results fetch failed:", e);
    $("stat-cgpa").textContent = profile?.cgpa ?? "--";
    $("results-cgpa-big").textContent = profile?.cgpa ?? "--";
    internalList.innerHTML = fullList.innerHTML = `<li class="empty-row">Could not load results.</li>`;
  }
}

// =================== FEES ===================
async function loadFees(uid, tenant) {
  const historyList = $("list-fees-history");
  try {
    const q = query(collection(db, "fees"), where("studentId", "==", uid), orderBy("date", "desc"), limit(50));
    const snap = await getDocs(q);

    if (snap.empty) {
      historyList.innerHTML = `<li class="empty-row">No fee records yet.</li>`;
      $("stat-fees").textContent = "—";
      $("fees-paid").textContent = "₹0";
      $("fees-pending").textContent = "₹0";
      return;
    }

    let paidTotal = 0, pendingTotal = 0;
    const rows = [];

    snap.forEach((d) => {
      const r = d.data();
      const amt = Number(r.amount) || 0;
      if (r.status === "paid") paidTotal += amt; else pendingTotal += amt;

      rows.push(`<li>
        <p class="row-title">₹${amt.toLocaleString()} <span class="badge ${r.status === "paid" ? "badge-paid" : "badge-due"}">${(r.status || "pending").toUpperCase()}</span></p>
        <p class="row-meta">${r.date || "—"} ${r.method ? `• ${r.method}` : ""}</p>
        ${r.receiptUrl ? `<p class="row-meta"><a href="${r.receiptUrl}" target="_blank" rel="noopener">⬇ Download Receipt</a></p>` : ""}
      </li>`);
    });

    historyList.innerHTML = rows.join("");
    $("fees-paid").textContent = `₹${paidTotal.toLocaleString()}`;
    $("fees-pending").textContent = `₹${pendingTotal.toLocaleString()}`;
    $("stat-fees").textContent = pendingTotal > 0 ? "Due" : "Cleared";

  } catch (e) {
    console.error("Fees fetch failed:", e);
    historyList.innerHTML = `<li class="empty-row">Could not load fee records.</li>`;
    $("stat-fees").textContent = "—";
  }
}

// =================== NOTICES ===================
async function loadNotices(tenant) {
  const previewList = $("list-notices-preview");
  const fullList = $("list-notices-full");
  try {
    let q;
    if (tenant && tenant !== "—") {
      q = query(collection(db, "notices"), where("tenant", "==", tenant), orderBy("date", "desc"), limit(30));
    } else {
      q = query(collection(db, "notices"), orderBy("date", "desc"), limit(30));
    }
    const snap = await getDocs(q);

    if (snap.empty) {
      previewList.innerHTML = fullList.innerHTML = `<li class="empty-row">No notices yet.</li>`;
      $("stat-notices").textContent = "0";
      return;
    }

    const rows = [];
    snap.forEach((d) => {
      const r = d.data();
      const dateStr = r.date?.toDate ? r.date.toDate().toLocaleDateString() : (r.date || "—");
      rows.push(`<li><p class="row-title">${r.title || "Notice"}</p><p class="row-meta">${dateStr}</p><p class="row-meta">${r.message || ""}</p></li>`);
    });

    fullList.innerHTML = rows.join("");
    previewList.innerHTML = rows.slice(0, 4).join("");
    $("stat-notices").textContent = String(snap.size);

  } catch (e) {
    console.error("Notices fetch failed:", e);
    previewList.innerHTML = fullList.innerHTML = `<li class="empty-row">Could not load notices.</li>`;
  }
}
