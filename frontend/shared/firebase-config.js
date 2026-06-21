// Firebase Core
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";

// Authentication
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged
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

/**
 * waitForAuthReady()
 * Firebase's auth state takes a moment to initialize on page load.
 * This waits for that first check to complete and resolves with the
 * signed-in user (or null if nobody is signed in) — so dashboards know
 * for certain whether to show content or redirect to login.
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
 * Fallback tenant/institution code lookup, used when a user's Firestore
 * profile doesn't have a "tenant" field set yet. Reads whatever the
 * login screen stored locally when the institution code was verified.
 *
 * NOTE: adjust the localStorage key below ("campusone-tenant") if your
 * login-screen script.js saves it under a different key name.
 */
function getCurrentTenant() {
  return localStorage.getItem("campusone-tenant") || null;
}

// Export
export {
  app,
  auth,
  db,
  storage,
  googleProvider,
  waitForAuthReady,
  getCurrentTenant
};
