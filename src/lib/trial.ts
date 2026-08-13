/** Practice / Custom desk free trial — marketing + billing policy. */

export const PRACTICE_TRIAL_DAYS = 7;

export const PRACTICE_TRIAL = {
  days: PRACTICE_TRIAL_DAYS,
  headline: "7 days free",
  shortBadge: "7-day free trial",
  tagline: "Practice & Custom plans — try free for 7 days",
  detail:
    "Practice and Custom desks include a 7-day free trial. No Hydra fees while you trial; card saved at checkout, first charge on day 8. Cancel anytime before then.",
  cta: "Start 7-day free trial",
  /** Trial is offered on Practice / Custom pricing — not forced at signup. */
  ctaHref: "/pricing#practice",
  pricingNote:
    "Practice & Custom include a 7-day free trial. Card required at checkout — billed from day 8.",
  bannerText:
    "Practice & Custom: 7 days free — card saved at checkout, charged on day 8.",
} as const;

export function practiceTrialEndsAt(from = new Date()): Date {
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() + PRACTICE_TRIAL_DAYS);
  return d;
}

export function isWithinTrialWindow(trialEndsAt: string | Date | null | undefined) {
  if (!trialEndsAt) return false;
  const end = typeof trialEndsAt === "string" ? new Date(trialEndsAt) : trialEndsAt;
  if (Number.isNaN(end.getTime())) return false;
  return end.getTime() > Date.now();
}

/** Only Practice and Custom monthly plans get the free trial (not Solo). */
export function planKeyHasPracticeTrial(planKey: string) {
  return (
    planKey.startsWith("practice:Practice") ||
    planKey.startsWith("practice:Custom")
  );
}
