"use client";

import { useActionState, useMemo, useState } from "react";
import {
  CLIENT_COUNT_OPTIONS,
  DEMO_SERVICES,
  HEAR_ABOUT_OPTIONS,
  demoServiceById,
  formatDemoDateLabel,
  listBookableDates,
  listTimeSlots,
  type DemoServiceId,
} from "@/lib/demo-booking";
import {
  submitDemoBooking,
  type DemoBookingState,
} from "@/server/actions/demo-booking";

const initial: DemoBookingState | null = null;

type Step = "details" | "schedule" | "practice";

export function BookDemoWizard({
  initialService = "modules",
}: {
  initialService?: DemoServiceId;
}) {
  const [step, setStep] = useState<Step>("details");
  const [serviceId, setServiceId] = useState<DemoServiceId>(initialService);
  const [date, setDate] = useState<string>("");
  const [time, setTime] = useState<string>("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [guestEmails, setGuestEmails] = useState("");
  const [formStartedAt] = useState(() => String(Date.now()));
  const [state, action, pending] = useActionState(submitDemoBooking, initial);

  const service = demoServiceById(serviceId)!;
  const dates = useMemo(() => listBookableDates(), []);
  const slots = useMemo(
    () => listTimeSlots(service.durationMinutes),
    [service.durationMinutes],
  );

  const monthLabel = useMemo(() => {
    const key = date || dates[0];
    if (!key) return "";
    const [y, m] = key.split("-").map(Number);
    return new Intl.DateTimeFormat("en-GB", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(y!, m! - 1, 1)));
  }, [date, dates]);

  if (state?.ok) {
    return (
      <div
        className="rounded-2xl border border-sea/25 bg-sea/5 p-6"
        role="status"
      >
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-sea">
          Confirmed
        </p>
        <h2 className="display mt-2 text-2xl text-ink">Demo booked</h2>
        <p className="mt-2 text-sm text-ink-soft">{state.message}</p>
        {state.reference ? (
          <p className="mono mt-3 text-sm font-semibold text-ink">
            {state.reference}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-line bg-white p-5 shadow-sm md:p-7">
      <ol className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-[0.12em]">
        {(
          [
            ["details", "Your details"],
            ["schedule", "Pick a time"],
            ["practice", "Practice info"],
          ] as const
        ).map(([id, label], i) => {
          const done =
            (id === "details" && step !== "details") ||
            (id === "schedule" && step === "practice");
          const active = step === id;
          return (
            <li key={id} className="flex items-center gap-2">
              {i > 0 ? (
                <span className="text-ink-soft/40" aria-hidden>
                  /
                </span>
              ) : null}
              <span
                className={
                  active
                    ? "text-sea"
                    : done
                      ? "text-ink"
                      : "text-ink-soft"
                }
              >
                {done ? "✓ " : `${i + 1}. `}
                {label}
              </span>
            </li>
          );
        })}
      </ol>

      {step === "details" ? (
        <div className="mt-6 space-y-4">
          <p className="text-sm text-ink-soft">
            Add your name and email, then choose your demo and a time. We email
            you a confirmation straight away.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-semibold text-ink sm:col-span-2">
              First and surname
              <input
                className="input mt-1.5 w-full font-normal"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                minLength={2}
                autoComplete="name"
              />
            </label>
            <label className="block text-sm font-semibold text-ink">
              Email
              <input
                type="email"
                className="input mt-1.5 w-full font-normal"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </label>
            <label className="block text-sm font-semibold text-ink">
              Phone number
              <input
                type="tel"
                className="input mt-1.5 w-full font-normal"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                autoComplete="tel"
              />
            </label>
            <label className="block text-sm font-semibold text-ink sm:col-span-2">
              Guest email(s)
              <textarea
                className="input mt-1.5 min-h-[4.5rem] w-full resize-y font-normal"
                value={guestEmails}
                onChange={(e) => setGuestEmails(e.target.value)}
                placeholder="Add up to 10 additional guests (comma-separated)"
              />
            </label>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            disabled={
              name.trim().length < 2 ||
              !email.includes("@") ||
              phone.trim().length < 7
            }
            onClick={() => setStep("schedule")}
          >
            Continue
          </button>
        </div>
      ) : null}

      {step === "schedule" ? (
        <div className="mt-6 space-y-6">
          <p className="rounded-lg border border-sea/20 bg-sea/5 px-3 py-2 text-sm text-ink">
            Thanks, {name.split(" ")[0] || "there"}. Now pick a time.
          </p>

          <div>
            <h3 className="text-sm font-bold uppercase tracking-[0.12em] text-ink-soft">
              Select a service
            </h3>
            <ul className="mt-3 grid gap-3">
              {DEMO_SERVICES.map((s) => {
                const selected = s.id === serviceId;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setServiceId(s.id);
                        setTime("");
                      }}
                      className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                        selected
                          ? "border-sea bg-sea/5 shadow-sm"
                          : "border-line bg-white hover:border-sea/40"
                      }`}
                    >
                      <span className="flex items-start justify-between gap-3">
                        <span>
                          <span className="block font-semibold text-ink">
                            {s.title}
                          </span>
                          <span className="mt-1 block text-sm text-ink-soft">
                            {s.blurb}
                          </span>
                          <span className="mt-2 inline-block text-xs font-semibold text-sea">
                            {s.durationMinutes} minutes
                          </span>
                        </span>
                        <span
                          className={`mt-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                            selected
                              ? "border-sea bg-sea text-white"
                              : "border-line"
                          }`}
                          aria-hidden
                        >
                          {selected ? "✓" : ""}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          <div>
            <p className="text-sm text-ink-soft">
              Booking for <strong className="text-ink">{service.title}</strong>
            </p>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold uppercase tracking-[0.12em] text-ink-soft">
                Date · {monthLabel}
              </h3>
            </div>
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {dates.slice(0, 14).map((d) => {
                const selected = d === date;
                const dayNum = d.slice(-2);
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => {
                      setDate(d);
                      setTime("");
                    }}
                    className={`min-w-[3rem] rounded-full px-3 py-2 text-sm font-semibold ${
                      selected
                        ? "bg-sea text-white"
                        : "border border-line bg-white text-ink hover:border-sea/40"
                    }`}
                    title={formatDemoDateLabel(d)}
                  >
                    {Number(dayNum)}
                  </button>
                );
              })}
            </div>
            {date ? (
              <p className="mt-2 text-sm font-semibold text-ink">
                {formatDemoDateLabel(date)}
              </p>
            ) : null}
          </div>

          {date ? (
            <div>
              <h3 className="text-sm font-bold uppercase tracking-[0.12em] text-ink-soft">
                Time
              </h3>
              <p className="mt-1 text-xs text-ink-soft">
                All times are in UK (Europe/London)
              </p>
              <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                {slots.map((t) => {
                  const selected = t === time;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTime(t)}
                      className={`rounded-lg border px-2 py-2 text-sm font-semibold ${
                        selected
                          ? "border-sea bg-sea text-white"
                          : "border-line bg-white text-ink hover:border-sea/40"
                      }`}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setStep("details")}
            >
              Back
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!date || !time}
              onClick={() => setStep("practice")}
            >
              Continue
            </button>
          </div>
        </div>
      ) : null}

      {step === "practice" ? (
        <form action={action} className="mt-6 grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="formStartedAt" value={formStartedAt} />
          <input type="hidden" name="name" value={name} />
          <input type="hidden" name="email" value={email} />
          <input type="hidden" name="phone" value={phone} />
          <input type="hidden" name="guestEmails" value={guestEmails} />
          <input type="hidden" name="serviceId" value={serviceId} />
          <input type="hidden" name="date" value={date} />
          <input type="hidden" name="time" value={time} />
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            className="absolute -left-[9999px] h-0 w-0 opacity-0"
          />

          <p className="sm:col-span-2 rounded-lg border border-line bg-sand/40 px-3 py-2 text-sm text-ink">
            <strong>{service.title}</strong> · {formatDemoDateLabel(date)} at{" "}
            {time} (UK)
          </p>

          <label className="block text-sm font-semibold text-ink sm:col-span-2">
            What’s the name of your practice?
            <input
              name="practiceName"
              required
              minLength={2}
              className="input mt-1.5 w-full font-normal"
            />
          </label>

          <label className="block text-sm font-semibold text-ink">
            Are you currently a HydraTax customer?
            <select name="isCustomer" required className="input mt-1.5 w-full font-normal">
              <option value="no">No</option>
              <option value="yes">Yes</option>
              <option value="unsure">Not sure</option>
            </select>
          </label>

          <label className="block text-sm font-semibold text-ink">
            How many clients do you currently have?
            <select
              name="clientCount"
              required
              className="input mt-1.5 w-full font-normal"
              defaultValue="11–50"
            >
              {CLIENT_COUNT_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm font-semibold text-ink sm:col-span-2">
            Which software services do you currently use in your practice?
            <textarea
              name="currentSoftware"
              required
              minLength={2}
              rows={3}
              className="input mt-1.5 w-full resize-y font-normal"
              placeholder="e.g. Xero, Capium, FreeAgent, spreadsheets…"
            />
          </label>

          <label className="block text-sm font-semibold text-ink sm:col-span-2">
            Where did you hear about us?
            <select name="hearAbout" required className="input mt-1.5 w-full font-normal">
              {HEAR_ABOUT_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm font-semibold text-ink sm:col-span-2">
            Additional notes (optional)
            <textarea
              name="notes"
              rows={3}
              className="input mt-1.5 w-full resize-y font-normal"
              placeholder="Modules you care about, migration timing…"
            />
          </label>

          {state && !state.ok ? (
            <p
              className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger sm:col-span-2"
              role="alert"
            >
              {state.message}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setStep("schedule")}
              disabled={pending}
            >
              Back
            </button>
            <button
              type="submit"
              className="btn btn-primary disabled:opacity-60"
              disabled={pending}
            >
              {pending ? "Booking…" : "Book"}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
