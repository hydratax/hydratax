import { LegalH2, LegalShell } from "@/components/legal/legal-shell";
import { LegalLink, SubProcessorTable } from "@/components/legal/legal-bits";
import {
  LEGAL_COMPANY,
  LEGAL_CONTACT_EMAIL,
  LEGAL_UPDATED,
  legalTradingAs,
} from "@/lib/legal";
import { STATUTORY_RECIPIENTS } from "@/lib/subprocessors";

export const metadata = {
  title: "Sub-processors — HydraTax",
  description: "List of HydraTax sub-processors used to deliver the service.",
};

export default function SubProcessorsPage() {
  return (
    <LegalShell title="Sub-processors" updated={LEGAL_UPDATED.dpa}>
      <p>
        {legalTradingAs()} engages the following sub-processors to help deliver
        the {LEGAL_COMPANY.tradingName} service. Each is bound by a written
        agreement with data-protection terms equivalent in substance to our{" "}
        <LegalLink href="/legal/dpa">Data Processing Agreement</LegalLink>.
        Providers marked &quot;only if enabled&quot; are used only when the
        relevant feature is switched on.
      </p>

      <LegalH2>Current list</LegalH2>
      <SubProcessorTable />

      <LegalH2>Statutory recipients</LegalH2>
      <p>
        These bodies are not our sub-processors: they receive data only when a
        customer instructs a filing, and are independent controllers.
      </p>
      <ul className="list-disc space-y-1 pl-5">
        {STATUTORY_RECIPIENTS.map((r) => (
          <li key={r.name}>
            <strong className="text-ink">{r.name}</strong> — {r.role}
          </li>
        ))}
      </ul>

      <LegalH2>Changes</LegalH2>
      <p>
        We will update this page at least 14 days before adding or replacing a
        sub-processor. Questions or objections:{" "}
        <a
          className="font-semibold text-sea"
          href={`mailto:${LEGAL_CONTACT_EMAIL}`}
        >
          {LEGAL_CONTACT_EMAIL}
        </a>
        .
      </p>
    </LegalShell>
  );
}
