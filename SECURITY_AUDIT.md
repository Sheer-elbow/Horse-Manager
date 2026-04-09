# Horse-Manager Security Audit Report

**Date:** 2026-04-09 | **Rating:** RED — not ready for public launch

## Executive Summary

The application has solid foundations (bcrypt-12, Zod validation, parameterised Prisma queries, rate limiting) but has **critical authorisation gaps** that allow any registered user to read, modify, or delete other users' appointments, invoices, and documents. Combined with stored XSS in programme HTML rendering and JWT tokens in localStorage, a single attacker registration could lead to full account takeover of any user. **All Critical and High items must be resolved before public launch.**

| Audit Area | Rating |
|---|---|
| Authentication & Authorisation | RED |
| API & Backend | RED |
| Frontend | RED |
| Infrastructure & Configuration | AMBER |
| Dependencies & Supply Chain | AMBER |

---

## Critical Findings

### C1. Stored XSS via Programme HTML + Tokens in localStorage = Full Account Takeover

**Files:** `frontend/src/pages/Programmes.tsx:753`, `frontend/src/pages/Programmes.tsx:298-300`, `frontend/src/api/client.ts:3-4,9-10`

Programme HTML is rendered via `dangerouslySetInnerHTML` and `document.write()` without sanitisation. Tokens are in localStorage. Any user who can upload programme HTML can steal every viewer's refresh token and fully impersonate them.

### C2. Appointment IDOR — Any User Can Modify/Delete Any Appointment

**File:** `backend/src/routes/appointments.ts:82-216`

PUT, complete, cancel, and DELETE operations on appointments check `authenticate` only — no horse-level ownership verification. Any registered user can manipulate any appointment by UUID.

### C3. Invoice IDOR — Any User Can Read/Modify/Delete Any Invoice

**File:** `backend/src/routes/invoices.ts:567-790`

GET, PUT, PATCH status, DELETE on invoices and recurring invoices have no ownership check. Financial records of any stable are exposed to any authenticated user.

### C4. JWT tokenVersion Not Checked on Access Tokens

**File:** `backend/src/middleware/auth.ts:15-17`

After password change or reset, old access tokens remain valid for up to 15 minutes because `authenticate()` does not verify `tokenVersion` against the database.

---

## High Findings

### H1. Documents — STABLE_LEAD/TRAINER See All Horses System-Wide

**File:** `backend/src/routes/documents.ts:72-78`

`canAccessHorse()` returns true for any STABLE_LEAD or TRAINER regardless of stable membership.

### H2. All Stables + Details Exposed to Any Authenticated User

**Files:** `backend/src/routes/stables.ts:69-80,117-132`

GET `/api/stables` lists all stables including owner PII and addresses. GET `/api/stables/:id` returns details without membership check.

### H3. Stable-Wide Appointments Accessible Without Membership

**File:** `backend/src/routes/appointments.ts:221-237`

GET `/api/appointments/stable/:stableId` returns all appointments for any stable to any authenticated user.

### H4. Missing CSP and Security Headers on Frontend

**Files:** `frontend/nginx.conf`, `Caddyfile:5-7`

No Content-Security-Policy, X-Frame-Options, or other security headers at the Caddy or nginx layer, making XSS exploitation unrestricted.

### H5. Grafana Exposed Publicly Without Proxy-Level Auth

**File:** `Caddyfile:13-15`

Grafana dashboard reachable at `grafana.holidayskitak.uk` with no IP restriction or second auth factor at the reverse proxy.

### H6. nodemailer SMTP Command Injection

**File:** `backend/package.json` — `nodemailer@6.10.1`

4 advisories including SMTP command injection. Upgrade to >=8.0.5 (breaking).

### H7. multer DoS Vulnerabilities

**File:** `backend/package.json` — `multer@2.0.2`

3 DoS advisories. Upgrade to >=2.1.1.

---

## Medium Findings

| ID | Issue | File |
|---|---|---|
| M1 | No email verification on registration | `backend/src/routes/auth.ts:239-303` |
| M2 | Health record PUT/DELETE cross-horse bypass | `backend/src/routes/health.ts:150+` |
| M3 | Invoice POST — no role check, any user creates invoices | `backend/src/routes/invoices.ts:651-708` |
| M4 | Sessions POST double response (crash) | `backend/src/routes/sessions.ts:198-200` |
| M5 | Appointments POST missing Zod validation | `backend/src/routes/appointments.ts:52-79` |
| M6 | Invoice routes missing Zod validation | `backend/src/routes/invoices.ts:517-708` |
| M7 | Unauthenticated `/metrics` endpoint | `backend/src/index.ts:74-77` |
| M8 | Backend container runs as root | `backend/Dockerfile:11-21` |
| M9 | Unpinned `:latest` image tags | `docker-compose.yml:71,81,93` |
| M10 | GitHub Actions uses unpinned third-party actions | `.github/workflows/deploy.yml:12,14,24` |
| M11 | `npm install` instead of `npm ci` in Dockerfiles | `backend/Dockerfile:4`, `frontend/Dockerfile:4` |
| M12 | Session access doesn't check stable assignments | `backend/src/routes/sessions.ts:52-73` |
| M13 | Missing `Content-Security-Policy` on backend | `backend/src/index.ts:43-55` |
| M14 | Direct fetch() calls bypass API client | `frontend/src/pages/UserProfile.tsx:217-218` |
| M15 | Health record file URLs rendered without auth | `frontend/src/pages/HorseProfile.tsx:1434-1439` |
| M16 | Tokens in URL query params (invite/reset) | `frontend/src/pages/AcceptInvite.tsx:27` |
| M17 | bcryptjs@2.4.3 is 9 years old | `backend/package.json` |
| M18 | SSH deploy with no environment protection rules | `.github/workflows/deploy.yml:23-30` |

## Low Findings

| ID | Issue | File |
|---|---|---|
| L1 | No logout endpoint / no server-side token blacklist | `backend/src/routes/auth.ts` |
| L2 | `mustChangePassword` not enforced server-side | `backend/src/index.ts:201-218` |
| L3 | Invite token uses UUID v4 instead of crypto random | `backend/src/routes/auth.ts:189` |
| L4 | X-Forwarded-For trusted without proxy config | `backend/src/services/securityLog.ts:11-17` |
| L5 | No Helmet.js | `backend/src/index.ts` |
| L6 | Frontend container runs as root | `frontend/Dockerfile:8-12` |
| L7 | No `.dockerignore` files | `backend/`, `frontend/` |
| L8 | `.gitignore` missing `.env.*` variant patterns | `.gitignore:4` |
| L9 | `.env.example` suggestive default passwords | `.env.example:7-9` |
| L10 | Invoice status PATCH no enum validation | `backend/src/routes/invoices.ts:767-780` |
| L11 | Unprotected `JSON.parse` on invoice splits | `backend/src/routes/invoices.ts:528,574,670,727` |

---

## Vulnerability Chains

| Chain | Components | Combined Severity |
|---|---|---|
| **Full Account Takeover** | C1 (XSS) + localStorage tokens → steal refresh token → permanent impersonation | Critical |
| **Unauthenticated Data Breach** | M1 (no email verify) + C2/C3 (IDOR) → register throwaway → access all data | Critical |
| **Cross-Stable Document Breach** | H1 (documents role bypass) + C1 (XSS) → TRAINER at Stable A uploads malicious HTML → STABLE_LEAD at Stable B views it → tokens stolen | Critical |
| **Complete Stable Enumeration** | H2 (list all stables) + H3 (stable appointments) → map entire platform | High |
| **Health Record Tampering** | M2 (cross-horse record bypass) + any horse EDIT access → modify vet records on any horse | High |

---

## Dependency Risk Table

| Package | Version | Issue | Fix Version | Severity |
|---|---|---|---|---|
| nodemailer | 6.10.1 | SMTP command injection (4 advisories) | >=8.0.5 | High |
| multer | 2.0.2 | DoS (3 advisories) | >=2.1.1 | High |
| undici | 7.22.0 | HTTP smuggling, memory, CRLF (6 advisories) | >=7.24.0 | High |
| vite (backend) | 7.3.1 | Path traversal, file read (3 advisories) | >=7.3.2 | High |
| vite (frontend) | 6.4.1 | Path traversal, file read (2 advisories) | >=6.4.2 | High |
| rollup | 4.58.0 | Arbitrary file write | >=4.59.0 | High |
| picomatch | 2.3.1/4.0.2 | ReDoS, method injection | >=2.3.2/4.0.4 | High |
| path-to-regexp | 0.1.12 | ReDoS | >=0.1.13 | High |
| effect (prisma) | <3.20.0 | AsyncLocalStorage context leak | >=3.20.0 | High |
| defu (prisma) | <=6.1.4 | Prototype pollution | >=6.1.5 | High |
| bcryptjs | 2.4.3 | 9 years stale, auth-critical | 3.0.3 | Medium |
| express | 4.22.1 | Maintenance mode, vuln transitive deps | 5.2.1 | Medium |

---

## Infrastructure Observations (Require Live Validation)

- Whether Grafana is reachable at `grafana.holidayskitak.uk` with default creds
- Whether `/api/metrics` is externally reachable through the Caddy/nginx chain
- Whether PostgreSQL has TLS configured (docker-compose shows `sslmode=disable`)
- Whether the self-hosted GitHub Actions runner is isolated

---

## Prioritised Remediation Plan

| # | Finding | Severity | Effort | Session Scope |
|---|---|---|---|---|
| 1 | C1: Sanitise programme HTML + move tokens to httpOnly cookies | Critical | 4h | Session 1 |
| 2 | C2: Add horse-level auth to all appointment write routes | Critical | 2h | Session 2 |
| 3 | C3: Add ownership checks to all invoice routes | Critical | 2h | Session 2 |
| 4 | C4: Validate tokenVersion in authenticate middleware | Critical | 1h | Session 3 |
| 5 | H1: Scope documents canAccessHorse to stable membership | High | 1h | Session 3 |
| 6 | H2+H3: Scope stables + appointments to user's stables | High | 2h | Session 3 |
| 7 | H4: Add CSP + security headers to Caddy and nginx | High | 1h | Session 4 |
| 8 | H5: Restrict Grafana access by IP | High | 30m | Session 4 |
| 9 | H6+H7: Upgrade nodemailer + multer | High | 2h | Session 5 |
| 10 | M1-M18: Medium findings batch | Medium | 6h | Sessions 6-7 |
| 11 | L1-L11: Low findings batch | Low | 4h | Session 8 |
| 12 | Run `npm audit fix` on both packages | High | 30m | Session 5 |

---

## Remediation Session Prompts

Below are ready-to-use Claude Code session prompts for each critical/high fix.

### Session 1: XSS + Token Storage

```
Role: Senior security engineer
Task: Fix two critical XSS vulnerabilities and migrate token storage from localStorage to httpOnly cookies.

Changes required:
1. Install DOMPurify in frontend: `npm install dompurify @types/dompurify`
2. In frontend/src/pages/Programmes.tsx:753, wrap viewProgramme.htmlContent with DOMPurify.sanitize()
3. In frontend/src/pages/Programmes.tsx:298-300, wrap full.manualHtml with DOMPurify.sanitize(html, { WHOLE_DOCUMENT: true }) before document.write()
4. Backend: modify POST /api/auth/login and POST /api/auth/refresh to set refreshToken as an httpOnly, Secure, SameSite=Strict cookie instead of returning it in the JSON body
5. Backend: create POST /api/auth/logout that clears the cookie
6. Frontend: remove all localStorage token operations from frontend/src/api/client.ts — keep accessToken in memory only, read refreshToken from cookie automatically via credentials:'include'
7. Update frontend/src/contexts/AuthContext.tsx to match

Stop conditions: Do not change any business logic. Run the existing test suite after changes. Ensure login, refresh, and logout flows work correctly.
```

### Session 2: IDOR Fixes — Appointments + Invoices

```
Role: Senior security engineer
Task: Add authorisation checks to all appointment and invoice write routes to prevent IDOR.

Changes required:
1. backend/src/routes/appointments.ts — For PUT /:id, POST /:id/complete, POST /:id/cancel, DELETE /:id: look up the appointment, verify the authenticated user has EDIT-level HorseAssignment or StableAssignment for the appointment's horse. Return 403 if not.
2. backend/src/routes/appointments.ts — For GET /stable/:stableId: verify the user is a member/owner of the stable. Return 403 if not.
3. backend/src/routes/invoices.ts — For GET /:id, PUT /:id, PATCH /:id/status, DELETE /:id: verify the user created the invoice OR is ADMIN OR has horse access to at least one horse in the splits. Return 403 if not.
4. backend/src/routes/invoices.ts — For PUT /recurring/:id, PATCH /recurring/:id/toggle, DELETE /recurring/:id: verify the user created the recurring invoice or is ADMIN.

Stop conditions: Do not change database schema. Do not break existing functionality for authorised users. Every route must return 403 for unauthorised access, 404 for missing resources.
```

### Session 3: Token Revocation + Documents + Stables Scoping

```
Role: Senior security engineer
Task: Fix token revocation, documents role bypass, and stables data exposure.

Changes required:
1. backend/src/middleware/auth.ts — In authenticate(), after jwt.verify(), query the user's tokenVersion from the database and compare to the JWT payload's tokenVersion. Return 401 if mismatched. Consider adding a short-lived cache (e.g. 30s TTL Map) to reduce DB load.
2. backend/src/routes/documents.ts — Rewrite canAccessHorse() and canEditHorse() to check actual stable/horse assignment instead of granting blanket access to STABLE_LEAD and TRAINER roles. ADMIN remains unrestricted.
3. backend/src/routes/stables.ts — GET /api/stables: for non-ADMIN users, filter to only stables they own, are assigned to, or have membership in. GET /api/stables/:id: verify the user has a relationship to the stable before returning details.

Stop conditions: Do not change the Prisma schema. Ensure ADMIN users retain full access. Test that stable owners can still see their own stables.
```

### Session 4: Security Headers + Grafana

```
Role: Infrastructure security engineer
Task: Add security headers to the reverse proxy and restrict Grafana access.

Changes required:
1. Caddyfile — Add to the www.holidayskitak.uk block: Content-Security-Policy, X-Content-Type-Options nosniff, X-Frame-Options DENY, Referrer-Policy strict-origin-when-cross-origin, Permissions-Policy camera=() microphone=() geolocation=(), Strict-Transport-Security max-age=31536000
2. Caddyfile — Restrict grafana.holidayskitak.uk to specific admin IPs using Caddy's remote_ip matcher, respond 403 for all others
3. frontend/nginx.conf — Add the same security headers as a defence-in-depth layer

Stop conditions: Do not change application code. Verify the CSP does not break the SPA (allow 'self' for scripts, 'self' + 'unsafe-inline' for styles, blob: and data: for images).
```

### Session 5: Dependency Upgrades

```
Role: Senior engineer
Task: Resolve all high-severity npm audit findings.

Changes required:
1. cd backend && npm audit fix — resolve path-to-regexp, undici, picomatch, effect, defu automatically
2. cd backend && npm install multer@latest — upgrade from 2.0.2 to >=2.1.1
3. cd backend && npm install nodemailer@latest — upgrade from 6.10.1 to >=8.0.5 (BREAKING: review backend/src/services/email.ts for API changes)
4. cd frontend && npm audit fix — resolve vite, rollup, picomatch
5. Verify both `npm audit` commands show 0 high/critical vulnerabilities
6. Replace `npm install` with `npm ci --ignore-scripts` in backend/Dockerfile and frontend/Dockerfile

Stop conditions: Run the test suite after each upgrade. If nodemailer 8.x has breaking changes, adapt email.ts to the new API. Do not downgrade any package.
```
