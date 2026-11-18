# Defective Goods Department Matching

## Intent

Allow a valid department reference such as `針車6_B02` to match a source line
such as `針車6組_B02`, while letting genuinely unresolved non-empty names
continue through migration as `null` instead of aborting the step.

## Approaches

- **Targeted regex (selected):** permit `組` optionally after a numeric
  department segment before its suffix. Keep current longest-match behavior.
  Warn and use `null` if a non-empty source name still has no match.
- **General normalization:** remove `組` from both names before matching. This
  covers more variants but could collapse distinct department names.

## Scope and constraints

Only the defective-goods department resolver and its focused tests change.
Null or blank source fields continue to be omitted from updates, preserving
existing values; unmatched non-empty fields are explicitly set to `null`.
No schema, unrelated migration behavior, or existing worktree changes are
included.
