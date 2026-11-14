import { LegalH2, LegalH3, LegalShell } from "@/components/legal/legal-shell";
import { Fact, LegalLink } from "@/components/legal/legal-bits";
import { LEGAL_UPDATED } from "@/lib/legal";
import { LEGAL_ENTITY } from "@/lib/legal-entity";

export const metadata = {
  title: "Security & breach policy — HydraTax",
  description:
    "How HydraTax protects personal data and how we respond to a personal data breach (ICO 72-hour process).",
};

export default function SecurityPolicyPage() {
  const E = LEGAL_ENTITY;
  return (
    <LegalShell
      title="Security & breach policy"
      updated={LEGAL_UPDATED.security}
    >
      <p>
        This page summarises the technical and organisational measures we use
        (UK GDPR Art 32) and how we respond to a personal data breach (Arts 33
        and 34). It describes controls we operate; it is not a certification —
        we do not claim ISO 27001, SOC 2 or similar unless and until we publish
        a certificate.
      </p>

      <LegalH2>Security measures</LegalH2>
      <ul className="list-disc space-y-1 pl-5">
        <li>HTTPS (TLS) for all traffic.</li>
        <li>
          Database row-level security with deny-by-default tables, plus
          server-side checks that every request is scoped to the signed-in
          user&apos;s practice. Privileged (service-role) access is used only on
          the server after those checks.
        </li>
        <li>
          Two-step verification, time-limited sessions, and role / module
          access inside a practice. Destructive client actions are limited to
          owners and administrators and need typed confirmation.
        </li>
        <li>
          HMRC and similar credentials encrypted at rest (AES-256-GCM);
          secrets, tokens and password hashes are never included in data
          exports or logs.
        </li>
        <li>
          Append-only audit trail of filings and an append-only security-event
          log; identifiers such as NINO and UTR are masked in list views.
        </li>
        <li>
          Data minimisation and automatic deletion of short-lived data (such as
          one-time codes) on a schedule — see the{" "}
          <LegalLink href="/privacy#account-data">retention tables</LegalLink>.
        </li>
        <li>Sub-processors bound by written terms and listed publicly.</li>
      </ul>

      <LegalH2>If a personal data breach happens</LegalH2>
      <ol className="list-decimal space-y-2 pl-5">
        <li>
          <strong className="text-ink">Detect &amp; contain.</strong> Anyone who
          suspects a breach reports it immediately to the security contact
          below. We contain the incident first (revoke credentials / sessions,
          isolate systems) and preserve evidence.
        </li>
        <li>
          <strong className="text-ink">Assess.</strong> We record the facts —
          what happened, which data and how many people, the likely
          consequences — in an internal breach register, whether or not it is
          reportable.
        </li>
        <li>
          <strong className="text-ink">Notify the ICO within 72 hours.</strong>{" "}
          Where we are the controller and the breach is likely to result in a
          risk to people&apos;s rights and freedoms, we report to the
          Information Commissioner&apos;s Office without undue delay and no
          later than 72 hours after becoming aware, even if some details are
          still being established.
        </li>
        <li>
          <strong className="text-ink">Tell affected people.</strong> Where the
          risk is high we tell the individuals concerned without undue delay,
          in plain language, with what happened, likely effects and what to do.
        </li>
        <li>
          <strong className="text-ink">Tell our customers.</strong> Where we
          are the processor we notify the affected practice (the controller)
          without undue delay and within {E.processorBreachNoticeHours} hours of
          becoming aware, so it can meet its own 72-hour duty.
        </li>
        <li>
          <strong className="text-ink">Learn.</strong> We fix the cause, review
          the incident and update our controls.
        </li>
      </ol>

      <LegalH3>Report a security issue or suspected breach</LegalH3>
      <p>
        Email{" "}
        <a
          className="font-semibold text-sea"
          href={`mailto:${E.securityEmail}`}
        >
          {E.securityEmail}
        </a>{" "}
        (<Fact value={E.securityEmailNote} />). Please include what you saw and
        when, but never send passwords or other secrets.
      </p>
      <p>
        Regulator: Information Commissioner&apos;s Office —{" "}
        <LegalLink href="https://ico.org.uk/make-a-complaint/data-protection-complaints/">
          ico.org.uk
        </LegalLink>
        , telephone {E.icoPhone}.
      </p>
    </LegalShell>
  );
}
