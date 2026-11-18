"use client";

import { useEffect, useRef, useState } from "react";
import {
  enterPresentationDemoQuick,
  seedPresentationDemoClients,
} from "@/server/actions/presentation-demo";

/**
 * Seeds from the client (revalidatePath-safe), then hard-navigates to the desk.
 * Failsafe: if seed runs long, still enter demo mode and open the dashboard.
 */
export function SalesDemoRunner() {
  const started = useRef(false);
  const [label, setLabel] = useState("Preparing sales demo…");

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    let opened = false;

    function openDesk() {
      if (opened) return;
      opened = true;
      setLabel("Opening desk…");
      window.location.assign("/dashboard");
    }

    const failsafe = window.setTimeout(() => {
      setLabel("Almost ready…");
      void enterPresentationDemoQuick()
        .catch(() => null)
        .finally(() => openDesk());
    }, 12000);

    void (async () => {
      try {
        await seedPresentationDemoClients();
        window.clearTimeout(failsafe);
        openDesk();
      } catch {
        window.clearTimeout(failsafe);
        setLabel("Could not start demo — retrying…");
        try {
          await enterPresentationDemoQuick();
        } catch {
          /* ignore */
        }
        openDesk();
      }
    })();

    return () => window.clearTimeout(failsafe);
  }, []);

  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <p className="text-sm font-semibold uppercase tracking-[0.14em] text-sea">
        Sales demo
      </p>
      <p className="mt-4 text-lg text-ink">{label}</p>
    </div>
  );
}
