// =========================================================================
// CAMPUSONE — Shared Firebase Configuration
// Fix v2: Added browserLocalPersistence so auth session survives page reload.
// This is why dashboards were redirecting back to login immediately.
// =========================================================================

// Firebase Core
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";

// Authentication
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  browserLocalPersistence,
  setPersistence
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";

// Firestore
import {
  getFirestore
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

// Storage
import {
  getStorage
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyDEIn2c2kgyMwwwSMyQg3DDZrNLoJF_fGw",
  authDomain: "campusone-bd5c5.firebaseapp.com",
  projectId: "campusone-bd5c5",
  storageBucket: "campusone-bd5c5.firebasestorage.app",
  messagingSenderId: "1056457840584",
  appId: "1:1056457840584:web:313eb137ebd5aedab912fd",
  measurementId: "G-QD0RL1B9EH"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Services
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const googleProvider = new GoogleAuthProvider();

// ✅ FIX: Set auth persistence to LOCAL so the session survives page reload.
// Without this, Firebase loses the user on every navigation and dashboards
// see user=null → immediately redirect back to login.
setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.warn("[CampusOne] Could not set auth persistence:", err);
});

/**
 * waitForAuthReady()
 * Waits for Firebase's first auth state check to complete and resolves with
 * the signed-in user (or null). Dashboards call this on load to decide
 * whether to show content or redirect to login.
 */
function waitForAuthReady() {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user);
    });
  });
}

/**
 * getCurrentTenant()
 * Reads the institution code that the login screen stored in localStorage
 * when the campus code was verified.
 */
function getCurrentTenant() {
  return localStorage.getItem("campusone-tenant") || null;
}

//Export 
export {
  firebaseConfig,
  app,
  auth,
  db,
  storage,
  googleProvider,
  waitForAuthReady,
  getCurrentTenant
};
