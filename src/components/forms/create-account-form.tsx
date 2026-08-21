"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signUpWithSupabase } from "@/server/actions/auth";
import { safeReturnPath } from "@/lib/auth-return";
import { messageFromUnknown } from "@/lib/action-error";
import { OrgChTypeahead } from "@/components/forms/org-ch-typeahead";
import { FormErrorBanner } from "@/components/forms/form-error-banner";
import {
  AuthDivider,
  GoogleAuthButton,
} from "@/components/forms/google-auth-button";

const ORG_TYPES = [
  {
    id: "company" as const,
    title: "Company",
    blurb: "Limited company director or secretary",
    icon: "building",
  },
  {
    id: "sole_trader" as const,
    title: "Sole trader",
    blurb: "Self-employed individual",
    icon: "person",
  },
  {
    id: "partnership" as const,
    title: "Partnership",
    blurb: "Partners filing together",
    icon: "people",
  },
  {
    id: "practice" as const,
    title: "Accountancy practice",
    blurb: "Accountants managing multiple clients",
    icon: "practice",
  },
];

function OrgIcon({ kind, active }: { kind: string; active: boolean }) {
  const stroke = active ? "#0f766e" : "#94a3b8";
  if (kind === "building") {
    return (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M4 20V8l8-4 8 4v12H4Z"
          stroke={stroke}
          strokeWidth="1.6"
        />
        <path d="M9 20v-6h6v6" stroke={stroke} strokeWidth="1.6" />
      </svg>
    );
  }
  if (kind === "person") {
    return (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="12" cy="8" r="3.5" stroke={stroke} strokeWidth="1.6" />
        <path
          d="M5 19c1.5-3.5 4-5 7-5s5.5 1.5 7 5"
          stroke={stroke}
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (kind === "people") {
    return (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="9" cy="8" r="3" stroke={stroke} strokeWidth="1.6" />
        <circle cx="16" cy="9" r="2.5" stroke={stroke} strokeWidth="1.6" />
        <path
          d="M3.5 19c1.2-3 3.2-4.5 5.5-4.5S13 16 14.2 19"
          stroke={stroke}
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path
          d="M14 14.5c1.6 0 3 .7 4 2.5"
          stroke={stroke}
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect
        x="3"
        y="4"
        width="18"
        height="16"
        rx="2"
        stroke={stroke}
        strokeWidth="1.6"
      />
      <path d="M3 9h18M9 9v11M15 9v11" stroke={stroke} strokeWidth="1.6" />
    </svg>
  );
}

export function CreateAccountForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnPath = safeReturnPath(searchParams.get("next"));
  const [orgType, setOrgType] = useState<(typeof ORG_TYPES)[number]["id"]>(
    "practice",
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const chLookup = orgType === "company" || orgType === "practice";

  const searchLabel = useMemo(() => {
    if (orgType === "practice" || orgType === "company") {
      return "Search company";
    }
    if (orgType === "partnership") {
      return "Partnership trading name";
    }
    return "Trading name";
  }, [orgType]);

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-[0_24px_60px_-40px_rgba(10,10,10,0.45)]">
      <div className="bg-sea px-6 py-6 text-white md:px-8">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-teal-100">
          Get started
        </p>
        <h1 className="display mt-1 text-3xl md:text-4xl">Create your account</h1>
        <p className="mt-2 text-white/80">
          Company, sole trader, partnership, or multi-client practice — then
          choose the plan that fits when you need filing rails.
        </p>
      </div>

      <form
        className="space-y-8 px-6 py-8 md:px-8"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          const fd = new FormData(e.currentTarget);
          startTransition(async () => {
            try {
              const result = await signUpWithSupabase({
                orgType,
                orgSearch: String(fd.get("orgSearch") ?? ""),
                companyNumber:
                  String(fd.get("companyNumber") ?? "").trim() || undefined,
                firstName: String(fd.get("firstName") ?? ""),
                surname: String(fd.get("surname") ?? ""),
                email: String(fd.get("email") ?? ""),
                password: String(fd.get("password") ?? ""),
                confirmPassword: String(fd.get("confirmPassword") ?? ""),
                startTrial: false,
              });
              if (!result.ok) {
                setError(result.error);
                return;
              }
              router.push(
                result.redirectTo.startsWith("/sign-in")
                  ? `${result.redirectTo}&next=${encodeURIComponent(returnPath)}`
                  : result.redirectTo || returnPath,
              );
              router.refresh();
            } catch (err) {
              setError(
                messageFromUnknown(err, "Could not create account"),
              );
            }
          });
        }}
      >
        <section>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-ink">
            <span className="text-sea" aria-hidden>
              ▦
            </span>
            Your organisation
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {ORG_TYPES.map((t) => {
              const active = orgType === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setOrgType(t.id)}
                  className={`flex items-start gap-3 rounded-xl border-2 p-4 text-left transition ${
                    active
                      ? "border-sea bg-sea/5 shadow-sm"
                      : "border-line bg-white hover:border-mist"
                  }`}
                >
                  <OrgIcon kind={t.icon} active={active} />
                  <span>
                    <span className="block font-semibold text-ink">
                      {t.title}
                    </span>
                    <span className="mt-0.5 block text-sm text-ink-soft">
                      {t.blurb}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <OrgChTypeahead
            key={orgType}
            placeholder={searchLabel}
            required={orgType !== "sole_trader"}
            enabled={chLookup}
          />
        </section>

        <div className="space-y-4">
          <GoogleAuthButton
            next={returnPath}
            orgType={orgType}
            label="Sign up with Google"
          />
          <AuthDivider label="or use email" />
        </div>

        <section>
          <h2 className="text-lg font-semibold text-ink">Personal information</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-semibold text-ink">
              First name <span className="text-danger">*</span>
              <input
                name="firstName"
                required
                placeholder="John"
                className="mt-1.5 w-full rounded-lg border border-line px-3 py-2.5 font-normal"
              />
            </label>
            <label className="block text-sm font-semibold text-ink">
              Surname <span className="text-danger">*</span>
              <input
                name="surname"
                required
                placeholder="Smith"
                className="mt-1.5 w-full rounded-lg border border-line px-3 py-2.5 font-normal"
              />
            </label>
          </div>
          <label className="mt-4 block text-sm font-semibold text-ink">
            Email address <span className="text-danger">*</span>
            <input
              name="email"
              type="email"
              required
              placeholder="you@example.com"
              className="mt-1.5 w-full rounded-lg border border-line px-3 py-2.5 font-normal"
            />
          </label>
        </section>

        <section>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-ink">
            <span className="text-sea" aria-hidden>
              🔒
            </span>
            Set your password
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-semibold text-ink">
              Password <span className="text-danger">*</span>
              <input
                name="password"
                type="password"
                required
                minLength={8}
                placeholder="Min. 8 characters"
                className="mt-1.5 w-full rounded-lg border border-line px-3 py-2.5 font-normal"
              />
            </label>
            <label className="block text-sm font-semibold text-ink">
              Confirm password <span className="text-danger">*</span>
              <input
                name="confirmPassword"
                type="password"
                required
                minLength={8}
                placeholder="Re-enter password"
                className="mt-1.5 w-full rounded-lg border border-line px-3 py-2.5 font-normal"
              />
            </label>
          </div>
        </section>

        <FormErrorBanner error={error} title="Account creation blocked" />

        <button
          type="submit"
          disabled={pending}
          className="btn btn-primary w-full disabled:opacity-60"
        >
          {pending ? "Creating account…" : "Create account & continue"}
        </button>
      </form>
    </div>
  );
}
