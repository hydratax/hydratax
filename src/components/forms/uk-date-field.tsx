"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type InputHTMLAttributes,
} from "react";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"] as const;

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/** ISO yyyy-mm-dd → display dd/mm/yyyy */
export function isoToUkDisplay(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return "";
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** Parse typed UK / ISO date into yyyy-mm-dd or null */
export function parseUkDateInput(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (iso) {
    const y = Number(iso[1]);
    const mo = Number(iso[2]);
    const d = Number(iso[3]);
    if (validYmd(y, mo, d)) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    return null;
  }
  const uk = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/.exec(s);
  if (uk) {
    const d = Number(uk[1]);
    const mo = Number(uk[2]);
    const y = Number(uk[3]);
    if (validYmd(y, mo, d)) return `${y}-${pad2(mo)}-${pad2(d)}`;
  }
  return null;
}

function validYmd(y: number, mo: number, d: number) {
  if (y < 1900 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === mo - 1 &&
    dt.getUTCDate() === d
  );
}

function daysInMonth(y: number, mo: number) {
  return new Date(Date.UTC(y, mo, 0)).getUTCDate();
}

/** Monday-first weekday index for the 1st of the month (0=Mon … 6=Sun) */
function mondayIndex(y: number, mo: number) {
  const sun0 = new Date(Date.UTC(y, mo - 1, 1)).getUTCDay();
  return (sun0 + 6) % 7;
}

type Props = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "defaultValue" | "onChange"
> & {
  value?: string;
  defaultValue?: string;
  onChange?: (iso: string) => void;
  /** Year range for the picker (DOB-friendly by default). */
  minYear?: number;
  maxYear?: number;
};

/**
 * UK date field with a HydraTax calendar popover (dd/mm/yyyy display,
 * ISO yyyy-mm-dd value for forms). Drop-in replacement for type="date".
 */
export function UkDateField({
  name,
  id,
  className = "input",
  required,
  disabled,
  value: controlled,
  defaultValue = "",
  onChange,
  minYear = 1920,
  maxYear = 2100,
  placeholder = "dd/mm/yyyy",
  autoComplete = "bday",
  ...rest
}: Props) {
  const reactId = useId();
  const inputId = id ?? `uk-date-${reactId}`;
  const [open, setOpen] = useState(false);
  const [uncontrolled, setUncontrolled] = useState(defaultValue);
  const iso = controlled !== undefined ? controlled : uncontrolled;
  const [typed, setTyped] = useState(() => (iso ? isoToUkDisplay(iso) : ""));
  const [viewYear, setViewYear] = useState(() => {
    const p = parseUkDateInput(iso || "") ?? "";
    if (p) return Number(p.slice(0, 4));
    return Math.min(maxYear, Math.max(minYear, new Date().getFullYear()));
  });
  const [viewMonth, setViewMonth] = useState(() => {
    const p = parseUkDateInput(iso || "") ?? "";
    if (p) return Number(p.slice(5, 7));
    return new Date().getMonth() + 1;
  });
  const [panel, setPanel] = useState<"days" | "months" | "years">("days");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (controlled !== undefined) {
      setTyped(controlled ? isoToUkDisplay(controlled) : "");
    }
  }, [controlled]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setPanel("days");
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        setPanel("days");
      }
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const years = useMemo(() => {
    const list: number[] = [];
    for (let y = maxYear; y >= minYear; y--) list.push(y);
    return list;
  }, [minYear, maxYear]);

  function commitIso(next: string) {
    if (controlled === undefined) setUncontrolled(next);
    onChange?.(next);
    setTyped(next ? isoToUkDisplay(next) : "");
  }

  function pickDay(day: number) {
    const next = `${viewYear}-${pad2(viewMonth)}-${pad2(day)}`;
    commitIso(next);
    setOpen(false);
    setPanel("days");
  }

  const selected = parseUkDateInput(iso || "");
  const selectedDay = selected
    ? {
        y: Number(selected.slice(0, 4)),
        m: Number(selected.slice(5, 7)),
        d: Number(selected.slice(8, 10)),
      }
    : null;

  const dim = daysInMonth(viewYear, viewMonth);
  const lead = mondayIndex(viewYear, viewMonth);
  const cells: Array<number | null> = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: dim }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div ref={rootRef} className="relative">
      {name ? (
        <input type="hidden" name={name} value={iso} readOnly aria-hidden />
      ) : null}
      <div className="relative">
        <input
          {...rest}
          id={inputId}
          type="text"
          inputMode="numeric"
          autoComplete={autoComplete}
          disabled={disabled}
          required={required}
          placeholder={placeholder}
          className={`${className} pr-10`}
          value={typed}
          onChange={(e) => {
            const v = e.target.value;
            setTyped(v);
            const parsed = parseUkDateInput(v);
            if (parsed) {
              commitIso(parsed);
              setViewYear(Number(parsed.slice(0, 4)));
              setViewMonth(Number(parsed.slice(5, 7)));
            } else if (!v.trim()) {
              commitIso("");
            }
          }}
          onBlur={() => {
            if (!typed.trim()) {
              commitIso("");
              return;
            }
            const parsed = parseUkDateInput(typed);
            if (parsed) {
              commitIso(parsed);
            } else if (iso) {
              setTyped(isoToUkDisplay(iso));
            }
          }}
          onFocus={() => {
            if (selected) {
              setViewYear(selectedDay!.y);
              setViewMonth(selectedDay!.m);
            }
          }}
          aria-haspopup="dialog"
          aria-expanded={open}
        />
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-ink-soft hover:text-sea disabled:opacity-50"
          aria-label="Open calendar"
          onClick={() => {
            setOpen((o) => !o);
            setPanel("days");
            if (selected) {
              setViewYear(selectedDay!.y);
              setViewMonth(selectedDay!.m);
            }
          }}
        >
          <CalendarIcon />
        </button>
      </div>

      {open ? (
        <div
          role="dialog"
          aria-label="Choose date"
          className="absolute z-50 mt-1.5 w-[17.5rem] rounded-xl border border-line bg-white p-3 shadow-lg shadow-ink/10"
        >
          <div className="mb-2 flex items-center justify-between gap-1">
            <button
              type="button"
              className="rounded-md px-2 py-1 text-sm font-semibold text-ink hover:bg-sand"
              onClick={() =>
                setPanel((p) => (p === "days" ? "months" : "years"))
              }
            >
              {MONTHS[viewMonth - 1]} {viewYear}
              <span className="ml-1 text-ink-soft">▾</span>
            </button>
            <div className="flex gap-0.5">
              <button
                type="button"
                className="rounded-md px-2 py-1 text-ink-soft hover:bg-sand hover:text-ink"
                aria-label="Previous month"
                onClick={() => {
                  if (viewMonth === 1) {
                    setViewMonth(12);
                    setViewYear((y) => Math.max(minYear, y - 1));
                  } else setViewMonth((m) => m - 1);
                  setPanel("days");
                }}
              >
                ‹
              </button>
              <button
                type="button"
                className="rounded-md px-2 py-1 text-ink-soft hover:bg-sand hover:text-ink"
                aria-label="Next month"
                onClick={() => {
                  if (viewMonth === 12) {
                    setViewMonth(1);
                    setViewYear((y) => Math.min(maxYear, y + 1));
                  } else setViewMonth((m) => m + 1);
                  setPanel("days");
                }}
              >
                ›
              </button>
            </div>
          </div>

          {panel === "years" ? (
            <div className="grid max-h-52 grid-cols-4 gap-1 overflow-y-auto pr-0.5">
              {years.map((y) => (
                <button
                  key={y}
                  type="button"
                  className={`rounded-md px-1 py-1.5 text-sm ${
                    y === viewYear
                      ? "bg-sea font-semibold text-white"
                      : "text-ink hover:bg-sand"
                  }`}
                  onClick={() => {
                    setViewYear(y);
                    setPanel("months");
                  }}
                >
                  {y}
                </button>
              ))}
            </div>
          ) : null}

          {panel === "months" ? (
            <div className="grid grid-cols-3 gap-1">
              {MONTHS.map((label, i) => {
                const m = i + 1;
                return (
                  <button
                    key={label}
                    type="button"
                    className={`rounded-md px-2 py-2 text-sm ${
                      m === viewMonth
                        ? "bg-sea font-semibold text-white"
                        : "text-ink hover:bg-sand"
                    }`}
                    onClick={() => {
                      setViewMonth(m);
                      setPanel("days");
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          ) : null}

          {panel === "days" ? (
            <>
              <div className="mb-1 grid grid-cols-7 gap-0.5 text-center text-[0.65rem] font-semibold uppercase tracking-wide text-ink-soft">
                {WEEKDAYS.map((d) => (
                  <span key={d} className="py-1">
                    {d}
                  </span>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-0.5">
                {cells.map((day, i) => {
                  if (day == null) {
                    return <span key={`e-${i}`} className="h-8" />;
                  }
                  const isSel =
                    selectedDay &&
                    selectedDay.y === viewYear &&
                    selectedDay.m === viewMonth &&
                    selectedDay.d === day;
                  return (
                    <button
                      key={`${viewYear}-${viewMonth}-${day}`}
                      type="button"
                      className={`h-8 rounded-md text-sm ${
                        isSel
                          ? "bg-sea font-semibold text-white"
                          : "text-ink hover:bg-sand"
                      }`}
                      onClick={() => pickDay(day)}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            </>
          ) : null}

          <div className="mt-2 flex justify-between border-t border-line pt-2">
            <button
              type="button"
              className="text-xs font-semibold text-ink-soft hover:text-ink"
              onClick={() => {
                commitIso("");
                setOpen(false);
                setPanel("days");
              }}
            >
              Clear
            </button>
            <button
              type="button"
              className="text-xs font-semibold text-sea hover:text-sea-deep"
              onClick={() => {
                const now = new Date();
                const next = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
                setViewYear(now.getFullYear());
                setViewMonth(now.getMonth() + 1);
                commitIso(next);
                setOpen(false);
                setPanel("days");
              }}
            >
              Today
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CalendarIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}
