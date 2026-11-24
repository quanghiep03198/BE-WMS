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

Inbound/outbound workflows and report/export endpoints use CQRS handlers.

## Data synchronization

- `sync_id` links the MSSQL row to the MongoDB `_id` and has a nullable-column migration.
- CDC provisions every `dv_defective_goods` column and synchronizes inserts/updates using `sync_id` as the MongoDB ObjectId.
- CDC deletes and MSSQL rows marked `ri_cancel = 1` or `isactive = 'N'` soft-delete their MongoDB document.
- MongoDB `deleted_at` has a seven-day TTL index.
- MongoDB `created_by` and `updated_by` receive the request user's `_id`; MSSQL audit usernames are copied from the corresponding `user_code_*` values.

## Daily stock reports

- Stock-in and stock-out events update daily reports in the same MongoDB transaction as the stock change. MongoDB must support transactions (replica set or sharded cluster).
- Stock commands use an application unit-of-work port; the MongoDB adapter owns sessions, transaction retries, and cleanup.
- Stock-in accepts only items with no inbound date and no storage location; repeated or concurrent attempts cannot count an item twice.
- Daily report reads resolve department references for report consumers and Excel exports.
- Report dates use UTC throughout migration, event processing, reads and Excel exports; `date:eq` identifies a UTC date. `B_TO_C` does not count as stock out.
- Daily reports are read from `defective_goods_daily_report`. When an affected day contains reports from the scheduled task, its reports are archived in `defective_goods_daily_report_archive` and rebuilt from the source records in the same transaction. Older, unaffected reports are not rebuilt.
- Rebuilding uses the current source records and cannot recreate records already deleted or changed since the old snapshot. If the source no longer covers a saved group's quantities, the transaction fails and leaves the old report intact; review the archive when reconciling historical data.
- Run the local MongoDB integration tests with `$env:DEFECTIVE_GOODS_MONGO_TEST='1'; pnpm test --runInBand --runTestsByPath src\modules\defective-goods\infrastructure\persistence\mongodb\repositories\defective-goods-report.integration.spec.ts`. The tests create and remove a uniquely named local test database.
