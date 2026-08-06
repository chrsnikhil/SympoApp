# Backend API Contract

Base URL: `http://localhost:8000/api/v1` (set `CORS_ORIGINS` in `.env` to your
frontend's origin). Interactive Swagger docs at `http://localhost:8000/docs`.

Auth: JWT bearer token in `Authorization: Bearer <access_token>`, obtained from
`/auth/login` or `/auth/register`.

| Method | Path | Auth | Body | Returns |
|---|---|---|---|---|
| POST | `/auth/register` | none | `{email, password, display_name}` | `TokenResponse` (role always `participant`) |
| POST | `/auth/login` | none | `{email, password}` | `TokenResponse` |
| POST | `/challenge` | admin | `{title, description?, starts_at?, ends_at?}` | `ChallengeRead` |
| GET | `/challenge` | none | — | `ChallengeRead[]` |
| GET | `/challenge/{id}` | none | — | `ChallengeRead` |
| POST | `/challenge/{id}/reference` | admin | multipart `file` | `ReferenceImageRead` (has `watermarked_url` — this is the ONLY image participants should ever be shown) |
| POST | `/submission` | participant | multipart `challenge_id` + `file` | `202` `SubmissionCreateResponse` (`status: pending`) — evaluation runs in the background |
| GET | `/submission/{id}` | owner or admin/judge | — | `SubmissionResult` — poll this until `status` is `scored`, `rejected_watermark`, or `failed` |
| GET | `/leaderboard/{challenge_id}` | none | — | `LeaderboardResponse` — ranked list, refresh by polling |
| GET | `/health` | none | — | `HealthResponse` |
| GET | `/metrics` | none | — | model/device info |

## Typical participant flow

1. `GET /challenge/{id}` → render title/description, use `has_reference_image`
   to know whether to show the reference.
2. Render the reference from `ReferenceImageRead.watermarked_url` (returned
   only from the admin upload response today — if you need it on the
   challenge page too, add a `GET /challenge/{id}/reference` passthrough, or
   fetch it once via the admin endpoint and cache the URL client-side).
3. Upload: `POST /submission` (multipart) → get back `id` with `status: pending`.
4. Poll `GET /submission/{id}` every ~1.5s until status leaves `pending`/`processing`.
5. On `scored`, show `similarity` and `final_score`. On `rejected_watermark`,
   show `watermark_confidence` and a "this looks like a copy of the
   reference" message. On `failed`, show `error_message`.
6. `GET /leaderboard/{challenge_id}` to render/refresh the board.

## Example fetch calls

```ts
// login
const res = await fetch(`${API_BASE}/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password }),
});
const { access_token, user } = await res.json();

// submit an entry
const form = new FormData();
form.append("challenge_id", challengeId);
form.append("file", file);
const submitRes = await fetch(`${API_BASE}/submission`, {
  method: "POST",
  headers: { Authorization: `Bearer ${access_token}` },
  body: form,
});
const { id } = await submitRes.json();

// poll for result
const poll = async (id: string) => {
  const r = await fetch(`${API_BASE}/submission/${id}`, {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  return r.json();
};
```

## Error shape

Every handled error returns:
```json
{ "detail": "human-readable message", "error_code": "invalid_image" }
```
`error_code` values: `invalid_token`, `authentication_failed`, `permission_denied`,
`not_found`, `conflict`, `invalid_image`, `model_inference_failed`, `storage_failed`.
