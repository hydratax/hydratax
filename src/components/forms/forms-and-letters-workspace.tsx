"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  createOnboardingForm,
  deleteOnboardingForm,
  publishOnboardingForm,
  saveOnboardingForm,
} from "@/server/actions/onboarding-forms";
import {
  createClientLetter,
  deleteClientLetter,
  markClientLetterSent,
  saveClientLetter,
} from "@/server/actions/client-letters";
import { LETTER_TEMPLATES } from "@/lib/letter-templates";
import { STANDARD_FORMS } from "@/lib/standard-forms";
import {
  createEmptyField,
  FIELD_TYPE_LABELS,
  reorderFields,
  type OnboardingField,
  type OnboardingFieldType,
  type OnboardingFormRecord,
} from "@/lib/onboarding-forms";
import type { ClientLetterRecord, PracticeLetterhead } from "@/lib/desk-profile";
import { messageFromUnknown } from "@/lib/action-error";
import { FormErrorBanner } from "@/components/forms/form-error-banner";
import { EmailToClientButton } from "@/components/forms/email-to-client-button";

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

function ActivityList({
  items,
}: {
  items?: Array<{ at: string; kind: string; note?: string }>;
}) {
  if (!items?.length) {
    return <p className="text-xs text-ink-soft">No activity yet.</p>;
  }
  return (
    <ul className="mt-2 space-y-1 text-xs text-ink-soft">
      {[...items].reverse().slice(0, 12).map((a, i) => (
        <li key={`${a.at}-${i}`}>
          <span className="font-semibold capitalize text-ink">{a.kind}</span>
          {" · "}
          {new Date(a.at).toLocaleString("en-GB")}
          {a.note ? ` — ${a.note}` : ""}
        </li>
      ))}
    </ul>
  );
}

function LetterPreview({
  letterhead,
  body,
}: {
  letterhead: PracticeLetterhead;
  body: string;
}) {
  return (
    <div className="rounded-lg border border-line bg-white p-6 text-sm text-ink shadow-sm">
      <div className="border-b border-line pb-4">
        {letterhead.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={letterhead.logoUrl}
            alt=""
            className="mb-3 h-12 object-contain"
          />
        ) : null}
        <p className="display text-xl text-ink">{letterhead.practiceName}</p>
        {letterhead.addressLines.map((line) => (
          <p key={line} className="text-ink-soft">
            {line}
          </p>
        ))}
        <p className="mt-1 text-xs text-ink-soft">
          {[letterhead.phone, letterhead.email, letterhead.website]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      <pre className="mt-5 whitespace-pre-wrap font-sans leading-relaxed">
        {body}
      </pre>
      {letterhead.footerLines.length > 0 ? (
        <div className="mt-8 border-t border-line pt-3 text-xs text-ink-soft">
          {letterhead.footerLines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function FormsAndLettersWorkspace({
  clientId,
  clientSlug,
  contactEmail,
  initialForms,
  initialLetters,
  letterhead,
}: {
  clientId: string;
  clientSlug: string;
  contactEmail?: string | null;
  initialForms: OnboardingFormRecord[];
  initialLetters: ClientLetterRecord[];
  letterhead: PracticeLetterhead;
}) {
  const [tab, setTab] = useState<"forms" | "letters">("forms");
  const [forms, setForms] = useState(initialForms);
  const [letters, setLetters] = useState(initialLetters);
  const [activeFormId, setActiveFormId] = useState<string | null>(
    initialForms[0]?.id ?? null,
  );
  const [activeLetterId, setActiveLetterId] = useState<string | null>(
    initialLetters[0]?.id ?? null,
  );
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [origin, setOrigin] = useState("");
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const activeForm = useMemo(
    () => forms.find((f) => f.id === activeFormId) ?? null,
    [forms, activeFormId],
  );
  const activeLetter = useMemo(
    () => letters.find((l) => l.id === activeLetterId) ?? null,
    [letters, activeLetterId],
  );

  function patchForm(patch: Partial<OnboardingFormRecord>) {
    if (!activeForm) return;
    setForms((prev) =>
      prev.map((f) => (f.id === activeForm.id ? { ...f, ...patch } : f)),
    );
  }

  function patchField(fieldId: string, patch: Partial<OnboardingField>) {
    if (!activeForm) return;
    patchForm({
      fields: activeForm.fields.map((f) =>
        f.id === fieldId ? { ...f, ...patch } : f,
      ),
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="display text-3xl text-ink">Forms and letters</h1>
          <p className="mt-2 max-w-2xl text-sm text-ink-soft">
            Standard intake forms ship with every client — amend then send a
            link. Formal UK letters use your practice letterhead. Activity
            (sent, opened, submitted) is logged on each item.
          </p>
        </div>
        <Link
          href="/settings/letterhead"
          className="btn btn-secondary text-sm"
        >
          Edit letterhead
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={`rounded-md px-3 py-1.5 text-sm font-semibold ${
            tab === "forms" ? "bg-ink text-white" : "bg-sand text-ink-soft"
          }`}
          onClick={() => setTab("forms")}
        >
          Forms
        </button>
        <button
          type="button"
          className={`rounded-md px-3 py-1.5 text-sm font-semibold ${
            tab === "letters" ? "bg-ink text-white" : "bg-sand text-ink-soft"
          }`}
          onClick={() => setTab("letters")}
        >
          Letters
        </button>
      </div>

      <FormErrorBanner error={err} />
      {msg && <p className="text-sm text-ok">{msg}</p>}

      {tab === "forms" ? (
        <div className="grid gap-4 lg:grid-cols-[14rem_minmax(0,1fr)]">
          <aside className="panel space-y-2 p-3">
            <p className="px-2 text-xs font-bold uppercase text-ink-soft">
              Forms
            </p>
            {forms.map((f) => (
              <button
                key={f.id}
                type="button"
                className={`block w-full rounded-md px-3 py-2 text-left text-sm font-semibold ${
                  f.id === activeFormId
                    ? "bg-sea/10 text-sea"
                    : "text-ink-soft hover:bg-sand hover:text-ink"
                }`}
                onClick={() => setActiveFormId(f.id)}
              >
                <span className="block truncate">{f.name}</span>
                <span className="text-xs font-normal capitalize opacity-70">
                  {f.status}
                  {f.openedAt ? " · opened" : ""}
                </span>
              </button>
            ))}
            <div className="border-t border-line pt-2">
              <p className="mb-1 px-2 text-xs font-bold uppercase text-ink-soft">
                Add from template
              </p>
              {STANDARD_FORMS.map((tpl) => (
                <button
                  key={tpl.key}
                  type="button"
                  className="block w-full rounded-md px-3 py-1.5 text-left text-xs text-ink-soft hover:bg-sand hover:text-ink"
                  disabled={pending}
                  onClick={() => {
                    setErr(null);
                    start(async () => {
                      try {
                        const form = await createOnboardingForm({
                          clientId,
                          templateKey: tpl.key,
                        });
                        setForms((prev) => [...prev, form]);
                        setActiveFormId(form.id);
                        setMsg(`Added “${form.name}” — amend before sending.`);
                      } catch (error) {
                        setErr(messageFromUnknown(error, "Could not add form"));
                      }
                    });
                  }}
                >
                  + {tpl.name}
                </button>
              ))}
              <button
                type="button"
                className="mt-1 block w-full rounded-md px-3 py-1.5 text-left text-xs text-ink-soft hover:bg-sand hover:text-ink"
                disabled={pending}
                onClick={() => {
                  setErr(null);
                  start(async () => {
                    try {
                      const form = await createOnboardingForm({
                        clientId,
                        useDefaultFields: false,
                        name: "Blank form",
                      });
                      setForms((prev) => [...prev, form]);
                      setActiveFormId(form.id);
                    } catch (error) {
                      setErr(messageFromUnknown(error, "Could not create"));
                    }
                  });
                }}
              >
                + Blank form
              </button>
            </div>
          </aside>

          {activeForm ? (
            <div className="space-y-4">
              <div className="panel space-y-3 p-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="label">Form name</span>
                    <input
                      className="input mt-1"
                      value={activeForm.name}
                      disabled={activeForm.status === "submitted"}
                      onChange={(e) => patchForm({ name: e.target.value })}
                    />
                  </label>
                  <div>
                    <span className="label">Status</span>
                    <p className="mt-2 text-sm capitalize text-ink-soft">
                      {activeForm.status}
                      {activeForm.sentAt
                        ? ` · sent ${new Date(activeForm.sentAt).toLocaleString("en-GB")}`
                        : ""}
                      {activeForm.openedAt
                        ? ` · opened ${new Date(activeForm.openedAt).toLocaleString("en-GB")}`
                        : ""}
                      {activeForm.submittedAt
                        ? ` · submitted ${new Date(activeForm.submittedAt).toLocaleString("en-GB")}`
                        : ""}
                    </p>
                  </div>
                </div>
                <label className="block">
                  <span className="label">Intro for the client</span>
                  <textarea
                    className="input mt-1 min-h-[4rem]"
                    value={activeForm.description}
                    disabled={activeForm.status === "submitted"}
                    onChange={(e) =>
                      patchForm({ description: e.target.value })
                    }
                  />
                </label>
                {activeForm.status !== "draft" && (
                  <p className="break-all text-sm">
                    Client link:{" "}
                    <a
                      className="font-semibold text-sea"
                      href={`${origin}/forms/${activeForm.token}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {origin}/forms/{activeForm.token}
                    </a>
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  {activeForm.status !== "submitted" && (
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
                                formId: activeForm.id,
                                name: activeForm.name,
                                description: activeForm.description,
                                fields: activeForm.fields,
                              });
                              setForms((prev) =>
                                prev.map((f) =>
                                  f.id === saved.id ? saved : f,
                                ),
                              );
                              setMsg("Form saved (activity logged).");
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
                                formId: activeForm.id,
                                name: activeForm.name,
                                description: activeForm.description,
                                fields: activeForm.fields,
                              });
                              const published = await publishOnboardingForm({
                                clientId,
                                formId: activeForm.id,
                              });
                              setForms((prev) =>
                                prev.map((f) =>
                                  f.id === published.id ? published : f,
                                ),
                              );
                              setMsg(
                                "Link ready — copy it or email it to the client. Open & submit will be logged here.",
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
                      <EmailToClientButton
                        clientId={clientId}
                        defaultEmail={contactEmail}
                        label="Email form to client"
                        subject={`${activeForm.name} — please complete`}
                        message={`Please complete the form we prepared for you.\n\nKind regards`}
                        prepareArtifact={async () => {
                          await saveOnboardingForm({
                            clientId,
                            formId: activeForm.id,
                            name: activeForm.name,
                            description: activeForm.description,
                            fields: activeForm.fields,
                          });
                          const published = await publishOnboardingForm({
                            clientId,
                            formId: activeForm.id,
                          });
                          setForms((prev) =>
                            prev.map((f) =>
                              f.id === published.id ? published : f,
                            ),
                          );
                          return {
                            type: "onboarding_form" as const,
                            formId: published.id,
                          };
                        }}
                      />
                    </>
                  )}
                  <button
                    type="button"
                    className="btn btn-secondary text-danger"
                    disabled={pending}
                    onClick={() => {
                      if (!window.confirm("Delete this form?")) return;
                      start(async () => {
                        await deleteOnboardingForm({
                          clientId,
                          formId: activeForm.id,
                        });
                        setForms((prev) => {
                          const next = prev.filter(
                            (f) => f.id !== activeForm.id,
                          );
                          setActiveFormId(next[0]?.id ?? null);
                          return next;
                        });
                      });
                    }}
                  >
                    Delete
                  </button>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase text-ink-soft">
                    Activity
                  </p>
                  <ActivityList items={activeForm.activity} />
                </div>
              </div>

              {activeForm.status !== "submitted" ? (
                <div className="grid gap-4 lg:grid-cols-[11rem_minmax(0,1fr)]">
                  <div className="panel p-3">
                    <p className="mb-2 text-xs font-bold uppercase text-ink-soft">
                      Add field
                    </p>
                    {PALETTE.map((type) => (
                      <button
                        key={type}
                        type="button"
                        className="block w-full rounded-md px-2 py-1.5 text-left text-sm text-ink-soft hover:bg-sand hover:text-ink"
                        onClick={() =>
                          patchForm({
                            fields: [
                              ...activeForm.fields,
                              createEmptyField(type),
                            ],
                          })
                        }
                      >
                        + {FIELD_TYPE_LABELS[type]}
                      </button>
                    ))}
                  </div>
                  <div className="space-y-2">
                    {activeForm.fields.map((field, index) => (
                      <div
                        key={field.id}
                        draggable
                        onDragStart={() => setDragIndex(index)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => {
                          if (dragIndex == null) return;
                          patchForm({
                            fields: reorderFields(
                              activeForm.fields,
                              dragIndex,
                              index,
                            ),
                          });
                          setDragIndex(null);
                        }}
                        className="panel gloss-card cursor-grab space-y-2 p-4 active:cursor-grabbing"
                      >
                        <div className="flex justify-between gap-2">
                          <p className="text-xs font-bold uppercase text-ink-soft">
                            ⋮⋮ {FIELD_TYPE_LABELS[field.type]}
                          </p>
                          <button
                            type="button"
                            className="text-xs font-semibold text-danger"
                            onClick={() =>
                              patchForm({
                                fields: activeForm.fields.filter(
                                  (f) => f.id !== field.id,
                                ),
                              })
                            }
                          >
                            Remove
                          </button>
                        </div>
                        <input
                          className="input"
                          value={field.label}
                          onChange={(e) =>
                            patchField(field.id, { label: e.target.value })
                          }
                        />
                        {field.type !== "section" && field.type !== "checkbox" ? (
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
                        ) : null}
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
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="panel space-y-3 p-5">
                  <h2 className="display text-xl text-ink">Submission</h2>
                  <dl className="space-y-2 text-sm">
                    {activeForm.fields
                      .filter((f) => f.type !== "section")
                      .map((f) => (
                        <div
                          key={f.id}
                          className="flex justify-between gap-2 border-b border-line py-2"
                        >
                          <dt className="text-ink-soft">{f.label}</dt>
                          <dd className="font-medium">
                            {f.type === "checkbox"
                              ? activeForm.answers?.[f.id]
                                ? "Yes"
                                : "No"
                              : String(activeForm.answers?.[f.id] ?? "—")}
                          </dd>
                        </div>
                      ))}
                  </dl>
                  <p className="text-xs text-ink-soft">
                    Uploads are on the{" "}
                    <Link
                      href={`/clients/${clientSlug}/documents`}
                      className="font-semibold text-sea"
                    >
                      Documents
                    </Link>{" "}
                    tab.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <p className="panel p-5 text-sm text-ink-soft">
              No forms yet — standard packs appear when you open this tab for a
              client.
            </p>
          )}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[14rem_minmax(0,1fr)]">
          <aside className="panel space-y-2 p-3">
            <p className="px-2 text-xs font-bold uppercase text-ink-soft">
              Letters
            </p>
            {letters.map((l) => (
              <button
                key={l.id}
                type="button"
                className={`block w-full rounded-md px-3 py-2 text-left text-sm font-semibold ${
                  l.id === activeLetterId
                    ? "bg-sea/10 text-sea"
                    : "text-ink-soft hover:bg-sand hover:text-ink"
                }`}
                onClick={() => setActiveLetterId(l.id)}
              >
                <span className="block truncate">{l.title}</span>
                <span className="text-xs font-normal capitalize opacity-70">
                  {l.status}
                </span>
              </button>
            ))}
            <div className="border-t border-line pt-2">
              <p className="mb-1 px-2 text-xs font-bold uppercase text-ink-soft">
                New from template
              </p>
              {LETTER_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.key}
                  type="button"
                  className="block w-full rounded-md px-3 py-1.5 text-left text-xs text-ink-soft hover:bg-sand hover:text-ink"
                  disabled={pending}
                  onClick={() => {
                    setErr(null);
                    start(async () => {
                      try {
                        const letter = await createClientLetter({
                          clientId,
                          templateKey: tpl.key,
                        });
                        setLetters((prev) => [...prev, letter]);
                        setActiveLetterId(letter.id);
                        setMsg(
                          `Draft “${letter.title}” ready — edit then mark sent.`,
                        );
                      } catch (error) {
                        setErr(
                          messageFromUnknown(error, "Could not create letter"),
                        );
                      }
                    });
                  }}
                >
                  + {tpl.name}
                </button>
              ))}
            </div>
          </aside>

          {activeLetter ? (
            <div className="space-y-4">
              <div className="panel space-y-3 p-5">
                <label className="block">
                  <span className="label">Title</span>
                  <input
                    className="input mt-1"
                    value={activeLetter.title}
                    onChange={(e) =>
                      setLetters((prev) =>
                        prev.map((l) =>
                          l.id === activeLetter.id
                            ? { ...l, title: e.target.value }
                            : l,
                        ),
                      )
                    }
                  />
                </label>
                <label className="block">
                  <span className="label">Letter body</span>
                  <textarea
                    className="input mt-1 min-h-[14rem] font-mono text-sm"
                    value={activeLetter.body}
                    onChange={(e) =>
                      setLetters((prev) =>
                        prev.map((l) =>
                          l.id === activeLetter.id
                            ? { ...l, body: e.target.value }
                            : l,
                        ),
                      )
                    }
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={pending}
                    onClick={() => {
                      start(async () => {
                        try {
                          const saved = await saveClientLetter({
                            clientId,
                            letterId: activeLetter.id,
                            title: activeLetter.title,
                            body: activeLetter.body,
                          });
                          setLetters((prev) =>
                            prev.map((l) => (l.id === saved.id ? saved : l)),
                          );
                          setMsg("Letter saved.");
                        } catch (error) {
                          setErr(messageFromUnknown(error, "Could not save"));
                        }
                      });
                    }}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={pending}
                    onClick={() => {
                      start(async () => {
                        try {
                          await saveClientLetter({
                            clientId,
                            letterId: activeLetter.id,
                            title: activeLetter.title,
                            body: activeLetter.body,
                          });
                          const sent = await markClientLetterSent({
                            clientId,
                            letterId: activeLetter.id,
                          });
                          setLetters((prev) =>
                            prev.map((l) => (l.id === sent.id ? sent : l)),
                          );
                          setMsg(
                            "Marked as sent — download/print from the preview.",
                          );
                        } catch (error) {
                          setErr(
                            messageFromUnknown(error, "Could not mark sent"),
                          );
                        }
                      });
                    }}
                  >
                    Mark sent
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => window.print()}
                  >
                    Print / PDF
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary text-danger"
                    onClick={() => {
                      if (!window.confirm("Delete this letter?")) return;
                      start(async () => {
                        await deleteClientLetter({
                          clientId,
                          letterId: activeLetter.id,
                        });
                        setLetters((prev) => {
                          const next = prev.filter(
                            (l) => l.id !== activeLetter.id,
                          );
                          setActiveLetterId(next[0]?.id ?? null);
                          return next;
                        });
                      });
                    }}
                  >
                    Delete
                  </button>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase text-ink-soft">
                    Activity
                  </p>
                  <ActivityList items={activeLetter.activity} />
                </div>
              </div>
              <LetterPreview
                letterhead={letterhead}
                body={activeLetter.body}
              />
            </div>
          ) : (
            <p className="panel p-5 text-sm text-ink-soft">
              Pick a UK letter template (director confirmation, income, mortgage
              reference, etc.). Your letterhead from Settings wraps the preview.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
