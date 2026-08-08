"use client";

import { useState } from "react";
import {
  CT600_ESSENTIAL_QUESTIONS,
  validateCt600Questionnaire,
  type Ct600QuestionnaireAnswers,
} from "@/lib/hmrc/filing-guides";

export function Ct600Questionnaire({
  onComplete,
}: {
  onComplete: (answers: Ct600QuestionnaireAnswers, ok: boolean) => void;
}) {
  const [answers, setAnswers] = useState<Ct600QuestionnaireAnswers>({
    associated_companies: 0,
  });

  const result = validateCt600Questionnaire(answers);

  function set(id: string, value: boolean | number) {
    const next = { ...answers, [id]: value };
    setAnswers(next);
    onComplete(next, validateCt600Questionnaire(next).ok);
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-soft">
        Based on HMRC CT600 Guide — answer each item before submit.
      </p>
      {CT600_ESSENTIAL_QUESTIONS.map((q) => (
        <div
          key={q.id}
          className="rounded-lg border border-line bg-white px-4 py-3"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-sea">
                Box {q.boxHint}
              </p>
              <p className="mt-1 text-sm font-medium text-ink">{q.prompt}</p>
              {q.ifYesRequires && answers[q.id] === true && (
                <p className="mt-1 text-xs text-warn">
                  Attach supplementary page {q.ifYesRequires}
                </p>
              )}
            </div>
            {q.id === "associated_companies" ? (
              <input
                type="number"
                min={0}
                className="input w-24"
                value={Number(answers.associated_companies ?? 0)}
                onChange={(e) => set(q.id, Number(e.target.value))}
              />
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  className={`btn text-sm ${answers[q.id] === true ? "btn-primary" : "btn-secondary"}`}
                  onClick={() => set(q.id, true)}
                >
                  Yes
                </button>
                <button
                  type="button"
                  className={`btn text-sm ${answers[q.id] === false ? "btn-primary" : "btn-secondary"}`}
                  onClick={() => set(q.id, false)}
                >
                  No
                </button>
              </div>
            )}
          </div>
        </div>
      ))}
      {!result.ok && (
        <p className="text-sm text-danger">
          Complete all essential items ({result.missing.length} remaining).
        </p>
      )}
      {result.ok && result.supplementaryPages.length > 0 && (
        <p className="text-sm text-warn">
          Supplementary pages required: {result.supplementaryPages.join(", ")}
        </p>
      )}
    </div>
  );
}
