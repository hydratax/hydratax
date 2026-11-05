"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
  type ChangeEvent,
  type ReactNode,
} from "react";
import {
  recordFormOpened,
  submitOnboardingForm,
} from "@/server/actions/onboarding-forms";
import type {
  OnboardingField,
  OnboardingFormRecord,
} from "@/lib/onboarding-forms";
import { FormErrorBanner } from "@/components/forms/form-error-banner";

type UploadKind = "passport" | "address" | "bank" | "document";

function uploadKindFor(field: OnboardingField): UploadKind {
  const hay = `${field.label} ${field.helpText ?? ""} ${field.documentCategory ?? ""}`.toLowerCase();
  if (
    /passport|photo\s*id|driving|licence|license|identity|id\b|aml/.test(hay)
  ) {
    return "passport";
  }
  if (/address|utility|bill|proof of address|residence/.test(hay)) {
    return "address";
  }
  if (/bank|statement|csv|spreadsheet|cash book|invoice/.test(hay)) {
    return "bank";
  }
  return "document";
}

function UploadGlyph({ kind }: { kind: UploadKind }) {
  const common = {
    viewBox: "0 0 48 48",
    fill: "none",
    "aria-hidden": true as const,
    className: "h-11 w-11",
  };

  if (kind === "passport") {
    return (
      <svg {...common}>
        <rect
          x="10"
          y="6"
          width="28"
          height="36"
          rx="3"
          stroke="currentColor"
          strokeWidth="2"
        />
        <rect
          x="15"
          y="12"
          width="10"
          height="12"
          rx="1.5"
          stroke="currentColor"
          strokeWidth="2"
        />
        <path
          d="M28 14h8M28 19h8M28 24h6"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M15 32h18M15 37h12"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (kind === "address") {
    return (
      <svg {...common}>
        <path
          d="M8 22 L24 8 L40 22"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path
          d="M12 20 V38 H36 V20"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path
          d="M20 38 V26 H28 V38"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (kind === "bank") {
    return (
      <svg {...common}>
        <path
          d="M8 18 L24 8 L40 18"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path d="M10 18 H38" stroke="currentColor" strokeWidth="2" />
        <path
          d="M14 18 V34 M24 18 V34 M34 18 V34"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path d="M10 34 H38" stroke="currentColor" strokeWidth="2" />
        <path
          d="M8 38 H40"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <path
        d="M14 8 H28 L36 16 V40 H14 Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M28 8 V16 H36"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M19 24 H29 M19 30 H29 M19 36 H25"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function FileUploadCard({
  field,
  name,
}: {
  field: OnboardingField;
  name: string;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const kind = uploadKindFor(field);
  const acceptsImages = /\.jpe?g|\.png|\.webp|image\//i.test(
    field.accept ?? ".pdf,.jpg,.jpeg,.png,.webp",
  );
  const accept =
    field.accept ?? ".pdf,.jpg,.jpeg,.png,.webp,.csv,.xls,.xlsx";

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setFileName(file?.name ?? null);
  };

  const openPicker = (mode: "camera" | "library") => {
    const input = inputRef.current;
    if (!input) return;
    if (mode === "camera" && acceptsImages) {
      input.setAttribute("capture", "environment");
      input.accept = "image/*";
    } else {
      input.removeAttribute("capture");
      input.accept = accept;
    }
    input.value = "";
    input.click();
  };

  return (
    <div
      className={[
        "group relative flex flex-col gap-3 rounded-2xl border-2 border-dashed p-4 transition",
        "border-line bg-paper/70 hover:border-sea/60 hover:bg-sea/5",
        fileName ? "border-solid border-sea/50 bg-sea/5" : "",
      ].join(" ")}
    >
      <input
        ref={inputRef}
        id={inputId}
        className="absolute h-px w-px opacity-0"
        type="file"
        name={name}
        required={field.required}
        accept={accept}
        onChange={onChange}
        tabIndex={-1}
      />
      <div className="flex items-start gap-3">
        <span
          className={[
            "flex h-14 w-14 shrink-0 items-center justify-center rounded-xl",
            "bg-sea/10 text-sea",
          ].join(" ")}
        >
          <UploadGlyph kind={kind} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-ink">
            {field.label}
            {field.required ? (
              <span className="text-sea" aria-hidden>
                {" "}
                *
              </span>
            ) : null}
          </span>
          {field.helpText ? (
            <span className="mt-1 block text-xs leading-relaxed text-ink-soft">
              {field.helpText}
            </span>
          ) : (
            <span className="mt-1 block text-xs text-ink-soft">
              Take a photo or choose a file — photos are saved as PDF on your
              client file.
            </span>
          )}
          {fileName ? (
            <span className="mt-1.5 block truncate text-xs font-medium text-ink">
              Selected: {fileName}
            </span>
          ) : null}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {acceptsImages ? (
          <button
            type="button"
            className="btn btn-primary text-xs"
            onClick={() => openPicker("camera")}
          >
            Take photo
          </button>
        ) : null}
        <button
          type="button"
          className="btn btn-secondary text-xs"
          onClick={() => openPicker("library")}
        >
          {fileName ? "Change file" : "Choose file"}
        </button>
      </div>
    </div>
  );
}

function FieldControl({ field }: { field: OnboardingField }) {
  const name =
    field.type === "file" ? `file_${field.id}` : `field_${field.id}`;

  if (field.type === "file") {
    return <FileUploadCard field={field} name={name} />;
  }

  if (field.type === "checkbox") {
    return (
      <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-line bg-paper/60 px-4 py-3.5 transition hover:border-sea/40">
        <input
          type="checkbox"
          name={name}
          required={field.required}
          className="mt-0.5 h-4 w-4 accent-[var(--sea)]"
        />
        <span className="text-sm text-ink">
          {field.label}
          {field.required ? " *" : ""}
        </span>
      </label>
    );
  }

  const control: ReactNode =
    field.type === "long_text" ? (
      <textarea
        className="input min-h-[5rem]"
        name={name}
        required={field.required}
      />
    ) : field.type === "select" ? (
      <select
        className="input"
        name={name}
        required={field.required}
        defaultValue=""
      >
        <option value="" disabled>
          Choose…
        </option>
        {(field.options ?? []).map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    ) : (
      <input
        className="input"
        type={
          field.type === "email"
            ? "email"
            : field.type === "phone"
              ? "tel"
              : field.type === "date"
                ? "date"
                : "text"
        }
        name={name}
        required={field.required}
      />
    );

  return (
    <label className="block space-y-1.5">
      <span className="label">
        {field.label}
        {field.required ? " *" : ""}
      </span>
      {field.helpText ? (
        <span className="block text-xs text-ink-soft">{field.helpText}</span>
      ) : null}
      {control}
    </label>
  );
}

/** Render fields; consecutive file uploads become a card grid. */
function FormBody({ fields }: { fields: OnboardingField[] }) {
  const blocks: ReactNode[] = [];
  let i = 0;
  while (i < fields.length) {
    const field = fields[i]!;
    if (field.type === "section") {
      blocks.push(
        <div key={field.id} className="border-t border-line pt-5 first:border-0 first:pt-0">
          <h3 className="display text-xl text-ink">{field.label}</h3>
        </div>,
      );
      i += 1;
      continue;
    }

    if (field.type === "file") {
      const group: OnboardingField[] = [];
      while (i < fields.length && fields[i]!.type === "file") {
        group.push(fields[i]!);
        i += 1;
      }
      blocks.push(
        <div
          key={`files-${group[0]!.id}`}
          className="grid gap-3 sm:grid-cols-1"
        >
          {group.map((f) => (
            <FieldControl key={f.id} field={f} />
          ))}
        </div>,
      );
      continue;
    }

    blocks.push(<FieldControl key={field.id} field={field} />);
    i += 1;
  }
  return <>{blocks}</>;
}

export function OnboardingFormFill({
  token,
  form,
  clientName,
}: {
  token: string;
  form: OnboardingFormRecord;
  clientName: string;
}) {
  const [done, setDone] = useState(form.status === "submitted");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (form.status === "sent") {
      void recordFormOpened(token);
    }
  }, [form.status, token]);

  if (done) {
    return (
      <div className="rounded-2xl border border-line bg-white/90 p-7 shadow-sm">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-sea/10 text-sea">
          <svg
            viewBox="0 0 24 24"
            className="h-6 w-6"
            fill="none"
            aria-hidden
          >
            <path
              d="M5 13 L10 18 L19 7"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <h2 className="display mt-4 text-2xl text-ink">Thank you</h2>
        <p className="mt-2 text-sm text-ink-soft">
          Your answers and documents for {clientName} are with your accountant.
        </p>
      </div>
    );
  }

  return (
    <form
      className="space-y-6 rounded-2xl border border-line bg-white/90 p-6 shadow-sm sm:p-7"
      onSubmit={(e) => {
        e.preventDefault();
        setErr(null);
        const fd = new FormData(e.currentTarget);
        fd.set("token", token);
        start(async () => {
          const res = await submitOnboardingForm(fd);
          if (!res.ok) {
            setErr(res.error);
            return;
          }
          setDone(true);
        });
      }}
    >
      <div>
        <h2 className="display text-2xl text-ink">{form.name}</h2>
        {form.description ? (
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            {form.description}
          </p>
        ) : null}
      </div>

      <FormBody fields={form.fields} />

      <FormErrorBanner error={err} />
      <button
        type="submit"
        className="btn btn-primary w-full sm:w-auto"
        disabled={pending}
      >
        {pending ? "Sending…" : "Submit to accountant"}
      </button>
    </form>
  );
}
