"use client";

import { useMemo, useState } from "react";
import {
  DESK_FILTER_COLORS,
  filterColorClass,
  visibleFilters,
  type DeskFilterColor,
  type DeskFilterDef,
  type DeskFilterPrefs,
} from "@/lib/desk-filter-prefs";

type Props = {
  label: string;
  prefs: DeskFilterPrefs;
  selectedId: string;
  counts: Record<string, number>;
  /** Status options custom chips may map onto (excludes "all"). */
  mapOptions: Array<{ id: string; label: string }>;
  onSelect: (id: string) => void;
  onSetColor: (id: string, color: DeskFilterColor) => void;
  onSetLabel: (id: string, label: string) => void;
  onHide: (id: string) => void;
  onShow: (id: string) => void;
  onDelete: (id: string) => void;
  onAdd: (input: {
    label: string;
    mapsTo: string;
    color: DeskFilterColor;
  }) => string;
};

export function DeskFilterBar({
  label,
  prefs,
  selectedId,
  counts,
  mapOptions,
  onSelect,
  onSetColor,
  onSetLabel,
  onHide,
  onShow,
  onDelete,
  onAdd,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newMapsTo, setNewMapsTo] = useState(mapOptions[0]?.id ?? "all");
  const [newColor, setNewColor] = useState<DeskFilterColor>("colorless");
  const [colorFor, setColorFor] = useState<string | null>(null);

  const chips = useMemo(() => visibleFilters(prefs), [prefs]);
  const hiddenSystem = useMemo(
    () => prefs.filters.filter((f) => f.system && f.hidden && f.id !== "all"),
    [prefs.filters],
  );

  function countFor(f: DeskFilterDef) {
    if (f.mapsTo === "all" || f.id === "all") {
      return counts.all ?? counts[f.id] ?? 0;
    }
    return counts[f.mapsTo] ?? counts[f.id] ?? 0;
  }

  function submitAdd() {
    const id = onAdd({
      label: newLabel.trim() || "Custom",
      mapsTo: newMapsTo,
      color: newColor,
    });
    setNewLabel("");
    setNewColor("colorless");
    setAddOpen(false);
    onSelect(id);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label={label}>
          {chips.map((f) => {
            const active = selectedId === f.id;
            return (
              <div key={f.id} className="relative inline-flex">
                <button
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => onSelect(f.id)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setColorFor(colorFor === f.id ? null : f.id);
                  }}
                  className={`filing-filter ${filterColorClass(f.color)} ${active ? "is-active" : ""}`}
                >
                  {f.label}
                  <span className="filing-filter__count">{countFor(f)}</span>
                </button>
                {editing ? (
                  <span className="ml-1 inline-flex items-center gap-0.5">
                    <button
                      type="button"
                      className="desk-filter-edit-btn"
                      title="Colour"
                      aria-label={`Colour for ${f.label}`}
                      onClick={() =>
                        setColorFor(colorFor === f.id ? null : f.id)
                      }
                    >
                      ◐
                    </button>
                    {f.id !== "all" ? (
                      <button
                        type="button"
                        className="desk-filter-edit-btn"
                        title={f.system ? "Hide" : "Remove"}
                        aria-label={
                          f.system
                            ? `Hide ${f.label}`
                            : `Remove ${f.label}`
                        }
                        onClick={() => {
                          if (selectedId === f.id) onSelect("all");
                          onDelete(f.id);
                        }}
                      >
                        ×
                      </button>
                    ) : null}
                  </span>
                ) : null}
                {colorFor === f.id ? (
                  <div className="desk-filter-popover">
                    <p className="mb-1.5 text-[0.65rem] font-semibold uppercase tracking-wide text-ink-soft">
                      Colour
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {DESK_FILTER_COLORS.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          title={c.label}
                          aria-label={c.label}
                          className={`desk-filter-swatch desk-filter-swatch--${c.id} ${f.color === c.id ? "is-selected" : ""}`}
                          onClick={() => {
                            onSetColor(f.id, c.id);
                            setColorFor(null);
                          }}
                        />
                      ))}
                    </div>
                    {editing ? (
                      <label className="mt-2 block text-xs text-ink-soft">
                        Label
                        <input
                          className="input mt-1 w-full text-sm"
                          defaultValue={f.label}
                          onBlur={(e) => onSetLabel(f.id, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              onSetLabel(
                                f.id,
                                (e.target as HTMLInputElement).value,
                              );
                              setColorFor(null);
                            }
                          }}
                        />
                      </label>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        <button
          type="button"
          className={`desk-filter-manage ${editing ? "is-active" : ""}`}
          aria-pressed={editing}
          onClick={() => {
            setEditing((v) => !v);
            setAddOpen(false);
            setColorFor(null);
          }}
        >
          {editing ? "Done" : "Filters"}
        </button>
      </div>

      {editing ? (
        <div className="flex flex-wrap items-center gap-2 text-sm text-ink-soft">
          <button
            type="button"
            className="desk-filter-manage"
            onClick={() => {
              setAddOpen((v) => !v);
              setColorFor(null);
            }}
          >
            {addOpen ? "Cancel" : "Add filter"}
          </button>
          {hiddenSystem.length > 0 ? (
            <span className="inline-flex flex-wrap items-center gap-1.5">
              Hidden:
              {hiddenSystem.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className="desk-filter-manage"
                  onClick={() => onShow(f.id)}
                >
                  Restore {f.label}
                </button>
              ))}
            </span>
          ) : null}
        </div>
      ) : null}

      {editing && addOpen ? (
        <div className="panel max-w-lg space-y-3 p-3">
          <label className="block text-xs font-semibold text-ink-soft">
            Name
            <input
              className="input mt-1 w-full"
              value={newLabel}
              placeholder="e.g. Waiting on client"
              onChange={(e) => setNewLabel(e.target.value)}
            />
          </label>
          <label className="block text-xs font-semibold text-ink-soft">
            Matches
            <select
              className="input mt-1 w-full"
              value={newMapsTo}
              onChange={(e) => setNewMapsTo(e.target.value)}
            >
              {mapOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <div>
            <p className="text-xs font-semibold text-ink-soft">Colour</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {DESK_FILTER_COLORS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  title={c.label}
                  aria-label={c.label}
                  className={`desk-filter-swatch desk-filter-swatch--${c.id} ${newColor === c.id ? "is-selected" : ""}`}
                  onClick={() => setNewColor(c.id)}
                />
              ))}
            </div>
          </div>
          <button
            type="button"
            className="btn btn-secondary text-sm"
            onClick={submitAdd}
          >
            Add
          </button>
        </div>
      ) : null}
    </div>
  );
}
