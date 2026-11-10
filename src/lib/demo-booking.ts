/** Public demo booking — Capium-style services & London business-hours slots. */

export const DEMO_BOOKING_TZ = "Europe/London";

export type DemoServiceId =
  | "suite"
  | "modules"
  | "migration"
  | "training"
  | "onboarding";

export type DemoService = {
  id: DemoServiceId;
  title: string;
  blurb: string;
  durationMinutes: number;
};

export const DEMO_SERVICES: DemoService[] = [
  {
    id: "suite",
    title: "Accounting suite demonstration",
    blurb:
      "One hour. A live walkthrough of the whole desk — CT600, MTD VAT, Self Assessment, PAYE and Companies House.",
    durationMinutes: 60,
  },
  {
    id: "modules",
    title: "Module specific demonstration",
    blurb:
      "45 minutes. Choose the HydraTax modules that matter most to your practice.",
    durationMinutes: 45,
  },
  {
    id: "migration",
    title: "Ask about moving over",
    blurb:
      "45 minutes. Switching from another package — what to migrate and how we support the cutover.",
    durationMinutes: 45,
  },
  {
    id: "training",
    title: "Team training session",
    blurb:
      "45 minutes. For practices already on HydraTax who want a focused walkthrough for their team.",
    durationMinutes: 45,
  },
  {
    id: "onboarding",
    title: "Onboarding session",
    blurb:
      "45 minutes. New to HydraTax — set up the desk, first clients, and first filing rail.",
    durationMinutes: 45,
  },
];

export const CLIENT_COUNT_OPTIONS = [
  "1–10",
  "11–50",
  "51–100",
  "101–300",
  "301–500",
  "500+",
] as const;

export const HEAR_ABOUT_OPTIONS = [
  "Google search",
  "Companies House / company page",
  "Referral from another accountant",
  "Social media",
  "Blog or guide",
  "Other",
] as const;

export function demoServiceById(id: string): DemoService | undefined {
  return DEMO_SERVICES.find((s) => s.id === id);
}

/** YYYY-MM-DD in Europe/London. */
export function londonDateKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: DEMO_BOOKING_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function londonWeekday(d: Date): number {
  const wd = new Intl.DateTimeFormat("en-GB", {
    timeZone: DEMO_BOOKING_TZ,
    weekday: "short",
  }).format(d);
  const map: Record<string, number> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 0,
  };
  return map[wd] ?? 0;
}

/** Next `days` calendar days that are Mon–Fri in London. */
export function listBookableDates(from = new Date(), days = 28): string[] {
  const out: string[] = [];
  const cursor = new Date(from.getTime());
  for (let i = 0; i < 60 && out.length < days; i++) {
    const key = londonDateKey(cursor);
    const wd = londonWeekday(cursor);
    if (wd >= 1 && wd <= 5) {
      // Skip “today” if after last slot start in London — still list today; UI filters slots.
      out.push(key);
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

/**
 * Slot starts HH:MM (London wall clock), every 30 minutes from 10:00,
 * ending so the demo finishes by 16:00.
 */
export function listTimeSlots(durationMinutes: number): string[] {
  const dayEndMinutes = 16 * 60; // 16:00
  const starts: string[] = [];
  for (let m = 10 * 60; m + durationMinutes <= dayEndMinutes; m += 30) {
    const hh = String(Math.floor(m / 60)).padStart(2, "0");
    const mm = String(m % 60).padStart(2, "0");
    starts.push(`${hh}:${mm}`);
  }
  return starts;
}

export function formatDemoDateLabel(isoDate: string) {
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return isoDate;
  const utc = new Date(Date.UTC(y, m - 1, d, 12));
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(utc);
}
