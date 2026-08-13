"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AccountsPackPeriodForm({
  clientId,
  periodStart,
  periodEnd,
}: {
  clientId: string;
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
          `/clients/${clientId}/accounts-pack?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
        );
      }}
    >
      <div>
        <label className="label" htmlFor="pack-start">
          Period start
        </label>
        <input
          id="pack-start"
          type="date"
          className="input"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          required
        />
      </div>
      <div>
        <label className="label" htmlFor="pack-end">
          Period end
        </label>
        <input
          id="pack-end"
          type="date"
          className="input"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          required
        />
      </div>
      <button type="submit" className="btn btn-secondary">
        Update period
      </button>
    </form>
  );
}
