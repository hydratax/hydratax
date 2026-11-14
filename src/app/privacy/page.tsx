import Link from "next/link";
import { LegalH2, LegalH3, LegalShell } from "@/components/legal/legal-shell";
import {
  Fact,
  LegalLink,
  RetentionTable,
  SubProcessorTable,
} from "@/components/legal/legal-bits";
import { LEGAL_UPDATED, legalTradingAs } from "@/lib/legal";
import { LEGAL_ENTITY } from "@/lib/legal-entity";
import { STATUTORY_RECIPIENTS } from "@/lib/subprocessors";

export const metadata = {
  title: "Privacy Notice — HydraTax",
  description:
    "How HydraTax collects, uses, shares and protects personal data under UK GDPR and the Data Protection Act 2018, and how to exercise your rights.",
};

export default function PrivacyNoticePage() {
  const E = LEGAL_ENTITY;
  const mail = E.privacyEmail;

  return (
    <LegalShell title="Privacy Notice" updated={LEGAL_UPDATED.privacy}>
      <p>
        This notice explains how {legalTradingAs()} uses personal data, as
        required by Articles 13 and 14 of the UK GDPR. It covers visitors to
        our website, people who hold a HydraTax account, and — in the
        &quot;Client data&quot; section — the individuals whose data our
        customers (accountants and businesses) process in HydraTax.
      </p>

      <nav className="rounded-xl border border-line bg-sand/40 p-4 text-sm">
        <p className="font-semibold text-ink">On this page</p>
        <ul className="mt-2 grid gap-1 sm:grid-cols-2">
          {[
            ["#who", "1. Who we are"],
            ["#roles", "2. Our two roles"],
            ["#account-data", "3. Your account data — what, why, how long"],
            ["#client-data", "4. Client data (we are the processor)"],
            ["#recipients", "5. Who we share data with"],
            ["#transfers", "6. International transfers"],
            ["#rights", "7. Your rights and how to use them"],
            ["#automated", "8. Automated decisions"],
            ["#security", "9. Security"],
            ["#cookies", "10. Cookies"],
            ["#children", "11. Children"],
            ["#complaints", "12. Complaints"],
            ["#changes", "13. Changes"],
          ].map(([href, label]) => (
            <li key={href}>
              <a href={href} className="text-sea hover:underline">
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <section id="who" className="scroll-mt-24 space-y-3">
        <LegalH2>1. Who we are</LegalH2>
        <p>
          The data controller for account and website data is{" "}
          <strong className="text-ink">{E.legalName}</strong>, trading as{" "}
          {E.tradingName}.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Company number: {E.companyNumber} (
            <LegalLink href={E.companiesHouseUrl}>Companies House record</LegalLink>
            )
          </li>
          <li>
            Registered office: <Fact value={E.registeredOffice} />
          </li>
          <li>
            ICO registration: <Fact value={E.icoRegistrationNumber} />
          </li>
          <li>
            Privacy / data-rights contact:{" "}
            <a className="font-semibold text-sea" href={`mailto:${mail}`}>
              {mail}
            </a>
          </li>
          <li>
            Data Protection Officer: <Fact value={E.dpoStatus} /> —{" "}
            <Fact value={E.dpoName} /> (
            <a className="font-semibold text-sea" href={`mailto:${E.dpoEmail}`}>
              {E.dpoEmail}
            </a>
            )
          </li>
          <li>
            Post: <Fact value={E.postalAddressForRequests} />
          </li>
        </ul>
      </section>

      <section id="roles" className="scroll-mt-24 space-y-3">
        <LegalH2>2. Our two roles</LegalH2>
        <p>
          <strong className="text-ink">Controller.</strong> For the data we
          need to run your HydraTax account (your name, email, practice,
          billing and security data) we decide why and how it is used, so we are
          the controller.
        </p>
        <p>
          <strong className="text-ink">Processor.</strong> When a practice or
          business puts its clients&apos;, employees&apos; or officers&apos;
          data into HydraTax (for example payroll records, ledgers, tax
          identifiers, uploaded documents), that customer is the controller and
          we are its processor. We only process that data on the customer&apos;s
          documented instructions under our{" "}
          <LegalLink href="/legal/dpa">Data Processing Agreement</LegalLink>.
          If you are one of those individuals, please contact the practice or
          business that holds your data first — we will help them respond to
          you.
        </p>
      </section>

      <section id="account-data" className="scroll-mt-24 space-y-3">
        <LegalH2>3. Your account data — what, why and how long</LegalH2>
        <p>
          We collect this information from you directly (when you register,
          pay, contact support or use the service) and automatically from your
          device (for example sign-in, security and error logs). The table
          shows each category, why we use it, our lawful basis and how long we
          keep it. Periods in the table are the ones our systems actually
          enforce.
        </p>
        <RetentionTable role="controller" />
        <p>
          We do not sell personal data and we do not use it for advertising or
          profiling.
        </p>
      </section>

      <section id="client-data" className="scroll-mt-24 space-y-3">
        <LegalH2>4. Client data (we are the processor)</LegalH2>
        <p>
          The table below is the default treatment of data a customer places
          in HydraTax. The customer (the controller) decides how long to keep
          each record and can export or erase a client at any time from the
          client&apos;s page; we then delete it from our systems as described.
          Statutory retention periods apply to the customer, not to us — a
          customer who erases a client is responsible for keeping any records
          the law requires.
        </p>
        <RetentionTable role="processor" />
      </section>

      <section id="recipients" className="scroll-mt-24 space-y-3">
        <LegalH2>5. Who we share data with</LegalH2>
        <LegalH3>Statutory recipients (only when you instruct a filing)</LegalH3>
        <ul className="list-disc space-y-1 pl-5">
          {STATUTORY_RECIPIENTS.map((r) => (
            <li key={r.name}>
              <strong className="text-ink">{r.name}</strong> — {r.role}{" "}
              {r.note}
            </li>
          ))}
        </ul>
        <LegalH3>Service providers (processors / sub-processors)</LegalH3>
        <p>
          These organisations help us run the service under written contracts
          that limit them to our instructions. The same list is maintained on
          our{" "}
          <LegalLink href="/legal/sub-processors">sub-processor page</LegalLink>.
        </p>
        <SubProcessorTable />
        <p>
          We may also disclose data where the law requires it (for example a
          court order) or to protect our rights, and to professional advisers
          under confidentiality.
        </p>
      </section>

      <section id="transfers" className="scroll-mt-24 space-y-3">
        <LegalH2>6. International transfers</LegalH2>
        <p>
          Some providers above process data outside the UK (notably in the
          United States). Where they do, we rely on a UK-recognised safeguard:
          UK adequacy regulations (including the UK Extension to the EU–US Data
          Privacy Framework, for certified US recipients), or the UK
          International Data Transfer Agreement / UK Addendum to the EU Standard
          Contractual Clauses, together with a transfer risk assessment.
        </p>
        <p>
          Where our data is hosted: <Fact value={E.hostingRegion} />. You can
          ask us for a copy of the safeguards at{" "}
          <a className="font-semibold text-sea" href={`mailto:${mail}`}>
            {mail}
          </a>
          .
        </p>
      </section>

      <section id="rights" className="scroll-mt-24 space-y-3">
        <LegalH2>7. Your rights and how to use them</LegalH2>
        <p>Under UK data protection law you have the right to:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>be informed (this notice);</li>
          <li>access a copy of your personal data;</li>
          <li>have inaccurate data corrected;</li>
          <li>
            have data erased (&quot;right to be forgotten&quot;) — not where we
            must keep it by law, see the retention tables;
          </li>
          <li>restrict our processing in certain cases;</li>
          <li>
            receive your data in a structured, machine-readable format
            (portability) where we rely on contract or consent;
          </li>
          <li>
            object to processing based on legitimate interests, and to direct
            marketing at any time;
          </li>
          <li>
            withdraw consent at any time where we rely on it (this does not
            affect earlier processing).
          </li>
        </ul>
        <LegalH3>Self-service (signed-in account holders)</LegalH3>
        <p>
          Go to <strong className="text-ink">Settings → Privacy &amp; data</strong>{" "}
          (
          <Link href="/settings/privacy" className="font-semibold text-sea">
            /settings/privacy
          </Link>
          ) to <strong className="text-ink">download</strong> a JSON copy of
          your account data or to{" "}
          <strong className="text-ink">delete your account</strong>. Practice
          owners and administrators can export or erase an individual client
          from that client&apos;s page.
        </p>
        <LegalH3>By email or post</LegalH3>
        <p>
          Write to{" "}
          <a className="font-semibold text-sea" href={`mailto:${mail}`}>
            {mail}
          </a>
          . We may need to verify your identity. We respond within one
          calendar month (extendable by up to two further months for complex or
          numerous requests, in which case we tell you why). There is no fee
          unless a request is manifestly unfounded or excessive.
        </p>
      </section>

      <section id="automated" className="scroll-mt-24 space-y-3">
        <LegalH2>8. Automated decisions</LegalH2>
        <p>
          We do not make decisions about individuals based solely on automated
          processing that produce legal or similarly significant effects (UK
          GDPR Art 22). HydraTax performs rule-based calculations (for example
          tax figures from HMRC rates) and suggestions that a qualified human
          reviews before anything is filed.
        </p>
      </section>

      <section id="security" className="scroll-mt-24 space-y-3">
        <LegalH2>9. Security</LegalH2>
        <p>
          We use encryption in transit, access control on every database table
          (row-level security) and server-side authorisation checks, encrypted
          storage of HMRC credentials, two-step verification for accounts,
          append-only audit and security logs, and time-limited sessions. If a
          personal data breach is likely to put people at risk we notify the
          ICO within 72 hours and affected people without undue delay. See our{" "}
          <LegalLink href="/legal/security">security &amp; breach policy</LegalLink>.
        </p>
      </section>

      <section id="cookies" className="scroll-mt-24 space-y-3">
        <LegalH2>10. Cookies</LegalH2>
        <p>
          We currently use only cookies and similar browser storage that are
          strictly necessary to keep you signed in, secure the service and
          remember your choices. We do not use advertising or analytics
          cookies. Full list:{" "}
          <LegalLink href="/legal/cookies">Cookie notice</LegalLink>.
        </p>
        <p>
          Marketing email is only sent with your consent and every message
          contains an unsubscribe link; service messages (receipts, security
          codes, deadline reminders you switched on) are not marketing.
        </p>
      </section>

      <section id="children" className="scroll-mt-24 space-y-3">
        <LegalH2>11. Children</LegalH2>
        <p>
          HydraTax is a professional service for people aged 18 or over and we
          do not knowingly collect children&apos;s data for our own purposes.
          Our customers may record data about employees or clients who are
          under 18 (for example apprentices); they are responsible for that
          processing and we handle it only on their instructions.
        </p>
      </section>

      <section id="complaints" className="scroll-mt-24 space-y-3">
        <LegalH2>12. Complaints</LegalH2>
        <p>
          Please contact us first at{" "}
          <a className="font-semibold text-sea" href={`mailto:${mail}`}>
            {mail}
          </a>{" "}
          so we can try to put things right. You also have the right to
          complain to the Information Commissioner&apos;s Office:{" "}
          <LegalLink href={E.icoComplaintUrl}>{E.icoComplaintUrl}</LegalLink>{" "}
          · telephone {E.icoPhone}.
        </p>
      </section>

      <section id="changes" className="scroll-mt-24 space-y-3">
        <LegalH2>13. Changes</LegalH2>
        <p>
          We will update this notice when our processing changes and tell
          account holders about material changes by email or in the service.
          The date at the top shows the latest version.
        </p>
      </section>
    </LegalShell>
  );
}
