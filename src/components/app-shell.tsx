import { requireSession } from "@/server/auth/session";
import { isPlatformAdmin } from "@/server/auth/admin";
import { AppShellHeader } from "@/components/app-shell-header";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const full = session.moduleAccess === "full";
  const admin = isPlatformAdmin(session.email);

  const serviceItems = [
    { href: "/filings", label: "Overview" },
    { href: "/filings/corporation-tax", label: "Corporation Tax" },
    ...(full
      ? [
          {
            href: "/filings/confirmation-statement",
            label: "Confirmation Statement",
          },
          { href: "/filings/annual-accounts", label: "Annual accounts" },
          { href: "/companies-house", label: "Companies House" },
        ]
      : []),
    ...(full ? [{ href: "/settings/hmrc", label: "HMRC connection" }] : []),
    ...(full ? [{ href: "/settings/hmrc-rules", label: "HMRC tax rules" }] : []),
    ...(full ? [{ href: "/settings/channels", label: "Channels" }] : []),
    ...(full ? [{ href: "/settings/account", label: "Account" }] : []),
    { href: "/settings/privacy", label: "Privacy & data" },
    ...(full
      ? [{ href: "/settings/letterhead", label: "Practice branding" }]
      : []),
    ...(full ? [{ href: "/settings/team", label: "Team" }] : []),
    ...(admin ? [{ href: "/admin", label: "Admin" }] : []),
  ];

  const links = [
    { href: "/", label: "Home" },
    { href: "/dashboard", label: "Dashboard" },
    { href: "/support", label: "Support" },
  ];

  return (
    <div className="min-h-screen">
      <AppShellHeader
        serviceItems={serviceItems}
        links={links}
        accessBadge={
          session.moduleAccess !== "full"
            ? session.moduleAccess.replace("_", " ")
            : null
        }
        userEmail={session.email}
        canManageTeam={full}
        canViewLogs={session.role === "owner" || session.role === "admin"}
      />
      <main className="mx-auto max-w-6xl px-4 py-8 md:px-6 md:py-10">
        {children}
      </main>
    </div>
  );
}
