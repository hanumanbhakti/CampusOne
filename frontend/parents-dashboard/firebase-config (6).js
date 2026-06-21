// Firebase Core
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";

// Authentication
import {
  getAuth,
  GoogleAuthProvider
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

// Export
export {
  app,
  auth,
  db,
  storage,
  googleProvider
};
