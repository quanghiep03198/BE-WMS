# Khmer localization design

## Intent

Add Khmer translations to the backend's existing i18n resources, using the
standard locale code `km` already represented by the empty `src/i18n/km`
directory. Sort translation keys alphabetically at every nesting level across
all locale JSON files so the resources remain easy to compare and maintain.

## Goals and constraints

- Add Khmer JSON resources for all existing namespaces, covering the union of
  keys currently present across the existing locales.
- Include Khmer in the department localized-name shape and let the existing
  department synchronization task produce Khmer department labels.
- Preserve interpolation placeholders, machine codes, and translation meaning.
- Alphabetize keys recursively in `vi`, `en`, `cn`, and `km`.
- Keep the locale enum and resource folder on the same `km` code.
- Do not change language negotiation, fallback behavior, or unrelated code.

## Approaches

- **Sort only Khmer resources:** minimizes edits but leaves the requested
  alphabetical organization inconsistent across locales.
- **Sort every locale recursively (chosen):** keeps all translation resources
  consistently organized; it changes ordering only, not key/value semantics.
- **Use `kh` as the locale code:** preserves the current enum value but conflicts
  with the existing `km` resource directory and standard Khmer locale code.

## Implementation calls

Use the existing translations and translation context as the basis for Khmer
values, including keys missing from English but present in another locale.
Preserve all keys and placeholders, and update the enum to `km` so locale
selection matches the resource folder. The existing department synchronization
already builds localized names for every enum value; extend its type and schema
to include Khmer rather than add a new runtime mechanism.

## Non-goals

No changes to language negotiation, fallback behavior, translation keys used
by application code, or adding missing keys to non-Khmer locales.
