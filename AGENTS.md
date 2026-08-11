# Chaoxing Course Platform

## Project goal

Maintain a teacher- and student-facing course workspace with clear, consistent interactions. User experience takes priority over incidental refactors; keep changes scoped to the requested flow.

## Structure

- `src/app/`: Next.js routes and server-rendered pages.
- `src/components/`: shared UI, shell, course workspace, notes, and drive clients.
- `src/lib/`: authentication, permissions, data access, and domain helpers.
- `tests/`: Vitest unit and regression coverage.
- `scripts/`: local maintenance and verification entry points.
- `templates/`: reusable verification evidence templates.
- `prisma/`: schema, migrations, and seed data.

## Run and verify

- Install: `npm install`
- Develop: `npm run dev`
- Typecheck: `npm run typecheck`
- Unit tests: `npm test`
- Production build: `npm run build`
- Risk plan: `pwsh -NoProfile -File scripts/verify-change.ps1 -PlanOnly`
- Full verification: `pwsh -NoProfile -File scripts/verify-change.ps1`
- Receipt check: `pwsh -NoProfile -File scripts/verify-change.ps1 -CheckReceipt`

## Verification contract

- `verification-policy.json` is the risk-routing authority; `scripts/verify-change.ps1` is the deterministic execution authority.
- Change scope is merge-base against `changeScope.baseRef` (uncommitted + committed + deleted + renamed + untracked files all count).
- UI changes require Kimi WebBridge evidence in `artifacts/verification/kimi-browser-qa.md` plus `.verification/evidence.json` using the current `changeSetHash`.
- Queue, retry, worker, and idempotency changes require integration evidence; they do not automatically require browser evidence.
- Completion requires `.verification/receipt.json` with `schemaVersion: 2`, `status: pass`, and a `changeSetHash` matching the current change set (policy hash, runner hash, and evidence artifact hashes are bound to the receipt).
- Do not hand-edit `.verification/receipt.json` or weaken a lane to make a failure pass. Fix the root cause or document the missing capability.
- Risk can only escalate: `-RiskFloor` may raise the computed risk, never lower it.
- `agent-review` runs only when the plan requires it. Reviewers must be fresh-context and read-only; high/critical findings must be resolved before pass.
- Browser acceptance uses Kimi WebBridge. When WebBridge is unavailable, record the lane as blocked and keep verification failed.
- Hook mode is intentionally disabled. Do not add `.codex/hooks.json` or `.codex/hooks/` unless the user explicitly enables it after the manual workflow has proven stable.

## Safety and cleanup

- Never commit secrets, tokens, passwords, customer data, or real credentials. Use `.env` locally.
- Preserve unrelated dirty-worktree changes.
- Verification runtime files belong in `.verification/` and `artifacts/verification/`; both are ignored and may be removed after the result is handed off.
- Do not commit local databases, uploads, build output, browser traces, or temporary screenshots.
