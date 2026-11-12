import { Suspense } from "react";
import { redirect } from "next/navigation";
import { SecureDeviceForm } from "@/components/forms/secure-device-form";
import { getOptionalSession } from "@/server/auth/session";
import { safeReturnPath } from "@/lib/auth-return";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { applyDeviceTrustPolicy } from "@/server/auth/session-policy";

export const metadata = { title: "Trust this device — HydraTax" };

async function SecureDeviceInner({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; suggest2fa?: string }>;
}) {
  const session = await getOptionalSession();
  if (!session) {
    redirect("/sign-in");
  }

  const sp = await searchParams;
  const nextPath = safeReturnPath(sp.next);
  const suggest2fa = sp.suggest2fa === "1";

  // First signup/login never asks — keep provisional 10h session and continue.
  if (isSupabaseConfigured()) {
    let skipTrust = false;
    try {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const count = Number(
        (user?.user_metadata as Record<string, unknown> | undefined)
          ?.hydra_login_count ?? 0,
      );
      skipTrust = !Number.isFinite(count) || count < 2;
    } catch {
      skipTrust = false;
    }
    if (skipTrust) {
      await applyDeviceTrustPolicy(false);
      redirect(nextPath);
    }
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4 py-12">
      <SecureDeviceForm nextPath={nextPath} suggest2fa={suggest2fa} />
    </div>
  );
}

export default function SecureDevicePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; suggest2fa?: string }>;
}) {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <Suspense
        fallback={
          <div className="flex min-h-[70vh] items-center justify-center px-4 py-12 text-sm text-ink-soft">
            Preparing…
          </div>
        }
      >
        <SecureDeviceInner searchParams={searchParams} />
      </Suspense>
      <SiteFooter />
    </div>
  );
}
