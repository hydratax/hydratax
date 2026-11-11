import { Suspense } from "react";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { Verify2faForm } from "@/components/forms/verify-2fa-form";
import { getOptionalSession } from "@/server/auth/session";
import { MFA_OK_COOKIE, MFA_PENDING_COOKIE } from "@/lib/mfa-cookies";
import { beginMfaIfRequired, getMfaSettings } from "@/server/actions/mfa";
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
  const jar = await cookies();
  const pending = jar.get(MFA_PENDING_COOKIE)?.value;
  const ok = jar.get(MFA_OK_COOKIE)?.value;

  if (ok === session.userId) {
    redirect(next);
  }

  const settings = await getMfaSettings();
  if (!settings.enabled) {
    redirect(next);
  }

  let maskedTo: string | null | undefined =
    settings.channel === "email"
      ? settings.altEmail
        ? `${settings.altEmail.slice(0, 2)}***@${settings.altEmail.split("@")[1] ?? ""}`
        : null
      : settings.phoneE164
        ? `***${settings.phoneE164.slice(-4)}`
        : null;

  if (pending !== session.userId) {
    const started = await beginMfaIfRequired(session.userId);
    if (!started.required) {
      redirect(next);
    }
    maskedTo = started.maskedTo ?? maskedTo;
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4 py-12">
      <Verify2faForm
        channel={settings.channel ?? "totp"}
        maskedTo={
          settings.channel === "totp" ? "authenticator app" : maskedTo
        }
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
