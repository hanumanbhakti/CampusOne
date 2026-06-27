/**
 * ==========================================================
 * CampusOne Enterprise Firestore Service
 * Version : 1.0.0
 * ==========================================================
 * All Firestore operations are centralized here.
 * Never access Firestore directly from UI pages.
 * ==========================================================
 */

import { db } from "./firebase-config.js";

import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

import {
  COLLECTIONS,
  REQUEST_STATUS
} from "./constants.js";

/* ==========================================================
   Submit Institution Request
========================================================== */

export async function submitInstitutionRequest(data) {

  try {

    const payload = {

      ...data,

      status: REQUEST_STATUS.PENDING,

      createdAt: serverTimestamp(),

      updatedAt: serverTimestamp()

    };

    const docRef = await addDoc(

      collection(
        db,
        COLLECTIONS.ACCESS_REQUESTS
      ),

      payload

    );

    return {

      success: true,

      id: docRef.id

    };

  } catch (error) {

    console.error(

      "submitInstitutionRequest",

      error

    );

    throw error;

  }

}

/* ==========================================================
   Get Single Institution Request
========================================================== */

export async function getInstitutionRequest(id) {

  const snapshot = await getDoc(

    doc(
      db,
      COLLECTIONS.ACCESS_REQUESTS,
      id
    )

  );

  if (!snapshot.exists()) {

    return null;

  }

  return {

    id: snapshot.id,

    ...snapshot.data()

  };

}

/* ==========================================================
   Get All Requests
========================================================== */

export async function getAllInstitutionRequests() {

  const q = query(

    collection(
      db,
      COLLECTIONS.ACCESS_REQUESTS
    ),

    orderBy("createdAt", "desc")

  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map(doc => ({

    id: doc.id,

    ...doc.data()

  }));

}

/* ==========================================================
   Get Pending Requests
========================================================== */

export async function getPendingRequests() {

  const q = query(

    collection(
      db,
      COLLECTIONS.ACCESS_REQUESTS
    ),

    where(
      "status",
      "==",
      REQUEST_STATUS.PENDING
    ),

    orderBy("createdAt", "desc")

  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map(doc => ({

    id: doc.id,

    ...doc.data()

  }));

}

/* ==========================================================
   Approve Request
========================================================== */

export async function approveInstitutionRequest(id) {

  return updateDoc(

    doc(
      db,
      COLLECTIONS.ACCESS_REQUESTS,
      id
    ),

    {

      status: REQUEST_STATUS.APPROVED,

      updatedAt: serverTimestamp()

    }

  );

}

/* ==========================================================
   Reject Request
========================================================== */

export async function rejectInstitutionRequest(id) {

  return updateDoc(

    doc(
      db,
      COLLECTIONS.ACCESS_REQUESTS,
      id
    ),

    {

      status: REQUEST_STATUS.REJECTED,

      updatedAt: serverTimestamp()

    }

  );

}

/* ==========================================================
   Delete Request
========================================================== */

export async function deleteInstitutionRequest(id) {

  return deleteDoc(

    doc(
      db,
      COLLECTIONS.ACCESS_REQUESTS,
      id
    )

  );

}
