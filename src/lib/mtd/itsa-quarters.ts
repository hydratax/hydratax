/**
 * Making Tax Digital for Income Tax (ITSA) quarterly update periods.
 *
 * Sources:
 * - https://www.gov.uk/guidance/use-making-tax-digital-for-income-tax
 * - SALF1150 standard update periods
 *
 * Mandation (qualifying income):
 * - > £50,000 → from 6 April 2026
 * - > £30,000 → from 6 April 2027
 * - > £20,000 → from 6 April 2028
 *
 * Quarterly updates are cumulative summaries — not the annual SA return.
 */

export type ItsaUpdatePeriodKind = "standard" | "calendar";

export type ItsaQuarter = {
  /** 1–4 within the tax year */
  index: 1 | 2 | 3 | 4;
  /** Inclusive period start (ISO) */
  start: string;
  /** Inclusive period end (ISO) */
  end: string;
  /** Online quarterly update deadline (ISO) */
  due: string;
  label: string;
};

/** Tax year start year, e.g. 2026 for 2026–27. */
export function itsaQuartersForTaxYear(
  startYear: number,
  kind: ItsaUpdatePeriodKind = "standard",
): ItsaQuarter[] {
  if (kind === "calendar") {
    return [
      {
        index: 1,
        start: `${startYear}-04-01`,
        end: `${startYear}-06-30`,
        due: `${startYear}-08-07`,
        label: `Q1 · 1 Apr – 30 Jun ${startYear}`,
      },
      {
        index: 2,
        start: `${startYear}-04-01`,
        end: `${startYear}-09-30`,
        due: `${startYear}-11-07`,
        label: `Q2 · 1 Apr – 30 Sep ${startYear}`,
      },
      {
        index: 3,
        start: `${startYear}-04-01`,
        end: `${startYear}-12-31`,
        due: `${startYear + 1}-02-07`,
        label: `Q3 · 1 Apr – 31 Dec ${startYear}`,
      },
      {
        index: 4,
        start: `${startYear}-04-01`,
        end: `${startYear + 1}-03-31`,
        due: `${startYear + 1}-05-07`,
        label: `Q4 · 1 Apr ${startYear} – 31 Mar ${startYear + 1}`,
      },
    ];
  }

  // Standard UK tax-year periods (6 Apr → 5 Jul / 5 Oct / 5 Jan / 5 Apr)
  return [
    {
      index: 1,
      start: `${startYear}-04-06`,
      end: `${startYear}-07-05`,
      due: `${startYear}-08-07`,
      label: `Q1 · 6 Apr – 5 Jul ${startYear}`,
    },
    {
      index: 2,
      start: `${startYear}-04-06`,
      end: `${startYear}-10-05`,
      due: `${startYear}-11-07`,
      label: `Q2 · 6 Apr – 5 Oct ${startYear}`,
    },
    {
      index: 3,
      start: `${startYear}-04-06`,
      end: `${startYear + 1}-01-05`,
      due: `${startYear + 1}-02-07`,
      label: `Q3 · 6 Apr ${startYear} – 5 Jan ${startYear + 1}`,
    },
    {
      index: 4,
      start: `${startYear}-04-06`,
      end: `${startYear + 1}-04-05`,
      due: `${startYear + 1}-05-07`,
      label: `Q4 · 6 Apr ${startYear} – 5 Apr ${startYear + 1}`,
    },
  ];
}

export type ItsaMandationBand = {
  fromTaxYearStart: number;
  qualifyingIncomeOver: number;
  label: string;
};

export const ITSA_MANDATION_BANDS: ItsaMandationBand[] = [
  {
    fromTaxYearStart: 2026,
    qualifyingIncomeOver: 50_000,
    label: "Over £50,000 → MTD for IT from 6 April 2026",
  },
  {
    fromTaxYearStart: 2027,
    qualifyingIncomeOver: 30_000,
    label: "Over £30,000 → MTD for IT from 6 April 2027",
  },
  {
    fromTaxYearStart: 2028,
    qualifyingIncomeOver: 20_000,
    label: "Over £20,000 → MTD for IT from 6 April 2028",
  },
];
