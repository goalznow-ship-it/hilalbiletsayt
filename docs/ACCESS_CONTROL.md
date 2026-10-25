# Access control and session policy

## Intended roles

- `SUPER_ADMIN` / `CENTRAL_ADMIN`: full platform access.
- `BRANCH_MANAGER`: one or more branch scopes for candidate and ticket operations.
- `SELLER`: sales attribution only; cannot create/list candidates or registrations.

## Ticket endpoints

- `POST /api/ticket`: JWT required; branch scoped; server price authority; published exam/open session/capacity/duplicate checks.
- `GET /api/ticket`: JWT required; branch scoped.
- `GET /api/ticket/code/:code`: JWT required; branch scoped; missing returns 404; returns no candidate email/phone.
- `GET /api/ticket/verify/:token`: public; opaque QR token only; masked candidate name only.
- `GET /api/ticket/:id`: JWT required; branch scoped.

## Candidate policy

- Sellers remain blocked from candidate creation, update, list, and registration operations.
- Candidate management roles: `SUPER_ADMIN`, `CENTRAL_ADMIN`, `BRANCH_MANAGER`.
- No permission was broadened during this work.

## Session policy

- Access token is stored in `sessionStorage`.
- Token expiry is checked.
- Restored session is validated through `/api/auth/me` before becoming authenticated.
- Refresh is not implemented; expired token clears session.
- Ticket detail uses `initializing` state and fetches ticket data through authenticated API.
