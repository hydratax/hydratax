import type { BankCategory } from "@/lib/bank-categories";

/**
 * Merchant / counterparty hints used for auto-allocation.
 * Seeded with common UK merchants; extend over time (and later via web enrichment).
 */
export type MerchantHint = {
  pattern: RegExp;
  category: BankCategory;
  confidence: "high" | "medium";
  label: string;
};

export const MERCHANT_HINTS: MerchantHint[] = [
  // Fuel
  { pattern: /\bshell\b/i, category: "fuel", confidence: "high", label: "Shell" },
  { pattern: /\bbp\b(?!\s*pay)/i, category: "fuel", confidence: "high", label: "BP" },
  { pattern: /\besso\b/i, category: "fuel", confidence: "high", label: "Esso" },
  { pattern: /\btexaco\b/i, category: "fuel", confidence: "high", label: "Texaco" },
  { pattern: /\btesco\s*(petrol|fuel|express)?\b/i, category: "fuel", confidence: "medium", label: "Tesco Fuel" },
  { pattern: /\bsainsbury'?s?\s*(petrol|fuel)?\b/i, category: "fuel", confidence: "medium", label: "Sainsbury Fuel" },
  { pattern: /\basda\s*(petrol|fuel)?\b/i, category: "fuel", confidence: "medium", label: "Asda Fuel" },
  { pattern: /\bmorrisons?\s*(petrol|fuel)?\b/i, category: "fuel", confidence: "medium", label: "Morrisons Fuel" },
  { pattern: /\bfuel\b/i, category: "fuel", confidence: "high", label: "Fuel" },
  { pattern: /\bpetrol\b/i, category: "fuel", confidence: "high", label: "Petrol" },
  { pattern: /\bdiesel\b/i, category: "fuel", confidence: "high", label: "Diesel" },
  { pattern: /\bcirclek\b/i, category: "fuel", confidence: "high", label: "Circle K" },
  { pattern: /\bmfgs?\b/i, category: "fuel", confidence: "medium", label: "MFG" },

  // Travel
  { pattern: /\buber\b/i, category: "travel", confidence: "high", label: "Uber" },
  { pattern: /\bbolt\.eu\b|\bbolt\b/i, category: "travel", confidence: "high", label: "Bolt" },
  { pattern: /\btrainline\b/i, category: "travel", confidence: "high", label: "Trainline" },
  { pattern: /\btfl\b|transport for london/i, category: "travel", confidence: "high", label: "TfL" },
  { pattern: /\bnational\s*express\b/i, category: "travel", confidence: "high", label: "National Express" },
  { pattern: /\beasyjet\b|\bryanair\b|\bba\.com\b|\bbritish airways\b/i, category: "travel", confidence: "high", label: "Airline" },
  { pattern: /\bparking\b|\bringo\b|\bncp\b/i, category: "travel", confidence: "medium", label: "Parking" },
  { pattern: /\bhotel\b|\bpremier inn\b|\btravelodge\b|\booking\.com\b/i, category: "travel", confidence: "medium", label: "Hotel" },

  // Advertising
  { pattern: /\bmeta\s*ads\b|\bfacebook\s*ads\b|\bfb\.me\b/i, category: "advertising", confidence: "high", label: "Meta Ads" },
  { pattern: /\bgoogle\s*ads\b|\badwords\b/i, category: "advertising", confidence: "high", label: "Google Ads" },
  { pattern: /\blinkedin\s*ads\b/i, category: "advertising", confidence: "high", label: "LinkedIn Ads" },
  { pattern: /\bmailchimp\b|\bklaviyo\b|\bhq\.squarespace\b/i, category: "advertising", confidence: "medium", label: "Marketing" },

  // Insurance
  { pattern: /\binsurance\b|\baviva\b|\baxa\b|\bdirect line\b|\bhiscox\b|\bzurich\b/i, category: "insurance", confidence: "high", label: "Insurance" },

  // Rent / rates / utilities → rent_rates
  { pattern: /\brent\b|\blandlord\b|\bproperty management\b/i, category: "rent_rates", confidence: "high", label: "Rent" },
  { pattern: /\bbusiness rates\b|\bcouncil\b/i, category: "rent_rates", confidence: "high", label: "Rates" },
  { pattern: /\belectric\b|\bgas bill\b|\bbritish gas\b|\be\.?on\b|\boctopus energy\b|\bthames water\b|\butilities\b/i, category: "rent_rates", confidence: "medium", label: "Utilities" },
  { pattern: /\bbt\b|\bvodafone\b|\bee limited\b|\bthree\.co\.uk\b|\bsky business\b/i, category: "admin_office", confidence: "medium", label: "Telecoms" },

  // Professional
  { pattern: /\baccountant\b|\bxero\b|\bsage\b|\bquickbooks\b/i, category: "accountancy", confidence: "high", label: "Accountancy" },
  { pattern: /\bsolicitor\b|\blegal\b|\blaw\b|\bcompanies house\b/i, category: "legal_professional", confidence: "high", label: "Legal" },
  { pattern: /\bconsultan(t|cy)\b/i, category: "consultancy", confidence: "medium", label: "Consultancy" },

  // Bank charges
  { pattern: /\bbank charge\b|\bmonthly fee\b|\boverdraft\b|\bcard fee\b|\bstripe fee\b|\bpaypal fee\b/i, category: "bank_charges", confidence: "high", label: "Bank charges" },

  // Office / software
  { pattern: /\bmicrosoft\b|\badobe\b|\bgoogle workspace\b|\baws\b|\bgithub\b|\bslack\b|\bzoom\b|\bdropbox\b|\bsoftware\b|\bsubscription\b/i, category: "admin_office", confidence: "medium", label: "Software" },
  { pattern: /\bstaples\b|\bryman\b|\boffice depot\b|\bamznmk[a-z]*\b|\bamazon\b/i, category: "admin_office", confidence: "medium", label: "Office / Amazon" },

  // Tax
  { pattern: /\bhmrc\b|\bvat payment\b|\bcorporation tax\b|\bpaye\b|\bnic\b/i, category: "tax", confidence: "high", label: "HMRC" },

  // Cost of sales
  { pattern: /\bsupplier\b|\bwholesale\b|\binventory\b|\bstock\b/i, category: "cost_of_sales", confidence: "medium", label: "Supplier" },

  // Transfers / drawings
  { pattern: /\btransfer\b|\bto savings\b|\bfrom savings\b|\bown account\b/i, category: "transfer", confidence: "high", label: "Transfer" },
  { pattern: /\bdrawing\b|\bowner withdraw\b|\bpersonal\b/i, category: "drawings", confidence: "medium", label: "Drawings" },
];

export function matchMerchant(
  description: string,
): Pick<MerchantHint, "category" | "confidence" | "label"> | null {
  for (const hint of MERCHANT_HINTS) {
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
