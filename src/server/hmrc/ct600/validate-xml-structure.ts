/** Pre-flight structural checks before CT600 live/ETS submit. */
export function validateCt600XmlStructure(xml: string): {
  ok: boolean;
  missing: string[];
  invalid: string[];
} {
  const required = [
    "PeriodEnd>",
    "Sender>",
    'IRmark Type="generic">',
    "ThisPeriodAccounts>yes</",
    "ThisPeriodComputations>yes</",
    "CompanyTaxCalculation>",
    "CorporationTaxChargeable>",
    "FinancialYearOne>",
    "Declaration>",
    "AcceptDeclaration>yes</",
    "AttachedFiles>",
    "XBRLsubmission>",
    "EncodedInlineXBRLDocument",
    "Computation>",
    "Accounts>",
    'entryPoint="yes"',
  ];

  const forbidden = [
    "DocumentType>",
    "ContentEncoding>",
    "ReturnInfoBody>",
    "TradingProfits>",
    "TangibleAssets>",
    "<Principal>",
  ];

  const missing = required.filter((frag) => !xml.includes(frag));
  const invalid = forbidden.filter((frag) => xml.includes(frag));

  return {
    ok: missing.length === 0 && invalid.length === 0,
    missing,
    invalid,
  };
}

export function assertCt600XmlStructure(xml: string): void {
  const result = validateCt600XmlStructure(xml);
  if (!result.ok) {
    const parts: string[] = [];
    if (result.missing.length) {
      parts.push(`missing: ${result.missing.join(", ")}`);
    }
    if (result.invalid.length) {
      parts.push(`invalid: ${result.invalid.join(", ")}`);
    }
    throw new Error(`CT600 XML package failed pre-submit checks (${parts.join("; ")})`);
  }
}
