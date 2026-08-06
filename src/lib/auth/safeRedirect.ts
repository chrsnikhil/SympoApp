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
/**
 * Is this path the admin console, however it is spelled?
 *
 * A raw `pathname.startsWith("/admin")` is bypassable: `/%61dmin/quiz` is
 * `/admin/quiz` once the server decodes it, but the encoded form does not match
 * the prefix and sails through. Caught by testing the guard against encoded
 * input rather than by reading it.
 *
 * Decoding first closes that, and lowercasing closes the case variants.
 * `decodeURIComponent` throws on a malformed sequence like a lone `%`, which is
 * itself a reason to refuse — anything we cannot confidently decode is
 * something we cannot confidently say is NOT the admin path.
 */
function isAdminPath(pathname: string): boolean {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return true;
  }
  return decoded.toLowerCase().startsWith("/admin");
}

export function safeRedirectTarget(rawRt: string | null, origin: string, fallback: string): string {
  if (!rawRt) {
    return fallback;
  }

  try {
    const url = new URL(rawRt, origin);
    if (url.origin === origin && !isAdminPath(url.pathname)) {
      return url.pathname + url.search;
    }
  } catch {
    // Unparseable rt — keep the default.
  }

  return fallback;
}
