/**
 * ==========================================================
 * CampusOne Enterprise Validators
 * Version : 1.0.0
 * ==========================================================
 * Reusable validation helpers.
 * ==========================================================
 */

/* ==========================================================
   Required
========================================================== */

export function required(value) {

  return value !== null &&
         value !== undefined &&
         String(value).trim() !== "";

}

/* ==========================================================
   Email
========================================================== */

export function validateEmail(email = "") {

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    email.trim()
  );

}

/* ==========================================================
   Mobile Number
========================================================== */

export function validatePhone(phone = "") {

  return /^[6-9]\d{9}$/.test(
    phone.trim()
  );

}

/* ==========================================================
   Website
========================================================== */

export function validateWebsite(url = "") {

  if (!url.trim()) return true;

  try {

    new URL(url);

    return true;

  } catch {

    return false;

  }

}

/* ==========================================================
   Password
========================================================== */

export function validatePassword(password = "") {

  return /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d).{8,}$/.test(
    password
  );

}

/* ==========================================================
   Institution Name
========================================================== */

export function validateInstitutionName(name = "") {

  return name.trim().length >= 3;

}

/* ==========================================================
   Student Strength
========================================================== */

export function validateStudentStrength(value) {

  const total = Number(value);

  return Number.isInteger(total) && total > 0;

}

/* ==========================================================
   File Size
========================================================== */

export function validateFileSize(file, maxSize) {

  if (!file) return false;

  return file.size <= maxSize;

}

/* ==========================================================
   Image Type
========================================================== */

export function validateImage(file) {

  if (!file) return false;

  return file.type.startsWith("image/");

}

/* ==========================================================
   Required Form Validation
========================================================== */

export function validateRequiredFields(fields = {}) {

  const errors = {};

  Object.entries(fields).forEach(([key, value]) => {

    if (!required(value)) {

      errors[key] = "This field is required.";

    }

  });

  return errors;

}

/* ==========================================================
   Empty Object
========================================================== */

export function hasErrors(errors = {}) {

  return Object.keys(errors).length > 0;

}
