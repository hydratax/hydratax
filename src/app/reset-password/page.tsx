import { ResetPasswordForm } from "@/components/forms/reset-password-form";
import { SiteHeader } from "@/components/site-header";

export const metadata = {
  title: "Reset password — HydraTax",
};

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen bg-paper">
      <SiteHeader />
      <main className="mx-auto flex max-w-6xl justify-center px-4 py-10 md:px-6 md:py-16">
        <ResetPasswordForm />
      </main>
    </div>
  );
}
