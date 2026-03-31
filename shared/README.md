# @memoon-card/shared

Shared TypeScript package: **limits and intervals** used by the Next.js app and re-exported by the backend via `backend/src/constants/validation.constants.ts` and `study.constants.ts`.

## Build

Output is `dist/`. From repo root:

```bash
yarn workspace @memoon-card/shared run build
```

## Rules

- No secrets, no `process.env`, no server-only or side-effectful code in `shared/src`.
- After changing a limit in `validation.constants.ts` or `STUDY_INTERVAL`, check `backend/src/schemas/` and grep the repo for `VALIDATION_LIMITS` / `STUDY_INTERVAL`.
- Archived checklist for this package (section 5): `documentation/private/CODEBASE_AUDIT_GRID.md`.
