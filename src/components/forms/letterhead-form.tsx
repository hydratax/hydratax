"use client";

import { useState, useTransition } from "react";
import { savePracticeLetterhead } from "@/server/actions/letterhead";
import type { PracticeLetterhead } from "@/lib/desk-profile";
import { messageFromUnknown } from "@/lib/action-error";
import { FormErrorBanner } from "@/components/forms/form-error-banner";

export function LetterheadForm({ initial }: { initial: PracticeLetterhead }) {
  const [practiceName, setPracticeName] = useState(initial.practiceName);
  const [address, setAddress] = useState(initial.addressLines.join("\n"));
  const [phone, setPhone] = useState(initial.phone ?? "");
  const [email, setEmail] = useState(initial.email ?? "");
  const [website, setWebsite] = useState(initial.website ?? "");
  const [qualification, setQualification] = useState(
    initial.qualification ?? "",
  );
  const [footer, setFooter] = useState(initial.footerLines.join("\n"));
  const [logoUrl, setLogoUrl] = useState(initial.logoUrl ?? "");
  const [bankName, setBankName] = useState(initial.bankName ?? "");
  const [accountName, setAccountName] = useState(initial.accountName ?? "");
  const [sortCode, setSortCode] = useState(initial.sortCode ?? "");
  const [accountNumber, setAccountNumber] = useState(
    initial.accountNumber ?? "",
  );
  const [paymentNote, setPaymentNote] = useState(initial.paymentNote ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      className="panel space-y-6 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        setErr(null);
        start(async () => {
          try {
            await savePracticeLetterhead({
              practiceName,
              addressLines: address.split("\n"),
              phone: phone || undefined,
              email: email || undefined,
              website: website || undefined,
              footerLines: footer.split("\n"),
              logoUrl: logoUrl || undefined,
              qualification: qualification || undefined,
              bankName: bankName || undefined,
              accountName: accountName || undefined,
              sortCode: sortCode || undefined,
              accountNumber: accountNumber || undefined,
              paymentNote: paymentNote || undefined,
            });
            setMsg(
              "Practice branding saved — used on letters, forms and invoices.",
            );
          } catch (error) {
            setErr(messageFromUnknown(error, "Could not save branding"));
          }
        });
      }}
    >
      <div>
        <h2 className="display text-xl text-ink">Practice identity</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Brands formal letters, client forms and invoices. Logo, address and
          bank details stay with the practice — not with each client.
        </p>
      </div>

      <label className="block">
        <span className="label">Practice / firm name</span>
        <input
          className="input mt-1"
          value={practiceName}
          onChange={(e) => setPracticeName(e.target.value)}
          required
        />
      </label>

      <label className="block">
        <span className="label">Logo URL</span>
        <input
          className="input mt-1"
          value={logoUrl}
          onChange={(e) => setLogoUrl(e.target.value)}
          placeholder="https://… (PNG or SVG recommended)"
        />
        <span className="mt-1 block text-xs text-ink-soft">
          Shown on letterheads and invoice PDFs. Host the image publicly or on
          your site.
        </span>
        {logoUrl.trim() ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl.trim()}
            alt="Practice logo preview"
            className="mt-3 h-14 w-auto max-w-[220px] object-contain"
          />
        ) : null}
      </label>

      <label className="block">
        <span className="label">Address (one line per row)</span>
        <textarea
          className="input mt-1 min-h-[5rem]"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder={"1 High Street\nLondon\nEC1A 1BB"}
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block">
          <span className="label">Phone</span>
          <input
            className="input mt-1"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="label">Email</span>
          <input
            className="input mt-1"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="label">Website</span>
          <input
            className="input mt-1"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="label">Qualification</span>
          <input
            className="input mt-1"
            value={qualification}
            onChange={(e) => setQualification(e.target.value)}
            placeholder="ACCA · ATT · AAT · CTA"
          />
        </label>
      </div>

      <div className="rounded-2xl border border-line/80 bg-sand/20 p-4">
        <h3 className="font-semibold text-ink">Bank details for invoices</h3>
        <p className="mt-1 text-xs text-ink-soft">
          Prefills payment instructions on new client invoices. You can still
          edit per invoice.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="label">Bank name</span>
            <input
              className="input mt-1"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              placeholder="e.g. Barclays"
            />
          </label>
          <label className="block">
            <span className="label">Account name</span>
            <input
              className="input mt-1"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="label">Sort code</span>
            <input
              className="input mono mt-1"
              value={sortCode}
              onChange={(e) => setSortCode(e.target.value)}
              placeholder="12-34-56"
            />
          </label>
          <label className="block">
            <span className="label">Account number</span>
            <input
              className="input mono mt-1"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              placeholder="12345678"
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="label">Payment note</span>
            <input
              className="input mt-1"
              value={paymentNote}
              onChange={(e) => setPaymentNote(e.target.value)}
              placeholder="Please quote the invoice number as reference"
            />
          </label>
        </div>
      </div>

      <label className="block">
        <span className="label">Footer lines (one per row)</span>
        <textarea
          className="input mt-1 min-h-[4rem]"
          value={footer}
          onChange={(e) => setFooter(e.target.value)}
          placeholder={
            "Registered for AML supervision …\nPartners: …\nCompany number …"
          }
        />
      </label>

      <FormErrorBanner error={err} />
      {msg && <p className="text-sm text-ok">{msg}</p>}
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Saving…" : "Save practice branding"}
      </button>
    </form>
  );
}
