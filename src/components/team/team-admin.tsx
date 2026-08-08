"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addTeamMember,
  actAsTeamMember,
  deactivateTeamMember,
  updateTeamMemberAccess,
} from "@/server/actions/team";
import {
  MODULE_ACCESS_OPTIONS,
  type ModuleAccess,
} from "@/lib/access";
import type { MemoryTeamMember } from "@/server/demo/store";

export function TeamAdmin({
  members,
  actingMemberId,
  isLocal,
}: {
  members: MemoryTeamMember[];
  actingMemberId: string | null;
  isLocal: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [access, setAccess] = useState<ModuleAccess>("payroll");

  return (
    <div className="space-y-8">
      <form
        className="panel space-y-4 p-6"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          setError(null);
          start(async () => {
            try {
              await addTeamMember({
                name: String(fd.get("name") ?? ""),
                email: String(fd.get("email") ?? ""),
                moduleAccess: access,
              });
              e.currentTarget.reset();
              setAccess("payroll");
              router.refresh();
            } catch (err) {
              setError(err instanceof Error ? err.message : "Failed");
            }
          });
        }}
      >
        <h2 className="display text-2xl text-ink">Add team member</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-semibold text-ink">
            Name
            <input name="name" required className="input mt-1.5 font-normal" />
          </label>
          <label className="block text-sm font-semibold text-ink">
            Email
            <input
              name="email"
              type="email"
              required
              className="input mt-1.5 font-normal"
            />
          </label>
        </div>
        <fieldset>
          <legend className="text-sm font-semibold text-ink">Access</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {MODULE_ACCESS_OPTIONS.filter((o) => o.value !== "full").map(
              (o) => (
                <label
                  key={o.value}
                  className={`cursor-pointer rounded-lg border p-3 text-sm ${
                    access === o.value
                      ? "border-sea bg-sea/5"
                      : "border-line"
                  }`}
                >
                  <input
                    type="radio"
                    className="sr-only"
                    name="moduleAccess"
                    checked={access === o.value}
                    onChange={() => setAccess(o.value)}
                  />
                  <span className="font-semibold text-ink">{o.label}</span>
                  <span className="mt-0.5 block text-ink-soft">{o.blurb}</span>
                </label>
              ),
            )}
          </div>
        </fieldset>
        {error && <p className="text-sm text-danger">{error}</p>}
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Adding…" : "Add member"}
        </button>
      </form>

      <div className="panel overflow-hidden">
        <div className="border-b border-line px-4 py-3">
          <h2 className="font-semibold text-ink">Team</h2>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="bg-sand/80 text-xs uppercase tracking-wide text-ink-soft">
            <tr>
              <th className="px-4 py-3">Member</th>
              <th className="px-4 py-3">Access</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {members.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-ink-soft">
                  No team members yet.
                </td>
              </tr>
            )}
            {members.map((m) => (
              <tr key={m.id}>
                <td className="px-4 py-3">
                  <p className="font-semibold text-ink">{m.name}</p>
                  <p className="text-xs text-ink-soft">{m.email}</p>
                </td>
                <td className="px-4 py-3">
                  <select
                    className="input py-1 text-xs"
                    disabled={!m.active || pending}
                    value={m.moduleAccess}
                    onChange={(e) =>
                      start(async () => {
                        await updateTeamMemberAccess(
                          m.id,
                          e.target.value as ModuleAccess,
                        );
                        router.refresh();
                      })
                    }
                  >
                    {MODULE_ACCESS_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`badge ${m.active ? "badge-ok" : "badge-muted"}`}
                  >
                    {m.active ? "active" : "off"}
                    {actingMemberId === m.id ? " · viewing" : ""}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    {isLocal && m.active && (
                      <button
                        type="button"
                        className="text-sm font-semibold text-sea"
                        disabled={pending}
                        onClick={() =>
                          start(async () => {
                            await actAsTeamMember(
                              actingMemberId === m.id ? null : m.id,
                            );
                            router.refresh();
                          })
                        }
                      >
                        {actingMemberId === m.id ? "Exit view" : "View as"}
                      </button>
                    )}
                    {m.active && (
                      <button
                        type="button"
                        className="text-sm font-semibold text-danger"
                        disabled={pending}
                        onClick={() =>
                          start(async () => {
                            await deactivateTeamMember(m.id);
                            router.refresh();
                          })
                        }
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isLocal && actingMemberId && (
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() =>
            start(async () => {
              await actAsTeamMember(null);
              router.refresh();
            })
          }
        >
          Back to owner account
        </button>
      )}
    </div>
  );
}
