# Khmer Localization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add complete Khmer (`km`) translations and alphabetize the keys in every locale JSON resource.

**Architecture:** Keep the existing `nestjs-i18n` resource layout. Add one Khmer JSON file for each existing namespace, using the union of keys in `vi`, `en`, and `cn`; set `Languages.KHMER` to `km`. Extend the existing department localized-name model and synchronization accumulator for Khmer. Recursively sort JSON object keys in all four locales without changing existing values.

**Tech Stack:** TypeScript, JSON, `nestjs-i18n`, pnpm.

**Spec:** `docs/superpowers/specs/2026-11-23-khmer-localization-design.md`

## Global Constraints

- Add Khmer JSON resources for all existing namespaces, covering the union of keys currently present across the existing locales.
- Preserve interpolation placeholders, machine codes, and translation meaning.
- Alphabetize keys recursively in `vi`, `en`, `cn`, and `km`.
- Keep the locale enum and resource folder on the same `km` code.
- Keep department name localization compatible with all enum languages and have the existing synchronization task generate Khmer names.
- Do not change language negotiation or fallback behavior; only extend existing department-label generation for Khmer.

## Review Focus

- A Khmer resource is missing a namespace or a key found in another locale: validate all ten resource files and compare their leaf-key sets to the union across `vi`, `en`, and `cn`.
- A translated string drops or changes an interpolation token: compare placeholder sets for corresponding source strings.
- Existing machine codes or language-independent identifiers are altered: review those values and the non-Khmer diffs.
- Sorting changes translation content or key/value associations: compare parsed non-Khmer JSON values to their pre-change versions.
- Key ordering is not alphabetical at a nested level or a JSON file is invalid: recursively assert sort order and parse every locale JSON file.

---

### Task 1: Add Khmer Translation Resources

**Files:**
- Create: `src/i18n/km/auth.json`
- Create: `src/i18n/km/common.json`
- Create: `src/i18n/km/defective-goods.json`
- Create: `src/i18n/km/erp.json`
- Create: `src/i18n/km/factory.json`
- Create: `src/i18n/km/inoutbound.json`
- Create: `src/i18n/km/inventory.json`
- Create: `src/i18n/km/packing.json`
- Create: `src/i18n/km/rfid.json`
- Create: `src/i18n/km/warehouse.json`
- Modify: `src/common/constants/index.ts`
- Modify: `src/modules/department/schemas/department.schema.ts`
- Modify: `src/modules/department/department.task.ts`

**Interfaces:**
- Consumes: Existing `vi`, `en`, and `cn` JSON resources.
- Produces: Ten Khmer JSON resources with every leaf key present in at least one existing locale; `Languages.KHMER` has value `'km'`; department localization includes Khmer.

- [ ] **Step 1: Add Khmer values for the union of existing translation keys**

  Preserve nested key structure and interpolate placeholders exactly. Use the existing locale values as translation context, and retain fixed codes/identifiers as-is.

- [ ] **Step 2: Set the enum locale value**

  Set `KHMER = 'km'` in `src/common/constants/index.ts`, preserving the user's existing enum addition.

- [ ] **Step 3: Extend department locale support**

  Add `km: string` to the localized `Department.name` shape and type the existing `Object.values(Languages)` reducer as `Record<Languages, string>` so it produces the Khmer label without a hard-coded locale union.

- [ ] **Step 4: Validate Khmer resource coverage and placeholders**

  Parse the ten Khmer files and assert each namespace exists, the leaf-key set equals the union across the three existing locales, and corresponding interpolation placeholder sets match.

- [ ] **Step 5: Run the TypeScript check**

  Run: `pnpm typecheck`
  Expected: no `km`-related errors; the already-recorded unrelated baseline errors may remain.

### Task 2: Alphabetize All Locale Resource Keys

**Files:**
- Modify: All JSON files under `src/i18n/vi/`, `src/i18n/en/`, `src/i18n/cn/`, and `src/i18n/km/`
- Modify: `src/generated/i18n.generated.ts` (generated translation-key shape, alphabetized with the resources)

**Interfaces:**
- Consumes: Existing and Khmer JSON resources from Task 1.
- Produces: The same parsed JSON values, with object keys sorted alphabetically at every nesting level.

- [ ] **Step 1: Recursively sort JSON object keys**

  Sort keys in ascending alphabetical order at every nesting level for all four locales; retain array order and string values.

- [ ] **Step 2: Verify parsed values are preserved**

  Compare the parsed pre-change and post-change values for existing locales while ignoring object key order; confirm only ordering changed in those files.

- [ ] **Step 3: Verify JSON validity and recursive ordering**

  Parse every locale JSON file and assert object keys are alphabetically sorted at every nesting level.

- [ ] **Step 4: Run the TypeScript check**

  Run: `pnpm typecheck`
  Expected: no new errors; the already-recorded unrelated baseline errors may remain.
