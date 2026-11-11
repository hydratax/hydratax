"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  disableMfa,
  saveMfaSettings,
  type MfaSettings,
} from "@/server/actions/mfa";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/env";
import { FormErrorBanner } from "@/components/forms/form-error-banner";

type Channel = "totp" | "email" | "phone";

export function MfaSettingsPanel({ initial }: { initial: MfaSettings }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [enabled, setEnabled] = useState(initial.enabled);
  const [channel, setChannel] = useState<Channel>(
    (initial.channel as Channel | null) ?? "totp",
  );
  const [qr, setQr] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [totpSecret, setTotpSecret] = useState<string | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [totpReady, setTotpReady] = useState(
    initial.enabled && initial.channel === "totp",
  );

  useEffect(() => {
    if (!enabled || channel !== "totp" || totpReady || !isSupabaseConfigured()) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const supabase = createClient();
        const { data: factors } = await supabase.auth.mfa.listFactors();
        const existing = factors?.totp?.find((f) => f.status === "verified");
        if (existing) {
          if (!cancelled) {
            setTotpReady(true);
            setFactorId(existing.id);
          }
          return;
        }
        const { data, error: enrollError } = await supabase.auth.mfa.enroll({
          factorType: "totp",
          friendlyName: "HydraTax",
        });
        if (enrollError) throw enrollError;
        if (cancelled) return;
        setFactorId(data.id);
        setQr(data.totp.qr_code);
        setTotpSecret(data.totp.secret);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Could not start authenticator setup",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, channel, totpReady]);

  return (
    <form
      className="panel space-y-4 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setError(null);
        setSaved(false);
        start(async () => {
          try {
            if (!enabled) {
              if (isSupabaseConfigured() && factorId) {
                try {
                  const supabase = createClient();
                  await supabase.auth.mfa.unenroll({ factorId });
                } catch {
                  /* ignore */
                }
              }
              await disableMfa();
              setTotpReady(false);
              setQr(null);
            } else if (channel === "totp") {
              if (!totpReady) {
                if (!factorId || !verifyCode.trim()) {
                  throw new Error(
                    "Scan the QR code in Google Authenticator, then enter the 6-digit code.",
                  );
                }
                const supabase = createClient();
                const challenge = await supabase.auth.mfa.challenge({
                  factorId,
                });
                if (challenge.error) throw challenge.error;
                const verify = await supabase.auth.mfa.verify({
                  factorId,
                  challengeId: challenge.data.id,
                  code: verifyCode.trim(),
                });
                if (verify.error) throw verify.error;
                setTotpReady(true);
              }
              await saveMfaSettings({
                enabled: true,
                channel: "totp",
                altEmail: "",
                phoneE164: "",
              });
            } else {
              await saveMfaSettings({
                enabled: true,
                channel,
                altEmail: String(fd.get("altEmail") ?? ""),
                phoneE164: String(fd.get("phoneE164") ?? ""),
              });
            }
            setSaved(true);
            router.refresh();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Could not save");
          }
        });
      }}
    >
      <div>
        <h2 className="display text-2xl text-ink">Two-factor authentication</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Prefer an authenticator app (Google Authenticator, Authy, 1Password) —
          free, no SMS. Email codes are also free via Resend. SMS is optional and
          billed per text.
        </p>
      </div>

      <label className="flex items-start gap-3 text-sm text-ink">
        <input
          type="checkbox"
          className="mt-1"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        <span>
          <span className="font-semibold">Require a code at sign-in</span>
          <span className="mt-0.5 block text-ink-soft">
            Each team member sets this up on their own Account page.
          </span>
        </span>
      </label>

      {enabled ? (
        <>
          <fieldset>
            <legend className="text-sm font-semibold text-ink">
              How should we verify?
            </legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {(
                [
                  {
                    id: "totp" as const,
                    title: "Authenticator app",
                    blurb: "Google Authenticator / Authy — free, no messages",
                  },
                  {
                    id: "email" as const,
                    title: "Alternative email",
                    blurb: "Code emailed (uses Resend)",
                  },
                  {
                    id: "phone" as const,
                    title: "Mobile (SMS)",
                    blurb: initial.smsAvailable
                      ? "Twilio SMS — per-message cost"
                      : "Not configured (use app or email)",
                    disabled: !initial.smsAvailable,
                  },
                ] as const
              ).map((opt) => (
                <label
                  key={opt.id}
                  className={`cursor-pointer rounded-lg border p-3 text-sm ${
                    channel === opt.id
                      ? "border-sea bg-sea/5"
                      : "disabled" in opt && opt.disabled
                        ? "cursor-not-allowed border-line opacity-60"
                        : "border-line"
                  }`}
                >
                  <input
                    type="radio"
                    className="sr-only"
                    name="channel"
                    checked={channel === opt.id}
                    disabled={"disabled" in opt ? opt.disabled : false}
                    onChange={() => {
                      setChannel(opt.id);
                      if (opt.id !== "totp") {
                        setQr(null);
                      }
                    }}
                  />
                  <span className="font-semibold text-ink">{opt.title}</span>
                  <span className="mt-0.5 block text-ink-soft">{opt.blurb}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {channel === "totp" ? (
            <div className="space-y-3 rounded-lg border border-line bg-sand/30 p-4">
              {totpReady ? (
                <p className="text-sm text-ink">
                  Authenticator app is linked. At sign-in you will enter the
                  6-digit code from the app.
                </p>
              ) : (
                <>
                  <p className="text-sm text-ink-soft">
                    Open Google Authenticator (or Authy / 1Password), scan this
                    QR code, then enter the code shown to confirm.
                  </p>
                  {qr ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={qr}
                      alt="Authenticator QR code"
                      className="mx-auto h-44 w-44 rounded-lg bg-white p-2"
                    />
                  ) : (
                    <p className="text-sm text-ink-soft">Preparing QR code…</p>
                  )}
                  {totpSecret ? (
                    <p className="break-all text-xs text-ink-soft">
                      Manual key: <span className="font-mono text-ink">{totpSecret}</span>
                    </p>
                  ) : null}
                  <label className="block text-sm font-semibold text-ink">
                    Code from app
                    <input
                      value={verifyCode}
                      onChange={(e) => setVerifyCode(e.target.value.trim())}
                      inputMode="numeric"
                      maxLength={6}
                      className="input mt-1.5 tracking-[0.2em]"
                      placeholder="••••••"
                    />
                  </label>
                </>
              )}
            </div>
          ) : null}

          {channel === "email" ? (
            <div>
              <label className="label" htmlFor="altEmail">
                Alternative email
              </label>
              <input
                id="altEmail"
                name="altEmail"
                type="email"
                required={enabled && channel === "email"}
                className="input"
                defaultValue={initial.altEmail ?? ""}
                placeholder="backup@example.com"
              />
            </div>
          ) : null}

          {channel === "phone" ? (
            <div>
              <label className="label" htmlFor="phoneE164">
                Mobile number
              </label>
              <input
                id="phoneE164"
                name="phoneE164"
                type="tel"
                required={enabled && channel === "phone"}
                className="input"
                defaultValue={initial.phoneE164 ?? ""}
                placeholder="+447700900123"
              />
              <p className="mt-1 text-xs text-ink-soft">
                International format with country code. SMS is charged by Twilio.
              </p>
            </div>
          ) : null}
        </>
      ) : null}

      <FormErrorBanner error={error} />
      {saved ? (
        <p className="text-sm font-medium text-sea">Saved.</p>
      ) : null}

      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Saving…" : "Save 2FA settings"}
      </button>
    </form>
  );
}
