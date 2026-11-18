/**
 * Books page — SA / VAT / Corporation Tax document sections.
 * Categories: `{desk}` or `{desk}:{kind}` where kind is receipt | invoice |
 * bank_statement | other.
 */

export const BOOKS_DESKS = [
  "self_assessment",
  "vat",
  "corporation_tax",
] as const;

export type BooksDesk = (typeof BOOKS_DESKS)[number];

export const BOOKS_DESK_LABEL: Record<BooksDesk, string> = {
  self_assessment: "Self Assessment",
  vat: "VAT",
  corporation_tax: "Corporation Tax",
};

export const BOOKS_DOC_KINDS = [
  "bank_statement",
  "receipt",
  "invoice",
  "other",
] as const;

export type BooksDocKind = (typeof BOOKS_DOC_KINDS)[number];

export const BOOKS_DOC_KIND_LABEL: Record<BooksDocKind, string> = {
  bank_statement: "Bank statement",
  receipt: "Receipt",
  invoice: "Invoice",
  other: "Other",
};

export function booksCategory(desk: BooksDesk, kind: BooksDocKind): string {
  return `${desk}:${kind}`;
}

export function parseBooksCategory(category: string): {
  desk: BooksDesk;
  kind: BooksDocKind | null;
} | null {
  const bare = BOOKS_DESKS.find((d) => d === category);
  if (bare) return { desk: bare, kind: null };

  const m = category.match(
    /^(self_assessment|vat|corporation_tax):(receipt|invoice|bank_statement|other)$/,
  );
  if (!m) return null;
  return {
    desk: m[1] as BooksDesk,
    kind: m[2] as BooksDocKind,
  };
}

/** Documents that belong on a Books desk card (including legacy bare categories). */
export function docsForBooksDesk(
  docs: Array<{ category: string }>,
  desk: BooksDesk,
): typeof docs {
  return docs.filter((d) => {
    const parsed = parseBooksCategory(d.category);
    if (parsed?.desk === desk) return true;
    // Legacy company bank uploads
    if (
      desk === "corporation_tax" &&
      (d.category === "accounts" || d.category === "general")
    ) {
      return true;
    }
    // Personal SA taxpayer books
    if (
      desk === "self_assessment" &&
      /^sa:[^:]+:(invoice|receipt|p60|bank_statement|books|other)$/.test(
        d.category,
      )
    ) {
      return true;
    }
    return false;
  });
}
