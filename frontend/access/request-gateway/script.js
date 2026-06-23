// ============================================================
//  CampusOne — Request Gateway v2.0
//  script.js — Firebase + UI Logic + i18n + Theme Engine
// ============================================================

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import {
  getFirestore, doc, setDoc, getDoc, getDocs, collection, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

// ---- Firebase Config — directly embedded (no relative path issues on GitHub Pages) ----
const firebaseConfig = {
  apiKey: "AIzaSyDEIn2c2kgyMwwwSMyQg3DDZrNLoJF_fGw",
  authDomain: "campusone-bd5c5.firebaseapp.com",
  projectId: "campusone-bd5c5",
  storageBucket: "campusone-bd5c5.firebasestorage.app",
  messagingSenderId: "1056457840584",
  appId: "1:1056457840584:web:313eb137ebd5aedab912fd"
};

let db;
async function initFirebase() {
  try {
    // Agar app already initialized hai to reuse karo, naya mat banao
    const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    db = getFirestore(app);
    console.log("[Gateway] Firebase initialised ✅", app.name);
  } catch (e) {
    console.error("[Gateway] Firebase init failed:", e);
    showToast("Offline mode — submissions will be saved locally", "info");
  }
}

// ---- Utilities ----
function generateRequestId() {
  const n = Math.floor(1000 + Math.random() * 9000);
  return `CO-REQ-2026-${n}`;
}

// Firestore docs across collections (institutes, courses, access_reasons,
// identity_verification, request_statuses) may use different field names
// for the human-readable text — some use `name`, some `label`, some `title`.
// This tries all of them before falling back to the raw doc id, so the UI
// never shows a raw id like "student_id" just because a doc used `label`
// instead of `name`.
function displayName(item) {
  if (!item) return "";
  return item.name || item.label || item.title || item.id || "";
}

function showToast(msg, type = "info") {
  const container = document.getElementById("toast-container");
  const t = document.createElement("div");
  t.className = `toast ${type}`;
  const icons = { success: "icon-check", error: "icon-warn", info: "icon-bolt" };
  t.innerHTML = `<svg class="icon"><use href="#${icons[type] || "icon-bolt"}"/></svg><span>${msg}</span>`;
  container.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}

/* ============================================================
   THEME ENGINE (Dark / Light, SVG sun-moon, localStorage)
   ============================================================ */
function initTheme() {
  const saved = localStorage.getItem("co_theme") || "dark";
  applyTheme(saved);

  document.getElementById("theme-toggle").addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme") || "dark";
    const next = current === "dark" ? "light" : "dark";
    applyTheme(next);
  });
}
function applyTheme(theme) {
  if (theme === "light") {
    document.documentElement.setAttribute("data-theme", "light");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
  localStorage.setItem("co_theme", theme);
}

/* ============================================================
   LANGUAGE / i18n ENGINE
   data-i18n based translation, locales/*.json, localStorage
   persistence, instant switch, future-ready for more languages
   ============================================================ */
const SUPPORTED_LANGS = {
  en: "EN",
  hi: "हिन्दी"
};
let translations = {};
let currentLang = "en";

async function loadLocale(lang) {
  try {
    const res = await fetch(`locales/${lang}.json`);
    if (!res.ok) throw new Error("locale not found");
    translations = await res.json();
  } catch (e) {
    console.error("[i18n] Failed to load locale:", lang, e);
    translations = {};
  }
}

function applyTranslations() {
  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.getAttribute("data-i18n");
    if (translations[key] !== undefined) {
      el.textContent = translations[key];
    }
  });
  document.documentElement.lang = currentLang;
}

async function setLanguage(lang) {
  if (!SUPPORTED_LANGS[lang]) lang = "en";
  currentLang = lang;
  await loadLocale(lang);
  applyTranslations();
  localStorage.setItem("co_lang", lang);
  document.getElementById("lang-current").textContent = SUPPORTED_LANGS[lang];
  document.querySelectorAll("#lang-menu li").forEach(li => {
    li.classList.toggle("active", li.dataset.lang === lang);
  });
}

function initLanguage() {
  const langSwitch = document.getElementById("lang-switch");
  const langBtn = document.getElementById("lang-btn");
  const langMenu = document.getElementById("lang-menu");

  langBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    langSwitch.classList.toggle("open");
    langBtn.setAttribute("aria-expanded", langSwitch.classList.contains("open"));
  });
  document.addEventListener("click", () => langSwitch.classList.remove("open"));

  langMenu.querySelectorAll("li").forEach(li => {
    li.addEventListener("click", () => {
      setLanguage(li.dataset.lang);
      langSwitch.classList.remove("open");
    });
  });

  const saved = localStorage.getItem("co_lang") || "en";
  setLanguage(saved);
}

/* ============================================================
   SECURITY CENTER ACCORDION — single item open at a time
   ============================================================ */
function initAccordion() {
  const items = document.querySelectorAll("#security-accordion .acc-item");
  items.forEach(item => {
    item.querySelector(".acc-head").addEventListener("click", () => {
      const isOpen = item.classList.contains("open");
      items.forEach(i => i.classList.remove("open"));
      if (!isOpen) item.classList.add("open");
    });
  });
}

/* ============================================================
   QUICK ACTIONS SIDEBAR — smooth scroll to target sections
   ============================================================ */
function initQuickActions() {
  document.querySelectorAll(".qs-item[data-target]").forEach(item => {
    item.addEventListener("click", (e) => {
      const id = item.getAttribute("data-target");
      const target = document.getElementById(id);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  });
}

/* ============================================================
   NEURAL NETWORK CANVAS — brighter nodes, glow, mouse interaction
   ============================================================ */
function initNeuralCanvas() {
  const canvas = document.getElementById("neural-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  let W, H, nodes = [];
  const mouse = { x: -9999, y: -9999, active: false };

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  function spawnNodes() {
    const count = Math.min(80, Math.floor((W * H) / 18000));
    nodes = Array.from({ length: count }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.45,
      vy: (Math.random() - 0.5) * 0.45,
      r: 1.6 + Math.random() * 2.2
    }));
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    // Lines between nearby nodes
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[i].x - nodes[j].x;
        const dy = nodes[i].y - nodes[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 165) {
          ctx.beginPath();
          ctx.moveTo(nodes[i].x, nodes[i].y);
          ctx.lineTo(nodes[j].x, nodes[j].y);
          ctx.strokeStyle = `rgba(0,212,255,${0.26 * (1 - dist / 165)})`;
          ctx.lineWidth = 0.7;
          ctx.stroke();
        }
      }
      // Connect to mouse for an interactive glow web
      if (mouse.active) {
        const dx = nodes[i].x - mouse.x;
        const dy = nodes[i].y - mouse.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 200) {
          ctx.beginPath();
          ctx.moveTo(nodes[i].x, nodes[i].y);
          ctx.lineTo(mouse.x, mouse.y);
          ctx.strokeStyle = `rgba(123,97,255,${0.35 * (1 - dist / 200)})`;
          ctx.lineWidth = 0.9;
          ctx.stroke();
        }
      }
    }

    // Nodes with glow
    nodes.forEach(n => {
      ctx.beginPath();
      ctx.shadowColor = "rgba(0,212,255,0.9)";
      ctx.shadowBlur = 8;
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0,212,255,0.85)";
      ctx.fill();
      ctx.shadowBlur = 0;

      n.x += n.vx;
      n.y += n.vy;
      if (n.x < 0 || n.x > W) n.vx *= -1;
      if (n.y < 0 || n.y > H) n.vy *= -1;
    });

    // Mouse glow node
    if (mouse.active) {
      ctx.beginPath();
      ctx.shadowColor = "rgba(123,97,255,0.9)";
      ctx.shadowBlur = 14;
      ctx.arc(mouse.x, mouse.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(123,97,255,0.9)";
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    requestAnimationFrame(draw);
  }

  resize();
  spawnNodes();
  draw();
  window.addEventListener("resize", () => { resize(); spawnNodes(); });
  window.addEventListener("mousemove", (e) => {
    mouse.x = e.clientX; mouse.y = e.clientY; mouse.active = true;
  });
  window.addEventListener("mouseleave", () => { mouse.active = false; });
  window.addEventListener("touchmove", (e) => {
    if (e.touches[0]) {
      mouse.x = e.touches[0].clientX; mouse.y = e.touches[0].clientY; mouse.active = true;
    }
  }, { passive: true });
  window.addEventListener("touchend", () => { mouse.active = false; });
}

// ---- Role Selection ----
let selectedRole = "";

// ---- Dynamic Dropdown Engine: Firestore-backed state ----
let institutesCache = [];      // [{ id: campusCode, name, ... }]
let coursesCache = [];         // courses of the currently selected institution
let reasonsCache = [];         // access_reasons of the currently selected institution
let identityCache = [];        // identity_verification types of the currently selected institution
let selectedInstitution = null; // { id, name } of the chosen institution

// Role-wise filtering for Reason & Identity dropdowns.
// Preferred: each Firestore doc carries a `roles: ["Student", ...]` array —
// if present anywhere in the collection, that data drives the filter.
// Fallback: a hardcoded id map (matches the doc IDs already in Firestore)
// so filtering works today even before the `roles` field is added.
const ROLE_REASON_FALLBACK = {
  Student: ["new_admission", "existing_student", "other"],
  Faculty: ["faculty_access", "other"],
  Parent:  ["parent_access", "other"]
};
const ROLE_IDENTITY_FALLBACK = {
  Student: ["student_id", "admission_number", "other"],
  Faculty: ["employee_id", "other"],
  Parent:  ["guardian_id", "other"]
};

function filterByRole(cache, role, fallbackMap) {
  if (!role) return cache; // no role chosen yet — show everything
  const hasRoleField = cache.some(item => Array.isArray(item.roles));
  if (hasRoleField) {
    return cache.filter(item => !Array.isArray(item.roles) || item.roles.length === 0 || item.roles.includes(role));
  }
  const allowed = fallbackMap[role];
  if (!allowed) return cache;
  return cache.filter(item => allowed.includes(item.id));
}

// Re-renders <select id="reason-select"> using reasonsCache, filtered by role
function renderReasonSelect(role) {
  const select = document.getElementById("reason-select");
  if (!select) return;
  const filtered = filterByRole(reasonsCache, role, ROLE_REASON_FALLBACK);
  const prevValue = select.value;
  select.innerHTML = `<option value="" disabled selected></option>` +
    filtered.map(r => `<option value="${r.id}">${displayName(r)}</option>`).join("");
  if (filtered.some(r => r.id === prevValue)) select.value = prevValue;
}

// Re-renders <select id="identity-select"> using identityCache, filtered by role
function renderIdentitySelect(role) {
  const select = document.getElementById("identity-select");
  if (!select) return;
  const filtered = filterByRole(identityCache, role, ROLE_IDENTITY_FALLBACK);
  const prevValue = select.value;
  select.innerHTML = `<option value="" disabled selected></option>` +
    filtered.map(i => `<option value="${i.id}">${displayName(i)}</option>`).join("");
  if (filtered.some(i => i.id === prevValue)) select.value = prevValue;
}

function initRoleCards() {
  document.querySelectorAll(".role-card").forEach(card => {
    card.addEventListener("click", () => {
      document.querySelectorAll(".role-card").forEach(c => c.classList.remove("selected"));
      card.classList.add("selected");
      selectedRole = card.dataset.role;
      document.getElementById("role-select").value = selectedRole;
      updateDynamicFields(selectedRole);
      document.getElementById("form-section").scrollIntoView({ behavior: "smooth", block: "start" });
      showToast(`${selectedRole} role selected`, "info");
    });
  });
}

function updateDynamicFields(role) {
  const container = document.getElementById("dynamic-fields");
  container.innerHTML = "";

  if (role === "Student") {
    container.innerHTML = `
      <div class="field-group">
        <input type="text" id="enrollment" placeholder=" " />
        <label for="enrollment">Enrollment / Roll Number</label>
      </div>
      <div class="field-group">
        <select id="course-select" required>
          <option value="" disabled selected></option>
        </select>
        <label for="course-select">Course / Class</label>
      </div>`;
    // Institution already chosen? Load its courses straight away.
    if (selectedInstitution) loadCourses(selectedInstitution.id);
  } else if (role === "Faculty") {
    container.innerHTML = `
      <div class="field-group">
        <input type="text" id="emp-id" placeholder=" " />
        <label for="emp-id">Employee / Staff ID</label>
      </div>
      <div class="field-group">
        <input type="text" id="department" placeholder=" " />
        <label for="department">Department / Subject</label>
      </div>`;
  } else if (role === "Parent") {
    container.innerHTML = `
      <div class="field-group">
        <input type="text" id="student-name" placeholder=" " />
        <label for="student-name">Ward's Full Name</label>
      </div>
      <div class="field-group">
        <input type="text" id="student-class" placeholder=" " />
        <label for="student-class">Ward's Class / Section</label>
      </div>`;
  }

  // Role changed — re-filter Reason & Identity dropdowns to only show role-relevant options
  renderReasonSelect(role);
  renderIdentitySelect(role);
}

// ---- Dynamic Dropdown Engine ----

// Institution Dropdown — loads every doc in `institutes`
async function loadInstitutions() {
  const select = document.getElementById("inst-select");
  if (!select) return;

  if (!db) {
    select.innerHTML = `<option value="" disabled selected></option><option value="DEMO">Demo Campus (offline)</option>`;
    return;
  }

  try {
    const snap = await getDocs(collection(db, "institutes"));
    institutesCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error("[Gateway] Failed to load institutions:", err);
    institutesCache = [];
    showToast("Could not load institutions", "error");
  }

  select.innerHTML = `<option value="" disabled selected></option>` +
    institutesCache.map(i => `<option value="${i.id}">${displayName(i)}</option>`).join("");
}

// Fires when the user picks an institution: auto-fill campus code + load its courses
async function onInstitutionChange(e) {
  const instId = e.target.value;
  const codeField = document.getElementById("inst-code");
  const formInstitution = document.getElementById("form-institution");
  const result = document.getElementById("verify-result");
  const inst = institutesCache.find(i => i.id === instId);

  if (!inst) {
    selectedInstitution = null;
    codeField.value = "";
    formInstitution.value = "";
    result.style.display = "none";
    // No institution selected — clear everything scoped to an institution
    await Promise.all([loadCourses(null), loadReasons(null), loadIdentityVerification(null)]);
    return;
  }

  selectedInstitution = inst;
  codeField.value = inst.id;
  formInstitution.value = displayName(inst);

  result.className = "verify-result success";
  result.innerHTML = `<svg class="icon"><use href="#icon-check"/></svg> ${displayName(inst)} — Verified Campus Node`;
  result.style.display = "flex";
  showToast(`${displayName(inst)} selected`, "success");

  // Courses, Reasons and Identity types all live under institutes/{instId}/...
  await Promise.all([
    loadCourses(inst.id),
    loadReasons(inst.id),
    loadIdentityVerification(inst.id)
  ]);
}

// Course Dropdown — loads institutes/{instId}/courses
async function loadCourses(instId) {
  const select = document.getElementById("course-select");
  if (!select) return; // not rendered unless role === "Student"

  coursesCache = [];
  if (db && instId) {
    try {
      const snap = await getDocs(collection(db, "institutes", instId, "courses"));
      coursesCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (err) {
      console.error("[Gateway] Failed to load courses:", err);
    }
  }

  select.innerHTML = `<option value="" disabled selected></option>` +
    coursesCache.map(c => `<option value="${c.id}">${displayName(c)}</option>`).join("");
}

// Reason Dropdown — loads institutes/{instId}/access_reasons (scoped per institution)
async function loadReasons(instId) {
  const select = document.getElementById("reason-select");
  if (!select) return;

  reasonsCache = [];
  if (db && instId) {
    try {
      const snap = await getDocs(collection(db, "institutes", instId, "access_reasons"));
      reasonsCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (err) {
      console.error("[Gateway] Failed to load access reasons:", err);
    }
  }

  renderReasonSelect(selectedRole);
}

// Identity Verification Dropdown — loads institutes/{instId}/identity_verification (scoped per institution)
async function loadIdentityVerification(instId) {
  const select = document.getElementById("identity-select");
  if (!select) return;

  identityCache = [];
  if (db && instId) {
    try {
      const snap = await getDocs(collection(db, "institutes", instId, "identity_verification"));
      identityCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (err) {
      console.error("[Gateway] Failed to load identity verification types:", err);
    }
  }

  renderIdentitySelect(selectedRole);
}

// ---- Main Form Submit ----
async function submitRequest(e) {
  e.preventDefault();
  const btn = document.getElementById("btn-submit");

  const fullName    = document.getElementById("full-name").value.trim();
  const email       = document.getElementById("email").value.trim();
  const phone       = document.getElementById("phone").value.trim();
  const institution = document.getElementById("form-institution").value.trim();
  const campusCode  = document.getElementById("inst-code").value.trim().toUpperCase();
  const role        = document.getElementById("role-select").value;

  const reasonSelect = document.getElementById("reason-select");
  const reasonId   = reasonSelect ? reasonSelect.value : "";
  const reasonObj  = reasonsCache.find(r => r.id === reasonId);
  const reasonName = displayName(reasonObj);

  const courseSelect = document.getElementById("course-select"); // only present for Student
  const courseId   = courseSelect ? courseSelect.value : "";
  const courseObj  = coursesCache.find(c => c.id === courseId);
  const courseName = displayName(courseObj);

  const identitySelect = document.getElementById("identity-select");
  const identityType   = identitySelect ? identitySelect.value : "";
  const identityObj    = identityCache.find(i => i.id === identityType);
  const identityTypeName = displayName(identityObj);
  const identityValue  = document.getElementById("identity-value").value.trim();

  if (!fullName || !email || !institution || !campusCode || !role) {
    showToast("Please fill all required fields", "error");
    return;
  }
  if (!reasonId) {
    showToast("Please select a reason for access", "error");
    return;
  }
  if (!identityType || !identityValue) {
    showToast("Please complete identity verification", "error");
    return;
  }
  if (role === "Student" && !courseId) {
    showToast("Please select your course / class", "error");
    return;
  }

  const roleKeyMap = { Student: "student", Faculty: "faculty", Parent: "parent" };
  const roleKey = roleKeyMap[role] || role.toLowerCase();

  const requestId = generateRequestId();
  const payload = {
    requestId,
    fullName,
    email,
    phone,
    institutionId: selectedInstitution ? selectedInstitution.id : campusCode,
    institution,
    campusCode,
    courseId:  courseId  || null,
    course:    courseName || null,
    reasonId,
    reason:    reasonName,
    identityType:     identityType || null,
    identityTypeName: identityTypeName || null,
    identityValue:    identityValue || null,
    role:      roleKey,
    status:    "pending",
    createdAt: serverTimestamp ? serverTimestamp() : new Date().toISOString(),
    source:    "request-gateway"
  };

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Submitting...';

  try {
    if (db) {
      await setDoc(doc(collection(db, "access_requests"), requestId), payload);
    } else {
      localStorage.setItem("co_last_request", JSON.stringify({ ...payload, createdAt: new Date().toISOString() }));
    }
    showSuccessScreen(requestId, fullName, role);
  } catch (err) {
    console.error("SUBMIT ERROR:", err);
    alert(err.message);
    showToast("Submission failed. Please try again.", "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = translations["form.submit"] || "Submit Access Request →";
  }
}

function showSuccessScreen(requestId, name, role) {
  const formCard = document.getElementById("form-card");
  const successScreen = document.getElementById("success-screen");
  formCard.classList.add("hidden");
  successScreen.classList.add("active");
  document.getElementById("success-req-id").textContent = requestId;
  document.getElementById("success-name").textContent = name;
  document.getElementById("success-role").textContent = role;

  // ✅ Submitted time set karo
  document.getElementById("success-time").textContent =
    new Date().toLocaleString();

  // ✅ Institution field se value lo aur set karo
  const institutionField = document.getElementById("form-institution");
  if (institutionField) {
    document.getElementById("success-institution").textContent =
      institutionField.value;
  }

  successScreen.scrollIntoView({ behavior: "smooth" });
  showToast("Request submitted successfully!", "success");
}

function copyRequestId() {
  const reqId = document.getElementById("success-req-id").textContent.trim();
  if (!reqId) return;

  const btn = document.getElementById("copy-request-id");
  const label = btn ? btn.querySelector("span") : null;
  const originalLabel = label ? label.textContent : "";

  const fallbackCopy = () => {
    const ta = document.createElement("textarea");
    ta.value = reqId;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch (_) {}
    ta.remove();
  };

  const onCopied = () => {
    showToast("Request ID copied to clipboard", "success");
    if (btn && label) {
      btn.classList.add("copied");
      label.textContent = "Copied!";
      setTimeout(() => {
        btn.classList.remove("copied");
        label.textContent = originalLabel;
      }, 2000);
    }
  };

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(reqId).then(onCopied).catch(() => {
      fallbackCopy();
      onCopied();
    });
  } else {
    fallbackCopy();
    onCopied();
  }
}

// ---- Status Tracker ----
async function trackRequest() {
  const email = document.getElementById("track-email").value.trim();
  const reqId = document.getElementById("track-id").value.trim().toUpperCase();
  const result = document.getElementById("track-result");
  const btn = document.getElementById("btn-track");

  if (!email || !reqId) {
    showToast("Enter your email and request ID", "error");
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner" style="border-color:rgba(0,212,255,0.3);border-top-color:var(--teal)"></span> Checking...';

  await new Promise(r => setTimeout(r, 1200));

  let status = null;
  let data   = null;

  if (db) {
    try {
      const snap = await getDoc(doc(db, "access_requests", reqId));
      if (snap.exists()) {
        data = snap.data();
        if (data.email === email) status = data.status;
      }
    } catch {}
  } else {
    const saved = localStorage.getItem("co_last_request");
    if (saved) {
      data = JSON.parse(saved);
      if (data.requestId === reqId && data.email === email) status = data.status;
    }
  }

  result.classList.add("show");

  if (!status) {
    result.innerHTML = `
      <div class="status-badge status-rejected"><svg class="icon"><use href="#icon-warn"/></svg> Request not found</div>
      <p style="margin-top:10px;font-size:13px;color:var(--text-secondary)">
        Check your email and request ID, or contact support.
      </p>`;
  } else {
    const map = {
      pending:          { cls: "status-pending",  icon: "icon-track",  label: "Pending Review" },
      approved:         { cls: "status-approved", icon: "icon-check",  label: "Approved" },
      rejected:         { cls: "status-rejected", icon: "icon-warn",   label: "Rejected" },
      "account created":{ cls: "status-created",  icon: "icon-bolt",   label: "Account Created" }
    };
    const s = map[status] || map.pending;
    result.innerHTML = `
      <div class="status-badge ${s.cls}"><svg class="icon"><use href="#${s.icon}"/></svg> ${s.label}</div>
      <div style="margin-top:14px;font-size:13px;color:var(--text-secondary)">
        <strong style="color:var(--text-primary)">${data.fullName}</strong> — ${data.role}<br>
        <span>${data.institution}</span>
      </div>`;
  }

  btn.disabled = false;
  btn.textContent = translations["status.btn"] || "Track Status";
}

// ---- Boot ----
document.addEventListener("DOMContentLoaded", async () => {
  initTheme();
  await initLanguage();
  await initFirebase();
  initNeuralCanvas();
  initRoleCards();
  initAccordion();
  initQuickActions();

  // Reasons & Identity types are institution-scoped now (institutes/{id}/access_reasons,
  // institutes/{id}/identity_verification) — they load once an institution is selected,
  // see onInstitutionChange().
  await loadInstitutions();

  document.getElementById("inst-select").addEventListener("change", onInstitutionChange);
  document.getElementById("access-form").addEventListener("submit", submitRequest);
  document.getElementById("btn-track").addEventListener("click", trackRequest);
  document.getElementById("copy-request-id").addEventListener("click", copyRequestId);

  document.getElementById("role-select").addEventListener("change", e => {
    selectedRole = e.target.value;
    updateDynamicFields(selectedRole);
    document.querySelectorAll(".role-card").forEach(c => {
      c.classList.toggle("selected", c.dataset.role === selectedRole);
    });
  });
});
