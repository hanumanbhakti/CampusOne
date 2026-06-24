/**
 * CampusOne — Provisioning Engine (Cloud Functions v2)
 * ============================================================
 * Trigger: Firestore onUpdate on access_requests/{requestId}
 * Fires only on the transition into status === "approved".
 *
 * Flow:
 *   1. Map request.role -> internal role (faculty -> teacher, etc.)
 *   2. institution_admin -> NEVER auto-provisioned. Bounced back to
 *      "under_review" with requiresManualReview=true for a Super Admin.
 *   3. Check if a Firebase Auth user already exists for this email.
 *        - Exists  -> reuse UID, update Firestore profile + claims.
 *                     accountAction = "reused_existing_account"
 *        - Missing -> create Auth user, create Firestore profile.
 *                     accountAction = "created_new_account"
 *   4. Student role -> auto-generate studentId via a per-campus counter.
 *   5. Parent role  -> link parentUid <-> childUid by matching child email.
 *   6. Set custom claims { role, campusCode } (forces token refresh).
 *   7. Generate a password-reset ("Set Password") link and email it
 *      via SMTP using a CampusOne-branded responsive template.
 *   8. Only when steps 3-7 all succeed: access_requests doc gets
 *        { provisioned: true, uid, accountAction, approvedAt, approvedBy }
 *      On any failure: { provisioned: false, status: "provisioning_failed",
 *                         provisionError } so an admin can retry.
 *   9. Every outcome is written to audit_logs.
 *
 * Deploy:
 *   cd functions && npm install
 *   firebase functions:secrets:set SMTP_HOST SMTP_PORT SMTP_USER SMTP_PASS SMTP_FROM
 *   firebase deploy --only functions:onAccessRequestApproved
 *
 * SMTP_* works with SendGrid's SMTP relay, Gmail, Postmark, SES SMTP, etc.
 * For SendGrid: SMTP_HOST=smtp.sendgrid.net, SMTP_USER="apikey",
 *               SMTP_PASS=<your SendGrid API key>, SMTP_PORT=587
 * ============================================================
 */

const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { defineSecret } = require("firebase-functions/params");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");

admin.initializeApp();
const db = admin.firestore();
const auth = admin.auth();

const SMTP_HOST = defineSecret("SMTP_HOST");
const SMTP_PORT = defineSecret("SMTP_PORT");
const SMTP_USER = defineSecret("SMTP_USER");
const SMTP_PASS = defineSecret("SMTP_PASS");
const SMTP_FROM = defineSecret("SMTP_FROM");

// ---------------------------------------------------------------
// Role mapping: access_requests.role (loose, human-entered) ->
// internal canonical role used in users/{uid}.role + custom claims.
// ---------------------------------------------------------------
const ROLE_MAP = {
  student: "student",
  teacher: "teacher",
  faculty: "teacher",
  parent: "parent",
  guardian: "parent",
  admin: "institution_admin",
  institution_admin: "institution_admin",
};

const ADMIN_ROLES = new Set(["institution_admin"]);

function mapRole(rawRole) {
  return ROLE_MAP[(rawRole || "").toLowerCase()] || null;
}

// ---------------------------------------------------------------
// Per-campus sequential ID generator (transaction-safe).
// e.g. SBU-BCA-2026-001
// ---------------------------------------------------------------
async function generateStudentId(campusCode, courseId) {
  const year = new Date().getFullYear();
  const campusPrefix = (campusCode || "CO").split("-")[0].toUpperCase();
  const coursePart = (courseId || "GEN").toUpperCase();
  const counterRef = db
    .collection("institutes").doc(campusCode)
    .collection("counters").doc(`students_${year}`);

  const seq = await db.runTransaction(async (tx) => {
    const snap = await tx.get(counterRef);
    const next = (snap.exists ? snap.data().seq : 0) + 1;
    tx.set(counterRef, { seq: next }, { merge: true });
    return next;
  });

  const padded = String(seq).padStart(3, "0");
  return `${campusPrefix}-${coursePart}-${year}-${padded}`;
}

async function writeAuditLog(entry) {
  await db.collection("audit_logs").add({
    ...entry,
    at: admin.firestore.FieldValue.serverTimestamp(),
  });
}

// ---------------------------------------------------------------
// Branded password-setup email — inline CSS, dark/light aware,
// mobile responsive (max-width 600px), single CTA.
// ---------------------------------------------------------------
function buildWelcomeEmailHtml({ name, institution, campusCode, role, setupLink }) {
  const roleLabel = role.charAt(0).toUpperCase() + role.slice(1).replace("_", " ");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>Welcome to CampusOne</title>
<style>
  body { margin:0; padding:0; background:#0F172A; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; }
  .wrapper { width:100%; padding:32px 16px; background:#0F172A; }
  .card { max-width:480px; margin:0 auto; background:#1E293B; border-radius:16px; overflow:hidden; border:1px solid rgba(255,255,255,0.08); }
  .header { padding:28px 32px 20px; text-align:center; background:linear-gradient(135deg,#2563EB 0%,#0EA5E9 100%); }
  .header h1 { margin:0; font-size:20px; font-weight:800; color:#fff; letter-spacing:-0.02em; }
  .header p { margin:4px 0 0; font-size:12px; color:rgba(255,255,255,0.85); font-weight:500; }
  .body { padding:28px 32px 8px; color:#F8FAFC; }
  .body p { font-size:14px; line-height:1.6; color:#CBD5E1; margin:0 0 14px; }
  .info-table { width:100%; border-collapse:collapse; margin:18px 0 22px; }
  .info-table td { padding:10px 0; font-size:13px; border-bottom:1px solid rgba(255,255,255,0.08); }
  .info-table td.label { color:#94A3B8; font-weight:600; }
  .info-table td.value { color:#F8FAFC; font-weight:700; text-align:right; }
  .cta-wrap { text-align:center; margin:26px 0 10px; }
  .cta { display:inline-block; padding:14px 36px; border-radius:10px; background:linear-gradient(135deg,#2563EB,#0EA5E9); color:#fff !important; font-size:15px; font-weight:700; text-decoration:none; }
  .security { margin:22px 32px 0; padding:14px 16px; border-radius:10px; background:rgba(245,158,11,0.1); border:1px solid rgba(245,158,11,0.25); font-size:12px; color:#FBBF24; line-height:1.5; }
  .footer { padding:24px 32px 28px; text-align:center; font-size:11px; color:#64748B; }
  @media (prefers-color-scheme: light) {
    body, .wrapper { background:#F1F5F9 !important; }
    .card { background:#FFFFFF !important; border-color:#E2E8F0 !important; }
    .body p { color:#475569 !important; }
    .body, .info-table td.value { color:#0F172A !important; }
    .footer { color:#94A3B8 !important; }
  }
  @media (max-width:480px) {
    .header, .body, .footer { padding-left:20px !important; padding-right:20px !important; }
    .security { margin-left:20px !important; margin-right:20px !important; }
  }
</style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <div class="header">
        <h1>🎓 CampusOne</h1>
        <p>Digital Campus OS</p>
      </div>
      <div class="body">
        <p>Hi <strong>${name}</strong>,</p>
        <p>Your account has been approved. Here are your access details:</p>
        <table class="info-table">
          <tr><td class="label">Institution</td><td class="value">${institution}</td></tr>
          <tr><td class="label">Campus Code</td><td class="value">${campusCode}</td></tr>
          <tr><td class="label">Role</td><td class="value">${roleLabel}</td></tr>
        </table>
        <p>Click below to set your password and activate your CampusOne account.</p>
      </div>
      <div class="cta-wrap">
        <a class="cta" href="${setupLink}" target="_blank">Set Your Password</a>
      </div>
      <div class="security">
        🔒 This link is single-use and expires soon. If you didn't request a CampusOne account, you can safely ignore this email.
      </div>
      <div class="footer">
        © ${new Date().getFullYear()} CampusOne · Sent to you because an account was approved on your behalf.
      </div>
    </div>
  </div>
</body>
</html>`;
}

async function sendWelcomeEmail({ to, name, institution, campusCode, role, setupLink, secrets }) {
  const transporter = nodemailer.createTransport({
    host: secrets.host,
    port: Number(secrets.port) || 587,
    secure: Number(secrets.port) === 465,
    auth: { user: secrets.user, pass: secrets.pass },
  });

  await transporter.sendMail({
    from: `"CampusOne" <${secrets.from}>`,
    to,
    subject: `Welcome to CampusOne — Activate your ${institution} account`,
    html: buildWelcomeEmailHtml({ name, institution, campusCode, role, setupLink }),
  });
}

// =================================================================
// MAIN TRIGGER
// =================================================================
exports.onAccessRequestApproved = onDocumentUpdated(
  {
    document: "access_requests/{requestId}",
    secrets: [SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM],
  },
  async (event) => {
    const before = event.data.before.data();
    const after = event.data.after.data();
    const requestId = event.params.requestId;
    const reqRef = event.data.after.ref;

    // Only fire on the transition INTO "approved", and only once.
    if (before.status === "approved" || after.status !== "approved") return;
    if (after.provisioned === true) return;

    const email = (after.email || "").trim().toLowerCase();
    const name = after.fullName || after.name || "User";
    const campusCode = after.campusCode;
    const institution = after.institution || campusCode;
    const approvedBy = after.reviewedBy || "unknown";
    const role = mapRole(after.role);

    if (!email || !campusCode || !role) {
      await reqRef.update({
        provisioned: false,
        status: "provisioning_failed",
        provisionError: "Missing email, campusCode, or unrecognized role.",
      });
      await writeAuditLog({
        type: "provisioning_failed", requestId, email, role: after.role,
        reason: "missing_fields_or_unknown_role",
      });
      return;
    }

    // Institution Admin = sensitive. Never auto-provision.
    if (ADMIN_ROLES.has(role)) {
      await reqRef.update({
        status: "under_review",
        requiresManualReview: true,
        provisioned: false,
        reviewNote: "Institution Admin accounts must be provisioned manually by a Super Admin.",
      });
      await writeAuditLog({
        type: "manual_review_required", requestId, email, role,
        reason: "institution_admin_role",
      });
      return;
    }

    let uid;
    let accountAction;

    try {
      // ---- Step: find or create the Auth user ----
      try {
        const existing = await auth.getUserByEmail(email);
        uid = existing.uid;
        accountAction = "reused_existing_account";
      } catch (err) {
        if (err.code !== "auth/user-not-found") throw err;
        const created = await auth.createUser({ email, displayName: name, emailVerified: false });
        uid = created.uid;
        accountAction = "created_new_account";
      }

      // ---- Step: custom claims (role + campusCode) ----
      await auth.setCustomUserClaims(uid, { role, campusCode });

      // ---- Step: Firestore profile ----
      const profile = {
        uid, name, email, role, campusCode, active: true,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      if (role === "student") {
        const studentId = await generateStudentId(campusCode, after.courseId || after.course);
        Object.assign(profile, {
          studentId,
          rollNumber: studentId.split("-").pop(),
          course: after.course || null,
          courseId: after.courseId || null,
          semester: after.semester || 1,
        });
      }

      if (role === "teacher") {
        Object.assign(profile, { subjectIds: after.subjectIds || [] });
      }

      if (role === "parent") {
        let childUid = null;
        if (after.childEmail) {
          const childQuery = await db.collection("users")
            .where("email", "==", after.childEmail.toLowerCase())
            .where("campusCode", "==", campusCode)
            .limit(1).get();
          if (!childQuery.empty) {
            childUid = childQuery.docs[0].id;
            await db.collection("users").doc(childUid).update({
              parentUid: uid,
            });
          }
        }
        Object.assign(profile, { childIds: childUid ? [childUid] : [] });
      }

      await db.collection("users").doc(uid).set(profile, { merge: true });

      // ---- Step: password setup link + email ----
      const setupLink = await auth.generatePasswordResetLink(email);
      await sendWelcomeEmail({
        to: email, name, institution, campusCode, role, setupLink,
        secrets: {
          host: SMTP_HOST.value(), port: SMTP_PORT.value(),
          user: SMTP_USER.value(), pass: SMTP_PASS.value(), from: SMTP_FROM.value(),
        },
      });

      // ---- Mark request fully provisioned ----
      await reqRef.update({
        provisioned: true,
        uid,
        accountAction,
        approvedBy,
        approvedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      await writeAuditLog({
        type: "request_approved", requestId, uid, email, role, campusCode,
        accountAction, approvedBy,
      });

    } catch (err) {
      logger.error(`Provisioning failed for ${requestId}:`, err);
      await reqRef.update({
        provisioned: false,
        status: "provisioning_failed",
        provisionError: err.message || String(err),
      });
      await writeAuditLog({
        type: "provisioning_failed", requestId, email, role,
        reason: err.message || String(err),
      });
    }
  }
);
