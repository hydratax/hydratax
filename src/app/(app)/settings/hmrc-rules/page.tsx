import { HmrcRulebookPanel } from "@/components/hmrc-rulebook-panel";

export const metadata = {
  title: "HMRC tax rules — HydraTax",
};

export default function HmrcRulesPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="display text-3xl text-ink">HMRC tax rules</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-soft">
          Official rates, thresholds and practice FAQs for Corporation Tax, VAT,
          Self Assessment, PAYE and National Insurance — the mind map HydraTax
          uses so tax boxes fill themselves to HMRC rules.
        </p>
      </div>
      <HmrcRulebookPanel />
    </div>
  );
}
