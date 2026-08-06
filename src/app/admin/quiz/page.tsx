import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/guard";
import AdminDashboard from "./AdminDashboard";

/**
 * Coordinator dashboard — tier 1 of the three-tier control surface
 * (dashboard → `/api/quiz/advance` + `/api/admin/quiz/overview` → the
 * `quiz-admin.ts` CLI). Lives on the app host, gated the same way every other
 * private page is: re-verify the session server-side, never trust `proxy.ts`
 * alone.
 */
export default async function AdminQuizPage() {
  const session = await getSession();
  if (!session) redirect("/enter?rt=/admin/quiz");
  if (session.role !== "admin") redirect("/enter");

  return <AdminDashboard />;
}
