/**
 * Decide where to send a user right after a successful login.
 *
 * `rt` arrives absolute — `proxy.ts` builds it from the request's real Host
 * header (`${origin}${pathname}${search}`) so a redirect started on one event
 * subdomain (quiz., ctf., hunt., code.) or the apex host survives the login
 * round-trip and lands back on that same subdomain. So absolute `rt` values
 * are expected and must keep working.
 *
 * What must NOT work is a foreign host. Without this check,
 * `/enter?rt=https://evil.example` would send a freshly authenticated user
 * off-site immediately after login — a credible phishing flow, because the
 * login itself is genuine.
 *
 * Resolving `rawRt` against our own origin and comparing origins (not a
 * hostname allowlist, not a "starts with /" check — this deployment serves
 * several event subdomains from one origin, and `URL` normalises absolute,
 * relative, and protocol-relative inputs uniformly) means an off-site,
 * unparseable, or non-http(s) `rt` is simply ignored in favour of `fallback`
 * rather than followed. `/admin` is refused outright even when same-origin:
 * the participant entry page should never hand someone into the admin
 * console just because they carried an `/admin` `rt`.
 */
export function safeRedirectTarget(rawRt: string | null, origin: string, fallback: string): string {
  if (!rawRt) {
    return fallback;
  }

  try {
    const url = new URL(rawRt, origin);
    if (url.origin === origin && !url.pathname.startsWith("/admin")) {
      return url.pathname + url.search;
    }
  } catch {
    // Unparseable rt — keep the default.
  }

  return fallback;
}
