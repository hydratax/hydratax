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
  firstName: z.string().min(1).max(80),
  surname: z.string().min(1).max(80),
  email: z.string().email(),
  password: z.string().min(8).max(200),
  confirmPassword: z.string().min(8).max(200),
  startTrial: z.boolean().optional(),
});

const signInSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function startLocalPracticeTrial(practiceId: string) {
  return startPracticeTrial(practiceId);
}

export async function signUpWithSupabase(input: z.infer<typeof signUpSchema>) {
  const data = signUpSchema.parse(input);
  if (data.password !== data.confirmPassword) {
    throw new Error("Passwords do not match");
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
    return { ok: true as const, redirectTo: "/dashboard" };
  }

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

  if (error) throw new Error(error.message);
  if (!authData.session) {
    return { ok: true as const, redirectTo: "/sign-in?confirm=1" };
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

  return { ok: true as const, redirectTo: "/dashboard" };
}

export async function signInWithSupabase(input: z.infer<typeof signInSchema>) {
  const data = signInSchema.parse(input);

  if (!isSupabaseConfigured()) {
    // Local desk without Supabase
    return { ok: true as const, redirectTo: "/dashboard" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: data.email,
    password: data.password,
  });
  if (error) throw new Error(error.message);
  return { ok: true as const, redirectTo: "/dashboard" };
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
