/**
 * Parse UK bank statement plain text into dated / description / amount lines.
 *
 * Inspired by open-source UK parsers (SporadicLemon/statement-parser profiles,
 * boscorat/bank_statement_parser pdfplumber pipelines) but implemented in-process
 * for HydraTax’s Next.js runtime — no Python sidecar.
 */

import {
  categoriseDescription,
  normaliseDate,
  parseMoneyToPence,
  type CategorisedLine,
} from "@/server/bank/categorise";

export type ParsedStatementMeta = {
  bankHint: string | null;
  rawLineCount: number;
};

export type ParseUkStatementResult = {
  lines: CategorisedLine[];
  meta: ParsedStatementMeta;
};

const SKIP_LINE =
  /^(opening balance|closing balance|balance (brought|carried) forward|total|continued|page \d|statement (period|date)|account (number|name)|sort code|iban|bic|available balance|money in|money out|payments? (in|out)|transaction(s)?|date\s+description|your (transactions|statement))/i;

const DATE_DMY = /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/;
const DATE_DMY_SPACE = /(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{2,4})/i;
const MONEY = /£?\s*-?\(?\d{1,3}(?:,\d{3})*(?:\.\d{2})\)?|£?\s*-?\d+(?:\.\d{2})/;

function detectBank(text: string): string | null {
  const head = text.slice(0, 2500);
  if (/monzo/i.test(head)) return "Monzo";
  if (/starling bank|www\.starlingbank\.com/i.test(head)) return "Starling";
  if (/natwest|national westminster/i.test(head)) return "NatWest";
  if (/\bhsbc\b/i.test(head)) return "HSBC";
  if (/barclays/i.test(head)) return "Barclays";
  if (/lloyds bank|lloyds banking/i.test(head)) return "Lloyds";
  if (/santander/i.test(head)) return "Santander";
  if (/nationwide/i.test(head)) return "Nationwide";
  if (/metro bank/i.test(head)) return "Metro Bank";
  if (/revolut/i.test(head)) return "Revolut";
  if (/american express|\bamex\b/i.test(head)) return "American Express";
  return null;
}

function toIsoDate(raw: string): string | null {
  const iso = normaliseDate(raw.trim());
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  return null;
}

function moneyAtEnd(line: string): { description: string; amountPence: number } | null {
  // Prefer the last money token (amount / balance often trail the narrative).
  const matches = [...line.matchAll(new RegExp(MONEY.source, "g"))];
  if (!matches.length) return null;
  const last = matches[matches.length - 1];
  const amountRaw = last[0];
  const amountPence = parseMoneyToPence(amountRaw);
  if (!amountPence) return null;

  let description = line.slice(0, last.index).trim();
  // If there are two trailing amounts (amount + balance), drop the penultimate from description.
  if (matches.length >= 2) {
    const pen = matches[matches.length - 2];
    const penAmt = parseMoneyToPence(pen[0]);
    if (penAmt !== 0 && pen.index != null && pen.index < (last.index ?? 0)) {
      description = line.slice(0, pen.index).trim();
      return { description, amountPence: penAmt };
    }
  }
  return { description, amountPence };
}

function parseDatedLine(line: string): {
  dated: string;
  description: string;
  amountPence: number;
} | null {
  const trimmed = line.replace(/\s+/g, " ").trim();
  if (!trimmed || SKIP_LINE.test(trimmed)) return null;

  let rest = trimmed;
  let dated: string | null = null;

  const dmy = trimmed.match(new RegExp(`^${DATE_DMY.source}`));
  if (dmy) {
    dated = toIsoDate(dmy[0]);
    rest = trimmed.slice(dmy[0].length).trim();
  } else {
    const spaced = trimmed.match(new RegExp(`^${DATE_DMY_SPACE.source}`));
    if (spaced) {
      dated = toIsoDate(`${spaced[1]} ${spaced[2]} ${spaced[3]}`);
      rest = trimmed.slice(spaced[0].length).trim();
    }
  }
  if (!dated) return null;

  // Split money-out / money-in columns when both present near the end.
  const twoCol = rest.match(
    /^(.*?)(-?£?\s*\d[\d,]*(?:\.\d{2})?)\s+(-?£?\s*\d[\d,]*(?:\.\d{2})?)\s*$/,
  );
  if (twoCol) {
    const left = parseMoneyToPence(twoCol[2]);
    const right = parseMoneyToPence(twoCol[3]);
    // Common UK layout: Money out | Money in (or Amount | Balance).
    // If one is zero-ish empty, use the other; if both set, prefer out as negative when narrative implies debit.
    let amountPence = 0;
    if (left !== 0 && right === 0) amountPence = -Math.abs(left);
    else if (right !== 0 && left === 0) amountPence = Math.abs(right);
    else if (left !== 0 && right !== 0) {
      // Treat as amount + running balance: first is the movement.
      amountPence = left;
    }
    const description = twoCol[1].trim();
    if (description && amountPence) {
      return { dated, description, amountPence };
    }
  }

  const money = moneyAtEnd(rest);
  if (!money || !money.description) return null;
  return {
    dated,
    description: money.description,
    amountPence: money.amountPence,
  };
}

function mergeContinuationLines(lines: string[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const startsWithDate =
      DATE_DMY.test(trimmed.slice(0, 12)) ||
      DATE_DMY_SPACE.test(trimmed.slice(0, 20));
    if (!startsWithDate && out.length > 0 && !SKIP_LINE.test(trimmed)) {
      // Continuation narrative — append to previous.
      out[out.length - 1] = `${out[out.length - 1]} ${trimmed}`;
      continue;
    }
    out.push(trimmed);
  }
  return out;
}

function signFromContext(
  description: string,
  amountPence: number,
  _bankHint: string | null,
): number {
  if (amountPence === 0) return 0;
  // Already signed in the statement text.
  if (amountPence < 0) return amountPence;

  const d = description.toLowerCase();
  if (
    /\b(deposit|credit|salary|wages|payroll|refund|interest received|faster payments?\s*in|fp in|money in|receipt|incoming)\b/.test(
      d,
    )
  ) {
    return Math.abs(amountPence);
  }
  if (
    /\b(payment|card|dd|direct debit|standing order|withdrawal|fee|charge|purchase|pos|contactless|petrol|fuel|diesel)\b/.test(
      d,
    )
  ) {
    return -Math.abs(amountPence);
  }
  // Most unsigned PDF rows are outflows; income without keywords stays positive only if
  // the narrative clearly looks like a named inbound transfer — otherwise outflow.
  if (/\b(ltd|limited|invoice|client)\b/i.test(d) && !/\b(payment to|paid to)\b/i.test(d)) {
    return Math.abs(amountPence);
  }
  return -Math.abs(amountPence);
}

export function parseUkStatementText(text: string): ParseUkStatementResult {
  const bankHint = detectBank(text);
  const rawLines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const merged = mergeContinuationLines(rawLines);

  const seen = new Set<string>();
  const lines: CategorisedLine[] = [];

  for (const line of merged) {
    const parsed = parseDatedLine(line);
    if (!parsed) continue;
    const amountPence = signFromContext(
      parsed.description,
      parsed.amountPence,
      bankHint,
    );
    if (!amountPence) continue;
    const description = parsed.description
      .replace(/\s{2,}/g, " ")
      .replace(/^[\-–—|:]+/, "")
      .trim();
    if (description.length < 2) continue;

    const key = `${parsed.dated}|${description}|${amountPence}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const { category, confidence } = categoriseDescription(
      description,
      amountPence,
    );
    lines.push({
      dated: parsed.dated,
      description,
      amountPence,
      category,
      confidence,
    });
  }

  return {
    lines,
    meta: { bankHint, rawLineCount: rawLines.length },
  };
}
