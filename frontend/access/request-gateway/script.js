// ============================================================
//  CampusOne — Request Gateway v2.0
//  script.js — Firebase + UI Logic + i18n + Theme Engine
// ============================================================

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import {
  getFirestore, doc, setDoc, getDoc, collection, serverTimestamp
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
        <input type="text" id="course" placeholder=" " />
        <label for="course">Course / Class</label>
      </div>`;
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
}

// ---- Institution Verification ----
async function verifyInstitution() {
  const name  = document.getElementById("inst-name").value.trim();
  const code  = document.getElementById("inst-code").value.trim();
  const email = document.getElementById("inst-email").value.trim();
  const result = document.getElementById("verify-result");
  const btn  = document.getElementById("btn-verify");

  if (!name || !code || !email) {
    showToast("Please fill all institution fields", "error");
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Verifying...';
  result.className = "verify-result";
  result.style.display = "none";

  await new Promise(r => setTimeout(r, 1800)); // Simulate network

  if (db) {
    try {
      const snap = await getDoc(doc(db, "institutes", code.toUpperCase())); // ✅ FIX: was "institutions"
      if (snap.exists()) {
        const data = snap.data();
        result.className = "verify-result success";
        result.innerHTML = `<svg class="icon"><use href="#icon-check"/></svg> ${data.name || name} — Verified Campus Node`;
        result.style.display = "flex";
        document.getElementById("form-institution").value = data.name || name;
        showToast("Institution verified successfully", "success");
      } else {
        showNotFound(result, name);
      }
    } catch {
      showNotFound(result, name);
    }
  } else {
    if (code.toUpperCase() === "MIT2026" || code.toUpperCase() === "DEMO") {
      result.className = "verify-result success";
      result.innerHTML = `<svg class="icon"><use href="#icon-check"/></svg> ${name} — Verified Campus Node`;
      result.style.display = "flex";
      document.getElementById("form-institution").value = name;
      showToast("Institution verified (demo mode)", "success");
    } else {
      showNotFound(result, name);
    }
  }

  btn.disabled = false;
  btn.textContent = translations["verify.btn"] || "Verify Institution";
}

function showNotFound(result, name) {
  result.className = "verify-result error";
  result.innerHTML = `<svg class="icon"><use href="#icon-warn"/></svg> Campus not found — Contact institution administrator`;
  result.style.display = "flex";
  showToast(`"${name}" not found in network`, "error");
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
  const reason      = document.getElementById("reason").value.trim();

  if (!fullName || !email || !institution || !role) {
    showToast("Please fill all required fields", "error");
    return;
  }

  const requestId = generateRequestId();
  const payload = {
    requestId,
    fullName,
    email,
    phone,
    institution,
    campusCode,
    role,
    reason,
    status:    "pending",
    createdAt: serverTimestamp ? serverTimestamp() : new Date().toISOString(),
    source:    "request-gateway"
  };

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Submitting...';

  try {
    if (db) {
      await setDoc(doc(collection(db, "accessRequests"), requestId), payload);
    } else {
      localStorage.setItem("co_last_request", JSON.stringify({ ...payload, createdAt: new Date().toISOString() }));
    }
    showSuccessScreen(requestId, fullName, role);
  } catch (err) {
    console.error(err);
    showToast("Submission failed. Please try again.", "error");
    btn.disabled = false;
    btn.textContent = "Submit Request";
  }
}

function showSuccessScreen(requestId, name, role) {
  const formCard = document.getElementById("form-card");
  const successScreen = document.getElementById("success-screen");
  formCard.style.display = "none";
  successScreen.classList.add("active");
  document.getElementById("success-req-id").textContent = requestId;
  document.getElementById("success-name").textContent = name;
  document.getElementById("success-role").textContent = role;
  successScreen.scrollIntoView({ behavior: "smooth" });
  showToast("Request submitted successfully!", "success");
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
      const snap = await getDoc(doc(db, "accessRequests", reqId));
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

  document.getElementById("btn-verify").addEventListener("click", verifyInstitution);
  document.getElementById("access-form").addEventListener("submit", submitRequest);
  document.getElementById("btn-track").addEventListener("click", trackRequest);

  document.getElementById("role-select").addEventListener("change", e => {
    selectedRole = e.target.value;
    updateDynamicFields(selectedRole);
    document.querySelectorAll(".role-card").forEach(c => {
      c.classList.toggle("selected", c.dataset.role === selectedRole);
    });
  });
});
