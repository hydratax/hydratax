"use client";

import { useState, useTransition } from "react";
import {
  createFeatureRequest,
  toggleFeatureVote,
  type FeatureRequestRow,
  type FeatureRequestStatus,
} from "@/server/actions/feature-requests";

const STATUS_LABEL: Record<FeatureRequestStatus, string> = {
  open: "Open",
  planned: "Planned",
  shipping: "Building",
  shipped: "Shipped",
};

function StatusBadge({ status }: { status: FeatureRequestStatus }) {
  const tone =
    status === "shipped"
      ? "badge-ok"
      : status === "shipping" || status === "planned"
        ? "badge-sea"
        : "badge-muted";
  return <span className={`badge ${tone}`}>{STATUS_LABEL[status]}</span>;
}

function VoteButton({
  item,
  onChange,
}: {
  item: FeatureRequestRow;
  onChange: (next: FeatureRequestRow) => void;
}) {
  const [pending, start] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      aria-pressed={item.votedByMe}
      aria-label={item.votedByMe ? "Remove vote" : "Upvote"}
      onClick={() => {
        start(async () => {
          const res = await toggleFeatureVote(item.id);
          if (!res.ok) return;
          onChange({
            ...item,
            voteCount: res.voteCount,
            votedByMe: res.votedByMe,
          });
        });
      }}
      className={`flex min-w-[3.25rem] flex-col items-center justify-center rounded-lg border px-2 py-2 transition ${
        item.votedByMe
          ? "border-sea bg-sea/10 text-sea"
          : "border-line bg-white text-ink-soft hover:border-sea hover:text-sea"
      }`}
    >
      <span className="text-xs font-bold leading-none" aria-hidden>
        ▲
      </span>
      <span className="mono mt-1 text-sm font-semibold tabular-nums text-ink">
        {item.voteCount}
      </span>
    </button>
  );
}

export function FeatureRequestBoard({
  initial,
}: {
  initial: FeatureRequestRow[];
}) {
  const [items, setItems] = useState(initial);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [authorName, setAuthorName] = useState("");
  const [authorEmail, setAuthorEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function patchItem(next: FeatureRequestRow) {
    setItems((prev) =>
      [...prev.map((r) => (r.id === next.id ? next : r))].sort((a, b) => {
        if (b.voteCount !== a.voteCount) return b.voteCount - a.voteCount;
        return b.createdAt.localeCompare(a.createdAt);
      }),
    );
  }

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(280px,340px)]">
      <div className="space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="display text-2xl text-ink md:text-3xl">
              Top requests
            </h2>
            <p className="mt-1 text-sm text-ink-soft">
              Vote once per idea. Highest votes rise — we build what practices
              need most.
            </p>
          </div>
          <p className="mono hidden text-xs text-ink-soft sm:block">
            {items.length} ideas
          </p>
        </div>

        <ul className="space-y-3">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex gap-3 rounded-xl border border-line bg-white/90 p-4 shadow-sm"
            >
              <VoteButton item={item} onChange={patchItem} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold text-ink">{item.title}</h3>
                  <StatusBadge status={item.status} />
                </div>
                <p className="mt-1 text-sm leading-relaxed text-ink-soft">
                  {item.body}
                </p>
                <p className="mt-2 text-xs text-ink-soft">
                  Requested by {item.authorName}
                </p>
              </div>
            </li>
          ))}
          {items.length === 0 && (
            <li className="rounded-xl border border-dashed border-line bg-sand/40 p-8 text-center text-sm text-ink-soft">
              Be the first — post a request for your practice desk.
            </li>
          )}
        </ul>
      </div>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <form
          className="rounded-xl border border-line bg-white p-5 shadow-sm"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            setOkMsg(null);
            start(async () => {
              const res = await createFeatureRequest({
                title,
                body,
                authorName,
                authorEmail,
              });
              if (!res.ok) {
                setError(res.error);
                return;
              }
              const created: FeatureRequestRow = {
                id: res.id,
                title: title.trim(),
                body: body.trim(),
                authorName: authorName.trim(),
                status: "open",
                voteCount: 1,
                createdAt: new Date().toISOString(),
                votedByMe: true,
              };
              setItems((prev) => [created, ...prev]);
              setTitle("");
              setBody("");
              setOkMsg("Posted — others can vote on it now.");
            });
          }}
        >
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-sea">
            Suggest a feature
          </p>
          <h2 className="display mt-1 text-2xl text-ink">Tell us what slows you down</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Built for accountants’ ease — your desk friction becomes our next
            ship.
          </p>

          <label className="label mt-5" htmlFor="fr-title">
            Title
          </label>
          <input
            id="fr-title"
            className="input mt-1"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Auto-chase missing client docs"
            maxLength={120}
            required
          />

          <label className="label mt-4" htmlFor="fr-body">
            Why it helps
          </label>
          <textarea
            id="fr-body"
            className="input mt-1 min-h-[110px] resize-y"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="What takes too long today, and how should HydraTax fix it?"
            maxLength={1200}
            required
          />

          <label className="label mt-4" htmlFor="fr-name">
            Your name
          </label>
          <input
            id="fr-name"
            className="input mt-1"
            value={authorName}
            onChange={(e) => setAuthorName(e.target.value)}
            placeholder="First name or practice"
            maxLength={80}
            required
          />

          <label className="label mt-4" htmlFor="fr-email">
            Email <span className="font-normal text-ink-soft">(optional)</span>
          </label>
          <input
            id="fr-email"
            type="email"
            className="input mt-1"
            value={authorEmail}
            onChange={(e) => setAuthorEmail(e.target.value)}
            placeholder="If we need a follow-up"
            maxLength={160}
          />

          {error && (
            <p className="mt-3 text-sm text-danger" role="alert">
              {error}
            </p>
          )}
          {okMsg && (
            <p className="mt-3 text-sm text-ok" role="status">
              {okMsg}
            </p>
          )}

          <button
            type="submit"
            className="btn btn-primary mt-5 w-full"
            disabled={pending}
          >
            {pending ? "Posting…" : "Post request"}
          </button>
        </form>
      </aside>
    </div>
  );
}
