/**
 * ==========================================================
 * CampusOne Enterprise Storage Service
 * Version : 1.0.0
 * ==========================================================
 * Storage Provider Abstraction Layer
 *
 * Current Provider:
 * Images  → Cloudinary
 * Documents → Supabase Storage
 *
 * Future:
 * Firebase Storage
 * AWS S3
 * Azure Blob
 * ==========================================================
 */

/* ==========================================================
   Upload Institution Logo
========================================================== */

export async function uploadInstitutionLogo(file) {

  throw new Error(
    "Cloudinary integration not configured."
  );

}

/* ==========================================================
   Upload Profile Photo
========================================================== */

export async function uploadProfilePhoto(file) {

  throw new Error(
    "Cloudinary integration not configured."
  );

}

/* ==========================================================
   Upload Document
========================================================== */

export async function uploadDocument(file) {

  throw new Error(
    "Supabase Storage integration not configured."
  );

}

/* ==========================================================
   Delete File
========================================================== */

export async function deleteFile(fileId) {

  throw new Error(
    "Storage provider not configured."
  );

}

/* ==========================================================
   Get File URL
========================================================== */

export async function getFileUrl(fileId) {

  throw new Error(
    "Storage provider not configured."
  );

}
