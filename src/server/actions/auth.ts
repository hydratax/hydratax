"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isMemoryStore, isSupabaseConfigured, isStripeConfigured } from "@/lib/env";
import { memoryStore } from "@/server/demo/store";
import { startPracticeTrial } from "@/server/billing/start-practice-trial";

const signUpSchema = z.object({
  orgType: z.enum(["company", "sole_trader", "partnership", "practice"]),
  orgSearch: z.string().max(200).optional(),
  companyNumber: z.string().max(20).optional(),
  firstName: z.string().min(1, "Enter your first name").max(80),
  surname: z.string().min(1, "Enter your surname").max(80),
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
  confirmPassword: z.string().min(8).max(200),
  startTrial: z.boolean().optional(),
});

const signInSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});

export type AuthActionResult =
  | { ok: true; redirectTo: string }
  | { ok: false; error: string };

function firstZodMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Check the form and try again.";
}

function startLocalPracticeTrial(practiceId: string) {
  return startPracticeTrial(practiceId);
}

export async function signUpWithSupabase(
  input: z.infer<typeof signUpSchema>,
): Promise<AuthActionResult> {
  const parsed = signUpSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: firstZodMessage(parsed.error) };
  }
  const data = parsed.data;
  if (data.password !== data.confirmPassword) {
    return { ok: false, error: "Passwords do not match" };
  }

  if (!isSupabaseConfigured()) {
    // Local fallback so the button always works without cloud keys
    memoryStore.accountProfile = {
      orgType: data.orgType,
      orgSearch: data.orgSearch?.trim() ?? "",
      firstName: data.firstName,
      createdAt: new Date().toISOString(),
    };
    memoryStore.practice.name =
      data.orgSearch?.trim() ||
      `${data.firstName} ${data.surname}${
        data.orgType === "practice" ? " Practice" : ""
      }`;
    if (!isStripeConfigured() && data.startTrial) {
      await startLocalPracticeTrial(memoryStore.practice.id);
    }
    return { ok: true, redirectTo: "/dashboard" };
  }

  try {
    const supabase = await createClient();
    const { data: authData, error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: {
          org_type: data.orgType,
          org_search: data.orgSearch ?? "",
          company_number: data.companyNumber ?? "",
          first_name: data.firstName,
          surname: data.surname,
          start_trial: data.startTrial ? "1" : "0",
        },
        emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/auth/callback`,
      },
    });

    if (error) {
      return { ok: false, error: friendlyAuthMessage(error.message) };
    }
    if (!authData.session) {
      return { ok: true, redirectTo: "/sign-in?confirm=1" };
    }

    // Provision practice row; free trial only starts via Practice/Custom checkout
    try {
      const { ensureSupabasePractice } = await import(
        "@/server/auth/ensure-practice"
      );
      await ensureSupabasePractice(authData.user!);
    } catch {
      /* practice seeded on first dashboard visit */
    }

    return { ok: true, redirectTo: "/dashboard" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Could not create account";
    return { ok: false, error: friendlyAuthMessage(msg) };
  }
}

export async function signInWithSupabase(
  input: z.infer<typeof signInSchema>,
): Promise<AuthActionResult> {
  const parsed = signInSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: firstZodMessage(parsed.error) };
  }
  const data = parsed.data;

  if (!isSupabaseConfigured()) {
    // Local desk without Supabase
    return { ok: true, redirectTo: "/dashboard" };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });
    if (error) {
      return { ok: false, error: friendlyAuthMessage(error.message) };
    }
    return { ok: true, redirectTo: "/dashboard" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Sign in failed";
    return { ok: false, error: friendlyAuthMessage(msg) };
  }
}

function friendlyAuthMessage(raw: string): string {
  const m = raw.toLowerCase();
  if (m.includes("invalid login") || m.includes("invalid credentials")) {
    return "Email or password is incorrect.";
  }
  if (m.includes("email not confirmed") || m.includes("not confirmed")) {
    return "Confirm your email from the link we sent, then sign in again.";
  }
  if (m.includes("already registered") || m.includes("already been registered")) {
    return "An account with this email already exists. Sign in instead.";
  }
  if (m.includes("rate limit") || m.includes("too many")) {
    return "Too many attempts. Wait a minute and try again.";
  }
  if (m.includes("password")) {
    return raw;
  }
  return raw || "Something went wrong. Please try again.";
}

export async function signOutSupabase() {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/");
}

export async function getSupabaseSessionUser() {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}

export async function authMode() {
  if (isSupabaseConfigured()) return "supabase" as const;
  if (isMemoryStore()) return "local" as const;
  return "local" as const;
}
