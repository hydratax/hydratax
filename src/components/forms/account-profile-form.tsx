"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateAccountProfile } from "@/server/actions/account";
import { FormErrorBanner } from "@/components/forms/form-error-banner";
import type { AccountProfile } from "@/server/actions/account";

export function AccountProfileForm({ profile }: { profile: AccountProfile }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  return (
    <form
      className="panel space-y-4 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setError(null);
        setSaved(false);
        start(async () => {
          try {
            await updateAccountProfile({
              firstName: String(fd.get("firstName") || ""),
              surname: String(fd.get("surname") || ""),
              practiceName: String(fd.get("practiceName") || ""),
            });
            setSaved(true);
            router.refresh();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Could not save");
          }
        });
      }}
    >
      <div>
        <h2 className="display text-2xl text-ink">Your details</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Signed in as {profile.email ?? "unknown"} · {profile.role} ·{" "}
          {profile.moduleAccess === "full"
            ? "full access"
            : profile.moduleAccess.replace("_", " ")}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="firstName">
            First name
          </label>
          <input
            id="firstName"
            name="firstName"
            className="input"
            required
            defaultValue={profile.firstName}
          />
        </div>
        <div>
          <label className="label" htmlFor="surname">
            Surname
          </label>
          <input
            id="surname"
            name="surname"
            className="input"
            required
            defaultValue={profile.surname}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="practiceName">
            Practice name
          </label>
          <input
            id="practiceName"
            name="practiceName"
            className="input"
            required
            defaultValue={profile.practiceName}
          />
        </div>
      </div>

      <FormErrorBanner error={error} />
      {saved ? (
        <p className="text-sm font-medium text-sea">Details saved.</p>
      ) : null}

      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Saving…" : "Save details"}
      </button>
    </form>
  );
}
