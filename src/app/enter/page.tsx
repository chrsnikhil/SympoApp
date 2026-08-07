import { headers } from "next/headers";
import { eventFromHost } from "@/lib/config";
import QuizEntry from "./QuizEntry";
import PlatformEntry from "./PlatformEntry";

/**
 * The login screen, picked by host — the UI counterpart to the dispatch in
 * `api/enter/route.ts`.
 *
 * The quiz asks for a coin number and shows the avatar it unlocks; the CTF and
 * hunt ask for a team name and password. Those are different forms posting
 * different bodies, so the page that renders them has to know which event the
 * visitor is on. `/enter` is in the proxy's PUBLIC_PREFIXES and is therefore
 * never rewritten into a route group, which is why this reads the Host header
 * itself rather than relying on the `x-event` header the proxy sets on
 * rewritten requests.
 *
 * This is a server component purely so it can read that header; both branches
 * below are the original client components, moved but not rewritten.
 */
export default async function EnterPage() {
  const host = (await headers()).get("host");
  const event = eventFromHost(host);

  // Path-based deployments (localhost, ngrok) have no subdomain to read. The
  // platform form is the safe default there: it is the only one that can also
  // redeem a plain access code.
  //
  // `event` goes down with it so the form can name the event the participant is
  // actually on. It called itself the CTF arena on every host, which is what
  // "the hunt shows the CTF page" was reporting — the login worked and led to
  // the hunt, but said otherwise on the way in.
  return event === "quiz" ? <QuizEntry /> : <PlatformEntry event={event} />;
}
