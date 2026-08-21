"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
import { FormErrorBanner } from "@/components/forms/form-error-banner";
  createPromoCode,
  deactivatePromoCode,
  type PromoCodeRow,
} from "@/server/actions/promo-codes";

function formatDiscount(row: PromoCodeRow) {
  const off =
    row.percentOff != null
      ? `${row.percentOff}%`
      : row.amountOff != null
        ? `£${(row.amountOff / 100).toFixed(2)}`
        : "—";
  const when =
    row.duration === "forever"
      ? "forever"
      : row.duration === "repeating"
        ? "repeating"
        : "first month";
  return `${off} · ${when}`;
}

export function PromoCodeAdmin({
  initial,
  stripeReady,
}: {
  initial: PromoCodeRow[];
  stripeReady: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);
  const [createdLabel, setCreatedLabel] = useState<string | null>(null);
  const [discountType, setDiscountType] = useState<"percent" | "amount">(
    "percent",
  );
  const [duration, setDuration] = useState<"once" | "forever">("once");
  const [pending, start] = useTransition();

  if (!stripeReady) {
    return (
      <p className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
        Stripe is not configured. Add <code className="mono">STRIPE_SECRET_KEY</code>{" "}
        to create promo codes.
      </p>
    );
  }

  return (
    <div className="space-y-8">
      <form
        className="panel space-y-4 p-6"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          setCreated(null);
          setCreatedLabel(null);
          const fd = new FormData(e.currentTarget);
          const type =
            (fd.get("discountType") as "percent" | "amount") || "percent";
          const dur =
            (fd.get("duration") as "once" | "forever") || "once";
          start(async () => {
            try {
              const row = await createPromoCode({
                code: String(fd.get("code") ?? ""),
                discountType: type,
                duration: dur,
                percentOff:
                  type === "percent"
                    ? Number(fd.get("percentOff"))
                    : undefined,
                amountOffGbp:
                  type === "amount"
                    ? Number(fd.get("amountOffGbp"))
                    : undefined,
                maxRedemptions: fd.get("maxRedemptions")
                  ? Number(fd.get("maxRedemptions"))
                  : undefined,
                expiresAt: String(fd.get("expiresAt") ?? "") || undefined,
                note: String(fd.get("note") ?? "") || undefined,
              });
              setCreated(row.code);
              setCreatedLabel(formatDiscount(row));
              e.currentTarget.reset();
              setDiscountType("percent");
              setDuration("once");
              router.refresh();
            } catch (err) {
              setError(
                err instanceof Error ? err.message : "Could not create promo code",
              );
            }
          });
        }}
      >
        <div>
          <h2 className="display text-2xl text-ink">Create promo code</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Customers enter this at Stripe Checkout. Choose first month only or
            forever (every invoice).
          </p>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-ink">Discount</legend>
          <div className="flex flex-wrap gap-4">
            <label className="inline-flex items-center gap-2 text-sm text-ink">
              <input
                type="radio"
                name="discountType"
                value="percent"
                checked={discountType === "percent"}
                onChange={() => setDiscountType("percent")}
              />
              Percent off
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-ink">
              <input
                type="radio"
                name="discountType"
                value="amount"
                checked={discountType === "amount"}
                onChange={() => setDiscountType("amount")}
              />
              Fixed amount (GBP)
            </label>
          </div>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-ink">
            How long it applies
          </legend>
          <div className="flex flex-wrap gap-4">
            <label className="inline-flex items-center gap-2 text-sm text-ink">
              <input
                type="radio"
                name="duration"
                value="once"
                checked={duration === "once"}
                onChange={() => setDuration("once")}
              />
              First month only
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-ink">
              <input
                type="radio"
                name="duration"
                value="forever"
                checked={duration === "forever"}
                onChange={() => setDuration("forever")}
              />
              Forever (every month)
            </label>
          </div>
          {duration === "forever" && discountType === "percent" && (
            <p className="text-xs text-ink-soft">
              Tip: set percent to 100 for complimentary plans that stay £0.
            </p>
          )}
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-semibold text-ink">
            Code
            <input
              name="code"
              required
              minLength={3}
              maxLength={40}
              placeholder={duration === "forever" ? "HYDRA100FOREVER" : "HYDRA100"}
              className="mt-1.5 w-full rounded-lg border border-line px-3 py-2.5 font-normal uppercase"
            />
          </label>

          {discountType === "percent" ? (
            <label className="block text-sm font-semibold text-ink">
              Percent off
              <input
                name="percentOff"
                type="number"
                required
                min={1}
                max={100}
                step={1}
                defaultValue={duration === "forever" ? 100 : 20}
                key={duration}
                className="mt-1.5 w-full rounded-lg border border-line px-3 py-2.5 font-normal"
              />
            </label>
          ) : (
            <label className="block text-sm font-semibold text-ink">
              Amount off (£)
              <input
                name="amountOffGbp"
                type="number"
                required
                min={0.01}
                max={100000}
                step={0.01}
                placeholder="25.00"
                className="mt-1.5 w-full rounded-lg border border-line px-3 py-2.5 font-normal"
              />
            </label>
          )}

          <label className="block text-sm font-semibold text-ink">
            Max redemptions{" "}
            <span className="font-normal text-ink-soft">(optional)</span>
            <input
              name="maxRedemptions"
              type="number"
              min={1}
              max={10000}
              placeholder="Unlimited"
              className="mt-1.5 w-full rounded-lg border border-line px-3 py-2.5 font-normal"
            />
          </label>
          <label className="block text-sm font-semibold text-ink">
            Code expires{" "}
            <span className="font-normal text-ink-soft">(optional)</span>
            <input
              name="expiresAt"
              type="date"
              className="mt-1.5 w-full rounded-lg border border-line px-3 py-2.5 font-normal"
            />
          </label>
          <label className="block text-sm font-semibold text-ink sm:col-span-2">
            Internal note{" "}
            <span className="font-normal text-ink-soft">(optional)</span>
            <input
              name="note"
              maxLength={200}
              placeholder="Partner launch / complimentary forever"
              className="mt-1.5 w-full rounded-lg border border-line px-3 py-2.5 font-normal"
            />
          </label>
        </div>

        <FormErrorBanner error={error} />
        {created && (
          <p className="rounded-lg border border-sea/30 bg-sea/5 px-3 py-2 text-sm text-ink">
            Created <span className="mono font-semibold">{created}</span>
            {createdLabel ? ` — ${createdLabel}` : ""}. Share it for Checkout.
          </p>
        )}

        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? "Creating…" : "Create promo code"}
        </button>
      </form>

      <div className="panel overflow-hidden">
        <div className="border-b border-line px-4 py-3">
          <h2 className="font-semibold text-ink">Existing codes</h2>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="bg-sand/80 text-xs uppercase tracking-wide text-ink-soft">
            <tr>
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">Off</th>
              <th className="px-4 py-3">Redeemed</th>
              <th className="px-4 py-3">Expires</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {initial.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-ink-soft">
                  No promo codes yet.
                </td>
              </tr>
            ) : (
              initial.map((row) => (
                <tr key={row.id}>
                  <td className="mono px-4 py-3 font-semibold">{row.code}</td>
                  <td className="px-4 py-3">{formatDiscount(row)}</td>
                  <td className="px-4 py-3">
                    {row.timesRedeemed}
                    {row.maxRedemptions != null
                      ? ` / ${row.maxRedemptions}`
                      : ""}
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-soft">
                    {row.expiresAt
                      ? new Date(row.expiresAt).toLocaleDateString("en-GB")
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`badge ${row.active ? "badge-ok" : "badge-muted"}`}
                    >
                      {row.active ? "active" : "off"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {row.active && (
                      <button
                        type="button"
                        className="text-sm font-semibold text-danger"
                        disabled={pending}
                        onClick={() => {
                          start(async () => {
                            try {
                              await deactivatePromoCode(row.id);
                              router.refresh();
                            } catch (err) {
                              setError(
                                err instanceof Error
                                  ? err.message
                                  : "Deactivate failed",
                              );
                            }
                          });
                        }}
                      >
                        Deactivate
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
