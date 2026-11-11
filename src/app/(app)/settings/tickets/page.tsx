import Link from "next/link";
import { requireSession } from "@/server/auth/session";
import { listSupportTickets } from "@/server/actions/practice-logs";

export default async function SupportTicketsPage() {
  await requireSession();
  let tickets: Awaited<ReturnType<typeof listSupportTickets>> = [];
  try {
    tickets = await listSupportTickets();
  } catch {
    tickets = [];
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-sea">
            Support
          </p>
          <h1 className="display mt-1 text-3xl text-ink">Tickets</h1>
          <p className="mt-2 text-sm text-ink-soft">
            Tickets raised from this practice desk.
          </p>
        </div>
        <Link href="/support" className="btn btn-secondary text-sm">
          Help centre
        </Link>
      </div>

      <ul className="divide-y divide-line rounded-xl border border-line bg-white">
        {tickets.length === 0 ? (
          <li className="px-4 py-10 text-center text-sm text-ink-soft">
            No tickets yet. Use Tickets → New ticket in the header.
          </li>
        ) : (
          tickets.map((t) => (
            <li key={t.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-ink">
                  {t.ticketRef} · {t.subject}
                </p>
                <p className="mt-1 line-clamp-2 text-sm text-ink-soft">
                  {t.message}
                </p>
                <p className="mt-1 text-xs text-ink-soft">
                  {[t.helpTopic, t.module, t.status]
                    .filter(Boolean)
                    .join(" · ")}{" "}
                  · {new Date(t.createdAt).toLocaleString("en-GB")}
                </p>
              </div>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
