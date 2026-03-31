/**
 * Public surface of @memoon-card/shared: only constants safe for browser and server.
 *
 * Backend should keep importing via thin re-exports:
 *   backend/src/constants/validation.constants.ts
 *   backend/src/constants/study.constants.ts
 * so call sites do not scatter direct @memoon-card/shared imports outside the constants layer.
 *
 * Invariants: no secrets, no process.env, no Node-only APIs. After changing limits, align Zod in
 * backend/src/schemas and any frontend copy that uses VALIDATION_LIMITS / STUDY_INTERVAL.
 *
 * Checklist (archived): documentation/private/CODEBASE_AUDIT_GRID.md section 5.
 */
export { VALIDATION_LIMITS, STUDY_INTERVAL } from './validation.constants';
