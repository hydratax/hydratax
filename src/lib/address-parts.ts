/** Structured UK-style address stored as JSON in clients.address (legacy free text still supported). */

export type AddressParts = {
  street: string;
  city: string;
  country: string;
  postcode: string;
};

export function emptyAddressParts(): AddressParts {
  return { street: "", city: "", country: "United Kingdom", postcode: "" };
}

export function formatAddressParts(parts: AddressParts): string {
  const street = parts.street.trim();
  const city = parts.city.trim();
  const country = parts.country.trim();
  const postcode = parts.postcode.trim().toUpperCase();
  if (!street && !city && !country && !postcode) return "";
  return JSON.stringify({
    street,
    city,
    country: country || "United Kingdom",
    postcode,
  });
}

export function parseAddressParts(
  raw: string | null | undefined,
): AddressParts {
  const base = emptyAddressParts();
  const text = (raw ?? "").trim();
  if (!text) return base;
  if (text.startsWith("{")) {
    try {
      const j = JSON.parse(text) as Partial<AddressParts>;
      return {
        street: String(j.street ?? "").trim(),
        city: String(j.city ?? "").trim(),
        country: String(j.country ?? "United Kingdom").trim() || "United Kingdom",
        postcode: String(j.postcode ?? "").trim(),
      };
    } catch {
      /* fall through */
    }
  }
  const lines = text
    .split(/\r?\n|,/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 1) {
    return { ...base, street: lines[0]! };
  }
  if (lines.length === 2) {
    return { ...base, street: lines[0]!, city: lines[1]! };
  }
  if (lines.length === 3) {
    return {
      ...base,
      street: lines[0]!,
      city: lines[1]!,
      postcode: lines[2]!,
    };
  }
  return {
    street: lines.slice(0, -3).join(", ") || lines[0] || "",
    city: lines[lines.length - 3] || "",
    country: lines[lines.length - 2] || "United Kingdom",
    postcode: lines[lines.length - 1] || "",
  };
}

export function addressPartsDisplay(raw: string | null | undefined): string {
  const p = parseAddressParts(raw);
  if (!p.street && !p.city && !p.postcode && !raw?.trim()) return "";
  if (raw && !raw.trim().startsWith("{")) return raw.trim();
  return [p.street, p.city, p.country, p.postcode].filter(Boolean).join(", ");
}

/** Street + postcode required whenever we collect an address. */
export function addressIdentityComplete(
  raw: string | null | undefined,
): boolean {
  const p = parseAddressParts(raw);
  return Boolean(p.street.trim() && p.postcode.trim());
}

export function addressLinesFromParts(parts: AddressParts): string[] {
  return [parts.street, parts.city, parts.postcode, parts.country]
    .map((l) => l.trim())
    .filter(Boolean);
}

/** Compact overview: street / town / postcode+country (up to 3 lines). */
export function addressOverviewLines(
  raw: string | null | undefined,
): string[] {
  const p = parseAddressParts(raw);
  if (!p.street && !p.city && !p.postcode) return [];
  const post = p.postcode.trim().toUpperCase();
  const postCountry = [post, p.country.trim()].filter(Boolean).join(" ");
  return [p.street, p.city, postCountry].map((l) => l.trim()).filter(Boolean);
}
