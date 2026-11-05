import { LetterheadForm } from "@/components/forms/letterhead-form";
import { getPracticeLetterhead } from "@/server/actions/letterhead";

export const metadata = { title: "Letterhead — HydraTax" };

export default async function LetterheadSettingsPage() {
  const letterhead = await getPracticeLetterhead();

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-sea">
          Practice
        </p>
        <h1 className="display mt-1 text-4xl text-ink">Letterhead</h1>
        <p className="mt-2 max-w-2xl text-ink-soft">
          Tune the header and footer used on formal client letters — confirmation
          of director, income, mortgage references, and more.
        </p>
      </div>
      <LetterheadForm initial={letterhead} />
    </div>
  );
}
