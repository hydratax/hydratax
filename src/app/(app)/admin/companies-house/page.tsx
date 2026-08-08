import Link from "next/link";
import { listChRequestsAdmin, getAdminAccountRef } from "@/server/actions/ch-requests";
import { formatGBP } from "@/lib/pricing";
import { getChService } from "@/lib/ch-services";
import { AdminChActions } from "@/components/admin/ch-actions";
import { requireAdmin } from "@/server/auth/admin";

export const metadata = {
  title: "Admin — Companies House requests",
};

export default async function AdminCompaniesHousePage() {
  await requireAdmin();
  const rows = await listChRequestsAdmin();
  const accountRef = await getAdminAccountRef();

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-sea">
          Operations
        </p>
        <h1 className="display mt-2 text-4xl text-ink">
          Companies House requests
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-soft">
          Subscription and payment checks only. No director names, emails,
          addresses, or personal codes are shown here — supporting HMRC / CH
          data-minimisation for SaaS approval. Your opaque account ref:{" "}
          <span className="mono font-semibold text-ink">{accountRef}</span>
        </p>
      </div>

      <div className="panel overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-sand/80 text-xs uppercase tracking-wide text-ink-soft">
            <tr>
              <th className="px-4 py-3">Request</th>
              <th className="px-4 py-3">Service</th>
              <th className="px-4 py-3">Company no.</th>
              <th className="px-4 py-3">Account</th>
              <th className="px-4 py-3">Payment</th>
              <th className="px-4 py-3">Sub</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-ink-soft">
                  No Companies House requests yet.
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const service = getChService(r.serviceId);
                return (
                  <tr key={r.id}>
                    <td className="mono px-4 py-3 text-xs">
                      {r.id.slice(0, 8)}
                      <p className="mt-0.5 text-[10px] text-ink-soft">
                        {new Date(r.createdAt).toLocaleString("en-GB")}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      {service?.title ?? r.serviceId}
                      <p className="text-xs text-ink-soft">
                        {formatGBP(r.amountPence / 100)}
                      </p>
                    </td>
                    <td className="mono px-4 py-3">
                      {r.companyNumber ?? "—"}
                    </td>
                    <td className="mono px-4 py-3 text-xs">{r.accountRef}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`badge ${
                          r.paymentStatus === "paid"
                            ? "badge-ok"
                            : "badge-muted"
                        }`}
                      >
                        {r.paymentStatus}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {r.subscriptionActive ? (
                        <span className="badge badge-ok">active</span>
                      ) : (
                        <span className="badge badge-muted">no</span>
                      )}
                    </td>
                    <td className="px-4 py-3 capitalize">{r.status.replace("_", " ")}</td>
                    <td className="px-4 py-3">
                      <AdminChActions
                        requestId={r.id}
                        paymentStatus={r.paymentStatus}
                        status={r.status}
                      />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-ink-soft">
        <Link href="/dashboard" className="font-semibold text-sea">
          ← Back to dashboard
        </Link>
        . Company numbers are public register identifiers, not personal data.
      </p>
    </div>
  );
}
