import { humanizeActionError } from "@/lib/action-error";

type FormErrorBannerProps = {
  error: string | null | undefined;
  className?: string;
  /** Override the default “Couldn’t continue” title */
  title?: string;
  children?: React.ReactNode;
};

/**
 * High-visibility block for validation / action failures that stop the user.
 * Use anywhere a form cannot proceed until the issue is fixed.
 */
export function FormErrorBanner({
  error,
  className = "",
  title = "Couldn’t continue",
  children,
}: FormErrorBannerProps) {
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
