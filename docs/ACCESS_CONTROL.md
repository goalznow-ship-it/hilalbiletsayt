# Access control and session policy

## Roles

| Role | Permissions | Scope |
| --- | --- | --- |
| `SUPER_ADMIN` | All administration, users, exams, sales, OMR and result publication | All branches; the last active super administrator cannot be disabled or lose this role |
| `CENTRAL_ADMIN` | All administration, users, exams, sales, OMR and result publication | All branches |
| `BRANCH_MANAGER` | Candidate and registration management, ticket sales/payments/refunds, admission, reports, day closure, OMR; read staff list | Only branches assigned this role |
| `SELLER` | Create a candidate for a sale, sell tickets, confirm payment, admit candidates, read sales reports/day closure; cancel tickets they sold | Only branches assigned a sales role; cannot list/update candidates, administer users or close the day |
| `OMR_OPERATOR` | Issue/scan answer sheets, inspect answer-key metadata, review own uploads, read result readiness and scoped exports | Only branches assigned OMR access; cannot sell tickets, manage users or publish results |

A role in branch A does not grant that role in branch B. The API uses the
current database assignments on every authenticated request. Inactive branches
confer no branch-specific permissions. Central roles remain global even if their
assignment's home branch becomes inactive.

## User administration

- Only central administrators create or change accounts, roles, branches,
  status or passwords. Branch managers can read staff in their managed branches;
  assignments from other branches are excluded, including from role filters.
- Creation requires at least one existing active branch. Email is trimmed,
  normalized to lowercase and checked case-insensitively for duplicates.
- `PATCH /users/:id/roles` accepts `roleIds` (role names or UUIDs) and an optional
  `branchId`. With a branch, only that branch's roles change. Without one, the
  selected roles deliberately replace roles across all assigned branches.
- The role editor defaults to an individual branch. Bulk assignment is labelled
  explicitly. At least one role is required; deactivate the account to block login.
- Changing only profile fields preserves all assignments. Removing branches
  preserves the remaining branch-role pairs. New branches inherit roles only
  when every existing branch has the same roles; otherwise use the branch role editor.
- Role/branch changes, deactivation and password resets invalidate existing
  sessions. No-op permission updates and name-only changes do not.
- All mutations are audited. A transaction lock protects the last active
  `SUPER_ADMIN` across concurrent role, branch and status changes.

## Candidate and ticket policy

- Candidate list/update and registration management require a central role or
  `BRANCH_MANAGER`. Sellers may create candidates only for their own sales branches.
- Authenticated ticket reads and sales operations are branch scoped. Prices,
  published exams, open sessions, capacity and duplicate sales are checked server-side.
- Public verification accepts a signed opaque QR token and returns masked holder
  information. Published result lookup requires both ticket and candidate number.
- Answer-key contents remain restricted to central administrators; public correct
  answers are available only with a verified lookup after publication.

## Session policy

- Access tokens last 15 minutes and are stored in `sessionStorage`.
- Restored sessions are validated through `/api/auth/me`. Every request checks the
  active account, current roles, branch state and token version.
- Roleless accounts and accounts with only inactive branch roles cannot log in.
- Expiry or HTTP 401 clears the browser session. Automatic refresh is not implemented.
- Navigation follows role permissions; API checks remain authoritative for direct URLs.
