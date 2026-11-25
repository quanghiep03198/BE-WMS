# Warehouse storage-location count

## Intent

Show the number of active storage locations for each warehouse in the warehouse list. A storage location is active when `deleted` is `false`, and its `warehouse` ObjectId references the warehouse `_id`.

## Goals and non-goals

- Add a `total_storage_location` Mongoose virtual count on `Warehouse`.
- Populate the count for the warehouse-list query only.
- Do not change the existing `storage_locations` virtual or the warehouse detail response.
- Do not change pagination, filtering, or storage-location deletion behavior.

## Constraints

Use the existing Mongoose schema and repository patterns. The virtual must match `deleted: false` and join `Warehouse._id` to `StorageLocation.warehouse`.

## Approaches

- **Targeted population (selected):** Define a Mongoose virtual with `count: true`, then populate it only in the warehouse-list query. This keeps the extra count work scoped to the response that needs it.
- **Autopopulate:** Configure the virtual for automatic population on every warehouse query. This is simpler at call sites but performs extra work for queries that do not need the count.

## Implementation details

Expose the optional `total_storage_location` number on the warehouse document/list result type. Keep the existing storage-location array virtual and detail population unchanged.

## Builder discretion

Follow the repository's existing method signatures and response typing when wiring the warehouse-list query; no API shape beyond the added count field is intended to change.
