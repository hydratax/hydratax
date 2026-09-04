"use client";

import { useEffect, useState } from "react";
import type { NameAvailabilityStatus } from "@/lib/ch-name-availability";
import { ensureLtdSuffix } from "@/lib/ch-name-availability";

type SimilarHit = {
  company_number: string;
  title: string;
  company_status?: string;
  address_snippet?: string;
};

export function useChNameAvailability(
  rawName: string,
  opts?: { excludeCompanyNumber?: string; minLength?: number },
) {
  const minLength = opts?.minLength ?? 3;
  const [status, setStatus] = useState<NameAvailabilityStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [proposedName, setProposedName] = useState("");
  const [similar, setSimilar] = useState<SimilarHit[]>([]);
  const [configured, setConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    const name = ensureLtdSuffix(rawName.trim());
    if (name.length < minLength) {
      setStatus("idle");
      setMessage(null);
      setSimilar([]);
      setProposedName("");
      return;
    }

    let cancelled = false;
    setStatus("checking");
    setMessage(null);

    const t = setTimeout(() => {
      void (async () => {
        try {
          const params = new URLSearchParams({ name: rawName.trim() });
          if (opts?.excludeCompanyNumber) {
            params.set(
              "exclude_company_number",
              opts.excludeCompanyNumber,
            );
          }
          const res = await fetch(
            `/api/companies-house/name-availability?${params.toString()}`,
          );
          const data = (await res.json()) as {
            status?: NameAvailabilityStatus;
            message?: string;
            proposedName?: string;
            similar?: SimilarHit[];
            configured?: boolean;
            error?: string;
          };
          if (cancelled) return;
          if (!res.ok) {
            setStatus("error");
            setMessage(data.error ?? "Could not check name on Companies House.");
            setSimilar([]);
            return;
          }
          setConfigured(Boolean(data.configured));
          setProposedName(data.proposedName ?? name);
          setStatus(data.status ?? "error");
          setMessage(data.message ?? null);
          setSimilar(data.similar ?? []);
        } catch (err) {
          if (cancelled) return;
          setStatus("error");
          setMessage(
            err instanceof Error
              ? err.message
              : "Could not check name on Companies House.",
          );
          setSimilar([]);
        }
      })();
    }, 450);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [rawName, opts?.excludeCompanyNumber, minLength]);

  return { status, message, proposedName, similar, configured };
}
