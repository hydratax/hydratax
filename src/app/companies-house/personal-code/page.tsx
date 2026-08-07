import Link from "next/link";
import Image from "next/image";
import { CH_GUIDANCE } from "@/lib/ch-services";
import { SiteFooter } from "@/components/site-footer";
import { FaqSection } from "@/components/faq-section";

const PERSONAL_CODE_FAQS = [
  {
    q: "Can HydraTax generate a personal code on this website?",
    a: "No. Codes are issued only after GOV.UK One Login verification or via an ACSP. Hydra links to the official services.",
  },
  {
    q: "Do I need a new code for every company?",
    a: "No. The code is personal to the individual. Use the same code for each directorship or PSC role.",
  },
  {
    q: "Where do I find my code?",
    a: "In your Companies House account under Manage account after GOV.UK verification, or in the email from your ACSP.",
  },
];

export const metadata = {
  title: "Director personal codes — Companies House",
  description:
    "How Companies House personal codes work, and why HydraTax links to GOV.UK One Login / ACSP instead of running ID verification itself.",
};

export default function PersonalCodePage() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 md:px-6">
          <Link href="/" className="inline-flex items-center gap-2.5">
            <Image src="/brand/logo.png" alt="HydraTax" width={32} height={32} />
            <span className="display text-lg font-semibold text-ink">
              HydraTax
            </span>
          </Link>
          <Link
            href="/companies-house"
            className="text-sm font-semibold text-sea"
          >
            ← Companies House services
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-12 md:px-6">
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-sea">
          Identity verification
        </p>
        <h1 className="display mt-2 text-4xl text-ink md:text-5xl">
          Personal codes for directors &amp; PSCs
        </h1>
        <p className="mt-4 text-ink-soft">
          An 11-character personal code is issued by Companies House after a
          person verifies their identity. It is personal to the individual — not
          to the company.
        </p>

        <aside className="mt-6 rounded-xl border border-sea/20 bg-sea/5 p-4 text-sm text-ink-soft">
          Source:{" "}
          <a
            href={CH_GUIDANCE.personalCodes}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-sea"
          >
            Companies House personal codes guidance (GOV.UK)
          </a>
          . Always use the official guidance for the latest rules.
        </aside>

        <section className="mt-10 space-y-4">
          <h2 className="display text-2xl">Can HydraTax verify identity on-site?</h2>
          <p className="text-ink-soft">
            <strong className="text-ink">No — not as a substitute for GOV.UK / ACSP.</strong>{" "}
            Companies House identity verification is completed through:
          </p>
          <ul className="list-disc space-y-2 pl-5 text-ink-soft">
            <li>
              <a
                href={CH_GUIDANCE.verifyIdentity}
                className="font-semibold text-sea"
                target="_blank"
                rel="noopener noreferrer"
              >
                GOV.UK One Login identity verification
              </a>{" "}
              (free for individuals), or
            </li>
            <li>
              An Authorised Corporate Service Provider (ACSP / authorised agent)
              who meets the Companies House identity verification standard.
            </li>
          </ul>
          <p className="text-ink-soft">
            A third-party SaaS can orchestrate reminders, track whether
            verification is complete (via the public register / API), and collect
            that a director <em>has</em> a code for a filing — but it cannot mint
            personal codes itself. Building a fully interactive “verify ID inside
            HydraTax” product requires becoming (or integrating with) an{" "}
            <strong className="text-ink">ACSP</strong> and meeting the official
            IDV standard — not a custom website form alone.
          </p>
        </section>

        <section className="mt-10 space-y-4">
          <h2 className="display text-2xl">What HydraTax does</h2>
          <ol className="list-decimal space-y-2 pl-5 text-ink-soft">
            <li>Links directors to the official GOV.UK verification journey.</li>
            <li>
              Reminds practices that confirmation statements and appointments need
              personal codes from 18 November 2025.
            </li>
            <li>
              Accepts an acknowledgement that codes will be supplied at filing
              time — Hydra does not store personal codes on admin dashboards.
            </li>
          </ol>
        </section>

        <div className="mt-10 flex flex-wrap gap-3">
          <a
            href={CH_GUIDANCE.verifyIdentity}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary"
          >
            Verify identity on GOV.UK
          </a>
          <a
            href={CH_GUIDANCE.personalCodes}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary"
          >
            Read personal code guidance
          </a>
          <Link href="/companies-house/confirmation-statement" className="btn btn-secondary">
            File confirmation statement
          </Link>
        </div>

        <FaqSection items={PERSONAL_CODE_FAQS} />
      </main>

      <SiteFooter />
    </div>
  );
}
