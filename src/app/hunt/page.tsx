import { getSession } from "@/lib/auth/guard";

/**
 * HUNT — reached via proxy rewrite from hunt.<domain>.
 * Placeholder: the spine (auth, submit, scoring, leaderboard) is wired;
 * the event UI is not built yet.
 */
export default async function HuntPage() {
  const session = await getSession();
  return (
    <main style={{ padding: 40, fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 32, marginBottom: 8 }}>HUNT</h1>
      <p style={{ opacity: 0.7 }}>
        Team {session?.teamId ?? "—"} · role {session?.role ?? "—"}
      </p>
      <p style={{ marginTop: 24, opacity: 0.6 }}>Event UI not built yet.</p>
    </main>
  );
}
