import { UnsubscribeForm } from "@/components/unsubscribe-form";

export const metadata = {
  title: "Unsubscribe — HydraTax",
};

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col justify-center px-4 py-16">
      {!token ? (
        <div className="panel space-y-4 p-8 text-center">
          <h1 className="display text-3xl text-ink">Invalid link</h1>
          <p className="text-ink-soft">
            This unsubscribe link is missing a token. Use the link from your
            email.
          </p>
        </div>
      ) : (
        <UnsubscribeForm token={token} />
      )}
    </div>
  );
}
