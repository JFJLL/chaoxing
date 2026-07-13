# AI Coach Adversarial Review

## Findings

No unresolved Critical or High findings remain in the reviewed AI coach flow.

| ID | Severity | Dimension | Finding | Resolution |
|---|---|---|---|---|
| CORR-001 | High | Correctness | Stream cancellation previously aborted only local work, leaving a race in which a late assistant write could still pass the database token check. | Cancellation now conditionally invalidates the exact token before abort; completion conditionally consumes the token before creating the assistant in the same transaction. |
| CORR-002 | High | Correctness | The fixed 50-attempt query made older history unreachable. | Added stable `createdAt`/`id` cursor pagination, a 51-row lookahead, and a UI “加载更多记录” action. |
| CORR-003 | High | Correctness | Database failures after acquiring the model guard could leak the concurrency lease indefinitely. | All post-acquire claim/reload/create paths now clean the database lease, release the model guard, and return a safe retryable error. |
| SEC-001 | High | Security | Student-triggered stale recovery could update other students' stale attempts in the same course. | Non-manager list, page, and detail recovery now include the authenticated `userId`. |

## Scope

- Correctness: idempotent retry, cancel/commit race, stale recovery, transcript/evaluation limits.
- Security: course and attempt ownership, server-owned task/rubric, safe errors, cross-user recovery.
- Performance: bounded list/detail queries, cursor pagination, transcript/message caps.
- Readability: lease lifecycle and terminal states are explicit in route code.
- Testing: focused coach, stream protocol, and model stream suites cover the resolved races and limits.
- Architecture: model guard and database generation token have distinct, consistently released lifecycles.

## Verification

- Focused: 5 files, 56 tests passed.
- Full suite: 436 tests passed; one unrelated queue test failed in the parallel full run and passed in isolated rerun (19/19).
- TypeScript: one unrelated existing/shared-worktree error at `tests/unit/courseAiAppsRoute.test.ts:219`; no coach errors.
- `git diff --check`: passed.

## Residual risk

The request guard is process-local, so a horizontally scaled deployment still needs a shared rate limiter for globally consistent quotas. The database token remains the authoritative write-safety boundary.
