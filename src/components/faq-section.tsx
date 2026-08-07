"use client";

import { useState } from "react";
import type { FaqItem } from "@/lib/product-faqs";

export function FaqSection({
  title = "Frequently asked questions",
  items,
}: {
  title?: string;
  items: FaqItem[];
}) {
  const [open, setOpen] = useState<number | null>(0);
  if (!items.length) return null;

  return (
    <section className="mt-12">
      <h2 className="display text-3xl text-ink">{title}</h2>
      <div className="mt-5 divide-y divide-line rounded-xl border border-line bg-white/80">
        {items.map((item, i) => {
          const isOpen = open === i;
          return (
            <div key={item.q}>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left"
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? null : i)}
              >
                <span className="font-semibold text-ink">{item.q}</span>
                <span className="text-sea" aria-hidden>
                  {isOpen ? "−" : "+"}
                </span>
              </button>
              {isOpen && (
                <p className="px-4 pb-4 text-sm leading-relaxed text-ink-soft">
                  {item.a}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
