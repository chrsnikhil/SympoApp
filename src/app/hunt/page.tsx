import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/guard";
import HuntShell from "./HuntShell";

/**
 * HUNT — reached via proxy rewrite from hunt.<domain>.
 * The real event UI: four puzzles, a shared answer box, and the only place
 * in this event that ever calls /api/submit.
 */
export default async function HuntPage() {
  const session = await getSession();
  if (!session) redirect("/enter");
  return <HuntShell />;
}
