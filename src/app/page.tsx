import { redirect } from "next/navigation";

/**
 * Serves app.<domain> / www.<domain> / localhost.
 * Redirects to the universe treasure-hunt experience.
 */
export default function Home() {
  redirect("/universe");
}
