"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { updateClient } from "@/server/actions/clients";
import { FormErrorBanner } from "@/components/forms/form-error-banner";
import { CreateClientForm } from "@/components/forms/create-client-form";

export type OnboardedCompanyOption = {
  id: string;
  slug: string;
  name: string;
  companyNumber: string | null;
  vrn: string | null;
  payeRef: string | null;
  isVatRegistered: boolean;
  isEmployer: boolean;
  contactEmail: string | null;
};

type Desk = "vat" | "payroll" | "all";

export function AddClientChooser({
  companies,
  desk = "all",
}: {
  companies: OnboardedCompanyOption[];
  desk?: Desk;
}) {
  const router = useRouter();
  const [step, setStep] = useState<"choose" | "new">("choose");
  const [query, setQuery] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return companies.filter((c) => {
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        (c.companyNumber ?? "").toLowerCase().includes(q) ||
        (c.vrn ?? "").toLowerCase().includes(q) ||
        (c.payeRef ?? "").toLowerCase().includes(q)
      );
    });
  }, [companies, query]);

  if (step === "new") {
    return (
      <div className="space-y-4">
        <button
          type="button"
          className="text-sm font-semibold text-sea hover:underline"
          onClick={() => setStep("choose")}
        >
          ← Back to company list
        </button>
        <div className="panel p-5">
          <CreateClientForm
            defaultVat={desk === "vat"}
            defaultEmployer={desk === "payroll"}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="panel p-5">
        <h2 className="display text-2xl text-ink">
          Choose an onboarded company
        </h2>
        <p className="mt-1 text-sm text-ink-soft">
          Select a company already on your practice, or add someone new.
        </p>

        <input
          type="search"
          className="input mt-4 max-w-md"
          placeholder="Search company…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <FormErrorBanner error={error} />

        {filtered.length === 0 ? (
          <p className="mt-4 text-sm text-ink-soft">
            No matching companies.{" "}
            <button
              type="button"
              className="font-semibold text-sea hover:underline"
              onClick={() => setStep("new")}
            >
              Add a new client
            </button>
          </p>
        ) : (
          <ul className="mt-4 max-h-[28rem] divide-y divide-line overflow-auto rounded-lg border border-line">
            {filtered.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-ink">{c.name}</p>
                  <p className="mt-0.5 text-xs text-ink-soft">
                    {[
                      c.companyNumber && `No. ${c.companyNumber}`,
                      c.vrn && `VRN ${c.vrn}`,
                      c.payeRef && `PAYE ${c.payeRef}`,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "Limited company"}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary text-sm"
                  disabled={pending}
                  onClick={() => {
                    setError(null);
                    start(async () => {
                      try {
                        if (desk === "vat" && !c.isVatRegistered) {
                          await updateClient({
                            clientId: c.id,
                            isVatRegistered: true,
                          });
                        }
                        if (desk === "payroll" && !c.isEmployer) {
                          await updateClient({
                            clientId: c.id,
                            isEmployer: true,
                          });
                        }
                        const path =
                          desk === "vat"
                            ? `/clients/${c.slug}/vat`
                            : desk === "payroll"
                              ? `/clients/${c.slug}/payroll`
                              : `/clients/${c.slug}`;
                        router.push(path);
                      } catch (err) {
                        setError(
                          err instanceof Error
                            ? err.message
                            : "Could not open client",
                        );
                      }
                    });
                  }}
                >
                  {pending ? "Opening…" : "Use this company"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-soft">
          Not on the list yet?
        </p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setStep("new")}
        >
          New client form
        </button>
      </div>

      <p className="text-sm">
        <Link href="/clients" className="font-semibold text-sea hover:underline">
          ← Cancel
        </Link>
      </p>
    </div>
  );
}
