import Link from "next/link";
import { CancelDeletionForm } from "@/components/privacy/cancel-deletion-form";

export const metadata = {
  title: "Cancel account deletion — HydraTax",
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};

export default async function CancelDeletionPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const { t } = await searchParams;
  const token = typeof t === "string" ? t.slice(0, 200) : "";

  return (
    <main className="mx-auto max-w-lg px-4 py-16">
      <h1 className="display text-3xl text-ink">Cancel account deletion</h1>
      <p className="mt-3 text-ink-soft">
        Your HydraTax account is scheduled for deletion. Confirm below to keep
        your account and practice data, and to restore your subscription.
      </p>
      {token ? (
        <CancelDeletionForm token={token} />
      ) : (
        <p className="mt-6 text-sm text-danger">
          This link is incomplete. Use the link from your email, or sign in and
          open Settings → Privacy &amp; data.
        </p>
      )}
      <p className="mt-8 text-sm text-ink-soft">
        <Link href="/" className="font-semibold text-sea">
          Back to HydraTax
        </Link>
      </p>
    </main>
  );
}
