"use client";

import { useState, useTransition } from "react";
import { setClientWorkStage } from "@/server/actions/desk";
import {
  CLIENT_WORK_STAGES,
  WORK_STAGE_LABEL,
  type ClientWorkStage,
} from "@/lib/client-work-stage";
import { FormErrorBanner } from "@/components/forms/form-error-banner";

export function ClientWorkStagePanel({
  clientId,
  stage,
  readOnly,
}: {
  clientId: string;
  stage: ClientWorkStage;
  readOnly?: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState(stage);

  return (
    <div className="panel p-5">
      <h2 className="display text-2xl text-ink">Accounts progress</h2>
      <p className="mt-1 text-sm text-ink-soft">
        Track where this year&apos;s accounts or Self Assessment sit.
      </p>

      {readOnly ? (
        <p className="mt-4 text-sm font-semibold text-ink">
          {WORK_STAGE_LABEL[current]}
        </p>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          {CLIENT_WORK_STAGES.filter((s) => s !== "not_started").map((s) => (
            <button
              key={s}
              type="button"
              disabled={pending}
              className={`filing-filter ${current === s ? "is-active" : ""}`}
              onClick={() => {
                setError(null);
                start(async () => {
                  try {
                    const res = await setClientWorkStage({
                      clientId,
                      stage: s,
                    });
                    setCurrent(res.stage);
                  } catch (err) {
                    setError(
                      err instanceof Error ? err.message : "Could not update",
                    );
                  }
                });
              }}
            >
              {WORK_STAGE_LABEL[s]}
            </button>
          ))}
        </div>
      )}

      <FormErrorBanner error={error} />
    </div>
  );
}
