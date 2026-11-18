/**
 * Full identity packs for every presentation demo client.
 * Fictional only — auth codes / UTRs / NINOs are not real.
 */

import { DEMO_ADDR, type RichPerson } from "@/server/demo/presentation-rich-data";

export type DemoClientProfile = {
  name: string;
  address: string;
  contactPhone: string;
  contactEmail: string;
  companyAuthCode?: string;
  payeRef?: string;
  accountsOfficeRef?: string;
  nino?: string;
  /** Companies House-style due dates / office */
  incorporatedOn?: string;
  accountsNextDue?: string;
  accountsPeriodEnd?: string;
  lastAccountsMadeUpTo?: string;
  confirmationStatementNextDue?: string;
  confirmationStatementLastMadeUpTo?: string;
  confirmationStatementNextMadeUpTo?: string;
  registeredOffice?: string;
  sicCodes?: string[];
  people: RichPerson[];
};

export const DEMO_CLIENT_PROFILES: Record<string, DemoClientProfile> = {
  "meridian retail limited": {
    name: "Meridian Retail Limited",
    address: DEMO_ADDR.london,
    contactPhone: "020 7946 0101",
    contactEmail: "accounts@meridian-retail.example",
    companyAuthCode: "MRD482",
    payeRef: "123/A246",
    accountsOfficeRef: "123PA00012345",
    incorporatedOn: "2020-06-01",
    accountsNextDue: "2026-12-31",
    accountsPeriodEnd: "2026-03-31",
    lastAccountsMadeUpTo: "2025-03-31",
    confirmationStatementNextDue: "2026-06-15",
    confirmationStatementLastMadeUpTo: "2025-06-01",
    confirmationStatementNextMadeUpTo: "2026-06-01",
    registeredOffice: DEMO_ADDR.london,
    sicCodes: ["47910"],
    people: [], // MERIDIAN_PEOPLE used in enrich
  },
  "oak & thorn consulting ltd": {
    name: "Oak & Thorn Consulting Ltd",
    address: DEMO_ADDR.manchester,
    contactPhone: "0161 496 0202",
    contactEmail: "finance@oakthorn.example",
    companyAuthCode: "OAK901",
    incorporatedOn: "2019-09-01",
    accountsNextDue: "2026-09-30",
    accountsPeriodEnd: "2026-03-31",
    lastAccountsMadeUpTo: "2025-03-31",
    confirmationStatementNextDue: "2026-09-15",
    confirmationStatementLastMadeUpTo: "2025-09-01",
    confirmationStatementNextMadeUpTo: "2026-09-01",
    registeredOffice: DEMO_ADDR.manchester,
    sicCodes: ["70229"],
    people: [
      {
        fullName: "Olivia Oak",
        role: "director_shareholder",
        nino: "QQ889900H",
        utr: "2255500044",
        dateOfBirth: "1985-04-04",
        email: "olivia.oak@example.com",
        phone: "07700 900301",
        address: DEMO_ADDR.manchester,
        occupation: "Consultant",
        shareholdingNote: "100% ordinary shares",
        appointedOn: "2019-09-01",
      },
    ],
  },
  "blue harbour properties ltd": {
    name: "Blue Harbour Properties Ltd",
    address: "9 Harbour Quay, Bristol, BS1 4DJ",
    contactPhone: "0117 496 0404",
    contactEmail: "company@blueharbour.example",
    companyAuthCode: "BLU334",
    incorporatedOn: "2018-04-12",
    accountsNextDue: "2026-12-31",
    accountsPeriodEnd: "2026-03-31",
    lastAccountsMadeUpTo: "2025-03-31",
    confirmationStatementNextDue: "2026-04-26",
    confirmationStatementLastMadeUpTo: "2025-04-12",
    confirmationStatementNextMadeUpTo: "2026-04-12",
    registeredOffice: "9 Harbour Quay, Bristol, BS1 4DJ",
    sicCodes: ["68209"],
    people: [
      {
        fullName: "Helen Harbour",
        role: "director_shareholder",
        nino: "QQ121212M",
        utr: "2255500088",
        dateOfBirth: "1979-05-18",
        email: "helen.harbour@example.com",
        phone: "07700 900601",
        address: "9 Harbour Quay, Bristol, BS1 4DJ",
        occupation: "Property director",
        shareholdingNote: "70% ordinary shares",
        appointedOn: "2018-04-12",
      },
      {
        fullName: "Tom Blue",
        role: "director_shareholder",
        nino: "QQ131313N",
        utr: "2255500099",
        dateOfBirth: "1984-09-03",
        email: "tom.blue@example.com",
        phone: "07700 900602",
        address: "9 Harbour Quay, Bristol, BS1 4DJ",
        occupation: "Director",
        shareholdingNote: "30% ordinary shares",
        appointedOn: "2018-04-12",
      },
    ],
  },
  "northstar digital ltd": {
    name: "Northstar Digital Ltd",
    address: DEMO_ADDR.leeds,
    contactPhone: "0113 496 0505",
    contactEmail: "payroll@northstar.example",
    companyAuthCode: "NST890",
    payeRef: "456/B880",
    accountsOfficeRef: "456PA00098765",
    incorporatedOn: "2022-03-01",
    accountsNextDue: "2027-01-15",
    accountsPeriodEnd: "2026-03-31",
    lastAccountsMadeUpTo: "2025-03-31",
    confirmationStatementNextDue: "2027-03-15",
    confirmationStatementLastMadeUpTo: "2026-03-01",
    confirmationStatementNextMadeUpTo: "2027-03-01",
    registeredOffice: DEMO_ADDR.leeds,
    sicCodes: ["62012"],
    people: [
      {
        fullName: "Noah Star",
        role: "director_shareholder",
        nino: "QQ990011J",
        utr: "2255500055",
        dateOfBirth: "1980-08-17",
        email: "noah.star@example.com",
        phone: "07700 900401",
        address: DEMO_ADDR.leeds,
        occupation: "Director",
        shareholdingNote: "100% ordinary shares",
        appointedOn: "2022-03-01",
      },
    ],
  },
  "samira khan": {
    name: "Samira Khan",
    address: DEMO_ADDR.london,
    contactPhone: "07700 900111",
    contactEmail: "samira.khan@example.com",
    nino: "QQ123456C",
    people: [
      {
        fullName: "Samira Khan",
        role: "sole_trader",
        nino: "QQ123456C",
        utr: "2255511111",
        dateOfBirth: "1993-02-11",
        email: "samira.khan@example.com",
        phone: "07700 900111",
        address: DEMO_ADDR.london,
        occupation: "Web designer",
      },
    ],
  },
  "james whitfield": {
    name: "James Whitfield",
    address: "3 Station Road, Reading, RG1 1LG",
    contactPhone: "07700 900222",
    contactEmail: "james.whitfield@example.com",
    nino: "QQ654321A",
    people: [
      {
        fullName: "James Whitfield",
        role: "sole_trader",
        nino: "QQ654321A",
        utr: "2255522222",
        dateOfBirth: "1987-11-25",
        email: "james.whitfield@example.com",
        phone: "07700 900222",
        address: "3 Station Road, Reading, RG1 1LG",
        occupation: "Tradesperson",
      },
    ],
  },
  "patel & partners": {
    name: "Patel & Partners",
    address: DEMO_ADDR.leeds,
    contactPhone: "0113 496 0303",
    contactEmail: "partners@patelpartners.example",
    people: [
      {
        fullName: "Aisha Patel",
        role: "partner",
        nino: "QQ101010K",
        utr: "2255500066",
        dateOfBirth: "1978-06-06",
        email: "aisha.patel@example.com",
        phone: "07700 900501",
        address: DEMO_ADDR.leeds,
        occupation: "Partner",
      },
      {
        fullName: "Rohan Patel",
        role: "partner",
        nino: "QQ202020L",
        utr: "2255500077",
        dateOfBirth: "1981-10-10",
        email: "rohan.patel@example.com",
        phone: "07700 900502",
        address: DEMO_ADDR.leeds,
        occupation: "Partner",
      },
    ],
  },
  "greenfield & co": {
    name: "Greenfield & Co",
    address: "17 Meadow Lane, York, YO1 7HH",
    contactPhone: "01904 496 0606",
    contactEmail: "office@greenfieldco.example",
    people: [
      {
        fullName: "Clara Green",
        role: "partner",
        nino: "QQ303030P",
        utr: "2255500101",
        dateOfBirth: "1976-01-09",
        email: "clara.green@example.com",
        phone: "07700 900701",
        address: "17 Meadow Lane, York, YO1 7HH",
        occupation: "Partner",
      },
      {
        fullName: "Owen Field",
        role: "partner",
        nino: "QQ404040Q",
        utr: "2255500102",
        dateOfBirth: "1974-12-20",
        email: "owen.field@example.com",
        phone: "07700 900702",
        address: "17 Meadow Lane, York, YO1 7HH",
        occupation: "Partner",
      },
    ],
  },
};

export function demoProfileFor(name: string): DemoClientProfile | null {
  return DEMO_CLIENT_PROFILES[name.trim().toLowerCase()] ?? null;
}
