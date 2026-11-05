/** Public company URL: /company/hydra-retail-14806369 */
export function companyProfileSlug(name: string, companyNumber: string) {
  const number = companyNumber.trim().toLowerCase();
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${base || "company"}-${number}`;
}

export function companyProfilePath(name: string, companyNumber: string) {
  return `/company/${companyProfileSlug(name, companyNumber)}`;
}

/** Company number is the last 6–8 character token that contains a digit. */
export function companyNumberFromSlug(slug: string): string | null {
  const decoded = decodeURIComponent(slug).trim();
  const suffixed = decoded.match(/-([a-z0-9]{6,8})$/i);
  const token = suffixed?.[1] ?? decoded;
  if (!/^[a-z0-9]{6,8}$/i.test(token) || !/\d/.test(token)) return null;
  return token.toUpperCase();
}
