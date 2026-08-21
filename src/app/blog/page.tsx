import Link from "next/link";
import type { Metadata } from "next";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { BLOG_POSTS } from "@/lib/blog";
import { breadcrumbJsonLd } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Guides — UK accounting, CT600, MTD VAT, bookkeeping & Companies House",
  description:
    "HydraTax guides for accountants and small businesses: accounting challenges, bookkeeping difficulties, CT600 HMRC changes, Making Tax Digital, and confirmation statements.",
  keywords: [
    "UK accounting blog",
    "small business tax guides",
    "CT600 guide",
    "Making Tax Digital explained",
    "confirmation statement guide",
    "bookkeeping tips UK",
  ],
  alternates: { canonical: "/blog" },
  openGraph: {
    title: "HydraTax guides for UK accountants and small businesses",
    description:
      "Practical articles on bookkeeping, CT600, Making Tax Digital and Companies House confirmation statements.",
    type: "website",
    url: "/blog",
    images: [
      {
        url: "/brand/og.png",
        width: 1200,
        height: 630,
        alt: "HydraTax",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/brand/og.png"],
  },
};

export default function BlogIndexPage() {
  return (
    <div className="min-h-screen">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            breadcrumbJsonLd([
              { name: "Home", path: "/" },
              { name: "Guides", path: "/blog" },
            ]),
          ),
        }}
      />
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-10 md:px-6 md:py-14">
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-sea">
          Guides
        </p>
        <h1 className="display mt-2 text-3xl text-ink sm:text-4xl md:text-5xl">
          Accounting, tax and Companies House — explained
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-ink-soft">
          Plain-English guides for UK accountants, directors and small
          businesses. Written for HydraTax — not generic filler.
        </p>

        <ul className="mt-10 grid gap-5 md:grid-cols-2">
          {BLOG_POSTS.map((post) => (
            <li key={post.slug}>
              <Link
                href={`/blog/${post.slug}`}
                className="gloss-card panel block h-full p-5 transition hover:-translate-y-0.5"
              >
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-sea">
                  {post.category} · {post.readingMinutes} min
                </p>
                <h2 className="display mt-2 text-2xl text-ink">{post.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                  {post.description}
                </p>
                <span className="mt-4 inline-block text-sm font-semibold text-sea">
                  Read guide →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </main>
      <SiteFooter />
    </div>
  );
}
