import Link from "next/link";
import { companyRoleLabel } from "@/lib/sa-taxpayer";
import type { PracticeDirectorCompany } from "@/server/actions/sa-directors";

export function SaPersonAssociations({
  companies,
  tradingAs,
  occupation,
}: {
  companies: PracticeDirectorCompany[];
  tradingAs?: string | null;
  occupation?: string | null;
}) {
  const hasTrading = Boolean(tradingAs?.trim());
  const rows: Array<{ label: string; value: string; href?: string }> = [];

  for (const c of companies) {
    rows.push({
      label: companyRoleLabel(c.role),
      value: c.companyNumber
        ? `${c.companyName} · ${c.companyNumber}`
        : c.companyName,
      href: `/clients/${c.slug}`,
    });
  }

  if (hasTrading) {
    rows.push({
      label: "Trading as",
      value: occupation?.trim()
        ? `${tradingAs!.trim()} · ${occupation.trim()}`
        : tradingAs!.trim(),
    });
  }

  if (rows.length === 0 && occupation?.trim()) {
    rows.push({ label: "Occupation", value: occupation.trim() });
  }

  return (
    <div className="panel flex h-full flex-col p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="display text-2xl">Business</h2>
      </div>

      {rows.length > 0 ? (
        <dl className="mt-4 flex flex-1 flex-col divide-y divide-line text-sm">
          {rows.map((row, i) => (
            <div
              key={`${row.label}-${row.value}-${i}`}
              className="flex flex-1 items-center justify-between gap-4 py-2.5"
            >
              <dt className="shrink-0 text-ink-soft">{row.label}</dt>
              <dd className="min-w-0 text-right font-medium text-ink">
                {row.href ? (
                  <Link
                    href={row.href}
                    className="hover:text-sea hover:underline"
                  >
                    {row.value}
                  </Link>
                ) : (
                  row.value
                )}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <dl className="mt-4 flex flex-1 flex-col divide-y divide-line text-sm">
          <div className="flex flex-1 items-center justify-between gap-4 py-2.5">
            <dt className="text-ink-soft">Companies</dt>
            <dd className="text-right font-medium text-ink-soft">—</dd>
          </div>
          <div className="flex flex-1 items-center justify-between gap-4 py-2.5">
            <dt className="text-ink-soft">Trading as</dt>
            <dd className="text-right font-medium text-ink-soft">—</dd>
          </div>
          <div className="flex flex-1 items-center justify-between gap-4 py-2.5">
            <dt className="text-ink-soft">Occupation</dt>
            <dd className="text-right font-medium text-ink-soft">—</dd>
          </div>
        </dl>
      )}
    </div>
  );
}
