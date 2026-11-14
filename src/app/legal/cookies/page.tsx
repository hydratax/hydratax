import { LegalH2, LegalShell } from "@/components/legal/legal-shell";
import { LegalLink } from "@/components/legal/legal-bits";
import { consentBannerRequired, STORAGE_INVENTORY } from "@/lib/cookie-inventory";
import { LEGAL_CONTACT_EMAIL, LEGAL_UPDATED } from "@/lib/legal";

export const metadata = {
  title: "Cookie notice — HydraTax",
  description:
    "The cookies and browser storage HydraTax uses. Only strictly necessary storage is used; no advertising or analytics cookies.",
};

export default function CookieNoticePage() {
  // If someone adds a non-essential item to the inventory, the build must not
  // silently publish a "strictly necessary only" claim.
  const needsConsent = consentBannerRequired();

  return (
    <LegalShell title="Cookie notice" updated={LEGAL_UPDATED.cookies}>
      <section id="cookies" className="scroll-mt-24 space-y-3">
        <p>
          Cookies are small files saved on your device; &quot;local storage&quot;
          is similar browser storage. Under the Privacy and Electronic
          Communications Regulations (PECR) regulation 6 we need your consent
          for non-essential storage, but not for storage that is{" "}
          <strong className="text-ink">strictly necessary</strong> to provide a
          service you asked for.
        </p>
        {needsConsent ? (
          <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-900">
            Non-essential storage is configured, but no consent mechanism is
            published. This notice must be updated before release.
          </p>
        ) : (
          <p>
            <strong className="text-ink">
              HydraTax currently uses only strictly necessary storage.
            </strong>{" "}
            We do not use advertising, tracking or analytics cookies, so there
            is no cookie banner to accept. If that changes we will ask for your
            consent first and update this page.
          </p>
        )}
      </section>

      <LegalH2>What we store</LegalH2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-line text-ink">
              <th className="py-2 pr-3 font-semibold">Name</th>
              <th className="py-2 pr-3 font-semibold">Type / set by</th>
              <th className="py-2 pr-3 font-semibold">Purpose</th>
              <th className="py-2 font-semibold">Duration</th>
            </tr>
          </thead>
          <tbody>
            {STORAGE_INVENTORY.map((i) => (
              <tr key={i.name} className="border-b border-line/70 align-top">
                <td className="py-2 pr-3 font-mono text-ink">{i.name}</td>
                <td className="py-2 pr-3">
                  {i.kind} · {i.setBy}
                </td>
                <td className="py-2 pr-3">{i.purpose}</td>
                <td className="py-2">{i.duration}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <LegalH2>Your choices</LegalH2>
      <p>
        You can block or delete cookies in your browser settings, but the
        service will not work without the sign-in and security cookies above.
        Marketing email is separate: it is sent only with your consent and you
        can unsubscribe from any message.
      </p>
      <p>
        See also our{" "}
        <LegalLink href="/privacy">Privacy Notice</LegalLink>. Questions:{" "}
        <a
          className="font-semibold text-sea"
          href={`mailto:${LEGAL_CONTACT_EMAIL}`}
        >
          {LEGAL_CONTACT_EMAIL}
        </a>
        .
      </p>
    </LegalShell>
  );
}
