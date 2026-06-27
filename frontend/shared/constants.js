/**
 * ==========================================================
 * CampusOne Enterprise Constants
 * Version : 1.0.0
 * ==========================================================
 * Single source of truth for the entire application.
 * Never hardcode roles, collection names, status values
 * or plans anywhere else.
 * ==========================================================
 */

/* ==========================================================
   APP
========================================================== */

export const APP = {
  NAME: "CampusOne",
  VERSION: "1.0.0",
  ENVIRONMENT: "production"
};

/* ==========================================================
   FIRESTORE COLLECTIONS
========================================================== */

export const COLLECTIONS = Object.freeze({

  ACCESS_REQUESTS: "accessRequests",

  INSTITUTES: "institutes",

  TENANTS: "tenants",

  USERS: "users",

  STAFF: "staff",

  NOTICES: "notices"

});

/* ==========================================================
   USER ROLES
========================================================== */

export const ROLES = Object.freeze({

  SUPER_ADMIN: "super_admin",

  INSTITUTION_ADMIN: "institution_admin",

  TEACHER: "teacher",

  STUDENT: "student",

  PARENT: "parent"

});

/* ==========================================================
   REQUEST STATUS
========================================================== */

export const REQUEST_STATUS = Object.freeze({

  PENDING: "pending",

  APPROVED: "approved",

  REJECTED: "rejected"

});

/* ==========================================================
   TENANT STATUS
========================================================== */

export const TENANT_STATUS = Object.freeze({

  ACTIVE: "active",

  INACTIVE: "inactive",

  SUSPENDED: "suspended"

});

/* ==========================================================
   SUBSCRIPTION PLANS
========================================================== */

export const PLANS = Object.freeze({

  FREE: "free",

  STARTER: "starter",

  PROFESSIONAL: "professional",

  ENTERPRISE: "enterprise"

});

/* ==========================================================
   INSTITUTION TYPES
========================================================== */

export const INSTITUTION_TYPES = Object.freeze({

  SCHOOL: "School",

  COLLEGE: "College",

  UNIVERSITY: "University",

  COACHING: "Coaching Institute",

  TRAINING: "Training Institute",

  OTHER: "Other"

});

/* ==========================================================
   STORAGE FOLDERS
========================================================== */

export const STORAGE = Object.freeze({

  INSTITUTION_LOGOS: "institution-logos",

  PROFILE_PHOTOS: "profile-photos",

  DOCUMENTS: "documents"

});

/* ==========================================================
   APPLICATION LIMITS
========================================================== */

export const LIMITS = Object.freeze({

  MAX_LOGO_SIZE: 2 * 1024 * 1024,

  MAX_DOCUMENT_SIZE: 10 * 1024 * 1024

});

/* ==========================================================
   DEFAULT VALUES
========================================================== */

export const DEFAULTS = Object.freeze({

  PLAN: PLANS.FREE,

  REQUEST_STATUS: REQUEST_STATUS.PENDING,

  TENANT_STATUS: TENANT_STATUS.ACTIVE

});
