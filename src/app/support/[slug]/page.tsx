import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import {
  SUPPORT_CATEGORIES,
  getArticle,
} from "@/lib/support-content";

export default async function SupportArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = getArticle(slug);
  if (!article) notFound();

  const category = SUPPORT_CATEGORIES.find((c) => c.id === article.category);

  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 md:px-6">
          <Link href="/" className="inline-flex items-center gap-2.5">
            <Image src="/brand/logo.png" alt="HydraTax" width={32} height={32} />
            <span className="display text-lg font-semibold text-ink">
              HydraTax
            </span>
          </Link>
          <Link href="/support" className="text-sm font-semibold text-sea">
            ← Support home
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10 md:px-6">
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-sea">
          {category?.title}
        </p>
        <h1 className="display mt-2 text-4xl text-ink md:text-5xl">
          {article.title}
        </h1>
        <p className="mt-3 text-lg text-ink-soft">{article.summary}</p>
        <div className="prose-hydra mt-8 space-y-4 text-base leading-relaxed text-ink-soft">
          {article.body.map((p) => (
            <p key={p.slice(0, 24)}>{p}</p>
          ))}
        </div>
        <div className="mt-10 flex flex-wrap gap-3">
          <Link href="/support" className="btn btn-secondary">
            More articles
          </Link>
          <Link href="/dashboard" className="btn btn-primary">
            Open practice
          </Link>
        </div>
      </main>
    </div>
  );
}
