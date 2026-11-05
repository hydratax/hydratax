import Link from "next/link";
import { BulkClientImport } from "@/components/forms/bulk-client-import";

export const metadata = {
  title: "Bulk import clients — HydraTax",
};

export default function BulkImportClientsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-sea">
          Practice
        </p>
        <h1 className="display mt-1 text-4xl text-ink">Bulk import</h1>
        <p className="mt-2 text-ink-soft">
          Excel or CSV, up to 1,000 rows. Download the sample file for every
          field we can keep (name, company number, auth code, UTR, VAT, NI,
          PAYE, email, phone, and flags). Match your own spreadsheet to those
          headers — extra columns such as address are ignored. Imports run in
          small batches; Companies House details load when you open each client.
        </p>
      </div>

      <div className="panel p-6">
        <BulkClientImport />
      </div>

      <p className="text-sm text-ink-soft">
        <Link href="/clients" className="font-semibold text-sea">
          ← Back to clients
        </Link>
      </p>
    </div>
  );
}
