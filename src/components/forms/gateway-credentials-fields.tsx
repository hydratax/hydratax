"use client";

import { useEffect, useState, useTransition } from "react";
import {
  clearMyGatewayCredentials,
  getMyGatewayCredentials,
} from "@/server/actions/gateway-credentials";

type Props = {
  clientId: string;
  ggUserId: string;
  ggPassword: string;
  onUserIdChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  rememberPassword: boolean;
  onRememberPasswordChange: (value: boolean) => void;
  hasSavedPassword: boolean;
  onHasSavedPasswordChange: (value: boolean) => void;
  live?: boolean;
  hint?: string;
  disabled?: boolean;
};

/**
 * GG fields with per-user persistence.
 * Password is never loaded back from the server — only a "saved" flag.
 */
export function GatewayCredentialsFields({
  clientId,
  ggUserId,
  ggPassword,
  onUserIdChange,
  onPasswordChange,
  rememberPassword,
  onRememberPasswordChange,
  hasSavedPassword,
  onHasSavedPasswordChange,
  live = true,
  hint,
  disabled = false,
}: Props) {
  const [pending, start] = useTransition();
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getMyGatewayCredentials(clientId)
      .then((res) => {
        if (cancelled) return;
        if (res.senderId && !ggUserId.trim()) {
          onUserIdChange(res.senderId);
        }
        onHasSavedPasswordChange(res.hasSavedPassword);
        setLoaded(true);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : "Could not load saved ID");
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
    // Load once per client — do not re-run when typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional mount/clientId only
  }, [clientId]);

  const passwordOk = Boolean(ggPassword.trim()) || hasSavedPassword;
  const canSubmit = Boolean(ggUserId.trim()) && passwordOk;

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Government Gateway User ID</label>
          <input
            className="input mono"
            autoComplete="username"
            value={ggUserId}
            onChange={(e) => onUserIdChange(e.target.value)}
            placeholder={
              live ? "12-digit Sender ID (not email)" : "Test Sender ID"
            }
            disabled={disabled || pending}
            required={live}
          />
          <p className="mt-1 text-xs text-ink-soft">
            Saved to your account only for this client.
          </p>
        </div>
        <div>
          <label className="label">Government Gateway password</label>
          <input
            type="password"
            className="input"
            autoComplete="current-password"
            value={ggPassword}
            onChange={(e) => onPasswordChange(e.target.value)}
            placeholder={
              hasSavedPassword && !ggPassword
                ? "Using saved password — type to replace"
                : live
                  ? "Client or agent password"
                  : "Test password"
            }
            disabled={disabled || pending}
            required={live && !hasSavedPassword}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-line"
            checked={rememberPassword}
            onChange={(e) => onRememberPasswordChange(e.target.checked)}
            disabled={disabled || pending || !ggPassword.trim()}
          />
          Remember password on my account (encrypted)
        </label>
        {hasSavedPassword ? (
          <button
            type="button"
            className="text-xs font-semibold text-danger hover:underline disabled:opacity-50"
            disabled={disabled || pending}
            onClick={() =>
              start(async () => {
                try {
                  await clearMyGatewayCredentials(clientId);
                  onHasSavedPasswordChange(false);
                  onUserIdChange("");
                  onPasswordChange("");
                  onRememberPasswordChange(false);
                } catch (err) {
                  setLoadError(
                    err instanceof Error ? err.message : "Could not clear",
                  );
                }
              })
            }
          >
            Clear saved credentials
          </button>
        ) : null}
      </div>

      <p className="text-xs text-ink-soft">
        {hint ??
          "Only you can use these saved credentials — colleagues in the practice cannot see them. The password is never shown again after you save it."}
      </p>
      {loadError ? (
        <p className="text-xs text-danger">{loadError}</p>
      ) : null}
      {loaded && hasSavedPassword && !ggPassword ? (
        <p className="text-xs font-semibold text-sea">
          Saved password will be used for this submit.
        </p>
      ) : null}

      <span className="sr-only" data-gg-ready={canSubmit ? "1" : "0"} />
    </div>
  );
}

export function gatewayCredentialsReady(
  ggUserId: string,
  ggPassword: string,
  hasSavedPassword: boolean,
) {
  return Boolean(ggUserId.trim()) && (Boolean(ggPassword.trim()) || hasSavedPassword);
}
