# Warehouse synchronization

This Bun CLI synchronizes warehouse-related source data from MSSQL into MongoDB,
then writes an Excel report from the MongoDB data.

## Structure

- `commands/` contains the sync stages, queries, and report generation.
- `helpers/` contains reusable import, reset, and SQL streaming helpers.
- `libs/` contains database clients and shared migration services.
- `specs/` contains the migration unit and integration tests.
- `utils/` contains CLI argument parsing and logging.
- `run.ts` is the CLI entry point.

## Tests

Keep warehouse sync unit and integration specs in the `specs` directory. Run
them from the repository root with:

```sh
pnpm test:migrations
```

MongoDB integration tests require `WAREHOUSE_SYNC_TEST_MONGO_URI`; otherwise
they are skipped.

## Run

From the repository root:

```powershell
Copy-Item migrations\.env.example migrations\.env
# Configure migrations\.env before running.
bun --no-env-file run migrations\run.ts
```

The script requires `migrations/.env` and reads configuration from that file
only, not the project's root `.env` or inherited environment variables. Fill in
the MSSQL and MongoDB settings, `APP_TENANCY`, and the two device serials. CLI
options override file values. Use `--no-env-file` so Bun itself does not load
other `.env` files before the script starts. Use `--help` without connecting:

```sh
bun --no-env-file run migrations/run.ts --help
```

## Options and defaults

| Option                          | Default / behavior                                                                       |
| ------------------------------- | ---------------------------------------------------------------------------------------- |
| `--db-host <host>`              | `DB_HOST` environment variable                                                           |
| `--mongo-db-name <name>`        | `MONGO_DB_NAME` environment variable                                                     |
| `--factory-code <code>`         | `APP_TENANCY` environment variable                                                       |
| `--device-sn-101 <serial>`      | `DEVICE_SN_101` from `migrations/.env`                                                   |
| `--device-sn-103 <serial>`      | `DEVICE_SN_103` from `migrations/.env`                                                   |
| `--include-backups`             | Include daily backup scans; off unless specified                                         |
| `--concurrency <n>`             | EPC workers; default 4                                                                   |
| `--batch-size <1000-5000>`      | EPC write batch size; default 1,000                                                     |
| `--chunk-size <rows>`           | EPC worker chunk size; default 10,000, at least the batch size                          |
| `--write-mode <upsert\|insert>` | EPC write mode; default `upsert`                                                        |
| `--no-cutoff`                   | Disable the scan cutoff for purchase orders, manufacturing orders, and daily PO progress |
| `--creator-username <username>` | `quanghiep`                                                                              |
| `--output-filename <file>`      | `.tmp/warehouse-sync-<timestamp>.xlsx`                                                   |
| `--log-filename <file>`         | `logs/data-migration.log`                                                                |
| `--step <collection>`           | Run only the step for the named collection                                               |
| `--from-step <collection>`      | Run from the named collection's step through the report                                  |
| `--help`                        | Print usage and exit without connecting to databases                                     |

`--step` and `--from-step` cannot be combined. Without either option, all
steps run in this order:

1. `users`
2. `warehouses` (also synchronizes `storage_locations`; either name selects this step)
3. `departments`
4. `product_specifications`
5. `purchase_orders`
6. `manufacturing_orders`
7. `daily_po_shipping_progress`
8. `rfid_devices`
9. `finished_goods_epcs_match`
10.   `finished_goods_epcs`
11.   `mo_inventory_audit`
12.   `daily_mo_inventory_ledger`
13.   `truckload_delivery`
14.   `defective_goods`
15.   `excel_report` (writes the Excel report; not a MongoDB collection)

For example, append `--step storage_locations` to run only the warehouse and
storage location step, or `--from-step mo_inventory_audit` to resume from the
inventory audit through the report. Required options still apply. Skipped
steps are not run automatically: ensure their prerequisite data already
exists in MongoDB. Resuming calculates a new cutoff from the current day.

`DB_HOST`, `MONGO_DB_NAME`, and `APP_TENANCY` must be set unless their
corresponding command-line options are supplied. Command-line values override
those environment variables. The default output timestamp is generated from
the current UTC time. Ensure the `.tmp` directory exists when using the default
workbook and log paths.

Purchase orders, manufacturing orders, and daily PO progress use the same
exclusive cutoff: midnight in Vietnam on the day the sync starts. Scans from
that time onward are excluded from these stages.
Pass `--no-cutoff` to include scans from all dates, including future-dated scans,
in these three stages. Other filters still apply, and separately selected steps
must be rerun to update their data. Without a shared cutoff, changes to source
data between stages can lead to different results across stages.
Daily PO progress skips outbound scans whose PO is null or blank and reports
the number skipped; other invalid scan fields still fail the stage.
New daily PO and MO transaction IDs use the application's shared MongoDB
sequence collection: stock-out IDs start with `XF` and stock-in IDs with `SI`,
followed by the source date and a per-type, per-day increasing sequence.
Existing matching transaction IDs are retained on reruns, including older ID
formats. The daily MO ledger sync replaces transaction references with ObjectIds.
Deleting
ledger data does not reset the shared sequences, and failed writes may leave
gaps in the sequence.
Manufacturing orders and the daily MO inventory ledger include only rows whose
first two MO characters are numeric and at least `14`; no prefix option is
needed. If no manufacturing orders match the threshold, factory and source
filters, the manufacturing-order stage reports a warning.
Purchase-order synchronization reads the current UGG PO list from
`dvview_invoub` before writing orders. UGG orders absent from the list and all
non-UGG orders are marked fully shipped by setting each size's
`shipped_out_qty` to its `order_qty`. UGG orders present in the list retain
the RFID-based per-size quantities. An empty list marks all synchronized
orders complete; a failed or invalid lookup stops the step before PO writes.
The lookup is not cutoff-filtered and uses SQL Server `NOLOCK`, so it is a
current, potentially uncommitted view rather than a snapshot at the cutoff.
Daily MO inventory transactions resolve `dept_code` against `departments.code`
and `storage` against `storage_locations.storage_num`, storing their ObjectIds.
Missing or unmatched codes use the smallest ObjectId in the respective collection;
an empty reference collection fails the step. Storage codes are matched
case-insensitively, and duplicate codes use the smallest matching ObjectId.
Distinct transactions can resolve to identical references when codes are missing;
their IDs are reused in source order, so removing one may shift the remaining IDs.

For duplicate source usernames (after trimming), the user sync keeps the active
`ts_user` row with the smallest `keyid`. If that row joins multiple employee
records, email and display name are used as deterministic tie-breakers. The
number of skipped source rows is reported in the console. Existing MongoDB
accounts are updated by username; duplicate destination accounts are not deleted.

RFID device names use `Vietnamese`, `English`, and `SimplifiedChinese` from
`dv_rfidreader`. Duplicate device serials after trimming retain the row with
the smallest source `id`; skipped rows are reported in the console. Null or
blank localized names are omitted and do not overwrite existing names; their
number is reported in the console. Other invalid values still fail the stage.

Storage locations are upserted by warehouse and normalized name. If source
rows share that pair, the row with the smallest `storage_num` is used. The sync
creates a unique `(warehouse, name)` index and removes the old unique `name`
index without deleting documents. Other workflows that resolve or mutate
locations by name alone must be updated before using duplicate names safely;
in particular, inventory audit matching and MSSQL location update/delete are
not warehouse-scoped.

Finished-goods EPC scans are fetched without joining the MSSQL RFID match or
warehouse code tables. Raw scans are upserted into
`finished_goods_epcs_staging`, keyed by EPC, before a batch aggregation looks
up `finished_goods_epcs_match` by EPC and merges complete records into
`finished_goods_epcs`. The staging collection is dropped after a successful
sync; a failed sync leaves it in place for diagnosis or retry. A scan without
an EPC match is not merged and is counted in a warning, but its staging record
is removed when the sync succeeds. Rerun the step after synchronizing EPC
matches to merge it.
The aggregation requires MongoDB 4.2 or later for `$merge` and a unique
`finished_goods_epcs.epc` index. The step creates the index if needed; duplicate
destination EPCs must be resolved first. The step acquires a per-database lock
because instances share the staging collection.
The aggregation resolves `storage` against `storage_locations.storage_num`
and `dept_code` against `departments.code`, storing their MongoDB ObjectIds in
`storage_location` and `assembly_line` respectively.
If a source code is missing or unmatched, the lowest-ObjectId document from
the corresponding collection is used and the fallback count is reported. An
empty collection fails the step when an EPC needs a reference. Duplicate
codes are reported and resolve to the lowest ObjectId.
The EPC stage filters scans by the `mo_no` on the scan itself, to orders already present in
`manufacturing_orders` with a numeric two-digit prefix of `14` or higher. It
passes the eligible MO list as JSON and joins it with `OPENJSON` before scan
ranking. This requires SQL Server 2016 or later and database compatibility
level 130 or later. If no eligible MO exists, the MSSQL scan is skipped. On
success, the stage logs `elapsedMs`, `epcs`,
`batches`, `epcsPerSecond`, and cumulative Mongo bulk-write wait
(`mongoBulkWriteMs` measures staging writes only); the latter can overlap with
SQL stream time. `epcs` counts merged records, and `batches` counts staged
batches, including batches with missing matches.

### Standalone EPC sync and benchmark

The EPC-only command does not run the general warehouse runner. It reads
`migrations/.env`, including `DB_HOST`, `MONGO_DB_NAME`, `DB_USERNAME`,
`DB_PASSWORD`, `DB_PORT` (default 1433),
`DB_CONNECTION_TIMEOUT` (milliseconds; default 30000),
`DB_TRUST_SERVER_CERTIFICATE` (default `true`), and `MONGO_URI`. CLI options
can override the host and database name. The SQL database is `DV_DATA_LAKE`;
use a read-only SQL login.

`MONGO_URI` must point to a single `localhost` or `127.0.0.1` MongoDB server.
The script forces a direct connection and rejects remote or multi-host URIs.
For the EPC stage, set `DEVICE_SN_101` and `DEVICE_SN_103` in
`migrations/.env`, or override them with the corresponding CLI options. Do not commit
credentials.

```powershell
bun --no-env-file run migrations/epc-sync.ts --help
bun --no-env-file run migrations/epc-sync.ts
bun --no-env-file run migrations/epc-sync.ts --concurrency 4 --batch-size 1000 --chunk-size 10000
```

By default the command runs the match stage followed by EPC. Use `--stage match`
or `--stage epc` to select one stage. The target database must already contain
the required manufacturing orders, storage locations and departments; the EPC
stage also requires EPC matches. System databases are rejected. The MongoDB
database named by `--mongo-db` will be modified.

The default write mode is `upsert`, which supports a full rerun. Pass
`--write-mode insert` only for an exclusively owned empty target; this checks
emptiness before writing and uses unordered inserts. After an interrupted
initial load, retry with `upsert`. This is not an incremental sync or a durable
resume checkpoint. Do not run simultaneous sync instances for the same target.
The EPC stage rejects another cooperating EPC run using the
`warehouse_sync_locks` document with `_id: "finished_goods_epcs"`. A forced
termination can leave this lock behind: verify that no EPC sync is still
running before manually deleting that specific document. Older implementations
or other writers that ignore the lock must also be stopped.

Each worker processes one chunk in batches. The CLI defaults to four workers,
1,000 rows per batch and 10,000 rows per chunk; chunk size must be at least
batch size, which must be 1,000-5,000. The stream waits for available worker
capacity. EPC duplicates are tracked in staging per run; the match stage uses
a uniquely named `finished_goods_epcs_match_seen_<id>` collection so memory
does not grow with all EPCs. The match tracker is dropped after success and is
left for diagnosis after failure; it needs disk space proportional to the
number of source EPCs. Both stages log rows, elapsed time and errors per chunk;
an unknown failed-row count is logged as `null`, not zero.

The warehouse runner uses these same defaults and tuning options for both EPC
stages. Its `--write-mode insert` likewise requires each selected EPC target
collection to be empty; use the default `upsert` when rerunning a partial load.

To benchmark, use a local MongoDB URI and an existing local reference database:

```powershell
bun --no-env-file run migrations/benchmark-epc-sync.ts --source-mongo-db data_warehouse --mongo-db epc_sync_benchmark_anchor --stage match --batch-size 1000 --chunk-size 1000 --write-mode insert
bun --no-env-file run migrations/benchmark-epc-sync.ts --source-mongo-db data_warehouse --mongo-db epc_sync_benchmark_anchor --stage epc --batch-size 1000 --chunk-size 1000 --write-mode insert --include-backups
```

The benchmark picks up to eight eligible MOs from the local reference database,
uses at most eight chunks of source rows, and runs concurrency 1, 2, 4 and 8
against separate temporary local databases. Each database is dropped after its
run; the reference database is read only. The EPC benchmark copies matching
references into each temporary database before timing. Timings cover SQL
streaming and Mongo writes, but exclude reference preparation. It compares
output fingerprints, reports peak sampled process RSS, and declines to estimate
20 million rows if the sample is incomplete or changes between runs. A plateau
means a throughput improvement below 10% over the preceding concurrency.
Small-sample estimates are provisional and exclude reference preparation,
production topology, retries, and subsequent workflow stages.

Purchase orders insert a `null` shipping method or destination when the source
has no value; a null source value does not overwrite an existing value.
Non-null shipping methods must be `AIR` or `OCEAN`.
When source rows share a PO, one row is selected before joining order sizes:
the row with the most non-null shipping fields wins. Ties are resolved
deterministically using shipping fields, order quantity, brand, styles, and
color. This avoids multiplying packing and order quantities by duplicate
source rows. If multiple output rows still normalize to the same PO, they are
upserted in stream order: the last row replaces packing, progress and other
non-null data, while null shipping fields do not overwrite existing values.
The SQL query does not guarantee output order, so which packing wins for such
duplicates may vary between runs.

Department names are generated from the `factory.departments` translations
after removing Chinese characters from the source name. A source name with no
remaining characters is rejected.

For defective goods, assembly and sewing lines match department `name.cn`
without filtering by group. An exact match takes precedence; otherwise, the
longest department name contained in the SQL line name is used. A name ending
in a digit cannot match the prefix of a longer number. If multiple names match,
or departments share the same name, a warning is emitted; ties use the lowest
ObjectId. Null or blank source lines do not overwrite existing references;
unmatched nonblank names fail the step.

The defective-goods import reads SQL Server `keyid` without selecting
`sync_id`, and stores it in MongoDB as `source_keyid` with a unique partial
index. New records get new MongoDB ObjectIds; repeat runs reuse those IDs.
Existing MongoDB documents without `source_keyid` cannot be matched
automatically, and may cause duplicate EPC errors. The import does not write
to SQL Server or populate `sync_id`. Before using CDC or Mongo-to-SQL sync,
populate SQL `sync_id` from the corresponding MongoDB `_id`; otherwise CDC
skips those rows and the reverse sync may insert duplicates.

Defective-goods descriptions are decoded from legacy gzip/base64 or plain HTML,
sanitized, and embedded PNG, JPEG, WebP and GIF images are uploaded to the
`images` GridFS bucket. `created_by` and `updated_by` resolve their respective
SQL usernames against MongoDB users; absent or unmatched users become null,
with a warning for unmatched usernames. When the creator is missing, embedded
images use the user specified by `--creator-username` as their owner; the step
fails if that fallback user is also missing. Images are limited to 5 MB each.
Invalid images stop the step. File references and the
document are updated in a MongoDB transaction, requiring a replica set.
Unchanged source descriptions reuse existing images and preserve later edits;
unattached uploads from interrupted runs are handled by the file cleanup job.

After defective goods are imported successfully, the step rebuilds inbound
and outbound daily reports in `defective_goods_daily_report` for every UTC
date present in the synchronized data, using the same grouping and filters as
the application reports, including soft-deleted goods. Each date and type is
replaced in a MongoDB transaction, including clearing a report if its dated
goods no longer qualify; other dates are left unchanged. If a date disappears
entirely from the synchronized data, its existing report is not removed.
The step keeps a temporary snapshot to protect historical reports from the
defective-goods outbound TTL during the import, and drops it when the step
finishes or fails. An abrupt process termination can leave a
`defective_goods_report_staging_<id>` collection that must be removed after
confirming its owning sync is no longer running. Do not run overlapping
defective-goods syncs or the daily report task concurrently with this step:
they can replace or insert reports for the same dates.

Truckload delivery signatures are uploaded to the `dispatch_order_signatures`
GridFS bucket before the delivery is written. Empty signatures become null;
unchanged signatures uploaded by the scripts are reused on subsequent runs.
Invalid base64 or an upload failure stops the step. Older GridFS files are not
automatically deleted.

## Output workbook

The report does not require a reference workbook. It writes these worksheets:

- `manufacturing_orders` — manufacturing-order and size quantities, including
  missing quantities.
- `purchase_orders` — purchase-order and size quantities, including missing
  quantities.

The report is written to the output path only after it has been built
successfully. The workflow logs each stage to the configured log file. If a
stage fails and another stage remains, an interactive terminal prompts `y/n`:
`y` skips the failed stage and continues, while `n` stops. Without an
interactive terminal the workflow stops on failure. Continuing may cause
later stages to fail or use incomplete data; the command exits with a nonzero
status even if the remaining stages succeed.

## Database safety

MSSQL is a read-only source: this workflow issues read queries only and does
not write to MSSQL or call stored procedures. MongoDB is the synchronization
destination and is written by the sync stages; the report stage also reads
MongoDB collections. Review the destination database and configuration before
running the workflow. Do not use `--help` as a substitute for configuring a
safe MongoDB destination for a full run.
