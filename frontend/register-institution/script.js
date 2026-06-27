//import { submitInstitutionRequest } from "../shared/firestore.js";

//import { generateReferenceId } from "../shared/helpers.js";

/* ==========================================================
   CAMPUSONE - REGISTER INSTITUTION
   script.js  |  v1.0.0
   ========================================================== */

'use strict';

/* ----------------------------------------------------------
   THEME SYSTEM
   ---------------------------------------------------------- */

const THEME_KEY = 'campusone_theme';

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);

  document.querySelectorAll('.theme-option').forEach(btn => {
    const active = btn.dataset.themeOption === theme;
    btn.setAttribute('aria-pressed', String(active));
  });
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY) || 'system';
  applyTheme(saved);

  document.querySelectorAll('.theme-option').forEach(btn => {
    btn.addEventListener('click', () => applyTheme(btn.dataset.themeOption));
  });
}

/* ----------------------------------------------------------
   MOBILE DRAWER
   ---------------------------------------------------------- */

function initDrawer() {
  const menuToggle   = document.getElementById('menuToggle');
  const drawerClose  = document.getElementById('drawerClose');
  const drawerOverlay = document.getElementById('drawerOverlay');
  const mobileDrawer = document.getElementById('mobileDrawer');

  if (!menuToggle || !mobileDrawer) return;

  function openDrawer() {
    mobileDrawer.classList.add('open');
    drawerOverlay.classList.add('active');
    mobileDrawer.setAttribute('aria-hidden', 'false');
    menuToggle.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
  }

  function closeDrawer() {
    mobileDrawer.classList.remove('open');
    drawerOverlay.classList.remove('active');
    mobileDrawer.setAttribute('aria-hidden', 'true');
    menuToggle.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  }

  menuToggle.addEventListener('click', openDrawer);
  drawerClose.addEventListener('click', closeDrawer);
  drawerOverlay.addEventListener('click', closeDrawer);

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeDrawer();
  });
}

/* ----------------------------------------------------------
   HEADER SCROLL EFFECT
   ---------------------------------------------------------- */

function initHeaderScroll() {
  const header = document.querySelector('.registration-header');
  if (!header) return;

  const onScroll = () => {
    if (window.scrollY > 20) {
      header.style.background = 'rgba(15,23,42,0.85)';
      header.style.borderBottom = '1px solid rgba(255,255,255,0.06)';
    } else {
      header.style.background = '';
      header.style.borderBottom = '';
    }
  };

  window.addEventListener('scroll', onScroll, { passive: true });
}

/* ----------------------------------------------------------
   MULTI-STEP FORM ENGINE
   ---------------------------------------------------------- */

const STEPS = [1, 2, 3, 4, 5, 6];
let currentStep = 1;

// Validation rules per step
const STEP_VALIDATORS = {
  1: ['institutionName', 'institutionType', 'institutionCategory', 'establishmentYear'],
  2: ['principalName', 'email', 'mobile', 'studentStrength', 'facultyStrength', 'institutionSize', 'academicSession'],
  3: [], // optional step
  4: ['address', 'city', 'state', 'country'],
  5: ['consent'],
  6: [], // review — no validation needed
};

function getField(id) {
  return document.getElementById(id);
}

function showFieldError(fieldName, msg) {
  const el = document.querySelector(`[data-error-for="${fieldName}"]`);
  if (el) el.textContent = msg;
}

function clearFieldError(fieldName) {
  const el = document.querySelector(`[data-error-for="${fieldName}"]`);
  if (el) el.textContent = '';
}

function validateField(fieldName) {
  const el = getField(fieldName);
  if (!el) return true;

  const val = el.value.trim();

  // Special: consent checkbox
  if (fieldName === 'consent') {
    if (!el.checked) {
      showFieldError('consent', 'Please accept the Terms and Privacy Policy to continue.');
      return false;
    }
    clearFieldError('consent');
    return true;
  }

  // Email
  if (el.type === 'email') {
    const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!val) {
      showFieldError(fieldName, 'This field is required.');
      return false;
    }
    if (!emailRx.test(val)) {
      showFieldError(fieldName, 'Please enter a valid email address.');
      return false;
    }
    clearFieldError(fieldName);
    return true;
  }

  // Mobile
  if (fieldName === 'mobile') {
    const mobileRx = /^[+]?[\d\s\-()]{7,16}$/;
    if (!val) {
      showFieldError(fieldName, 'Mobile number is required.');
      return false;
    }
    if (!mobileRx.test(val)) {
      showFieldError(fieldName, 'Please enter a valid phone number.');
      return false;
    }
    clearFieldError(fieldName);
    return true;
  }

  // Year
  if (fieldName === 'establishmentYear') {
    const yr = parseInt(val, 10);
    if (!val) {
      showFieldError(fieldName, 'Establishment year is required.');
      return false;
    }
    if (isNaN(yr) || yr < 1800 || yr > new Date().getFullYear()) {
      showFieldError(fieldName, `Enter a valid year between 1800 and ${new Date().getFullYear()}.`);
      return false;
    }
    clearFieldError(fieldName);
    return true;
  }

  // Numbers (strength)
  if (el.type === 'number') {
    if (!val || isNaN(Number(val)) || Number(val) < 1) {
      showFieldError(fieldName, 'Please enter a valid positive number.');
      return false;
    }
    clearFieldError(fieldName);
    return true;
  }

  // URL
  if (el.type === 'url' && val) {
    try {
      new URL(val);
    } catch {
      showFieldError(fieldName, 'Please enter a valid URL (e.g. https://...).');
      return false;
    }
    clearFieldError(fieldName);
    return true;
  }

  // Required text / select
  if (el.required && !val) {
    showFieldError(fieldName, 'This field is required.');
    return false;
  }

  clearFieldError(fieldName);
  return true;
}

function validateStep(step) {
  const fields = STEP_VALIDATORS[step] || [];
  let allValid = true;

  fields.forEach(fieldName => {
    const ok = validateField(fieldName);
    if (!ok) allValid = false;
  });

  return allValid;
}

function goToStep(targetStep) {
  // Hide current
  const currentFieldset = document.querySelector(`.form-step[data-step="${currentStep}"]`);
  if (currentFieldset) {
    currentFieldset.classList.remove('is-active');
  }

  // Show target
  const targetFieldset = document.querySelector(`.form-step[data-step="${targetStep}"]`);
  if (targetFieldset) {
    targetFieldset.classList.add('is-active');
  }

  // Update progress dots
  document.querySelectorAll('.progress-step').forEach(dot => {
    const s = parseInt(dot.dataset.step, 10);
    dot.classList.toggle('is-active', s === targetStep);
    dot.classList.toggle('is-complete', s < targetStep);
  });

  currentStep = targetStep;

  // Populate review on step 6
  if (targetStep === 6) {
    populateReview();
  }

  // Scroll card into view
  const card = document.querySelector('.registration-card');
  if (card) {
    setTimeout(() => {
      card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }
}

function initMultiStepForm() {
  const form = document.getElementById('institutionRegistrationForm');
  if (!form) return;

  // Next buttons
  form.addEventListener('click', e => {
    const nextBtn = e.target.closest('[data-next]');
    const backBtn = e.target.closest('[data-back]');
    const editBtn = e.target.closest('[data-edit-step]');

    if (nextBtn) {
      if (validateStep(currentStep)) {
        goToStep(currentStep + 1);
      } else {
        // Shake the card
        const card = document.querySelector('.registration-card');
        card?.classList.add('shake');
        setTimeout(() => card?.classList.remove('shake'), 400);
      }
    }

    if (backBtn && currentStep > 1) {
      goToStep(currentStep - 1);
    }

    if (editBtn) {
      const target = parseInt(editBtn.dataset.editStep, 10);
      goToStep(target);
    }
  });

  // Live validation on blur
  form.querySelectorAll('input, select, textarea').forEach(el => {
    el.addEventListener('blur', () => {
      el.dataset.touched = 'true';
      if (el.name) validateField(el.name);
    });

    el.addEventListener('input', () => {
      if (el.dataset.touched) validateField(el.name);
    });
  });

  // Submit
  form.addEventListener('submit', e => {
    e.preventDefault();
    handleFormSubmit();
  });
}

/* ----------------------------------------------------------
   LOGO FILE DROP
   ---------------------------------------------------------- */

let logoDataURL = null;

function initFileDrop() {
  const dropZone  = document.getElementById('logoDrop');
  const fileInput = document.getElementById('institutionLogo');
  const filename  = document.getElementById('logoFilename');

  if (!dropZone || !fileInput) return;

  function handleFile(file) {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/svg+xml'].includes(file.type)) {
      filename.textContent = '⚠ Only PNG, JPG or SVG files are allowed.';
      filename.style.color = 'var(--danger)';
      logoDataURL = null;
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      filename.textContent = '⚠ File size exceeds 2MB limit.';
      filename.style.color = 'var(--danger)';
      logoDataURL = null;
      return;
    }

    filename.textContent = `✓ ${file.name}`;
    filename.style.color = '#34D399';

    const reader = new FileReader();
    reader.onload = e => { logoDataURL = e.target.result; };
    reader.readAsDataURL(file);
  }

  fileInput.addEventListener('change', () => handleFile(fileInput.files[0]));

  dropZone.addEventListener('dragover', e => {
    e.preventDefault();
    dropZone.classList.add('is-dragover');
  });

  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('is-dragover'));

  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('is-dragover');
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  });
}

/* ----------------------------------------------------------
   REVIEW POPULATION (STEP 6)
   ---------------------------------------------------------- */

function getVal(id) {
  const el = getField(id);
  if (!el) return '—';
  if (el.type === 'checkbox') return el.checked ? 'Yes' : 'No';
  const v = el.value.trim();
  return v || '—';
}

function populateReview() {
  // All review fields
  const fieldMap = {
    institutionName:      'institutionName',
    institutionType:      'institutionType',
    institutionCategory:  'institutionCategory',
    institutionCode:      'institutionCode',
    establishmentYear:    'establishmentYear',
    universityAffiliation:'universityAffiliation',
    principalName:        'principalName',
    email:                'email',
    mobile:               'mobile',
    website:              'website',
    studentStrength:      'studentStrength',
    facultyStrength:      'facultyStrength',
    institutionSize:      'institutionSize',
    academicSession:      'academicSession',
    referralSource:       'referralSource',
    address:              'address',
    city:                 'city',
    state:                'state',
    country:              'country',
    accreditation:        'accreditation',
    gstNumber:            'gstNumber',
    panNumber:            'panNumber',
  };

  Object.entries(fieldMap).forEach(([reviewKey, fieldId]) => {
    const dd = document.querySelector(`[data-review="${reviewKey}"]`);
    if (dd) dd.textContent = getVal(fieldId);
  });

  // Modules (chips)
  const checkedModules = [...document.querySelectorAll('input[name="modules"]:checked')]
    .map(cb => cb.nextElementSibling?.textContent?.trim() || cb.value);

  const chipRow = document.getElementById('reviewModules');
  if (chipRow) {
    chipRow.innerHTML = checkedModules.length
      ? checkedModules.map(m => `<span class="review-chip">${m}</span>`).join('')
      : '';
  }

  // Logo preview
  const logoRow     = document.getElementById('reviewLogoRow');
  const logoPreview = document.getElementById('reviewLogoPreview');
  if (logoDataURL && logoRow && logoPreview) {
    logoPreview.src = logoDataURL;
    logoRow.hidden = false;
  } else if (logoRow) {
    logoRow.hidden = true;
  }

  // Consent status
  const consentChecked = document.getElementById('consent')?.checked;
  const consentStatus  = document.getElementById('reviewConsentStatus');
  const consentText    = document.getElementById('reviewConsentText');
  if (consentStatus && consentText) {
    if (consentChecked) {
      consentStatus.classList.remove('is-pending');
      consentText.textContent = 'Terms & Privacy Policy accepted';
    } else {
      consentStatus.classList.add('is-pending');
      consentText.textContent = 'Terms & Privacy Policy not yet accepted';
    }
  }
}

/* ----------------------------------------------------------
   GENERATE REFERENCE ID (Firestore-style random ID)
   ---------------------------------------------------------- */

function generateRefId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 20; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

/* ----------------------------------------------------------
   QR CODE GENERATION
   ---------------------------------------------------------- */

async function generateQR(canvas, text) {
  try {
    if (typeof QRCode === 'undefined') {
      console.warn('QRCode library not loaded');
      return;
    }
    
const themeAttr = document.documentElement.getAttribute('data-theme') || 'system';

let isDark;

if (themeAttr === 'dark') {
  isDark = true;
} else if (themeAttr === 'light') {
  isDark = false;
} else {
  isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
}

    await QRCode.toCanvas(canvas, text, {
      width: 112,
      margin: 2,
      color: {
        dark:  isDark ? '#FFFFFF' : '#0F172A',
        light: isDark ? '#1E293B' : '#F1F5F9',
      },
    });
    canvas.style.borderRadius = '10px';
  } catch (err) {
    console.warn('QR generation failed:', err);
    // Fallback
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#1E293B';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#60A5FA';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('QR unavailable', canvas.width / 2, canvas.height / 2);
    }
  }
}

/* ----------------------------------------------------------
   FORM SUBMISSION & SUCCESS STATE
   ---------------------------------------------------------- */

async function handleFormSubmit() {
  // Final validation
  if (!validateStep(5)) {
    goToStep(5);
    return;
  }

  const submitBtn = document.querySelector('.submit-btn');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting…';
  }


const payload = {
  referenceId: generateReferenceId(),

  institutionName: getVal("institutionName"),
  institutionType: getVal("institutionType"),
  institutionCategory: getVal("institutionCategory"),
  institutionCode: getVal("institutionCode"),
  establishmentYear: getVal("establishmentYear"),
  universityAffiliation: getVal("universityAffiliation"),

  principalName: getVal("principalName"),
  email: getVal("email"),
  mobile: getVal("mobile"),
  website: getVal("website"),

  studentStrength: Number(getVal("studentStrength")) || 0,
  facultyStrength: Number(getVal("facultyStrength")) || 0,
  institutionSize: getVal("institutionSize"),
  academicSession: getVal("academicSession"),

  modules: [...document.querySelectorAll('input[name="modules"]:checked')]
    .map(cb => cb.value),

  referralSource: getVal("referralSource"),

  address: getVal("address"),
  city: getVal("city"),
  state: getVal("state"),
  country: getVal("country"),

  accreditation: getVal("accreditation"),
  gstNumber: getVal("gstNumber"),
  panNumber: getVal("panNumber"),

  consent: document.getElementById("consent").checked,

  logo: logoDataURL || null,

  status: "pending",
  createdAt: new Date().toISOString()
};

  // Simulate a short network delay (replace with Firebase call)
  let result;

try {
  result = await submitInstitutionRequest(payload);

  if (!result.success) {
    throw new Error("Submission failed");
  }

} catch (error) {
  console.error(error);

  alert("Unable to submit the application. Please try again.");

  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.textContent = "Submit Application";
  }

  return;
}


  const refId = result.id;
  const trackingURL = `https://campusone.app/track/${refId}`;
  const instName    = getVal('institutionName');
  const now         = new Date();
  const submittedOn = now.toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });

  // Populate success card
  const elRef  = document.getElementById('referenceId');
  const elName = document.getElementById('successInstitutionName');
  const elDate = document.getElementById('successSubmittedOn');
  const elLink = document.getElementById('successTrackingLink');
  const qrCanvas = document.getElementById('successQrCanvas');

  if (elRef)  elRef.textContent  = refId;
  if (elName) elName.textContent = instName;
  if (elDate) elDate.textContent = submittedOn;
  if (elLink) elLink.textContent = trackingURL;

  // QR code
  if (qrCanvas) await generateQR(qrCanvas, trackingURL);

  // Show success, hide form
  const form    = document.getElementById('institutionRegistrationForm');
  const success = document.getElementById('submissionSuccess');
  const progress = document.getElementById('formProgress');

  if (form)     form.hidden     = true;
  if (progress) progress.hidden = true;
  if (success)  success.hidden  = false;

  // Store in sessionStorage for tracking lookup
  sessionStorage.setItem(`campusone_req_${refId}`, JSON.stringify({
    refId,
    institutionName: instName,
    email: getVal('email'),
    status: 'pending',
    submittedOn,
  }));

  // Generate PDF
  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit Application';
  }

  // Scroll to success card
  success.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ----------------------------------------------------------
   COPY TRACKING LINK
   ---------------------------------------------------------- */

function initCopyBtn() {
  const copyBtn = document.getElementById('successCopyBtn');
  const linkEl  = document.getElementById('successTrackingLink');
  if (!copyBtn || !linkEl) return;

  copyBtn.addEventListener('click', async () => {
    const text = linkEl.textContent;
    try {
      await navigator.clipboard.writeText(text);
      copyBtn.textContent = 'Copied!';
      copyBtn.style.background = 'rgba(52,211,153,.15)';
      copyBtn.style.borderColor = 'rgba(52,211,153,.4)';
      copyBtn.style.color = '#34D399';
    } catch {
      copyBtn.textContent = 'Copy Failed';
    }
    setTimeout(() => {
      copyBtn.textContent = 'Copy';
      copyBtn.style.background = '';
      copyBtn.style.borderColor = '';
      copyBtn.style.color = '';
    }, 2500);
  });
}

/* ----------------------------------------------------------
   PDF DOWNLOAD (pdf-lib)
   ---------------------------------------------------------- */

async function buildAndDownloadPDF() {
  // Wait for pdf-lib to load if not yet available (CDN async)
  if (typeof PDFLib === 'undefined') {
    let waited = 0;
    while (typeof PDFLib === 'undefined' && waited < 5000) {
      await new Promise(r => setTimeout(r, 200));
      waited += 200;
    }
  }
  if (typeof PDFLib === 'undefined') {
    alert('PDF library could not load. Please check your internet connection and try again.');
    return;
  }

  const { PDFDocument, rgb, StandardFonts, degrees } = PDFLib;

  const pdfDoc = await PDFDocument.create();
  const page   = pdfDoc.addPage([595.28, 841.89]); // A4
  const { width, height } = page.getSize();

  const fontBold    = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const blue   = rgb(0.149, 0.392, 0.922);
  const dark   = rgb(0.059, 0.090, 0.165);
  const muted  = rgb(0.396, 0.455, 0.573);
  const white  = rgb(1, 1, 1);
  const green  = rgb(0.204, 0.827, 0.6);

  // ---- HEADER BAND ----
  page.drawRectangle({ x: 0, y: height - 90, width, height: 90, color: blue });

  page.drawText('CampusOne', {
    x: 40, y: height - 38,
    size: 22, font: fontBold, color: white,
  });

  page.drawText('Enterprise Education Platform', {
    x: 40, y: height - 57,
    size: 9, font: fontRegular, color: rgb(0.74, 0.85, 0.99),
  });

  page.drawText('INSTITUTION REGISTRATION APPLICATION', {
    x: 40, y: height - 80,
    size: 10, font: fontBold, color: white,
  });

  // ---- Reference & Date ----
  const refId = document.getElementById('referenceId')?.textContent || '—';
  const dateStr = document.getElementById('successSubmittedOn')?.textContent || '—';

  page.drawText(`Ref: ${refId}`, {
    x: width - 200, y: height - 42,
    size: 8, font: fontBold, color: white,
  });

  page.drawText(`Date: ${dateStr}`, {
    x: width - 200, y: height - 57,
    size: 8, font: fontRegular, color: rgb(0.74, 0.85, 0.99),
  });

  // ---- STATUS BADGE ----
  page.drawRectangle({ x: width - 200, y: height - 82, width: 145, height: 18, color: rgb(0.98, 0.75, 0.14) });
  page.drawText('PENDING REVIEW', {
    x: width - 196, y: height - 78,
    size: 8, font: fontBold, color: dark,
  });

  // ---- LOGO (if present) ----
  let yPos = height - 110;

  if (logoDataURL) {
    try {
      let img;
      if (logoDataURL.startsWith('data:image/png')) {
        const pngData = logoDataURL.split(',')[1];
        img = await pdfDoc.embedPng(Uint8Array.from(atob(pngData), c => c.charCodeAt(0)));
      } else if (logoDataURL.startsWith('data:image/jpeg')) {
        const jpgData = logoDataURL.split(',')[1];
        img = await pdfDoc.embedJpg(Uint8Array.from(atob(jpgData), c => c.charCodeAt(0)));
      }
      if (img) {
        const dims = img.scale(0.25);
        page.drawImage(img, {
          x: width - 40 - dims.width,
          y: yPos - dims.height + 20,
          width: dims.width,
          height: dims.height,
        });
      }
    } catch (e) {
      console.warn('Logo embedding failed:', e);
    }
  }

  // ---- SECTION HELPER ----
  function drawSection(title, fields, startY) {
    // Section header
    page.drawRectangle({ x: 40, y: startY - 2, width: width - 80, height: 1, color: rgb(0.9, 0.93, 0.98) });

    page.drawText(title.toUpperCase(), {
      x: 40, y: startY + 6,
      size: 7.5, font: fontBold, color: blue,
    });

    let y = startY - 18;
    const colW = (width - 80) / 2;

    fields.forEach((field, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x   = 40 + col * colW;
      const fy  = y - row * 30;

      page.drawText(field.label + ':', {
        x, y: fy,
        size: 7, font: fontBold, color: muted,
      });

      page.drawText(String(field.value || '—').substring(0, 55), {
        x, y: fy - 11,
        size: 9, font: fontRegular, color: dark,
      });
    });

    const rows = Math.ceil(fields.length / 2);
    return y - rows * 30 - 20;
  }

  // ---- INSTITUTION IDENTITY ----
  yPos = drawSection('1. Institution Identity', [
    { label: 'Institution Name',    value: getVal('institutionName') },
    { label: 'Type',                value: getVal('institutionType') },
    { label: 'Category',            value: getVal('institutionCategory') },
    { label: 'Code',                value: getVal('institutionCode') },
    { label: 'Established',         value: getVal('establishmentYear') },
    { label: 'University/Board',    value: getVal('universityAffiliation') },
  ], yPos);

  // ---- CONTACT ----
  yPos = drawSection('2. Contact & Strength', [
    { label: 'Principal/Director',  value: getVal('principalName') },
    { label: 'Official Email',      value: getVal('email') },
    { label: 'Mobile',              value: getVal('mobile') },
    { label: 'Website',             value: getVal('website') },
    { label: 'Student Strength',    value: getVal('studentStrength') },
    { label: 'Faculty Strength',    value: getVal('facultyStrength') },
    { label: 'Institution Size',    value: getVal('institutionSize') },
    { label: 'Academic Session',    value: getVal('academicSession') },
  ], yPos);

  // ---- MODULES ----
  const mods = [...document.querySelectorAll('input[name="modules"]:checked')]
    .map(cb => cb.nextElementSibling?.textContent?.trim() || cb.value)
    .join(', ') || '—';

  yPos = drawSection('3. Modules & Referral', [
    { label: 'Selected Modules',    value: mods },
    { label: 'Referral Source',     value: getVal('referralSource') },
  ], yPos);

  // ---- LOCATION ----
  yPos = drawSection('4. Location', [
    { label: 'City',                value: getVal('city') },
    { label: 'State',               value: getVal('state') },
    { label: 'Country',             value: getVal('country') },
    { label: 'Address',             value: getVal('address').substring(0, 40) },
  ], yPos);

  // ---- COMPLIANCE ----
  yPos = drawSection('5. Compliance & Recognition', [
    { label: 'Accreditation',       value: getVal('accreditation') },
    { label: 'GST Number',          value: getVal('gstNumber') },
    { label: 'PAN Number',          value: getVal('panNumber') },
  ], yPos);

  // ---- WATERMARK ----
  page.drawText('CAMPUSONE OFFICIAL DOCUMENT', {
    x: 90, y: height / 2 - 60,
    size: 38, font: fontBold,
    color: rgb(0.95, 0.96, 0.98),
    rotate: degrees(35),
    opacity: 0.22,
  });

  // ---- FOOTER ----
  page.drawRectangle({ x: 0, y: 0, width, height: 40, color: dark });

  page.drawText('This document is a digital receipt of your registration request with CampusOne.', {
    x: 40, y: 24, size: 7.5, font: fontRegular, color: muted,
  });
  page.drawText(`Reference ID: ${refId}  •  campusone.app`, {
    x: 40, y: 12, size: 7, font: fontBold, color: rgb(0.6, 0.7, 0.85),
  });

  // Save and download
  const pdfBytes = await pdfDoc.save();
  const blob     = new Blob([pdfBytes], { type: 'application/pdf' });
  const url      = URL.createObjectURL(blob);
  const a        = document.createElement('a');
  a.href         = url;
  a.download     = `CampusOne_Registration_${refId}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

function initPDFDownload() {
  const btn = document.getElementById('downloadPdfBtn');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    const original = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span style="opacity:.7">Generating PDF…</span>`;
    try {
      await buildAndDownloadPDF();
    } catch (err) {
      console.error('PDF error:', err);
      alert('Could not generate PDF. Please try again.');
    } finally {
      btn.disabled = false;
      btn.innerHTML = original;
    }
  });
}

/* ----------------------------------------------------------
   TRACKING FORM
   ---------------------------------------------------------- */

function initTrackingForm() {
  const form   = document.getElementById('trackRequestForm');
  const result = document.getElementById('trackResult');
  const btn    = document.getElementById('trackSubmitBtn');

  if (!form) return;

  form.addEventListener('submit', async e => {
    e.preventDefault();

    const refId = document.getElementById('trackReferenceId')?.value?.trim();
    const email = document.getElementById('trackEmail')?.value?.trim();

    // Clear errors
    document.querySelector('[data-error-for="trackReferenceId"]').textContent = '';
    document.querySelector('[data-error-for="trackEmail"]').textContent = '';

    let hasErr = false;

    if (!refId) {
      document.querySelector('[data-error-for="trackReferenceId"]').textContent = 'Reference ID is required.';
      hasErr = true;
    }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      document.querySelector('[data-error-for="trackEmail"]').textContent = 'Enter a valid email address.';
      hasErr = true;
    }

    if (hasErr) return;

    btn.disabled = true;
    btn.textContent = 'Checking…';

    await new Promise(r => setTimeout(r, 800));

    // Lookup from sessionStorage (mock; replace with Firestore query)
    const stored = sessionStorage.getItem(`campusone_req_${refId}`);
    let html;

    if (stored) {
      const data = JSON.parse(stored);
      if (data.email.toLowerCase() !== email.toLowerCase()) {
        html = `<div class="track-result-card track-result-error">
          <span class="track-result-icon">✕</span>
          <div>
            <strong>Email mismatch</strong>
            <p>The email address you entered doesn't match the one used during registration.</p>
          </div>
        </div>`;
      } else {
        html = `<div class="track-result-card track-result-found">
          <span class="track-result-icon">✓</span>
          <div>
            <strong>${data.institutionName}</strong>
            <p>Status: <span class="status-badge status-pending">Pending Review</span></p>
            <p class="track-meta">Submitted on ${data.submittedOn} &nbsp;|&nbsp; Ref: ${data.refId}</p>
          </div>
        </div>`;
      }
    } else {
      html = `<div class="track-result-card track-result-notfound">
        <span class="track-result-icon">?</span>
        <div>
          <strong>No application found</strong>
          <p>We couldn't find an application with the provided Reference ID. Please double-check and try again.</p>
        </div>
      </div>`;
    }

    result.innerHTML = html;
    result.hidden = false;
    result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    btn.disabled = false;
    btn.textContent = 'Check Status';
  });
}

/* ----------------------------------------------------------
   STAR PARTICLES — DYNAMIC GENERATION
   ---------------------------------------------------------- */

function initParticles() {
  const field = document.querySelector('.particle-field');
  if (!field) return;

  // Clear existing static particles, add dynamic ones
  field.innerHTML = '';

  for (let i = 0; i < 60; i++) {
    const star = document.createElement('div');
    star.className = 'star-particle';

    const size  = Math.random() * 2.5 + 0.5;
    const x     = Math.random() * 100;
    const y     = Math.random() * 100;
    const delay = Math.random() * 8;
    const dur   = Math.random() * 6 + 4;
    const op    = Math.random() * 0.7 + 0.1;

    star.style.cssText = `
      width:${size}px;
      height:${size}px;
      left:${x}%;
      top:${y}%;
      opacity:${op};
      animation-delay:${delay}s;
      animation-duration:${dur}s;
    `;
    field.appendChild(star);
  }
}

/* ----------------------------------------------------------
   SCROLL REVEAL (Intersection Observer)
   ---------------------------------------------------------- */

function initScrollReveal() {
  const targets = document.querySelectorAll(
    '.how-step-card, .trust-card, .stat-card, .benefit-item, .footer-cta-card'
  );

  if (!targets.length) return;

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.opacity = '1';
        entry.target.style.transform = 'translateY(0)';
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

  targets.forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(28px)';
    el.style.transition = 'opacity 0.55s ease, transform 0.55s ease';
    observer.observe(el);
  });
}

/* ----------------------------------------------------------
   COUNTER ANIMATION (HERO STATS)
   ---------------------------------------------------------- */

function animateCounter(el, target, suffix = '') {
  const duration = 1800;
  const start    = performance.now();

  function update(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const eased  = 1 - Math.pow(1 - progress, 3);
    const value  = Math.round(eased * target);
    el.textContent = value.toLocaleString('en') + suffix;
    if (progress < 1) requestAnimationFrame(update);
  }

  requestAnimationFrame(update);
}

function initStatCounters() {
  // Only for numeric stat cards (skip text ones)
  const statCards = document.querySelectorAll('.stat-card');
  if (!statCards.length) return;

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const h3 = entry.target.querySelector('h3');
      if (!h3) return;

      const text = h3.textContent;
      if (text.includes('99.9')) {
        animateCounter(h3, 99, '.9%');
      }
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.5 });

  statCards.forEach(card => observer.observe(card));
}

/* ----------------------------------------------------------
   HERO TYPING BADGE EFFECT (subtle)
   ---------------------------------------------------------- */

function initHeroBadgePulse() {
  const badge = document.querySelector('.hero-badge');
  if (!badge) return;

  setInterval(() => {
    badge.style.boxShadow = '0 0 0 0 rgba(96,165,250,0.4)';
    badge.animate([
      { boxShadow: '0 0 0 0 rgba(96,165,250,0.4)' },
      { boxShadow: '0 0 0 10px rgba(96,165,250,0)' },
    ], { duration: 1200, easing: 'ease-out' });
  }, 3500);
}

/* ----------------------------------------------------------
   SMOOTH ANCHOR SCROLL
   ---------------------------------------------------------- */

function initAnchorScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      const id = a.getAttribute('href').slice(1);
      const target = document.getElementById(id);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });
}

/* ----------------------------------------------------------
   SHAKE ANIMATION CSS INJECTION
   ---------------------------------------------------------- */

function injectExtraStyles() {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes shake {
      0%,100%{ transform: translateX(0); }
      20%    { transform: translateX(-6px); }
      40%    { transform: translateX(6px); }
      60%    { transform: translateX(-4px); }
      80%    { transform: translateX(4px); }
    }
    .shake { animation: shake .4s ease; }

    /* Track Result Cards */
    .track-result-card {
      display: flex;
      align-items: flex-start;
      gap: 14px;
      padding: 18px 20px;
      border-radius: 16px;
      border: 1px solid rgba(255,255,255,0.08);
      background: rgba(255,255,255,0.04);
      margin-top: 6px;
    }
    .track-result-found  { border-color: rgba(52,211,153,0.3); background: rgba(52,211,153,0.06); }
    .track-result-error  { border-color: rgba(248,113,113,0.3); background: rgba(248,113,113,0.06); }
    .track-result-notfound { border-color: rgba(251,191,36,0.3); background: rgba(251,191,36,0.06); }

    .track-result-icon {
      width: 32px; height: 32px;
      border-radius: 50%;
      flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      font-size: 14px; font-weight: 700;
      background: rgba(255,255,255,0.08);
    }
    .track-result-found .track-result-icon  { background: rgba(52,211,153,0.15); color: #34D399; }
    .track-result-error .track-result-icon  { background: rgba(248,113,113,0.15); color: #F87171; }
    .track-result-notfound .track-result-icon { background: rgba(251,191,36,0.15); color: #FBBF24; }

    .track-result-card strong { display:block; font-size:.95rem; margin-bottom:5px; }
    .track-result-card p { font-size:.83rem; color:var(--text-muted); line-height:1.6; margin:0; }
    .track-meta { margin-top:6px !important; }

    .status-badge { display:inline-block; padding:2px 10px; border-radius:999px;
      font-size:.76rem; font-weight:700; }
    .status-pending { background:rgba(251,191,36,.12); color:#FBBF24;
      border:1px solid rgba(251,191,36,.3); }

    /* Mobile drawer transition */
    .mobile-drawer { transition: transform .35s cubic-bezier(.4,0,.2,1); }
    .drawer-overlay { transition: opacity .3s ease; opacity: 0; pointer-events: none; }
    .drawer-overlay.active { opacity: 1; pointer-events: auto; }
  `;
  document.head.appendChild(style);
}

/* ----------------------------------------------------------
   PROGRESS BAR CONNECTOR ANIMATION
   ---------------------------------------------------------- */

function updateProgressConnectors() {
  // Update aria labels on progress steps
  document.querySelectorAll('.progress-step').forEach(step => {
    const s = parseInt(step.dataset.step, 10);
    const label = step.querySelector('.progress-label')?.textContent || '';
    let state = 'upcoming';
    if (step.classList.contains('is-active')) state = 'current';
    if (step.classList.contains('is-complete')) state = 'completed';
    step.setAttribute('aria-label', `Step ${s}: ${label} — ${state}`);
  });
}

/* ----------------------------------------------------------
   INIT
   ---------------------------------------------------------- */

document.addEventListener("DOMContentLoaded", () => {

  try {
    injectExtraStyles();
    console.log("1");

    initTheme();
    console.log("2");

    initDrawer();
    console.log("3");

    initHeaderScroll();
    console.log("4");

    initMultiStepForm();
    console.log("5");

    initFileDrop();
    console.log("6");

    initCopyBtn();
    console.log("7");

    initPDFDownload();
    console.log("8");

    initTrackingForm();
    console.log("9");

    initParticles();
    console.log("10");

    initScrollReveal();
    console.log("11");

    initStatCounters();
    console.log("12");

    initHeroBadgePulse();
    console.log("13");

    initAnchorScroll();
    console.log("14");

    updateProgressConnectors();
    console.log("15");

  } catch (e) {
    console.error(e);
  }

});

// Ensure step 1 is active on load (HTML already has is-active, this is a safety net)
const firstFieldset = document.querySelector('.form-step[data-step="1"]');
const firstDot = document.querySelector('.progress-step[data-step="1"]');

if (firstFieldset && !firstFieldset.classList.contains('is-active')) {
  firstFieldset.classList.add('is-active');
}

if (firstDot && !firstDot.classList.contains('is-active')) {
  firstDot.classList.add('is-active');
}