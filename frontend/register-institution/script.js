/* ==========================================================
   CAMPUSONE — REGISTER INSTITUTION
   Theme system + Multi-step form controller
   ========================================================== */

/* ----------------------------------------------------------
   THEME SYSTEM
   Priority: User preference (localStorage) → System theme → Default
   Options: "system" | "light" | "dark"
   ---------------------------------------------------------- */
import {
  db
} from "../firebase-config.js";

import {
  collection,
  addDoc,
  doc,
  getDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

(function () {
  "use strict";

  const STORAGE_KEY = "campusone-theme";
  const root = document.documentElement;
  const switchEl = document.getElementById("themeSwitch");

  function getStoredPreference() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      return null;
    }
  }

  function setStoredPreference(value) {
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch (e) {
      /* storage unavailable — fall back to in-memory only */
    }
  }

  function applyTheme(preference) {
    // "system" removes the override and lets the
    // prefers-color-scheme media query in CSS decide.
    if (preference === "system") {
      root.removeAttribute("data-theme");
    } else {
      root.setAttribute("data-theme", preference);
    }

    if (switchEl) {
      switchEl.querySelectorAll("[data-theme-option]").forEach((btn) => {
        const isActive = btn.dataset.themeOption === preference;
        btn.setAttribute("aria-pressed", String(isActive));
      });
    }
  }

  function initTheme() {
    const stored = getStoredPreference();
    const preference = stored === "light" || stored === "dark" || stored === "system"
      ? stored
      : "system";

    applyTheme(preference);
  }

  if (switchEl) {
    switchEl.querySelectorAll("[data-theme-option]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const choice = btn.dataset.themeOption;
        setStoredPreference(choice);
        applyTheme(choice);
      });
    });
  }

  initTheme();
})();

/* ----------------------------------------------------------
   MULTI-STEP FORM
   ---------------------------------------------------------- */

(function () {
  "use strict";

  const form = document.getElementById("institutionRegistrationForm");
  if (!form) return;

  const steps = Array.from(form.querySelectorAll(".form-step"));
  const progressSteps = Array.from(
    document.querySelectorAll(".progress-step")
  );
  const card = document.querySelector(".registration-card");
  const successPanel = document.getElementById("submissionSuccess");
  const referenceIdEl = document.getElementById("referenceId");

  let currentStep = 1;
  const TOTAL_STEPS = steps.length;

  /* ----------------------------------------------------
     STEP FIELD MAP — which fields must validate per step
     Step 3 (modules / referral) is entirely optional,
     so it carries no required fields.
  ---------------------------------------------------- */

  const STEP_FIELDS = {
    1: ["institutionName", "institutionType", "institutionCategory", "establishmentYear"],
    2: ["principalName", "email", "mobile", "website", "studentStrength", "facultyStrength", "institutionSize", "academicSession"],
    3: [],
    4: ["address", "city", "state", "country"],
    5: ["consent"],
    6: []
  };

  /* ----------------------------------------------------
     VALIDATION HELPERS
  ---------------------------------------------------- */

  const ERROR_MESSAGES = {
    institutionName: "Institution name is required.",
    institutionType: "Please select an institution type.",
    institutionCategory: "Please select a category.",
    establishmentYear: "Enter a valid establishment year.",
    principalName: "Principal / Director name is required.",
    email: "Enter a valid official email address.",
    mobile: "Enter a valid mobile number.",
    website: "Enter a valid URL (https://...).",
    studentStrength: "Enter the number of students.",
    facultyStrength: "Enter the number of faculty members.",
    institutionSize: "Please select your institution size.",
    academicSession: "Enter the current academic session.",
    address: "Address is required.",
    city: "City is required.",
    state: "Please select a state.",
    country: "Country is required.",
    consent: "You must accept the terms to continue."
  };

  function getField(name) {
    return form.elements[name];
  }

  function showError(name, message) {
    const errorEl = form.querySelector(`[data-error-for="${name}"]`);
    if (errorEl) errorEl.textContent = message || "";
  }

  function clearError(name) {
    showError(name, "");
  }

  function isFieldValid(name) {
    const field = getField(name);
    if (!field) return true;

    if (field.type === "checkbox") {
      return field.checked;
    }

    if (field.hasAttribute("required") && !field.value.trim()) {
      return false;
    }

    if (field.value && !field.checkValidity()) {
      return false;
    }

    if (name === "establishmentYear" && field.value) {
      const year = Number(field.value);
      const currentYear = new Date().getFullYear();
      if (year < 1800 || year > currentYear) return false;
    }

    if ((name === "studentStrength" || name === "facultyStrength") && field.value) {
      if (Number(field.value) <= 0) return false;
    }

    return true;
  }

  function validateField(name) {
    const valid = isFieldValid(name);
    const field = getField(name);
    if (field) field.setAttribute("data-touched", "true");

    showError(name, valid ? "" : ERROR_MESSAGES[name] || "This field is invalid.");
    return valid;
  }

  function validateStep(stepNumber) {
    const fields = STEP_FIELDS[stepNumber] || [];
    let allValid = true;

    fields.forEach((name) => {
      const field = getField(name);
      const isOptionalField = field && !field.hasAttribute("required");
      const hasValue = field && field.type === "checkbox" ? field.checked : field && field.value.trim();

      // skip optional empty fields (e.g. website)
      if (isOptionalField && !hasValue) {
        clearError(name);
        return;
      }

      const valid = validateField(name);
      if (!valid) allValid = false;
    });

    return allValid;
  }

  /* ----------------------------------------------------
     STEP NAVIGATION
  ---------------------------------------------------- */

  function goToStep(stepNumber) {
    steps.forEach((step) => {
      const isTarget = Number(step.dataset.step) === stepNumber;
      step.classList.toggle("is-active", isTarget);
    });

    progressSteps.forEach((node) => {
      const stepNum = Number(node.dataset.step);
      node.classList.toggle("is-active", stepNum === stepNumber);
      node.classList.toggle("is-complete", stepNum < stepNumber);
    });

    currentStep = stepNumber;

    if (stepNumber === 6) {
      populateReviewStep();
    }

    if (card) {
      card.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  form.querySelectorAll("[data-next]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const valid = validateStep(currentStep);
      if (!valid) return;
      goToStep(Math.min(currentStep + 1, TOTAL_STEPS));
    });
  });

  form.querySelectorAll("[data-back]").forEach((btn) => {
    btn.addEventListener("click", () => {
      goToStep(Math.max(currentStep - 1, 1));
    });
  });

  form.querySelectorAll("[data-edit-step]").forEach((btn) => {
    btn.addEventListener("click", () => {
      goToStep(Number(btn.dataset.editStep));
    });
  });

  /* ----------------------------------------------------
     REVIEW STEP — populate read-only summary from
     the live form values right before Step 6 is shown.
  ---------------------------------------------------- */

  const MODULE_LABELS = {
    "attendance": "Attendance",
    "student-management": "Student Management",
    "faculty-management": "Faculty Management",
    "notice-board": "Notice Board",
    "examination": "Examination",
    "fees": "Fees",
    "library": "Library",
    "hostel": "Hostel",
    "transport": "Transport",
    "placements": "Placements"
  };

  const SELECT_LABEL_FIELDS = ["institutionType", "institutionCategory", "institutionSize", "state", "referralSource"];

  function getSelectLabel(name) {
    const field = getField(name);
    if (!field || field.tagName !== "SELECT") return null;
    const opt = field.options[field.selectedIndex];
    return opt ? opt.textContent.trim() : null;
  }

  function reviewValueFor(name) {
    if (SELECT_LABEL_FIELDS.includes(name)) {
      return getSelectLabel(name) || "—";
    }
    const field = getField(name);
    if (!field) return "—";
    const value = field.value && field.value.trim();
    return value ? value : "—";
  }

  function populateReviewStep() {
    form.querySelectorAll("[data-review]").forEach((dd) => {
      const name = dd.dataset.review;
      dd.textContent = reviewValueFor(name);
    });

    // Logo preview
    const reviewLogoRow = document.getElementById("reviewLogoRow");
    const reviewLogoPreview = document.getElementById("reviewLogoPreview");
    const logoFile = logoInput && logoInput.files && logoInput.files[0];

    if (logoFile && reviewLogoRow && reviewLogoPreview) {
      const reader = new FileReader();
      reader.onload = () => {
        reviewLogoPreview.src = reader.result;
        reviewLogoRow.hidden = false;
      };
      reader.readAsDataURL(logoFile);
    } else if (reviewLogoRow) {
      reviewLogoRow.hidden = true;
    }

    // Modules as chips
    const modulesWrap = document.getElementById("reviewModules");
    if (modulesWrap) {
      modulesWrap.innerHTML = "";
      getSelectedModules().forEach((value) => {
        const chip = document.createElement("span");
        chip.className = "review-chip";
        chip.textContent = MODULE_LABELS[value] || value;
        modulesWrap.appendChild(chip);
      });
    }

    // Consent status
    const consentField = getField("consent");
    const consentStatusEl = document.getElementById("reviewConsentStatus");
    const consentTextEl = document.getElementById("reviewConsentText");
    const isAccepted = consentField && consentField.checked;

    if (consentStatusEl && consentTextEl) {
      consentStatusEl.classList.toggle("is-pending", !isAccepted);
      consentTextEl.textContent = isAccepted
        ? "Terms & Privacy Policy accepted"
        : "Terms & Privacy Policy not yet accepted — go back to Step 5";
    }
  }

  /* ----------------------------------------------------
     LIVE VALIDATION ON BLUR / INPUT
  ---------------------------------------------------- */

  Object.values(STEP_FIELDS).flat().forEach((name) => {
    const field = getField(name);
    if (!field) return;

    field.addEventListener("blur", () => {
      if (field.value || field.hasAttribute("required")) {
        validateField(name);
      }
    });

    field.addEventListener("input", () => {
      if (field.getAttribute("data-touched") === "true") {
        validateField(name);
      }
    });
  });

  /* ----------------------------------------------------
     FILE UPLOAD — LOGO
  ---------------------------------------------------- */

  const logoInput = document.getElementById("institutionLogo");
  const logoDrop = document.getElementById("logoDrop");
  const logoFilename = document.getElementById("logoFilename");

  if (logoInput && logoDrop && logoFilename) {
    logoInput.addEventListener("change", () => {
      const file = logoInput.files && logoInput.files[0];
      logoFilename.textContent = file ? file.name : "";
    });

    ["dragenter", "dragover"].forEach((evt) => {
      logoDrop.addEventListener(evt, (e) => {
        e.preventDefault();
        logoDrop.classList.add("is-dragover");
      });
    });

    ["dragleave", "drop"].forEach((evt) => {
      logoDrop.addEventListener(evt, (e) => {
        e.preventDefault();
        logoDrop.classList.remove("is-dragover");
      });
    });

    logoDrop.addEventListener("drop", (e) => {
      const file = e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) {
        logoInput.files = e.dataTransfer.files;
        logoFilename.textContent = file.name;
      }
    });
  }

  /* ----------------------------------------------------
     FORM SUBMISSION
     Builds the institution access-request payload.

     INSTITUTION LIFECYCLE STATUS (meta.status)
     One of: pending → under_review → verified → approved
             → tenant_created → admin_created → onboarded
             (or rejected, at any review point)

     Replace the fetch() call below with your backend /
     Firestore integration (collection: "accessRequests").
  ---------------------------------------------------- */

  const STATUS = {
    PENDING: "pending",
    UNDER_REVIEW: "under_review",
    VERIFIED: "verified",
    APPROVED: "approved",
    REJECTED: "rejected",
    TENANT_CREATED: "tenant_created",
    ADMIN_CREATED: "admin_created",
    ONBOARDED: "onboarded"
  };

  function getSelectedModules() {
    return Array.from(form.querySelectorAll('input[name="modules"]:checked'))
      .map((el) => el.value);
  }

  function buildPayload() {
    const data = new FormData(form);

    return {
      institution: {
        name: data.get("institutionName")?.trim(),
        type: data.get("institutionType"),
        category: data.get("institutionCategory"),
        code: data.get("institutionCode")?.trim() || null,
        establishmentYear: Number(data.get("establishmentYear")) || null,
        universityAffiliation: data.get("universityAffiliation")?.trim() || null,
        accreditation: (data.get("accreditation") || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        website: data.get("website")?.trim() || null,
        size: data.get("institutionSize") || null
      },
      contact: {
        principalName: data.get("principalName")?.trim(),
        email: data.get("email")?.trim().toLowerCase(),
        mobile: data.get("mobile")?.trim()
      },
      strength: {
        students: Number(data.get("studentStrength")) || null,
        faculty: Number(data.get("facultyStrength")) || null
      },
      academicSession: data.get("academicSession")?.trim(),
      location: {
        address: data.get("address")?.trim(),
        city: data.get("city")?.trim(),
        state: data.get("state")?.trim(),
        country: data.get("country")?.trim()
      },
      compliance: {
        gstNumber: data.get("gstNumber")?.trim() || null,
        panNumber: data.get("panNumber")?.trim() || null
      },
      interest: {
        modules: getSelectedModules(),
        referralSource: data.get("referralSource") || null
      },
      consent: data.get("consent") === "on",
      meta: {
        status: STATUS.PENDING,
        source: "register-institution",
        onboardingStage: 1,
        // ----------------------------------------------
        // TODO (Firebase): replace these two ISO strings
        // with serverTimestamp() from the Firestore SDK
        // at write-time, e.g.:
        //
        //   import { serverTimestamp } from "firebase/firestore";
        //   meta.createdAt = serverTimestamp();
        //   meta.updatedAt = serverTimestamp();
        //
        // Client-side ISO strings are kept here only as a
        // safe fallback for environments without the SDK.
        // ----------------------------------------------
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
      }
    };
    // Note: institutionLogo (File) is sent separately via
    // multipart/storage upload — not included in this JSON payload.
  }

  function generateReferenceId() {
    const stamp = Date.now().toString(36).toUpperCase();
    const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `CO-REQ-${stamp}-${rand}`;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    // validate every step before final submit
    let allValid = true;
    for (let i = 1; i <= TOTAL_STEPS; i++) {
      const stepValid = validateStep(i);
      if (!stepValid) {
        allValid = false;
        if (i !== currentStep) goToStep(i);
        break;
      }
    }

    if (!allValid) return;

    const payload = buildPayload();
    const submitBtn = form.querySelector(".submit-btn");

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Submitting...";
    }

    try {
      // ------------------------------------------------
      // TODO: wire this to your backend.
      // Example (Firestore-backed API route):
      //
      // const res = await fetch("/api/access-requests", {
      //   method: "POST",
      //   headers: { "Content-Type": "application/json" },
      //   body: JSON.stringify(payload)
      // });
      // if (!res.ok) throw new Error("Submission failed");
      // const result = await res.json();
      // ------------------------------------------------

console.log(
    "Institution registration payload:",
    payload
  );

  const docRef = await addDoc(
    collection(db, "accessRequests"),
    payload
  );

  // Firestore document ID
  const referenceId = docRef.id;

  // Success UI
  form.hidden = true;

  document.getElementById("formProgress").hidden = true;

  successPanel.hidden = false;

  renderSuccessScreen(referenceId, payload);

} catch (err) {

  console.error(
    "Institution registration failed:",
    err
  );

  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.textContent =
      "Submit Application";
  }

  alert(
    "Unable to submit your registration request. Please try again."
  );
    }
  });

  /* ----------------------------------------------------
     PREMIUM SUCCESS SCREEN
     Renders the reference ID, status, institution name,
     submission date, tracking link + QR + copy button.
  ---------------------------------------------------- */

  const TRACK_BASE_URL = "https://campusone.app/track/";

  function formatSubmittedOn(date) {
    return date.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "long",
      year: "numeric"
    });
  }

  function renderSuccessScreen(referenceId, payload) {
    const submittedDate = new Date();
    const trackingUrl = `${TRACK_BASE_URL}${referenceId}`;

    referenceIdEl.textContent = referenceId;

    const institutionNameEl = document.getElementById("successInstitutionName");
    if (institutionNameEl) {
      institutionNameEl.textContent = payload.institution.name || "—";
    }

    const submittedOnEl = document.getElementById("successSubmittedOn");
    if (submittedOnEl) {
      submittedOnEl.textContent = formatSubmittedOn(submittedDate);
    }

    const trackingLinkEl = document.getElementById("successTrackingLink");
    if (trackingLinkEl) {
      trackingLinkEl.textContent = trackingUrl.replace("https://", "");
    }

    const openTrackingBtn = document.getElementById("successOpenTrackingBtn");
    if (openTrackingBtn) {
      // No live external tracking page exists yet — for now this
      // routes to the on-page "Track Your Registration Request"
      // card and pre-fills the Reference ID for the user.
      openTrackingBtn.href = "#trackRequestCard";
      openTrackingBtn.removeAttribute("target");
      openTrackingBtn.removeAttribute("rel");
      openTrackingBtn.onclick = (e) => {
        e.preventDefault();
        const trackCard = document.getElementById("trackRequestCard");
        const refIdField = document.getElementById("trackReferenceId");
        if (refIdField) refIdField.value = referenceId;
        if (trackCard) trackCard.scrollIntoView({ behavior: "smooth", block: "start" });
      };
    }

    // QR code — renders to canvas via the QRCode CDN library.
    // Self-heals if the library failed to load initially.
    const qrCanvas = document.getElementById("successQrCanvas");
    if (qrCanvas) {
      ensureGlobal("QRCode")
        .then(() => {
          window.QRCode.toCanvas(qrCanvas, trackingUrl, {
            width: 96,
            margin: 1,
            color: { dark: "#0F172A", light: "#FFFFFF" }
          }, (err) => {
            if (err) console.error("QR render failed:", err);
          });
        })
        .catch((err) => {
          console.error("QR library unavailable:", err);
          const wrap = qrCanvas.closest(".success-qr-wrap");
          if (wrap) wrap.hidden = true;
        });
    }

    // Copy-to-clipboard
    const copyBtn = document.getElementById("successCopyBtn");
    if (copyBtn) {
      copyBtn.onclick = async () => {
        try {
          await navigator.clipboard.writeText(trackingUrl);
          copyBtn.textContent = "Copied!";
          copyBtn.classList.add("is-copied");
          setTimeout(() => {
            copyBtn.textContent = "Copy";
            copyBtn.classList.remove("is-copied");
          }, 1800);
        } catch (err) {
          console.error("Copy failed:", err);
        }
      };
    }

    // PDF download
    const pdfBtn = document.getElementById("downloadPdfBtn");
    if (pdfBtn) {
      pdfBtn.onclick = async () => {
        pdfBtn.disabled = true;
        const originalLabel = pdfBtn.innerHTML;
        pdfBtn.textContent = "Generating PDF...";

        try {
          await generateApplicationPdf({
            referenceId,
            payload,
            submittedDate,
            trackingUrl
          });
        } catch (err) {
          console.error("PDF generation failed:", err);
          alert(`Unable to generate the PDF right now.\n\n${err && err.message ? err.message : "Please try again."}`);
        } finally {
          pdfBtn.disabled = false;
          pdfBtn.innerHTML = originalLabel;
        }
      };
    }
  }

})();


/* ----------------------------------------------------------
   MOBILE DRAWER
   ---------------------------------------------------------- */

(function () {
  "use strict";

  const menuToggle = document.getElementById("menuToggle");
  const mobileDrawer = document.getElementById("mobileDrawer");
  const drawerOverlay = document.getElementById("drawerOverlay");
  const drawerClose = document.getElementById("drawerClose");

  if (!menuToggle || !mobileDrawer || !drawerOverlay) return;

  function openDrawer() {
    mobileDrawer.classList.add("open");
    drawerOverlay.classList.add("active");
    mobileDrawer.setAttribute("aria-hidden", "false");
    menuToggle.setAttribute("aria-expanded", "true");
    document.body.style.overflow = "hidden";
  }

  function closeDrawer() {
    mobileDrawer.classList.remove("open");
    drawerOverlay.classList.remove("active");
    mobileDrawer.setAttribute("aria-hidden", "true");
    menuToggle.setAttribute("aria-expanded", "false");
    document.body.style.overflow = "";
  }

  menuToggle.addEventListener("click", openDrawer);
  drawerClose?.addEventListener("click", closeDrawer);
  drawerOverlay.addEventListener("click", closeDrawer);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && mobileDrawer.classList.contains("open")) {
      closeDrawer();
    }
  });

  // close drawer automatically if the viewport grows back to desktop
  window.addEventListener("resize", () => {
    if (window.innerWidth > 768 && mobileDrawer.classList.contains("open")) {
      closeDrawer();
    }
  });
})();

/* ----------------------------------------------------------
   TRACK REQUEST
   Public status lookup — Reference ID + Email must both
   match before any status is revealed (no other identifying
   info is shown on mismatch, to avoid leaking which field
   was wrong).
   ---------------------------------------------------------- */

(function () {
  "use strict";

  const trackForm = document.getElementById("trackRequestForm");
  if (!trackForm) return;

  const trackResult = document.getElementById("trackResult");
  const trackSubmitBtn = document.getElementById("trackSubmitBtn");
  const trackAnotherLink = document.getElementById("trackAnotherLink");

  const STATUS_LABELS = {
    pending: "Pending Review",
    under_review: "Under Review",
    verified: "Verified",
    approved: "Approved",
    rejected: "Rejected",
    tenant_created: "Tenant Created",
    admin_created: "Admin Account Created",
    onboarded: "Onboarded — Live"
  };

  const GENERIC_NOT_FOUND =
    "We couldn't find a request matching those details. Please double-check your Reference ID and email.";

  function showTrackError(message) {
    trackResult.hidden = false;
    trackResult.className = "track-result is-error";
    trackResult.textContent = message;
  }

  function showTrackStatus(data) {
    const statusKey = (data && data.meta && data.meta.status) || "pending";
    const label = STATUS_LABELS[statusKey] || statusKey;
    const institutionName = (data && data.institution && data.institution.name) || "Your institution";

    trackResult.hidden = false;
    trackResult.className = "track-result is-success";
    trackResult.innerHTML = "";

    const nameEl = document.createElement("p");
    nameEl.className = "track-result-name";
    nameEl.textContent = institutionName;

    const statusEl = document.createElement("p");
    statusEl.className = "track-result-status";
    statusEl.innerHTML = `Status: <strong>${label}</strong>`;

    trackResult.appendChild(nameEl);
    trackResult.appendChild(statusEl);
  }

  trackForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const refIdField = document.getElementById("trackReferenceId");
    const emailField = document.getElementById("trackEmail");
    const refIdError = trackForm.querySelector('[data-error-for="trackReferenceId"]');
    const emailError = trackForm.querySelector('[data-error-for="trackEmail"]');

    const refId = refIdField.value.trim();
    const email = emailField.value.trim().toLowerCase();

    trackResult.hidden = true;
    trackResult.textContent = "";

    let hasError = false;

    if (!refId) {
      if (refIdError) refIdError.textContent = "Reference ID is required.";
      hasError = true;
    } else if (refIdError) {
      refIdError.textContent = "";
    }

    if (!email) {
      if (emailError) emailError.textContent = "Email is required.";
      hasError = true;
    } else if (emailError) {
      emailError.textContent = "";
    }

    if (hasError) return;

    if (trackSubmitBtn) {
      trackSubmitBtn.disabled = true;
      trackSubmitBtn.textContent = "Checking...";
    }

    try {
      const snap = await getDoc(doc(db, "accessRequests", refId));

      if (!snap.exists()) {
        showTrackError(GENERIC_NOT_FOUND);
        return;
      }

      const data = snap.data();
      const storedEmail = ((data && data.contact && data.contact.email) || "").toLowerCase();

      if (storedEmail !== email) {
        showTrackError(GENERIC_NOT_FOUND);
        return;
      }

      showTrackStatus(data);

    } catch (err) {
      console.error("Track request failed:", err);
      showTrackError("Something went wrong while checking your request. Please try again.");
    } finally {
      if (trackSubmitBtn) {
        trackSubmitBtn.disabled = false;
        trackSubmitBtn.textContent = "Check Status";
      }
    }
  });

  // Pre-fill the Reference ID field when arriving via the success
  // screen's "Track another request" link.
  if (trackAnotherLink) {
    trackAnotherLink.addEventListener("click", () => {
      const refIdEl = document.getElementById("referenceId");
      const refIdField = document.getElementById("trackReferenceId");
      if (refIdField && refIdEl && refIdEl.textContent.trim() && refIdEl.textContent.trim() !== "—") {
        refIdField.value = refIdEl.textContent.trim();
      }
    });
  }
})();

/* ==========================================================
   OFFICIAL APPLICATION COPY — PDF GENERATOR
   Built with pdf-lib (window.PDFLib) + QRCode (window.QRCode).
   Mirrors the site's design system:
     - CampusOne blue gradient (#2563EB → #0EA5E9)
     - Dark slate surfaces, rounded cards
     - Cover page → form data pages → verification page
   ========================================================== */

/* ----------------------------------------------------------
   Self-healing loader for the two CDN libraries.
   If the <script> tags in <head>/<body> failed to load
   (slow network, blocked CDN, etc.) this re-injects them
   on demand instead of failing the whole PDF generation.
   ---------------------------------------------------------- */

const LIB_SOURCES = {
  PDFLib: [
    "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js",
    "https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js"
  ],
  QRCode: [
    "https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js",
    "https://unpkg.com/qrcode@1.5.3/build/qrcode.min.js"
  ]
};

function loadScriptOnce(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)));
      // If it's already loaded by the time we get here, resolve immediately.
      if (existing.dataset.loaded === "true") resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => {
      script.dataset.loaded = "true";
      resolve();
    };
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.body.appendChild(script);
  });
}

async function ensureGlobal(globalName, withTimeoutMs = 8000) {
  if (window[globalName]) return;

  const sources = LIB_SOURCES[globalName] || [];
  let lastError = null;

  for (const src of sources) {
    try {
      await Promise.race([
        loadScriptOnce(src),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Timed out loading ${src}`)), withTimeoutMs)
        )
      ]);
      if (window[globalName]) return;
    } catch (err) {
      lastError = err;
    }
  }

  throw new Error(
    `${globalName} could not be loaded from the CDN. Please check your internet connection and try again.` +
    (lastError ? ` (${lastError.message})` : "")
  );
}

async function generateApplicationPdf({ referenceId, payload, submittedDate, trackingUrl }) {
  // pdf-lib is required — without it there is no PDF at all.
  await ensureGlobal("PDFLib");

  // The QR code is a nice-to-have visual on the cover/verification
  // pages. If it can't be loaded (CDN blocked, flaky network), the
  // PDF should still generate — just without the QR image.
  let qrAvailable = true;
  try {
    await ensureGlobal("QRCode");
  } catch (err) {
    console.warn("QR library unavailable — generating PDF without QR code:", err);
    qrAvailable = false;
  }

  const { PDFDocument, rgb, StandardFonts } = window.PDFLib;

  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(`CampusOne Institution Registration Application — ${referenceId}`);
  pdfDoc.setAuthor("CampusOne");
  pdfDoc.setSubject("Institution Registration Application");

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // ---- Brand palette (matches style.css tokens) ----
  const BRAND_PRIMARY = rgb(0x25 / 255, 0x63 / 255, 0xEB / 255);   // #2563EB
  const BRAND_SECONDARY = rgb(0x0E / 255, 0xA5 / 255, 0xE9 / 255); // #0EA5E9
  const INK = rgb(0x0F / 255, 0x17 / 255, 0x2A / 255);             // #0F172A
  const SLATE = rgb(0x33 / 255, 0x41 / 255, 0x55 / 255);           // text-secondary
  const MUTED = rgb(0x64 / 255, 0x74 / 255, 0x8B / 255);           // text-muted
  const LINE = rgb(0xE2 / 255, 0xE8 / 255, 0xF0 / 255);
  const CARD_BG = rgb(0xF8 / 255, 0xFA / 255, 0xFC / 255);
  const WHITE = rgb(1, 1, 1);
  const SUCCESS = rgb(0x05 / 255, 0x96 / 255, 0x69 / 255);
  const AMBER = rgb(0xB4 / 255, 0x5B / 255, 0x09 / 255);
  const AMBER_BG = rgb(0xFE / 255, 0xF3 / 255, 0xC7 / 255);

  const PAGE_W = 595.28; // A4 pt
  const PAGE_H = 841.89;
  const MARGIN = 48;

  // QR code as PNG data URL, shared by cover + verification page.
  // qrImage stays null if the library wasn't available — every
  // place that draws it below checks for this first.
  let qrImage = null;
  if (qrAvailable) {
    try {
      const qrDataUrl = await window.QRCode.toDataURL(trackingUrl, {
        width: 300,
        margin: 1,
        color: { dark: "#0F172A", light: "#FFFFFF" }
      });
      const qrImageBytes = await fetch(qrDataUrl).then((r) => r.arrayBuffer());
      qrImage = await pdfDoc.embedPng(qrImageBytes);
    } catch (err) {
      console.warn("QR code generation failed — continuing without it:", err);
      qrImage = null;
    }
  }

  /* ---------------------------------------------------
     Helper: gradient bar (approximated with N vertical
     strips since pdf-lib has no native gradient fills)
  --------------------------------------------------- */
  function drawGradientBar(page, x, y, w, h) {
    const steps = 40;
    const stepW = w / steps;
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);
      const r = 0x25 / 255 + t * (0x0E / 255 - 0x25 / 255);
      const g = 0x63 / 255 + t * (0xA5 / 255 - 0x63 / 255);
      const b = 0xEB / 255 + t * (0xE9 / 255 - 0xEB / 255);
      page.drawRectangle({
        x: x + i * stepW,
        y,
        width: stepW + 0.5,
        height: h,
        color: rgb(r, g, b)
      });
    }
  }

  function drawRoundedCard(page, x, y, w, h, fillColor, borderColor) {
    page.drawRectangle({
      x, y, width: w, height: h,
      color: fillColor || CARD_BG,
      borderColor: borderColor || LINE,
      borderWidth: borderColor ? 1 : 0.75
    });
  }

  function wrapText(text, font, size, maxWidth) {
    const words = String(text).split(" ");
    const lines = [];
    let current = "";
    words.forEach((word) => {
      const test = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(test, size) > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = test;
      }
    });
    if (current) lines.push(current);
    return lines;
  }

  function footer(page, pageLabel) {
    page.drawLine({
      start: { x: MARGIN, y: 56 },
      end: { x: PAGE_W - MARGIN, y: 56 },
      thickness: 0.75,
      color: LINE
    });
    page.drawText("CampusOne — Digital Campus Management Platform", {
      x: MARGIN, y: 40, size: 8, font: fontRegular, color: MUTED
    });
    page.drawText(pageLabel, {
      x: PAGE_W - MARGIN - fontRegular.widthOfTextAtSize(pageLabel, 8),
      y: 40, size: 8, font: fontRegular, color: MUTED
    });
  }

  const STATUS_LABEL = "Pending Review";

  /* =====================================================
     PAGE 1 — COVER PAGE
  ===================================================== */
  const cover = pdfDoc.addPage([PAGE_W, PAGE_H]);

  // Full gradient header band
  drawGradientBar(cover, 0, PAGE_H - 230, PAGE_W, 230);

  // Logo badge (circle) with "CO" mark — placeholder brand mark
  cover.drawCircle({
    x: MARGIN + 28, y: PAGE_H - 70, size: 28,
    color: WHITE
  });
  cover.drawText("CO", {
    x: MARGIN + 14, y: PAGE_H - 78, size: 20, font: fontBold, color: BRAND_PRIMARY
  });

  cover.drawText("CampusOne", {
    x: MARGIN + 68, y: PAGE_H - 78, size: 22, font: fontBold, color: WHITE
  });
  cover.drawText("Digital Campus Management Platform", {
    x: MARGIN + 68, y: PAGE_H - 96, size: 10, font: fontRegular, color: WHITE
  });

  cover.drawText("Institution Registration Application", {
    x: MARGIN, y: PAGE_H - 165, size: 24, font: fontBold, color: WHITE
  });
  cover.drawText("Official Application Copy", {
    x: MARGIN, y: PAGE_H - 188, size: 12, font: fontRegular, color: WHITE
  });

  // Institution name block
  const institutionName = payload.institution.name || "—";
  cover.drawText(institutionName, {
    x: MARGIN, y: PAGE_H - 280, size: 19, font: fontBold, color: INK
  });
  cover.drawText("Submitted Institution", {
    x: MARGIN, y: PAGE_H - 298, size: 9, font: fontRegular, color: MUTED
  });

  // Status badge
  const badgeW = fontBold.widthOfTextAtSize(STATUS_LABEL, 10) + 28;
  drawRoundedCard(cover, MARGIN, PAGE_H - 340, badgeW, 26, AMBER_BG, null);
  cover.drawText(STATUS_LABEL, {
    x: MARGIN + 14, y: PAGE_H - 332, size: 10, font: fontBold, color: AMBER
  });

  // Info card: Reference ID / Submission Date / Generated By
  const cardY = PAGE_H - 470;
  drawRoundedCard(cover, MARGIN, cardY, PAGE_W - MARGIN * 2, 110, CARD_BG, LINE);

  const colW = (PAGE_W - MARGIN * 2 - 40) / 3;
  const infoCols = [
    { label: "REFERENCE ID", value: referenceId },
    { label: "SUBMISSION DATE", value: submittedDate.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) },
    { label: "GENERATED BY", value: "CampusOne" }
  ];
  infoCols.forEach((col, i) => {
    const colX = MARGIN + 20 + i * (colW + 10);
    cover.drawText(col.label, { x: colX, y: cardY + 75, size: 8, font: fontBold, color: MUTED });
    cover.drawText(col.value, { x: colX, y: cardY + 55, size: 11, font: fontBold, color: INK });
  });

  cover.drawText("Onboarding Type", { x: MARGIN + 20, y: cardY + 28, size: 8, font: fontBold, color: MUTED });
  cover.drawText(payload.institution.type || "—", { x: MARGIN + 20, y: cardY + 12, size: 11, font: fontRegular, color: SLATE });

  cover.drawText("Category", { x: MARGIN + 20 + colW + 10, y: cardY + 28, size: 8, font: fontBold, color: MUTED });
  cover.drawText(payload.institution.category || "—", { x: MARGIN + 20 + colW + 10, y: cardY + 12, size: 11, font: fontRegular, color: SLATE });

  cover.drawText("Location", { x: MARGIN + 20 + (colW + 10) * 2, y: cardY + 28, size: 8, font: fontBold, color: MUTED });
  cover.drawText(`${payload.location.city || "—"}, ${payload.location.state || "—"}`, { x: MARGIN + 20 + (colW + 10) * 2, y: cardY + 12, size: 11, font: fontRegular, color: SLATE });

  // Tagline footer block
  cover.drawLine({ start: { x: MARGIN, y: 130 }, end: { x: PAGE_W - MARGIN, y: 130 }, thickness: 1, color: LINE });
  cover.drawText(""Digital Campus Management Platform"", {
    x: MARGIN, y: 100, size: 11, font: fontRegular, color: MUTED
  });
  cover.drawText("This document is a system-generated official copy of an institution onboarding", {
    x: MARGIN, y: 78, size: 8.5, font: fontRegular, color: MUTED
  });
  cover.drawText("request submitted to CampusOne. See Page 2 onward for full submitted details.", {
    x: MARGIN, y: 66, size: 8.5, font: fontRegular, color: MUTED
  });
  footer(cover, "Page 1");

  /* =====================================================
     PAGE 2+ — FORM DATA (rendered as section cards)
  ===================================================== */

  function newDataPage(pageNumber) {
    const page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    drawGradientBar(page, 0, PAGE_H - 6, PAGE_W, 6);
    page.drawText("Institution Registration Application", {
      x: MARGIN, y: PAGE_H - 40, size: 13, font: fontBold, color: INK
    });
    page.drawText(referenceId, {
      x: PAGE_W - MARGIN - fontRegular.widthOfTextAtSize(referenceId, 9), y: PAGE_H - 38, size: 9, font: fontRegular, color: MUTED
    });
    footer(page, `Page ${pageNumber}`);
    return page;
  }

  let pageNum = 2;
  let page = newDataPage(pageNum);
  let cursorY = PAGE_H - 80;
  const contentW = PAGE_W - MARGIN * 2;
  const rowH = 34;

  function ensureSpace(neededHeight) {
    if (cursorY - neededHeight < 90) {
      pageNum += 1;
      page = newDataPage(pageNum);
      cursorY = PAGE_H - 80;
    }
  }

  function drawSectionHeading(title) {
    ensureSpace(40);
    drawGradientBar(page, MARGIN, cursorY - 4, 4, 18);
    page.drawText(title, { x: MARGIN + 14, y: cursorY, size: 13, font: fontBold, color: INK });
    cursorY -= 26;
  }

  function drawFieldRow(pairs) {
    ensureSpace(rowH);
    const colWidth = contentW / pairs.length;
    pairs.forEach((pair, i) => {
      const x = MARGIN + i * colWidth;
      page.drawText(pair.label.toUpperCase(), { x, y: cursorY, size: 7.5, font: fontBold, color: MUTED });
      const valueLines = wrapText(pair.value || "—", fontRegular, 10.5, colWidth - 10);
      valueLines.slice(0, 2).forEach((line, li) => {
        page.drawText(line, { x, y: cursorY - 15 - li * 13, size: 10.5, font: fontRegular, color: INK });
      });
    });
    cursorY -= rowH;
  }

  function drawDivider() {
    page.drawLine({ start: { x: MARGIN, y: cursorY + 8 }, end: { x: PAGE_W - MARGIN, y: cursorY + 8 }, thickness: 0.5, color: LINE });
  }

  // Section: Institution Identity
  drawSectionHeading("Institution Identity");
  drawFieldRow([
    { label: "Institution Name", value: payload.institution.name },
    { label: "Institution Type", value: payload.institution.type }
  ]);
  drawFieldRow([
    { label: "Category", value: payload.institution.category },
    { label: "Institution Code", value: payload.institution.code }
  ]);
  drawFieldRow([
    { label: "Establishment Year", value: payload.institution.establishmentYear ? String(payload.institution.establishmentYear) : null },
    { label: "University / Board Affiliation", value: payload.institution.universityAffiliation }
  ]);
  drawDivider();
  cursorY -= 14;

  // Section: Contact & Strength
  drawSectionHeading("Contact & Strength");
  drawFieldRow([
    { label: "Principal / Director", value: payload.contact.principalName },
    { label: "Official Email", value: payload.contact.email }
  ]);
  drawFieldRow([
    { label: "Official Mobile", value: payload.contact.mobile },
    { label: "Website", value: payload.institution.website }
  ]);
  drawFieldRow([
    { label: "Student Strength", value: payload.strength.students ? String(payload.strength.students) : null },
    { label: "Faculty Strength", value: payload.strength.faculty ? String(payload.strength.faculty) : null }
  ]);
  drawFieldRow([
    { label: "Institution Size", value: payload.institution.size },
    { label: "Academic Session", value: payload.academicSession }
  ]);
  drawDivider();
  cursorY -= 14;

  // Section: Modules & Referral
  drawSectionHeading("Modules of Interest & Referral");
  const moduleLabels = (payload.interest.modules || []).join(", ") || "None selected";
  ensureSpace(40);
  page.drawText("SELECTED MODULES", { x: MARGIN, y: cursorY, size: 7.5, font: fontBold, color: MUTED });
  const moduleLines = wrapText(moduleLabels, fontRegular, 10.5, contentW);
  moduleLines.forEach((line, li) => {
    page.drawText(line, { x: MARGIN, y: cursorY - 15 - li * 13, size: 10.5, font: fontRegular, color: INK });
  });
  cursorY -= 15 + moduleLines.length * 13 + 10;
  drawFieldRow([
    { label: "How They Heard About CampusOne", value: payload.interest.referralSource }
  ]);
  drawDivider();
  cursorY -= 14;

  // Section: Location
  drawSectionHeading("Location");
  ensureSpace(40);
  page.drawText("FULL ADDRESS", { x: MARGIN, y: cursorY, size: 7.5, font: fontBold, color: MUTED });
  const addressLines = wrapText(payload.location.address || "—", fontRegular, 10.5, contentW);
  addressLines.forEach((line, li) => {
    page.drawText(line, { x: MARGIN, y: cursorY - 15 - li * 13, size: 10.5, font: fontRegular, color: INK });
  });
  cursorY -= 15 + addressLines.length * 13 + 10;
  drawFieldRow([
    { label: "City", value: payload.location.city },
    { label: "State", value: payload.location.state },
    { label: "Country", value: payload.location.country }
  ]);
  drawDivider();
  cursorY -= 14;

  // Section: Compliance
  drawSectionHeading("Compliance & Recognition");
  drawFieldRow([
    { label: "Accreditation / Recognition", value: (payload.institution.accreditation || []).join(", ") || "—" },
  ]);
  drawFieldRow([
    { label: "GST Number", value: payload.compliance.gstNumber },
    { label: "PAN Number", value: payload.compliance.panNumber }
  ]);
  drawFieldRow([
    { label: "Terms & Privacy Consent", value: payload.consent ? "Accepted" : "Not Accepted" }
  ]);

  /* =====================================================
     FINAL PAGE — VERIFICATION
  ===================================================== */
  pageNum += 1;
  const verifyPage = newDataPage(pageNum);
  let vy = PAGE_H - 110;

  verifyPage.drawText("Verification Information", {
    x: MARGIN, y: vy, size: 16, font: fontBold, color: INK
  });
  vy -= 30;

  drawRoundedCard(verifyPage, MARGIN, vy - 210, contentW, 210, CARD_BG, LINE);

  const verifyLeftX = MARGIN + 24;
  let vRowY = vy - 30;

  const verifyRows = [
    ["Reference ID", referenceId],
    ["Tracking URL", trackingUrl],
    ["Digital Timestamp", submittedDate.toISOString()],
    ["Generated By", "CampusOne — Automated Onboarding System"],
    ["Support Email", "support@campusone.app"],
    ["Website", "campusone.app"]
  ];

  // QR code box on the right of the verification card
  // (qrSize must be declared before verifyRows uses it to
  // compute available text width — this ordering bug previously
  // caused a ReferenceError that aborted PDF generation.)
  const qrSize = 110;
  const qrX = PAGE_W - MARGIN - qrSize - 24;
  const qrY = vy - 150;

  verifyRows.forEach(([label, value]) => {
    verifyPage.drawText(label.toUpperCase(), { x: verifyLeftX, y: vRowY, size: 7.5, font: fontBold, color: MUTED });
    const valueMaxWidth = contentW - 48 - (qrSize + 40);
    const valueLines = wrapText(value, fontRegular, 10, valueMaxWidth);
    valueLines.slice(0, 2).forEach((line, li) => {
      verifyPage.drawText(line, { x: verifyLeftX, y: vRowY - 14 - li * 12, size: 10, font: fontRegular, color: INK });
    });
    vRowY -= valueLines.length > 1 ? 42 : 30;
  });

  if (qrImage) {
    verifyPage.drawRectangle({
      x: qrX - 8, y: qrY - 8, width: qrSize + 16, height: qrSize + 16,
      color: WHITE, borderColor: LINE, borderWidth: 1
    });
    verifyPage.drawImage(qrImage, { x: qrX, y: qrY, width: qrSize, height: qrSize });
    verifyPage.drawText("Scan to track status", {
      x: qrX - 4, y: qrY - 24, size: 8, font: fontRegular, color: MUTED
    });
  } else {
    // Fallback when the QR library wasn't available — show the
    // tracking link as plain text instead of leaving blank space.
    verifyPage.drawRectangle({
      x: qrX - 8, y: qrY - 8, width: qrSize + 16, height: qrSize + 16,
      color: CARD_BG, borderColor: LINE, borderWidth: 1
    });
    verifyPage.drawText("Visit", {
      x: qrX + 12, y: qrY + qrSize - 30, size: 9, font: fontRegular, color: MUTED
    });
    verifyPage.drawText("campusone.app/track", {
      x: qrX + 4, y: qrY + qrSize - 46, size: 9, font: fontBold, color: INK
    });
    verifyPage.drawText("to check status", {
      x: qrX + 12, y: qrY + qrSize - 62, size: 9, font: fontRegular, color: MUTED
    });
  }

  vy -= 240;
  verifyPage.drawLine({ start: { x: MARGIN, y: vy }, end: { x: PAGE_W - MARGIN, y: vy }, thickness: 0.75, color: LINE });
  vy -= 24;
  verifyPage.drawText("This is a system-generated document and does not require a physical signature.", {
    x: MARGIN, y: vy, size: 8.5, font: fontRegular, color: MUTED
  });
  vy -= 14;
  verifyPage.drawText("For queries regarding this application, contact support@campusone.app", {
    x: MARGIN, y: vy, size: 8.5, font: fontRegular, color: MUTED
  });

  // ---- Save & trigger download ----
  const pdfBytes = await pdfDoc.save();
  const blob = new Blob([pdfBytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `CampusOne-Application-${referenceId}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

