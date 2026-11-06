import { LetterheadForm } from "@/components/forms/letterhead-form";
import { getPracticeLetterhead } from "@/server/actions/letterhead";

export const metadata = { title: "Practice branding — HydraTax" };

export default async function LetterheadSettingsPage() {
  const letterhead = await getPracticeLetterhead();

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-sea">
          Practice
        </p>
        <h1 className="display mt-1 text-4xl text-ink">Practice branding</h1>
        <p className="mt-2 max-w-2xl text-ink-soft">
          Logo, address, qualification, contact and bank details for letters,
          forms and invoices to clients. This is your firm — not a client card.
        </p>
      </div>
      <LetterheadForm initial={letterhead} />
    </div>
  );
}
