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
        ]
      : []),
    ...(full ? [{ href: "/settings/hmrc", label: "HMRC connection" }] : []),
    ...(full ? [{ href: "/settings/channels", label: "Channels" }] : []),
    ...(full ? [{ href: "/settings/account", label: "Account" }] : []),
    ...(full ? [{ href: "/settings/team", label: "Team" }] : []),
    ...(admin ? [{ href: "/admin", label: "Admin" }] : []),
  ];

  const links = [
    { href: "/clients", label: "Clients" },
    { href: "/dashboard", label: "Dashboard" },
    ...(full ? [{ href: "/companies-house", label: "Companies House" }] : []),
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
      />
      <main className="mx-auto max-w-6xl px-4 py-8 md:px-6 md:py-10">
        {children}
      </main>
    </div>
  );
}
