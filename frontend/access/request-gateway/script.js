// ============================================================
//  CampusOne — Request Gateway v1.0
//  script.js — Firebase + UI Logic
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore, doc, setDoc, getDoc, collection, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ---- Firebase Config (relative to project root) ----
let db;
async function initFirebase() {
  try {
    const mod = await import("../../login/firebase-config.js");
    const app = initializeApp(mod.firebaseConfig, "gateway");
    db = getFirestore(app);
    console.log("[Gateway] Firebase initialised");
  } catch (e) {
    console.error("[Gateway] Firebase init failed:", e);
    showToast("⚠️ Offline mode — submissions will be saved locally", "info");
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
  const icons = { success: "✅", error: "❌", info: "ℹ️" };
  t.innerHTML = `<span>${icons[type] || "ℹ️"}</span><span>${msg}</span>`;
  container.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}

// ---- Neural Network Canvas ----
function initNeuralCanvas() {
  const canvas = document.getElementById("neural-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  let W, H, nodes = [];

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  function spawnNodes() {
    nodes = Array.from({ length: 55 }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      r: 1.5 + Math.random() * 2
    }));
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    // Lines
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[i].x - nodes[j].x;
        const dy = nodes[i].y - nodes[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 160) {
          ctx.beginPath();
          ctx.moveTo(nodes[i].x, nodes[i].y);
          ctx.lineTo(nodes[j].x, nodes[j].y);
          ctx.strokeStyle = `rgba(0,212,255,${0.18 * (1 - dist / 160)})`;
          ctx.lineWidth = 0.6;
          ctx.stroke();
        }
      }
    }

    // Nodes
    nodes.forEach(n => {
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0,212,255,0.6)";
      ctx.fill();
      n.x += n.vx;
      n.y += n.vy;
      if (n.x < 0 || n.x > W) n.vx *= -1;
      if (n.y < 0 || n.y > H) n.vy *= -1;
    });

    requestAnimationFrame(draw);
  }

  resize();
  spawnNodes();
  draw();
  window.addEventListener("resize", () => { resize(); spawnNodes(); });
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
      showToast(`${card.querySelector(".role-emoji").textContent} ${selectedRole} role selected`, "info");
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
      const snap = await getDoc(doc(db, "institutions", code.toUpperCase()));
      if (snap.exists()) {
        const data = snap.data();
        result.className = "verify-result success";
        result.innerHTML = `✓ ${data.name || name} — Verified Campus Node`;
        result.style.display = "flex";
        // Auto-fill form
        document.getElementById("form-institution").value = data.name || name;
        showToast("✅ Institution verified successfully", "success");
      } else {
        showNotFound(result, name);
      }
    } catch {
      showNotFound(result, name);
    }
  } else {
    // Offline: accept known demo code
    if (code.toUpperCase() === "MIT2026" || code.toUpperCase() === "DEMO") {
      result.className = "verify-result success";
      result.innerHTML = `✓ ${name} — Verified Campus Node`;
      result.style.display = "flex";
      document.getElementById("form-institution").value = name;
      showToast("✅ Institution verified (demo mode)", "success");
    } else {
      showNotFound(result, name);
    }
  }

  btn.disabled = false;
  btn.textContent = "Verify Institution";
}

function showNotFound(result, name) {
  result.className = "verify-result error";
  result.innerHTML = `⚠ Campus not found — Contact institution administrator`;
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
  showToast("🎉 Request submitted successfully!", "success");
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
      <div class="status-badge status-rejected">⚠ Request not found</div>
      <p style="margin-top:10px;font-size:13px;color:var(--text-secondary)">
        Check your email and request ID, or contact support.
      </p>`;
  } else {
    const map = {
      pending:         { cls: "status-pending",  icon: "🕐", label: "Pending Review" },
      approved:        { cls: "status-approved", icon: "✅", label: "Approved" },
      rejected:        { cls: "status-rejected", icon: "❌", label: "Rejected" },
      "account created":{ cls: "status-created", icon: "🚀", label: "Account Created" }
    };
    const s = map[status] || map.pending;
    result.innerHTML = `
      <div class="status-badge ${s.cls}">${s.icon} ${s.label}</div>
      <div style="margin-top:14px;font-size:13px;color:var(--text-secondary)">
        <strong style="color:var(--text-primary)">${data.fullName}</strong> — ${data.role}<br>
        <span>${data.institution}</span>
      </div>`;
  }

  btn.disabled = false;
  btn.textContent = "Track Status";
}

// ---- Boot ----
document.addEventListener("DOMContentLoaded", async () => {
  await initFirebase();
  initNeuralCanvas();
  initRoleCards();

  document.getElementById("btn-verify").addEventListener("click", verifyInstitution);
  document.getElementById("access-form").addEventListener("submit", submitRequest);
  document.getElementById("btn-track").addEventListener("click", trackRequest);

  document.getElementById("role-select").addEventListener("change", e => {
    selectedRole = e.target.value;
    updateDynamicFields(selectedRole);
    // Sync card highlight
    document.querySelectorAll(".role-card").forEach(c => {
      c.classList.toggle("selected", c.dataset.role === selectedRole);
    });
  });
});
