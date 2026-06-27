/**
 * ==========================================================
 * CampusOne Enterprise Helpers
 * Version : 1.0.0
 * ==========================================================
 * Common reusable utility functions.
 * ==========================================================
 */

/* ==========================================================
   Generate Random Reference ID
========================================================== */

export function generateReferenceId(prefix = "CO") {

  const timestamp = Date.now().toString().slice(-6);

  const random = Math.random()
    .toString(36)
    .substring(2, 6)
    .toUpperCase();

  return `${prefix}-${timestamp}-${random}`;

}

/* ==========================================================
   Generate Tenant Slug
========================================================== */

export function generateTenantSlug(name = "") {

  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

}

/* ==========================================================
   Generate Institution Code
========================================================== */

export function generateInstitutionCode(name = "") {

  const letters = name
    .replace(/[^A-Za-z]/g, "")
    .substring(0, 4)
    .toUpperCase();

  const random = Math.floor(
    1000 + Math.random() * 9000
  );

  return `${letters}${random}`;

}

/* ==========================================================
   Current Timestamp
========================================================== */

export function now() {

  return new Date().toISOString();

}

/* ==========================================================
   Format Date
========================================================== */

export function formatDate(date) {

  return new Intl.DateTimeFormat(
    "en-IN",
    {
      day: "2-digit",
      month: "short",
      year: "numeric"
    }
  ).format(new Date(date));

}

/* ==========================================================
   Format Date & Time
========================================================== */

export function formatDateTime(date) {

  return new Intl.DateTimeFormat(
    "en-IN",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }
  ).format(new Date(date));

}

/* ==========================================================
   Copy To Clipboard
========================================================== */

export async function copyToClipboard(text) {

  try {

    await navigator.clipboard.writeText(text);

    return true;

  } catch {

    return false;

  }

}

/* ==========================================================
   Debounce
========================================================== */

export function debounce(callback, delay = 300) {

  let timer;

  return (...args) => {

    clearTimeout(timer);

    timer = setTimeout(() => {

      callback(...args);

    }, delay);

  };

}

/* ==========================================================
   Capitalize Text
========================================================== */

export function capitalize(text = "") {

  return text.charAt(0).toUpperCase() +
         text.slice(1);

}

/* ==========================================================
   Generate UUID
========================================================== */

export function generateUUID() {

  return crypto.randomUUID();

}

/* ==========================================================
   Sleep
========================================================== */

export function sleep(ms = 500) {

  return new Promise(resolve => {

    setTimeout(resolve, ms);

  });

}

/* ==========================================================
   Is Empty
========================================================== */

export function isEmpty(value) {

  return (
    value === null ||
    value === undefined ||
    value === ""
  );

}
