/* ==========================================================
   CAMPUSONE — REGISTER INSTITUTION
   Multi-step form controller
   ========================================================== */

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

  /* ----------------------------------------------------
     STEP FIELD MAP — which fields must validate per step
  ---------------------------------------------------- */

  const STEP_FIELDS = {
    1: ["institutionName", "institutionType", "institutionCategory", "establishmentYear"],
    2: ["principalName", "email", "mobile", "website", "studentStrength", "facultyStrength", "academicSession"],
    3: ["address", "city", "state", "country"],
    4: ["consent"]
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
    academicSession: "Enter the current academic session.",
    address: "Address is required.",
    city: "City is required.",
    state: "State is required.",
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

    if (card) {
      card.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  form.querySelectorAll("[data-next]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const valid = validateStep(currentStep);
      if (!valid) return;
      goToStep(Math.min(currentStep + 1, steps.length));
    });
  });

  form.querySelectorAll("[data-back]").forEach((btn) => {
    btn.addEventListener("click", () => {
      goToStep(Math.max(currentStep - 1, 1));
    });
  });

  /* ----------------------------------------------------
     LIVE VALIDATION ON BLUR
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
     Replace the fetch() call below with your backend /
     Firestore integration (collection: "accessRequests").
  ---------------------------------------------------- */

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
        website: data.get("website")?.trim() || null
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
      consent: data.get("consent") === "on",
      meta: {
        status: "pending",
        submittedAt: new Date().toISOString(),
        source: "register-institution"
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
    for (let i = 1; i <= steps.length; i++) {
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

      console.log("Institution registration payload:", payload);

      const referenceId = generateReferenceId();

      form.hidden = true;
      document.getElementById("formProgress").hidden = true;
      successPanel.hidden = false;
      referenceIdEl.textContent = `Reference ID: ${referenceId}`;
    } catch (err) {
      console.error(err);
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Submit Registration Request";
      }
      alert("Something went wrong submitting your request. Please try again.");
    }
  });

  goToStep(1);
})();
