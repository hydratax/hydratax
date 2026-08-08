import Link from "next/link";
import Image from "next/image";
import { requireSession } from "@/server/auth/session";
import { isPlatformAdmin } from "@/server/auth/admin";
import { getHmrcEnvInfo } from "@/server/actions/hmrc-connect";
import { displayPracticeName } from "@/lib/practice-name";
import { MobileNav } from "@/components/mobile-nav";
import { SignOutButton } from "@/components/sign-out-button";

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/clients", label: "Clients" },
  { href: "/settings/team", label: "Team" },
  { href: "/settings/hmrc", label: "HMRC" },
  { href: "/companies-house", label: "Companies House" },
  { href: "/admin", label: "Admin" },
  { href: "/support", label: "Support" },
] as const;

export async function AppShell({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const hmrc = await getHmrcEnvInfo();
  const practiceLabel = displayPracticeName(session.practiceName);

  const nav = NAV.filter((item) => {
    if (item.href === "/settings/team") return session.moduleAccess === "full";
    if (item.href === "/admin") return isPlatformAdmin(session.email);
    if (item.href === "/companies-house")
      return session.moduleAccess === "full";
    if (item.href === "/settings/hmrc") return session.moduleAccess === "full";
    return true;
  });

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
              {nav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="shell-nav-link"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="badge badge-sea mono">
              HMRC {hmrc.env === "production" ? "Live" : "Test"}
            </span>
            {session.moduleAccess !== "full" && (
              <span className="badge badge-muted">
                {session.moduleAccess.replace("_", " ")}
              </span>
            )}
            <div className="hidden text-right sm:block">
              <p className="max-w-[14rem] truncate font-semibold text-ink">
                {practiceLabel}
              </p>
              <p className="text-xs text-ink-soft">
                {session.moduleAccess === "full"
                  ? "Practice workspace"
                  : session.email ?? "Limited access"}
              </p>
            </div>
            <SignOutButton className="btn btn-secondary hidden text-sm sm:inline-flex" />
            <MobileNav items={[...nav]} showSignOut />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 md:px-6 md:py-10">
        {children}
      </main>
    </div>
  );
}
