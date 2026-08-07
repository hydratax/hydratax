import { listClients } from "@/server/actions/clients";
import { getHmrcEnvInfo, getConnectionStatus } from "@/server/actions/hmrc-connect";
import { HmrcConnectButton } from "@/components/forms/hmrc-connect-button";
import Link from "next/link";

const REQUIREMENTS = [
  {
    title: "1. HMRC Developer Hub application",
    body: "Create an application at developer.service.hmrc.gov.uk. Subscribe to the APIs you need (VAT MTD, Income Tax MTD, Corporation Tax, PAYE RTI).",
  },
  {
    title: "2. OAuth credentials",
    body: "Copy Client ID and Client Secret into HMRC_CLIENT_ID / HMRC_CLIENT_SECRET. Register redirect URI exactly as shown below.",
  },
  {
    title: "3. Environment isolation",
    body: "Use HMRC_ENV=sandbox until fraud-prevention and end-to-end tests pass. Production credentials take ~10 working days after approval — never mix sandbox tokens into production.",
  },
  {
    title: "4. Fraud-prevention headers",
    body: "MTD VAT and ITSA require Gov-Client-* and Gov-Vendor-* headers on every call. Set HMRC_VENDOR_PUBLIC_IP, HMRC_VENDOR_LICENSE_IDS, and HMRC_VENDOR_VERSION.",
  },
  {
    title: "5. Token encryption",
    body: "Set TOKEN_ENCRYPTION_KEY (32-byte key, hex or base64). Access and refresh tokens are AES-256 encrypted at rest per client.",
  },
  {
    title: "6. Per-client OAuth",
    body: "Each client authorises Hydra against their HMRC account via Connect HMRC. Then prepare → review → submit from the client workspace.",
  },
] as const;

export default async function HmrcSettingsPage() {
  const hmrc = await getHmrcEnvInfo();
  const clients = await listClients();
  const statuses = await Promise.all(
    clients.map(async (c) => ({
      client: c,
      status: await getConnectionStatus(c.id),
    })),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="display text-4xl text-ink">HMRC connections</h1>
        <p className="mt-1 text-ink-soft">
          What you need to integrate HMRC, plus live connection status for every
          client.
        </p>
      </div>

      <div className="panel grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="text-xs font-semibold uppercase text-ink-soft">
            Environment
          </p>
          <p className="display mt-1 text-2xl capitalize">{hmrc.env}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase text-ink-soft">
            Credentials
          </p>
          <p className="mt-1 font-semibold">
            {hmrc.configured ? "Configured" : "Missing client id/secret"}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase text-ink-soft">
            Encryption key
          </p>
          <p className="mt-1 font-semibold">
            {hmrc.hasEncryptionKey ? "Set" : "Missing"}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase text-ink-soft">
            Vendor IP
          </p>
          <p className="mt-1 font-semibold">
            {hmrc.hasVendorIp ? "Set" : "Missing"}
          </p>
        </div>
      </div>

      <div className="panel p-5">
        <p className="text-xs font-semibold uppercase text-ink-soft">
          OAuth redirect URI (register in HMRC Developer Hub)
        </p>
        <p className="mono mt-2 break-all text-sm text-ink">{hmrc.redirectUri}</p>
        <p className="mono mt-3 break-all text-xs text-ink-soft">
          API base · {hmrc.apiBase}
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="display text-2xl text-ink">Integration checklist</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {REQUIREMENTS.map((r) => (
            <article key={r.title} className="panel p-4">
              <h3 className="font-semibold text-ink">{r.title}</h3>
              <p className="mt-1.5 text-sm text-ink-soft">{r.body}</p>
            </article>
          ))}
        </div>
      </section>

      <div className="panel overflow-hidden">
        <div className="border-b border-line bg-sand/60 px-4 py-3">
          <h2 className="font-semibold text-ink">Client authorisations</h2>
        </div>
        {clients.length === 0 ? (
          <p className="p-6 text-sm text-ink-soft">
            Add a client first, then connect their HMRC account.{" "}
            <Link href="/clients/new" className="font-semibold text-sea">
              Add client
            </Link>
          </p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-sand/80 text-xs uppercase tracking-wide text-ink-soft">
              <tr>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {statuses.map(({ client, status }) => (
                <tr key={client.id}>
                  <td className="px-4 py-3">
                    <Link
                      href={`/clients/${client.id}`}
                      className="font-semibold hover:text-sea"
                    >
                      {client.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    {status.connected ? (
                      <span className="badge badge-ok">
                        Connected · {status.hmrcEnv}
                      </span>
                    ) : (
                      <span className="badge badge-muted">Not connected</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <HmrcConnectButton
                      clientId={client.id}
                      connected={status.connected}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-sm text-ink-soft">
        Full notes:{" "}
        <code className="mono">docs/hmrc-integration.md</code>
      </p>
    </div>
  );
}
