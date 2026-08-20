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

## Safety and cleanup

- Never commit secrets, tokens, passwords, customer data, or real credentials. Use `.env` locally.
- Preserve unrelated dirty-worktree changes.
- Do not commit local databases, uploads, build output, browser traces, or temporary screenshots.
