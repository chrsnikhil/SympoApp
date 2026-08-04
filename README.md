# XPLORE'26 — Event Platform

One Next.js container serving four events across four subdomains, deployed to
Azure Container Apps. The marketing landing page is a **separate** repo
([Xplore26](https://github.com/chrsnikhil/Xplore26)) deployed to Azure Static
Web Apps — different traffic shape, different service.

```
hunt.<domain>  ─┐
ctf.<domain>   ─┤   one container
code.<domain>  ─┼─► proxy.ts reads the Host header
quiz.<domain>  ─┘   and rewrites into /hunt, /ctf, /code, /quiz

app.<domain>/enter  ─► redeem a code, mint the session cookie
```

## Why it's shaped this way

The whole design is built around one moment: **500 people acting within the
same five seconds.**

| Decision | Reason |
|---|---|
| Stateless JWT sessions | Verifying a request is a signature check with **zero DB reads** — page loads don't touch the database |
| Cookie scoped to `.<domain>` | One login carries across all four event subdomains |
| Server-stamped `receivedAt` | The fairness anchor. Ties, first-blood and quiz timers resolve on the server clock, never a client-supplied one |
| Append-only score ledger | No shared counter to contend on, so concurrent scoring can't lose updates; mistakes are fixed by appending, and history stays auditable |
| Materialized leaderboard | Aggregate once every ~5s into a snapshot. 500 pollers cost a fraction of a query/sec instead of 100 aggregations/sec |
| MongoDB over Postgres | A Burstable Postgres tier caps around 30–50 connections — a 500-user burst walks straight into it |
| Judge in separate containers | Untrusted code must not run beside the DB credentials and signing key |

## Layout

```
src/
├─ proxy.ts                  Host → route rewrite + optimistic auth bounce
├─ lib/
│  ├─ config.ts              Subdomain map, limits, cookie/session constants
│  ├─ auth/
│  │  ├─ session.ts          JWT sign/verify, cookie options, hashing
│  │  └─ guard.ts            requireSession() — the real authz boundary
│  ├─ db/
│  │  ├─ client.ts           Pooled Mongo singleton, typed collections, indexes
│  │  └─ types.ts            Collection shapes
│  ├─ submission/pipeline.ts THE shared path every action takes
│  ├─ graders/               The only per-event code (one interface each)
│  ├─ score/ledger.ts        Append-only writes
│  └─ leaderboard/           Materializer + snapshot reader
└─ app/
   ├─ api/{enter,submit,submissions/[id],leaderboard,health}
   ├─ enter/                 Code redemption UI
   └─ {hunt,ctf,code,quiz}/  One route group per event
```

> **Note on `proxy.ts`:** Next.js 16 deprecated `middleware.ts` in favour of
> `proxy.ts` (named export `proxy`). Unlike middleware, it runs on the Node.js
> runtime and that isn't configurable.

## Adding an event

1. Add the key to `EVENTS` in `src/lib/config.ts`
2. Write a grader implementing `Grader` and register it in `src/lib/graders/index.ts`
3. Create the route group `src/app/<event>/`
4. Point a CNAME at the same container

Nothing in the pipeline, auth, scoring or leaderboard changes.

## Running the quiz from a fresh clone

**`.env.local` alone is not enough.** A clone has code but no *data* — no
questions, no coins, no reference image — and the quiz will render an empty
round if you skip the seed. These four steps are all required:

```bash
npm install

# 1. Config. Fill in an API key + IMAGE_JUDGE_MODEL for Round 1 judging.
cp .env.example .env.local

# 2. Database. Either start the bundled local one (downloads a mongod binary
#    on first run — needs internet), or point MONGODB_URI at your own/Atlas.
npm run db:local                    # leave running, uses port 27117

# 3. Seed. WITHOUT THIS THERE ARE NO QUESTIONS.
#    Prints the coordinator code (1684) and team coins (01-60).
npm run seed:quiz

# 4. Round 1's single reference image, for the vision judge.
npx tsx --env-file=.env.local scripts/set-reference.ts image-1 ./public/quiz/reference-1.jpg

npm run dev
```

Then: coordinator at `/admin/quiz` (code **1684**), teams at `/enter` with a
coin number.

`npm run db:local` rewrites `MONGODB_URI` and `JWT_SECRET` in `.env.local` to
point at the instance it just started — expected, not a bug.

### What Round 1 image judging needs

Game 1 is scored by one vision model over HTTP. No Docker, no companion
service. Set in `.env.local`:

```
OPENROUTER_API_KEY="..."          # or GROQ_API_KEY
IMAGE_JUDGE_MODEL="model-id,fallback-id"
```

Model ids change and an invalid one fails every request, so there is no
default. Discover ids your key can actually use:

```bash
npx tsx --env-file=.env.local scripts/find-vision-model.ts
```

The similarity→marks ladder is `IMAGE_SCORE_BANDS`, tunable without code
changes. `ai-image-eval-platform/` holds a self-contained FastAPI + SigLIP
alternative, preserved but **not wired into the web app**.

### Verifying a fresh setup

```bash
npx tsx scripts/verify-comeback.ts                          # Round 3 meter/powers, no server needed
npx tsx --env-file=.env.local scripts/test-round3-e2e.ts    # needs npm run dev
npx tsx --env-file=.env.local scripts/test-vision-live.ts   # one real vision API call
```

`scripts/test-game1-flow.ts` additionally needs the counting stand-in
(`npx tsx scripts/mock-vision-api.ts`) and `VISION_API_URL` pointed at it —
never leave that set during a real event.

## Local development

```bash
npm install
cp .env.example .env.local     # fill in MONGODB_URI and JWT_SECRET
npx tsx scripts/seed.ts        # indexes, 2 teams + codes, sample challenges
npm run dev
```

Seeding prints the access codes **once** — they're stored hashed, so regenerate
rather than trying to recover one.

Testing subdomains locally: `hunt.localhost:3000` resolves on most systems
without editing `/etc/hosts`. `eventFromHost()` handles the port.

## Status

**The spine is built and compiles. The event UIs are not.**

| Piece | State |
|---|---|
| Host routing, auth, session, code redemption | ✅ |
| Submission pipeline, rate limiting, timestamping | ✅ |
| Hunt / CTF / Quiz graders | ✅ hunt + CTF verified end to end against live Cosmos |
| Score ledger, leaderboard materializer, APIs | ✅ |
| Code grader + judge subsystem | ⛔ **stubbed** — returns `pending`, nothing enqueued |
| Event UIs | ⛔ placeholder pages |
| Leaderboard refresh loop | ⛔ `materializeAll()` exists but nothing calls it on a timer |

### Known gaps worth naming

- **The judge is the biggest missing piece.** `gradeCode` returns `pending` and
  enqueues nothing. It needs Blob Storage for source/results, a Storage Queue,
  KEDA-scaled Container Apps Jobs on an egress-denied VNet, and a callback to
  finalise the verdict.
- **First-blood has a narrow race.** It reads committed submissions rather than
  taking a lock. Fine at this scale; make it a conditional update on a
  `firstBloodTeamId` field if a hard guarantee is needed.
- **Rate limiting is per-team via a DB count**, not a token bucket — one extra
  read per submission. Simple and adequate; revisit if it shows up in profiling.

## Deployment

Push to `main` builds the image in ACR and rolls the Container App
(`.github/workflows/deploy.yml`). Setup steps are in that file's header.

Secrets are injected as Container App secrets at runtime and are **never** baked
into the image — the Dockerfile's build-time env vars are deliberate
placeholders, and CI asserts the build never needs real ones.
