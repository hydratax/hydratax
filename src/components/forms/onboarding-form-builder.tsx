"use client";

import { useMemo, useState, useTransition } from "react";
import {
  createOnboardingForm,
  deleteOnboardingForm,
  publishOnboardingForm,
  saveOnboardingForm,
} from "@/server/actions/onboarding-forms";
import {
  createEmptyField,
  FIELD_TYPE_LABELS,
  reorderFields,
  type OnboardingField,
  type OnboardingFieldType,
  type OnboardingFormRecord,
} from "@/lib/onboarding-forms";
import { messageFromUnknown } from "@/lib/action-error";
import { FormErrorBanner } from "@/components/forms/form-error-banner";

const PALETTE: OnboardingFieldType[] = [
  "section",
  "short_text",
  "long_text",
  "email",
  "phone",
  "date",
  "select",
  "checkbox",
  "file",
];

export function OnboardingFormBuilder({
  clientId,
  initialForms,
}: {
  clientId: string;
  initialForms: OnboardingFormRecord[];
}) {
  const [forms, setForms] = useState(initialForms);
  const [activeId, setActiveId] = useState<string | null>(
    initialForms[0]?.id ?? null,
  );
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const active = useMemo(
    () => forms.find((f) => f.id === activeId) ?? null,
    [forms, activeId],
  );

  function patchActive(patch: Partial<OnboardingFormRecord>) {
    if (!active) return;
    setForms((prev) =>
      prev.map((f) => (f.id === active.id ? { ...f, ...patch } : f)),
    );
  }

  function patchField(fieldId: string, patch: Partial<OnboardingField>) {
    if (!active) return;
    patchActive({
      fields: active.fields.map((f) =>
        f.id === fieldId ? { ...f, ...patch } : f,
      ),
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="display text-3xl text-ink">Onboarding forms</h1>
          <p className="mt-2 max-w-2xl text-sm text-ink-soft">
            Drag fields to build a custom intake form. Generate a link for this
            client — when they submit, answers and uploads land on their file.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          disabled={pending}
          onClick={() => {
            setErr(null);
            start(async () => {
              try {
                const form = await createOnboardingForm({
                  clientId,
                  useDefaultFields: true,
                });
                setForms((prev) => [...prev, form]);
                setActiveId(form.id);
                setMsg("Starter onboarding form created.");
              } catch (error) {
                setErr(messageFromUnknown(error, "Could not create form"));
              }
            });
          }}
        >
          New form
        </button>
      </div>

      <FormErrorBanner error={err} />
      {msg && <p className="text-sm text-ok">{msg}</p>}

      {forms.length === 0 ? (
        <div className="panel p-6 text-sm text-ink-soft">
          No forms yet. Create one to start collecting ID, bank statements, and
          onboarding details from the client.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[14rem_minmax(0,1fr)]">
          <aside className="panel space-y-1 p-3">
            {forms.map((f) => (
              <button
                key={f.id}
                type="button"
                className={`block w-full rounded-md px-3 py-2 text-left text-sm font-semibold ${
                  f.id === activeId
                    ? "bg-sea/10 text-sea"
                    : "text-ink-soft hover:bg-sand hover:text-ink"
                }`}
                onClick={() => setActiveId(f.id)}
              >
                <span className="block truncate">{f.name}</span>
                <span className="text-xs font-normal capitalize opacity-70">
                  {f.status}
                </span>
              </button>
            ))}
          </aside>

          {active ? (
            <div className="space-y-4">
              <div className="panel space-y-3 p-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="label">Form name</span>
                    <input
                      className="input mt-1"
                      value={active.name}
                      disabled={active.status === "submitted"}
                      onChange={(e) => patchActive({ name: e.target.value })}
                    />
                  </label>
                  <label className="block">
                    <span className="label">Status</span>
                    <p className="mt-2 text-sm capitalize text-ink-soft">
                      {active.status}
                      {active.submittedAt
                        ? ` · ${new Date(active.submittedAt).toLocaleString("en-GB")}`
                        : ""}
                    </p>
                  </label>
                </div>
                <label className="block">
                  <span className="label">Intro for the client</span>
                  <textarea
                    className="input mt-1 min-h-[4rem]"
                    value={active.description}
                    disabled={active.status === "submitted"}
                    onChange={(e) =>
                      patchActive({ description: e.target.value })
                    }
                  />
                </label>
                {active.status !== "draft" && (
                  <p className="break-all text-sm">
                    Client link:{" "}
                    <a
                      className="font-semibold text-sea"
                      href={`${origin}/forms/${active.token}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {origin}/forms/{active.token}
                    </a>
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  {active.status !== "submitted" && (
                    <>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={pending}
                        onClick={() => {
                          setErr(null);
                          start(async () => {
                            try {
                              const saved = await saveOnboardingForm({
                                clientId,
                                formId: active.id,
                                name: active.name,
                                description: active.description,
                                fields: active.fields,
                              });
                              setForms((prev) =>
                                prev.map((f) =>
                                  f.id === saved.id ? saved : f,
                                ),
                              );
                              setMsg("Form saved.");
                            } catch (error) {
                              setErr(
                                messageFromUnknown(error, "Could not save"),
                              );
                            }
                          });
                        }}
                      >
                        Save draft
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={pending}
                        onClick={() => {
                          setErr(null);
                          start(async () => {
                            try {
                              await saveOnboardingForm({
                                clientId,
                                formId: active.id,
                                name: active.name,
                                description: active.description,
                                fields: active.fields,
                              });
                              const published = await publishOnboardingForm({
                                clientId,
                                formId: active.id,
                              });
                              setForms((prev) =>
                                prev.map((f) =>
                                  f.id === published.id ? published : f,
                                ),
                              );
                              setMsg(
                                "Link ready — copy it from above and send to the client.",
                              );
                            } catch (error) {
                              setErr(
                                messageFromUnknown(
                                  error,
                                  "Could not publish link",
                                ),
                              );
                            }
                          });
                        }}
                      >
                        Save &amp; get client link
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    className="btn btn-secondary text-danger"
                    disabled={pending}
                    onClick={() => {
                      if (!window.confirm("Delete this form?")) return;
                      setErr(null);
                      start(async () => {
                        try {
                          await deleteOnboardingForm({
                            clientId,
                            formId: active.id,
                          });
                          setForms((prev) => {
                            const next = prev.filter((f) => f.id !== active.id);
                            setActiveId(next[0]?.id ?? null);
                            return next;
                          });
                          setMsg("Form deleted.");
                        } catch (error) {
                          setErr(
                            messageFromUnknown(error, "Could not delete"),
                          );
                        }
                      });
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>

              {active.status !== "submitted" ? (
                <div className="grid gap-4 lg:grid-cols-[11rem_minmax(0,1fr)]">
                  <div className="panel p-3">
                    <p className="mb-2 text-xs font-bold uppercase text-ink-soft">
                      Add field
                    </p>
                    <div className="space-y-1">
                      {PALETTE.map((type) => (
                        <button
                          key={type}
                          type="button"
                          className="block w-full rounded-md px-2 py-1.5 text-left text-sm text-ink-soft hover:bg-sand hover:text-ink"
                          onClick={() =>
                            patchActive({
                              fields: [
                                ...active.fields,
                                createEmptyField(type),
                              ],
                            })
                          }
                        >
                          + {FIELD_TYPE_LABELS[type]}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    {active.fields.length === 0 ? (
                      <p className="panel p-5 text-sm text-ink-soft">
                        Add fields from the left, then drag to reorder.
                      </p>
                    ) : (
                      active.fields.map((field, index) => (
                        <div
                          key={field.id}
                          draggable
                          onDragStart={() => setDragIndex(index)}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={() => {
                            if (dragIndex == null) return;
                            patchActive({
                              fields: reorderFields(
                                active.fields,
                                dragIndex,
                                index,
                              ),
                            });
                            setDragIndex(null);
                          }}
                          className="panel gloss-card cursor-grab space-y-2 p-4 active:cursor-grabbing"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-xs font-bold uppercase text-ink-soft">
                              ⋮⋮ {FIELD_TYPE_LABELS[field.type]}
                            </p>
                            <button
                              type="button"
                              className="text-xs font-semibold text-danger"
                              onClick={() =>
                                patchActive({
                                  fields: active.fields.filter(
                                    (f) => f.id !== field.id,
                                  ),
                                })
                              }
                            >
                              Remove
                            </button>
                          </div>
                          {field.type === "section" ? (
                            <input
                              className="input"
                              value={field.label}
                              onChange={(e) =>
                                patchField(field.id, { label: e.target.value })
                              }
                              placeholder="Section heading"
                            />
                          ) : (
                            <>
                              <input
                                className="input"
                                value={field.label}
                                onChange={(e) =>
                                  patchField(field.id, {
                                    label: e.target.value,
                                  })
                                }
                                placeholder="Question label"
                              />
                              <input
                                className="input text-sm"
                                value={field.helpText ?? ""}
                                onChange={(e) =>
                                  patchField(field.id, {
                                    helpText: e.target.value,
                                  })
                                }
                                placeholder="Help text (optional)"
                              />
                              <label className="flex items-center gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  checked={Boolean(field.required)}
                                  onChange={(e) =>
                                    patchField(field.id, {
                                      required: e.target.checked,
                                    })
                                  }
                                />
                                Required
                              </label>
                              {field.type === "select" && (
                                <textarea
                                  className="input min-h-[4rem] text-sm"
                                  value={(field.options ?? []).join("\n")}
                                  onChange={(e) =>
                                    patchField(field.id, {
                                      options: e.target.value
                                        .split("\n")
                                        .map((s) => s.trim())
                                        .filter(Boolean),
                                    })
                                  }
                                  placeholder="One option per line"
                                />
                              )}
                              {field.type === "file" && (
                                <select
                                  className="input text-sm"
                                  value={field.documentCategory ?? "general"}
                                  onChange={(e) =>
                                    patchField(field.id, {
                                      documentCategory: e.target
                                        .value as OnboardingField["documentCategory"],
                                    })
                                  }
                                >
                                  <option value="general">
                                    File category: General
                                  </option>
                                  <option value="accounts">Accounts / bank</option>
                                  <option value="vat">VAT</option>
                                  <option value="payroll">Payroll</option>
                                  <option value="corporation_tax">
                                    Corporation tax
                                  </option>
                                  <option value="self_assessment">
                                    Self Assessment
                                  </option>
                                  <option value="companies_house">
                                    Companies House
                                  </option>
                                </select>
                              )}
                            </>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ) : (
                <div className="panel space-y-4 p-5">
                  <h2 className="display text-xl text-ink">Submission</h2>
                  <dl className="space-y-2 text-sm">
                    {active.fields
                      .filter((f) => f.type !== "section")
                      .map((f) => (
                        <div
                          key={f.id}
                          className="flex flex-wrap justify-between gap-2 border-b border-line py-2"
                        >
                          <dt className="text-ink-soft">{f.label}</dt>
                          <dd className="font-medium text-ink">
                            {f.type === "checkbox"
                              ? active.answers?.[f.id]
                                ? "Yes"
                                : "No"
                              : String(active.answers?.[f.id] ?? "—")}
                          </dd>
                        </div>
                      ))}
                  </dl>
                  {(active.uploads?.length ?? 0) > 0 && (
                    <div>
                      <p className="text-xs font-bold uppercase text-ink-soft">
                        Uploaded files
                      </p>
                      <ul className="mt-2 space-y-1 text-sm">
                        {active.uploads!.map((u) => (
                          <li key={`${u.documentId}-${u.uploadedAt}`}>
                            {u.filename}
                          </li>
                        ))}
                      </ul>
                      <p className="mt-2 text-xs text-ink-soft">
                        Files are on the Documents tab for this client.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
