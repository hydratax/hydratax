import Link from "next/link";
import Image from "next/image";
import { requireSession } from "@/server/auth/session";
import { getHmrcEnvInfo } from "@/server/actions/hmrc-connect";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const hmrc = await getHmrcEnvInfo();

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-line/80 bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 md:px-6">
          <div className="flex items-center gap-8">
            <Link href="/" className="inline-flex items-center gap-2.5">
              <Image
                src="/brand/logo.png"
                alt="HydraTax"
                width={32}
                height={32}
                className="object-contain"
                priority
              />
              <span className="display text-lg font-semibold text-ink">
                HydraTax
              </span>
            </Link>
            <nav className="hidden items-center gap-6 md:flex">
              <Link href="/dashboard" className="shell-nav-link">
                Dashboard
              </Link>
              <Link href="/clients" className="shell-nav-link">
                Clients
              </Link>
              <Link href="/settings/hmrc" className="shell-nav-link">
                HMRC
              </Link>
              <Link href="/companies-house" className="shell-nav-link">
                Companies House
              </Link>
              <Link href="/admin/companies-house" className="shell-nav-link">
                Admin
              </Link>
              <Link href="/support" className="shell-nav-link">
                Support
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="badge badge-sea mono">{hmrc.env}</span>
            <div className="hidden text-right sm:block">
              <p className="font-semibold text-ink">{session.practiceName}</p>
              <p className="text-xs text-ink-soft">Practice workspace</p>
            </div>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 md:px-6 md:py-10">
        {children}
      </main>
    </div>
  );
}
