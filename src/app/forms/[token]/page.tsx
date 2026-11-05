import { notFound } from "next/navigation";
import { OnboardingFormFill } from "@/components/forms/onboarding-form-fill";
import { findFormByShareToken } from "@/server/actions/onboarding-forms";

export const metadata = {
  title: "Onboarding form — HydraTax",
};

export default async function PublicOnboardingFormPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const found = await findFormByShareToken(token);
  if (!found) notFound();
  if (found.form.status === "draft") notFound();

  return (
    <main className="mx-auto max-w-lg px-4 py-10 sm:py-14">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-sea">
        HydraTax
      </p>
      <h1 className="display mt-2 text-3xl text-ink sm:text-4xl">
        {found.clientName}
      </h1>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-soft">
        Complete the form your accountant sent. Uploaded files go straight onto
        your client file — nothing is filed with HMRC from this page.
      </p>
      <div className="mt-8">
        <OnboardingFormFill
          token={token}
          form={found.form}
          clientName={found.clientName}
        />
      </div>
    </main>
  );
}
