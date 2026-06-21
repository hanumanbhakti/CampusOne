/**
 * CampusOne — Parent Dashboard Controller
 *
 * LINKING MODEL:
 *   users/{parentUid} → { role: "parent", name, email, mobile, tenant, childUid: studentUid }
 * The dashboard reads the parent's own user doc, takes childUid as the
 * active child (multi-child switcher can be added later), then scopes every
 * query below to that studentId. Matching security rules are in firestore.rules
 * at the project root — deploy those or this data is NOT actually protected.
 *
 * COLLECTIONS USED (create in Firebase console):
 *   users/{uid}, attendance, assignments, results, fees, notices,
 *   messages, leaveRequests, entryExitLogs, busTracking/{busId}, health/{studentId}, sosAlerts
 *
 * Nothing is mocked. Empty collections show "No records yet".
 */

import { auth, db, getCurrentTenant, waitForAuthReady } from "./firebase-config.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  doc, getDoc, collection, query, where, orderBy, limit, getDocs, addDoc, serverTimestamp, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const $ = (id) => document.getElementById(id);
let activeChildId = null;
let activeTenant = null;
let unsubscribeChat = null;

console.log("[CampusOne] parents-dashboard.js loaded ✓");

document.addEventListener("DOMContentLoaded", () => {
  const safetyTimer = setTimeout(() => {
    const gate = $("auth-gate");
    if (gate && !gate.hidden) {
      gate.innerHTML = `<p style="color:#EF4444;font-weight:600;">⚠ Could not connect to Firebase.</p>
        <p style="color:#94A3B8;font-size:0.85rem;max-width:320px;text-align:center;">Check that firebase-config.js is in this folder and the console has no errors.</p>
        <a href="../index.html" style="color:#3B82F6;margin-top:8px;">← Back to Login</a>`;
    }
  }, 8000);

  initDashboard().catch((err) => {
    console.error("Parent dashboard init failed:", err);
    clearTimeout(safetyTimer);
    const gate = $("auth-gate");
    if (gate) {
      gate.innerHTML = `<p style="color:#EF4444;font-weight:600;">⚠ Something went wrong.</p>
        <p style="color:#94A3B8;font-size:0.85rem;max-width:320px;text-align:center;">${err?.message || err}</p>
        <a href="../index.html" style="color:#3B82F6;margin-top:8px;">← Back to Login</a>`;
      gate.hidden = false;
    }
  }).then(() => clearTimeout(safetyTimer));
});

async function initDashboard() {
  const gate = $("auth-gate");
  const shell = $("app-shell");

  const user = await waitForAuthReady();
  if (!user) { window.location.href = "../index.html"; return; }

  const parentSnap = await getDoc(doc(db, "users", user.uid));
  const parentProfile = parentSnap.exists() ? parentSnap.data() : null;

  if (parentProfile && parentProfile.role && parentProfile.role !== "parent") {
    window.location.href = "../index.html";
    return;
  }

  activeChildId = parentProfile?.childUid || null;
  activeTenant = parentProfile?.tenant || getCurrentTenant() || "—";

  gate.hidden = true;
  shell.hidden = false;

  $("greeting-text").textContent = `Welcome, ${parentProfile?.name || user.email.split("@")[0]} 👋`;
  $("user-name").textContent = parentProfile?.name || user.email.split("@")[0];
  $("user-meta").textContent = user.email;
  $("p-name").textContent = parentProfile?.name || "—";
  $("p-email").textContent = user.email;
  $("p-mobile").textContent = parentProfile?.mobile || "—";
  $("p-tenant").textContent = activeTenant;

  if (!activeChildId) {
    document.querySelectorAll(".dash-section").forEach((s) => {
      s.innerHTML = `<div class="glass-panel"><p class="empty-row">No child linked to this account yet. Ask the school admin to add your child's student ID to your profile (childUid field).</p></div>`;
    });
    return;
  }

  // Load child's profile
  const childSnap = await getDoc(doc(db, "users", activeChildId));
  const childProfile = childSnap.exists() ? childSnap.data() : null;
  const childClassLabel = [childProfile?.class, childProfile?.section].filter(Boolean).join(" - ") || "—";

  $("child-name").textContent = childProfile?.name || "—";
  $("child-class").textContent = childClassLabel;
  $("child-roll").textContent = childProfile?.rollNo || "—";
  $("p-child-name").textContent = childProfile?.name || "—";
  $("p-child-class").textContent = childClassLabel;

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
      closeMobileSidebar();
      if (target === "chat" && !unsubscribeChat) startChatListener(activeChildId, user.uid);
    });
  });

  $("btn-mobile-nav").addEventListener("click", () => {
    $("sidebar").classList.toggle("mobile-open");
    $("sidebar-overlay").classList.toggle("show");
    $("sidebar-overlay").hidden = !$("sidebar-overlay").classList.contains("show");
  });
  $("sidebar-overlay").addEventListener("click", closeMobileSidebar);

  $("btn-logout").addEventListener("click", async () => {
    if (unsubscribeChat) unsubscribeChat();
    try { await signOut(auth); window.location.href = "../index.html"; }
    catch (e) { console.error("Sign-out failed:", e); }
  });

  // --- LEAVE FORM ---
  $("leave-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fromDate = $("leave-from").value;
    const toDate = $("leave-to").value;
    const reason = $("leave-reason").value.trim();
    if (!fromDate || !toDate || !reason) return;

    try {
      await addDoc(collection(db, "leaveRequests"), {
        studentId: activeChildId, parentId: user.uid, fromDate, toDate, reason,
        status: "pending", tenant: activeTenant, createdAt: serverTimestamp()
      });
      $("leave-form").reset();
      loadLeaveRequests(activeChildId);
    } catch (err) {
      console.error("Leave request failed:", err);
      alert("Could not submit leave request. " + (err.code === "permission-denied" ? "Permission denied — check Firestore rules." : ""));
    }
  });

  // --- CHAT FORM ---
  $("chat-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = $("chat-input").value.trim();
    if (!text) return;
    try {
      await addDoc(collection(db, "messages"), {
        studentId: activeChildId, senderId: user.uid, sender: "parent", text,
        tenant: activeTenant, timestamp: serverTimestamp()
      });
      $("chat-input").value = "";
    } catch (err) {
      console.error("Send message failed:", err);
      alert("Could not send message.");
    }
  });

  // --- SOS BUTTON ---
  $("btn-sos").addEventListener("click", async () => {
    if (!confirm("Send an emergency SOS alert to the school admin now?")) return;
    try {
      await addDoc(collection(db, "sosAlerts"), {
        studentId: activeChildId, raisedBy: user.uid, tenant: activeTenant,
        status: "open", createdAt: serverTimestamp()
      });
      alert("🆘 SOS alert sent to the admin team.");
    } catch (err) {
      console.error("SOS failed:", err);
      alert("Could not send SOS alert. Please call the school directly.");
    }
  });

  // --- LOAD EVERYTHING ---
  loadAttendance(activeChildId);
  loadResults(activeChildId, childProfile);
  loadFees(activeChildId);
  loadNotices(activeTenant);
  loadLeaveRequests(activeChildId);
  loadBusTracking(activeTenant, childProfile);
  loadEntryExit(activeChildId);
  loadHealth(activeChildId);
  loadInsights(activeChildId, childProfile);
}

function closeMobileSidebar() {
  $("sidebar").classList.remove("mobile-open");
  $("sidebar-overlay").classList.remove("show");
  $("sidebar-overlay").hidden = true;
}

// =================== ATTENDANCE ===================
async function loadAttendance(studentId) {
  const fullList = $("list-attendance-full");
  const monthlyList = $("list-attendance-monthly");
  try {
    const q = query(collection(db, "attendance"), where("studentId", "==", studentId), orderBy("date", "desc"), limit(90));
    const snap = await getDocs(q);

    if (snap.empty) {
      fullList.innerHTML = monthlyList.innerHTML = `<li class="empty-row">No attendance records yet.</li>`;
      $("stat-attendance").textContent = "--%";
      $("attendance-overall-big").textContent = "--%";
      return;
    }

    let presentCount = 0;
    const rows = [];
    const byMonth = {};
    const todayStr = new Date().toISOString().slice(0, 10);
    let todayStatus = null;

    snap.forEach((d) => {
      const r = d.data();
      if (r.status === "present") presentCount++;
      if (r.date === todayStr) todayStatus = r.status;

      const month = (r.date || "").slice(0, 7);
      if (month) {
        byMonth[month] = byMonth[month] || { present: 0, total: 0 };
        byMonth[month].total++;
        if (r.status === "present") byMonth[month].present++;
      }

      if (rows.length < 30) {
        rows.push(`<li><p class="row-title">${r.date || "—"}<span class="badge ${r.status === "present" ? "badge-present" : "badge-absent"}">${(r.status || "?").toUpperCase()}</span></p></li>`);
      }
    });

    fullList.innerHTML = rows.join("");
    const pct = Math.round((presentCount / snap.size) * 100);
    $("stat-attendance").textContent = `${pct}%`;
    $("attendance-overall-big").textContent = `${pct}%`;
    $("attendance-overall-meta").textContent = `${presentCount} present out of ${snap.size} recorded days`;

    if (todayStatus) {
      const pill = $("today-attendance-pill");
      pill.textContent = `Today: ${todayStatus === "present" ? "Present ✅" : "Absent ❌"}`;
      pill.className = `pill ${todayStatus === "present" ? "pill-present" : "pill-absent"}`;
    }

    const monthRows = Object.entries(byMonth).sort().reverse().slice(0, 6).map(([month, v]) => {
      const mPct = Math.round((v.present / v.total) * 100);
      return `<li><p class="row-title">${month}<span class="badge ${mPct >= 75 ? "badge-present" : "badge-absent"}">${mPct}%</span></p><p class="row-meta">${v.present}/${v.total} days present</p></li>`;
    });
    monthlyList.innerHTML = monthRows.length ? monthRows.join("") : `<li class="empty-row">Not enough data for a monthly trend yet.</li>`;

  } catch (e) {
    console.error("Attendance fetch failed:", e);
    fullList.innerHTML = monthlyList.innerHTML = `<li class="empty-row">Could not load attendance.</li>`;
  }
}

// =================== RESULTS ===================
async function loadResults(studentId, childProfile) {
  const fullList = $("list-results-full");
  const comparisonList = $("list-marks-comparison");
  try {
    const q = query(collection(db, "results"), where("studentId", "==", studentId), orderBy("semester", "desc"), limit(10));
    const snap = await getDocs(q);

    if (snap.empty) {
      const fallback = childProfile?.cgpa ?? "--";
      $("stat-cgpa").textContent = fallback;
      $("results-cgpa-big").textContent = fallback;
      fullList.innerHTML = comparisonList.innerHTML = `<li class="empty-row">No results published yet.</li>`;
      return;
    }

    const semesters = [];
    snap.forEach((d) => semesters.push(d.data()));

    const latestCgpa = semesters[0]?.cgpa ?? childProfile?.cgpa ?? "--";
    $("stat-cgpa").textContent = latestCgpa;
    $("results-cgpa-big").textContent = latestCgpa;

    fullList.innerHTML = semesters.map((r) => {
      const subjectsHtml = (r.subjects || []).map((s) => `<span class="badge badge-pending">${s.name}: ${s.grade || "—"}</span>`).join(" ");
      return `<li><p class="row-title">Semester ${r.semester || "—"} <span class="badge badge-submitted">SGPA ${r.sgpa ?? "—"}</span></p><p class="row-meta">${subjectsHtml}</p></li>`;
    }).join("");

    // Comparison: latest vs previous semester, per subject
    if (semesters.length >= 2) {
      const latest = semesters[0], prev = semesters[1];
      const prevMap = {};
      (prev.subjects || []).forEach((s) => (prevMap[s.name] = s));
      comparisonList.innerHTML = (latest.subjects || []).map((s) => {
        const old = prevMap[s.name];
        if (!old) return `<li><p class="row-title">${s.name}<span class="badge badge-pending">New subject</span></p></li>`;
        const diff = (s.internal + s.external) - (old.internal + old.external);
        const trend = diff > 0 ? `📈 +${diff}` : diff < 0 ? `📉 ${diff}` : "➖ No change";
        return `<li><p class="row-title">${s.name}<span class="badge ${diff >= 0 ? "badge-present" : "badge-absent"}">${trend}</span></p><p class="row-meta">Sem ${prev.semester}: ${old.internal + old.external} → Sem ${latest.semester}: ${s.internal + s.external}</p></li>`;
      }).join("");
    } else {
      comparisonList.innerHTML = `<li class="empty-row">Need at least 2 semesters of results to compare.</li>`;
    }

  } catch (e) {
    console.error("Results fetch failed:", e);
    fullList.innerHTML = comparisonList.innerHTML = `<li class="empty-row">Could not load results.</li>`;
  }
}

// =================== FEES ===================
async function loadFees(studentId) {
  const historyList = $("list-fees-history");
  try {
    const q = query(collection(db, "fees"), where("studentId", "==", studentId), orderBy("date", "desc"), limit(50));
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
      rows.push(`<li><p class="row-title">₹${amt.toLocaleString()} <span class="badge ${r.status === "paid" ? "badge-paid" : "badge-due"}">${(r.status || "pending").toUpperCase()}</span></p><p class="row-meta">${r.date || "—"} ${r.method ? `• ${r.method}` : ""}</p>${r.receiptUrl ? `<p class="row-meta"><a href="${r.receiptUrl}" target="_blank" rel="noopener">⬇ Download Receipt</a></p>` : ""}</li>`);
    });

    historyList.innerHTML = rows.join("");
    $("fees-paid").textContent = `₹${paidTotal.toLocaleString()}`;
    $("fees-pending").textContent = `₹${pendingTotal.toLocaleString()}`;
    $("stat-fees").textContent = pendingTotal > 0 ? "Due" : "Cleared";

  } catch (e) {
    console.error("Fees fetch failed:", e);
    historyList.innerHTML = `<li class="empty-row">Could not load fee records.</li>`;
  }
}

// =================== NOTICES ===================
async function loadNotices(tenant) {
  const previewList = $("list-notices-preview");
  const fullList = $("list-notices-full");
  try {
    let q = tenant && tenant !== "—"
      ? query(collection(db, "notices"), where("tenant", "==", tenant), orderBy("date", "desc"), limit(30))
      : query(collection(db, "notices"), orderBy("date", "desc"), limit(30));
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

// =================== CHAT (real-time) ===================
function startChatListener(studentId, parentUid) {
  const thread = $("chat-thread");
  try {
    const q = query(collection(db, "messages"), where("studentId", "==", studentId), orderBy("timestamp", "asc"), limit(100));
    unsubscribeChat = onSnapshot(q, (snap) => {
      if (snap.empty) {
        thread.innerHTML = `<p class="empty-row">No messages yet. Say hello to the teacher 👋</p>`;
        return;
      }
      const bubbles = [];
      snap.forEach((d) => {
        const m = d.data();
        const isParent = m.sender === "parent";
        const time = m.timestamp?.toDate ? m.timestamp.toDate().toLocaleString() : "";
        bubbles.push(`<div class="chat-bubble ${isParent ? "from-parent" : "from-teacher"}">${m.text}<span class="chat-time">${time}</span></div>`);
      });
      thread.innerHTML = bubbles.join("");
      thread.scrollTop = thread.scrollHeight;
    }, (err) => {
      console.error("Chat listener failed:", err);
      thread.innerHTML = `<p class="empty-row">Could not load messages.${err.code === "permission-denied" ? " Check Firestore rules." : ""}</p>`;
    });
  } catch (e) {
    console.error("Chat setup failed:", e);
    thread.innerHTML = `<p class="empty-row">Could not load chat.</p>`;
  }
}

// =================== LEAVE REQUESTS ===================
async function loadLeaveRequests(studentId) {
  const list = $("list-leave-history");
  try {
    const q = query(collection(db, "leaveRequests"), where("studentId", "==", studentId), orderBy("createdAt", "desc"), limit(30));
    const snap = await getDocs(q);
    if (snap.empty) { list.innerHTML = `<li class="empty-row">No leave requests yet.</li>`; return; }

    const rows = [];
    snap.forEach((d) => {
      const r = d.data();
      const badgeClass = r.status === "approved" ? "badge-approved" : r.status === "rejected" ? "badge-rejected" : "badge-pending";
      rows.push(`<li><p class="row-title">${r.fromDate} → ${r.toDate}<span class="badge ${badgeClass}">${(r.status || "pending").toUpperCase()}</span></p><p class="row-meta">${r.reason || ""}</p></li>`);
    });
    list.innerHTML = rows.join("");
  } catch (e) {
    console.error("Leave fetch failed:", e);
    list.innerHTML = `<li class="empty-row">Could not load leave requests.</li>`;
  }
}

// =================== BUS TRACKING ===================
async function loadBusTracking(tenant, childProfile) {
  const container = $("bus-info");
  try {
    const busId = childProfile?.busId;
    if (!busId) {
      container.innerHTML = `<p class="empty-row">No bus assigned to this student yet.</p>`;
      return;
    }
    const snap = await getDoc(doc(db, "busTracking", busId));
    if (!snap.exists()) {
      container.innerHTML = `<p class="empty-row">Bus tracking data not available yet.</p>`;
      return;
    }
    const r = snap.data();
    const lastUpdated = r.lastUpdated?.toDate ? r.lastUpdated.toDate().toLocaleTimeString() : "—";
    const mapsLink = (r.lat && r.lng) ? `https://www.google.com/maps?q=${r.lat},${r.lng}` : null;

    container.innerHTML = `
      <div class="bus-card">
        <span class="bus-emoji">🚌</span>
        <div>
          <p class="row-title">${r.routeName || `Bus ${busId}`}</p>
          <p class="row-meta">Last updated: ${lastUpdated}</p>
          <p class="row-meta">Driver: ${r.driverName || "—"} ${r.driverPhone ? `• ${r.driverPhone}` : ""}</p>
        </div>
      </div>
      ${mapsLink ? `<a class="bus-map-link" href="${mapsLink}" target="_blank" rel="noopener">📍 Open live location in Google Maps</a>` : ""}
    `;
  } catch (e) {
    console.error("Bus tracking fetch failed:", e);
    container.innerHTML = `<p class="empty-row">Could not load bus tracking.</p>`;
  }
}

// =================== ENTRY/EXIT ===================
async function loadEntryExit(studentId) {
  const list = $("list-entryexit");
  try {
    const q = query(collection(db, "entryExitLogs"), where("studentId", "==", studentId), orderBy("timestamp", "desc"), limit(30));
    const snap = await getDocs(q);
    if (snap.empty) { list.innerHTML = `<li class="empty-row">No entry/exit logs yet.</li>`; return; }

    const rows = [];
    snap.forEach((d) => {
      const r = d.data();
      const time = r.timestamp?.toDate ? r.timestamp.toDate().toLocaleString() : "—";
      const isEntry = r.type === "entry";
      rows.push(`<li><p class="row-title">${isEntry ? "🟢 Entered campus" : "🔴 Left campus"}</p><p class="row-meta">${time}</p></li>`);
    });
    list.innerHTML = rows.join("");
  } catch (e) {
    console.error("Entry/exit fetch failed:", e);
    list.innerHTML = `<li class="empty-row">Could not load entry/exit logs.</li>`;
  }
}

// =================== SMART INSIGHTS (rule-based, not LLM) ===================
async function loadInsights(studentId, childProfile) {
  const previewList = $("list-insights-preview");
  const fullList = $("list-insights-full");
  const insights = [];

  try {
    // Attendance-based insight
    const attQ = query(collection(db, "attendance"), where("studentId", "==", studentId), orderBy("date", "desc"), limit(30));
    const attSnap = await getDocs(attQ);
    if (!attSnap.empty) {
      let present = 0;
      attSnap.forEach((d) => { if (d.data().status === "present") present++; });
      const pct = Math.round((present / attSnap.size) * 100);
      if (pct < 75) {
        insights.push({ icon: "⚠️", text: `Attendance is at ${pct}% over the last ${attSnap.size} recorded days — below the typical 75% requirement. Worth checking in.` });
      } else {
        insights.push({ icon: "✅", text: `Attendance is healthy at ${pct}% over the last ${attSnap.size} recorded days.` });
      }
    }

    // Marks trend insight
    const resQ = query(collection(db, "results"), where("studentId", "==", studentId), orderBy("semester", "desc"), limit(2));
    const resSnap = await getDocs(resQ);
    const semesters = [];
    resSnap.forEach((d) => semesters.push(d.data()));

    if (semesters.length >= 2) {
      const latest = semesters[0], prev = semesters[1];
      const prevMap = {};
      (prev.subjects || []).forEach((s) => (prevMap[s.name] = s));
      (latest.subjects || []).forEach((s) => {
        const old = prevMap[s.name];
        if (!old) return;
        const oldTotal = old.internal + old.external, newTotal = s.internal + s.external;
        if (oldTotal === 0) return;
        const changePct = Math.round(((newTotal - oldTotal) / oldTotal) * 100);
        if (Math.abs(changePct) >= 10) {
          insights.push({
            icon: changePct > 0 ? "📈" : "📉",
            text: `${s.name} performance has ${changePct > 0 ? "improved" : "dropped"} by ${Math.abs(changePct)}% compared to the previous semester.`
          });
        }
      });
      if (latest.sgpa && prev.sgpa) {
        const sgpaDiff = (latest.sgpa - prev.sgpa).toFixed(2);
        if (Math.abs(sgpaDiff) >= 0.2) {
          insights.push({ icon: sgpaDiff > 0 ? "🏆" : "📉", text: `Overall SGPA ${sgpaDiff > 0 ? "rose" : "fell"} by ${Math.abs(sgpaDiff)} this semester (${prev.sgpa} → ${latest.sgpa}).` });
        }
      }
    }

    // Fee insight
    const feeQ = query(collection(db, "fees"), where("studentId", "==", studentId), where("status", "==", "pending"), limit(10));
    const feeSnap = await getDocs(feeQ);
    if (!feeSnap.empty) {
      let pendingTotal = 0;
      feeSnap.forEach((d) => (pendingTotal += Number(d.data().amount) || 0));
      insights.push({ icon: "💰", text: `There's a pending fee balance of ₹${pendingTotal.toLocaleString()}.` });
    }

    if (insights.length === 0) {
      insights.push({ icon: "ℹ️", text: "Not enough data yet to generate insights — check back after a few weeks of attendance and result records." });
    }

    const rows = insights.map((i) => `<li><p class="row-title">${i.icon} ${i.text}</p></li>`);
    fullList.innerHTML = rows.join("");
    previewList.innerHTML = rows.slice(0, 1).join("");

  } catch (e) {
    console.error("Insights generation failed:", e);
    previewList.innerHTML = fullList.innerHTML = `<li class="empty-row">Could not generate insights.</li>`;
  }
}

async function loadHealth(studentId) {
  const contactsList = $("list-emergency-contacts");
  const alertsList = $("list-health-alerts");
  try {
    const snap = await getDoc(doc(db, "health", studentId));
    if (!snap.exists()) {
      $("h-blood").textContent = "—";
      $("h-allergies").textContent = "—";
      $("h-disability").textContent = "—";
      contactsList.innerHTML = alertsList.innerHTML = `<li class="empty-row">No health record on file yet.</li>`;
      return;
    }
    const r = snap.data();
    $("h-blood").textContent = r.bloodGroup || "—";
    $("h-allergies").textContent = r.allergies || "None recorded";
    $("h-disability").textContent = r.disabilitySupport || "None recorded";

    const contacts = r.emergencyContacts || [];
    contactsList.innerHTML = contacts.length
      ? contacts.map((c) => `<li><p class="row-title">${c.name}</p><p class="row-meta">${c.relation || ""} ${c.phone ? `• ${c.phone}` : ""}</p></li>`).join("")
      : `<li class="empty-row">No emergency contacts on file.</li>`;

    const alerts = r.alerts || [];
    alertsList.innerHTML = alerts.length
      ? alerts.map((a) => `<li><p class="row-title">${a.title || "Alert"}</p><p class="row-meta">${a.note || ""}</p></li>`).join("")
      : `<li class="empty-row">No active health alerts.</li>`;
  } catch (e) {
    console.error("Health fetch failed:", e);
    contactsList.innerHTML = alertsList.innerHTML = `<li class="empty-row">Could not load health data.</li>`;
  }
}
