import Link from "next/link";
import { notFound } from "next/navigation";
import {
  SUPPORT_CATEGORIES,
  articlesByCategory,
  type SupportCategoryId,
} from "@/lib/support-content";
import { SiteHeader } from "@/components/site-header";

export default async function SupportCategoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const category = SUPPORT_CATEGORIES.find((c) => c.id === id);
  if (!category) notFound();

  const articles = articlesByCategory(id as SupportCategoryId);

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-8 md:px-6 md:py-10">
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-sea">
          Support
        </p>
        <h1 className="display mt-2 text-3xl text-ink sm:text-4xl">{category.title}</h1>
        <p className="mt-2 max-w-2xl text-ink-soft">{category.blurb}</p>
        <ul className="mt-8 grid gap-3">
          {articles.map((a) => (
            <li key={a.slug}>
              <Link
                href={`/support/${a.slug}`}
                className="gloss-card panel panel-interactive block p-5"
              >
                <h2 className="font-semibold text-ink">{a.title}</h2>
                <p className="mt-1 text-sm text-ink-soft">{a.summary}</p>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
