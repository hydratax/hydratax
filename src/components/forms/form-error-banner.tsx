import { humanizeActionError } from "@/lib/action-error";

type FormErrorBannerProps = {
  error: string | null | undefined;
  className?: string;
  /** Override the default title (auth surface only). */
  title?: string;
  children?: React.ReactNode;
  /**
   * Desk UI never shows failure banners (`desk-ui-users.mdc`).
   * Only pass `surface="auth"` on sign-in / password / create-account screens.
   */
  surface?: "desk" | "auth";
};

/**
 * Desk: always silent (returns null).
 * Auth: high-visibility block when `surface="auth"`.
 */
export function FormErrorBanner({
  error,
  className = "",
  title = "Couldn’t continue",
  children,
  surface = "desk",
}: FormErrorBannerProps) {
  if (surface !== "auth") return null;
  if (!error && !children) return null;
  const text = error ? humanizeActionError(error) : null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={`form-error-banner ${className}`.trim()}
    >
      <span className="form-error-banner__icon" aria-hidden>
        !
      </span>
      <div className="min-w-0">
        <p className="form-error-banner__title">{title}</p>
        {text ? <p className="form-error-banner__body">{text}</p> : null}
        {children}
      </div>
    </div>
  );
}
