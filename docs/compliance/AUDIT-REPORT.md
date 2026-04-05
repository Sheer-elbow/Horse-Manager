# Smart Stable Manager — SaaS Launch Readiness Audit

**Date**: 2026-04-05
**Scope**: GDPR/UK GDPR compliance, Apple App Store readiness, security posture, product maturity
**Status**: Pre-launch audit — findings derived from code review, not assumptions

> **Disclaimer**: This audit identifies compliance gaps and produces document stubs. All legal documents must be reviewed by a qualified solicitor before publication. This is not legal advice.

---

## 1. Data Inventory

Every model that holds personal data, sensitive data, or behavioural data.

### 1.1 Direct PII (identifies a natural person)

| Model | Field(s) | Data Type | Purpose | Retention | Lawful Basis (Assessment) |
|-------|----------|-----------|---------|-----------|--------------------------|
| `User` | `email` | Email address | Account identifier, login credential | Indefinite (no deletion policy) | **Contract** (Art 6(1)(b)) — necessary for account operation |
| `User` | `name` | Full name | Display name in UI | Indefinite | **Contract** — optional but provided by user |
| `User` | `passwordHash` | Bcrypt hash | Authentication | Lifetime of account | **Contract** |
| `InviteToken` | `email` | Email address | Invite delivery target | Indefinite (tokens kept after use) | **Legitimate interest** (Art 6(1)(f)) — admin invites staff |
| `SecurityEvent` | `email` | Email address | Security audit trail | Indefinite | **Legitimate interest** — fraud/abuse detection |
| `SecurityEvent` | `ipAddress` | IP address | Security audit trail | Indefinite | **Legitimate interest** — but retention must be limited |
| `SecurityEvent` | `userAgent` | Browser UA string | Security audit trail | Indefinite | **Legitimate interest** |
| `Appointment` | `practitionerName` | Name of vet/farrier/dentist | Scheduling reference | Indefinite | **Legitimate interest** — but these are third-party natural persons |
| `Appointment` | `contactNumber` | Phone number | Contact for appointment | Indefinite | **Legitimate interest** — third-party personal data |
| `VetVisit` | `vetName` | Name of vet | Record keeping | Indefinite | **Legitimate interest** |
| `FarrierVisit` | `farrierName` | Name of farrier | Record keeping | Indefinite | **Legitimate interest** |
| `DentistVisit` | `dentistName` | Name of dentist | Record keeping | Indefinite | **Legitimate interest** |
| `ActualSessionLog` | `rider` | Free-text name | Training attribution | Indefinite | **Legitimate interest** — but free text could contain any PII |

### 1.2 Sensitive / Financial Data

| Model | Field(s) | Data Type | Purpose | Retention | Lawful Basis |
|-------|----------|-----------|---------|-----------|-------------|
| `Invoice` | `totalAmount`, `supplier`, `category` | Financial | Cost tracking | Indefinite | **Contract** |
| `InvoiceSplit` | `amount`, `ownerId` | Financial + user link | Cost allocation to horse owners | Indefinite | **Contract** |
| `RecurringInvoice` | `totalAmount`, `supplier` | Financial | Recurring billing templates | Indefinite | **Contract** |
| `ExpenseNote` | `amount`, `category` | Financial | Horse expense tracking | Indefinite | **Contract** |
| `Stable` | `address` | Physical address | Stable location | Indefinite | **Contract** |

### 1.3 Behavioural / Activity Data

| Model | Field(s) | Purpose | Retention | Lawful Basis |
|-------|----------|---------|-----------|-------------|
| `ActualSessionLog` | `sessionType`, `durationMinutes`, `intensityRpe`, `notes`, `deviationReason` | Training activity tracking | Indefinite | **Contract** |
| `SessionAuditLog` | `previousData`, `newData`, `editedById` | Edit history | Indefinite | **Legitimate interest** — audit trail |
| `PlannedSession` | `date`, `slot`, `sessionType`, `description` | Training planning | Indefinite | **Contract** |
| `NotificationPreference` | All fields | User communication preferences | Indefinite | **Consent** (for email) / **Contract** (for in-app) |
| `HorseDocument` | `fileUrl`, `fileName`, `category` | Document storage (insurance, passports, vet records) | Indefinite | **Contract** |

### 1.4 Uploaded Files (on disk)

| Storage Path | Content | Access Control | Retention |
|-------------|---------|---------------|-----------|
| `/app/uploads/horses/` | Horse photos (WebP) | JWT-authenticated static serving | Indefinite |
| `/app/uploads/records/` | Vet/farrier/invoice/document files (WebP/PDF) | JWT-authenticated static serving | Indefinite |

### 1.5 Data Controller / Processor Relationships

| Scenario | Data Controller | Data Processor | Notes |
|----------|----------------|---------------|-------|
| Individual owner using app | The individual | App operator (you) | Standard SaaS controller-processor |
| Stable owner managing staff | Stable owner (as employer/engager) | App operator | Stable owner determines purposes; DPA needed |
| Stable owner recording third-party practitioner names | Stable owner | App operator | Third-party data — practitioner hasn't consented |
| Future: programme marketplace | Trainer (content creator) + purchasing stable | App operator | Joint controller elements possible |

### 1.6 Third-Party Data Processors (Sub-processors)

| Service | Data Shared | Purpose | DPA Status |
|---------|------------|---------|------------|
| Resend (email) | User email addresses, invite/reset URLs | Transactional email delivery | **Needed** — Resend has a DPA but you must sign it |
| Cloudflare (CDN/DNS) | All traffic (IP addresses, request metadata) | Reverse proxy, DDoS protection | **Needed** — Cloudflare provides a DPA |
| DigitalOcean (hosting) | All stored data | Infrastructure hosting | **Needed** — DigitalOcean provides a DPA |

---

## 2. Compliance Gap List

Severity key:
- **BLOCKER** — must fix before allowing any external user
- **SHOULD FIX** — should fix before public launch or very shortly after
- **NICE TO HAVE** — strengthens trust and competitiveness

### BLOCKERS

| # | Gap | Description | Fix |
|---|-----|-------------|-----|
| 1 | **No Privacy Policy** | GDPR Art 13/14 requires clear notice of what data is collected, why, how long, and user rights. UK GDPR and App Store both require this. | Create and publish at `/privacy`. Stub provided below. |
| 2 | **No Terms of Service** | No contractual framework for multi-user SaaS. Needed to establish lawful basis (contract) and limit liability. | Create and publish at `/terms`. Stub provided below. |
| 3 | **No user self-service account deletion** | GDPR Art 17 (right to erasure). Currently only admins can delete users. Users cannot delete their own accounts. Apple App Store requires account deletion capability. | Add `DELETE /api/users/me` endpoint + frontend UI. |
| 4 | **No data export / portability** | GDPR Art 20 (right to data portability). No mechanism for users to download their data in a machine-readable format. | Add `GET /api/users/me/export` returning JSON of all user data. |
| 5 | **No consent capture at registration** | Registration form collects name/email/password but does not record acceptance of Privacy Policy or ToS. No consent timestamp stored. | Add `acceptedTermsAt` and `acceptedPrivacyAt` fields to User; checkbox on registration form. |
| 6 | **No data retention policy or automated cleanup** | All data (including security events with IP addresses) is retained indefinitely. GDPR requires data minimisation and storage limitation. | Define retention periods; implement scheduled cleanup job. |
| 7 | **Refresh tokens cannot be revoked** | No token blacklist or rotation. Password change does not invalidate existing sessions. A compromised refresh token grants access for up to 7 days. | Implement token version counter on User or a refresh token table. |

### SHOULD FIX

| # | Gap | Description | Fix |
|---|-----|-------------|-----|
| 8 | **No Cookie/Storage Policy** | App uses localStorage for JWT tokens. While not cookies, UK ICO guidance considers localStorage under PECR if used for tracking. Should disclose. | Add brief storage notice to Privacy Policy (no separate cookie banner needed since no cookies are set). |
| 9 | **SecurityEvent retains IP/UA indefinitely** | IP addresses are personal data under GDPR. Security logs should have a defined retention period (e.g. 90 days). | Add a cron job or Prisma scheduled task to purge events older than retention period. |
| 10 | **Invite tokens retained after use** | Used invite tokens (containing email addresses) are kept forever. They serve no purpose after acceptance. | Purge used/expired invite tokens periodically (e.g. 30 days after use/expiry). |
| 11 | **Password reset tokens retained after use** | Same issue as invite tokens. | Purge used/expired password reset tokens periodically. |
| 12 | **No Content-Security-Policy header** | Missing CSP header leaves the app more vulnerable to XSS. | Add CSP header in the security middleware in `index.ts`. |
| 13 | **Metrics endpoint is unauthenticated** | `/api/metrics` (Prometheus) exposes internal server metrics without auth. | Gate behind admin auth or restrict to internal Docker network. |
| 14 | **Third-party practitioner data collected without notice** | Vet/farrier/dentist names and contact numbers are third-party personal data. The practitioner has not consented and is not informed. | Add notice in Privacy Policy; consider whether legitimate interest applies; implement purpose limitation. |
| 15 | **No DPA template for stable owners** | Stable owners act as data controllers for their staff/clients. They need a Data Processing Agreement with the app operator. | Produce DPA template. See section 4 below. |
| 16 | **Email address not editable by user** | UI shows email as read-only. No mechanism for users to update their email (right to rectification, Art 16). | Add email change flow with verification. |
| 17 | **`rider` field is unstructured free text** | `ActualSessionLog.rider` can contain any text including names of people not on the platform. No way to identify or purge this data. | Consider making this a foreign key to User, or document that it may contain third-party PII. |

### NICE TO HAVE

| # | Gap | Description | Fix |
|---|-----|-------------|-----|
| 18 | **No breach notification process** | GDPR Art 33/34 requires notifying ICO within 72 hours and affected users without undue delay. No documented process exists. | Create an incident response runbook. |
| 19 | **No DPIA (Data Protection Impact Assessment)** | Multi-tenant SaaS processing health data (for horses, but linked to individuals) and financial data may warrant a DPIA. | Conduct and document a DPIA before launch. |
| 20 | **No automated subject access request handling** | GDPR Art 15 (right of access). Currently would require manual database queries to fulfil a SAR. | The data export endpoint (#4) partially addresses this. Add admin tooling for SAR fulfilment. |
| 21 | **Console email adapter logs tokens to stdout** | In development mode, the console email adapter prints reset/invite URLs (containing tokens) to stdout. Not a production issue but a dev hygiene concern. | Redact tokens in console output or warn explicitly. |
| 22 | **No Helmet.js** | Security headers are manually set. Helmet provides a well-maintained, comprehensive default. | Replace manual headers with Helmet. |
| 23 | **No database encryption at rest** | PostgreSQL data is stored unencrypted on disk. If the server is compromised, all data is readable. | Enable PostgreSQL TDE or use encrypted volumes on the hosting provider. |
| 24 | **No audit log for data access** | Security events cover auth actions but not data reads. GDPR accountability would benefit from knowing who accessed whose data. | Consider adding read audit logging for sensitive endpoints. |

---

## 3. Legal Document Stubs

### 3.1 Privacy Policy Stub

See `PRIVACY-POLICY-STUB.md` in this directory.

### 3.2 Terms of Service Stub

See `TERMS-OF-SERVICE-STUB.md` in this directory.

### 3.3 Data Processing Agreement

**Assessment**: A DPA template IS needed for the stable-owner-as-controller model.

When a stable owner uses the app to manage staff, clients, and horse records, the stable owner is the data controller and the app operator is the data processor. Under GDPR Art 28, a written agreement is required.

Key DPA provisions needed:
- Subject matter and duration of processing
- Nature and purpose of processing
- Types of personal data processed (per the inventory above)
- Categories of data subjects (stable staff, horse owners, third-party practitioners)
- Obligations of the processor (security measures, sub-processor notification, breach notification, data return/deletion)
- Sub-processor list (Resend, Cloudflare, DigitalOcean)

**Recommendation**: Use a DPA template based on the EU Standard Contractual Clauses (processor module) or the ICO's template. This should be prepared by a solicitor given the specific multi-tenant architecture.

---

## 4. Apple App Store Readiness

### 4.1 Privacy Nutrition Labels

Based on the data inventory, the following App Tracking Transparency categories would need to be declared:

| Category | Data Types | Linked to Identity | Used for Tracking |
|----------|-----------|-------------------|------------------|
| **Contact Info** | Email address, name | Yes | No |
| **Identifiers** | User ID (UUID) | Yes | No |
| **Usage Data** | Session logs, training activity | Yes | No |
| **Financial Info** | Invoices, expenses, cost splits | Yes | No |
| **Sensitive Info** | N/A (horse health data is not human health data) | N/A | N/A |
| **Location** | Stable address (user-provided, not device location) | Yes | No |
| **Diagnostics** | Security events (IP, user agent) | Yes | No |

**"Used for Tracking"** can remain "No" as long as no third-party analytics, advertising SDKs, or cross-app tracking are added.

### 4.2 Account Deletion Requirement (App Store Review Guideline 5.1.1(v))

**Status: NOT MET**

Apple requires that apps supporting account creation must also let users:
1. **Delete their account from within the app**
2. Delete all associated data (or clearly explain what is retained and why)
3. Complete deletion within a reasonable time

**Current state**: Only admins can delete users via `DELETE /api/users/:id`. There is no self-service deletion.

**Required changes**:
- Add `DELETE /api/users/me` endpoint that cascades deletion of all user data
- Add deletion confirmation UI in the user profile
- Decide on data retention after deletion (e.g., anonymise audit logs rather than deleting, retain financial records for tax compliance with anonymised user reference)
- Email confirmation before deletion (grace period recommended)

### 4.3 Other App Store Flags

| Guideline | Status | Notes |
|-----------|--------|-------|
| **5.1.1(i) Data Collection & Storage** | Needs Privacy Policy URL | Must be provided during App Store Connect submission |
| **5.1.1(ii) Data Use and Sharing** | OK | No third-party data sharing currently |
| **5.1.2 Data Use and Sharing (Kids)** | N/A | Not a children's app |
| **3.1.1 In-App Purchase** | Future concern | Programme marketplace will need IAP if distributed via App Store |
| **4.0 Design (PWA)** | N/A for now | PWA via Safari does not go through App Store review; only relevant if wrapping in a native shell |
| **2.1 Performance** | Check | If wrapping PWA in WKWebView, ensure it meets performance standards |

---

## 5. Security Observations

### 5.1 Authentication & Session Management

| Finding | Severity | Detail |
|---------|----------|--------|
| **No refresh token revocation** | HIGH | Refresh tokens are stateless JWTs with 7-day expiry. Changing password does not invalidate existing tokens. A stolen refresh token grants 7 days of access. |
| **JWT stored in localStorage** | MEDIUM | Vulnerable to XSS (any injected script can read tokens). HttpOnly cookies would be more secure, but require CSRF protection. Acceptable for now if CSP is implemented. |
| **No session invalidation on password change** | HIGH | When a user changes their password, all existing access/refresh tokens remain valid until they naturally expire. |
| **Invite token is a UUID (not cryptographically random)** | LOW | UUIDv4 is pseudo-random and generally adequate, but `crypto.randomBytes()` (as used for password reset tokens) would be stronger. |

### 5.2 Input Validation & Injection

| Finding | Severity | Detail |
|---------|----------|--------|
| **Zod validation on all endpoints** | GOOD | All request bodies are validated with Zod schemas. |
| **Prisma ORM (parameterised queries)** | GOOD | No raw SQL detected; Prisma prevents SQL injection. |
| **File upload type checking** | GOOD | Both MIME type and extension validated; images processed through Sharp (strips EXIF/metadata). |
| **Programme HTML sanitised** | GOOD | Cheerio sanitisation on HTML uploads. |

### 5.3 Infrastructure

| Finding | Severity | Detail |
|---------|----------|--------|
| **Metrics endpoint unauthenticated** | MEDIUM | `/api/metrics` exposes Prometheus metrics (request counts, response times, memory usage) without authentication. |
| **No CSP header** | MEDIUM | Without Content-Security-Policy, XSS attacks can load arbitrary external scripts. |
| **HSTS enabled in production** | GOOD | 1-year max-age with includeSubDomains. |
| **CORS restricted in production** | GOOD | Only `APP_URL` origin allowed. |
| **Rate limiting comprehensive** | GOOD | Login, invite, password reset, and general API all rate-limited. |
| **Security event logging** | GOOD | Comprehensive logging of auth events with IP and user agent. |
| **Password policy strong** | GOOD | 12+ chars, uppercase, lowercase, digit, special character. Bcrypt with cost factor 12. |
| **Password reset tokens hashed** | GOOD | SHA-256 hash stored; raw token only in email. |
| **Upload files auth-gated** | GOOD | Static file serving requires JWT Bearer token. |

### 5.4 Multi-Tenant Data Isolation

| Finding | Severity | Detail |
|---------|----------|--------|
| **Horse-level RBAC** | GOOD | `requireHorseAccess` middleware checks assignment/stable membership before granting access. |
| **Stable-level scoping** | PARTIAL | Some routes (invoices, stables) scope by stable, but the scoping relies on the frontend sending the correct stableId. Backend should verify stable membership on all stable-scoped operations. |
| **Admin sees all data** | BY DESIGN | ADMIN role bypasses all access checks. Acceptable for single-tenant; needs review for multi-tenant SaaS where each stable should have its own admin. |
| **No row-level security in DB** | INFO | All isolation is at the application layer. If a code bug bypasses RBAC, data leaks across tenants. PostgreSQL RLS would add a defence-in-depth layer. |

---

## 6. Forward-Looking Improvements

Prioritised by impact on public-launch credibility and competitive positioning.

### P0 — Required for Launch

1. **Implement account self-deletion** (GDPR Art 17 + App Store requirement)
2. **Publish Privacy Policy and Terms of Service** (GDPR Art 13 + App Store requirement)
3. **Add consent capture at registration** (checkbox + timestamp for ToS/Privacy acceptance)
4. **Implement data export endpoint** (GDPR Art 20 — data portability)
5. **Implement refresh token revocation** (either token versioning on User model or a refresh token table)
6. **Define and implement data retention policy** (security events: 90 days; used tokens: 30 days; deleted users: anonymise after 30 days)

### P1 — Should Complete Before or Shortly After Launch

7. **Add Content-Security-Policy header** — prevents XSS escalation
8. **Authenticate the metrics endpoint** — or bind Prometheus scraping to internal Docker network only
9. **Add email change flow** — email verification with confirmation link
10. **Sign DPAs with sub-processors** — Resend, Cloudflare, DigitalOcean
11. **Produce DPA template for stable owners** — required when stable owners are controllers
12. **Implement scheduled data cleanup job** — purge expired tokens, old security events, soft-deleted user data

### P2 — Product Maturity for Competitive SaaS

13. **Multi-tenant admin model** — replace global ADMIN with per-stable admin role (STABLE_ADMIN); critical for multi-stable SaaS
14. **Programme marketplace** — implement with proper data controller separation; trainers as joint controllers with purchasing stables; IAP compliance if going native
15. **PWA enhancements** — push notifications via Web Push API (requires separate GDPR consent), offline session logging with background sync
16. **RPE vs pace mode toggle** — already on roadmap; no compliance implications
17. **Stable invite model improvements** — stable-scoped invites rather than global admin invites; invite links should encode the target stable
18. **Row-level security in PostgreSQL** — defence-in-depth for multi-tenant isolation
19. **Structured logging** — replace `console.log`/`console.error` with Pino or Winston; ensure PII is never logged at INFO level; structured JSON for log aggregation
20. **Breach notification runbook** — documented process for ICO notification within 72 hours
21. **DPIA documentation** — formal Data Protection Impact Assessment before scaling to significant user numbers
22. **Automated SAR handling** — admin UI for processing Subject Access Requests with data export and redaction tools
