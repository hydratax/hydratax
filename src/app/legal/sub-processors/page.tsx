import Link from "next/link";
import { LegalH2, LegalShell } from "@/components/legal/legal-shell";
import {
  LEGAL_COMPANY,
  LEGAL_CONTACT_EMAIL,
  LEGAL_UPDATED,
  legalTradingAs,
} from "@/lib/legal";

export const metadata = {
  title: "Sub-processors — HydraTax",
  description: "List of HydraTax sub-processors used to deliver the service.",
};

const SUBPROCESSORS = [
  {
    name: "Supabase",
    role: "Authentication and database hosting",
    country: "EEA / US (region-dependent)",
  },
  {
    name: "Netlify",
    role: "Application hosting and edge delivery",
    country: "US / EU (edge)",
  },
  {
    name: "Stripe",
    role: "Payment processing",
    country: "US / EEA",
  },
  {
    name: "Cloudflare R2 (if enabled)",
    role: "Document object storage",
    country: "Region configured per deployment",
  },
] as const;

export default function SubProcessorsPage() {
  return (
    <LegalShell title="Sub-processors" updated={LEGAL_UPDATED.dpa}>
      <p>
        {legalTradingAs()} engages the following sub-processors to help deliver
        the {LEGAL_COMPANY.tradingName} service. Each is bound by a written
        agreement with data-protection terms equivalent in substance to our{" "}
        <Link href="/legal/dpa" className="font-semibold text-sea">
          Data Processing Agreement
        </Link>
        .
      </p>

      <LegalH2>Current list</LegalH2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-line text-ink">
              <th className="py-2 pr-3 font-semibold">Provider</th>
              <th className="py-2 pr-3 font-semibold">Role</th>
              <th className="py-2 font-semibold">Country / region</th>
            </tr>
          </thead>
          <tbody>
            {SUBPROCESSORS.map((s) => (
              <tr key={s.name} className="border-b border-line/70">
                <td className="py-2 pr-3 font-medium text-ink">{s.name}</td>
                <td className="py-2 pr-3">{s.role}</td>
                <td className="py-2">{s.country}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p>
        We will update this page at least 14 days before adding or replacing a
        sub-processor. Questions:{" "}
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
