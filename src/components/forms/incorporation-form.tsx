"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import type { ChServiceDetail } from "@/lib/ch-services";
import { formatChFeeBreakdown } from "@/lib/ch-services";
import { searchSicCodes, type SicCode } from "@/lib/sic-codes";
import { submitCompaniesHouseRequest } from "@/server/actions/ch-requests";

type Director = {
  fullName: string;
  dateOfBirth: string;
  nationality: string;
  serviceAddress: string;
  personalCode: string;
  isShareholder: boolean;
};

type Shareholder = {
  fullName: string;
  address: string;
  shares: string;
  personalCode: string;
};

const emptyDirector = (): Director => ({
  fullName: "",
  dateOfBirth: "",
  nationality: "British",
  serviceAddress: "",
  personalCode: "",
  isShareholder: true,
});

const emptyShareholder = (): Shareholder => ({
  fullName: "",
  address: "",
  shares: "",
  personalCode: "",
});

export function IncorporationForm({
  service,
  sameDay = false,
}: {
  service: ChServiceDetail;
  sameDay?: boolean;
}) {
  const fees = formatChFeeBreakdown(service);
  const [proposedName, setProposedName] = useState("");
  const [nameStatus, setNameStatus] = useState<
    "idle" | "checking" | "available" | "taken" | "similar" | "error"
  >("idle");
  const [nameMessage, setNameMessage] = useState<string | null>(null);
  const [registeredOffice, setRegisteredOffice] = useState("");
  const [modeOfBusiness, setModeOfBusiness] = useState("");
  const [selectedSic, setSelectedSic] = useState<SicCode[]>([]);
  const [shareClass, setShareClass] = useState("Ordinary");
  const [nominalValue, setNominalValue] = useState("1.00");
  const [directors, setDirectors] = useState<Director[]>([emptyDirector()]);
  const [shareholders, setShareholders] = useState<Shareholder[]>([
    emptyShareholder(),
  ]);
  const [cutOffAck, setCutOffAck] = useState(false);
  const [personalCodeAck, setPersonalCodeAck] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const sicSuggestions = useMemo(
    () => searchSicCodes(modeOfBusiness, 8),
    [modeOfBusiness],
  );

  const totalShares = useMemo(
    () =>
      shareholders.reduce((sum, s) => sum + (Number(s.shares) || 0), 0),
    [shareholders],
  );

  useEffect(() => {
    const name = proposedName.trim();
    if (name.length < 3) {
      setNameStatus("idle");
      setNameMessage(null);
      return;
    }

    const t = setTimeout(() => {
      void checkNameAvailability(name);
    }, 450);
    return () => clearTimeout(t);
  }, [proposedName]);

  async function checkNameAvailability(name: string) {
    setNameStatus("checking");
    setNameMessage(null);
    try {
      const res = await fetch(
        `/api/companies-house/search?q=${encodeURIComponent(name)}`,
      );
      const data = (await res.json()) as {
        items?: Array<{ title: string; company_status?: string }>;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Name check failed");

      const items = data.items ?? [];
      const normalized = normalizeCompanyName(name);
      const exact = items.find(
        (i) =>
          normalizeCompanyName(i.title) === normalized &&
          (i.company_status ?? "active").toLowerCase() === "active",
      );
      if (exact) {
        setNameStatus("taken");
        setNameMessage(`“${exact.title}” is already on the register.`);
        return;
      }
      if (items.length > 0) {
        setNameStatus("similar");
        setNameMessage(
          `No exact active match. ${items.length} similar name${items.length === 1 ? "" : "s"} found — review carefully.`,
        );
        return;
      }
      setNameStatus("available");
      setNameMessage("No close matches found on the public register.");
    } catch (err) {
      setNameStatus("error");
      setNameMessage(
        err instanceof Error ? err.message : "Could not check name availability",
      );
    }
  }

  function toggleSic(row: SicCode) {
    setSelectedSic((prev) => {
      if (prev.some((s) => s.code === row.code)) {
        return prev.filter((s) => s.code !== row.code);
      }
      if (prev.length >= 4) return prev;
      return [...prev, row];
    });
  }

  function syncShareholderFromDirector(index: number, director: Director) {
    if (!director.isShareholder) return;
    setShareholders((prev) => {
      const next = [...prev];
      if (!next[0] || next.length === 1) {
        next[0] = {
          ...(next[0] ?? emptyShareholder()),
          fullName: director.fullName || next[0]?.fullName || "",
          address: director.serviceAddress || next[0]?.address || "",
          personalCode: director.personalCode || next[0]?.personalCode || "",
        };
        return next;
      }
      return next;
    });
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOk(null);

    if (nameStatus === "taken") {
      setError("Choose an available company name before submitting.");
      return;
    }
    if (selectedSic.length === 0) {
      setError("Select at least one SIC code for the mode of business.");
      return;
    }
    if (directors.some((d) => !d.fullName.trim() || !d.personalCode.trim())) {
      setError("Each director needs a full name and personal code.");
      return;
    }
    if (
      shareholders.some((s) => !s.fullName.trim() || !s.shares.trim()) ||
      totalShares <= 0
    ) {
      setError("Add shareholders with a share count greater than zero.");
      return;
    }
    if (sameDay && !cutOffAck) {
      setError("Confirm same-day cut-off acknowledgement.");
      return;
    }
    if (!personalCodeAck) {
      setError("Confirm personal codes are ready for filing.");
      return;
    }

    const shareCapital = `${totalShares} ${shareClass.toLowerCase()} shares of £${nominalValue} each`;

    const fields: Record<string, string | boolean> = {
      proposedName: proposedName.trim(),
      registeredOffice: registeredOffice.trim(),
      modeOfBusiness: modeOfBusiness.trim(),
      sicCodes: selectedSic.map((s) => s.code).join(", "),
      shareClass,
      nominalValue,
      totalShares: String(totalShares),
      shareCapital,
      directorCount: String(directors.length),
      directorsJson: JSON.stringify(directors),
      shareholdersJson: JSON.stringify(
        shareholders.map((s) => ({
          ...s,
          percentage:
            totalShares > 0
              ? (((Number(s.shares) || 0) / totalShares) * 100).toFixed(2)
              : "0",
        })),
      ),
      personalCodeAck,
    };
    if (sameDay) fields.cutOffAck = cutOffAck;

    startTransition(async () => {
      try {
        const res = await submitCompaniesHouseRequest({
          serviceId: service.id,
          fields,
        });
        setOk(`Request ${res.requestId.slice(0, 8)}… saved.`);
        const checkout = await fetch("/api/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ planKey: res.checkoutPlanKey }),
        });
        const data = (await checkout.json()) as {
          url?: string;
          error?: string;
        };
        if (checkout.ok && data.url) {
          window.location.href = data.url;
          return;
        }
        setOk(
          `Request saved. Payment not configured yet — queued for admin. ${
            data.error ?? ""
          }`,
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Submit failed");
      }
    });
  }

  return (
    <form className="panel gloss-card space-y-6 p-5" onSubmit={onSubmit}>
      <div>
        <h2 className="display text-2xl text-ink">Incorporate a company</h2>
        <p className="mt-1 text-sm text-ink-soft">
          You pay {fees.total} ({fees.statutory} Companies House + {fees.hydra}{" "}
          Hydra).
        </p>
      </div>

      <section className="space-y-3">
        <label className="block text-sm font-semibold text-ink">
          Proposed company name
          <span className="text-danger"> *</span>
          <input
            value={proposedName}
            onChange={(e) => setProposedName(e.target.value)}
            required
            placeholder="Example Trading Ltd"
            className="mt-1.5 w-full rounded-lg border border-line px-3 py-2 font-normal"
          />
        </label>
        {nameMessage && (
          <p
            className={`text-xs ${
              nameStatus === "taken"
                ? "text-danger"
                : nameStatus === "available"
                  ? "text-ok"
                  : "text-ink-soft"
            }`}
          >
            {nameStatus === "checking" ? "Checking availability…" : nameMessage}
          </p>
        )}
      </section>

      <label className="block text-sm font-semibold text-ink">
        Registered office address
        <span className="text-danger"> *</span>
        <textarea
          value={registeredOffice}
          onChange={(e) => setRegisteredOffice(e.target.value)}
          required
          rows={3}
          className="mt-1.5 w-full rounded-lg border border-line px-3 py-2 font-normal"
        />
      </label>

      <section className="space-y-3">
        <label className="block text-sm font-semibold text-ink">
          Mode of business
          <span className="text-danger"> *</span>
          <input
            value={modeOfBusiness}
            onChange={(e) => setModeOfBusiness(e.target.value)}
            required
            placeholder="e.g. software development, bookkeeping, cafe"
            className="mt-1.5 w-full rounded-lg border border-line px-3 py-2 font-normal"
          />
        </label>
        {sicSuggestions.length > 0 && (
          <ul className="space-y-1 rounded-lg border border-line p-2">
            {sicSuggestions.map((row) => {
              const active = selectedSic.some((s) => s.code === row.code);
              return (
                <li key={row.code}>
                  <button
                    type="button"
                    onClick={() => toggleSic(row)}
                    className={`flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm ${
                      active ? "bg-sea/10 text-ink" : "hover:bg-mist/60"
                    }`}
                  >
                    <span className="mono shrink-0 text-xs font-semibold text-sea">
                      {row.code}
                    </span>
                    <span className="font-normal text-ink-soft">
                      {row.description}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {selectedSic.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {selectedSic.map((s) => (
              <button
                key={s.code}
                type="button"
                onClick={() => toggleSic(s)}
                className="rounded-full border border-sea/30 bg-sea/10 px-3 py-1 text-xs font-semibold text-ink"
              >
                {s.code} ×
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-ink">Share capital</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-semibold text-ink">
            Share class
            <input
              value={shareClass}
              onChange={(e) => setShareClass(e.target.value)}
              required
              className="mt-1.5 w-full rounded-lg border border-line px-3 py-2 font-normal"
            />
          </label>
          <label className="block text-sm font-semibold text-ink">
            Nominal value (£)
            <input
              value={nominalValue}
              onChange={(e) => setNominalValue(e.target.value)}
              required
              className="mt-1.5 w-full rounded-lg border border-line px-3 py-2 font-normal"
            />
          </label>
        </div>
        <p className="text-xs text-ink-soft">
          Total shares from shareholders below:{" "}
          <span className="font-semibold text-ink">{totalShares || 0}</span>
        </p>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-ink">Directors</h3>
          <button
            type="button"
            className="text-sm font-semibold text-sea"
            onClick={() => setDirectors((d) => [...d, emptyDirector()])}
          >
            + Add director
          </button>
        </div>
        {directors.map((director, index) => (
          <div
            key={`director-${index}`}
            className="space-y-3 rounded-xl border border-line p-4"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-ink">
                Director {index + 1}
              </p>
              {directors.length > 1 && (
                <button
                  type="button"
                  className="text-xs font-semibold text-danger"
                  onClick={() =>
                    setDirectors((d) => d.filter((_, i) => i !== index))
                  }
                >
                  Remove
                </button>
              )}
            </div>
            <label className="block text-sm font-semibold text-ink">
              Full name
              <span className="text-danger"> *</span>
              <input
                value={director.fullName}
                onChange={(e) => {
                  const fullName = e.target.value;
                  setDirectors((d) => {
                    const next = [...d];
                    next[index] = { ...next[index], fullName };
                    return next;
                  });
                  syncShareholderFromDirector(index, {
                    ...director,
                    fullName,
                  });
                }}
                required
                className="mt-1.5 w-full rounded-lg border border-line px-3 py-2 font-normal"
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm font-semibold text-ink">
                Date of birth
                <input
                  type="date"
                  value={director.dateOfBirth}
                  onChange={(e) =>
                    setDirectors((d) => {
                      const next = [...d];
                      next[index] = {
                        ...next[index],
                        dateOfBirth: e.target.value,
                      };
                      return next;
                    })
                  }
                  className="mt-1.5 w-full rounded-lg border border-line px-3 py-2 font-normal"
                />
              </label>
              <label className="block text-sm font-semibold text-ink">
                Nationality
                <input
                  value={director.nationality}
                  onChange={(e) =>
                    setDirectors((d) => {
                      const next = [...d];
                      next[index] = {
                        ...next[index],
                        nationality: e.target.value,
                      };
                      return next;
                    })
                  }
                  className="mt-1.5 w-full rounded-lg border border-line px-3 py-2 font-normal"
                />
              </label>
            </div>
            <label className="block text-sm font-semibold text-ink">
              Service address
              <textarea
                value={director.serviceAddress}
                onChange={(e) =>
                  setDirectors((d) => {
                    const next = [...d];
                    next[index] = {
                      ...next[index],
                      serviceAddress: e.target.value,
                    };
                    return next;
                  })
                }
                rows={2}
                className="mt-1.5 w-full rounded-lg border border-line px-3 py-2 font-normal"
              />
            </label>
            <label className="block text-sm font-semibold text-ink">
              Companies House personal code
              <span className="text-danger"> *</span>
              <input
                value={director.personalCode}
                onChange={(e) =>
                  setDirectors((d) => {
                    const next = [...d];
                    next[index] = {
                      ...next[index],
                      personalCode: e.target.value.trim().toUpperCase(),
                    };
                    return next;
                  })
                }
                required
                placeholder="11-character personal code"
                className="mt-1.5 w-full rounded-lg border border-line px-3 py-2 font-normal mono"
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={director.isShareholder}
                onChange={(e) =>
                  setDirectors((d) => {
                    const next = [...d];
                    next[index] = {
                      ...next[index],
                      isShareholder: e.target.checked,
                    };
                    return next;
                  })
                }
              />
              Also a shareholder
            </label>
          </div>
        ))}
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-ink">Shareholders</h3>
          <button
            type="button"
            className="text-sm font-semibold text-sea"
            onClick={() => setShareholders((s) => [...s, emptyShareholder()])}
          >
            + Add shareholder
          </button>
        </div>
        {shareholders.map((shareholder, index) => {
          const shares = Number(shareholder.shares) || 0;
          const pct =
            totalShares > 0 ? ((shares / totalShares) * 100).toFixed(2) : "0.00";
          return (
            <div
              key={`shareholder-${index}`}
              className="space-y-3 rounded-xl border border-line p-4"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-ink">
                  Shareholder {index + 1}
                </p>
                {shareholders.length > 1 && (
                  <button
                    type="button"
                    className="text-xs font-semibold text-danger"
                    onClick={() =>
                      setShareholders((s) => s.filter((_, i) => i !== index))
                    }
                  >
                    Remove
                  </button>
                )}
              </div>
              <label className="block text-sm font-semibold text-ink">
                Full name
                <span className="text-danger"> *</span>
                <input
                  value={shareholder.fullName}
                  onChange={(e) =>
                    setShareholders((s) => {
                      const next = [...s];
                      next[index] = { ...next[index], fullName: e.target.value };
                      return next;
                    })
                  }
                  required
                  className="mt-1.5 w-full rounded-lg border border-line px-3 py-2 font-normal"
                />
              </label>
              <label className="block text-sm font-semibold text-ink">
                Address
                <textarea
                  value={shareholder.address}
                  onChange={(e) =>
                    setShareholders((s) => {
                      const next = [...s];
                      next[index] = { ...next[index], address: e.target.value };
                      return next;
                    })
                  }
                  rows={2}
                  className="mt-1.5 w-full rounded-lg border border-line px-3 py-2 font-normal"
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm font-semibold text-ink">
                  Number of shares
                  <span className="text-danger"> *</span>
                  <input
                    inputMode="numeric"
                    value={shareholder.shares}
                    onChange={(e) =>
                      setShareholders((s) => {
                        const next = [...s];
                        next[index] = {
                          ...next[index],
                          shares: e.target.value.replace(/[^\d]/g, ""),
                        };
                        return next;
                      })
                    }
                    required
                    className="mt-1.5 w-full rounded-lg border border-line px-3 py-2 font-normal"
                  />
                </label>
                <label className="block text-sm font-semibold text-ink">
                  Shareholding
                  <input
                    value={`${pct}%`}
                    readOnly
                    className="mt-1.5 w-full rounded-lg border border-line bg-mist/40 px-3 py-2 font-normal"
                  />
                </label>
              </div>
              <label className="block text-sm font-semibold text-ink">
                Personal code (if verifying as individual PSC / subscriber)
                <input
                  value={shareholder.personalCode}
                  onChange={(e) =>
                    setShareholders((s) => {
                      const next = [...s];
                      next[index] = {
                        ...next[index],
                        personalCode: e.target.value.trim().toUpperCase(),
                      };
                      return next;
                    })
                  }
                  placeholder="Optional unless required for this person"
                  className="mt-1.5 w-full rounded-lg border border-line px-3 py-2 font-normal mono"
                />
              </label>
            </div>
          );
        })}
      </section>

      {sameDay && (
        <label className="flex items-start gap-3 text-sm text-ink">
          <input
            type="checkbox"
            checked={cutOffAck}
            onChange={(e) => setCutOffAck(e.target.checked)}
            className="mt-1"
            required
          />
          <span>
            I understand same-day filing must meet Companies House cut-off times
            <span className="text-danger"> *</span>
          </span>
        </label>
      )}

      <label className="flex items-start gap-3 text-sm text-ink">
        <input
          type="checkbox"
          checked={personalCodeAck}
          onChange={(e) => setPersonalCodeAck(e.target.checked)}
          className="mt-1"
          required
        />
        <span>
          I confirm each director has verified identity via GOV.UK / ACSP and the
          personal codes entered are correct for filing
          <span className="text-danger"> *</span>
        </span>
      </label>

      {error && <p className="text-sm text-danger">{error}</p>}
      {ok && <p className="text-sm text-ok">{ok}</p>}

      <button type="submit" disabled={pending} className="btn btn-primary w-full">
        {pending ? "Saving & opening checkout…" : `Pay ${fees.total} & submit`}
      </button>
    </form>
  );
}

function normalizeCompanyName(name: string) {
  return name
    .toLowerCase()
    .replace(/\b(limited|ltd|llp|plc|cic)\b/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}
