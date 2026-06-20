/**
 * CAMPUSONE ENTERPRISE | FIREBASE KERNEL BRIDGE v1.0.0
 * Status: FROZEN & PRODUCTION-READY (100% HARDENED)
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, setPersistence, browserLocalPersistence, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";
import { getAnalytics, isSupported } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-analytics.js";

// 1. SYSTEM CONFIG & METADATA
export const SYSTEM_CONFIG = { appName: "CampusOne", tenantRequired: true };
export const BUILD_INFO = { version: "1.0.0", release: "Production", year: "2026" };

export const DEFAULT_COLLECTIONS = {
    users: "users", students: "students", faculty: "faculty", notices: "notices",
    activity: "activity", institutions: "institutions", roles: "roles", permissions: "permissions"
};

// 2. FIREBASE CONFIG
const firebaseConfig = {
  apiKey: "AIzaSyDEIn2c2kgyMwwwSMyQg3DDZrNLoJF_fGw",
  authDomain: "campusone-bd5c5.firebaseapp.com",
  projectId: "campusone-bd5c5",
  storageBucket: "campusone-bd5c5.firebasestorage.app",
  messagingSenderId: "1056457840584",
  appId: "1:1056457840584:web:313eb137ebd5aedab912fd",
  measurementId: "G-QD0RL1B9EH"
};

// 3. FAIL-FAST VALIDATION
const requiredKeys = ["apiKey", "authDomain", "projectId", "appId"];
const missingKeys = requiredKeys.filter(k => !firebaseConfig[k] || String(firebaseConfig[k]).includes("YOUR_"));

if (missingKeys.length > 0) {
    console.error("Firebase Config Missing:", missingKeys);
    throw new Error("Firebase configuration invalid.");
}

// 4. INITIALIZATION
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// 5. ANALYTICS (Safest Init)
export let analytics = null;
(async () => {
    if (typeof window !== "undefined" && typeof document !== "undefined" && location.protocol === "https:") {
        try {
            if (await isSupported()) {
                analytics = getAnalytics(app);
            }
        } catch (e) { console.warn("Analytics unavailable:", e); }
    }
})();

// 6. PERSISTENCE & AUTH HELPERS
export const persistenceReady = setPersistence(auth, browserLocalPersistence)
    .catch(e => { console.error("Persistence Init Error:", e); return null; });

export const getCurrentTenant = () => localStorage.getItem("campusone_tenant");
export const setCurrentTenant = (code) => localStorage.setItem("campusone_tenant", String(code).trim().toUpperCase());
export const clearCurrentTenant = () => localStorage.removeItem("campusone_tenant");
export const getCurrentUser = () => auth.currentUser;

// 7. HEALTH & TELEMETRY
if (typeof window !== "undefined") {
    window.addEventListener("online", () => console.log("Network Online"));
    window.addEventListener("offline", () => console.warn("Network Offline"));
}

export async function waitForAuthReady() {
    await persistenceReady;
    // Use onAuthStateChanged instead of auth.authStateReady() — the latter isn't
    // available in every SDK version and silently breaks this promise if missing.
    return new Promise((resolve) => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            unsubscribe();
            resolve(user);
        }, (error) => {
            console.error("Auth state listener error:", error);
            unsubscribe();
            resolve(null);
        });
    });
}

export async function firestoreHealthCheck() {
    try {
        const snapshot = await getDoc(doc(db, "_system", "health"));
        return snapshot.exists();
    } catch (e) { console.error("Firestore Health Error:", e); return false; }
}

export async function kernelStatus() {
    const user = await waitForAuthReady();
    return {
        firebase: true,
        firestore: await firestoreHealthCheck(),
        online: navigator.onLine,
        tenant: getCurrentTenant(),
        user: user?.email || null
    };
}

console.log(`${SYSTEM_CONFIG.appName} | ${BUILD_INFO.version}-${BUILD_INFO.release} | Kernel Active`);

