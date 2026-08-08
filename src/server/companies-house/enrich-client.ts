import {
  isCompaniesHouseApiConfigured,
  lookupCompanyBundle,
  type ChOfficer,
  type ChPsc,
} from "@/server/companies-house/api";

/** Snapshot stored on a client after Companies House enrichment */
export type ClientCompaniesHouseSnapshot = {
  companyNumber: string;
  companyName: string;
  companyStatus: string | null;
  incorporatedOn: string | null;
  accountsNextDue: string | null;
  accountsPeriodEnd: string | null;
  confirmationStatementNextDue: string | null;
  confirmationStatementLastMadeUpTo: string | null;
  registeredOffice: string | null;
  directors: Array<{
    name: string;
    role: string | null;
    appointedOn: string | null;
    resignedOn: string | null;
    nationality: string | null;
  }>;
  /** PSC register — closest public ownership view (not a full share register) */
  pscs: Array<{
    name: string | null;
    kind: string | null;
    naturesOfControl: string[];
    notifiedOn: string | null;
    ceasedOn: string | null;
    nationality: string | null;
  }>;
  fetchedAt: string;
};

function addressSnippet(
  addr?: Record<string, string | undefined>,
): string | null {
  if (!addr) return null;
  const parts = [
    addr.address_line_1,
    addr.address_line_2,
    addr.locality,
    addr.region,
    addr.postal_code,
    addr.country,
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

function mapOfficer(o: ChOfficer) {
  return {
    name: o.name,
    role: o.officer_role ?? null,
    appointedOn: o.appointed_on ?? null,
    resignedOn: o.resigned_on ?? null,
    nationality: o.nationality ?? null,
  };
}

function mapPsc(p: ChPsc) {
  return {
    name: p.name ?? null,
    kind: p.kind ?? null,
    naturesOfControl: p.natures_of_control ?? [],
    notifiedOn: p.notified_on ?? null,
    ceasedOn: p.ceased_on ?? null,
    nationality: p.nationality ?? null,
  };
}

export async function enrichLimitedCompanyFromCh(
  companyNumber: string,
): Promise<ClientCompaniesHouseSnapshot | null> {
  const num = companyNumber.trim().toUpperCase();
  if (!num || !isCompaniesHouseApiConfigured()) return null;

  const bundle = await lookupCompanyBundle(num);
  const profile = bundle.profile;
  const accounts = profile.accounts as
    | {
        next_due?: string;
        next_made_up_to?: string;
        next_accounts?: { due_on?: string; period_end_on?: string };
        last_accounts?: { made_up_to?: string; period_end_on?: string };
      }
    | undefined;
  const conf = profile.confirmation_statement;

  const activeOfficers = (bundle.officers ?? []).filter((o) => !o.resigned_on);
  const directors = (activeOfficers.length ? activeOfficers : bundle.officers)
    .map(mapOfficer)
    .slice(0, 50);

  const activePscs = (bundle.pscs ?? []).filter((p) => !p.ceased_on);
  const pscs = (activePscs.length ? activePscs : bundle.pscs)
    .map(mapPsc)
    .slice(0, 50);

  return {
    companyNumber: profile.company_number,
    companyName: profile.company_name,
    companyStatus: profile.company_status ?? null,
    incorporatedOn: profile.date_of_creation ?? null,
    accountsNextDue:
      accounts?.next_due ?? accounts?.next_accounts?.due_on ?? null,
    accountsPeriodEnd:
      accounts?.next_accounts?.period_end_on ??
      accounts?.next_made_up_to ??
      accounts?.last_accounts?.made_up_to ??
      null,
    confirmationStatementNextDue: conf?.next_due ?? null,
    confirmationStatementLastMadeUpTo: conf?.last_made_up_to ?? null,
    registeredOffice: addressSnippet(profile.registered_office_address),
    directors,
    pscs,
    fetchedAt: new Date().toISOString(),
  };
}
