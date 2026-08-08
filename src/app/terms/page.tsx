import Link from "next/link";
import {
  LegalH2,
  LegalH3,
  LegalShell,
} from "@/components/legal/legal-shell";
import {
  LEGAL_COMPANY,
  LEGAL_CONTACT_EMAIL,
  LEGAL_UPDATED,
  legalTradingAs,
  registeredOfficeLine,
} from "@/lib/legal";

export const metadata = {
  title: "Terms of Service & Privacy — HydraTax",
  description:
    "HydraTax terms of service, privacy policy, cookie policy and UK GDPR rights.",
};

export default function TermsPage() {
  const brand = LEGAL_COMPANY.tradingName;
  const email = LEGAL_CONTACT_EMAIL;
  const entity = legalTradingAs();

  return (
    <LegalShell
      title="Terms of Service & Legal Information"
      updated={LEGAL_UPDATED.terms}
    >
      <p>
        <strong className="text-ink">{entity}</strong>
        <br />
        Company number: {LEGAL_COMPANY.companyNumber}
        <br />
        Registered office: {registeredOfficeLine()}
        <br />
        Contact:{" "}
        <a className="font-semibold text-sea" href={`mailto:${email}`}>
          {email}
        </a>
      </p>

      <nav className="rounded-xl border border-line bg-sand/40 p-4 text-sm">
        <p className="font-semibold text-ink">On this page</p>
        <ul className="mt-2 space-y-1">
          <li>
            <a href="#terms" className="text-sea hover:underline">
              1. Terms of Service
            </a>
          </li>
          <li>
            <a href="#privacy" className="text-sea hover:underline">
              2. Privacy Policy
            </a>
          </li>
          <li>
            <a href="#cookies" className="text-sea hover:underline">
              3. Cookie Policy
            </a>
          </li>
          <li>
            <a href="#gdpr" className="text-sea hover:underline">
              4. Data Protection Rights (UK GDPR)
            </a>
          </li>
          <li>
            <a href="#liability" className="text-sea hover:underline">
              5. Liability &amp; Disclaimers
            </a>
          </li>
          <li>
            <a href="#contact" className="text-sea hover:underline">
              6. Contact Us
            </a>
          </li>
          <li>
            <Link href="/legal/dpa" className="text-sea hover:underline">
              Data Processing Agreement (DPA)
            </Link>
          </li>
        </ul>
      </nav>

      <section id="terms" className="scroll-mt-24 space-y-4">
        <LegalH2>1. Terms of Service</LegalH2>

        <LegalH3>1.1 Agreement</LegalH3>
        <p>
          The {brand} service is provided by {LEGAL_COMPANY.legalName}{" "}
          (company number {LEGAL_COMPANY.companyNumber}), trading as {brand}.
          By using {brand} services, you agree to these Terms of Service. If
          you&apos;re using {brand} on behalf of an organisation, you&apos;re
          agreeing to these terms for that organisation. These Terms of Service
          incorporate by reference our Privacy Policy,{" "}
          <Link href="/legal/dpa" className="font-semibold text-sea">
            Data Processing Agreement
          </Link>
          , and Sub-processor List.
        </p>

        <LegalH3>1.2 Service Description</LegalH3>
        <p>
          {brand} provides online practice software to help UK accountants,
          bookkeepers and businesses prepare and submit:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>MTD VAT returns to HMRC</li>
          <li>Corporation Tax returns (CT600) to HMRC</li>
          <li>Self Assessment / Income Tax digital updates to HMRC</li>
          <li>PAYE / RTI filings (FPS and EPS) to HMRC</li>
          <li>
            Companies House filings including confirmation statements, annual
            accounts (iXBRL) and related services
          </li>
          <li>Supporting ledgers, documents and practice workflow tools</li>
        </ul>

        <LegalH3>1.3 Eligibility</LegalH3>
        <p>To use {brand}, you must:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Be authorised to act on behalf of the practice or company you&apos;re
            filing for
          </li>
          <li>
            Have valid HMRC credentials (or agent credentials) for submissions
            you authorise
          </li>
          <li>
            Have valid Companies House authentication credentials where filing
            to Companies House
          </li>
          <li>
            Ensure the entities you file for qualify under applicable UK law for
            the filings you submit
          </li>
        </ul>

        <LegalH3>1.4 Your Responsibilities</LegalH3>
        <p>You are responsible for:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            The accuracy and completeness of all information you provide
          </li>
          <li>Maintaining the confidentiality of your login credentials</li>
          <li>
            Ensuring you have proper authorisation to file on behalf of each
            client or company
          </li>
          <li>
            Reviewing all documents before submission to HMRC and Companies
            House
          </li>
          <li>Meeting all statutory filing deadlines</li>
        </ul>

        <LegalH3>1.5 Acceptable Use</LegalH3>
        <p>You agree not to:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Use the service for any unlawful purpose or fraudulent activity</li>
          <li>Submit false or misleading information</li>
          <li>Attempt to access other users&apos; accounts or data</li>
          <li>
            Reverse engineer or attempt to extract the source code of our
            software
          </li>
          <li>
            Use automated systems or software to extract data from the service
            without permission
          </li>
        </ul>

        <LegalH3>1.6 Payment Terms</LegalH3>
        <p>
          {brand} operates on a subscription and/or per-filing basis as shown on
          our{" "}
          <Link href="/pricing" className="font-semibold text-sea">
            pricing page
          </Link>
          . All prices are exclusive of VAT unless stated otherwise. VAT at the
          prevailing rate may be added at checkout.
        </p>
        <p>
          <strong className="text-ink">Subscription coverage:</strong> Your paid
          plan unlocks the modules and client limits described at checkout
          (practice desk, VAT, Corporation Tax, Self Assessment, PAYE, Companies
          House discounts, and related features).
        </p>
        <p>
          <strong className="text-ink">Cancellation:</strong> If you cancel your
          subscription, access to paid features may end at the close of the
          billing period (or immediately where stated at cancellation). We
          recommend downloading any documents you need before cancelling.
        </p>
        <p>
          <strong className="text-ink">Refunds:</strong> Subscription and filing
          fees are generally non-refundable once access or a digital service has
          been provided. Refunds may be issued at our sole discretion in
          exceptional circumstances. To request a review, contact{" "}
          <a className="font-semibold text-sea" href={`mailto:${email}`}>
            {email}
          </a>
          .
        </p>
        <p>
          <strong className="text-ink">Fair usage:</strong> Plans are designed
          for the client volumes stated on the pricing page. If usage
          substantially exceeds the intended plan tier, we may contact you to
          discuss an upgrade so the service continues to meet your needs.
        </p>

        <LegalH3>1.7 Self-Serve Subscription Terms</LegalH3>
        <p>
          {brand} is primarily a self-serve subscription product. We do not
          enter into bespoke contracts, master services agreements, amended
          terms, or third-party non-disclosure agreements at the standard
          subscription tier. Confidentiality obligations are set out in these
          Terms of Service and in our Data Processing Agreement. Customers
          requiring negotiated paper should contact us to discuss options.
        </p>
      </section>

      <section id="privacy" className="scroll-mt-24 space-y-4">
        <LegalH2>2. Privacy Policy</LegalH2>
        <p>
          For UK GDPR purposes, the data controller of personal data relating
          to your account and use of the website is{" "}
          {LEGAL_COMPANY.legalName} (company number{" "}
          {LEGAL_COMPANY.companyNumber}), trading as {brand}. Where you use{" "}
          {brand} to process your clients&apos; personal data, you are typically
          the controller of that client data and we act as your processor under
          our{" "}
          <Link href="/legal/dpa" className="font-semibold text-sea">
            Data Processing Agreement
          </Link>
          .
        </p>

        <LegalH3>2.1 Information We Collect</LegalH3>
        <p>We collect information you provide directly to us, including:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Company and practice information (name, number, address)</li>
          <li>
            Financial and payroll data necessary for accounts, tax and RTI
            returns
          </li>
          <li>Contact information (email, name)</li>
          <li>
            HMRC and Companies House credentials (used for the submission you
            authorise; stored only as required to provide the service and in
            accordance with our security measures)
          </li>
        </ul>

        <LegalH3>2.2 How We Use Your Information</LegalH3>
        <p>We use the information we collect to:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Provide, maintain, and improve our services</li>
          <li>
            Process and submit your filings to HMRC and Companies House on your
            instruction
          </li>
          <li>Send you technical notices and support messages</li>
          <li>Respond to your comments and questions</li>
          <li>Comply with legal obligations</li>
        </ul>

        <LegalH3>2.3 Information Sharing</LegalH3>
        <p>
          We do not sell, trade, or rent your personal information. We share
          data only:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            With statutory recipients — HMRC and Companies House — to make
            filings on your instruction
          </li>
          <li>
            With our sub-processors — service providers we engage to deliver the
            platform (hosting, database, payment processing, email delivery).
            Each is bound by a written agreement with terms equivalent to those
            in our Data Processing Agreement. See{" "}
            <Link href="/legal/sub-processors" className="font-semibold text-sea">
              Sub-processors
            </Link>
            .
          </li>
          <li>With your consent or at your direction</li>
          <li>
            To comply with legal obligations or to protect our rights, privacy,
            safety, or property
          </li>
        </ul>

        <LegalH3>2.4 Retention</LegalH3>
        <p>
          We retain your data for the periods set out below. After the relevant
          period, data is deleted or anonymised. We retain longer where required
          by law (for example, accounting records under HMRC and Companies Act
          2006 requirements).
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-line text-ink">
                <th className="py-2 pr-3 font-semibold">Data type</th>
                <th className="py-2 pr-3 font-semibold">Retention period</th>
                <th className="py-2 font-semibold">Reason</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-line/70">
                <td className="py-2 pr-3">
                  Filings (returns, accounts, computations, supporting documents)
                </td>
                <td className="py-2 pr-3">
                  7 years from the end of the accounting period
                </td>
                <td className="py-2">
                  HMRC record-keeping (Finance Act 1998 Sch. 18)
                </td>
              </tr>
              <tr className="border-b border-line/70">
                <td className="py-2 pr-3">Account and billing records</td>
                <td className="py-2 pr-3">7 years from account closure</td>
                <td className="py-2">Companies Act 2006 / VAT record-keeping</td>
              </tr>
              <tr className="border-b border-line/70">
                <td className="py-2 pr-3">Support tickets and correspondence</td>
                <td className="py-2 pr-3">3 years from ticket resolution</td>
                <td className="py-2">Service quality and dispute resolution</td>
              </tr>
              <tr className="border-b border-line/70">
                <td className="py-2 pr-3">Marketing communications</td>
                <td className="py-2 pr-3">
                  Until you unsubscribe, then up to 30 days
                </td>
                <td className="py-2">PECR / GDPR compliance</td>
              </tr>
              <tr>
                <td className="py-2 pr-3">Server and audit logs</td>
                <td className="py-2 pr-3">90 days</td>
                <td className="py-2">
                  Security monitoring and operational diagnostics
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <LegalH3>2.5 Deletion</LegalH3>
        <p>
          You can request deletion of your account and associated data at any
          time by emailing{" "}
          <a className="font-semibold text-sea" href={`mailto:${email}`}>
            {email}
          </a>
          . We will:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Acknowledge your request within 5 working days</li>
          <li>
            Delete or anonymise your account, profile, and any data not subject
            to a legal retention obligation, within 30 days
          </li>
          <li>
            Retain only categories required by law (typically filing records for
            the statutory period), with identifiers redacted where possible
          </li>
          <li>
            Confirm completion in writing, including a summary of what was
            deleted and what was retained
          </li>
        </ul>

        <LegalH3>2.6 Security</LegalH3>
        <p>
          We implement appropriate technical and organisational measures to
          protect your data, including encryption in transit (TLS 1.2+), access
          controls, regular backups, and monitored production hosting.
        </p>
      </section>

      <section id="cookies" className="scroll-mt-24 space-y-4">
        <LegalH2>3. Cookie Policy</LegalH2>

        <LegalH3>3.1 What Are Cookies</LegalH3>
        <p>
          Cookies are small text files stored on your device when you visit our
          website. We use cookies to provide essential functionality and to
          measure how the service is used.
        </p>

        <LegalH3>3.2 Cookies We Use</LegalH3>
        <p>
          <strong className="text-ink">Essential cookies:</strong> required for
          the website to function properly — session cookies, security cookies
          (including CSRF protection), and preference cookies.
        </p>
        <p>
          <strong className="text-ink">Measurement cookies:</strong> we may use
          analytics or conversion-tracking tools to understand how visitors find
          and use the service. Providers are listed on our{" "}
          <Link href="/legal/sub-processors" className="font-semibold text-sea">
            Sub-processors
          </Link>{" "}
          page.
        </p>

        <LegalH3>3.3 Managing Cookies</LegalH3>
        <p>
          You can control or block cookies through your browser settings.
          Disabling essential cookies may prevent you from using certain
          features of our service.
        </p>
      </section>

      <section id="gdpr" className="scroll-mt-24 space-y-4">
        <LegalH2>4. Data Protection Rights (UK GDPR)</LegalH2>
        <p>
          Under UK data protection law you have the following rights in respect
          of your personal data:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong className="text-ink">Access</strong> — request a copy of
            your personal data
          </li>
          <li>
            <strong className="text-ink">Rectification</strong> — request
            correction of inaccurate data
          </li>
          <li>
            <strong className="text-ink">Erasure</strong> — request deletion,
            subject to legal retention requirements (see §2.4 and §2.5)
          </li>
          <li>
            <strong className="text-ink">Restriction</strong> — request that we
            limit processing
          </li>
          <li>
            <strong className="text-ink">Portability</strong> — request your
            data in a portable format
          </li>
          <li>
            <strong className="text-ink">Objection</strong> — object to certain
            types of processing
          </li>
        </ul>
        <p>
          To exercise any of these rights, contact{" "}
          <a className="font-semibold text-sea" href={`mailto:${email}`}>
            {email}
          </a>
          .
        </p>

        <LegalH3>4.1 Lawful Basis for Processing</LegalH3>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong className="text-ink">Contract</strong> — processing
            necessary to provide our services to you
          </li>
          <li>
            <strong className="text-ink">Legal obligation</strong> — compliance
            with HMRC, Companies House and tax legislation
          </li>
          <li>
            <strong className="text-ink">Legitimate interests</strong> —
            business operations, service improvement, fraud prevention and
            conversion measurement (where this does not override your rights)
          </li>
          <li>
            <strong className="text-ink">Consent</strong> — for non-essential
            cookies and marketing communications, withdrawable at any time
          </li>
        </ul>

        <LegalH3>4.2 International Transfers</LegalH3>
        <p>
          Production infrastructure may be provided by hosting and data
          providers in the UK, EEA or other countries. Transfers outside the UK
          rely on UK adequacy regulations (for EEA countries) or the UK
          International Data Transfer Agreement / UK Addendum to the EU Standard
          Contractual Clauses (or another approved mechanism). See{" "}
          <Link href="/legal/sub-processors" className="font-semibold text-sea">
            Sub-processors
          </Link>
          .
        </p>
      </section>

      <section id="liability" className="scroll-mt-24 space-y-4">
        <LegalH2>5. Liability &amp; Disclaimers</LegalH2>

        <LegalH3>5.1 Service Disclaimer</LegalH3>
        <p>
          <strong className="text-ink">Important:</strong> {brand} provides
          software tools to assist with tax and accounting compliance. We are
          not accountants, tax advisers, or legal professionals. The service
          does not constitute professional advice.
        </p>

        <LegalH3>5.2 Your Responsibility</LegalH3>
        <p>You remain fully responsible for:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>The accuracy of all information submitted</li>
          <li>Meeting all filing deadlines</li>
          <li>
            Ensuring compliance with all applicable laws and regulations
          </li>
          <li>Obtaining professional advice where appropriate</li>
        </ul>

        <LegalH3>5.3 Limitation of Liability</LegalH3>
        <p>
          <strong className="text-ink">No warranty:</strong> The service is
          provided &quot;as is&quot; and &quot;as available&quot; without
          warranties of any kind, whether express or implied, including but not
          limited to implied warranties of merchantability, fitness for a
          particular purpose, and non-infringement.
        </p>
        <p>
          <strong className="text-ink">Exclusion of liability:</strong> To the
          maximum extent permitted by applicable law, {brand} shall not be
          liable for:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Errors, inaccuracies, or omissions in calculations, tax
            computations, or generated documents
          </li>
          <li>
            Penalties, fines, interest, or other charges imposed by HMRC,
            Companies House, or any other authority
          </li>
          <li>
            Late filings, rejected submissions, or missed deadlines for any
            reason
          </li>
          <li>
            Indirect, incidental, special, consequential, or punitive damages
          </li>
          <li>
            Loss of profits, revenue, data, business opportunities, or goodwill
          </li>
          <li>Service interruptions, downtime, or unavailability</li>
          <li>
            Actions or failures of third parties including HMRC and Companies
            House
          </li>
        </ul>
        <p>
          <strong className="text-ink">Liability cap:</strong> Our total
          aggregate liability to you for all claims arising out of or relating
          to these terms or your use of the service shall not exceed the total
          fees actually paid by you to {brand} in the twelve (12) months
          immediately preceding the event giving rise to the claim.
        </p>

        <LegalH3>5.4 No Guarantee of Acceptance</LegalH3>
        <p>
          {brand} does not guarantee that any submission will be accepted by
          HMRC, Companies House, or any other authority. Rejection may occur due
          to data validation errors, authority system issues, or other factors.
          You are responsible for monitoring submission status and resubmitting
          if necessary.
        </p>

        <LegalH3>5.5 Indemnification</LegalH3>
        <p>
          You agree to indemnify and hold harmless {brand}, its officers,
          directors, and employees from any claims arising from your use of the
          service, your violation of these terms, your violation of any rights
          of another party, or any inaccurate or incomplete information you
          provide.
        </p>
      </section>

      <section id="contact" className="scroll-mt-24 space-y-4">
        <LegalH2>6. Contact Us</LegalH2>
        <p>
          For support &amp; enquiries:{" "}
          <a className="font-semibold text-sea" href={`mailto:${email}`}>
            {email}
          </a>
        </p>
        <p>
          {LEGAL_COMPANY.legalName}
          <br />
          Trading as {brand}
          <br />
          Company number: {LEGAL_COMPANY.companyNumber}
          <br />
          Registered office: {registeredOfficeLine()}
          <br />
          <a
            className="font-semibold text-sea"
            href={LEGAL_COMPANY.companiesHouseUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Companies House record
          </a>
        </p>

        <LegalH3>6.1 Complaints</LegalH3>
        <p>
          If you have any complaints about our service or how we handle your
          data, please contact us first at{" "}
          <a className="font-semibold text-sea" href={`mailto:${email}`}>
            {email}
          </a>
          . We will try to resolve any issues promptly.
        </p>
        <p>
          If you&apos;re not satisfied with our response, you have the right to
          lodge a complaint with the Information Commissioner&apos;s Office
          (ICO):{" "}
          <a
            href="https://ico.org.uk"
            className="font-semibold text-sea"
            target="_blank"
            rel="noreferrer"
          >
            ico.org.uk
          </a>{" "}
          · Phone 0303 123 1113.
        </p>

        <LegalH3>6.2 Changes to These Terms</LegalH3>
        <p>
          We may update these terms from time to time. We will notify you of any
          material changes by email or through the service. Your continued use
          of {brand} after changes constitutes acceptance of the updated terms.
        </p>

        <LegalH3>6.3 Governing Law</LegalH3>
        <p>
          These terms are governed by the laws of England and Wales. Any
          disputes will be subject to the exclusive jurisdiction of the courts
          of England and Wales.
        </p>
      </section>
    </LegalShell>
  );
}
