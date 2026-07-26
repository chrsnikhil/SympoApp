"use client";

import { useState } from "react";

/**
 * Entry page. Lives on the app/www host — the event subdomains bounce here
 * when there's no valid session, carrying ?rt= so we can send the user back.
 */
export default function EnterPage() {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/enter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "That didn't work");
        return;
      }
      // Return to wherever they were headed, else the app root.
      const rt = new URLSearchParams(window.location.search).get("rt");
      window.location.href = rt ?? "/";
    } catch {
      setError("Network error — try again");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ display: "grid", placeItems: "center", minHeight: "100dvh", fontFamily: "system-ui" }}>
      <form onSubmit={onSubmit} style={{ width: 320 }}>
        <h1 style={{ fontSize: 28, marginBottom: 16 }}>Enter</h1>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="XXXX-XXXXX-XXXXX"
          autoComplete="one-time-code"
          style={{ width: "100%", padding: 12, fontSize: 16, letterSpacing: 1 }}
        />
        {error && <p style={{ color: "#c00", marginTop: 8 }}>{error}</p>}
        <button type="submit" disabled={busy} style={{ width: "100%", padding: 12, marginTop: 12, fontSize: 16 }}>
          {busy ? "Checking…" : "Continue"}
        </button>
      </form>
    </main>
  );
}
