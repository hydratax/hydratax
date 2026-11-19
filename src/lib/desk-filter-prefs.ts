/**
 * Desk filter chip preferences — colours, labels, hide/add.
 * Stored in localStorage per desk (practice DB prefs not available yet).
 */

export type DeskFilterColor =
  | "colorless"
  | "red"
  | "amber"
  | "blue"
  | "green"
  | "teal"
  | "violet";

export const DESK_FILTER_COLORS: Array<{
  id: DeskFilterColor;
  label: string;
}> = [
  { id: "colorless", label: "None" },
  { id: "red", label: "Red" },
  { id: "amber", label: "Amber" },
  { id: "blue", label: "Blue" },
  { id: "green", label: "Green" },
  { id: "teal", label: "Teal" },
  { id: "violet", label: "Violet" },
];

export type DeskFilterDef = {
  /** Stable filter id (system stage or custom_*). */
  id: string;
  label: string;
  /** Backend / match key — custom chips map onto an existing stage. */
  mapsTo: string;
  color: DeskFilterColor;
  /** System defaults cannot be hard-deleted; hide instead. */
  system: boolean;
  hidden?: boolean;
};

export type DeskFilterPrefs = {
  version: 1;
  filters: DeskFilterDef[];
};

export type DeskFilterDeskId =
  | "invoices"
  | "payroll"
  | "vat"
  | "ct"
  | "sa"
  | "clients";

function storageKey(desk: DeskFilterDeskId) {
  return `hydratax_desk_filters_${desk}`;
}

export function defaultColorForStatus(
  mapsTo: string,
  desk: DeskFilterDeskId,
): DeskFilterColor {
  const key = mapsTo.toLowerCase();
  if (key === "all") return "colorless";

  if (desk === "invoices") {
    if (key === "due") return "red";
    if (key === "sent") return "blue";
    if (key === "paid") return "green";
  }

  if (
    key.includes("overdue") ||
    key === "due" ||
    key === "info_requested"
  ) {
    return key.includes("overdue") || key === "due" ? "red" : "colorless";
  }
  if (key.includes("due_soon") || key === "any_due_soon") return "violet";
  if (
    key === "sent" ||
    key === "emailed" ||
    key === "info_received"
  ) {
    return "blue";
  }
  if (
    key === "paid" ||
    key === "submitted" ||
    key === "accepted" ||
    key === "approved" ||
    key === "complete" ||
    key === "ok"
  ) {
    return "green";
  }
  if (
    key === "generated" ||
    key === "drafted" ||
    key === "return_prepared"
  ) {
    return "amber";
  }
  if (
    key === "completed" ||
    key === "ready" ||
    key === "reviewed"
  ) {
    return "teal";
  }
  if (key === "monthly" || key === "weekly") return "colorless";
  if (key === "not_started" || key === "info_requested") return "colorless";
  return "colorless";
}

export function buildDefaultPrefs(
  desk: DeskFilterDeskId,
  defaults: Array<{ id: string; label: string; mapsTo?: string }>,
): DeskFilterPrefs {
  return {
    version: 1,
    filters: defaults.map((d) => ({
      id: d.id,
      label: d.label,
      mapsTo: d.mapsTo ?? d.id,
      color: defaultColorForStatus(d.mapsTo ?? d.id, desk),
      system: true,
      hidden: false,
    })),
  };
}

export function loadDeskFilterPrefs(
  desk: DeskFilterDeskId,
  defaults: Array<{ id: string; label: string; mapsTo?: string }>,
): DeskFilterPrefs {
  const fallback = buildDefaultPrefs(desk, defaults);
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(storageKey(desk));
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as DeskFilterPrefs;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.filters)) {
      return fallback;
    }
    return mergeWithDefaults(fallback, parsed);
  } catch {
    return fallback;
  }
}

function mergeWithDefaults(
  defaults: DeskFilterPrefs,
  saved: DeskFilterPrefs,
): DeskFilterPrefs {
  const byId = new Map(saved.filters.map((f) => [f.id, f]));
  const mergedSystem = defaults.filters.map((d) => {
    const s = byId.get(d.id);
    if (!s) return d;
    return {
      ...d,
      label: s.label?.trim() ? s.label : d.label,
      color: isDeskFilterColor(s.color) ? s.color : d.color,
      hidden: Boolean(s.hidden),
      mapsTo: d.mapsTo,
      system: true,
    };
  });
  const custom = saved.filters.filter(
    (f) => !f.system && typeof f.id === "string" && f.id.startsWith("custom_"),
  );
  const cleanedCustom: DeskFilterDef[] = custom.map((f) => ({
    id: f.id,
    label: String(f.label || "Custom").slice(0, 40),
    mapsTo: String(f.mapsTo || "all"),
    color: isDeskFilterColor(f.color) ? f.color : "colorless",
    system: false,
    hidden: Boolean(f.hidden),
  }));
  return { version: 1, filters: [...mergedSystem, ...cleanedCustom] };
}

function isDeskFilterColor(v: unknown): v is DeskFilterColor {
  return (
    typeof v === "string" &&
    DESK_FILTER_COLORS.some((c) => c.id === v)
  );
}

export function saveDeskFilterPrefs(
  desk: DeskFilterDeskId,
  prefs: DeskFilterPrefs,
) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(storageKey(desk), JSON.stringify(prefs));
  } catch {
    /* ignore quota */
  }
}

export function visibleFilters(prefs: DeskFilterPrefs): DeskFilterDef[] {
  return prefs.filters.filter((f) => !f.hidden);
}

/** Resolve which match key a selected chip uses. */
export function resolveFilterMapsTo(
  prefs: DeskFilterPrefs,
  selectedId: string,
): string {
  const hit = prefs.filters.find((f) => f.id === selectedId);
  return hit?.mapsTo ?? selectedId;
}

export function colorForMapsTo(
  prefs: DeskFilterPrefs,
  mapsTo: string,
): DeskFilterColor {
  const exact = prefs.filters.find(
    (f) => !f.hidden && f.mapsTo === mapsTo && f.system,
  );
  if (exact) return exact.color;
  const any = prefs.filters.find((f) => !f.hidden && f.mapsTo === mapsTo);
  return any?.color ?? "colorless";
}

export function cardTintClass(color: DeskFilterColor): string {
  if (color === "colorless") return "";
  return `client-card--tint-${color}`;
}

export function filterColorClass(color: DeskFilterColor): string {
  return `desk-filter-color--${color}`;
}

export function chipColorClass(color: DeskFilterColor): string {
  if (color === "colorless") return "filing-btn filing-btn--muted";
  return `filing-btn filing-btn--tint-${color}`;
}

export function newCustomFilterId() {
  return `custom_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}
