"use client";

import { useCallback, useEffect, useState } from "react";
import {
  buildDefaultPrefs,
  loadDeskFilterPrefs,
  newCustomFilterId,
  saveDeskFilterPrefs,
  type DeskFilterColor,
  type DeskFilterDef,
  type DeskFilterDeskId,
  type DeskFilterPrefs,
} from "@/lib/desk-filter-prefs";

export function useDeskFilterPrefs(
  desk: DeskFilterDeskId,
  defaults: Array<{ id: string; label: string; mapsTo?: string }>,
) {
  const [prefs, setPrefs] = useState<DeskFilterPrefs>(() =>
    buildDefaultPrefs(desk, defaults),
  );
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setPrefs(loadDeskFilterPrefs(desk, defaults));
    setReady(true);
    // defaults are stable per desk module
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desk]);

  const persist = useCallback(
    (next: DeskFilterPrefs) => {
      setPrefs(next);
      saveDeskFilterPrefs(desk, next);
    },
    [desk],
  );

  const setColor = useCallback(
    (id: string, color: DeskFilterColor) => {
      persist({
        ...prefs,
        filters: prefs.filters.map((f) =>
          f.id === id ? { ...f, color } : f,
        ),
      });
    },
    [persist, prefs],
  );

  const setLabel = useCallback(
    (id: string, label: string) => {
      const trimmed = label.trim().slice(0, 40);
      if (!trimmed) return;
      persist({
        ...prefs,
        filters: prefs.filters.map((f) =>
          f.id === id ? { ...f, label: trimmed } : f,
        ),
      });
    },
    [persist, prefs],
  );

  const hideFilter = useCallback(
    (id: string) => {
      if (id === "all") return;
      persist({
        ...prefs,
        filters: prefs.filters.map((f) =>
          f.id === id ? { ...f, hidden: true } : f,
        ),
      });
    },
    [persist, prefs],
  );

  const showFilter = useCallback(
    (id: string) => {
      persist({
        ...prefs,
        filters: prefs.filters.map((f) =>
          f.id === id ? { ...f, hidden: false } : f,
        ),
      });
    },
    [persist, prefs],
  );

  const deleteFilter = useCallback(
    (id: string) => {
      const hit = prefs.filters.find((f) => f.id === id);
      if (!hit) return;
      if (hit.system) {
        hideFilter(id);
        return;
      }
      persist({
        ...prefs,
        filters: prefs.filters.filter((f) => f.id !== id),
      });
    },
    [hideFilter, persist, prefs],
  );

  const addFilter = useCallback(
    (input: { label: string; mapsTo: string; color: DeskFilterColor }) => {
      const label = input.label.trim().slice(0, 40) || "Custom";
      const mapsTo = input.mapsTo || "all";
      const next: DeskFilterDef = {
        id: newCustomFilterId(),
        label,
        mapsTo,
        color: input.color,
        system: false,
        hidden: false,
      };
      persist({ ...prefs, filters: [...prefs.filters, next] });
      return next.id;
    },
    [persist, prefs],
  );

  const resetDefaults = useCallback(() => {
    const next = buildDefaultPrefs(desk, defaults);
    persist(next);
  }, [defaults, desk, persist]);

  return {
    prefs,
    ready,
    setColor,
    setLabel,
    hideFilter,
    showFilter,
    deleteFilter,
    addFilter,
    resetDefaults,
  };
}
