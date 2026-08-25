"use client";

type FilingConfirmationProps = {
  title: string;
  subtitle?: string;
  ok: boolean;
  kind: string;
  correlationId?: string | null;
  details?: Array<{ label: string; value: string }>;
  onDone: () => void;
  onRetry?: () => void;
};

export function FilingConfirmation({
  title,
  subtitle,
  ok,
  kind,
  correlationId,
  details = [],
  onDone,
  onRetry,
}: FilingConfirmationProps) {
  return (
    <div className="mx-auto max-w-lg animate-[fadeIn_0.35s_ease-out]">
      <div className="overflow-hidden rounded-3xl border border-line bg-white shadow-[0_20px_60px_-28px_rgba(15,23,42,0.35)]">
        <div
          className={`px-6 pb-8 pt-10 text-center ${
            ok ? "bg-gradient-to-b from-sea/15 to-white" : "bg-gradient-to-b from-danger/10 to-white"
          }`}
        >
          <div
            className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full ${
              ok ? "bg-sea text-white" : "bg-danger text-white"
            }`}
            aria-hidden
          >
            {ok ? (
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            ) : (
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            )}
          </div>
          <p className="mt-5 text-xs font-bold uppercase tracking-[0.16em] text-ink-soft">
            {kind}
          </p>
          <h2 className="display mt-2 text-3xl text-ink">{title}</h2>
          {subtitle ? (
            <p className="mx-auto mt-2 max-w-sm text-sm text-ink-soft">{subtitle}</p>
          ) : null}
        </div>

        <div className="space-y-3 border-t border-line px-6 py-5">
          {correlationId ? (
            <div className="rounded-xl bg-sand/60 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
                Correlation ID
              </p>
              <p className="mt-1 break-all font-mono text-sm font-semibold text-ink">
                {correlationId}
              </p>
            </div>
          ) : null}
          {details.map((row) => (
            <div
              key={row.label}
              className="flex items-baseline justify-between gap-3 border-b border-line/70 py-2 last:border-0"
            >
              <span className="text-sm text-ink-soft">{row.label}</span>
              <span className="text-right text-sm font-semibold text-ink">
                {row.value}
              </span>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2 border-t border-line px-6 py-5">
          <button type="button" className="btn btn-primary flex-1" onClick={onDone}>
            Done
          </button>
          {!ok && onRetry ? (
            <button type="button" className="btn btn-secondary flex-1" onClick={onRetry}>
              Try again
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
