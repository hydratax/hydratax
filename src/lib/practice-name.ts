/** Strip Companies House number from a practice display label, e.g. "ACME LTD (14633422)" → "ACME LTD" */
export function displayPracticeName(name: string | null | undefined): string {
  if (!name?.trim()) return "Your practice";
  return name
    .replace(/\s*\(\s*[A-Z]{0,2}\d{6,8}\s*\)\s*$/i, "")
    .replace(/\s+[A-Z]{0,2}\d{6,8}\s*$/i, "")
    .trim() || name.trim();
}
