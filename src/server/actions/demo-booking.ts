"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { LEGAL_CONTACT_EMAIL, LEGAL_COMPANY } from "@/lib/legal";
import {
  CLIENT_COUNT_OPTIONS,
  DEMO_SERVICES,
  HEAR_ABOUT_OPTIONS,
  demoServiceById,
  formatDemoDateLabel,
  listBookableDates,
  listTimeSlots,
  londonDateKey,
} from "@/lib/demo-booking";
import { sendTransactionalEmail } from "@/server/email/transactional";

const guestEmailsSchema = z
  .string()
  .optional()
  .default("")
  .transform((raw) =>
    raw
      .split(/[,;\s]+/)
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  )
  .pipe(z.array(z.string().email()).max(10));

const bookingSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().min(7).max(40),
  guestEmails: guestEmailsSchema,
  serviceId: z.enum([
    "suite",
    "modules",
    "migration",
    "training",
    "onboarding",
  ]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  practiceName: z.string().trim().min(2).max(200),
  isCustomer: z.enum(["yes", "no", "unsure"]),
  clientCount: z.enum(CLIENT_COUNT_OPTIONS),
  currentSoftware: z.string().trim().min(2).max(500),
  hearAbout: z.enum(HEAR_ABOUT_OPTIONS),
  notes: z.string().trim().max(2000).optional().default(""),
  website: z.string().optional().default(""),
  formStartedAt: z.string().optional().default(""),
});

export type DemoBookingState = {
  ok: boolean;
  message: string;
  reference?: string;
};

const recentByKey = new Map<string, number[]>();
const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_MAX = 5;
const MIN_FILL_MS = 5_000;

/** In-process hold of booked slots (best-effort; email is source of truth). */
const bookedSlots = new Set<string>();

function prune(timestamps: number[], now: number) {
  return timestamps.filter((t) => now - t < RATE_WINDOW_MS);
}

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const next = prune(recentByKey.get(key) ?? [], now);
  if (next.length >= RATE_MAX) {
    recentByKey.set(key, next);
    return true;
  }
  next.push(now);
  recentByKey.set(key, next);
  return false;
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function makeReference() {
  const stamp = new Date()
    .toISOString()
    .replace(/[-:TZ.]/g, "")
    .slice(0, 12);
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `DEMO-${stamp}-${rand}`;
}

function slotKey(date: string, time: string, serviceId: string) {
  return `${date}|${time}|${serviceId}`;
}

export async function submitDemoBooking(
  _prev: DemoBookingState | null,
  formData: FormData,
): Promise<DemoBookingState> {
  const parsed = bookingSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    guestEmails: formData.get("guestEmails") ?? "",
    serviceId: formData.get("serviceId"),
    date: formData.get("date"),
    time: formData.get("time"),
    practiceName: formData.get("practiceName"),
    isCustomer: formData.get("isCustomer"),
    clientCount: formData.get("clientCount"),
    currentSoftware: formData.get("currentSoftware"),
    hearAbout: formData.get("hearAbout"),
    notes: formData.get("notes") ?? "",
    website: formData.get("website") ?? "",
    formStartedAt: formData.get("formStartedAt") ?? "",
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Check the form and try again.",
    };
  }

  const data = parsed.data;
  if (data.website.trim()) {
    return {
      ok: true,
      message: "Thanks — your demo request was received.",
      reference: makeReference(),
    };
  }

  const started = Number(data.formStartedAt);
  if (!Number.isFinite(started) || Date.now() - started < MIN_FILL_MS) {
    return {
      ok: false,
      message: "That was too quick — please take a moment and try again.",
    };
  }

  const service = demoServiceById(data.serviceId);
  if (!service) {
    return { ok: false, message: "Choose a demo type." };
  }

  const bookable = listBookableDates();
  if (!bookable.includes(data.date)) {
    return { ok: false, message: "That date is not available. Pick another day." };
  }
  const slots = listTimeSlots(service.durationMinutes);
  if (!slots.includes(data.time)) {
    return { ok: false, message: "That time is not available. Pick another slot." };
  }

  // Reject past slots for today (London calendar date).
  const todayKey = londonDateKey(new Date());
  if (data.date === todayKey) {
    const nowParts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date());
    const hh = nowParts.find((p) => p.type === "hour")?.value ?? "00";
    const mm = nowParts.find((p) => p.type === "minute")?.value ?? "00";
    if (`${hh}:${mm}` >= data.time) {
      return {
        ok: false,
        message: "That time has already passed. Choose a later slot.",
      };
    }
  }

  const key = slotKey(data.date, data.time, data.serviceId);
  if (bookedSlots.has(key)) {
    return {
      ok: false,
      message: "That slot was just taken. Please pick another time.",
    };
  }

  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "unknown";
  if (isRateLimited(`${ip}|${data.email.toLowerCase()}`)) {
    return {
      ok: false,
      message: "Too many demo requests. Please wait a while and try again.",
    };
  }

  const reference = makeReference();
  const whenLabel = `${formatDemoDateLabel(data.date)} at ${data.time} (UK time)`;
  const guests =
    data.guestEmails.length > 0 ? data.guestEmails.join(", ") : "None";

  const staffText = `HydraTax demo booking ${reference}

Service: ${service.title} (${service.durationMinutes} min)
When: ${whenLabel}
Name: ${data.name}
Email: ${data.email}
Phone: ${data.phone}
Guests: ${guests}
Practice: ${data.practiceName}
Existing customer: ${data.isCustomer}
Client count: ${data.clientCount}
Current software: ${data.currentSoftware}
Heard about us: ${data.hearAbout}
Notes: ${data.notes || "—"}
IP: ${ip}
`;

  const staffHtml = `<!DOCTYPE html>
<html><body style="font-family:Georgia,serif;color:#0a0a0a;line-height:1.5;max-width:560px;margin:0 auto;padding:24px;">
  <p style="font-size:13px;letter-spacing:0.12em;text-transform:uppercase;color:#0f766e;font-weight:700;">${LEGAL_COMPANY.tradingName} · Demo</p>
  <h1 style="font-size:22px;margin:8px 0 16px;">${escapeHtml(reference)}</h1>
  <p><strong>Service:</strong> ${escapeHtml(service.title)} (${service.durationMinutes} min)<br/>
  <strong>When:</strong> ${escapeHtml(whenLabel)}<br/>
  <strong>Name:</strong> ${escapeHtml(data.name)}<br/>
  <strong>Email:</strong> <a href="mailto:${escapeHtml(data.email)}">${escapeHtml(data.email)}</a><br/>
  <strong>Phone:</strong> ${escapeHtml(data.phone)}<br/>
  <strong>Guests:</strong> ${escapeHtml(guests)}<br/>
  <strong>Practice:</strong> ${escapeHtml(data.practiceName)}<br/>
  <strong>Existing customer:</strong> ${escapeHtml(data.isCustomer)}<br/>
  <strong>Clients:</strong> ${escapeHtml(data.clientCount)}<br/>
  <strong>Software today:</strong> ${escapeHtml(data.currentSoftware)}<br/>
  <strong>Heard about us:</strong> ${escapeHtml(data.hearAbout)}</p>
  <div style="white-space:pre-wrap;border-top:1px solid #d0d7dd;padding-top:16px;margin-top:16px;">${escapeHtml(data.notes || "No additional notes.")}</div>
</body></html>`;

  const confirmText = `Hi ${data.name.split(" ")[0]},

Thanks for booking a HydraTax demo (${reference}).

${service.title}
${whenLabel}

We'll confirm the meeting link by reply to this email${
    data.guestEmails.length ? " (and your guests)" : ""
  }.

If you need to change the time, reply to this message.

— HydraTax
`;

  const confirmHtml = `<!DOCTYPE html>
<html><body style="font-family:Georgia,serif;color:#0a0a0a;line-height:1.5;max-width:560px;margin:0 auto;padding:24px;">
  <p style="font-size:13px;letter-spacing:0.12em;text-transform:uppercase;color:#0f766e;font-weight:700;">HydraTax</p>
  <h1 style="font-size:22px;margin:8px 0 16px;">Demo booked</h1>
  <p>Hi ${escapeHtml(data.name.split(" ")[0])},</p>
  <p>Thanks for booking a HydraTax demo (<strong>${escapeHtml(reference)}</strong>).</p>
  <p><strong>${escapeHtml(service.title)}</strong><br/>${escapeHtml(whenLabel)}</p>
  <p>We'll confirm the meeting link by reply to this email${
    data.guestEmails.length ? " (and your guests)" : ""
  }.</p>
  <p style="color:#3a4248;font-size:14px;">Need to change the time? Just reply to this message.</p>
</body></html>`;

  try {
    await sendTransactionalEmail({
      to: LEGAL_CONTACT_EMAIL,
      replyTo: data.email,
      subject: `[HydraTax demo ${reference}] ${service.title} — ${data.practiceName}`,
      text: staffText,
      html: staffHtml,
    });

    const confirmTo = [data.email, ...data.guestEmails];
    await sendTransactionalEmail({
      to: confirmTo,
      replyTo: LEGAL_CONTACT_EMAIL,
      subject: `HydraTax demo confirmed — ${whenLabel}`,
      text: confirmText,
      html: confirmHtml,
    });

    bookedSlots.add(key);

    return {
      ok: true,
      reference,
      message: `Demo booked for ${whenLabel}. Confirmation sent to ${data.email}. Reference ${reference}.`,
    };
  } catch (err) {
    return {
      ok: false,
      message:
        err instanceof Error
          ? err.message
          : "Could not book right now. Please try again shortly.",
    };
  }
}

export async function getDemoServices() {
  return DEMO_SERVICES;
}
