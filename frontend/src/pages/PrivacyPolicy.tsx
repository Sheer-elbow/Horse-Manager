import { Link } from 'react-router-dom';

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <Link to="/" className="text-brand-600 hover:underline text-sm">&larr; Back to app</Link>
        </div>
        <div className="bg-white rounded-xl border p-8 prose prose-sm max-w-none">
          <h1>Privacy Policy</h1>
          <p className="text-gray-500 text-sm">Last updated: [DATE]</p>

          <h2>1. Who We Are</h2>
          <p>
            Smart Stable Manager (&ldquo;the Service&rdquo;) is operated by [YOUR LEGAL ENTITY NAME] (&ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;).
            We provide a web-based application for managing horses, training programmes, stable records, and associated activities.
          </p>

          <h2>2. What Data We Collect</h2>
          <h3>Account Data</h3>
          <p>When you register, we collect your <strong>email address</strong>, <strong>name</strong>, and a <strong>password</strong> (stored as a secure hash, never in plaintext).</p>

          <h3>Stable and Horse Data</h3>
          <p>Stable name and address, horse names, breed, age, identifying information, photos, and owner notes.</p>

          <h3>Training and Activity Data</h3>
          <p>Planned sessions, actual session logs (date, type, duration, RPE, rider name, notes), session edit history, and training programme content.</p>

          <h3>Health and Appointment Records</h3>
          <p>Vet, farrier, and dentist visit records, practitioner names and contact numbers, vaccination records, uploaded documents (insurance, passports, vet records), and appointment details.</p>

          <h3>Financial Data</h3>
          <p>Invoice amounts, suppliers, categories, cost splits per horse/owner, recurring invoice templates, expense notes and receipts.</p>

          <h3>Technical and Security Data</h3>
          <p>IP address and browser user agent on authentication events (for security monitoring), authentication event logs. This data is retained for 90 days.</p>

          <h3>Data We Do NOT Collect</h3>
          <ul>
            <li>We do not use cookies for tracking or analytics</li>
            <li>We do not use third-party analytics services</li>
            <li>We do not collect device location data</li>
            <li>We do not sell or share your data with advertisers</li>
          </ul>

          <h2>3. How We Use Your Data</h2>
          <p>We use your personal data exclusively for:</p>
          <ol>
            <li><strong>Providing the Service</strong> &mdash; account management, horse records, training plans, health tracking, financial management</li>
            <li><strong>Transactional emails</strong> &mdash; invite links, password resets, notification digests (only when you opt in)</li>
            <li><strong>Security monitoring</strong> &mdash; detecting and preventing unauthorised access</li>
          </ol>
          <p>We do not use your data for profiling, automated decision-making, or marketing.</p>

          <h2>4. How We Protect Your Data</h2>
          <ul>
            <li>Passwords hashed with bcrypt (cost factor 12)</li>
            <li>All connections encrypted with TLS (HTTPS enforced)</li>
            <li>Role-based access control on all data</li>
            <li>Uploaded files served only to authenticated users with appropriate permissions</li>
          </ul>

          <h2>5. Data Retention</h2>
          <table>
            <thead><tr><th>Data</th><th>Retention</th></tr></thead>
            <tbody>
              <tr><td>Account data</td><td>Until you delete your account</td></tr>
              <tr><td>Security event logs</td><td>90 days</td></tr>
              <tr><td>Used invite/reset tokens</td><td>30 days after use</td></tr>
              <tr><td>Horse, training, health records</td><td>Until you delete your account</td></tr>
            </tbody>
          </table>

          <h2>6. Your Rights</h2>
          <p>Under UK GDPR / GDPR, you have the right to:</p>
          <ul>
            <li><strong>Access</strong> your personal data &mdash; use the &ldquo;Export my data&rdquo; feature in Settings</li>
            <li><strong>Rectification</strong> &mdash; edit your name in your profile</li>
            <li><strong>Erasure</strong> &mdash; delete your account from Settings</li>
            <li><strong>Data portability</strong> &mdash; export your data as JSON</li>
            <li><strong>Withdraw consent</strong> &mdash; change notification preferences at any time</li>
          </ul>
          <p>Contact us at [DATA PROTECTION CONTACT EMAIL] for any data rights requests.</p>

          <h2>7. Account Deletion</h2>
          <p>
            You can delete your account at any time from your profile settings.
            Your personal data will be permanently deleted. Security audit logs will be anonymised.
          </p>

          <h2>8. Stable Owners</h2>
          <p>
            If you are a stable owner managing staff and client data, you are the <strong>data controller</strong> for that data.
            We act as <strong>data processor</strong> on your behalf. Contact us for a Data Processing Agreement.
          </p>

          <h2>9. Contact</h2>
          <p>
            Email: [DATA PROTECTION CONTACT EMAIL]<br />
            You may also lodge a complaint with the <strong>Information Commissioner&apos;s Office (ICO)</strong> at <a href="https://ico.org.uk" target="_blank" rel="noopener noreferrer">ico.org.uk</a>.
          </p>
        </div>
      </div>
    </div>
  );
}
