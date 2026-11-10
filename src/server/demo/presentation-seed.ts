/**
 * Dummy clients for live demos — fictional names/numbers only.
 * Marked with deskProfile.presentationDemo so re-seeding is idempotent.
 */

export const PRESENTATION_DEMO_TAG = "presentation-demo-v1";

export type PresentationSeedClient = {
  name: string;
  type: "sole_trader" | "limited_company" | "partnership";
  companyNumber?: string;
  utr?: string;
  vrn?: string;
  nino?: string;
  payeRef?: string;
  accountsOfficeRef?: string;
  contactEmail?: string;
  contactPhone?: string;
  isEmployer?: boolean;
  isVatRegistered?: boolean;
  /** Storyline for the person giving the demo */
  pitch: string;
};

export const PRESENTATION_SEED_CLIENTS: PresentationSeedClient[] = [
  {
    name: "Meridian Retail Limited",
    type: "limited_company",
    companyNumber: "14887201",
    utr: "1100012345",
    vrn: "GB123456789",
    payeRef: "123/A246",
    accountsOfficeRef: "123PA00012345",
    contactEmail: "accounts@meridian-retail.example",
    contactPhone: "020 7946 0101",
    isEmployer: true,
    isVatRegistered: true,
    pitch: "Full desk: VAT, PAYE, CT600 and Companies House.",
  },
  {
    name: "Oak & Thorn Consulting Ltd",
    type: "limited_company",
    companyNumber: "13554012",
    utr: "1100098765",
    vrn: "GB987654321",
    contactEmail: "finance@oakthorn.example",
    contactPhone: "0161 496 0202",
    isEmployer: false,
    isVatRegistered: true,
    pitch: "Small Ltd — MTD VAT + corporation tax story.",
  },
  {
    name: "Blue Harbour Properties Ltd",
    type: "limited_company",
    companyNumber: "12233445",
    utr: "1100054321",
    contactEmail: "company@blueharbour.example",
    isEmployer: false,
    isVatRegistered: false,
    pitch: "Accounts + confirmation statement only.",
  },
  {
    name: "Northstar Digital Ltd",
    type: "limited_company",
    companyNumber: "15667890",
    utr: "1100077111",
    vrn: "GB111222333",
    payeRef: "456/B880",
    accountsOfficeRef: "456PA00098765",
    contactEmail: "payroll@northstar.example",
    isEmployer: true,
    isVatRegistered: true,
    pitch: "Employer with payroll + VAT.",
  },
  {
    name: "Samira Khan",
    type: "sole_trader",
    utr: "2255511111",
    nino: "QQ123456C",
    contactEmail: "samira.khan@example.com",
    contactPhone: "07700 900111",
    isEmployer: false,
    isVatRegistered: false,
    pitch: "Self Assessment sole trader.",
  },
  {
    name: "James Whitfield",
    type: "sole_trader",
    utr: "2255522222",
    nino: "QQ654321A",
    vrn: "GB444555666",
    contactEmail: "james.whitfield@example.com",
    isEmployer: false,
    isVatRegistered: true,
    pitch: "Sole trader on MTD VAT.",
  },
  {
    name: "Patel & Partners",
    type: "partnership",
    utr: "3300011222",
    contactEmail: "partners@patelpartners.example",
    contactPhone: "0113 496 0303",
    isEmployer: false,
    isVatRegistered: true,
    pitch: "Partnership — SA800 desk + partners’ SA.",
  },
  {
    name: "Greenfield & Co",
    type: "partnership",
    utr: "3300099888",
    contactEmail: "office@greenfieldco.example",
    isEmployer: false,
    isVatRegistered: false,
    pitch: "Quiet partnership for SA800 walkthrough.",
  },
];
