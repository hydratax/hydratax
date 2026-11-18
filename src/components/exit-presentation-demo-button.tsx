"use client";

import { useTransition } from "react";
import { exitPresentationDemo } from "@/server/actions/presentation-demo";

export function ExitPresentationDemoButton({
  className,
  onDone,
}: {
  className?: string;
  onDone?: () => void;
}) {
  const [pending, start] = useTransition();

  return (
    <button
      type="button"
      role="menuitem"
      className={className}
      disabled={pending}
      onClick={() => {
        onDone?.();
        start(async () => {
          await exitPresentationDemo();
        });
      }}
    >
      {pending ? "Exiting…" : "Exit sales demo"}
    </button>
  );
}
