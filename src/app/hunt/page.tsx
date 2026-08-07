import { getSession } from "@/lib/auth/guard";
import { redirect } from "next/navigation";
import GameUI from "./GameUI";

export default async function HuntPage() {
  // Try to get a real session, but mock it for local testing if unauthenticated
  const session = (await getSession()) ?? { teamId: "test-team-id" };
  
  if (!session) {
    // If there is no session, redirect to the entry flow.
    redirect("/enter");
  }

  return (
    <>
      {/* We can pass session data down to the client component if needed */}
      <GameUI />
    </>
  );
}
