import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { BLOG_POSTS, getBlogPost, blogSlugs, type BlogBlock } from "@/lib/blog";
import { blogPostJsonLd, breadcrumbJsonLd, faqJsonLd } from "@/lib/seo";

export function generateStaticParams() {
  return blogSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getBlogPost(slug);
  if (!post) return { title: "Guide" };
  return {
    title: post.title,
    description: post.description,
    keywords: post.keywords,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      type: "article",
      title: post.title,
      description: post.description,
      url: `/blog/${post.slug}`,
      publishedTime: post.publishedAt,
      modifiedTime: post.updatedAt,
      locale: "en_GB",
    },
  };
}

function Block({ block }: { block: BlogBlock }) {
  if (block.type === "h2") {
    return (
      <h2 className="display mt-10 text-2xl text-ink sm:text-3xl">
        {block.text}
      </h2>
    );
  }
  if (block.type === "h3") {
    return (
      <h3 className="mt-8 text-lg font-semibold text-ink sm:text-xl">
        {block.text}
      </h3>
    );
  }
  if (block.type === "ul") {
    return (
      <ul className="mt-4 list-disc space-y-2 pl-5">
        {block.items.map((item) => (
          <li key={item.slice(0, 48)}>{item}</li>
        ))}
      </ul>
    );
  }
  if (block.type === "callout") {
    return (
      <p className="mt-6 rounded-xl border border-sea/20 bg-sea/10 px-4 py-3 text-sm text-sea-deep">
        {block.text}
      </p>
    );
  }
  return <p className="mt-4">{block.text}</p>;
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getBlogPost(slug);
  if (!post) notFound();

  const others = BLOG_POSTS.filter((p) => p.slug !== post.slug).slice(0, 3);

  return (
    <div className="min-h-screen">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            blogPostJsonLd({
              slug: post.slug,
              title: post.title,
              description: post.description,
              publishedAt: post.publishedAt,
              updatedAt: post.updatedAt,
            }),
          ),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            breadcrumbJsonLd([
              { name: "Home", path: "/" },
              { name: "Guides", path: "/blog" },
              { name: post.title, path: `/blog/${post.slug}` },
            ]),
          ),
        }}
      />
      {post.faq && post.faq.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(faqJsonLd(post.faq)),
          }}
        />
      )}

      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-8 md:px-6 md:py-12">
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-sea">
          <Link href="/blog" className="hover:underline">
            Guides
          </Link>
          {" · "}
          {post.category}
        </p>
        <h1 className="display mt-2 text-3xl text-ink sm:text-4xl md:text-5xl">
          {post.title}
        </h1>
        <p className="mt-4 text-lg text-ink-soft">{post.description}</p>
        <p className="mt-3 text-sm text-ink-soft">
          Updated {new Date(post.updatedAt).toLocaleDateString("en-GB")} ·{" "}
          {post.readingMinutes} min read
        </p>

        <article className="prose-hydra mt-8 text-base leading-relaxed text-ink-soft">
          {post.body.map((block, i) => (
            <Block key={`${block.type}-${i}`} block={block} />
          ))}
        </article>

        {post.faq && post.faq.length > 0 && (
          <section className="mt-12 border-t border-line pt-8">
            <h2 className="display text-2xl text-ink">Common questions</h2>
            <dl className="mt-4 space-y-5">
              {post.faq.map((item) => (
                <div key={item.q}>
                  <dt className="font-semibold text-ink">{item.q}</dt>
                  <dd className="mt-1 text-ink-soft">{item.a}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        <div className="mt-10 flex flex-wrap gap-3">
          <Link href={post.relatedHref} className="btn btn-primary">
            {post.relatedLabel}
          </Link>
          <Link href="/blog" className="btn btn-secondary">
            More guides
          </Link>
        </div>

        <section className="mt-14">
          <h2 className="display text-xl text-ink">Keep reading</h2>
          <ul className="mt-4 space-y-3">
            {others.map((p) => (
              <li key={p.slug}>
                <Link
                  href={`/blog/${p.slug}`}
                  className="font-semibold text-sea hover:underline"
                >
                  {p.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
