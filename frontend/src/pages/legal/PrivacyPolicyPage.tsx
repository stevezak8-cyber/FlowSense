import { LegalLayout } from "./LegalLayout"

export default function PrivacyPolicyPage() {
  return (
    <LegalLayout title="Privacy Policy" effectiveDate="[Effective Date]">
      <section>
        <p>
          This Privacy Policy explains how <strong>Pneuros Software LLC</strong> ("Pneuros,"
          "we," "us," or "our") collects, uses, and shares information in connection with the
          Pneuros field service management platform (the "Service").
        </p>
      </section>

      <section>
        <h2>1. Information We Collect</h2>
        <p><strong>Account information.</strong> Name, email address, phone number, role (office, technician, or customer), and organization details, provided when an account is created or a user is invited.</p>
        <p><strong>Customer and job data.</strong> Service addresses, equipment details, job history, photos, voice notes, messages, and appointment records that your organization enters or that customers submit when booking service.</p>
        <p><strong>Location data.</strong> Approximate or precise technician location while a technician app session is active, used for dispatch, routing, and "on the way" updates to customers.</p>
        <p><strong>Payment information.</strong> Invoice, estimate, and subscription payment data. Card details are collected and processed directly by our payment processor, Stripe — Pneuros does not store full card numbers.</p>
        <p><strong>Communications.</strong> Content of messages sent through the in-app messaging, concierge chat, and any support communications with us.</p>
        <p><strong>Usage and device data.</strong> Log data, device and browser type, and general usage information collected automatically to operate, secure, and improve the Service.</p>
      </section>

      <section>
        <h2>2. How We Use Information</h2>
        <ul>
          <li>To provide, operate, and maintain the Service, including scheduling, dispatch, invoicing, and messaging;</li>
          <li>To process payments and payouts through Stripe;</li>
          <li>To send transactional email, SMS, and push notifications about jobs, appointments, and payments;</li>
          <li>To power AI-assisted features, such as estimate generation, dispatch suggestions, and the customer concierge chat;</li>
          <li>To detect, investigate, and prevent fraud, abuse, and security incidents;</li>
          <li>To comply with legal obligations and enforce our Terms of Service.</li>
        </ul>
      </section>

      <section>
        <h2>3. How We Share Information</h2>
        <p>
          We do not sell personal information. We share information with the following
          categories of service providers, solely to operate the Service:
        </p>
        <ul>
          <li><strong>Stripe</strong> — payment processing, invoicing, and subscription billing.</li>
          <li><strong>Twilio</strong> — SMS notifications (e.g. appointment and dispatch alerts).</li>
          <li><strong>Resend</strong> — transactional email delivery (receipts, invoices, estimates).</li>
          <li><strong>Anthropic</strong> — processes job and estimate details to power AI-assisted features (dispatch suggestions, estimate generation, concierge chat, job-completion summaries).</li>
          <li><strong>Cloud hosting and database providers</strong> — to store and run the Service infrastructure.</li>
        </ul>
        <p>
          These providers are only permitted to use information as necessary to provide their
          service to us. We may also disclose information where required by law, to protect
          the rights and safety of Pneuros and its users, or in connection with a merger,
          acquisition, or sale of assets.
        </p>
        <p>
          Within an organization's Account, office administrators can access job, customer, and
          technician data associated with that organization as needed to run their business;
          technicians and customers see data scoped to their own role and assigned jobs.
        </p>
      </section>

      <section>
        <h2>4. Data Retention</h2>
        <p>
          We retain account and job data for as long as an Account is active, and for a
          reasonable period afterward as needed for legal, tax, billing, or dispute-resolution
          purposes. You may request deletion of your organization's data by contacting us,
          subject to records we are required to retain by law (for example, financial
          transaction records).
        </p>
      </section>

      <section>
        <h2>5. Your Choices</h2>
        <ul>
          <li>Customers can opt out of non-essential email and SMS notifications from account or notification settings, subject to required transactional messages.</li>
          <li>Technicians can disable location sharing when not on an active job, subject to their organization's dispatch requirements.</li>
          <li>You can request access to, correction of, or deletion of your personal information by contacting us at the address below.</li>
        </ul>
      </section>

      <section>
        <h2>6. Data Security</h2>
        <p>
          We use industry-standard safeguards — including encryption in transit, access
          controls scoped by role and organization, and secure credential storage — to protect
          information against unauthorized access, alteration, or disclosure. No system is
          completely secure, and we cannot guarantee absolute security.
        </p>
      </section>

      <section>
        <h2>7. Children's Privacy</h2>
        <p>
          The Service is intended for business use and is not directed to individuals under 18.
          We do not knowingly collect personal information from children.
        </p>
      </section>

      <section>
        <h2>8. International Users</h2>
        <p>
          Pneuros is operated from the <strong>United States</strong> and information may be
          processed and stored there or in other countries where our service providers
          operate.
        </p>
      </section>

      <section>
        <h2>9. Changes to This Policy</h2>
        <p>
          We may update this Privacy Policy from time to time. Material changes will be
          communicated by email or in-app notice before they take effect.
        </p>
      </section>

      <section>
        <h2>10. Contact</h2>
        <p>
          Questions about this Privacy Policy, or requests regarding your personal information,
          can be sent to <a href="mailto:stevezak8@gmail.com">stevezak8@gmail.com</a>.
        </p>
      </section>
    </LegalLayout>
  )
}
