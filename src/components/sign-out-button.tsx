"use client";

import { useTransition } from "react";
import { signOutSupabase } from "@/server/actions/auth";

export function SignOutButton({ className }: { className?: string }) {
  const [pending, start] = useTransition();

  return (
    <button
      type="button"
      className={className ?? "btn btn-secondary text-sm"}
      disabled={pending}
      onClick={() => {
        start(async () => {
          await signOutSupabase();
        });
      }}
    >
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
