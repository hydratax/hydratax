import { requireSession } from "@/server/auth/session";
import { isPlatformAdmin } from "@/server/auth/admin";
import { isPresentationDemoMode } from "@/server/demo/presentation-mode";
import { AppShellHeader } from "@/components/app-shell-header";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const full = session.moduleAccess === "full";
  const admin = isPlatformAdmin(session.email);
  const presentationDemo = admin ? await isPresentationDemoMode() : false;

  /** Filing rails — keep VAT / SA / PAYE as top-level items (do not strip). */
  const serviceItems = [
    { href: "/filings", label: "Overview" },
    { href: "/filings/corporation-tax", label: "Corporation Tax" },
    { href: "/clients?desk=vat", label: "VAT" },
    { href: "/clients?desk=sa", label: "Self Assessment" },
    { href: "/clients?desk=payroll", label: "PAYE" },
    ...(full
      ? [
          {
            label: "Companies House",
            children: [
              {
                href: "/filings/confirmation-statement",
                label: "Confirmation Statement",
              },
              { href: "/filings/annual-accounts", label: "Annual accounts" },
              { href: "/company-secretarial", label: "Company Secretarial" },
            ],
          },
        ]
      : []),
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
        platformAdmin={admin}
        presentationDemo={presentationDemo}
      />
      <main className="mx-auto max-w-6xl px-4 py-8 md:px-6 md:py-10">
        {children}
      </main>
    </div>
  );
}
