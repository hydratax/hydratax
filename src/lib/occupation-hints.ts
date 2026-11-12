/**
 * Occupation / trade-biased bank allocation for Self Assessment.
 * Shared client + server — taxi drivers, builders, etc. land on likely expense heads.
 */

import type { BankCategory } from "@/lib/bank-categories";

export type OccupationHint = {
  pattern: RegExp;
  category: BankCategory;
  confidence: "high" | "medium";
  label: string;
};

function occupationFamily(occupation: string): string {
  const o = occupation.toLowerCase().trim();
  if (!o) return "general";
  if (
    /\btaxi\b|\bprivate\s*hire\b|\bminicab\b|\bhackney\b|\bphv\b|\buber\b|\bbolt\b|\bcab\s*driver\b/.test(
      o,
    )
  ) {
    return "taxi";
  }
  if (
    /\bbuilder\b|\bconstruct\b|\bplumb\b|\belectric\b|\bcarpenter\b|\bjoiner\b|\broof|\btrades?man\b|\bcontractor\b/.test(
      o,
    )
  ) {
    return "trades";
  }
  if (/\bit\b|\bsoftware\b|\bdevelop|\bconsultant\b|\bdesign/.test(o)) {
    return "professional";
  }
  if (
    /\bretail\b|\bshop\b|\bcafé\b|\bcafe\b|\brestaurant\b|\bhospitality\b/.test(o)
  ) {
    return "retail";
  }
  return "general";
}

const BY_FAMILY: Record<string, OccupationHint[]> = {
  taxi: [
    {
      pattern:
        /\bshell\b|\bbp\b|\besso\b|\btexaco\b|\bfuel\b|\bpetrol\b|\bdiesel\b|\btesco\s*(petrol|fuel)|asda\s*(petrol|fuel)|morrisons?\s*(petrol|fuel)|circle\s*k|\bmfg\b/i,
      category: "fuel",
      confidence: "high",
      label: "Fuel (taxi)",
    },
    {
      pattern:
        /\buber\b|\bbolt\b|\bfree\s*now\b|\bopla\b|\baddison\s*lee\b|\bphv\b|\blicen[cs]e\b|\bdvra\b|\bmot\b|\btyre\b|\bgarage\b|\bservice\b|\brepair\b|\bhalfords\b|\bkwik\s*fit\b/i,
      category: "travel",
      confidence: "high",
      label: "Vehicle / platform (taxi)",
    },
    {
      pattern:
        /\binsurance\b|\baxa\b|\baviva\b|\bzurich\b|\bdirect\s*line\b|\bhiscox\b|\badvertise|gumtree|autotrader/i,
      category: "insurance",
      confidence: "medium",
      label: "Insurance / ads (taxi)",
    },
    {
      pattern:
        /\bloan\b|\bfinance\b|\bhp\b|\bhire\s*purchase\b|\bleasing\b|\bcar\s*finance\b/i,
      category: "finance",
      confidence: "high",
      label: "Vehicle finance (taxi)",
    },
    {
      pattern: /\bee\b|\bvodafone\b|\bthree\b|\bo2\b|\bmobile\b|\bphone\b|\bsim\b/i,
      category: "admin_office",
      confidence: "medium",
      label: "Phone (taxi)",
    },
  ],
  trades: [
    {
      pattern:
        /\bscrewfix\b|\btoolstation\b|\btimber\b|\bb&q\b|\bwickes\b|\btravis\s*perkins\b|\bbuilders?\s*merchant\b|\bmaterials?\b|\bconcrete\b|\bpaint\b/i,
      category: "cost_of_sales",
      confidence: "high",
      label: "Materials (trades)",
    },
    {
      pattern: /\bfuel\b|\bpetrol\b|\bdiesel\b|\bshell\b|\bbp\b/i,
      category: "fuel",
      confidence: "high",
      label: "Fuel (trades)",
    },
    {
      pattern: /\bsubcontract|\blabour\b|\bfreelance\b/i,
      category: "subcontractors",
      confidence: "high",
      label: "Labour (trades)",
    },
  ],
  professional: [
    {
      pattern:
        /\baws\b|\bazure\b|\bgoogle\s*cloud\b|\bgithub\b|\bsoftware\b|\bsubscription\b|\badobe\b|\bmicrosoft\b|\bslack\b|\bzoom\b|\bnotion\b/i,
      category: "admin_office",
      confidence: "high",
      label: "Software (professional)",
    },
    {
      pattern:
        /\btrainline\b|\btfl\b|\buber\b|\bhotel\b|\bflight\b|\beasyjet\b|\bryanair\b/i,
      category: "travel",
      confidence: "medium",
      label: "Travel (professional)",
    },
  ],
  retail: [
    {
      pattern:
        /\bwholesale\b|\bsupplier\b|\bstock\b|\binventory\b|\bbooker\b|\bbestway\b/i,
      category: "cost_of_sales",
      confidence: "high",
      label: "Stock (retail)",
    },
    {
      pattern:
        /\brent\b|\brates\b|\belectric\b|\bgas\b|\bwater\b|\bbusiness\s*rates\b/i,
      category: "rent_rates",
      confidence: "high",
      label: "Premises (retail)",
    },
  ],
  general: [],
};

/**
 * Match a bank narrative using occupation-specific rules.
 * Returns null when occupation adds no extra signal.
 */
export function matchOccupationHint(
  description: string,
  occupation: string | null | undefined,
): Pick<OccupationHint, "category" | "confidence" | "label"> | null {
  const family = occupationFamily(occupation ?? "");
  const hints = BY_FAMILY[family] ?? [];
  for (const hint of hints) {
    if (hint.pattern.test(description)) {
      return {
        category: hint.category,
        confidence: hint.confidence,
        label: hint.label,
      };
    }
  }
  return null;
}

export function occupationFamilyLabel(
  occupation: string | null | undefined,
): string | null {
  const family = occupationFamily(occupation ?? "");
  if (family === "general") return null;
  if (family === "taxi") return "Taxi / private hire";
  if (family === "trades") return "Construction / trades";
  if (family === "professional") return "Professional / IT";
  if (family === "retail") return "Retail / hospitality";
  return family;
}
