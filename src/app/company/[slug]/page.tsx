import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { PublicCompanyProfile } from "@/components/companies-house/public-company-profile";
import {
  companyProfileFacts,
  formatUkDate,
} from "@/lib/company-profile-facts";
import {
  companyNumberFromSlug,
  companyProfilePath,
  companyProfileSlug,
} from "@/lib/company-slug";
import { siteUrl } from "@/lib/site";
import {
  getCompanyProfile,
  isCompaniesHouseApiConfigured,
} from "@/server/companies-house/api";

export const revalidate = 86_400;

const PROFILE_CACHE_SECONDS = 86_400;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const companyNumber = companyNumberFromSlug(slug);
  if (!companyNumber || !isCompaniesHouseApiConfigured()) {
    return { title: "Company profile — HydraTax" };
  }
  try {
    const profile = await getCompanyProfile(companyNumber, PROFILE_CACHE_SECONDS);
    const facts = companyProfileFacts(profile);
    const path = companyProfilePath(facts.companyName, facts.companyNumber);
    const description = `${facts.companyName} (${facts.companyNumber}) is ${facts.statusLabel.toLowerCase()}. Accounts due ${formatUkDate(facts.accountsDue) ?? "on the register"}. Confirmation statement ${formatUkDate(facts.confirmationDate) ?? "on the register"}. CT600 due ${formatUkDate(facts.ct600Due) ?? "12 months after the year end"}.`;
    return {
      title: `${facts.companyName} | Company profile`,
      description,
      alternates: { canonical: `${siteUrl()}${path}` },
      openGraph: {
        title: `${facts.companyName} | Company profile`,
        description,
        url: `${siteUrl()}${path}`,
      },
    };
  } catch {
    return { title: "Company profile — HydraTax" };
  }
}

export default async function PublicCompanyPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const companyNumber = companyNumberFromSlug(slug);
  if (!companyNumber) notFound();
  if (!isCompaniesHouseApiConfigured()) notFound();

  let profile: Awaited<ReturnType<typeof getCompanyProfile>>;
  try {
    profile = await getCompanyProfile(companyNumber, PROFILE_CACHE_SECONDS);
  } catch {
    notFound();
  }

  const canonical = companyProfileSlug(profile.company_name, profile.company_number);
  if (decodeURIComponent(slug).toLowerCase() !== canonical) {
    permanentRedirect(companyProfilePath(profile.company_name, profile.company_number));
  }

  const facts = companyProfileFacts(profile);

  return (
    <div className="min-h-screen bg-paper">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 py-8 md:px-6 md:py-12">
        <PublicCompanyProfile profile={profile} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "FAQPage",
              mainEntity: [
                {
                  "@type": "Question",
                  name: `When are ${facts.companyName}'s accounts due?`,
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: `${facts.companyName}'s next accounts are due by ${formatUkDate(facts.accountsDue) ?? "the Companies House due date"}.`,
                  },
                },
                {
                  "@type": "Question",
                  name: `Is ${facts.companyName} still active?`,
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: `${facts.companyName} is ${facts.statusLabel.toLowerCase()} on the Companies House register.`,
                  },
                },
              ],
            }),
          }}
        />
      </main>
      <SiteFooter />
    </div>
  );
}
