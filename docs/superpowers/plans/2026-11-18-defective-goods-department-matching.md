# Defective Goods Department Matching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Match department names such as `針車6_B02` to source values such as `針車6組_B02`, and store `null` for unresolved non-empty names.

**Architecture:** Keep `createDepartmentResolver` and its longest-match behavior. Build the pattern with an optional `組` after numeric segments before `_`; distinguish missing source values (omit the field) from unresolved non-empty names (warn and return `null`).

**Tech Stack:** TypeScript, Jest, pnpm.

**Spec:** [2026-11-18-defective-goods-department-matching-design.md](../specs/2026-11-18-defective-goods-department-matching-design.md)

## Global Constraints

- Only the defective-goods department resolver and focused tests change.
- Null or blank source fields continue to be omitted from updates, preserving existing values; unmatched non-empty fields are explicitly set to `null`.
- No schema, unrelated migration behavior, or existing worktree changes are included.

## Review Focus

- Numeric-prefix collision (`針車1` vs `針車10組`) must remain unmatched; retain the existing regression test.
- Unknown non-empty name must warn and persist `null`; add/update a focused regression test.
- Source `null` must still preserve an existing department value and omit it on insert; retain the existing regression test.
- Regex metacharacters in department names must remain literal; retain the existing regression test.
- Multiple candidate matches must continue choosing the longest name; retain the existing regression test.

---

### Task 1: Fix defective-goods department matching

**Files:**

- Modify: `migrations/commands/defective-goods.ts` (`createDepartmentResolver` and department fields in `$set`)
- Test: `migrations/specs/defective-goods.spec.ts`

**Interfaces:**

- Consumes: `createDepartmentResolver(ids: Map<string, Types.ObjectId>)` and the existing in-memory migration fixtures.
- Produces: a resolver that returns `Types.ObjectId | null | undefined`; `undefined` means no source value, while `null` means a non-empty source value did not match.

- [ ] **Step 1: Add failing regression tests**

Add a test where department `針車6_B02` resolves source `針車6組_B02` to its ObjectId. Update the unmatched-name test to assert that a non-empty unknown value warns and is stored as `null`. Keep the existing source-null preservation test unchanged.

- [ ] **Step 2: Run the focused tests and verify they fail**

Run: `pnpm exec jest --runInBand migrations/specs/defective-goods.spec.ts -t "numbered department|unmatched non-null department"`
Expected: both new tests fail against current behavior.

- [ ] **Step 3: Implement the resolver behavior**

Allow optional `組` between a numeric department segment and `_` in the escaped pattern. For a non-empty unmatched name, warn and return `null`; for a null or blank source, return `undefined`. Include an explicit `!== undefined` check when constructing the department fields in `$set` so unresolved names are written as `null`.

- [ ] **Step 4: Run focused migration tests**

Run: `pnpm exec jest --runInBand migrations/specs/defective-goods.spec.ts -t "department|line"`
Expected: PASS, including matching, longest-match, metacharacter, numeric-prefix, and missing-source cases.

The full defective-goods spec and migration suite currently have unrelated failures in the existing worktree. Record these separately; do not broaden this task to fix them.

- [ ] **Step 5: Review the scoped diff**

Confirm only the resolver and its focused tests changed, and that pre-existing worktree edits remain untouched. Do not commit unrelated or pre-existing changes.
