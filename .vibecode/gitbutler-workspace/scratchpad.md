# Troubleshooting: ESLint Errors in allora-mcp-server

Branch: gitbutler/workspace | Updated: 2025-11-02T06:13:33+07:00

## Current Focus

Working on: Fixing ESLint errors in allora-mcp-server
Approach: Fix all 19 linting errors (10 errors, 9 warnings)

## Evidence Collected

### Errors Found in `src/index.ts`:
- Line 17, 36, 46, 59, 74: `console.log` warnings (should use console.warn/error)
- Line 54: Promise returned in function argument where void return expected
- Line 54: Async arrow function has no 'await' expression
- Line 58: Unsafe assignment of `any` value
- Line 61: Invalid type "unknown" of template literal expression

### Errors Found in `src/mcp.ts`:
- Line 1: All imports only used as types - should use `import type`
- Line 4: Import order issue - `p-retry` should come before `zod`
- Line 33, 58: Invalid type "unknown" of template literal expression
- Line 33, 43, 58, 68: `console.log` warnings
- Line 76: Async function has no 'await' expression
- Line 120: Unsafe argument of type `any`

## Assumptions

- Console statements should use console.error for errors, console.warn for warnings
- Type assertions needed for unknown types in template literals
- Import order and type imports need to be fixed
- Async functions without await can be made synchronous

## Attempts Log

2025-11-02T06:13:33+07:00 Attempt 1: Analyzing errors and planning fixes
