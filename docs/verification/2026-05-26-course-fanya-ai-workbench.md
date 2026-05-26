# Course Fanya AI Workbench Verification

## Commands

- `npm run typecheck`
- `npm run test`
- `npm run build`
- `npm run test:e2e`

## Manual Checks

- Course card opens `/space/courses/[courseId]/ai-workbench`.
- `AI应用` tab contains `AI出题`, `AI教案`, `AI课件`, and `AI组卷`.
- Four requested AI apps generate and persist artifacts.
- All course sidebar tabs render and update active state.
- Existing `AI 文档建课` and `课程建设` links remain available from the course workspace.

## Known Limits

- UI is structurally close but not pixel-perfect.
- Disabled AI app cards outside the requested four are visible but not implemented.
