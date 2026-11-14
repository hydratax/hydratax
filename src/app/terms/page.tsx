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
            <a href="#free-trial" className="text-sea hover:underline">
              1.6a Free trial (Practice desk)
            </a>
          </li>
          <li>
            <a href="#privacy" className="text-sea hover:underline">
              2. Privacy
            </a>
          </li>
          <li>
            <a href="#cookies" className="text-sea hover:underline">
              3. Cookies
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
          incorporate by reference our{" "}
          <Link href="/privacy" className="font-semibold text-sea">
            Privacy Notice
          </Link>
          ,{" "}
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

        <LegalH3>1.6a Free trial (Practice desk)</LegalH3>
        <div id="free-trial" className="scroll-mt-24 space-y-4">
        <p>
          <strong className="text-ink">Small Firm</strong> and{" "}
          <strong className="text-ink">Enterprise</strong> Practice desk
          subscriptions include a{" "}
          <strong className="text-ink">7-day free trial</strong>. Solo and
          other module plans do not include this trial. A payment card is
          collected at checkout so billing can begin automatically on day 8,
          or earlier if you choose to submit a live return. During the trial:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            No Hydra subscription fee is charged until day 8, unless you
            confirm a live HMRC or Companies House submission sooner.
          </li>
          <li>
            You may prepare returns and use desk features. Live submission to
            HMRC or Companies House is not included in the free trial: confirming
            submit ends the trial and charges the selected plan to the card on
            file. If that charge fails, submission remains blocked until you
            update the payment method.
          </li>
          <li>
            Statutory fees charged by Companies House (and any other
            government/third-party statutory charges) still apply where
            payable; they are not waived by HydraTax.
          </li>
          <li>
            You may cancel within the 7-day trial from Account settings to avoid
            the paid plan starting. After day 7, the selected plan price is
            charged to the card on file unless you cancel.
          </li>
          <li>
            We email a reminder on day 7 that your trial is ending and that
            billing starts the following day. We also email an invoice or
            receipt for each successful charge.
          </li>
        </ul>
        <p>
          One free trial per practice unless we agree otherwise. We may refuse
          or end a trial where we reasonably suspect abuse. See also the{" "}
          <Link href="/pricing" className="font-semibold text-sea">
            pricing page
          </Link>
          .
        </p>
        </div>

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
        <LegalH2>2. Privacy</LegalH2>
        <p>
          How we use personal data — who the controller is, what we collect,
          lawful bases, retention, recipients, international transfers and your
          rights — is set out in our{" "}
          <Link href="/privacy" className="font-semibold text-sea">
            Privacy Notice
          </Link>
          . Where you use {brand} to process your clients&apos; personal data,
          you are typically the controller and we are your processor under our{" "}
          <Link href="/legal/dpa" className="font-semibold text-sea">
            Data Processing Agreement
          </Link>
          ; our providers are listed on the{" "}
          <Link href="/legal/sub-processors" className="font-semibold text-sea">
            Sub-processors
          </Link>{" "}
          page. The Privacy Notice forms part of these Terms.
        </p>
      </section>

      <section id="cookies" className="scroll-mt-24 space-y-4">
        <LegalH2>3. Cookies</LegalH2>
        <p>
          We use only strictly necessary cookies and browser storage. See the{" "}
          <Link href="/legal/cookies" className="font-semibold text-sea">
            Cookie notice
          </Link>{" "}
          for the full list.
        </p>
      </section>

      <section id="gdpr" className="scroll-mt-24 space-y-4">
        <LegalH2>4. Data Protection Rights (UK GDPR)</LegalH2>
        <p>
          You can access, correct, erase, restrict, object to or port your
          personal data. Signed-in users can download or delete their data at{" "}
          <Link href="/settings/privacy" className="font-semibold text-sea">
            Settings → Privacy &amp; data
          </Link>
          ; other requests go to{" "}
          <a className="font-semibold text-sea" href={`mailto:${email}`}>
            {email}
          </a>
          . Details, response times and your right to complain to the ICO are in
          the{" "}
          <Link href="/privacy#rights" className="font-semibold text-sea">
            Privacy Notice
          </Link>
          . Breach handling:{" "}
          <Link href="/legal/security" className="font-semibold text-sea">
            security &amp; breach policy
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
