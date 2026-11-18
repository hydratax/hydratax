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
  companyAuthCode?: string;
  address?: string;
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
    companyAuthCode: "MRD482",
    address: "14 Meridian Way, London, E1 6AN",
    contactEmail: "accounts@meridian-retail.example",
    contactPhone: "020 7946 0101",
    isEmployer: true,
    isVatRegistered: true,
    pitch:
      "Flagship: directors & shareholders, payroll people, bank→VAT/accounts, CT600 ready, emails.",
  },
  {
    name: "Oak & Thorn Consulting Ltd",
    type: "limited_company",
    companyNumber: "13554012",
    utr: "1100098765",
    vrn: "GB987654321",
    companyAuthCode: "OAK901",
    address: "8 Quay Street, Manchester, M3 3JE",
    contactEmail: "finance@oakthorn.example",
    contactPhone: "0161 496 0202",
    isEmployer: false,
    isVatRegistered: true,
    pitch: "Consulting Ltd — bank fees → VAT draft + CT600.",
  },
  {
    name: "Blue Harbour Properties Ltd",
    type: "limited_company",
    companyNumber: "12233445",
    utr: "1100054321",
    companyAuthCode: "BLU334",
    address: "9 Harbour Quay, Bristol, BS1 4DJ",
    contactEmail: "company@blueharbour.example",
    contactPhone: "0117 496 0404",
    isEmployer: false,
    isVatRegistered: false,
    pitch: "Accounts + confirmation statement walkthrough.",
  },
  {
    name: "Northstar Digital Ltd",
    type: "limited_company",
    companyNumber: "15667890",
    utr: "1100077111",
    vrn: "GB111222333",
    payeRef: "456/B880",
    accountsOfficeRef: "456PA00098765",
    companyAuthCode: "NST890",
    address: "22 Park Row, Leeds, LS1 5HU",
    contactEmail: "payroll@northstar.example",
    contactPhone: "0113 496 0505",
    isEmployer: true,
    isVatRegistered: true,
    pitch: "Employer story — payroll people + VAT + bank.",
  },
  {
    name: "Samira Khan",
    type: "sole_trader",
    utr: "2255511111",
    nino: "QQ123456C",
    address: "14 Meridian Way, London, E1 6AN",
    contactEmail: "samira.khan@example.com",
    contactPhone: "07700 900111",
    isEmployer: false,
    isVatRegistered: false,
    pitch: "Sole trader SA — bank books into Self Assessment.",
  },
  {
    name: "James Whitfield",
    type: "sole_trader",
    utr: "2255522222",
    nino: "QQ654321A",
    vrn: "GB444555666",
    address: "3 Station Road, Reading, RG1 1LG",
    contactEmail: "james.whitfield@example.com",
    contactPhone: "07700 900222",
    isEmployer: false,
    isVatRegistered: true,
    pitch: "Sole trader on MTD VAT.",
  },
  {
    name: "Patel & Partners",
    type: "partnership",
    utr: "3300011222",
    address: "22 Park Row, Leeds, LS1 5HU",
    contactEmail: "partners@patelpartners.example",
    contactPhone: "0113 496 0303",
    isEmployer: false,
    isVatRegistered: true,
    pitch: "Partnership — two partners on the SA desk.",
  },
  {
    name: "Greenfield & Co",
    type: "partnership",
    utr: "3300099888",
    address: "17 Meadow Lane, York, YO1 7HH",
    contactEmail: "office@greenfieldco.example",
    contactPhone: "01904 496 0606",
    isEmployer: false,
    isVatRegistered: false,
    pitch: "Quiet partnership for SA800 walkthrough.",
  },
];
