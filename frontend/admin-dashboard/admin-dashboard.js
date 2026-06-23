/**
 * CampusOne — Admin Dashboard Controller
 *
 * SCOPE (Sprint 1): Create / List / Search / Edit / Delete for Students,
 * Teachers, and Parents. Classes and Subjects are Sprint 2 — not built here.
 *
 * SCHEMA (locked, see /docs/firestore-architecture.md):
 *   institutes/{campusCode}/students/{id}  → { uid, name, email, rollNo, classId, parentId, createdAt }
 *   institutes/{campusCode}/teachers/{id}  → { uid, name, email, subjectIds[], createdAt }
 *   institutes/{campusCode}/parents/{id}   → { uid, name, email, mobile, childIds[], createdAt }
 *
 * ⚠ TEMPORARY UNTIL SPRINT 2: `student.classId` currently stores the class
 * NAME the admin types (e.g. "BCA-III-A"), not a real reference to a
 * classes/{classId} doc — the Classes collection doesn't exist yet. When
 * Sprint 2 ships, this field must be migrated to an actual classId reference.
 *
 * ACCOUNT-CREATION MODEL (locked decision, see conversation log):
 *   No Cloud Functions yet. Admin can only attach a profile to an email
 *   that ALREADY has a Firebase Auth account + users/{uid} doc. If the
 *   email isn't found, the create form fails with an explicit error —
 *   no profile is created with a null/missing uid.
 *
 * Nothing is mocked. Empty collections show "No records yet".
 */

import { auth, db, getCurrentTenant, waitForAuthReady } from "../shared/firebase-config.js";

import { signOut } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, collection, query, where,
  orderBy, limit, getDocs, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

const $ = (id) => document.getElementById(id);
let activeCampus = null;

// In-memory caches so search/filter doesn't re-hit Firestore on every keystroke.
let studentsCache = [];
let teachersCache = [];
let parentsCache = [];

console.log("[CampusOne] admin-dashboard.js loaded ✓");

document.addEventListener("DOMContentLoaded", () => {
  const safetyTimer = setTimeout(() => {
    const gate = $("auth-gate");
    if (gate && !gate.hidden) {
      gate.innerHTML = `<p style="color:#EF4444;font-weight:600;">⚠ Could not connect to Firebase.</p>
        <p style="color:#94A3B8;font-size:0.85rem;max-width:320px;text-align:center;">Check that firebase-config.js is in this folder and the console has no errors.</p>
        <a href="../login-screen/index.html" style="color:#3B82F6;margin-top:8px;">← Back to Login</a>`;
    }
  }, 8000);

  initDashboard().catch((err) => {
    console.error("Admin dashboard init failed:", err);
    clearTimeout(safetyTimer);
    const gate = $("auth-gate");
    if (gate) {
      gate.innerHTML = `<p style="color:#EF4444;font-weight:600;">⚠ Something went wrong.</p>
        <p style="color:#94A3B8;font-size:0.85rem;max-width:320px;text-align:center;">${err?.message || err}</p>
        <a href="../login-screen/index.html" style="color:#3B82F6;margin-top:8px;">← Back to Login</a>`;
      gate.hidden = false;
    }
  }).then(() => clearTimeout(safetyTimer));
});

async function initDashboard() {
  const gate = $("auth-gate");
  const shell = $("app-shell");

  const user = await waitForAuthReady();
  if (!user) { window.location.href = "../login-screen/index.html"; return; }

  const adminSnap = await getDoc(doc(db, "staff", user.uid));
  const adminProfile = adminSnap.exists() ? adminSnap.data() : null;

  if (
    !adminProfile ||
    adminProfile.active !== true ||
    !["super_admin", "institution_admin"].includes(adminProfile.role)
  ) {
    window.location.href = "../login-screen/index.html";
    return;
  }

  activeCampus = adminProfile.campusCode || getCurrentTenant() || "—";

  gate.hidden = true;
  shell.hidden = false;

  $("greeting-text").textContent = `Welcome, ${adminProfile.name || user.email.split("@")[0]} 👋`;
  $("user-name").textContent = adminProfile.name || user.email.split("@")[0];
  $("user-meta").textContent = user.email;
  $("admin-campus").textContent = activeCampus;

  // --- NAVIGATION (same pattern as Parent Dashboard) ---
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
    });
  });

  $("btn-mobile-nav").addEventListener("click", () => {
    const isOpen = $("sidebar").classList.toggle("mobile-open");
    $("sidebar-overlay").classList.toggle("show");
    $("sidebar-overlay").hidden = !$("sidebar-overlay").classList.contains("show");
    $("btn-mobile-nav").classList.toggle("is-open", isOpen);
    $("btn-mobile-nav").setAttribute("aria-expanded", String(isOpen));
    $("btn-mobile-nav").setAttribute("aria-label", isOpen ? "Close menu" : "Open menu");
  });
  $("sidebar-overlay").addEventListener("click", closeMobileSidebar);

  $("btn-logout").addEventListener("click", async () => {
    try { await signOut(auth); window.location.href = "../login-screen/index.html"; }
    catch (e) { console.error("Sign-out failed:", e); }
  });

  // --- FORMS ---
  $("form-create-student").addEventListener("submit", handleCreateStudent);
  $("form-create-teacher").addEventListener("submit", handleCreateTeacher);
  $("form-create-parent").addEventListener("submit", handleCreateParent);

  // --- SEARCH ---
  $("search-students").addEventListener("input", (e) => renderStudents(e.target.value));
  $("search-teachers").addEventListener("input", (e) => renderTeachers(e.target.value));
  $("search-parents").addEventListener("input", (e) => renderParents(e.target.value));

  // --- MODAL ---
  $("edit-modal-cancel").addEventListener("click", closeEditModal);

  // --- LOAD DATA ---
  await Promise.all([loadStudents(), loadTeachers(), loadParents()]);
  loadRecentActivity();
}

function closeMobileSidebar() {
  $("sidebar").classList.remove("mobile-open");
  $("sidebar-overlay").classList.remove("show");
  $("sidebar-overlay").hidden = true;
  $("btn-mobile-nav").classList.remove("is-open");
  $("btn-mobile-nav").setAttribute("aria-expanded", "false");
  $("btn-mobile-nav").setAttribute("aria-label", "Open menu");
}

function showFormError(elId, message) {
  const el = $(elId);
  el.textContent = message;
  el.hidden = false;
}
function hideFormError(elId) {
  $(elId).hidden = true;
}

/**
 * Looks up a Firestore users/{uid} doc by email. Returns the doc data with
 * its uid attached, or null if no account with that email exists yet.
 * NOTE: this does a full collection scan with a `where` filter — fine at
 * MVP scale (single campus, low user count). Add a composite index or a
 * Cloud Function-backed lookup before this becomes a bottleneck.
 */
async function findUserByEmail(email) {
  const q = query(collection(db, "users"), where("email", "==", email.trim().toLowerCase()), limit(1));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const docSnap = snap.docs[0];
  return { uid: docSnap.id, ...docSnap.data() };
}

// ============ CREATE STUDENT ============
async function handleCreateStudent(e) {
  e.preventDefault();
  hideFormError("student-form-error");

  const name = $("student-name").value.trim();
  const email = $("student-email").value.trim();
  const rollNo = $("student-rollno").value.trim();
  const classId = $("student-class").value.trim(); // TEMP: class name string, see header note

  const submitBtn = e.target.querySelector("button[type=submit]");
  submitBtn.disabled = true;

  try {
    const account = await findUserByEmail(email);
    if (!account) {
      showFormError("student-form-error", `No account found for ${email}. Ask the student to sign up first, then try again.`);
      return;
    }
    if (account.role && account.role !== "student") {
      showFormError("student-form-error", `${email} is already registered as a ${account.role}, not a student.`);
      return;
    }

    const newDoc = doc(collection(db, "institutes", activeCampus, "students"));
    await setDoc(newDoc, {
      uid: account.uid, name, email, rollNo, classId,
      parentId: null, createdAt: serverTimestamp()
    });

    e.target.reset();
    await loadStudents();
    loadRecentActivity();
  } catch (err) {
    console.error("Create student failed:", err);
    showFormError("student-form-error", "Could not create student. " + (err?.message || ""));
  } finally {
    submitBtn.disabled = false;
  }
}

// ============ CREATE TEACHER ============
async function handleCreateTeacher(e) {
  e.preventDefault();
  hideFormError("teacher-form-error");

  const name = $("teacher-name").value.trim();
  const email = $("teacher-email").value.trim();
  const subjectIds = $("teacher-subjects").value.split(",").map((s) => s.trim()).filter(Boolean);

  const submitBtn = e.target.querySelector("button[type=submit]");
  submitBtn.disabled = true;

  try {
    const account = await findUserByEmail(email);
    if (!account) {
      showFormError("teacher-form-error", `No account found for ${email}. Ask the teacher to sign up first, then try again.`);
      return;
    }
    if (account.role && account.role !== "teacher") {
      showFormError("teacher-form-error", `${email} is already registered as a ${account.role}, not a teacher.`);
      return;
    }

    const newDoc = doc(collection(db, "institutes", activeCampus, "teachers"));
    await setDoc(newDoc, {
      uid: account.uid, name, email, subjectIds, createdAt: serverTimestamp()
    });

    e.target.reset();
    await loadTeachers();
    loadRecentActivity();
  } catch (err) {
    console.error("Create teacher failed:", err);
    showFormError("teacher-form-error", "Could not create teacher. " + (err?.message || ""));
  } finally {
    submitBtn.disabled = false;
  }
}

// ============ CREATE PARENT ============
async function handleCreateParent(e) {
  e.preventDefault();
  hideFormError("parent-form-error");

  const name = $("parent-name").value.trim();
  const email = $("parent-email").value.trim();
  const mobile = $("parent-mobile").value.trim();
  const childEmail = $("parent-child-email").value.trim();

  const submitBtn = e.target.querySelector("button[type=submit]");
  submitBtn.disabled = true;

  try {
    const account = await findUserByEmail(email);
    if (!account) {
      showFormError("parent-form-error", `No account found for ${email}. Ask the parent to sign up first, then try again.`);
      return;
    }
    if (account.role && account.role !== "parent") {
      showFormError("parent-form-error", `${email} is already registered as a ${account.role}, not a parent.`);
      return;
    }

    // Resolve the child's student profile (not just their user account) so
    // we can link parentId ↔ childIds on the actual student record.
    let childStudentId = null;
    if (childEmail) {
      const studentMatch = studentsCache.find((s) => (s.email || "").toLowerCase() === childEmail.toLowerCase());
      if (!studentMatch) {
        showFormError("parent-form-error", `No student profile found for ${childEmail}. Create the student first, then link the parent.`);
        return;
      }
      childStudentId = studentMatch.id;
    }

    const newParentRef = doc(collection(db, "institutes", activeCampus, "parents"));
    await setDoc(newParentRef, {
      uid: account.uid, name, email, mobile,
      childIds: childStudentId ? [childStudentId] : [],
      createdAt: serverTimestamp()
    });

    if (childStudentId) {
      await updateDoc(doc(db, "institutes", activeCampus, "students", childStudentId), {
        parentId: newParentRef.id
      });
    }

    e.target.reset();
    await Promise.all([loadParents(), loadStudents()]);
    loadRecentActivity();
  } catch (err) {
    console.error("Create parent failed:", err);
    showFormError("parent-form-error", "Could not create parent. " + (err?.message || ""));
  } finally {
    submitBtn.disabled = false;
  }
}

// ============ LOAD + RENDER LISTS ============
async function loadStudents() {
  try {
    const snap = await getDocs(query(collection(db, "institutes", activeCampus, "students"), orderBy("createdAt", "desc")));
    studentsCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    $("stat-students").textContent = studentsCache.length;
    renderStudents($("search-students").value);
  } catch (err) {
    console.error("Load students failed:", err);
    $("list-students").innerHTML = `<li class="empty-row">Could not load students.</li>`;
  }
}

function renderStudents(filterText) {
  const list = $("list-students");
  const f = (filterText || "").trim().toLowerCase();
  const rows = studentsCache.filter((s) =>
    !f || s.name?.toLowerCase().includes(f) || s.email?.toLowerCase().includes(f) || s.classId?.toLowerCase().includes(f)
  );
  if (!rows.length) {
    list.innerHTML = `<li class="empty-row">${studentsCache.length ? "No students match your search." : "No students yet. Create one above."}</li>`;
    return;
  }
  list.innerHTML = rows.map((s) => `
    <li class="admin-row">
      <div class="admin-row-info">
        <p class="row-title">${s.name || "—"}</p>
        <p class="row-meta">${s.email || "—"} • Roll ${s.rollNo || "—"} • ${s.classId || "No class"}</p>
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

async function loadTeachers() {
  try {
    const snap = await getDocs(query(collection(db, "institutes", activeCampus, "teachers"), orderBy("createdAt", "desc")));
    teachersCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    $("stat-teachers").textContent = teachersCache.length;
    renderTeachers($("search-teachers").value);
  } catch (err) {
    console.error("Load teachers failed:", err);
    $("list-teachers").innerHTML = `<li class="empty-row">Could not load teachers.</li>`;
  }
}

function renderTeachers(filterText) {
  const list = $("list-teachers");
  const f = (filterText || "").trim().toLowerCase();
  const rows = teachersCache.filter((t) =>
    !f || t.name?.toLowerCase().includes(f) || t.email?.toLowerCase().includes(f) ||
    (t.subjectIds || []).some((s) => s.toLowerCase().includes(f))
  );
  if (!rows.length) {
    list.innerHTML = `<li class="empty-row">${teachersCache.length ? "No teachers match your search." : "No teachers yet. Create one above."}</li>`;
    return;
  }
  list.innerHTML = rows.map((t) => `
    <li class="admin-row">
      <div class="admin-row-info">
        <p class="row-title">${t.name || "—"}</p>
        <p class="row-meta">${t.email || "—"} • ${(t.subjectIds || []).join(", ") || "No subjects assigned"}</p>
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

async function loadParents() {
  try {
    const snap = await getDocs(query(collection(db, "institutes", activeCampus, "parents"), orderBy("createdAt", "desc")));
    parentsCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    $("stat-parents").textContent = parentsCache.length;
    renderParents($("search-parents").value);
  } catch (err) {
    console.error("Load parents failed:", err);
    $("list-parents").innerHTML = `<li class="empty-row">Could not load parents.</li>`;
  }
}

function renderParents(filterText) {
  const list = $("list-parents");
  const f = (filterText || "").trim().toLowerCase();
  const rows = parentsCache.filter((p) =>
    !f || p.name?.toLowerCase().includes(f) || p.email?.toLowerCase().includes(f)
  );
  if (!rows.length) {
    list.innerHTML = `<li class="empty-row">${parentsCache.length ? "No parents match your search." : "No parents yet. Create one above."}</li>`;
    return;
  }
  list.innerHTML = rows.map((p) => {
    const childNames = (p.childIds || [])
      .map((cid) => studentsCache.find((s) => s.id === cid)?.name)
      .filter(Boolean);
    return `
    <li class="admin-row">
      <div class="admin-row-info">
        <p class="row-title">${p.name || "—"}</p>
        <p class="row-meta">${p.email || "—"} • ${p.mobile || "No mobile"} • ${childNames.length ? "Child: " + childNames.join(", ") : "No child linked"}</p>
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

// ============ EDIT MODAL ============
function attachRowActions() {
  document.querySelectorAll("[data-edit]").forEach((btn) => {
    btn.onclick = () => openEditModal(btn.dataset.edit, btn.dataset.id);
  });
  document.querySelectorAll("[data-delete]").forEach((btn) => {
    btn.onclick = () => handleDelete(btn.dataset.delete, btn.dataset.id);
  });
}

const ENTITY_CONFIG = {
  student: { cache: () => studentsCache, collection: "students", reload: loadStudents,
    fields: [
      { key: "name", label: "Full Name", type: "text" },
      { key: "rollNo", label: "Roll No", type: "text" },
      { key: "classId", label: "Class", type: "text" }
    ] },
  teacher: { cache: () => teachersCache, collection: "teachers", reload: loadTeachers,
    fields: [
      { key: "name", label: "Full Name", type: "text" },
      { key: "subjectIds", label: "Subjects (comma-separated)", type: "text", isArray: true }
    ] },
  parent: { cache: () => parentsCache, collection: "parents", reload: loadParents,
    fields: [
      { key: "name", label: "Full Name", type: "text" },
      { key: "mobile", label: "Mobile", type: "tel" }
    ] }
};

function openEditModal(entityType, id) {
  const config = ENTITY_CONFIG[entityType];
  const record = config.cache().find((r) => r.id === id);
  if (!record) return;

  $("edit-modal-title").textContent = `Edit ${entityType.charAt(0).toUpperCase() + entityType.slice(1)}`;

  const form = $("edit-modal-form");
  form.innerHTML = config.fields.map((f) => {
    const value = f.isArray ? (record[f.key] || []).join(", ") : (record[f.key] || "");
    return `<label>${f.label}<input data-field="${f.key}" data-is-array="${!!f.isArray}" type="${f.type}" value="${value.toString().replace(/"/g, "&quot;")}"></label>`;
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
  inputs.forEach((input) => {
    const isArray = input.dataset.isArray === "true";
    updates[input.dataset.field] = isArray
      ? input.value.split(",").map((s) => s.trim()).filter(Boolean)
      : input.value.trim();
  });

  const saveBtn = $("edit-modal-save");
  saveBtn.disabled = true;
  try {
    await updateDoc(doc(db, "institutes", activeCampus, config.collection, id), updates);
    closeEditModal();
    await config.reload();
  } catch (err) {
    console.error("Save edit failed:", err);
    alert("Could not save changes: " + (err?.message || err));
  } finally {
    saveBtn.disabled = false;
  }
}

// ============ DELETE ============
async function handleDelete(entityType, id) {
  const config = ENTITY_CONFIG[entityType];
  const record = config.cache().find((r) => r.id === id);
  if (!record) return;

  const confirmed = window.confirm(`Delete ${record.name || "this record"}? This cannot be undone.`);
  if (!confirmed) return;

  try {
    await deleteDoc(doc(db, "institutes", activeCampus, config.collection, id));
    await config.reload();
    loadRecentActivity();
  } catch (err) {
    console.error("Delete failed:", err);
    alert("Could not delete: " + (err?.message || err));
  }
}

// ============ RECENT ACTIVITY (derived from caches, no extra reads) ============
function loadRecentActivity() {
  const combined = [
    ...studentsCache.map((s) => ({ ...s, _type: "Student" })),
    ...teachersCache.map((t) => ({ ...t, _type: "Teacher" })),
    ...parentsCache.map((p) => ({ ...p, _type: "Parent" }))
  ]
    .filter((r) => r.createdAt)
    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
    .slice(0, 8);

  const list = $("list-recent-activity");
  if (!combined.length) {
    list.innerHTML = `<li class="empty-row">No activity yet.</li>`;
    return;
  }
  list.innerHTML = combined.map((r) => `
    <li><p class="row-title">${r.name} <span class="badge badge-submitted">${r._type}</span></p>
    <p class="row-meta">${r.email || ""}</p></li>`).join("");
}
