/**
 * ==========================================================
 * CampusOne Enterprise Authentication Service
 * Version : 1.0.0
 * ==========================================================
 * Authentication Layer
 * Firebase Authentication Wrapper
 * ==========================================================
 */

import {
  auth,
  waitForAuthReady
} from "./firebase-config.js";

import {

  signInWithEmailAndPassword,

  signOut,

  sendPasswordResetEmail,

  onAuthStateChanged

} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";

/* ==========================================================
   Login
========================================================== */

export async function login(email, password) {

  return signInWithEmailAndPassword(

    auth,

    email,

    password

  );

}

/* ==========================================================
   Logout
========================================================== */

export async function logout() {

  return signOut(auth);

}

/* ==========================================================
   Reset Password
========================================================== */

export async function resetPassword(email) {

  return sendPasswordResetEmail(

    auth,

    email

  );

}

/* ==========================================================
   Current User
========================================================== */

export function currentUser() {

  return auth.currentUser;

}

/* ==========================================================
   Wait Until Auth Ready
========================================================== */

export async function initializeAuth() {

  return waitForAuthReady();

}

/* ==========================================================
   Auth State Listener
========================================================== */

export function onUserChanged(callback) {

  return onAuthStateChanged(

    auth,

    callback

  );

}

/* ==========================================================
   Current User Role
========================================================== */

export async function currentRole() {

  /**
   * Phase 2
   * Read role from Firestore users collection
   */

  return null;

}

/* ==========================================================
   Permission Helpers
========================================================== */

export async function isSuperAdmin() {

  return (await currentRole()) === "super_admin";

}

export async function isInstitutionAdmin() {

  return (await currentRole()) === "institution_admin";

}

export async function isTeacher() {

  return (await currentRole()) === "teacher";

}

export async function isStudent() {

  return (await currentRole()) === "student";

}

export async function isParent() {

  return (await currentRole()) === "parent";

}
