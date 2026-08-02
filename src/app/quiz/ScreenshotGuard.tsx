"use client";

import { useEffect, useState } from "react";

/**
 * Wraps Round 1's Image Replication game. Blocks the easy "save/print/inspect"
 * keyboard paths (Ctrl+S, Ctrl+P, Ctrl+U, F12, Ctrl+Shift+I/J/C) while mounted,
 * and logs (without blocking — a key that's already fired can't be un-pressed)
 * a PrintScreen press so the coordinator sees it in the integrity log.
 *
 * Deliberately scoped to this one game via mount/unmount rather than applied
 * globally — Round 1's other games and Rounds 2/3 have no reason to eat these
 * shortcuts, and the OS screenshot key can't be intercepted anyway (see
 * `ProtectedImage`'s watermark for the actual defense against that).
 */
export default function ScreenshotGuard({ children }: { children: React.ReactNode }) {
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const key = e.key.toLowerCase();
      const savePrintInspect = (e.ctrlKey || e.metaKey) && ["s", "p", "u"].includes(key);
      const devtools = (e.ctrlKey && e.shiftKey && ["i", "j", "c"].includes(key)) || e.key === "F12";
      if (savePrintInspect || devtools) {
        e.preventDefault();
      }
    }

    function onKeyUp(e: KeyboardEvent) {
      if (e.key !== "PrintScreen") return;
      setFlash(true);
      window.setTimeout(() => setFlash(false), 1200);
      void fetch("/api/quiz/flag", {
        method: "POST",
        headers: { "content-type": "application/json" },
        keepalive: true,
        body: JSON.stringify({ round: 1, kind: "screenshot-attempt" }),
      });
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  return (
    <div className="relative select-none">
      {children}
      {flash && <div className="pointer-events-none fixed inset-0 z-[9999] bg-spider-red/30" aria-hidden="true" />}
    </div>
  );
}
