# HTTP API

Base path `/api`. Authentication: `Authorization: Bearer <access_token>` from
`POST /api/auth/login` (15 min tokens). Request bodies are validated with
unknown fields rejected. Errors are JSON `{ statusCode, message }` with
Azerbaijani messages. Money is integer **qəpik** (1 AZN = 100).

Interactive documentation (Swagger UI / OpenAPI) is served at `/api/docs`
**only when `NODE_ENV` is not `production`**; Caddy also blocks the path.

## Rate limits

| Scope | Limit |
| --- | --- |
| All routes, per client IP | `API_RATE_LIMIT_PER_MINUTE` (default 60; compose 300) |
| `POST /auth/login`, per IP | `AUTH_LOGIN_RATE_LIMIT_PER_MINUTE` (default 10) |
| Public reads (`/public/*`, `/ticket/verify`) | 120 / min / IP |
| Public writes and `POST /public/results/lookup` | 10 / min / IP, `Retry-After: 60` |

## Endpoints

Roles: SA = SUPER_ADMIN, CA = CENTRAL_ADMIN, BM = BRANCH_MANAGER, S = SELLER,
OP = OMR_OPERATOR. "Own branch" scoping is enforced server-side.

| Method & path | Who | Notes |
| --- | --- | --- |
| `POST /auth/login`, `GET /auth/me` | public / any | |
| `GET /health` | public | DB connectivity |
| `GET/POST/PATCH /branches` | read: staff; write: SA, CA | |
| `GET/POST/PATCH /users…` | SA, CA | roles, branches, status, password reset |
| `GET/POST/PATCH /exams…`, `PATCH /exams/:id/publish` | write: SA, CA | price must be set to publish |
| `GET/POST/PATCH /exam-sessions…` | write: SA, CA | lifecycle PLANNED→OPEN→CLOSED/CANCELLED |
| `GET/PATCH /candidates…` | SA, CA, BM | |
| `POST /candidates` | SA, CA, BM, S | seller: own branch only |
| `…/registrations` | SA, CA, BM | |
| `POST /ticket` | SA, CA, BM, S | server sets price; capacity and one live ticket per candidate+session are DB-enforced; 409 when the day is closed |
| `GET /ticket`, `/ticket/:id`, `/ticket/code/:code`, `/ticket/stats` | staff | own sales branches only |
| `PUT /ticket/:id/payment` | SA, CA, BM, S | cash confirmation |
| `PUT /ticket/:id/cancel` | seller who sold it, SA, CA | |
| `POST /ticket/scan` `{qr}` | SA, CA, BM, S | signed QR or verification URL; 201 admitted, 400 forged/unpaid, 409 already used |
| `PUT /ticket/:id/use` | staff | admission by id |
| `GET /ticket/verify/:signedQr` | public | masked holder data; unsigned/forged → 404 |
| `GET /day-closures`, `GET /day-closures/preview?branchId&date` | SA, CA, BM, S | Asia/Baku business date |
| `POST /day-closures` `{branchId, date?}` | SA, CA, BM (own branch) | 409 if already closed; future dates rejected |
| `GET /question…`, `POST/PATCH/DELETE /question…` | SA, CA | |
| `POST /omr/keys`, `GET /omr/keys?examId` | create: SA, CA | immutable versions |
| `POST /omr/sheets`, `GET /omr/sheets/:id/pdf` | SA, CA, BM, OP | paid ticket with candidate |
| `POST /omr/exams/:examId/uploads` (multipart `files`) | SA, CA, BM, OP | 409 while results are published |
| `GET /omr/uploads/:id`, `/original`, `GET /omr/exams/:examId/uploads` | uploader or SA, CA | |
| `PATCH /omr/uploads/:uploadId/pages/:pageId/review` | uploader or SA, CA | `{note, changes[]}` |
| `GET /omr/exams/:examId/results.{csv,pdf,xlsx}` | SA, CA, BM, OP | staff export |
| `GET /results/exams` | SA, CA, OP | readiness per exam |
| `POST /results/exams/:examId/publish` / `unpublish` | SA, CA | publish needs empty review queue |
| `POST /public/results/lookup` `{ticket, candidateNumber}` | public | published only; identical 404 for every failure |
| `GET /public/exams`, `POST /public/orders`, `GET /public/orders/:token` | public | online order with idempotency key |

## Ticket QR format

`<token>.<signature>` — `token` is 32 random bytes (base64url, stored on the
ticket), `signature` is HMAC-SHA256(`QR_SIGNING_SECRET`, `"ticket:" + token`)
in base64url. The server rejects any payload whose signature does not verify
before touching the database.
