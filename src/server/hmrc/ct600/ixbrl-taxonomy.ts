/** HMRC/FRC taxonomy entry points by accounting period end date. */

export function frcAccountsTaxonomy(periodEnd: string): {
  coreNs: string;
  busNs: string;
  geoNs: string;
  entryPoint: string;
} {
  const end = Date.parse(periodEnd);
  if (Number.isNaN(end)) {
    throw new Error(`Invalid period end date: ${periodEnd}`);
  }

  // FRC 2023: AP end up to 31 March 2026 (GOV.UK taxonomies accepted by HMRC).
  if (end <= Date.parse("2026-03-31")) {
    return {
      coreNs: "http://xbrl.frc.org.uk/fr/2023-01-01/core",
      busNs: "http://xbrl.frc.org.uk/cd/2023-01-01/business",
      geoNs: "http://xbrl.frc.org.uk/cd/2023-01-01/countries",
      entryPoint:
        "https://xbrl.frc.org.uk/FRS-102/2023-01-01/FRS-102-2023-01-01.xsd",
    };
  }

  return {
    coreNs: "http://xbrl.frc.org.uk/fr/2024-01-01/core",
    busNs: "http://xbrl.frc.org.uk/cd/2024-01-01/business",
    geoNs: "http://xbrl.frc.org.uk/cd/2024-01-01/countries",
    entryPoint:
      "https://xbrl.frc.org.uk/FRS-102/2024-01-01/FRS-102-2024-01-01.xsd",
  };
}

export function ctComputationTaxonomy(periodEnd: string): {
  ns: string;
  entryPoint: string;
} {
  const end = Date.parse(periodEnd);
  if (Number.isNaN(end)) {
    throw new Error(`Invalid period end date: ${periodEnd}`);
  }

  // CT2024: AP end up to 31 March 2026.
  if (end <= Date.parse("2026-03-31")) {
    return {
      ns: "http://www.hmrc.gov.uk/schemas/ct/comp/2024-01-01",
      entryPoint:
        "http://www.hmrc.gov.uk/schemas/ct/comp/2024-01-01/ct-comp-2024.xsd",
    };
  }

  return {
    ns: "http://www.hmrc.gov.uk/schemas/ct/comp/2025-01-01",
    entryPoint:
      "http://www.hmrc.gov.uk/schemas/ct/comp/2025-01-01/ct-comp-2025.xsd",
  };
}
