# Defective Goods DDD Refactor

## Commands and queries

| CQRS component | Replaces legacy behavior |
| --- | --- |
| `GetDefectiveGoodsQuery` | `DefectiveGoodsService.paginate` for the main list endpoint; reads MongoDB secondary nodes. |
| `CheckActiveEpcsQuery` | `DefectiveGoodsService.checkActiveEpcsExist`; checks active MongoDB documents. |
| `UpsertDefectiveGoodsCommand` | Main create endpoint for UHF, USB, and manual EPC creation. Persists to MongoDB and emits a sync event. |
| `UpdateDefectiveGoodsCommand` | `DefectiveGoodsService.updateOneById` for the update endpoint. |
| `DeleteDefectiveGoodsCommand` | `DefectiveGoodsService.deleteMany` and delete-by-id endpoint. Uses Mongoose soft delete. |
| `SyncDefectiveGoodsCommand` + Saga | Queues MongoDB changes for MSSQL synchronization through BullMQ. |

Inbound/outbound workflows and report/export endpoints still use their legacy application services. The service classes remain module providers until those workflows are moved into CQRS handlers.

## Data synchronization

- `sync_id` links the MSSQL row to the MongoDB `_id` and has a nullable-column migration.
- CDC provisions every `dv_defective_goods` column and synchronizes inserts/updates using `sync_id` as the MongoDB ObjectId.
- CDC deletes and MSSQL rows marked `ri_cancel = 1` or `isactive = 'N'` soft-delete their MongoDB document.
- MongoDB `deleted_at` has a seven-day TTL index.
- MongoDB `created_by` and `updated_by` receive the request user's `_id`; MSSQL audit usernames are copied from the corresponding `user_code_*` values.
