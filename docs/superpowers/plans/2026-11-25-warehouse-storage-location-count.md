# Warehouse storage-location count Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Include `total_storage_location` in each warehouse-list result as the count of active storage locations.

**Architecture:** Define a Mongoose count virtual on `Warehouse` that joins `_id` to `StorageLocation.warehouse` and matches `deleted: false`. Populate that virtual only in the MongoDB warehouse-list repository query, leaving detail behavior unchanged.

**Tech Stack:** TypeScript, NestJS, Mongoose 8, Jest.

**Spec:** `docs/superpowers/specs/2026-11-25-warehouse-storage-location-count-design.md`

## Global Constraints

- The virtual must match `deleted: false`.
- The virtual must join `Warehouse._id` to `StorageLocation.warehouse`.
- Populate the count for the warehouse-list query only.
- Do not change the existing `storage_locations` virtual or the warehouse detail response.
- Do not change pagination, filtering, or storage-location deletion behavior.

## Review Focus

- A warehouse with no active locations should report a count of zero; cover the Mongoose count virtual configuration in the schema test.
- Soft-deleted locations must not contribute; assert the virtual match is exactly `{ deleted: false }`.
- Locations assigned to another warehouse must not contribute; assert the local and foreign fields are `_id` and `warehouse`.
- The list query must request the count for every returned warehouse; assert `findAll` populates `total_storage_location`.
- Detail queries must retain their existing behavior; assert `findOneById` continues populating `storage_locations` without requesting the count.

---

### Task 1: Add active storage-location count to warehouse list

**Files:**

- Modify: `src/modules/warehouse/infrastructure/persistence/mongodb/schemas/warehouse.schema.ts`
- Modify: `src/modules/warehouse/infrastructure/persistence/mongodb/repositories/warehouse.repository.ts`
- Modify: `src/modules/warehouse/domain/interfaces/warehouse.interface.ts`
- Test: `src/modules/warehouse/infrastructure/persistence/mongodb/repositories/specs/warehouse.repository.spec.ts`

**Interfaces:**

- Consumes: Existing `WarehouseSchema`, `WarehouseRepository`, and `IWarehouse`.
- Produces: Optional numeric `total_storage_location` on warehouse result types; a count virtual configured with `count: true`, `localField: '_id'`, `foreignField: 'warehouse'`, and `match: { deleted: false }`; warehouse-list results populate that virtual.

- [x] **Step 1: Write focused failing tests**

In `warehouse.repository.spec.ts`, add tests that:

- inspect the `WarehouseSchema` virtual options and assert `count: true`, `localField: '_id'`, `foreignField: 'warehouse'`, and `match: { deleted: false }`;
- assert `WarehouseRepository.findAll()` populates `total_storage_location` while forwarding its filter, projection, options, and `withDeleted` behavior;
- assert `findOneById()` still populates only the existing `storage_locations` virtual.

- [x] **Step 2: Run the focused tests and verify they fail**

Run: `pnpm exec jest --runInBand --runTestsByPath src/modules/warehouse/infrastructure/persistence/mongodb/repositories/specs/warehouse.repository.spec.ts`
Expected: FAIL because the count virtual and list population are not implemented.

- [x] **Step 3: Implement the virtual, list population, and result typing**

Add the `total_storage_location` count virtual and its optional numeric type to the warehouse document and `IWarehouse` result interface. Override `WarehouseRepository.findAll` using the existing base-repository signature and query semantics, populating `total_storage_location` on list results only.

- [x] **Step 4: Run focused tests and type checking**

Run: `pnpm exec jest --runInBand --runTestsByPath src/modules/warehouse/infrastructure/persistence/mongodb/repositories/specs/warehouse.repository.spec.ts`
Expected: PASS.

Run: `pnpm typecheck`
Expected: PASS with no type errors. Current run is blocked by the unrelated missing `@modules/defective-goods/application/ports/defective-goods-cache.port` import in defective-goods code; no changed warehouse files were reported.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-11-25-warehouse-storage-location-count-design.md docs/superpowers/plans/2026-11-25-warehouse-storage-location-count.md src/modules/warehouse/infrastructure/persistence/mongodb/schemas/warehouse.schema.ts src/modules/warehouse/infrastructure/persistence/mongodb/repositories/warehouse.repository.ts src/modules/warehouse/domain/interfaces/warehouse.interface.ts src/modules/warehouse/infrastructure/persistence/mongodb/repositories/specs/warehouse.repository.spec.ts
git commit -m "feat: add warehouse storage location count"
```
