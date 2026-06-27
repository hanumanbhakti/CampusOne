/* ==========================================================
   CAMPUSONE — REGISTER INSTITUTION
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

    // Proper dark mode detection — handles system/light/dark + OS preference
    const themeAttr = document.documentElement.getAttribute('data-theme');
    let isDark;
    if (themeAttr === 'dark') {
      isDark = true;
    } else if (themeAttr === 'light') {
      isDark = false;
    } else {
      // 'system' or unset — check actual OS preference
      isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    }

    // Always use high-contrast fixed colors — never rely on theme alone
    // Dark mode: white modules on dark bg
    // Light mode: dark modules on white bg
    await QRCode.toCanvas(canvas, text, {
      width: 112,
      margin: 2,
      color: {
        dark:  isDark ? '#E2E8F0' : '#0F172A',  // QR modules (the squares)
        light: isDark ? '#0F172A' : '#FFFFFF',   // QR background
      },
    });

    // Style the canvas element
    canvas.style.borderRadius = '10px';
    canvas.style.display = 'block';
    if (isDark) {
      canvas.style.background = '#0F172A';
      canvas.style.border = '2px solid rgba(255,255,255,0.1)';
    } else {
      canvas.style.background = '#FFFFFF';
      canvas.style.border = '2px solid rgba(0,0,0,0.08)';
    }

  } catch (err) {
    console.warn('QR generation failed:', err);
    // Canvas fallback — draw a visible placeholder
    const size = 112;
    canvas.width  = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#1E293B';
      ctx.fillRect(0, 0, size, size);
      ctx.strokeStyle = '#3B82F6';
      ctx.strokeRect(4, 4, size - 8, size - 8);
      ctx.fillStyle = '#60A5FA';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Track via', size / 2, size / 2 - 6);
      ctx.fillText('tracking link', size / 2, size / 2 + 8);
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

  // Simulate a short network delay (replace with Firebase call)
  await new Promise(r => setTimeout(r, 1200));

  // --- Firebase Firestore integration placeholder ---
  // import { db } from '../../firebase.js';
  // import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
  //
  // const payload = buildPayload(refId);
  // await addDoc(collection(db, 'institutionRequests'), payload);

  const refId       = generateRefId();
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
  // ---- Wait for pdf-lib CDN load ----
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

  // ---- SETUP ----
  const pdfDoc = await PDFDocument.create();
  const page   = pdfDoc.addPage([595.28, 841.89]); // A4
  const { width, height } = page.getSize();
  const MARGIN = 40;
  const COL_W  = (width - MARGIN * 2) / 2;

  const fontBold    = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // ---- COLOR PALETTE ----
  const cBlue      = rgb(0.149, 0.392, 0.922);   // #2563EB
  const cBlueDark  = rgb(0.094, 0.259, 0.682);   // darker blue
  const cBlueMid   = rgb(0.224, 0.478, 0.965);   // mid blue accent
  const cDark      = rgb(0.059, 0.090, 0.165);   // #0F172A
  const cMuted     = rgb(0.396, 0.455, 0.573);   // #657591
  const cWhite     = rgb(1, 1, 1);
  const cGray      = rgb(0.945, 0.953, 0.965);   // light gray bg
  const cGrayLine  = rgb(0.878, 0.898, 0.925);   // divider color
  const cYellow    = rgb(0.996, 0.847, 0.094);   // status badge
  const cYellowDk  = rgb(0.451, 0.318, 0);       // status text

  // ---- HELPER: capitalize ----
  const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : '—';
  const safeStr = s => (s && s.trim()) ? s.trim() : '—';

  // ---- HELPER: wrap long text into multiple lines ----
  function wrapText(text, maxChars) {
    if (!text || text === '—') return ['—'];
    const words = text.split(' ');
    const lines = [];
    let line = '';
    for (const word of words) {
      if ((line + ' ' + word).trim().length > maxChars) {
        if (line) lines.push(line.trim());
        line = word;
      } else {
        line = (line + ' ' + word).trim();
      }
    }
    if (line) lines.push(line.trim());
    return lines;
  }

  // ---- COLLECT DATA ----
  const refId    = document.getElementById('referenceId')?.textContent?.trim() || '—';
  const dateStr  = document.getElementById('successSubmittedOn')?.textContent?.trim() || '—';
  const genTime  = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  const instName = safeStr(getVal('institutionName'));

  const mods = [...document.querySelectorAll('input[name="modules"]:checked')]
    .map(cb => cb.nextElementSibling?.textContent?.trim() || cb.value);
  const modsText = mods.length ? mods.join(', ') : '—';

  // ================================================================
  // HEADER BAND (full width blue)
  // ================================================================
  const HEADER_H = 100;
  page.drawRectangle({ x: 0, y: height - HEADER_H, width, height: HEADER_H, color: cBlue });

  // Subtle darker strip at bottom of header
  page.drawRectangle({ x: 0, y: height - HEADER_H, width, height: 4, color: cBlueDark });

  // Brand name
  page.drawText('CampusOne', {
    x: MARGIN, y: height - 38,
    size: 26, font: fontBold, color: cWhite,
  });

  // Tagline
  page.drawText('Enterprise Education Platform', {
    x: MARGIN, y: height - 58,
    size: 9, font: fontRegular, color: rgb(0.74, 0.85, 0.99),
  });

  // Doc title
  page.drawText('INSTITUTION REGISTRATION APPLICATION', {
    x: MARGIN, y: height - 82,
    size: 9, font: fontBold, color: rgb(0.85, 0.92, 1.0),
  });

  // Right side — Ref ID box
  const refBoxX = width - 190;
  page.drawText('REF ID', {
    x: refBoxX, y: height - 28,
    size: 6.5, font: fontBold, color: rgb(0.74, 0.85, 0.99),
  });
  page.drawText(refId, {
    x: refBoxX, y: height - 43,
    size: 7.5, font: fontBold, color: cWhite,
  });
  page.drawText('DATE', {
    x: refBoxX, y: height - 60,
    size: 6.5, font: fontBold, color: rgb(0.74, 0.85, 0.99),
  });
  page.drawText(dateStr, {
    x: refBoxX, y: height - 73,
    size: 8, font: fontRegular, color: cWhite,
  });

  // Status badge — yellow pill shape
  page.drawRectangle({
    x: refBoxX, y: height - 95, width: 130, height: 18,
    color: cYellow, borderRadius: 3,
  });
  page.drawText('PENDING REVIEW', {
    x: refBoxX + 10, y: height - 91,
    size: 8, font: fontBold, color: cYellowDk,
  });

  // ================================================================
  // INSTITUTION NAME BANNER (below header)
  // ================================================================
  page.drawRectangle({ x: 0, y: height - HEADER_H - 36, width, height: 36, color: cGray });
  page.drawText(instName.substring(0, 60), {
    x: MARGIN, y: height - HEADER_H - 22,
    size: 13, font: fontBold, color: cDark,
  });
  page.drawText('Registered Institution', {
    x: width - 140, y: height - HEADER_H - 22,
    size: 8, font: fontRegular, color: cMuted,
  });

  // ================================================================
  // SECTION DRAWING ENGINE
  // ================================================================
  let curY = height - HEADER_H - 36 - 20; // start below banner

  // Draw a section with proper label+value rows, wrapping, alternating bg
  function drawSection(sectionNum, sectionTitle, fields) {
    const LABEL_SIZE  = 6.5;
    const VALUE_SIZE  = 9;
    const ROW_H       = 28;
    const SECTION_PAD = 8;

    // Section header bar
    page.drawRectangle({
      x: 0, y: curY - 22, width, height: 22, color: rgb(0.235, 0.451, 0.918),
    });
    page.drawText(`${sectionNum}. ${sectionTitle.toUpperCase()}`, {
      x: MARGIN, y: curY - 15,
      size: 8, font: fontBold, color: cWhite,
    });
    curY -= 22;

    // Pair fields into rows of 2 columns
    const rows = [];
    for (let i = 0; i < fields.length; i += 2) {
      rows.push([fields[i], fields[i + 1] || null]);
    }

    rows.forEach((pair, rowIdx) => {
      const rowBg = rowIdx % 2 === 0 ? rgb(1,1,1) : rgb(0.976, 0.980, 0.988);
      const rowY  = curY - ROW_H;

      // Row background
      page.drawRectangle({ x: MARGIN - 4, y: rowY, width: width - (MARGIN - 4) * 2, height: ROW_H, color: rowBg });

      // Left cell
      const left = pair[0];
      const leftLines = wrapText(safeStr(left.value), 32);
      page.drawText(left.label.toUpperCase(), {
        x: MARGIN, y: curY - 10,
        size: LABEL_SIZE, font: fontBold, color: cMuted,
      });
      page.drawText(leftLines[0], {
        x: MARGIN, y: curY - 21,
        size: VALUE_SIZE, font: fontBold, color: cDark,
      });
      if (leftLines[1]) {
        page.drawText(leftLines[1], {
          x: MARGIN, y: curY - 32,
          size: VALUE_SIZE, font: fontBold, color: cDark,
        });
      }

      // Right cell (if exists)
      if (pair[1]) {
        const right = pair[1];
        const rightLines = wrapText(safeStr(right.value), 32);
        page.drawText(right.label.toUpperCase(), {
          x: MARGIN + COL_W, y: curY - 10,
          size: LABEL_SIZE, font: fontBold, color: cMuted,
        });
        page.drawText(rightLines[0], {
          x: MARGIN + COL_W, y: curY - 21,
          size: VALUE_SIZE, font: fontBold, color: cDark,
        });
        if (rightLines[1]) {
          page.drawText(rightLines[1], {
            x: MARGIN + COL_W, y: curY - 32,
            size: VALUE_SIZE, font: fontBold, color: cDark,
          });
        }
      }

      // Bottom divider
      page.drawLine({
        start: { x: MARGIN - 4, y: rowY },
        end:   { x: width - MARGIN + 4, y: rowY },
        thickness: 0.5, color: cGrayLine,
      });

      curY -= ROW_H;
    });

    curY -= SECTION_PAD; // gap after section
  }

  // ================================================================
  // SECTION 1 — INSTITUTION IDENTITY
  // ================================================================
  drawSection(1, 'Institution Identity', [
    { label: 'Institution Name',       value: safeStr(getVal('institutionName')) },
    { label: 'Establishment Year',     value: safeStr(getVal('establishmentYear')) },
    { label: 'Institution Type',       value: cap(getVal('institutionType')) },
    { label: 'Institution Category',   value: cap(getVal('institutionCategory')) },
    { label: 'Institution Code',       value: safeStr(getVal('institutionCode')) },
    { label: 'University / Board',     value: safeStr(getVal('universityAffiliation')) },
  ]);

  // ================================================================
  // SECTION 2 — CONTACT & STRENGTH
  // ================================================================
  drawSection(2, 'Contact & Strength', [
    { label: 'Principal / Director',   value: safeStr(getVal('principalName')) },
    { label: 'Official Email',         value: safeStr(getVal('email')) },
    { label: 'Official Mobile',        value: safeStr(getVal('mobile')) },
    { label: 'Website',                value: safeStr(getVal('website')) },
    { label: 'Student Strength',       value: safeStr(getVal('studentStrength')) },
    { label: 'Faculty Strength',       value: safeStr(getVal('facultyStrength')) },
    { label: 'Institution Size',       value: safeStr(getVal('institutionSize')) },
    { label: 'Academic Session',       value: safeStr(getVal('academicSession')) },
  ]);

  // ================================================================
  // SECTION 3 — MODULES & REFERRAL
  // ================================================================
  // Modules as full-width row (can be long)
  const SECTION3_HEADER_H = 22;
  page.drawRectangle({ x: 0, y: curY - SECTION3_HEADER_H, width, height: SECTION3_HEADER_H, color: rgb(0.235, 0.451, 0.918) });
  page.drawText('3. MODULES & REFERRAL', {
    x: MARGIN, y: curY - 15, size: 8, font: fontBold, color: cWhite,
  });
  curY -= SECTION3_HEADER_H;

  // Modules full-width row
  const modLines = wrapText(modsText, 90);
  const modRowH  = 14 + modLines.length * 12;
  page.drawRectangle({ x: MARGIN - 4, y: curY - modRowH, width: width - (MARGIN-4)*2, height: modRowH, color: cWhite });
  page.drawText('SELECTED MODULES', { x: MARGIN, y: curY - 10, size: 6.5, font: fontBold, color: cMuted });
  modLines.forEach((line, i) => {
    page.drawText(line, { x: MARGIN, y: curY - 21 - i * 12, size: 9, font: fontBold, color: cDark });
  });
  page.drawLine({ start: { x: MARGIN-4, y: curY - modRowH }, end: { x: width-MARGIN+4, y: curY - modRowH }, thickness: 0.5, color: cGrayLine });
  curY -= modRowH;

  // Referral source row
  page.drawRectangle({ x: MARGIN-4, y: curY - 28, width: width-(MARGIN-4)*2, height: 28, color: rgb(0.976, 0.980, 0.988) });
  page.drawText('REFERRAL SOURCE', { x: MARGIN, y: curY - 10, size: 6.5, font: fontBold, color: cMuted });
  page.drawText(cap(getVal('referralSource')), { x: MARGIN, y: curY - 21, size: 9, font: fontBold, color: cDark });
  curY -= 28 + 8;

  // ================================================================
  // SECTION 4 — LOCATION
  // ================================================================
  const addrLines = wrapText(safeStr(getVal('address')), 80);
  drawSection(4, 'Location', [
    { label: 'City',    value: safeStr(getVal('city')) },
    { label: 'State',   value: safeStr(getVal('state')) },
    { label: 'Country', value: safeStr(getVal('country')) },
    { label: 'Address', value: addrLines.join(' ') },
  ]);

  // ================================================================
  // SECTION 5 — COMPLIANCE & RECOGNITION
  // ================================================================
  drawSection(5, 'Compliance & Recognition', [
    { label: 'Accreditation / Recognition', value: safeStr(getVal('accreditation')) },
    { label: 'GST Number',                  value: safeStr(getVal('gstNumber')) },
    { label: 'PAN Number',                  value: safeStr(getVal('panNumber')) },
    { label: 'Consent',                     value: 'Accepted — Terms & Privacy Policy' },
  ]);

  // ================================================================
  // WATERMARK — diagonal, centered, very light
  // ================================================================
  page.drawText('CAMPUSONE OFFICIAL DOCUMENT', {
    x: 75, y: height / 2 - 80,
    size: 40, font: fontBold,
    color: rgb(0.878, 0.898, 0.925),
    rotate: degrees(38),
    opacity: 0.18,
  });

  // ================================================================
  // FOOTER BAR
  // ================================================================
  const FOOTER_H = 44;
  page.drawRectangle({ x: 0, y: 0, width, height: FOOTER_H, color: cDark });

  // Left: disclaimer
  page.drawText('This document is an official digital receipt of your CampusOne registration request.', {
    x: MARGIN, y: 28, size: 6.5, font: fontRegular, color: rgb(0.6, 0.65, 0.75),
  });
  page.drawText(`Ref: ${refId}   |   Generated: ${dateStr} at ${genTime}   |   campusone.app`, {
    x: MARGIN, y: 14, size: 6.5, font: fontBold, color: rgb(0.55, 0.65, 0.85),
  });

  // Right: Page 1 of 1
  page.drawText('Page 1 of 1', {
    x: width - 80, y: 19,
    size: 7, font: fontRegular, color: rgb(0.5, 0.55, 0.65),
  });

  // ================================================================
  // SAVE & DOWNLOAD
  // ================================================================
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

document.addEventListener('DOMContentLoaded', () => {
  injectExtraStyles();
  initTheme();
  initDrawer();
  initHeaderScroll();
  initMultiStepForm();
  initFileDrop();
  initCopyBtn();
  initPDFDownload();
  initTrackingForm();
  initParticles();
  initScrollReveal();
  initStatCounters();
  initHeroBadgePulse();
  initAnchorScroll();
  updateProgressConnectors();

  // Ensure step 1 is active on load (HTML already has is-active, this is a safety net)
  const firstFieldset = document.querySelector('.form-step[data-step="1"]');
  const firstDot      = document.querySelector('.progress-step[data-step="1"]');
  if (firstFieldset && !firstFieldset.classList.contains('is-active')) {
    firstFieldset.classList.add('is-active');
  }
  if (firstDot && !firstDot.classList.contains('is-active')) {
    firstDot.classList.add('is-active');
  }
});
