"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  cancelMyAccountDeletion,
  exportMyData,
  requestAccountDeletion,
} from "@/server/actions/privacy";
import { downloadJson } from "@/lib/download-json";
import { FormErrorBanner } from "@/components/forms/form-error-banner";

export type PrivacyPanelProps = {
  email: string | null;
  /** Local demo desk: deletion is disabled. */
  local: boolean;
  graceDays: number;
  pending: { scheduledFor: string } | null;
  /** Practices that would be erased because you are the only member. */
  erasePractices: string[];
  /** Practices where you are the last owner but others remain. */
  blockedPractices: string[];
};

export function PrivacyDataPanel(props: PrivacyPanelProps) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [email, setEmail] = useState("");
  const [immediate, setImmediate] = useState(false);
  const [ackImmediate, setAckImmediate] = useState(false);

  const soleOwner = props.erasePractices.length > 0;
  const blocked = props.blockedPractices.length > 0;

  return (
    <div className="space-y-6">
      <div className="panel space-y-3 p-5">
        <h2 className="display text-2xl text-ink">Download my data</h2>
        <p className="text-sm text-ink-soft">
          A JSON file with your profile, practice membership, preferences,
          support tickets, feature requests, two-step verification settings
          (never secrets) and activity recorded about you. Client data is
          exported per client from each client&apos;s page.
        </p>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={() => {
            setError(null);
            setNotice(null);
            start(async () => {
              const res = await exportMyData();
              if (!res.ok) return setError(res.error);
              downloadJson(res.filename, res.json);
              setNotice("Your export has been downloaded.");
            });
          }}
        >
          {busy && !open ? "Preparing…" : "Download my data"}
        </button>
      </div>

      <FormErrorBanner error={error} />
      {notice ? <p className="text-sm text-ink-soft">{notice}</p> : null}

      {props.pending ? (
        <div className="panel space-y-3 border-danger/30 p-5">
          <h2 className="display text-2xl text-danger">
            Deletion scheduled
          </h2>
          <p className="text-sm text-ink-soft">
            Your account and practice data will be permanently erased on{" "}
            <span className="font-medium text-ink">
              {new Date(props.pending.scheduledFor).toLocaleString("en-GB")}
            </span>
            . You can cancel until then.
          </p>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => {
              setError(null);
              start(async () => {
                const res = await cancelMyAccountDeletion();
                if (!res.ok) return setError(res.error);
                router.refresh();
              });
            }}
          >
            Cancel deletion
          </button>
        </div>
      ) : (
        <div className="panel space-y-3 border-danger/25 p-5">
          <h2 className="display text-2xl text-ink">Delete my account</h2>
          <p className="text-sm text-ink-soft">
            Removes your login, profile and membership, anonymises feature
            requests and tickets you wrote, deletes two-step verification data
            and signs you out. Billing records and the pseudonymous filing
            audit trail are kept where the law requires (see the retention
            table in the Privacy Notice).
          </p>
          {blocked ? (
            <p className="text-sm text-danger">
              You are the only owner of {props.blockedPractices.join(", ")},
              which still has other team members. Remove them or transfer
              ownership (contact support) before deleting your account.
            </p>
          ) : null}
          {soleOwner ? (
            <p className="text-sm text-ink-soft">
              You are the only member of{" "}
              <span className="font-medium text-ink">
                {props.erasePractices.join(", ")}
              </span>
              , so its clients and all workspace data would be erased too. Your
              subscription is set to end at the close of the billing period.
              Download any client data you need first.
            </p>
          ) : null}
          {props.local ? (
            <p className="text-sm text-ink-soft">
              Account deletion is disabled on the local demo desk.
            </p>
          ) : !open ? (
            <button
              type="button"
              className="btn btn-secondary border-danger/40 text-danger hover:border-danger/60 hover:bg-danger/5"
              disabled={busy || blocked}
              onClick={() => setOpen(true)}
            >
              Delete my account…
            </button>
          ) : (
            <form
              className="space-y-3 rounded-xl border border-danger/30 bg-danger/5 p-4"
              onSubmit={(e) => {
                e.preventDefault();
                setError(null);
                start(async () => {
                  const res = await requestAccountDeletion({
                    confirmPhrase: phrase,
                    confirmEmail: email,
                    practiceData: immediate ? "immediate" : "schedule",
                    acknowledgeImmediate: ackImmediate,
                  });
                  if (!res.ok) return setError(res.error);
                  router.replace("/");
                  router.refresh();
                });
              }}
            >
              {soleOwner ? (
                <div className="space-y-2 text-sm text-ink-soft">
                  <label className="flex items-start gap-2">
                    <input
                      type="radio"
                      name="when"
                      checked={!immediate}
                      onChange={() => setImmediate(false)}
                    />
                    <span>
                      Erase after a {props.graceDays}-day grace period (you can
                      cancel with the link we email you).
                    </span>
                  </label>
                  <label className="flex items-start gap-2">
                    <input
                      type="radio"
                      name="when"
                      checked={immediate}
                      onChange={() => setImmediate(true)}
                    />
                    <span>Erase everything immediately.</span>
                  </label>
                  {immediate ? (
                    <label className="flex items-start gap-2 text-danger">
                      <input
                        type="checkbox"
                        checked={ackImmediate}
                        onChange={(e) => setAckImmediate(e.target.checked)}
                      />
                      <span>
                        I understand my practice and all client data will be
                        erased now and cannot be recovered.
                      </span>
                    </label>
                  ) : null}
                </div>
              ) : null}
              <label className="block text-sm">
                <span className="text-ink-soft">
                  Type your account email{props.email ? ` (${props.email})` : ""}
                </span>
                <input
                  className="input mt-1 w-full"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="off"
                />
              </label>
              <label className="block text-sm">
                <span className="text-ink-soft">
                  Type <strong>DELETE MY ACCOUNT</strong> to confirm
                </span>
                <input
                  className="input mt-1 w-full"
                  value={phrase}
                  onChange={(e) => setPhrase(e.target.value)}
                  autoComplete="off"
                />
              </label>
              <div className="flex gap-3">
                <button
                  type="submit"
                  className="btn btn-secondary border-danger/40 text-danger hover:border-danger/60 hover:bg-danger/5"
                  disabled={busy}
                >
                  {busy ? "Working…" : "Delete my account"}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={busy}
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
