# Spec State

## Decisions

| ID | Date | Decision | Rationale |
| --- | --- | --- | --- |
| AD-001 | 2026-06-26 | The first spec-driven milestone is `publicacao-mvp`. | Existing project docs show most data intelligence work is complete; the remaining high-value work is safe publication and operational readiness. |
| AD-002 | 2026-06-26 | Public pages must keep source traceability and honest coverage as product rules, not UI copy only. | The project differentiator is verifiable civic intelligence; hiding source gaps would undermine trust. |
| AD-003 | 2026-06-26 | Admin protection is scoped to HTTP Basic Auth for now. | Existing roadmap explicitly asks for Basic Auth before broad publication and excludes a full user system. |

## Handoff

Feature `publicacao-mvp` (`.specs/features/publicacao-mvp/spec.md`) is
**effectively resolved by real deployment**, not by this spec process
formally closing out. As of 2026-09-17:

- Deployment target: Oracle Cloud VM (backend, systemd+Caddy) + Vercel
  (frontend), live since 2026-08-28. Not what AD-001's assumptions
  anticipated in detail, but the outcome (public, monitored, auto-deployed)
  matches the intent.
- Admin credentials policy: evolved past AD-003's Basic Auth to real
  session-based login (`admin_users`/`admin_sessions`, `/login`,
  `src/auth/admin-session.js`). Basic Auth code remains unused in the repo.
- Publication data freshness: covered operationally by the collection/daily/
  AI schedulers (now mutex-coordinated, see `src/coletas/scheduler-lock.js`)
  and fetch-level caching for public pages (`unstable_cache` in
  `frontend/app/lib/api.js`).

No open decision blocks further work here. New feature work should get its
own `.specs/features/<name>/spec.md` rather than reopening this one.
