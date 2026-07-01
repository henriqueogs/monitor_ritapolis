# Spec State

## Decisions

| ID | Date | Decision | Rationale |
| --- | --- | --- | --- |
| AD-001 | 2026-06-26 | The first spec-driven milestone is `publicacao-mvp`. | Existing project docs show most data intelligence work is complete; the remaining high-value work is safe publication and operational readiness. |
| AD-002 | 2026-06-26 | Public pages must keep source traceability and honest coverage as product rules, not UI copy only. | The project differentiator is verifiable civic intelligence; hiding source gaps would undermine trust. |
| AD-003 | 2026-06-26 | Admin protection is scoped to HTTP Basic Auth for now. | Existing roadmap explicitly asks for Basic Auth before broad publication and excludes a full user system. |

## Handoff

Current feature: `.specs/features/publicacao-mvp/spec.md`

Status: Draft spec created, awaiting user confirmation and edits before Design/Tasks.

Next step: confirm or adjust the assumptions and open questions in the spec, especially deployment target, admin credentials policy, and publication data freshness expectations.
