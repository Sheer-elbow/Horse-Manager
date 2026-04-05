import { Link } from 'react-router-dom';

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <Link to="/" className="text-brand-600 hover:underline text-sm">&larr; Back to app</Link>
        </div>
        <div className="bg-white rounded-xl border p-8 prose prose-sm max-w-none">
          <h1>Terms of Service</h1>
          <p className="text-gray-500 text-sm">Last updated: [DATE]</p>

          <h2>1. About the Service</h2>
          <p>
            Smart Stable Manager (&ldquo;the Service&rdquo;) is a web-based application for managing horses,
            training programmes, stable records, health appointments, and associated financial records.
            The Service is operated by [YOUR LEGAL ENTITY NAME] (&ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;).
          </p>

          <h2>2. Acceptance</h2>
          <p>
            By creating an account or using the Service, you agree to these Terms and our{' '}
            <Link to="/privacy">Privacy Policy</Link>. If you do not agree, do not use the Service.
          </p>

          <h2>3. Account Types</h2>
          <h3>Individual Owners</h3>
          <p>Register to manage your own horses. You are responsible for the accuracy of the data you enter.</p>
          <h3>Stable Owners</h3>
          <p>
            Create and manage stables, invite staff, assign horses, record financial information.
            As a stable owner, you are the <strong>data controller</strong> for personal data you enter about staff and clients.
          </p>
          <h3>Staff Members</h3>
          <p>Access is governed by permissions granted by the stable owner or admin.</p>

          <h2>4. Acceptable Use</h2>
          <p>You agree not to:</p>
          <ul>
            <li>Use the Service for any unlawful purpose</li>
            <li>Share your account credentials</li>
            <li>Attempt to access other users&apos; data without authorisation</li>
            <li>Upload malicious files or content</li>
            <li>Circumvent access controls or security measures</li>
          </ul>

          <h2>5. Your Data</h2>
          <p>
            You retain ownership of all data you enter. We do not claim intellectual property rights over your data.
            You may export your data at any time and delete your account from your profile settings.
          </p>

          <h2>6. Service Availability</h2>
          <p>
            We aim to provide a reliable service but do not guarantee uninterrupted availability.
            The Service is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;.
          </p>

          <h2>7. Limitation of Liability</h2>
          <p>
            To the maximum extent permitted by law, we are not liable for indirect, incidental, or consequential damages.
            We are not liable for decisions made based on data in the Service.
            Nothing in these terms excludes liability for death or personal injury caused by negligence, or fraud.
          </p>

          <h2>8. Termination</h2>
          <p>
            You may terminate by deleting your account. We may suspend or terminate accounts that violate these terms
            with reasonable notice.
          </p>

          <h2>9. Governing Law</h2>
          <p>
            These terms are governed by the laws of [England and Wales].
            Disputes are subject to the exclusive jurisdiction of the courts of [England and Wales].
          </p>

          <h2>10. Changes</h2>
          <p>
            We may update these terms. Material changes will be notified at least 14 days before taking effect.
          </p>

          <h2>11. Contact</h2>
          <p>Email: [CONTACT EMAIL]</p>
        </div>
      </div>
    </div>
  );
}
