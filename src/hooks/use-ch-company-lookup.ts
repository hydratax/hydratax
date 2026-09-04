"use client";

import { useCallback, useEffect, useState } from "react";
import {
  addressFromRecord,
  type ChCompanySnapshot,
} from "@/lib/ch-wizard-shared";
import { looksLikeCompanyNumber } from "@/lib/company-number";

export type ChSearchHit = {
  company_number: string;
  title: string;
  company_status?: string;
  address_snippet?: string;
};

export function useChCompanyLookup(presetCompany?: string) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchHits, setSearchHits] = useState<ChSearchHit[]>([]);
  const [company, setCompany] = useState<ChCompanySnapshot | null>(null);
  const [lookupPending, setLookupPending] = useState(Boolean(presetCompany));
  const [searchPending, setSearchPending] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadCompany = useCallback(async (companyNumber: string) => {
    setLookupPending(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/companies-house/search?company_number=${encodeURIComponent(companyNumber)}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Lookup failed");
      setConfigured(data.configured ?? null);

      const profile = data.profile as {
        company_name?: string;
        company_number?: string;
        company_status?: string;
        registered_office_address?: Record<string, string | undefined>;
      };
      if (!profile?.company_name || !profile.company_number) {
        setError("Company not found on Companies House.");
        return;
      }

      const officers = (data.officers ?? []) as Array<{
        name: string;
        officer_role?: string;
        appointed_on?: string;
        resigned_on?: string;
      }>;
      const pscs = (data.pscs ?? []) as Array<{
        name?: string;
        natures_of_control?: string[];
        ceased_on?: string;
        ceased?: boolean;
      }>;

      const activeDirectors = officers.filter(
        (o) =>
          !o.resigned_on && /director/i.test(o.officer_role ?? "director"),
      );
      const directorList = (
        activeDirectors.length
          ? activeDirectors
          : officers.filter((o) => !o.resigned_on)
      ).map((o) => ({
        name: o.name,
        role: o.officer_role ?? null,
        appointedOn: o.appointed_on ?? null,
      }));

      setCompany({
        companyNumber: profile.company_number,
        companyName: profile.company_name,
        status: profile.company_status ?? null,
        registeredOffice: addressFromRecord(profile.registered_office_address),
        directors: directorList,
        pscs: pscs
          .filter((p) => !p.ceased && !p.ceased_on)
          .map((p) => ({
            name: p.name ?? null,
            naturesOfControl: p.natures_of_control ?? [],
          })),
      });
      setSearchQuery(profile.company_name);
      setSearchHits([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lookup failed");
    } finally {
      setLookupPending(false);
    }
  }, []);

  const searchByName = useCallback(
    async (q: string) => {
      const trimmed = q.trim();
      if (trimmed.length < 2) {
        setSearchHits([]);
        setError(null);
        return;
      }

      setSearchPending(true);
      setError(null);
      try {
        if (looksLikeCompanyNumber(trimmed)) {
          await loadCompany(trimmed.toUpperCase());
          return;
        }
        const res = await fetch(
          `/api/companies-house/search?q=${encodeURIComponent(trimmed)}`,
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Search failed");
        setConfigured(data.configured ?? null);
        const items = (data.items ?? []) as ChSearchHit[];
        setSearchHits(items);
        if (items.length === 0) {
          setError(data.message ?? "No companies matched that search.");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Search failed");
        setSearchHits([]);
      } finally {
        setSearchPending(false);
      }
    },
    [loadCompany],
  );

  function updateSearchQuery(value: string) {
    setSearchQuery(value);
    if (company && value.trim() !== company.companyName) {
      setCompany(null);
    }
  }

  useEffect(() => {
    if (!presetCompany || company?.companyNumber === presetCompany) return;
    void loadCompany(presetCompany);
  }, [presetCompany, company?.companyNumber, loadCompany]);

  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchHits([]);
      return;
    }
    if (company && q === company.companyName) return;

    const t = setTimeout(() => {
      void searchByName(q);
    }, 400);
    return () => clearTimeout(t);
  }, [searchQuery, company, searchByName]);

  return {
    searchQuery,
    setSearchQuery: updateSearchQuery,
    searchHits,
    company,
    setCompany,
    lookupPending: lookupPending || searchPending,
    configured,
    error,
    setError,
    loadCompany,
    searchByName,
  };
}
