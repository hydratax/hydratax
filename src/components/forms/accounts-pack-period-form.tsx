"use client";

import { UkDateField } from "@/components/forms/uk-date-field";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AccountsPackPeriodForm({
  clientSlug,
  periodStart,
  periodEnd,
}: {
  clientSlug: string;
  periodStart: string;
  periodEnd: string;
}) {
  const router = useRouter();
  const [start, setStart] = useState(periodStart);
  const [end, setEnd] = useState(periodEnd);

  return (
    <form
      className="panel flex flex-wrap items-end gap-3 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        router.push(
          `/clients/${clientSlug}/accounts-pack?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
        );
      }}
    >
      <div>
        <label className="label" htmlFor="pack-start">
          Period start
        </label>
        <UkDateField id="pack-start" className="input" value={start} onChange={(iso) => setStart(iso)}
          required
        />
      </div>
      <div>
        <label className="label" htmlFor="pack-end">
          Period end
        </label>
        <UkDateField id="pack-end" className="input" value={end} onChange={(iso) => setEnd(iso)}
          required
        />
      </div>
      <button type="submit" className="btn btn-secondary">
        Update period
      </button>
    </form>
  );
}
