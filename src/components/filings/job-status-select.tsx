"use client";

import { useTransition } from "react";
import { setJobStatus } from "@/server/actions/desk";
import { JOB_STATUS_LABEL, type JobStatus } from "@/lib/desk-profile";

const STATUSES = Object.keys(JOB_STATUS_LABEL) as JobStatus[];

export function JobStatusSelect({
  clientId,
  filingId,
  status,
}: {
  clientId: string;
  filingId: string;
  status: JobStatus | null;
}) {
  const [pending, start] = useTransition();
  return (
    <select
      className="input py-1 text-xs"
      aria-label="Job status"
      defaultValue={status ?? ""}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value as JobStatus;
        if (!next) return;
        start(async () => {
          await setJobStatus({ clientId, filingId, status: next });
        });
      }}
    >
      <option value="">Set status</option>
      {STATUSES.map((s) => (
        <option key={s} value={s}>
          {JOB_STATUS_LABEL[s]}
        </option>
      ))}
    </select>
  );
}
