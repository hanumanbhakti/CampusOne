/**
 * =========================================================================
 * CAMPUSONE GATEWAY ENGINE
 * Core Login Screen Controller — Reactive State Machine + Firebase Auth
 * =========================================================================
 */

import {
  signInWithEmailAndPassword,
  signInWithPopup
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";

import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

// Single source of truth for Firebase init — keeps config in one place
// instead of duplicating apiKeys/initializeApp across every screen.
import { auth, db, googleProvider } from "../shared/firebase-config.js";

document.addEventListener('DOMContentLoaded', () => {
    
    // --- 1. ENCAPSULATED APPLICATION STATE STORAGE & DATA DICTIONARIES ---
    const CampusOS = {
        // TODO: Replace tenantRegistry with Firestore campuses collection
        tenantRegistry: {
            "MIT-DELHI-2026": { identity: "Massachusetts Institute of Technology, Delhi", isActive: true },
            "STANFORD-MUMBAI-2026": { identity: "Stanford Center for Advanced Computing, Mumbai", isActive: true }
        },

        // Rigid Framework Configuration Metrics
        config: {
            fallbackEase: 'cubic-bezier(0.2, 0, 0, 1)',
            sessionTimeoutDuration: 15 * 60 * 1000, // 15 Minutes Inactivity Lifecycle Limit
            maxAnalyticsLogSize: 100,              // FIFO Heap Boundary Protection
            
            // Enterprise Grade Regex Registries
            // NOTE: this strict complexity policy is for account REGISTRATION, not for login —
            // applying it at login time would lock out real users with valid-but-simpler existing passwords.
            passwordPolicyRegex: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
            emailRegex: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        },
        
        // Role → dashboard route mapping (greetings now live in translations.roleGreetings)
roleContexts: {
    student: { targetRoute: "../student-dashboard/index.html" },
    teacher: { targetRoute: "../teacher-dashboard/index.html" },
    parent: { targetRoute: "../parents-dashboard/index.html" },
    admin: { targetRoute: "../admin-panel/index.html" }
},

        // Global Dynamic State Variable Nodes
        state: {
            currentTheme: 'dark',
            currentRole: 'student',
            currentLanguage: 'en',
            activeTenant: null,
            isNetworkOnline: navigator.onLine,
            analyticsStream: [],
            toastQueue: [],
            activeToastCount: 0,
            inactivityTimer: null
        }
    };
    // --- TRANSLATIONS: loaded from locales/en.json + locales/hi.json -------
    // Previously this object was hand-duplicated here AND in /locales/*.json,
    // so editing one never updated the screen — that's why translation only
    // ever covered ~30% of the page. Now the JSON files are the single
    // source of truth; this is just an in-memory cache once they're fetched.
    // A tiny inline fallback keeps the screen readable even if the fetch
    // fails (e.g. opened directly from disk instead of a web server).
    const translations = {
        en: {
            welcome: "Welcome to CampusOne",
            subtitle: "Secure access to your digital campus workspace.",
            loginButton: "Sign In to CampusOne",
            roleGreetings: {
                student: { greeting: "Welcome Back, Scholar!", subtext: "Access your personalized learning dashboard, assignments, attendance and academic resources." },
                teacher: { greeting: "Welcome, Educator!", subtext: "Manage classes, attendance, examinations and student performance." },
                parent: { greeting: "Greetings, Guardian!", subtext: "Track attendance, progress reports and institutional updates." },
                admin: { greeting: "System Console Active", subtext: "Manage users, institutions, analytics and administration." }
            }
        },
        hi: {}
    };

    async function loadTranslationPack(lang) {
        try {
            const response = await fetch(`./locales/${lang}.json`, { cache: "no-cache" });
            if (!response.ok) throw new Error(`Locale file responded with ${response.status}`);
            const pack = await response.json();
            translations[lang] = pack;
            return true;
        } catch (loadError) {
            console.warn(`[CampusOne i18n] Could not load locales/${lang}.json, using fallback strings.`, loadError);
            return false;
        }
    }

    function applyTranslationPack(lang) {
        CampusOS.state.currentLanguage = lang;
        const pack = translations[lang] || translations.en;

        document.querySelectorAll("[data-i18n]").forEach(el => {
            const key = el.dataset.i18n;
            if (pack[key]) {
                el.textContent = pack[key];
            }
        });

        document.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
            const key = el.dataset.i18nPlaceholder;
            if (pack[key]) {
                el.placeholder = pack[key];
            }
        });

        document.documentElement.setAttribute('lang', lang);

        // Re-apply the current role's greeting in the new language so it never reverts to the generic text
        updateGreetingDisplay(CampusOS.state.currentRole, false);
    }

    async function switchLanguage(lang) {
        if (!translations[lang] || Object.keys(translations[lang]).length === 0) {
            await loadTranslationPack(lang);
        }
        applyTranslationPack(lang);
    }

    // Looks up a translated string by key for the *current* language, with an
    // English fallback — used for dynamically generated text like toasts.
    function t(key, fallback) {
        const pack = translations[CampusOS.state.currentLanguage] || {};
        return pack[key] || translations.en[key] || fallback || key;
    }

    // --- 2. FAST INLINE CACHED REFERENCE DOM SELECTORS ---
    const DOM = {
        htmlRoot: document.documentElement,
        themeTrigger: document.getElementById('theme-toggle-trigger'),
        roleTabs: document.querySelectorAll('.control-node'),
        greetingTitle: document.getElementById('dynamic-greeting'),
        greetingSubtext: document.getElementById('context-subtext'),
        tenantInput: document.getElementById('input-institution-code'),
        tenantPod: document.getElementById('dynamic-tenant-branding-pod'),
        tenantName: document.getElementById('tenant-resolved-name'),
        clearTenantBtn: document.querySelector('.action-clear-tenant'),
        authForm: document.getElementById('campusone-auth-form'),
        userIdentityInput: document.getElementById('input-user-identity'),
        passwordInput: document.getElementById('input-secure-key'),
        toggleMaskingBtn: document.getElementById('btn-toggle-masking'), 
        submitBtn: document.getElementById('cta-submit-node'),
        googleOAuthBtn: document.getElementById('btn-oauth-google'),
        capsLockWarning: document.getElementById('caps-lock-detector'),
        demoTriggerLink: document.querySelector('.action-request-link'),
        
        // Newly Synchronized Runtime Nodes
        strengthMeterTrack: document.getElementById('password-strength-meter'),
        strengthLabelFeed: document.getElementById('password-strength-label')
    };

    // --- 3. THEME CONTEXT CONTROLLER (INTACT / FROZEN) ---
    function initializeThemeEngine() {
        const cachedTheme = localStorage.getItem('co-gateway-theme') || 'dark';
        applySystemThemeContext(cachedTheme);

        if (DOM.themeTrigger) {
            DOM.themeTrigger.addEventListener('click', () => {
                const targetedTheme = DOM.htmlRoot.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
                applySystemThemeContext(targetedTheme);
                triggerDeviceTactileHapticPulse(5); // 5ms haptic pulse on theme switch
            });
        }
    }
  
    function applySystemThemeContext(theme) {
        DOM.htmlRoot.setAttribute('data-theme', theme);
        CampusOS.state.currentTheme = theme;
        localStorage.setItem('co-gateway-theme', theme);
        if (DOM.themeTrigger) DOM.themeTrigger.setAttribute('data-current-theme', theme);
        pushSystemTelemetryEvent('THEME_ENGINE_MUTATION', `Global visual architecture context parsed to [${theme}] successfully.`);
    }

    // --- 4. ACCESSIBILITY COMPLIANT WORKSPACE ROLE CONTROLLER (INTACT / FROZEN) ---
    function initializeRoleSwitcher() {
        DOM.roleTabs.forEach((tab, index) => {
            tab.addEventListener('click', (e) => {
                const targetRole = e.target.getAttribute('data-role-context');
                switchWorkspaceRoleContext(targetRole);
                triggerDeviceTactileHapticPulse(10); // 10ms haptic pulse on workspace switch
            });

            tab.addEventListener('keydown', (e) => {
                let targetIndex = null;
                if (e.key === 'ArrowRight') targetIndex = (index + 1) % DOM.roleTabs.length;
                else if (e.key === 'ArrowLeft') targetIndex = (index - 1 + DOM.roleTabs.length) % DOM.roleTabs.length;

                if (targetIndex !== null) {
                    DOM.roleTabs[targetIndex].focus();
                    switchWorkspaceRoleContext(DOM.roleTabs[targetIndex].getAttribute('data-role-context'));
                    triggerDeviceTactileHapticPulse(5);
                    e.preventDefault();
                }
            });
        });
    }

    function switchWorkspaceRoleContext(roleKey) {
        const context = CampusOS.roleContexts[roleKey];
        if (!context) return;

        CampusOS.state.currentRole = roleKey;

        DOM.roleTabs.forEach(btn => {
            const isTarget = btn.getAttribute('data-role-context') === roleKey;
            btn.classList.toggle('state-active', isTarget);
            btn.setAttribute('aria-selected', isTarget ? 'true' : 'false');
            btn.setAttribute('tabindex', isTarget ? '0' : '-1');
        });

        // Keep the panel's accessible name pointing at whichever tab is actually active
        const panel = document.getElementById('panel-auth-fields');
        if (panel) panel.setAttribute('aria-labelledby', `tab-${roleKey}`);

        updateGreetingDisplay(roleKey, true);
        pushSystemTelemetryEvent('ROLE_CONTEXT_SWITCH', `View context matrix mapped to scope channel: [${roleKey}].`);
    }

    // Single source of truth for greeting text — called on role switch AND language switch
    // so the two features never fight over the same DOM nodes.
    function updateGreetingDisplay(roleKey, animate) {
        const langPack = translations[CampusOS.state.currentLanguage] || translations.en;
        const roleText = langPack.roleGreetings?.[roleKey];
        if (!roleText || !DOM.greetingTitle || !DOM.greetingSubtext) return;

        const apply = () => {
            DOM.greetingTitle.textContent = roleText.greeting;
            DOM.greetingSubtext.textContent = roleText.subtext;
            DOM.greetingTitle.style.opacity = '1';
            DOM.greetingSubtext.style.opacity = '1';
        };

        if (animate) {
            DOM.greetingTitle.style.opacity = '0';
            DOM.greetingSubtext.style.opacity = '0';
            setTimeout(apply, 150);
        } else {
            apply();
        }
    }

    // --- 5. REAL-TIME PASSWORD VISIBILITY TOGGLE ---
    const ICON_EYE = '<svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
    const ICON_EYE_OFF = '<svg viewBox="0 0 24 24"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.5 18.5 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><path d="M1 1l22 22"/></svg>';

    if (DOM.toggleMaskingBtn && DOM.passwordInput) {
        DOM.toggleMaskingBtn.addEventListener('click', () => {
            const isCurrentlyMasked = DOM.passwordInput.getAttribute('type') === 'password';
            DOM.passwordInput.setAttribute('type', isCurrentlyMasked ? 'text' : 'password');
            DOM.toggleMaskingBtn.setAttribute('aria-pressed', isCurrentlyMasked ? 'true' : 'false');
            DOM.toggleMaskingBtn.setAttribute('aria-label', isCurrentlyMasked ? 'Hide password' : 'Reveal password');
            DOM.toggleMaskingBtn.innerHTML = isCurrentlyMasked ? ICON_EYE_OFF : ICON_EYE;
            triggerDeviceTactileHapticPulse(12);
        });
    }

    // --- 6. REAL-TIME INSTANT ENTROPY STRENGTH METER ENGINE ---
    if (DOM.passwordInput) {
        DOM.passwordInput.addEventListener('input', (e) => {
            const rawPasswordValue = e.target.value;
            evaluatePasswordEntropyStrength(rawPasswordValue);
        });
    }

    function evaluatePasswordEntropyStrength(password) {
        if (!password) {
            updateStrengthMeterUI(0, t('passwordStrength', 'Password Strength'), 'transparent');
            return;
        }

        let totalEntropyScore = 0;
        if (password.length >= 8) totalEntropyScore += 1;
        if (/[A-Z]/.test(password) && /[a-z]/.test(password)) totalEntropyScore += 1;
        if (/\d/.test(password)) totalEntropyScore += 1;
        if (/[@$!%*?&]/.test(password)) totalEntropyScore += 1;

        // UI Feedback Mapping Pipeline Cascades
        if (totalEntropyScore <= 2) {
            updateStrengthMeterUI(33, t('strengthWeak', 'Weak'), 'var(--color-danger, #EF4444)');
        } else if (totalEntropyScore === 3) {
            updateStrengthMeterUI(66, t('strengthMedium', 'Medium'), 'var(--color-warning, #F59E0B)');
        } else if (totalEntropyScore === 4) {
            updateStrengthMeterUI(100, t('strengthStrong', 'Strong'), 'var(--color-success, #22C55E)');
        }
    }

    function updateStrengthMeterUI(percentageWidth, levelLabel, feedbackColor) {
        if (DOM.strengthMeterTrack) {
            DOM.strengthMeterTrack.style.width = `${percentageWidth}%`;
            DOM.strengthMeterTrack.style.backgroundColor = feedbackColor;
        }
        if (DOM.strengthLabelFeed) {
            DOM.strengthLabelFeed.textContent = levelLabel;
            DOM.strengthLabelFeed.style.color = feedbackColor;
        }
    }

    // Toggles the ✓ / ✕ status icon + border color on an input's wrapper.
    // Pass isValid = null to clear the state entirely (e.g. when a field is emptied).
    function markFieldValidity(inputEl, isValid) {
        if (!inputEl) return;
        const wrapper = inputEl.closest('.input-field-wrapper');
        if (!wrapper) return;

        wrapper.classList.remove('is-valid', 'is-invalid');
        if (isValid === true) {
            wrapper.classList.add('is-valid');
            inputEl.setAttribute('aria-invalid', 'false');
        } else if (isValid === false) {
            wrapper.classList.add('is-invalid');
            inputEl.setAttribute('aria-invalid', 'true');
        } else {
            inputEl.removeAttribute('aria-invalid');
        }
    }

    // Real-time validation feedback as the user leaves each field
    function initializeFieldValidationFeedback() {
        if (DOM.userIdentityInput) {
            DOM.userIdentityInput.addEventListener('blur', () => {
                const val = DOM.userIdentityInput.value.trim();
                if (!val) { markFieldValidity(DOM.userIdentityInput, null); return; }
                markFieldValidity(DOM.userIdentityInput, CampusOS.config.emailRegex.test(val));
            });
        }
        if (DOM.passwordInput) {
            DOM.passwordInput.addEventListener('blur', () => {
                const val = DOM.passwordInput.value;
                if (!val) { markFieldValidity(DOM.passwordInput, null); return; }
                markFieldValidity(DOM.passwordInput, val.length >= 6);
            });
        }
    }

    // --- 7. SECURE MULTI-TENANT ARCHITECTURE PARSER (EXPLICIT DEMO ACTIVE) ---
    function initializeTenantSniffer() {
        if (!DOM.tenantInput) return;

        DOM.tenantInput.addEventListener('input', (e) => {
            const sanitizedToken = e.target.value.trim().toUpperCase();
            evaluateInstitutionalTokenAccess(sanitizedToken);
        });

        if (DOM.clearTenantBtn) {
            DOM.clearTenantBtn.addEventListener('click', () => {
                clearTenantVerificationState();
                triggerDeviceTactileHapticPulse(8);
            });
        }

        // Demo/sandbox campus trigger
        if (DOM.demoTriggerLink) {
            DOM.demoTriggerLink.addEventListener('click', (e) => {
                e.preventDefault();
                triggerDemoCampusMode();
            });
        }
    }

    function evaluateInstitutionalTokenAccess(token) {
        const institutionalNode = CampusOS.tenantRegistry[token];
        if (institutionalNode && institutionalNode.isActive) {
            CampusOS.state.activeTenant = token;
            if (DOM.tenantName && DOM.tenantPod) {
                DOM.tenantName.textContent = institutionalNode.identity;
                DOM.tenantPod.style.display = 'block';
                DOM.tenantPod.setAttribute('data-tenant-status', 'linked');
            }
            if (DOM.clearTenantBtn) DOM.clearTenantBtn.removeAttribute('hidden');
            markFieldValidity(DOM.tenantInput, true);
            showNotification(t('toastCampusLinked', `System linked successfully to node: ${token}`).replace('{token}', token), "success");
            pushSystemTelemetryEvent('TENANT_RESOLVED', `Connected to tenant pipeline secure workspace mapping: [${token}].`);
        } else {
            if (CampusOS.state.activeTenant) clearTenantVerificationState();
            markFieldValidity(DOM.tenantInput, token ? false : null);
        }
    }

    function triggerDemoCampusMode() {
        const demoFallbackKey = "MIT-DELHI-2026";
        if (DOM.tenantInput) {
            DOM.tenantInput.value = demoFallbackKey;
            evaluateInstitutionalTokenAccess(demoFallbackKey);
            triggerDeviceTactileHapticPulse(40);
            showNotification(t('toastDemoActivated', 'Sandbox Explorer environment activated successfully.'), "success");
        }
    }

    function clearTenantVerificationState() {
        CampusOS.state.activeTenant = null;
        if (DOM.tenantInput) DOM.tenantInput.value = '';
        markFieldValidity(DOM.tenantInput, null);
        if (DOM.tenantPod) {
            DOM.tenantPod.style.display = 'none';
            DOM.tenantPod.setAttribute('data-tenant-status', 'unlinked');
        }
        if (DOM.clearTenantBtn) DOM.clearTenantBtn.setAttribute('hidden', 'true');
        pushSystemTelemetryEvent('TENANT_DECOUPLED', 'Cleared institutional infrastructure framework context bindings.');
    }

    // --- Language engine ---
    function initializeLanguageEngine() {
        const langButtons = document.querySelectorAll(".lang-node");

        langButtons.forEach(btn => {
            btn.addEventListener("click", () => {
                const lang = btn.dataset.langTarget;
                switchLanguage(lang);

                langButtons.forEach(b => {
                    b.classList.remove("state-active");
                    b.removeAttribute("aria-current");
                });
                btn.classList.add("state-active");
                btn.setAttribute("aria-current", "true");

                localStorage.setItem("campusone-language", lang);
            });
        });

        const savedLang = localStorage.getItem("campusone-language") || "en";
        switchLanguage(savedLang);
        langButtons.forEach(b => {
            const isActive = b.dataset.langTarget === savedLang;
            b.classList.toggle("state-active", isActive);
            if (isActive) b.setAttribute("aria-current", "true");
            else b.removeAttribute("aria-current");
        });
    }
    
    // --- 8. AUTH PIPELINE WITH RIGID DEEP CORE VALIDATIONS ---
    function initializeAuthPipeline() {
        if (!DOM.authForm) return;

        window.addEventListener('keydown', (e) => {
            if (e.getModifierState && DOM.capsLockWarning) {
                const isCapsActive = e.getModifierState('CapsLock');
                DOM.capsLockWarning.style.display = isCapsActive ? 'inline-block' : 'none';
            }
        }, { passive: true });

        DOM.authForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (DOM.submitBtn && DOM.submitBtn.getAttribute('data-engine-state') === 'processing') return;

            const targetUserEmail = DOM.userIdentityInput?.value.trim();
            const rawTargetSecurityKey = DOM.passwordInput?.value;

            // Runtime Scope Hard Infrastructure Verification Boundary Checking Checks
            if (!CampusOS.state.activeTenant) {
                showNotification(t('toastCampusInvalid', 'Please enter a valid Campus Code before signing in.'), "danger");
                if (DOM.tenantInput) DOM.tenantInput.focus();
                return;
            }

            // Email format check
            if (!targetUserEmail || !CampusOS.config.emailRegex.test(targetUserEmail)) {
                showNotification(t('toastEmailInvalid', 'Please enter a valid email address.'), "warning");
                markFieldValidity(DOM.userIdentityInput, false);
                return;
            }
            markFieldValidity(DOM.userIdentityInput, true);

            // Login only needs to confirm a password was entered — full complexity rules
            // belong on the registration form, not here, or valid existing users get locked out.
            if (!rawTargetSecurityKey || rawTargetSecurityKey.length < 6) {
                showNotification(t('toastPasswordRequired', 'Please enter your password.'), "danger");
                markFieldValidity(DOM.passwordInput, false);
                return;
            }
            markFieldValidity(DOM.passwordInput, true);

            setButtonSubmissionEngineState('processing');
            pushSystemTelemetryEvent('AUTH_REQUEST_DISPATCHED', `Dispatched secure structural transaction stream channel for [${CampusOS.state.currentRole}].`);

            try {
                const selectedRole = CampusOS.state.currentRole;
                const userCredential = await signInWithEmailAndPassword(auth, targetUserEmail, rawTargetSecurityKey);
                await completeSuccessfulLogin(userCredential.user, selectedRole);
            } catch (authError) {
                setButtonSubmissionEngineState('rejected');
                const friendlyMessage = authError?.code === 'auth/invalid-credential' || authError?.code === 'auth/wrong-password' || authError?.code === 'auth/user-not-found'
                    ? t('toastAuthInvalidCreds', 'Incorrect email or password.')
                    : t('toastAuthFailedGeneric', 'Sign-in failed. Please check your connection and try again.');
                showNotification(friendlyMessage, "danger");
                setTimeout(() => setButtonSubmissionEngineState('idle'), 3000);
            }
        });

        if (DOM.googleOAuthBtn) {
            DOM.googleOAuthBtn.addEventListener('click', async () => {
                if (!CampusOS.state.activeTenant) {
                    showNotification(t('toastCampusInvalid', 'Please enter a valid Campus Code before signing in.'), "danger");
                    if (DOM.tenantInput) DOM.tenantInput.focus();
                    return;
                }
                try {
                    DOM.googleOAuthBtn.setAttribute('disabled', 'true');
                    const selectedRole = CampusOS.state.currentRole;
                    const userCredential = await signInWithPopup(auth, googleProvider);
                    await completeSuccessfulLogin(userCredential.user, selectedRole);
                } catch (oauthError) {
                    pushSystemTelemetryEvent('GOOGLE_AUTH_FAILED', `Google sign-in rejected: [${oauthError?.code || 'unknown'}].`);
                    showNotification(t('toastGoogleFailed', 'Google sign-in failed. Please try again.'), "danger");
                } finally {
                    DOM.googleOAuthBtn.removeAttribute('disabled');
                }
            });
        }
    }

    // Shared by both email/password and Google sign-in — looks up the user's
    // profile doc, resolves their real role, and redirects to the matching dashboard.
    async function completeSuccessfulLogin(firebaseUser, selectedRole) {
        // Look up the profile in a single shared "users" collection, keyed by uid,
        // with each document carrying its own `role` field. This works for every
        // role tab (student/teacher/parent/admin) instead of only ever checking "students".
        const userRef = doc(db, "users", firebaseUser.uid);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
            const userData = userSnap.data();
            // Trust the role stored against the account over whatever tab was clicked in the UI
            CampusOS.state.currentRole = userData.role || selectedRole;
            showNotification(t('toastProfileLoaded', 'Profile loaded successfully.'), "success");
        } else {
            // No profile doc yet — proceed with the role the user selected on the tab
            CampusOS.state.currentRole = selectedRole;
            showNotification(t('toastNoProfile', 'Signed in. No extended profile found yet.'), "warning");
        }

        setButtonSubmissionEngineState('resolved');
        showNotification(t('toastAuthSuccess', 'Authentication successful! Redirecting you now...'), "success");

        setTimeout(() => {
            DOM.authForm.reset();
            clearTenantVerificationState();
            updateStrengthMeterUI(0, t('passwordStrength', 'Password Strength'), 'transparent');

            const configuredExplicitRedirectRoute = CampusOS.roleContexts[CampusOS.state.currentRole]?.targetRoute
                || CampusOS.roleContexts.student.targetRoute;
            pushSystemTelemetryEvent('REDIRECT_FORCED', `Forcing explicit route shift execution sequence target: [${configuredExplicitRedirectRoute}].`);

            window.location.href = configuredExplicitRedirectRoute;
        }, 1000);
    }

    function setButtonSubmissionEngineState(targetState) {
        if (!DOM.submitBtn) return;
        // Visibility of each state's markup (idle/processing/resolved/rejected) is handled
        // entirely by CSS via [data-engine-state]; we only flip the attribute here. The
        // markup itself (icons + i18n text) lives in the HTML and should never be overwritten,
        // or the SVG icons inside the resolved/rejected states would get wiped out.
        DOM.submitBtn.setAttribute('data-engine-state', targetState);
    }

    // --- 9. IDLE-PROTECTION: CLEAR SENSITIVE FIELDS AFTER PROLONGED INACTIVITY ---
    // Note: there is no real "session" before login succeeds, so we only clear the
    // sensitive password field rather than force-resetting the whole form/role choice.
    function clearSensitiveFieldsOnIdle() {
        if (DOM.passwordInput && DOM.passwordInput.value) {
            DOM.passwordInput.value = '';
            markFieldValidity(DOM.passwordInput, null);
            updateStrengthMeterUI(0, t('passwordStrength', 'Password Strength'), 'transparent');
            showNotification(t('toastIdleClear', 'Password field cleared after inactivity for your security.'), "warning");
            pushSystemTelemetryEvent('IDLE_PASSWORD_CLEAR', 'Password field cleared after prolonged inactivity.');
        }
    }

    function refreshSystemInactivityCountdown() {
        if (CampusOS.state.inactivityTimer) clearTimeout(CampusOS.state.inactivityTimer);
        CampusOS.state.inactivityTimer = setTimeout(clearSensitiveFieldsOnIdle, CampusOS.config.sessionTimeoutDuration);
    }

    function initializeSessionLifecycleMonitor() {
        refreshSystemInactivityCountdown();
        ['mousemove', 'keydown', 'click', 'touchstart'].forEach(interactionEvent => {
            window.addEventListener(interactionEvent, refreshSystemInactivityCountdown, { passive: true });
        });
    }

    // --- 10. TACTILE DEVICE HARDWARE HAPTIC FEEDBACK DRIVER ---
    function triggerDeviceTactileHapticPulse(msDuration = 10) {
        if (navigator.vibrate) {
            navigator.vibrate(msDuration);
        }
    }

    // --- 11. STREAM PACKET FIFO ANALYTICS TELEMETRY MATRIX (INTACT / FROZEN) ---
    function pushSystemTelemetryEvent(eventType, messageDescriptor) {
        const tracePacketLogFrame = { timestamp: new Date().toISOString(), contextScope: CampusOS.state.currentRole, eventType, description: messageDescriptor };
        CampusOS.state.analyticsStream.push(tracePacketLogFrame);
        if (CampusOS.state.analyticsStream.length > CampusOS.config.maxAnalyticsLogSize) {
            CampusOS.state.analyticsStream.shift(); 
        }
    }

    function initializeTelemetryCounters() {
        window.addEventListener('online', () => evaluateNetworkStateHardwareMutation(true), { passive: true });
        window.addEventListener('offline', () => evaluateNetworkStateHardwareMutation(false), { passive: true });
    }

    function evaluateNetworkStateHardwareMutation(isOnlineNow) {
        CampusOS.state.isNetworkOnline = isOnlineNow;
        const message = isOnlineNow
            ? t('toastOnline', "You're back online.")
            : t('toastOffline', 'Connection lost. Some features may be unavailable.');
        showNotification(message, isOnlineNow ? "success" : "danger");
        pushSystemTelemetryEvent('NETWORK_MUTATION', `Network connectivity changed to: [${isOnlineNow ? "ONLINE" : "OFFLINE"}].`);
    }

    // --- 12. RUNTIME TELEMETRY EVENT INTERCEPTOR TOAST QUEUE ---
    function showNotification(message, type = 'success') {
        CampusOS.state.toastQueue.push({ message, type });
        processActiveNotificationQueueFrame();
    }

    function processActiveNotificationQueueFrame() {
        if (CampusOS.state.activeToastCount >= 3 || CampusOS.state.toastQueue.length === 0) return;
        const { message, type } = CampusOS.state.toastQueue.shift();
        CampusOS.state.activeToastCount++;

        let targetStackBox = document.getElementById('co-toast-stack-container');
        if (!targetStackBox) {
            targetStackBox = document.createElement('div');
            targetStackBox.id = 'co-toast-stack-container';
            Object.assign(targetStackBox.style, { position: 'fixed', bottom: '24px', right: '24px', display: 'flex', flexDirection: 'column', gap: '10px', zIndex: '99999', pointerEvents: 'none' });
            document.body.appendChild(targetStackBox);
        }

        const toastElement = document.createElement('div');
        const coreColorsMatrix = { success: '#22C55E', warning: '#F59E0B', danger: '#EF4444' };
        
        Object.assign(toastElement.style, {
            background: 'var(--color-surface-solid, #1E293B)', color: 'var(--text-primary, #F8FAFC)',
            border: '1px solid var(--glass-border, rgba(255,255,255,0.08))', padding: '12px 20px',
            borderRadius: 'var(--radius-md, 12px)', fontSize: '0.85rem', fontWeight: '500',
            borderLeft: `4px solid ${coreColorsMatrix[type] || coreColorsMatrix.success}`,
            boxShadow: 'var(--shadow-xl, 0 10px 25px rgba(0,0,0,0.4))', transform: 'translateY(20px)',
            opacity: '0', transition: 'transform 300ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity 300ms ease'
        });

        toastElement.textContent = message;
        targetStackBox.appendChild(toastElement);

        requestAnimationFrame(() => {
            toastElement.style.transform = 'translateY(0)';
            toastElement.style.opacity = '1';
        });

        setTimeout(() => {
            toastElement.style.transform = 'translateY(-10px)';
            toastElement.style.opacity = '0';
            setTimeout(() => {
                toastElement.remove();
                CampusOS.state.activeToastCount--;
                processActiveNotificationQueueFrame();
            }, 300);
        }, 4000);
    }

    // --- 13. CORE PIPELINE SYSTEM BOOT EXECUTION TRIGGER ---
    function runtimeCoreSystemBootInitialization() {
        initializeThemeEngine();
        initializeRoleSwitcher();
        initializeTenantSniffer();
        initializeTelemetryCounters();
        initializeAuthPipeline();
        initializeFieldValidationFeedback();
        initializeSessionLifecycleMonitor(); // Fire active token countdown sequence

        initializeLanguageEngine();
        updateGreetingDisplay(CampusOS.state.currentRole, false); // Sync greeting with default active tab

        console.log("[CampusOne Core Framework] Login screen initialized.");
    }

    // Fire application runtime engine infrastructure orchestration frame...
    runtimeCoreSystemBootInitialization();
});
