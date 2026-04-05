# Privacy Policy — Smart Stable Manager

> **DRAFT STUB — NOT FOR PUBLICATION**
> This document must be reviewed and approved by a qualified solicitor before being published. It is structured to cover the data actually collected by the application as of the audit date (2026-04-05). Placeholders are marked with `[PLACEHOLDER]`.

**Last updated**: [DATE]
**Data Controller**: [YOUR LEGAL ENTITY NAME], [REGISTERED ADDRESS], [COMPANY NUMBER]
**Contact**: [DATA PROTECTION CONTACT EMAIL]

---

## 1. Who We Are

Smart Stable Manager ("the Service") is operated by [YOUR LEGAL ENTITY NAME] ("we", "us", "our"). We provide a web-based application for managing horses, training programmes, stable records, and associated activities.

This Privacy Policy explains how we collect, use, store, and protect your personal data when you use our Service. It applies to all users: stable owners, riders, grooms, trainers, and anyone who interacts with the platform.

We are the **data processor** for personal data entered by stable owners about their staff, clients, and third-party practitioners. The stable owner is the **data controller** for that data. See Section 10 for details.

---

## 2. What Data We Collect

### 2.1 Account Data

When you register or accept an invite, we collect:

| Data | Purpose | Lawful Basis |
|------|---------|-------------|
| Email address | Account identifier, login, transactional emails | Performance of contract |
| Full name | Display name within the app | Performance of contract |
| Password (stored as bcrypt hash) | Authentication | Performance of contract |
| Account role (e.g. Owner, Rider, Groom) | Access control | Performance of contract |

### 2.2 Stable and Horse Data

| Data | Purpose | Lawful Basis |
|------|---------|-------------|
| Stable name and address | Identifying and managing stables | Performance of contract |
| Horse names, breed, age, identifying information | Horse management | Performance of contract |
| Horse photos | Visual identification | Performance of contract |
| Owner notes | Free-text notes about horses | Performance of contract |

### 2.3 Training and Activity Data

| Data | Purpose | Lawful Basis |
|------|---------|-------------|
| Planned sessions (date, type, duration, intensity) | Training programme management | Performance of contract |
| Actual session logs (date, type, duration, RPE, rider name, notes) | Training record keeping | Performance of contract |
| Session audit history (previous/new data, editor) | Accountability and edit tracking | Legitimate interest |
| Programme content (schedules, manuals) | Training programme delivery | Performance of contract |

### 2.4 Health and Appointment Records

| Data | Purpose | Lawful Basis |
|------|---------|-------------|
| Vet, farrier, and dentist visit records | Horse health management | Performance of contract |
| Practitioner names and contact numbers | Appointment scheduling | Legitimate interest |
| Vaccination records | Health compliance | Performance of contract |
| Uploaded documents (insurance, passports, vet records) | Document storage | Performance of contract |
| Appointment details (date, type, location, notes) | Scheduling | Performance of contract |

### 2.5 Financial Data

| Data | Purpose | Lawful Basis |
|------|---------|-------------|
| Invoice amounts, suppliers, categories | Cost tracking | Performance of contract |
| Cost splits per horse and owner | Expense allocation | Performance of contract |
| Recurring invoice templates | Billing automation | Performance of contract |
| Expense notes and receipts | Financial record keeping | Performance of contract |

### 2.6 Technical and Security Data

| Data | Purpose | Lawful Basis |
|------|---------|-------------|
| IP address (on authentication events) | Security monitoring, fraud prevention | Legitimate interest |
| Browser user agent (on authentication events) | Security monitoring | Legitimate interest |
| Authentication event logs (login, password change, invite actions) | Security audit trail | Legitimate interest |
| Notification preferences | Email delivery preferences | Consent (for email notifications) |

### 2.7 Data We Do NOT Collect

- We do not use cookies for tracking or analytics
- We do not use third-party analytics services (no Google Analytics, no tracking pixels)
- We do not collect device location data
- We do not collect biometric data
- We do not sell or share your data with advertisers

---

## 3. How We Use Your Data

We use your personal data exclusively for:

1. **Providing the Service** — account management, horse records, training plans, health tracking, financial management
2. **Sending transactional emails** — invite links, password reset links, notification digests (only when you opt in)
3. **Security monitoring** — detecting and preventing unauthorised access, abuse, and fraud
4. **Maintaining audit trails** — tracking edits to training sessions for accountability

We do not use your data for profiling, automated decision-making, or marketing purposes.

---

## 4. How We Store and Protect Your Data

- Passwords are hashed using bcrypt (cost factor 12) and are never stored in plaintext
- Password reset tokens are stored as SHA-256 hashes; the raw token exists only in the email sent to you
- All connections to the Service are encrypted with TLS (HTTPS enforced via HSTS)
- Access to horse records and stable data is controlled by role-based access control (RBAC) at the application level
- Uploaded files are served only to authenticated users with appropriate permissions
- The database is hosted on [HOSTING PROVIDER] with [ENCRYPTION DETAILS]

---

## 5. Who We Share Your Data With

We share your personal data only with the following categories of service providers, each under a Data Processing Agreement:

| Provider | Purpose | Data Shared |
|----------|---------|------------|
| [EMAIL PROVIDER, e.g. Resend] | Transactional email delivery | Email addresses, email content |
| [HOSTING PROVIDER, e.g. DigitalOcean] | Infrastructure hosting | All stored data (encrypted at rest) |
| [CDN PROVIDER, e.g. Cloudflare] | DDoS protection, DNS, TLS termination | IP addresses, request metadata |

We do not sell your data. We do not share your data with advertisers or data brokers.

---

## 6. How Long We Keep Your Data

| Data Category | Retention Period |
|--------------|-----------------|
| Account data | Until you delete your account, or [X] months after last login |
| Security event logs (IP, user agent) | [90 days] from the event date |
| Used invite and password reset tokens | [30 days] after use or expiry, then permanently deleted |
| Horse, training, health, and financial records | Until you delete your account; then anonymised or deleted within [30 days] |
| Uploaded files | Until you delete the file or your account |

> [PLACEHOLDER: Define specific retention periods based on business and legal requirements. Financial records may need to be retained for [6 years] under UK tax law.]

---

## 7. Your Rights

Under UK GDPR, you have the right to:

1. **Access** your personal data (Art 15) — request a copy of all data we hold about you
2. **Rectification** (Art 16) — correct inaccurate data (you can edit your name in your profile; email changes require verification)
3. **Erasure** (Art 17) — delete your account and all associated data
4. **Data portability** (Art 20) — export your data in a machine-readable format (JSON)
5. **Restrict processing** (Art 18) — request that we stop processing your data in certain circumstances
6. **Object to processing** (Art 21) — object to processing based on legitimate interest
7. **Withdraw consent** — for optional email notifications, you can change your preferences at any time in Settings

To exercise any of these rights, contact us at [DATA PROTECTION CONTACT EMAIL] or use the self-service options in your account settings.

We will respond to all requests within **one calendar month** of receiving them, as required by UK GDPR.

---

## 8. Account Deletion

You can delete your account at any time from your profile settings. When you delete your account:

- Your personal data (email, name, password hash) is permanently deleted
- Your horse records, training logs, and uploaded files are permanently deleted
- Security audit logs are anonymised (your name and email are removed, but the event record is retained for [90 days] for security purposes)
- Financial records may be retained in anonymised form for [6 years] for tax compliance purposes
- If you are the owner of a stable, you must transfer ownership or delete the stable before deleting your account

---

## 9. Children's Data

The Service is not intended for use by children under 16. We do not knowingly collect personal data from children. If you believe a child has provided us with personal data, contact us at [DATA PROTECTION CONTACT EMAIL].

---

## 10. Stable Owners as Data Controllers

If you are a stable owner using the Service to manage staff, clients, and horse records on behalf of your stable, you are the **data controller** for the personal data you enter about your staff and clients. We act as a **data processor** on your behalf.

This means:
- You are responsible for having a lawful basis to process your staff's and clients' data
- You should inform your staff and clients about how their data is processed (you may share this Privacy Policy with them or produce your own)
- You are responsible for responding to data subject requests from your staff and clients (we will assist you as processor)
- Our processing of that data is governed by a Data Processing Agreement between us — contact [DATA PROTECTION CONTACT EMAIL] to obtain a copy

### Third-party practitioner data

When you record the names and contact details of vets, farriers, dentists, and other practitioners, you are entering personal data about individuals who may not have a direct relationship with the Service. You should ensure you have a lawful basis for recording this data (typically legitimate interest in managing appointments) and consider informing those individuals.

---

## 11. International Transfers

Your data is stored and processed in [COUNTRY/REGION, e.g. the United Kingdom / European Economic Area]. If we use sub-processors based outside the UK, we ensure appropriate safeguards are in place (e.g. Standard Contractual Clauses).

---

## 12. Changes to This Policy

We may update this Privacy Policy from time to time. We will notify you of material changes by [email / in-app notification]. The "Last updated" date at the top of this page indicates when the policy was last revised.

---

## 13. Contact Us

If you have questions about this Privacy Policy or wish to exercise your data rights:

- **Email**: [DATA PROTECTION CONTACT EMAIL]
- **Post**: [REGISTERED ADDRESS]

You also have the right to lodge a complaint with the **Information Commissioner's Office (ICO)**:
- Website: https://ico.org.uk
- Phone: 0303 123 1113

---

> **Note for solicitor review**: This stub references the actual data fields found in the Prisma schema (`User.email`, `User.name`, `SecurityEvent.ipAddress`, `Appointment.contactNumber`, etc.). The retention periods are placeholders and need to be set based on business requirements and legal obligations (e.g. UK tax law requires 6-year retention of financial records). The controller/processor distinction in Section 10 is based on the multi-tenant stable model and needs verification against the actual commercial terms.
