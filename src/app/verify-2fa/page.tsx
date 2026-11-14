import { Suspense } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Verify2faForm } from "@/components/forms/verify-2fa-form";
import { getOptionalSession } from "@/server/auth/session";
import {
  beginMfaIfRequired,
  hasValidMfaOkCookie,
  hasValidMfaPendingCookie,
  readMfaStatus,
} from "@/server/auth/mfa-core";
import { safeReturnPath } from "@/lib/auth-return";

export const metadata = { title: "Verify sign-in — HydraTax" };

async function Verify2faInner({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const session = await getOptionalSession();
  if (!session) {
    redirect("/sign-in");
  }

  const sp = await searchParams;
  const next = safeReturnPath(sp.next);

  const status = await readMfaStatus(session.userId);
  if (status.state === "off") {
    redirect(next);
  }

  if (status.state === "unknown") {
    // Fail closed: never wave the user through when settings are unreadable.
    return (
      <div className="flex min-h-[70vh] items-center justify-center px-4 py-12">
        <div className="w-full max-w-md space-y-3 rounded-2xl border border-line bg-white p-6 text-sm shadow-sm">
          <h1 className="display text-2xl text-ink">Verification unavailable</h1>
          <p className="text-ink-soft">
            We could not check your two-factor settings right now. Try again in
            a moment, or sign in again.
          </p>
          <Link href="/sign-in" className="font-semibold text-sea">
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  if (await hasValidMfaOkCookie(session.userId)) {
    redirect(next);
  }

  let maskedTo: string | null | undefined =
    status.channel === "email"
      ? status.altEmail
        ? `${status.altEmail.slice(0, 2)}***@${status.altEmail.split("@")[1] ?? ""}`
        : null
      : status.phoneE164
        ? `***${status.phoneE164.slice(-4)}`
        : null;

  if (!(await hasValidMfaPendingCookie(session.userId))) {
    try {
      const started = await beginMfaIfRequired(session.userId);
      if (!started.required) {
        redirect(next);
      }
      maskedTo = started.maskedTo ?? maskedTo;
    } catch (err) {
      // redirect() throws NEXT_REDIRECT — let it through; anything else (e.g.
      // cookies cannot be set while rendering) falls back to the form, where
      // "Resend code" re-issues the challenge from a Server Action.
      if (
        err &&
        typeof err === "object" &&
        "digest" in err &&
        String((err as { digest?: string }).digest ?? "").startsWith(
          "NEXT_REDIRECT",
        )
      ) {
        throw err;
      }
    }
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4 py-12">
      <Verify2faForm
        channel={status.channel}
        maskedTo={status.channel === "totp" ? "authenticator app" : maskedTo}
      />
    </div>
  );
}

export default function Verify2faPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[70vh] items-center justify-center px-4 py-12 text-sm text-ink-soft">
          Preparing verification…
        </div>
      }
    >
      <Verify2faInner searchParams={searchParams} />
    </Suspense>
  );
}
